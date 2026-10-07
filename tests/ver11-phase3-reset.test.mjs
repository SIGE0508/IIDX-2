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


const reset = load("src/domain/record-reset.ts").resetRecordScoreBp;
const operations=load("src/import/operations.ts");
const history=load("src/domain/history.ts");
const backup=load("src/import/backup.ts");
const validation=load("src/storage/validation.ts");
const official=load("src/import/official-csv.ts");
const tracker=load("src/import/clear-tracker-csv.ts");
const now="2026-10-04T00:00:00.000Z";
const record={playerId:"p",chartId:"c",clearLamp:"CLEAR",score:2500,bp:42,clearSource:"manual",scoreSource:"manual",bpSource:"manual",updatedAt:now};
test("reset independently archives each registered numeric value and preserves other fields",()=>{
 for(const [score,bp] of [[2500,42],[2500,null],[null,42],[null,null],[0,0]]){
  const old={...record,score,bp,previousScore:2000,previousBp:60};
  const next=reset(old,now);
  assert.equal(next.previousScore,score??2000);assert.equal(next.previousBp,bp??60);
  assert.equal(next.score,null);assert.equal(next.bp,null);
  assert.equal(next.clearLamp,old.clearLamp);assert.equal(next.playerId,old.playerId);
  assert.equal(reset(next,now).previousScore,next.previousScore);
  assert.equal(reset(next,now).previousBp,next.previousBp);
  assert.equal(old.score,score);
 }
});
test("old records and old backups remain valid, new backup round trips keep previous values",()=>{
 validation.assertPlayerChartRecord(record);
 assert.throws(()=>validation.assertPlayerChartRecord({...record,previousScore:-1}),/invalid/);
 const payload={players:[],playerChartRecords:[record, {...reset(record,now),chartId:"d"}],history:[],ereterPersonalHistory:[],setupDrafts:[],uiSettings:[]};
 const result=backup.parseBackup(JSON.stringify({schemaVersion:1,backupCreatedAt:now,payload}));
 assert.equal(result.payload.playerChartRecords[0].previousScore,undefined);
 assert.equal(result.payload.playerChartRecords[1].previousScore,2500);
 assert.equal(result.payload.playerChartRecords[1].previousBp,42);
});
test("reset itself is not growth; next input creates initial registration and keeps previous values",async()=>{
 const current=reset(record,now);
 assert.equal(history.createRecordHistory(record,current,"manual",now,()=>"h"),undefined);
 let saved;
 await operations.updateQuickInput({getPlayerChartRecord:async()=>current,commit:async value=>{saved=value}},"p",{chartId:"c",notes:2000},"CLEAR",2450,50,now,()=>"h");
 assert.equal(saved.playerChartRecords[0].previousScore,2500);
 assert.equal(saved.playerChartRecords[0].previousBp,42);
 assert.equal(saved.history[0].scoreUpdate.before,null);
 assert.equal(saved.history[0].bpUpdate.before,null);
});
test("official and tracker CSV updates retain archived values",()=>{
 const current=reset(record,now);
 const song={songId:"s",title:"Song",debutVersion:"1st",debutVersionNumber:1,aliases:{}};
 const chart={chartId:"c",songId:"s",chartType:"DPA",officialLevel:12,notes:2000,availability:"available"};
 const headers=["タイトル",...["NORMAL","HYPER","ANOTHER","LEGGENDARIA"].flatMap(name=>["難易度","スコア","ミスカウント","クリアタイプ"].map(field=>name+" "+field))];
 const row=["Song",0,0,"---","NO PLAY",0,0,"---","NO PLAY",12,2400,50,"CLEAR",0,0,"---","NO PLAY"];
 const parsed=official.previewOfficialCsv(headers.join(",")+"\n"+row.join(","),"p",[song],[chart],[current],now);
 assert.equal(parsed.records[0].previousScore,2500);
 const csv=tracker.exportClearTrackerCsv([chart],[song],new Map(),[{...current,score:2400,bp:50}]);
 const preview=tracker.previewClearTrackerCsv(csv,"p",[chart],[current],now);
 assert.equal(preview.changes[0].after.previousBp,42);
});

