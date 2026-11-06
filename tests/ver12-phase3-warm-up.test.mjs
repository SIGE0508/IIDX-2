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



const warm = load(path.join(root, "src/training/warm-up.ts"));
const draw = load(path.join(root, "src/features/dashboard/warm-up-selection.ts"));
const { WarmUpSection, WarmUpRow } = load(path.join(root, "src/features/dashboard/WarmUpSection.tsx"));
const now = "2026-11-04T00:00:00Z";
const context = { phase: 12, mode: "PERFORMANCE", mainBand: 12.5 };
function fixture(specs, ctx = context) {
  const player = { playerId: "p", highestDpRank: "CHUDEN", notesRadar: null, ereterOverall: null };
  const charts = specs.map((s,i) => ({ chartId: s.id ?? "c"+i, songId: "s"+i, officialLevel: s.level ?? 11, chartType: "DPA", availability: s.availability ?? "available", notes: s.notes === undefined ? 1000 : s.notes }));
  const records = new Map(specs.map((s,i) => [charts[i].chartId, { playerId: s.playerId ?? "p", chartId: charts[i].chartId, clearLamp: s.lamp ?? "HARD_CLEAR", score: s.score ?? null, bp: s.bp ?? null }]));
  const master = {
    chartMaster: { charts, songs: charts.map(c=>({songId:c.songId,title:c.chartId+" long title"})) },
    unofficial: { records: specs.map((s,i)=>({chartId:charts[i].chartId,difficulty:s.d ?? null})) },
    ereter: { records: [] },
    notesRadar: { records: specs.flatMap((s,i)=>s.radar===null?[]:[{chartId:charts[i].chartId,values:s.radar??{NOTES:60,CHORD:60,PEAK:60,SCRATCH:60,CHARGE:60,SOF_LAN:60}}]) },
  };
  const engine = load(path.join(root,"src/training/engine.ts"));
  const calc=engine.calculateTrainingWithCandidates({player, records:[...records.values()], master});
  calc.training={...calc.training,...ctx};
  const pool=warm.buildWarmUpPool(calc,master,records);
  return {pool, master, records, calc};
}
const ids = items=>Array.from(items,c=>c.chartId);
const simple = (id,role="LIGHT",extra={})=>({chartId:id,role,officialLevel:11,difficulty:11.2,currentLamp:"HARD_CLEAR",score:null,bp:null,bpRate:null,radarLoad:null,radarBalance:null,reasons:[],...extra});
const poolOf = (light=[],basic=[],accuracy=[])=>({context,roles:{LIGHT:light,BASIC:basic,ACCURACY:accuracy}});
test("phase10 inclusive caps and global mainBand never admit harder or level9 charts",()=>{
  const specs=[9.6,10,10.1,10.5,10.6,10.7,10.8].map(d=>({id:String(d),level:10,d}));
  const {pool}=fixture([...specs,{id:"nine",level:9,d:9.6}],{phase:10,mode:"PERFORMANCE",mainBand:10.6});
  assert.deepEqual(ids(pool.roles.LIGHT),["10","9.6"]);
  assert.deepEqual(new Set(ids(pool.roles.BASIC)),new Set(["9.6","10","10.1","10.5"]));
  assert.ok(pool.roles.ACCURACY.every(c=>c.difficulty<=10.6));
  assert.ok(!Object.values(pool.roles).flat().some(c=>c.chartId==="nine"));
});
test("all five stage tables have exact inclusive lower/upper boundaries",()=>{
  const stages=[
    {phase:10,mainBand:10.7,expected:{LIGHT:[[10,-Infinity,10]],BASIC:[[10,-Infinity,10.5]],ACCURACY:[[10,-Infinity,10.7]]}},
    {phase:11,mainBand:11.8,expected:{LIGHT:[[10,9.6,10.2]],BASIC:[[10,10.2,10.7]],ACCURACY:[[10,10.5,11],[11,10.5,11.2]]}},
    {phase:12,mainBand:12.2,expected:{LIGHT:[[10,10.2,10.7]],BASIC:[[10,10.5,11],[11,10.7,11.4]],ACCURACY:[[11,11.2,11.8]]}},
    {phase:12,mainBand:12.5,expected:{LIGHT:[[10,10.5,10.7],[11,11,11.4]],BASIC:[[11,11.4,11.8]],ACCURACY:[[11,11.8,12.1],[12,11.6,12.1]]}},
    {phase:12,mainBand:12.7,expected:{LIGHT:[[11,10.7,11.4]],BASIC:[[11,11.4,11.8]],ACCURACY:[[11,11.8,12.1],[12,11.6,12.2]]}},
  ];
  for(const stage of stages) {
    const ctx={phase:stage.phase,mainBand:stage.mainBand,mode:"PERFORMANCE"};
    for(const [role,ranges] of Object.entries(stage.expected)) {
      const actual=warm.warmUpRanges(ctx)[role].map(r=>[r.level,r.min,r.max]);
      assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(ranges)));
      for(const [level,min,max] of ranges) {
        for(const d of [Number.isFinite(min)?min:9,max]) {
          const {pool}=fixture([{level,d}],ctx);assert.equal(pool.roles[role].length,1,JSON.stringify({stage,role,d}));
        }
        for(const d of [Number.isFinite(min)?min-0.1:8,max+0.1]) {
          if(ranges.some(r=>r[0]===level&&d>=r[1]&&d<=r[2]))continue;
          const {pool}=fixture([{level,d}],ctx);assert.equal(pool.roles[role].length,0);
        }
      }
    }
  }
});
test("12.0/12.2/12.3/12.5/12.6/12.7 table transitions and INITIAL below12 fallback",()=>{
  const specs=[{id:"low",level:10,d:10.2},{id:"mid",level:10,d:10.6},{id:"high",level:11,d:10.7},{id:"accuracy",level:12,d:12.2}];
  for(const mode of ["INITIAL","PERFORMANCE"])for(const band of [12,12.2,12.3,12.5,12.6,12.7]) {
    const {pool}=fixture(specs,{phase:12,mode,mainBand:band});
    assert.equal(ids(pool.roles.LIGHT).includes("low"),band<=12.2);
    assert.equal(ids(pool.roles.LIGHT).includes("high"),band>=12.6);
    assert.equal(ids(pool.roles.ACCURACY).includes("accuracy"),band>=12.6);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(warm.warmUpRanges({phase:12,mode:"INITIAL",mainBand:11.8}))),JSON.parse(JSON.stringify(warm.warmUpRanges({phase:11,mode:"INITIAL",mainBand:11.8}))));
  for(const phase of [10,11,12])assert.equal(Object.values(fixture(specs,{phase,mode:"INITIAL",mainBand:null}).pool.roles).flat().length,0);
});
test("only CLEAR/HARD/EXH/FC; CLEAR fallback and HARD preference for accuracy",()=>{
  const lamps=["NO_PLAY","FAILED","ASSIST_CLEAR","EASY_CLEAR","CLEAR","HARD_CLEAR","EX_HARD_CLEAR","FULL_COMBO"];
  const {pool}=fixture(lamps.map((lamp,i)=>({id:String(i),level:11,d:11.8,lamp})));
  assert.deepEqual(ids(pool.roles.ACCURACY),["5","6","7","4"]);
  assert.equal(fixture([{d:11.8,lamp:"CLEAR"}]).pool.roles.ACCURACY.length,1);
  const result=draw.selectWarmUp(pool,[],[],()=>0.5);assert.notEqual(result.find(c=>c.role==="ACCURACY").currentLamp,"CLEAR");
});
test("unknown unofficial values use only conservative official proxy and rank below known",()=>{
  const {pool}=fixture([{id:"unknown",level:11},{id:"known",level:11,d:11.2}]);
  assert.deepEqual(ids(pool.roles.LIGHT),["known","unknown"]);
  assert.equal(pool.roles.LIGHT[1].difficulty,null);
  assert.equal(pool.roles.BASIC.length,0);
  assert.ok(!Object.values(fixture([{level:10}]).pool.roles).flat().length);
  assert.ok(!Object.values(fixture([{level:12}],{phase:11,mode:"INITIAL",mainBand:11.9}).pool.roles).flat().length);
});
test("BP zero is valid; missing BP/notes/score never exclude lamp-qualified charts",()=>{
  assert.equal(warm.warmUpBpRate(0,1000),0);
  for(const [bp,notes] of [[null,1000],[0,null],[1,0],[undefined,1000],[-1,1000],[1,NaN]])assert.equal(warm.warmUpBpRate(bp,notes),null);
  const {pool}=fixture([{id:"missing",d:11.2,notes:null},{id:"zero",d:11.2,bp:0},{id:"few",d:11.2,bp:10}]);
  assert.deepEqual(ids(pool.roles.LIGHT),["zero","few","missing"]);
  assert.ok(pool.roles.LIGHT.every(c=>c.score===null));
});
test("BP cannot override failed lamps or promote charts beyond the main band",()=>{
  const {pool}=fixture([{d:11.8,lamp:"EASY_CLEAR",bp:0,score:2000},{d:12.1,level:12,bp:0}],{phase:12,mode:"INITIAL",mainBand:11.9});
  assert.equal(Object.values(pool.roles).flat().length,0);
});
test("Radar uses max load, not sums; zero and missing remain distinct",()=>{
  const radar=(notes,chord,peak)=>({NOTES:notes,CHORD:chord,PEAK:peak,SCRATCH:0,CHARGE:0,SOF_LAN:0});
  const {pool}=fixture([{id:"spike",d:11.2,radar:radar(0,0,150)},{id:"balanced",d:11.2,radar:radar(70,70,70)},{id:"zero",d:11.2,radar:radar(0,0,0)},{id:"absent",d:11.2,radar:null}]);
  assert.deepEqual(ids(pool.roles.LIGHT),["zero","balanced","spike","absent"]);
  assert.equal(pool.roles.LIGHT[0].radarLoad,0);assert.equal(pool.roles.LIGHT[3].radarLoad,null);
  assert.equal(pool.roles.LIGHT[3].reasons.some(r=>r.includes("Radar")),false);
});
test("BASIC uses NOTES/CHORD balance independently from total Radar",()=>{
  const radar=(n,c)=>({NOTES:n,CHORD:c,PEAK:0,SCRATCH:0,CHARGE:0,SOF_LAN:0});
  assert.deepEqual(ids(fixture([{id:"biased",d:11.6,radar:radar(80,10)},{id:"balanced",d:11.6,radar:radar(80,80)}]).pool.roles.BASIC),["balanced","biased"]);
});
test("unavailable/out-of-scope charts excluded; unknown availability remains eligible; no input mutation",()=>{
  const f=fixture([{id:"unavailable",d:11.2,availability:"unavailable"},{id:"unknown",d:11.2,availability:"unknown"},{id:"nine",d:11.2,level:9}]);
  const before=JSON.stringify([f.calc,f.master,[...f.records]]);
  warm.buildWarmUpPool(f.calc,f.master,f.records);
  assert.equal(JSON.stringify([f.calc,f.master,[...f.records]]),before);
  assert.deepEqual(ids(f.pool.roles.LIGHT),["unknown"]);
});
test("foreign PLAYER metrics do not enter BP or SCORE helpers",()=>{
  const {pool}=fixture([{d:11.2,playerId:"other",bp:0,score:2000}]);
  assert.equal(pool.roles.LIGHT.length,0);
});
test("matching fills three unique roles without consuming the only scarce-role chart",()=>{
  const pool=poolOf([simple("shared"),simple("light")],[simple("shared","BASIC")],[simple("accuracy","ACCURACY")]);
  const items=draw.selectWarmUp(pool,[],[],()=>0.5);
  assert.deepEqual(ids(items),["light","shared","accuracy"]);
  assert.equal(new Set(ids(items)).size,3);
});
test("NEXT overlap avoided globally; shortage permits overlap without outside filling",()=>{
  const pool=poolOf([simple("shared"),simple("light")],[simple("basic","BASIC")],[simple("accuracy","ACCURACY")]);
  assert.deepEqual(ids(draw.selectWarmUp(pool,["shared"],[],()=>0.5)),["light","basic","accuracy"]);
  assert.deepEqual(ids(draw.selectWarmUp(pool,["shared","light","basic","accuracy"],[],()=>0.5)),["shared","basic","accuracy"]);
  const scarce=poolOf([simple("one")],[simple("one","BASIC")],[]);
  assert.equal(draw.selectWarmUp(scarce,[],[],()=>0.5).length,1);
  assert.equal(draw.selectWarmUp(poolOf(),[],[],()=>0.5).length,0);
});
test("replacement avoids previous charts, retaining roles and leaving inputs untouched",()=>{
  const pool=poolOf(...["LIGHT","BASIC","ACCURACY"].map(role=>Array.from({length:4},(_,i)=>simple(role+i,role))));
  const before=JSON.stringify(pool);
  const state=draw.synchronizeWarmUp(draw.createWarmUpState(),"p",pool,[],()=>0.5);
  const next=draw.replaceWarmUp(state,pool,[],()=>0.5);
  assert.equal(next.items.length,3);assert.ok(next.items.every(c=>!ids(state.items).includes(c.chartId)));
  assert.equal(JSON.stringify(pool),before);
});
test("no alternatives disables replacement and consumes no randomness",()=>{
  const pool=poolOf([simple("one")]);
  const state=draw.synchronizeWarmUp(draw.createWarmUpState(),"p",pool,[],()=>0.5);
  assert.equal(draw.canReplaceWarmUp(state,pool,[]),false);
  assert.equal(draw.replaceWarmUp(state,pool,[],()=>{throw Error("unexpected draw")}),state);
});
test("navigation/NEXT changes/unrelated rerenders preserve state and consume no random numbers",()=>{
  const pool=poolOf([simple("a"),simple("b")]);
  const state=draw.synchronizeWarmUp(draw.createWarmUpState(),"p",pool,["a"],()=>0.5);
  assert.equal(draw.synchronizeWarmUp(state,"p",JSON.parse(JSON.stringify(pool)),["b"],()=>{throw Error("redrawn")}),state);
});
test("PLAYER, lamp/BP/SCORE/candidate or context changes reassess WARM UP",()=>{
  const pool=poolOf([simple("a"),simple("b")]);
  const state=draw.synchronizeWarmUp(draw.createWarmUpState(),"p",pool,[],()=>0.5);
  assert.notEqual(draw.synchronizeWarmUp(state,"other",pool,[],()=>0.5),state);
  for(const patch of [{currentLamp:"CLEAR"},{score:123},{bp:0},{bpRate:0}]) {
    const changed=poolOf([simple("a","LIGHT",patch),simple("b")]);
    assert.notEqual(draw.synchronizeWarmUp(state,"p",changed,[],()=>0.5),state);
  }
  assert.notEqual(draw.synchronizeWarmUp(state,"p",{...pool,context:{...context,mode:"INITIAL"}},[],()=>0.5),state);
});
test("WARM and NEXT selection states remain independent in both directions",()=>{
  const next=load(path.join(root,"src/features/dashboard/next-training.ts"));
  const candidates=["a","b","c","d","e","f"].map(chartId=>({chartId,goal:"EASY"}));
  const n=next.synchronizeNextTraining(next.createNextTrainingState(),"p",candidates,()=>0.5);
  const pool=poolOf([simple("warm1"),simple("warm2")]);
  const w=draw.synchronizeWarmUp(draw.createWarmUpState(),"p",pool,ids(n.items),()=>0.5);
  const before=JSON.stringify(n);draw.replaceWarmUp(w,pool,ids(n.items),()=>0.5);assert.equal(JSON.stringify(n),before);
  const n2=next.replaceNextTraining(n,candidates,()=>0.5);
  assert.equal(draw.synchronizeWarmUp(w,"p",pool,ids(n2.items),()=>{throw Error("coupled")}),w);
});
test("HOME UI roles ordered, missing difficulty explicit, sibling action avoids nested buttons",()=>{
  const {pool,master}=fixture([{id:"light",d:11.2},{id:"basic",d:11.6},{id:"accuracy",level:12,d:12}]);
  const items=draw.selectWarmUp(pool,[],[],()=>0.5);
  const html=renderToStaticMarkup(React.createElement(WarmUpSection,{items,master,onSelect(){},onReplace(){},canReplace:true}));
  assert.ok(html.indexOf("軽い指慣らし")<html.indexOf("基礎運指・安定性"));assert.ok(html.indexOf("基礎運指・安定性")<html.indexOf("精度練習"));
  assert.equal((html.match(/data-role=/g)||[]).length,3);
  const row=renderToStaticMarkup(React.createElement(WarmUpRow,{item:simple("light","LIGHT",{difficulty:null}),master,onSelect(){},actions:React.createElement("button",{},"future action")}));
  assert.ok(row.includes("非公式 —"));assert.equal((row.match(/<button/g)||[]).length,2);assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(row));
});

