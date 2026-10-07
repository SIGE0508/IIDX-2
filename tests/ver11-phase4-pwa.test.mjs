import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
const root = path.resolve(import.meta.dirname, "..");
const read = p => readFileSync(path.join(root,p), "utf8");
test("built manifest and all masters are precached at the correct base", () => {
  const manifest = JSON.parse(read("dist/manifest.webmanifest"));
  const base = manifest.scope;
  assert.ok(["/", "/IIDX-2/"].includes(base));
  assert.equal(manifest.id, base); assert.equal(manifest.start_url, base);
  assert.equal(manifest.display, "standalone");
  const sw = read("dist/sw.js");
  for(const file of ["manifest", "chart-master", "unofficial", "ereter", "notes-radar"])
    assert.ok(sw.includes(`masters/v1/${file}.json`));
  assert.ok(sw.includes(`${base}index.html`));
  for(const icon of manifest.icons) {
    assert.ok(icon.src.startsWith(base));
    const png = readFileSync(path.join(root,"dist",icon.src.slice(base.length)));
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);
  }
  assert.ok(!sw.includes("indexedDB"));
});
test("registration checks on launch and online, without takeover or data changes", async () => {
  const calls = [], events = new Map();
  const registration = { update: async () => calls.push("update"), addEventListener: (key,callback) => events.set(key,callback) };
  const source = read("src/pwa/register.ts").replaceAll("import.meta.env.PROD","true").replaceAll("import.meta.env.BASE_URL",'"/IIDX-2/"');
  const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,console,Event,
    navigator:{onLine:true,serviceWorker:{register:async(url,options)=>{calls.push({url,options});return registration;}}},
    window:{addEventListener:(key,callback)=>events.set(key,callback),dispatchEvent:()=>{}}});
  module.exports.registerPwa(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0].url,"/IIDX-2/sw.js"); assert.equal(calls[0].options.scope,"/IIDX-2/");
  assert.equal(calls[0].options.updateViaCache,"none"); assert.equal(calls.filter(x=>x==="update").length,1);
  events.get("online")(); assert.equal(calls.filter(x=>x==="update").length,2);
  assert.ok(!source.includes("reload(")); assert.ok(!source.includes("postMessage("));
});
test("development registration is disabled; workflow remains manual with Node 22 and npm ci",()=>{
  assert.ok(read("src/pwa/register.ts").includes("!import.meta.env.PROD"));
  const workflow=read(".github/workflows/deploy-pages.yml");
  assert.ok(workflow.includes("workflow_dispatch:")); assert.ok(!/^\s+push:/m.test(workflow));
  assert.ok(workflow.includes("node-version: 22")); assert.ok(workflow.includes("run: npm ci"));
  const config=read("vite.config.ts");
  assert.ok(config.includes("skipWaiting: false")); assert.ok(config.includes("clientsClaim: false"));
});
