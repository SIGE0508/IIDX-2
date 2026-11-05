import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { browserDriver, projectRoot } from "./browser-validation-utils.mjs";
let server, browser;
try {
  const { createServer } = await import(pathToFileURL(path.join(projectRoot, "node_modules/vite/dist/node/index.js")).href);
  server = await createServer({ logLevel: "error", base: "/", server: { host: "127.0.0.1", port: 0, open: false } });
  await server.listen();
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await browserDriver();
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  for (const file of ["browser-indexeddb.html", "browser-next-play.html", "browser-phase4-csv.html"]) {
    await page.goto(origin + "/tests/" + file);
    await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.querySelector("#result")?.textContent ?? ""), null, { timeout: 30000 });
    const result = await page.locator("#result").innerText(); assert.ok(result.startsWith("PASS"), result);
    console.log(file + "\n" + result);
  }
  assert.deepEqual(errors, []); await context.close();
} finally { await browser?.close(); await server?.close(); }
