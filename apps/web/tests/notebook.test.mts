import test from 'node:test';
import assert from 'node:assert/strict';
import { dirtyCells, financialNotebook, newCell, notebookLimits, openNotebook, planNotebook, saveNotebook, type NotebookDocument } from '../src/notebook-document.ts';
import { notebookLabels } from '../src/notebook-labels.ts';
import { runNotebook } from '../src/notebook-engine.ts';
import type { CalculationProof } from '../src/calculation-proof.ts';
import type { ToolRequest } from '../src/tool-runtime.ts';

const demo=()=>financialNotebook('pt-BR',notebookLabels['pt-BR'].sampleNames);
const titles=notebookLabels.en.sampleNames;
test('the dependency graph orders reversed input, identifies cycles and missing dependencies independently',()=>{
  const d=demo();
  const bad=newCell('expression',d.cells,'en');
  bad.source='@missing+1';
  const plan=planNotebook([bad,...d.cells.slice().reverse()]);
  assert.equal(plan.errors.get(bad.id),'missing');
  assert.ok(plan.order.indexOf('capital')<plan.order.indexOf('growth'));
  assert.ok(plan.order.indexOf('growth')<plan.order.indexOf('gain'));
  const edge=(key:string,other:string)=>({...bad,id:key,source:'@'+other});
  const cyclic=planNotebook([edge('a','b'),edge('b','c'),edge('c','a'),edge('self','self'),...d.cells]);
  assert.deepEqual([...cyclic.errors.entries()].sort(),[['a','cycle'],['b','cycle'],['c','cycle'],['self','cycle']]);
});
test('a rate change only invalidates its descendants; document reordering does not recalculate',()=>{
  const before=demo();
  const changed={...before,cells:before.cells.map(c=>c.id==='rate'?{...c,source:'0,02'}:c)};
  assert.deepEqual([...dirtyCells(before,changed)].sort(),['gain','growth','rate','trajectory','verification']);
  assert.equal(dirtyCells(before,{...before,cells:before.cells.slice().reverse()}).size,0);
  const duplicates={...before,cells:before.cells.map(c=>c.id==='rate'?{...c,symbol:'capital'}:c)};
  const errors=planNotebook(duplicates.cells).errors;
  assert.equal(errors.get('rate'),'duplicate_variable');assert.equal(errors.get('capital'),'duplicate_variable');
});
test('notebook import is closed, bounded and inert; the documented ASCII draft migrates explicitly',()=>{
  const sample=financialNotebook('en',titles), encoded=saveNotebook(sample,{});
  assert.deepEqual(openNotebook(encoded).document,sample);
  const draft={format:'dars-notebook',version:0,title:'Legacy preview',notation:'ascii-point',
    cells:sample.cells.map(({origin:_,...cell})=>cell)};
  assert.equal(openNotebook(JSON.stringify(draft)).migrated,true);
  assert.equal(openNotebook(JSON.stringify(draft)).document.cells[0]!.origin,'en');
  assert.throws(()=>openNotebook(JSON.stringify({...sample,version:5})),/unsupported/);
  assert.throws(()=>openNotebook(JSON.stringify({...sample,execute:true})),/invalid_input/);
  assert.throws(()=>openNotebook(JSON.stringify({...sample,cells:[sample.cells[0],sample.cells[0]]})),/duplicate_id/);
  const duplicateVersion = encoded.replace(/"version"\s*:\s*1/, '"version":1,"version":1');
  assert.notEqual(duplicateVersion,encoded);
  assert.throws(()=>openNotebook(duplicateVersion),/invalid_input/);
  assert.throws(()=>openNotebook(' '.repeat(notebookLimits.fileBytes+1)),/limit/);
  assert.throws(()=>openNotebook(JSON.stringify({...sample,history:{capital:{output:{value:'not a certified calculation'}}}})),/invalid_input/);
});
test('temporary graph work enforces abort, cumulative document budget and dependency failure without a value',async()=>{
  const first=newCell('expression',[],'en');first.source='@absent';
  const second={...first,id:'linked',source:'@'+first.id};
  const doc:NotebookDocument={format:'dars-notebook',version:1,title:'links',cells:[first,second]};
  const never=async():Promise<never>=>{throw new Error('unexpected engine invocation');};
  const opts={run:never,formula:never};
  const out=await runNotebook(doc,{},[],opts,new AbortController().signal,10_000);
  assert.equal(out.calls,0);assert.equal(out.errors[first.id],'missing');assert.equal(out.errors.linked,'blocked');
  assert.deepEqual(Object.keys(out.records),[]);
  await assert.rejects(runNotebook(doc,{},[],opts,AbortSignal.abort(),10000),/cancelled/);
  await assert.rejects(runNotebook(doc,{},[],opts,new AbortController().signal,30),/resource_budget/);
});
test('numeric dependency checking refuses incompatible units and approximate upstream values',async()=>{
  const base=newCell('variable',[],'en');base.id='first';base.source='3';base.unit='m';
  const ref={...newCell('expression',[base],'en'),id:'out',source:'@first*2'};
  const doc:NotebookDocument={format:'dars-notebook',version:1,title:'units',cells:[base,ref]};
  // Only dispatcher sequencing and type rejection are tested by this stub. Browser tests run Rust.
  const stub=(r:ToolRequest)=>Promise.resolve({result:r.input,exactness:'exact'} as CalculationProof);
  const opts={run:stub,formula:async():Promise<never>=>{throw new Error('unreachable');}};
  const unit=await runNotebook(doc,{},[],opts,new AbortController().signal,100000);
  assert.equal(unit.errors.out,'unit');assert.equal(unit.calls,1);
  const approx={...doc,cells:[{...base,kind:'scientific' as const,unit:'1'},ref]};
  const value=await runNotebook(approx,{},[],{...opts,run:async()=>({result:'3.00',exactness:'approximate'} as CalculationProof)},new AbortController().signal,100000);
  assert.equal(value.errors.out,'type');assert.equal(value.calls,1);
});
