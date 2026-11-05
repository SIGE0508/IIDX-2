import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { browserDriver, serveBuild, buildRoot, readBuildMaster, readIsolatedStores } from "./browser-validation-utils.mjs";

async function waitUntil(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error("PWA lifecycle condition timed out");
}
let version = 0, mode = "ok";
const requests = [];
const sw = fs.readFileSync(path.join(buildRoot, "sw.js"), "utf8");
const hosting = await serveBuild((pathname, response) => {
  if (pathname === "/phase4-observer") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Isolated worker observer</title>"); return true; }
  if (pathname === "/IIDX-2/__phase4_missing__.js") { response.writeHead(404).end(); return true; }
  if (pathname !== "/IIDX-2/sw.js") return false;
  requests.push({mode,version});
  if (mode === "fetch-failure") { response.writeHead(503).end(); return true; }
  const script = mode === "install-failure" ? sw.replace("precacheAndRoute([", 'precacheAndRoute([{url:"__phase4_missing__.js",revision:"phase4-failure"},') : sw;
  response.setHeader("Content-Type", "text/javascript");
  response.end(script + "\nself.addEventListener('message',event=>{if(event.data==='phase4-version')event.ports[0].postMessage(" + version + ");});\n");
  return true;
});
let browser;
try {
  browser = await browserDriver();
  const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 390, height: 844 } });
  const a = await context.newPage(), errors = [];
  a.on("pageerror", error => errors.push(String(error)));
  const url = hosting.origin + "/IIDX-2/";
  await a.goto(url); await a.locator("section").first().waitFor();
  await a.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await a.reload(); await a.waitForFunction(() => !!navigator.serviceWorker.controller);
  const versionOf = page => page.evaluate(() => new Promise((resolve, reject) => {
    const channel = new MessageChannel(), timer = setTimeout(() => reject(Error("worker version timeout")), 5000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    navigator.serviceWorker.controller.postMessage("phase4-version", [channel.port2]);
  }));
  assert.equal(await versionOf(a), 0);
  const chartId = readBuildMaster().chartMaster.charts[0].chartId;
  await a.evaluate(async chartId => {
    const db = await new Promise((resolve, reject) => { const q = indexedDB.open("iidx-clear-tracker"); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    const now = "2026-11-05T00:00:00Z";
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(["players", "playerChartRecords", "history", "appMeta"], "readwrite");
      transaction.objectStore("players").put({ playerId: "phase4-synthetic", playerName: "SYNTHETIC", iidxId: null, highestDpRank: "CHUDEN", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, playList: [{ chartId, memo: "あ".repeat(100) }], createdAt: now, updatedAt: now });
      transaction.objectStore("playerChartRecords").put({ playerId: "phase4-synthetic", chartId, clearLamp: "CLEAR", score: 10, bp: 0, clearSource: "manual", scoreSource: "manual", bpSource: "manual", updatedAt: now });
      transaction.objectStore("history").put({ historyId: "phase4-sentinel", playerId: "phase4-synthetic", date: now, chartId, oldLamp: "FAILED", newLamp: "CLEAR", source: "manual" });
      transaction.objectStore("appMeta").put({ key: "phase4-sentinel", value: "preserved", updatedAt: now });
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    }); db.close();
  }, chartId);
  await a.reload(); await a.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  const snapshot = await readIsolatedStores(a); assert.equal(snapshot.version, 2); assert.equal(snapshot.names.length, 7);
  const b = await context.newPage(); b.on("pageerror", error => errors.push(String(error))); await b.goto(url);
  await b.getByRole("heading", { name: "HOME", exact: true }).waitFor(); assert.equal(await versionOf(b), 0);
  await b.evaluate(async () => { window.__swStates=[]; const r=await navigator.serviceWorker.getRegistration(); r.addEventListener("updatefound",()=>{ const w=r.installing;window.__swStates.push(w.state);w.addEventListener("statechange",()=>window.__swStates.push(w.state)); }); });
  const pass = message => console.log("PASS " + message);
  pass("two tabs controlled by original worker, DB v2/seven stores seeded only with synthetic data");

  await context.setOffline(true); await a.reload(); await a.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  const offline = await a.evaluate(async () => Promise.all(["manifest", "chart-master", "unofficial", "ereter", "notes-radar"].map(async name => { const response = await fetch("masters/v1/" + name + ".json"); if (!response.ok) throw Error(name); return (await response.json()).masterVersion; })));
  assert.deepEqual(offline, Array(5).fill("2026.11.01")); assert.deepEqual(await readIsolatedStores(a), snapshot);
  mode = "fetch-failure";
  await context.setOffline(false);
  await Promise.all([a, b].map(page => page.evaluate(() => navigator.serviceWorker.getRegistration().then(registration => registration.update()).catch(() => null))));
  pass("offline HOME and all five masters load, complete user stores retained");

  mode = "fetch-failure";
  assert.equal(await a.evaluate(() => navigator.serviceWorker.getRegistration().then(registration => registration.update().then(() => false, () => true))), true);
  assert.equal(await versionOf(a), 0); assert.equal(await versionOf(b), 0);
  pass("SW fetch failure keeps original worker and both tabs usable");

  mode = "install-failure"; version = 1;
  const installed = await a.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const final = new Promise(resolve => {
      const timer = setTimeout(() => resolve("timeout"), 15000);
      registration.addEventListener("updatefound", () => { const worker = registration.installing; worker.addEventListener("statechange", () => { if (worker.state === "redundant") { clearTimeout(timer); resolve("redundant"); } }); }, { once: true });
    });
    await registration.update(); return final;
  });
  assert.equal(installed, "redundant"); assert.equal(await versionOf(a), 0); assert.equal(await versionOf(b), 0);
  await context.setOffline(true); await a.reload(); await a.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  assert.equal(await versionOf(a), 0); assert.deepEqual(await readIsolatedStores(a), snapshot);
  await context.setOffline(false); pass("failed precache installation cannot replace old worker; old app still starts offline");

  mode = "ok"; version = 2;
  await waitUntil(async () => {
    await a.evaluate(() => navigator.serviceWorker.getRegistration().then(registration => registration.update()));
    return a.evaluate(async () => {
      const worker = (await navigator.serviceWorker.getRegistration())?.waiting;
      if (worker?.state !== "installed") return false;
      return new Promise(resolve => { const channel=new MessageChannel();const timer=setTimeout(()=>resolve(false),1000);
        channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data===2);};
        worker.postMessage("phase4-version",[channel.port2]); });
    });
  });
  assert.ok(requests.some(request => request.mode === "ok" && request.version === 2));
  assert.equal(await versionOf(a), 0); assert.equal(await versionOf(b), 0); assert.deepEqual(await readIsolatedStores(a), snapshot);
  await a.evaluate(() => { window.__phase4NoReload = true; }); await b.evaluate(() => { window.__phase4NoReload = true; });
  assert.equal(await a.evaluate(() => window.__phase4NoReload), true);
  assert.equal(await b.evaluate(() => window.__phase4NoReload), true);
  pass("successful update waits without forced reload/takeover in either tab");

  await a.close();
  assert.equal(await b.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), true);
  assert.equal(await versionOf(b), 0);
  await b.reload(); await b.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  assert.equal(await versionOf(b), 0);
  assert.equal(await b.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), true);
  pass("closing one tab or reloading the remaining tab does not activate waiting update");

  const observer = await context.newPage();
  await observer.goto(hosting.origin + "/phase4-observer");
  await b.close();
  await waitUntil(() => observer.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration("/IIDX-2/"); return registration?.active?.state === "activated" && !registration.waiting; }));
  const c = await context.newPage(); c.on("pageerror", error => errors.push(String(error))); await c.goto(url);
  await c.getByRole("heading", { name: "HOME", exact: true }).waitFor(); await c.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await versionOf(c), 2); assert.deepEqual(await readIsolatedStores(c), snapshot); assert.deepEqual(errors, []);
  pass("after all controlled tabs close, next launch uses new worker with unchanged records/history/NEXT PLAY");
  await context.close();
  console.log("PWA 7 SCENARIOS PASS");
} finally { await browser?.close(); await hosting.close(); }
