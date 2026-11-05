import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const projectRoot = path.resolve(import.meta.dirname, "..");
export const buildRoot = path.join(projectRoot, "dist");
const require = createRequire(import.meta.url);
export async function browserDriver() {
  let module;
  if (process.env.IIDX_PLAYWRIGHT_MODULE) module = await import(pathToFileURL(path.resolve(process.env.IIDX_PLAYWRIGHT_MODULE, "index.mjs")).href);
  else { try { module = await import("playwright"); } catch { throw new Error("Set IIDX_PLAYWRIGHT_MODULE to the installed Playwright package directory."); } }
  return module.chromium.launch({ headless: true, ...(process.env.IIDX_BROWSER_EXECUTABLE ? { executablePath: process.env.IIDX_BROWSER_EXECUTABLE } : {}) });
}
export async function serveBuild(handleRequest) {
  const manifest = JSON.parse(fs.readFileSync(path.join(buildRoot, "manifest.webmanifest")));
  if (manifest.scope !== "/IIDX-2/") throw new Error("Build the Pages variant first (GITHUB_ACTIONS=true).");
  const server = http.createServer((request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      response.setHeader("Cache-Control", "no-store");
      if (handleRequest?.(pathname, response)) return;
      if (!pathname.startsWith("/IIDX-2/")) { response.writeHead(404).end(); return; }
      let relative = decodeURIComponent(pathname.slice("/IIDX-2/".length));
      if (!relative || relative.endsWith("/")) relative += "index.html";
      const file = path.resolve(buildRoot, relative);
      if (!file.startsWith(buildRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
      response.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
      response.end(fs.readFileSync(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: "http://127.0.0.1:" + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
export function readBuildMaster() {
  const read = name => JSON.parse(fs.readFileSync(path.join(buildRoot, "masters/v1", name + ".json"), "utf8"));
  return { manifest: read("manifest"), chartMaster: read("chart-master"), unofficial: read("unofficial"), ereter: read("ereter"), notesRadar: read("notes-radar") };
}
/** Read-only TS loader for pure validation/recommendation functions. No DB is opened. */
export function sourceModules() {
  const ts = require("typescript"), cache = new Map();
  function load(relative) {
    const file = path.resolve(projectRoot, relative);
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} }; cache.set(file, module.exports);
    const resolve = specifier => load(path.resolve(path.dirname(file), specifier + ".ts"));
    new Function("module", "exports", "require", output)(module, module.exports, resolve);
    cache.set(file, module.exports); return module.exports;
  }
  return { load };
}
export async function readIsolatedStores(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("iidx-clear-tracker"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const stores = {};
    for (const name of db.objectStoreNames) stores[name] = await new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = { version: db.version, names: [...db.objectStoreNames], stores }; db.close(); return result;
  });
}