test("top-30 pool fills three distinct roles at all supported candidate counts", () => {
  for (const count of [0, 1, 2, 3, 17, 30, 31, 100]) {
    const pool = poolOf(...["LIGHT", "BASIC", "ACCURACY"].map(role =>
      Array.from({ length: count }, (_, i) => simple("chart-" + i, role))));
    const drawItems = draw.selectWarmUp(pool, [], [], () => 0.5);
    assert.equal(drawItems.length, Math.min(3, count));
    assert.equal(new Set(ids(drawItems)).size, drawItems.length);
    assert.ok(drawItems.every(item => Number(item.chartId.slice(6)) < 30));
  }
});

test("short pools reuse older history and still avoid the immediately preceding chart", () => {
  for (const size of [1, 2, 3]) {
    const pool = poolOf(Array.from({ length: size }, (_, i) => simple(String(i))));
    let state = draw.synchronizeWarmUp(draw.createWarmUpState(), "p", pool, [], () => 0.5);
    for (let i = 0; i < 8; i++) {
      const previous = state;
      state = draw.replaceWarmUp(state, pool, [], () => 0.5);
      if (size === 1) assert.equal(state, previous);
      else assert.notEqual(state.items[0].chartId, previous.items[0].chartId);
    }
  }
});

const seededWarmUp = initial => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
};
test("ten replacements avoid the last three displays and diversify across fixed seeds", () => {
  const pool = poolOf(...["LIGHT", "BASIC", "ACCURACY"].map(role =>
    Array.from({ length: 42 }, (_, i) => simple(role + i, role))));
  for (const seed of [1, 42, 20261106, 0x12345678, 0xffffffff]) {
    const random = seededWarmUp(seed), nextIds = ["LIGHT0", "BASIC0", "ACCURACY0"];
    let state = draw.synchronizeWarmUp(draw.createWarmUpState(), "p", pool, nextIds, random);
    const observed = new Map();
    for (let i = 0; i < 10; i++) {
      state = draw.replaceWarmUp(state, pool, nextIds, random);
      assert.ok(state.history.length <= 3);
      for (const item of state.items) {
        assert.ok(!state.history.flat().includes(item.chartId));
        assert.ok(!nextIds.includes(item.chartId));
        assert.ok(Number(item.chartId.slice(item.role.length)) < 30);
        const counts = observed.get(item.role) ?? new Map();
        counts.set(item.chartId, (counts.get(item.chartId) ?? 0) + 1);
        observed.set(item.role, counts);
      }
    }
    for (const counts of observed.values()) {
      assert.ok(counts.size >= 6);
      assert.ok(Math.max(...counts.values()) <= 3);
    }
  }
});

