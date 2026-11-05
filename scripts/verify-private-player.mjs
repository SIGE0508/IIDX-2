/**
 * PRIVATE validation only. Input must be outside all Git worktrees.
 * No data file, screenshot, trace or report is written to the repository.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { browserDriver, serveBuild, readBuildMaster, readIsolatedStores, sourceModules, projectRoot } from "./browser-validation-utils.mjs";

let privateDirectory, browser, hosting, inputBuffer, original, originalHash;
let stage = "input", cleaned = false;
const hash = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative)); };
async function run() {
  if (!process.env.IIDX_PRIVATE_BACKUP) throw new Error("missing input");
  original = fs.realpathSync(path.resolve(process.env.IIDX_PRIVATE_BACKUP));
  if (inside(fs.realpathSync(projectRoot), original)) throw new Error("input inside repository");
  for (let directory = path.dirname(original); ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, ".git"))) throw new Error("input inside a Git worktree");
    if (path.dirname(directory) === directory) break;
  }
  if (!fs.statSync(original).isFile()) throw new Error("not a file");
  originalHash = hash(fs.readFileSync(original));
  privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "iidx-private-validation-"));
  const copy = path.join(privateDirectory, "backup.json"); fs.copyFileSync(original, copy);
  inputBuffer = fs.readFileSync(copy); assert.equal(hash(inputBuffer), originalHash);

  stage = "backup validation";
  const { load } = sourceModules(), backupApi = load("src/import/backup.ts");
  const backup = backupApi.parseBackup(inputBuffer.toString("utf8")), master = readBuildMaster();
  backupApi.validateBackupReferences(backup, new Set(master.chartMaster.charts.map(chart => chart.chartId)));
  // Do not silently select/filter/rewrite a multi-PLAYER backup.
  if (backup.payload.players.length !== 1) throw new Error("expected one Player; confirm intended Player before proceeding");
  const player = backup.payload.players[0], records = backup.payload.playerChartRecords.filter(record => record.playerId === player.playerId);
  const calculation = load("src/training/engine.ts").calculateTrainingWithCandidates({ player, records, master });
  const nextPool = load("src/training/home-candidates.ts").buildHomeCandidatePool(player, calculation);
  const warmPool = load("src/training/warm-up.ts").buildWarmUpPool(calculation, master, new Map(records.map(record => [record.chartId, record])));

  stage = "isolated browser";
  hosting = await serveBuild(); browser = await browserDriver();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: false });
  await context.route("**/*", route => new URL(route.request().url()).origin === hosting.origin ? route.continue() : route.abort());
  await context.addInitScript(() => { Math.random = () => 0.5; });
  const page = await context.newPage(); let pageErrors = 0; page.on("pageerror", () => pageErrors++);
  await page.goto(hosting.origin + "/IIDX-2/"); await page.getByRole("heading", { name: "初回セットアップ" }).waitFor();
  const initial = await readIsolatedStores(page);
  assert.equal(initial.version, 2); assert.equal(initial.names.length, 7);
  for (const name of ["players", "playerChartRecords", "history", "ereterPersonalHistory"]) assert.equal(initial.stores[name].length, 0);

  // DATA is unavailable before setup. Create a disposable, record-free placeholder
  // in this fresh context; the existing DATA restore replaces it completely.
  await page.locator("label").filter({ hasText: /^DP最高段位/ }).locator("select").selectOption("UNOBTAINED");
  await page.getByRole("button", { name: "後で登録", exact: true }).click();
  await page.getByRole("button", { name: "この内容で開始", exact: true }).click();
  await page.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  await page.locator("nav").getByRole("button", { name: "DATA", exact: true }).click();
  page.once("dialog", dialog => dialog.message().startsWith("全ユーザーデータを置換") ? dialog.accept() : dialog.dismiss());
  stage = "restore";
  await page.getByLabel("バックアップ復元", { exact: true }).setInputFiles(copy);
  await page.getByText("復元しました", { exact: true }).waitFor();
  const restored = await readIsolatedStores(page);
  for (const [name, entries] of Object.entries(backup.payload)) if (name in restored.stores) {
    assert.deepEqual(restored.stores[name].map(entry => JSON.stringify(entry)).sort(), entries.map(entry => JSON.stringify(entry)).sort());
  }
  await page.locator("nav").getByRole("button", { name: "HOME", exact: true }).click();
  await page.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  stage = "recommendation conformance";
  const nextCards = await page.locator(".next-training .chart-line").evaluateAll(nodes => nodes.map(node => ({ chartId: node.dataset.chartId, text: node.textContent })));
  const nextIds = nextCards.map(card => card.chartId);
  const warmRows = await page.locator(".warm-up-row").evaluateAll(nodes => nodes.map(node => ({ chartId: node.dataset.chartId, role: node.dataset.role })));
  assert.ok(nextIds.length <= 3); assert.equal(new Set(nextIds).size, nextIds.length);
  assert.ok(nextIds.every(id => nextPool.some(candidate => candidate.chartId === id)));
  assert.ok(nextIds.map(id => nextPool.find(candidate => candidate.chartId === id)).filter(candidate => candidate.goal === "CHALLENGE").length <= 1);
  assert.equal(nextIds.length, Math.min(3, nextPool.filter(item => item.goal !== "CHALLENGE").length + Number(nextPool.some(item => item.goal === "CHALLENGE"))));
  for (const card of nextCards) assert.ok(card.text.includes("目標 " + nextPool.find(item => item.chartId === card.chartId).targetLamp.replaceAll("_", " ")));
  const expectedWarm = load("src/features/dashboard/warm-up-selection.ts").selectWarmUp(warmPool, nextIds, [], () => 0.5);
  assert.equal(warmRows.length, expectedWarm.length);
  assert.ok(warmRows.length <= 3); assert.equal(new Set(warmRows.map(row => row.chartId)).size, warmRows.length);
  assert.equal(new Set(warmRows.map(row => row.role)).size, warmRows.length);
  assert.ok(warmRows.every(row => warmPool.roles[row.role].some(candidate => candidate.chartId === row.chartId)));
  assert.deepEqual(await readIsolatedStores(page), restored); assert.equal(pageErrors, 0);
  const chartInfo = id => { const chart = master.chartMaster.charts.find(chart => chart.chartId === id); return { chartId: id, title: master.chartMaster.songs.find(song => song.songId === chart.songId)?.title ?? id, chartType: chart.chartType, officialLevel: chart.officialLevel, unofficialDifficulty: master.unofficial.records.find(record => record.chartId === id)?.difficulty ?? null }; };
  const summary = {
    inputKind: process.env.IIDX_VALIDATION_KIND === "synthetic" ? "synthetic dry run; NOT real-player evidence" : "user-provided backup; authenticity not inferred from values",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim(),
    masterVersion: master.manifest.masterVersion, backupCreatedAt: backup.backupCreatedAt,
    mode: calculation.training.mode, phase: calculation.training.phase, mainBand: calculation.training.mainBand,
    nextTraining: {
      candidateCount: nextPool.length,
      goals: Object.fromEntries(["EASY", "CLEAR", "HARD", "EXH", "CHALLENGE"].map(goal => [goal, nextPool.filter(item => item.goal === goal).length])),
      displayed: nextIds.map(id => { const item = nextPool.find(item => item.chartId === id); return { ...chartInfo(id), currentLamp: item.currentLamp, goal: item.goal, targetLamp: item.targetLamp, reasons: item.reasons }; }),
    },
    warmUp: {
      candidateCounts: Object.fromEntries(Object.entries(warmPool.roles).map(([role, items]) => [role, items.length])),
      displayed: warmRows.map(row => { const item = warmPool.roles[row.role].find(item => item.chartId === row.chartId); return { ...chartInfo(row.chartId), role: row.role, currentLamp: item.currentLamp, reasons: item.reasons }; }),
    },
    unchangedAfterRead: true, randomSeed: "constant 0.5", personalSuitability: "requires the player's review; not assessed automatically",
  };
  await context.close();
  return summary;
}
let summary;
try { summary = await run(); }
catch { console.error("Validation not completed at stage: " + stage + ". No raw data or Player identifiers are logged. Check the private input and runbook."); process.exitCode = 1; }
finally {
  const shutdown = await Promise.allSettled([browser?.close(), hosting?.close()]);
  if (shutdown.some(outcome => outcome.status === "rejected")) { process.exitCode = 1; summary = undefined; console.error("Browser/server shutdown needs manual confirmation."); }
  inputBuffer?.fill(0);
  if (privateDirectory) {
    const actual = fs.realpathSync(privateDirectory), parent = fs.realpathSync(os.tmpdir());
    if (path.dirname(actual).toLowerCase() !== parent.toLowerCase() || !path.basename(actual).startsWith("iidx-private-validation-")) throw new Error("Refusing unsafe cleanup path");
    fs.rmSync(actual, { recursive: true, force: false }); cleaned = !fs.existsSync(actual);
  }
  if (original && originalHash && hash(fs.readFileSync(original)) !== originalHash) throw new Error("Source input changed externally during validation");
}
if (summary) console.log(JSON.stringify({ ...summary, cleanup: { browserContextDisposed: true, privateCopyRemoved: cleaned, originalUnchanged: true } }, null, 2));
else console.error(JSON.stringify({ validationCompleted: false, stage, privateCopyRemoved: cleaned || !privateDirectory }));
