import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: source => load(path.relative(root, path.resolve(path.dirname(filename), `${source}.ts`))), Number, Math, Set, Map, Array, Object, Error, Date, JSON, String, RegExp }, { filename });
  cache.set(filename, module.exports);
  return module.exports;
}


const history = load("src/domain/history.ts");
const operations = load("src/import/operations.ts");
const validation = load("src/storage/validation.ts");
const backup = load("src/import/backup.ts");
const tracker = load("src/import/clear-tracker-csv.ts");
const now = "2026-10-04T00:00:00.000Z";
const before = { playerId: "p", chartId: "c", clearLamp: "EASY_CLEAR", score: 2450, bp: 71, clearSource: "manual", scoreSource: "manual", bpSource: "manual", updatedAt: now };
const after = { ...before, clearLamp: "CLEAR", score: 2512, bp: 58 };
const event = (a,b) => history.createRecordHistory(a,b,"manual",now,()=>"h");
test("one event combines lamp, score and BP and matches every filter", () => {
 const entry=event(before,after);
 assert.equal(entry.scoreUpdate.before,2450); assert.equal(entry.scoreUpdate.after,2512);
 assert.equal(entry.bpUpdate.after,58);
 for(const filter of ["ALL","LAMP","SCORE","BP"]) assert.equal(history.matchesHistoryFilter(entry,filter),true);
 validation.assertHistoryEntry(entry);
 assert.equal(history.numericHistoryLabel("SCORE",entry.scoreUpdate),"SCORE 2450 → 2512 (+62)");
 assert.equal(history.numericHistoryLabel("BP",entry.bpUpdate),"BP 71 → 58 (-13)");
});
test("initial registration retains null before, including valid zero values", () => {
 const entry=event({...before,score:null,bp:null},{...before,score:0,bp:0});
 assert.equal(entry.scoreUpdate.before,null); assert.equal(entry.bpUpdate.before,null);
 assert.equal(history.numericHistoryLabel("SCORE",entry.scoreUpdate),"SCORE 0（初回登録）");
 assert.equal(history.matchesHistoryFilter(entry,"LAMP"),false);
});
test("equal, worsening and missing score/BP are not growth; individual updates remain possible", () => {
 assert.equal(event(before,{...before}),undefined);
 assert.equal(event(before,{...before,score:2400,bp:80,clearLamp:"FAILED"}),undefined);
 assert.equal(event(before,{...before,score:null,bp:null}),undefined);
 assert.equal(history.matchesHistoryFilter(event(before,{...before,score:2500}),"BP"),false);
 assert.equal(history.matchesHistoryFilter(event(before,{...before,bp:50}),"SCORE"),false);
});
test("legacy lamp entry remains unchanged through old and new backup round trips", () => {
 const legacy={historyId:"legacy",playerId:"p",chartId:"c",oldLamp:"EASY_CLEAR",newLamp:"CLEAR",source:"manual",date:now};
 validation.assertHistoryEntry(legacy);
 assert.equal(history.matchesHistoryFilter(legacy,"LAMP"),true);
 assert.equal(history.matchesHistoryFilter(legacy,"SCORE"),false);
 const payload={players:[],playerChartRecords:[],history:[legacy,event(before,after)],ereterPersonalHistory:[],setupDrafts:[],uiSettings:[]};
 const parsed=backup.parseBackup(JSON.stringify({schemaVersion:1,backupCreatedAt:now,payload}));
 assert.deepEqual(JSON.parse(JSON.stringify(parsed.payload.history)),JSON.parse(JSON.stringify(payload.history)));
 assert.throws(()=>validation.assertHistoryEntry({...legacy,scoreUpdate:{before:100,after:90}}),/invalid/);
});
test("CSV preserves worsening current values without producing growth history and reimport is idempotent", async () => {
 let saved; const repository={commit:async value=>{saved=value}};
 const worse={...before,score:2400,bp:80};
 const result=await operations.commitRecordImport(repository,"p",[worse],[before],"official_csv",now,()=>"h");
 assert.equal(result.history,0); assert.equal(saved.playerChartRecords[0].score,2400);
 const combined=await operations.commitRecordImport(repository,"p",[after],[before],"official_csv",now,()=>"h");
 assert.equal(combined.history,1); assert.equal(saved.history[0].bpUpdate.after,58);
 assert.equal((await operations.commitRecordImport(repository,"p",[after],[after],"official_csv",now,()=>"h")).history,0);
 assert.equal((await operations.commitRecordImport(repository,"p",[after],[before],"official_csv",now,()=>"h",true)).history,0);
});
test("QUICK INPUT and tracker preview use the same combined history rule", async () => {
 let saved; const repo={getPlayerChartRecord:async()=>before,commit:async value=>{saved=value}};
 await operations.updateQuickInput(repo,"p",{chartId:"c",notes:2000},"CLEAR",2512,58,now,()=>"h");
 assert.equal(saved.history.length,1); assert.equal(saved.history[0].scoreUpdate.after,2512);
 const preview={errors:[],changes:[{chartId:"c",before,after,lampChanged:true,scoreChanged:true,bpChanged:true}]};
 await operations.commitClearTrackerPreview(repo,preview,"p",now,()=>"h");
 assert.equal(saved.history.length,1);
 assert.equal(tracker.createImportHistory(preview.changes,"p",now,()=>"h").length,1);
});
test("atomic commit failure propagates instead of reporting success", async () => {
 await assert.rejects(()=>operations.commitRecordImport({commit:async()=>{throw Error("abort")}},"p",[after],[before],"official_csv",now,()=>"h"),/abort/);
});