test("sampling favors higher rank and penalizes a measured BP-rate gap", () => {
  const random = seededWarmUp(42);
  const pool = poolOf([simple("best", "LIGHT", { bpRate: 0 }), simple("near", "LIGHT", { bpRate: 0.0001 }),
    simple("far", "LIGHT", { bpRate: 0.03 })]);
  const counts = { best: 0, near: 0, far: 0 };
  for (let i = 0; i < 2000; i++) counts[draw.selectWarmUp(pool, [], [], random)[0].chartId]++;
  assert.ok(counts.best > counts.near);
  assert.ok(counts.far > 0 && counts.far < counts.near / 3);
  const withMissing = poolOf([...pool.roles.LIGHT, simple("missing")]);
  assert.equal(draw.selectWarmUp(withMissing, [], ["best", "near"], () => 0.5)[0].chartId, "far");
});

test("history records a display once, prunes invalid charts, and resets for another PLAYER", () => {
  const pool = poolOf([simple("a"), simple("b"), simple("c")]);
  const pending = draw.synchronizeWarmUp(draw.createWarmUpState(), "p", pool, [], () => 0.5);
  assert.equal(pending.history.length, 0);
  const shown = draw.recordWarmUpDisplay(pending);
  assert.equal(draw.recordWarmUpDisplay(shown), shown);
  assert.equal(shown.history.flat().join(), "a");
  const edited = poolOf([simple("a", "LIGHT", { bpRate: 0.01 }), simple("b")]);
  const updated = draw.synchronizeWarmUp(shown, "p", edited, [], () => 0.5);
  assert.deepEqual(ids(updated.items), ["b"]);
  assert.equal(updated.history.flat().join(), "a");
  const removed = draw.synchronizeWarmUp(shown, "p", poolOf([simple("b")]), [], () => 0.5);
  assert.equal(removed.history.flat().length, 0);
  assert.equal(draw.synchronizeWarmUp(shown, "other", pool, [], () => 0.5).history.length, 0);
});
