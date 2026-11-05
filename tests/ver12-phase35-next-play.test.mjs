import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const requirePackage = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: source => {
    if (["react", "react/jsx-runtime"].includes(source)) return requirePackage(source);
    if (!source.startsWith(".")) throw new Error(`Unexpected import ${source}`);
    const base = path.resolve(path.dirname(filename), source);
    return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
  } }, { filename });
  cache.set(filename, module.exports);
  return module.exports;
}



const list = load(path.join(root,"src/domain/play-list.ts"));
const validation = load(path.join(root,"src/storage/validation.ts"));
const backup = load(path.join(root,"src/import/backup.ts"));
const service = load(path.join(root,"src/play-list/service.ts"));
const setup = load(path.join(root,"src/setup/service.ts"));
const ui = load(path.join(root,"src/features/dashboard/NextPlay.tsx"));
const now="2026-11-05T00:00:00Z";
const player=()=>({playerId:"p",playerName:null,iidxId:null,highestDpRank:"CHUDEN",notesRadar:null,ereterOverall:null,notesRadarDetails:{NOTES:[],CHORD:[],PEAK:[],SCRATCH:[],CHARGE:[],SOF_LAN:[]},createdAt:now,updatedAt:now});
const json=value=>JSON.parse(JSON.stringify(value));
const envelope=players=>({schemaVersion:1,backupCreatedAt:now,payload:{players,playerChartRecords:[],history:[],ereterPersonalHistory:[],setupDrafts:[],uiSettings:[]}});
const master={chartMaster:{charts:[{chartId:"a",songId:"s",officialLevel:10,chartType:"DPA",availability:"available"},{chartId:"unknown",songId:"s",officialLevel:11,chartType:"DPA",availability:"unknown"},{chartId:"gone",songId:"s",officialLevel:12,chartType:"DPA",availability:"unavailable"},{chartId:"nine",songId:"s",officialLevel:9,chartType:"DPA",availability:"available"}],songs:[{songId:"s",title:"TEST SONG"}]},unofficial:{records:[]}};
class MemoryAtomicRepository {
  constructor(p=player()){this.players=new Map([[p.playerId,json(p)]]);this.tail=Promise.resolve();}
  updatePlayer(id,update) {
    const result=this.tail.then(()=>{const current=this.players.get(id);if(!current)throw Error("missing Player");const next=update(json(current));validation.assertPlayer(next);this.players.set(id,json(next));return json(next);});
    this.tail=result.catch(()=>{});return result;
  }
}
test("Unicode code points: 100 emoji accepted, 101 rejected, combining/ZWJ count individually",()=>{
  assert.equal(list.countMemoCodePoints("😀".repeat(100)),100);
  assert.equal(list.countMemoCodePoints("e\u0301"),2);
  assert.equal(list.countMemoCodePoints("👨‍👩‍👧"),5);
  assert.doesNotThrow(()=>list.assertPlayList([{chartId:"a",memo:"😀".repeat(100)}]));
  assert.throws(()=>list.assertPlayList([{chartId:"a",memo:"😀".repeat(101)}]));
  assert.doesNotThrow(()=>list.assertPlayList([{chartId:"a",memo:""}]));
});
test("legacy optional list remains empty without changing the original Player",()=>{
  const p=player(),before=JSON.stringify(p);validation.assertPlayer(p);assert.equal(list.playerPlayList(p).length,0);assert.equal(JSON.stringify(p),before);
  assert.throws(()=>validation.assertPlayer({...p,playList:null}));
});
test("list validation rejects duplicates, sixth entry, malformed IDs and memo types",()=>{
  for(const value of [[{chartId:"a",memo:""},{chartId:"a",memo:"different"}],Array.from({length:6},(_,i)=>({chartId:String(i),memo:""})),[{chartId:" ",memo:""}],[{chartId:"a",memo:null}],{},null])assert.throws(()=>list.assertPlayList(value));
  assert.doesNotThrow(()=>list.assertPlayList(Array.from({length:5},(_,i)=>({chartId:String(i),memo:""}))));
});
test("add/edit/delete preserve insertion order and every unrelated Player field",()=>{
  const p=player(),before=JSON.stringify(p);
  const a=list.changePlayList(p,{type:"add",chartId:"a"},now);
  const b=list.changePlayList(a,{type:"add",chartId:"b"},now);
  const c=list.changePlayList(b,{type:"memo",chartId:"a",memo:"  😀\nline  "},now);
  assert.deepEqual(json(c.playList),[{chartId:"a",memo:"  😀\nline  "},{chartId:"b",memo:""}]);
  const removed=list.changePlayList(c,{type:"remove",chartId:"a"},now);
  const readded=list.changePlayList(removed,{type:"add",chartId:"a"},now);
  assert.deepEqual(json(readded.playList.map(x=>x.chartId)),["b","a"]);
  assert.equal(JSON.stringify(p),before);assert.equal(a.playList[0].memo,"");
  assert.equal(c.highestDpRank,p.highestDpRank);assert.equal(c.createdAt,p.createdAt);
  assert.equal(list.changePlayList(c,{type:"memo",chartId:"a",memo:""},now).playList[0].memo,"");
});
test("duplicate/full/missing editing reject without mutation or resurrection",()=>{
  const p={...player(),playList:Array.from({length:5},(_,i)=>({chartId:String(i),memo:"memo"}))},before=JSON.stringify(p);
  for(const change of [{type:"add",chartId:"0"},{type:"add",chartId:"six"},{type:"memo",chartId:"gone",memo:"x"},{type:"remove",chartId:"gone"},{type:"memo",chartId:"0",memo:"x".repeat(101)}])assert.throws(()=>list.changePlayList(p,change,now));
  assert.equal(JSON.stringify(p),before);
});
test("service allows managed playable charts only; retained unavailable entry can be removed",async()=>{
  const repo=new MemoryAtomicRepository();
  await service.updatePlayList(repo,"p",master,{type:"add",chartId:"a"},now);
  await service.updatePlayList(repo,"p",master,{type:"add",chartId:"unknown"},now);
  for(const chartId of ["gone","nine","missing"])await assert.rejects(service.updatePlayList(repo,"p",master,{type:"add",chartId},now));
  await assert.rejects(service.updatePlayList(repo,"p",master,{type:"add",chartId:"a"},"bad"));
  repo.players.get("p").playList.push({chartId:"gone",memo:"keep"});
  await service.updatePlayList(repo,"p",master,{type:"memo",chartId:"gone",memo:"edit"},now);
  await service.updatePlayList(repo,"p",master,{type:"remove",chartId:"gone"},now);
  assert.equal(repo.players.get("p").playList.length,2);
});
test("stale profile and list operations merge into latest Player, including personal ERETER/Radar",async()=>{
  const original=player(),repo=new MemoryAtomicRepository(original);
  await service.updatePlayList(repo,"p",master,{type:"add",chartId:"a"},now);
  await setup.updatePlayerProfile(repo,original,{playerName:"changed",iidxId:null,highestDpRank:"KAIDEN",playList:[]},now);
  await setup.updatePlayerEreterOverall(repo,original,8,now);
  const radar={NOTES:1,CHORD:2,PEAK:3,SCRATCH:4,CHARGE:5,SOF_LAN:6};
  await setup.updatePlayerRadar(repo,original,radar,now);
  await setup.updatePlayerRadarDetails(repo,original,original.notesRadarDetails,now);
  await service.updatePlayList(repo,"p",master,{type:"memo",chartId:"a",memo:"saved"},now);
  const actual=repo.players.get("p");assert.equal(actual.playerName,"changed");assert.equal(actual.highestDpRank,"KAIDEN");assert.equal(actual.ereterOverall,8);assert.deepEqual(actual.notesRadar,radar);assert.equal(actual.playList[0].memo,"saved");
});
test("PLAYER lists are independent, including the same chartId",async()=>{
  const repo=new MemoryAtomicRepository();repo.players.set("p2",{...player(),playerId:"p2"});
  await Promise.all(["p","p2"].map(id=>service.updatePlayList(repo,id,master,{type:"add",chartId:"a"},now)));
  await service.updatePlayList(repo,"p",master,{type:"memo",chartId:"a",memo:"p only"},now);
  assert.equal(repo.players.get("p2").playList[0].memo,"");
});
test("schema1 old backup defaults empty, new lists round trip including Unicode and insertion order",()=>{
  const old=backup.parseBackup(JSON.stringify(envelope([player()])));
  assert.deepEqual(json(old.payload.players[0].playList),[]);
  const p={...player(),playList:[{chartId:"unknown",memo:"😀".repeat(100)},{chartId:"a",memo:""}]};
  const parsed=backup.parseBackup(JSON.stringify(envelope([p])));
  assert.equal(parsed.schemaVersion,1);assert.deepEqual(json(parsed.payload.players[0]),p);
  assert.deepEqual(Object.keys(parsed.payload).sort(),["players","playerChartRecords","history","ereterPersonalHistory","setupDrafts","uiSettings"].sort());
});
test("malformed new list is rejected before restoration; missing chart refs are rejected",()=>{
  for(const playList of [null,[{chartId:"a",memo:5}],[{chartId:"a",memo:"x".repeat(101)}],[{chartId:"a",memo:""},{chartId:"a",memo:""}]])assert.throws(()=>backup.parseBackup(JSON.stringify(envelope([{...player(),playList}]))));
  const parsed=backup.parseBackup(JSON.stringify(envelope([{...player(),playList:[{chartId:"gone",memo:"keep"}]}])));
  assert.doesNotThrow(()=>backup.validateBackupReferences(parsed,new Set(["gone"])));
  assert.throws(()=>backup.validateBackupReferences(parsed,new Set(["a"])),/NEXT PLAY/);
});
test("restore requires current-master reference validation for nonempty NEXT PLAY and touches no data on error",async()=>{
  let calls=0;const repo={replaceUserData:async()=>{calls++;}};
  const parsed=backup.parseBackup(JSON.stringify(envelope([{...player(),playList:[{chartId:"a",memo:""}]}])));
  await assert.rejects(backup.restoreBackup(repo,parsed,now));assert.equal(calls,0);
  await assert.rejects(backup.restoreBackup(repo,parsed,now,new Set(["different"])));assert.equal(calls,0);
  await backup.restoreBackup(repo,parsed,now,new Set(["a"]));assert.equal(calls,1);
  await backup.restoreBackup(repo,backup.parseBackup(JSON.stringify(envelope([player()]))),now);assert.equal(calls,2);
});
test("add buttons represent registered/full/busy states and remain standalone buttons",()=>{
  const render=(entries,busy=false)=>renderToStaticMarkup(React.createElement(ui.NextPlayAddButton,{chartId:"a",label:"TEST DPA",actions:{entries,busy,onAdd(){}}}));
  assert.ok(!render([]).includes("disabled"));
  assert.ok(render([{chartId:"a",memo:""}]).includes("登録済み"));
  assert.ok(render(Array.from({length:5},(_,i)=>({chartId:String(i),memo:""}))).includes("上限5件"));
  assert.ok(render([],true).includes("保存中"));
  assert.ok(render([],true).includes('type="button"'));
});
test("HOME list displays registered order, codepoint counter, escaped memo and no nested buttons",()=>{
  const entries=[{chartId:"unknown",memo:"😀".repeat(100)},{chartId:"a",memo:"<script>alert(1)</script>"}];
  const html=renderToStaticMarkup(React.createElement(ui.NextPlaySection,{master,records:new Map(),controller:{playerId:"p",entries,busy:false,onAdd(){},onMemo:async()=>true,onRemove(){}},onSelect(){}}));
  assert.ok(html.indexOf('data-chart-id="unknown"')<html.indexOf('data-chart-id="a"'));
  assert.ok(html.includes("100 / 100文字"));assert.ok(!html.includes("maxlength"));
  assert.ok(!html.includes("<script>"));assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(html));
});
test("missing/unavailable charts remain visible for memo/edit/removal rather than disappearing",()=>{
  const html=renderToStaticMarkup(React.createElement(ui.NextPlaySection,{master,records:new Map(),controller:{playerId:"p",entries:[{chartId:"gone",memo:"keep"},{chartId:"missing",memo:"keep"}],busy:false,onAdd(){},onMemo:async()=>true,onRemove(){}},onSelect(){}}));
  assert.equal((html.match(/現在選曲できない譜面/g)||[]).length,2);assert.equal((html.match(/>削除<\/button>/g)||[]).length,2);
});
test("NEXT PLAY edits leave TRAINING, HOME candidates, WARM pools and draw keys unchanged",async()=>{
  const {trainingScenarios}=await import("./fixtures/training-scenarios.mjs");
  const engine=load(path.join(root,"src/training/engine.ts")),home=load(path.join(root,"src/training/home-candidates.ts")),warm=load(path.join(root,"src/training/warm-up.ts"));
  const next=load(path.join(root,"src/features/dashboard/next-training.ts")),draw=load(path.join(root,"src/features/dashboard/warm-up-selection.ts"));
  for(const {input} of trainingScenarios()) {
    const c=engine.calculateTrainingWithCandidates(input),h=home.buildHomeCandidatePool(input.player,c),w=warm.buildWarmUpPool(c,input.master,new Map(input.records.map(r=>[r.chartId,r])));
    const p=list.changePlayList(input.player,{type:"add",chartId:"test-only"},now),c2=engine.calculateTrainingWithCandidates({...input,player:p}),h2=home.buildHomeCandidatePool(p,c2),w2=warm.buildWarmUpPool(c2,input.master,new Map(input.records.map(r=>[r.chartId,r])));
    assert.equal(JSON.stringify(c.training),JSON.stringify(c2.training));assert.equal(JSON.stringify(h),JSON.stringify(h2));assert.equal(JSON.stringify(w),JSON.stringify(w2));
    const n=next.synchronizeNextTraining(next.createNextTrainingState(),p.playerId,h,()=>0.5),s=draw.synchronizeWarmUp(draw.createWarmUpState(),p.playerId,w,[],()=>0.5);
    assert.equal(next.synchronizeNextTraining(n,p.playerId,h2,()=>{throw Error("reshuffle")}),n);
    assert.equal(draw.synchronizeWarmUp(s,p.playerId,w2,[],()=>{throw Error("reshuffle")}),s);
  }
});
