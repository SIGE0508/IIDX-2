import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const root = new URL("../", import.meta.url);
const read = file => readFileSync(new URL(file,root),"utf8");
const module = {exports:{}};
vm.runInNewContext(ts.transpileModule(read("src/features/dashboard/next-training.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
const {selectNextTraining,synchronizeNextTraining} = module.exports;
const candidates = Array.from({length:7},(_,index)=>({chartId:String(index),targetLamp:"EASY_CLEAR",reason:"MAIN_BAND",currentLamp:"FAILED"}));
const ids = rows => Array.from(rows,item=>item.chartId);
test("HOME chooses at most three unique engine candidates without mutation or outside filling",()=>{
  for(const count of [0,1,2,3,7]) {
    const input=candidates.slice(0,count), before=JSON.stringify(input);
    const result=selectNextTraining(input,[],()=>0.5);
    assert.equal(result.length,Math.min(3,count));
    assert.equal(new Set(ids(result)).size,result.length);
    assert.ok(result.every(item=>input.includes(item)));
    assert.equal(JSON.stringify(input),before);
  }
  assert.equal(selectNextTraining([candidates[0],candidates[0]]).length,1);
});
test("replacement prioritizes unshown charts and allows overlap only when needed",()=>{
  const previous=candidates.slice(0,3);
  const result=selectNextTraining(candidates,previous,()=>0.5);
  assert.ok(result.every(item=>!previous.includes(item)));
  const small=selectNextTraining(candidates.slice(0,4),previous,()=>0.5);
  assert.equal(small[0].chartId,"3");assert.equal(small.length,3);
  assert.equal(selectNextTraining(previous,previous).length,3);
});
test("same candidate content retains selection and consumes no randomness on rerenders",()=>{
  const first=synchronizeNextTraining({key:"",items:[]},"p1",candidates,()=>0.5);
  const again=synchronizeNextTraining(first,"p1",JSON.parse(JSON.stringify(candidates)),()=>{throw Error("unrelated rerender shuffled");});
  assert.equal(again,first);
});
test("PLAYER switch and changed play candidates regenerate even with same chart IDs",()=>{
  const first=synchronizeNextTraining({key:"",items:[]},"p1",candidates,()=>0.5);
  assert.notEqual(synchronizeNextTraining(first,"p2",candidates,()=>0.5),first);
  const changed=candidates.map(item=>({...item,currentLamp:"ASSIST_CLEAR"}));
  assert.notEqual(synchronizeNextTraining(first,"p1",changed,()=>0.5),first);
  const next=synchronizeNextTraining(first,"p1",candidates.slice(3),()=>0.5);
  assert.ok(next.items.every(item=>candidates.slice(3).includes(item)));
});
test("HOME selection survives navigation at App level and has no persistence or engine changes",()=>{
  const app=read("src/App.tsx"), hook=read("src/features/dashboard/useNextTraining.ts");
  assert.ok(app.indexOf("const nextTraining = useNextTraining")<app.indexOf("if (error)"));
  assert.ok(app.includes("nextTraining={nextTraining.items}"));
  assert.ok(app.includes("result={training}"));
  assert.ok(!/IndexedDB|repository|localStorage/.test(hook));
  assert.ok(read("src/features/dashboard/Screens.tsx").includes("↻ 入れ替え"));
});
