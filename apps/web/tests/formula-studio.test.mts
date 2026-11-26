import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FormulaLibrary, communityFormulas, decodeFormula, validateFormula } from '../src/formula-library.ts';
import type { FormulaDefinition, FormulaEvaluate } from '../src/formula-library.ts';
import { compileFormula } from '../src/formula-expression.ts';
import init,{evaluate_value_record_json} from '../src/wasm/dars_wasm.js';

const wasm=await readFile(new URL('../src/wasm/dars_wasm_bg.wasm',import.meta.url));
await init({module_or_path:wasm});
const native=fileURLToPath(new URL('../../../target/release/'+(process.platform==='win32'?'dars.exe':'dars'),import.meta.url));
const evaluate:FormulaEvaluate=async(input,signal)=>{
  signal?.throwIfAborted();
  const answer=JSON.parse(evaluate_value_record_json(input,'{}'));
  const cli=spawnSync(native,['standard-record',input,'{}'],{encoding:'utf8',timeout:6000});
  assert.equal(cli.error,undefined);assert.deepEqual(JSON.parse(cli.stdout),answer);
  if(!answer.ok)throw Error(answer.code);
  return answer.proof;
};
const standard=():FormulaDefinition=>structuredClone(communityFormulas.find(f=>f.id==='arithmetic-mean')!);

test('four offline community formulas agree between Rust CLI and WASM, with exact integer and rational cases',async()=>{
  const lib=new FormulaLibrary();
  const expected=['12','1200','1/2','5/2'];
  for(const [i,f] of communityFormulas.entries()){
    const tests=await lib.verifyAndAdd(f,evaluate);assert.equal(tests.length,f.tests.length);
    const result=await lib.execute(f.id,f.version,{},evaluate);
    assert.equal(result.value,expected[i]);assert.equal(result.proof.exactness,'exact');
    assert.deepEqual(result.receipt.definition,f);assert.deepEqual(result.receipt.tests,tests);
  }
});
test('formula records are version-pinned, detached, and reproducible offline in a fresh library',async()=>{
  const lib=new FormulaLibrary();
  const first={...standard(),id:'averager'};
  const second={...first,version:'2.0.0',expression:'a + b',tests:[{name:'sum',inputs:{},expected:'1',unit:'1'}]};
  await lib.verifyAndAdd(first,evaluate);const old=await lib.execute(first.id,first.version,{},evaluate);
  await lib.verifyAndAdd(second,evaluate);assert.equal((await lib.execute(first.id,'2.0.0',{},evaluate)).value,'1');
  await assert.rejects(lib.verifyAndAdd({...second,version:first.version},evaluate),/version_conflict/u);
  const fresh=new FormulaLibrary();await fresh.verifyAndAdd(decodeFormula(JSON.stringify(old.receipt.definition)),evaluate);
  const replay=await fresh.execute(first.id,first.version,old.receipt.inputs,evaluate);assert.deepEqual(replay,old);
  old.receipt.definition.name='external';assert.notEqual(lib.resolve(first.id,first.version)?.name,'external');
  lib.clear();assert.equal(lib.resolve(first.id,first.version),undefined);
});
test('failed tests, schema violations, oversized input and undefined references never register a formula',async()=>{
  const lib=new FormulaLibrary(), f={...standard(),id:'candidate'};
  await assert.rejects(lib.verifyAndAdd({...f,tests:[{name:'incorrect oracle',inputs:{},expected:'9',unit:'1'}]},evaluate),/test_failed/u);
  assert.equal(lib.resolve(f.id,f.version),undefined);
  for(const raw of [{...f,executable:true},{...f,parameters:[f.parameters[0],f.parameters[0]]},{...f,tests:[]},{...f,version:'latest'}]){
    assert.throws(()=>validateFormula(raw));
  }
  assert.throws(()=>decodeFormula(JSON.stringify(f).replace('"schema":1','"schema":1,"schema":1')),/schema/u);
  assert.throws(()=>decodeFormula(' '.repeat(65537)),/complexity/u);
  await assert.rejects(lib.verifyAndAdd({...f,expression:'unbound + 1'},evaluate),/reference/u);
  const bounded={...f.parameters[0]!,default:'8',max:'2'};
  const explicit={...f,parameters:[bounded,...f.parameters.slice(1)],
    tests:[{name:'override',inputs:{a:{value:'0',unit:'1'}},expected:'0',unit:'1'}]};
  await assert.rejects(lib.verifyAndAdd(explicit,evaluate),/constraint/u);
  await assert.rejects(lib.verifyAndAdd({...f,expression:'not/a/function()'},evaluate));
  await assert.rejects(lib.verifyAndAdd({...f,expression:'('.repeat(36)+'1'+')'.repeat(36)},evaluate),/complexity/u);
  assert.equal(lib.resolve(f.id,f.version),undefined);
});
test('pinned dependencies validate input and output dimensions, detect cycles and retain child proof',async()=>{
  const lib=new FormulaLibrary(), f=standard();
  const dep={name:'mean',id:f.id,version:f.version,arguments:{a:'a',b:'b'}};
  const doubled={...f,id:'twice-mean',expression:'mean * 2',dependencies:[dep],tests:[{name:'twice',inputs:{},expected:'1',unit:'1'}]};
  await lib.verifyAndAdd(doubled,evaluate);
  const result=await lib.execute(doubled.id,doubled.version,{},evaluate);
  assert.equal(result.value,'1');assert.equal(result.receipt.dependencies[0]?.definition.id,f.id);
  await assert.rejects(lib.verifyAndAdd({...doubled,id:'recursive',dependencies:[{...dep,id:'recursive'}]},evaluate),/cycle/u);
  await assert.rejects(lib.verifyAndAdd({...doubled,id:'absent',dependencies:[{...dep,version:'2.1.0'}]},evaluate),/reference/u);
  await assert.rejects(lib.verifyAndAdd({...doubled,id:'undefined-binding',dependencies:[{...dep,arguments:{a:'z'}}]},evaluate),/reference/u);
  await assert.rejects(lib.execute('constant-speed','1.0.0',{time:{value:'3',unit:'m'}},evaluate),/unit/u);
  await assert.rejects(lib.execute('constant-speed','1.0.0',{time:{value:'0',unit:'s'}},evaluate),/division_by_zero/u);
});
test('bounds and dimensional expression grammar use exact validation, typed roots and certified tolerances',async()=>{
  const lib=new FormulaLibrary(), f=standard();
  const x={name:'a',type:'rational' as const,unit:'m^2',default:'2',min:'0'};
  const root={...f,id:'root-length',parameters:[x],unit:'m',expression:'sqrt(a)',tests:[{name:'sqrt two',inputs:{},
    expected:'1.41421356237',unit:'m',tolerance:'0.000000001'}]};
  await lib.verifyAndAdd(root,evaluate);
  assert.equal((await lib.execute(root.id,root.version,{},evaluate)).proof.exactness,'approximate');
  await assert.rejects(lib.verifyAndAdd({...root,id:'bad-tolerance',tests:[{...root.tests[0],tolerance:'0'}]},evaluate),/test_failed/u);
  await assert.rejects(lib.verifyAndAdd({...root,id:'bad-dimension',unit:'s'},evaluate),/unit/u);
  const symbols=new Map([['length',{value:'2',unit:'m'}],['time',{value:'3',unit:'s'}]]);
  assert.throws(()=>compileFormula('length + time',symbols,'m'),/unit/u);
  assert.throws(()=>compileFormula('length ^ time',symbols,'m'),/unit/u);
  assert.equal(await evaluate(compileFormula('length ^ 2',symbols,'m^2')).then(p=>p.result),'4');
});
test('refuse an unaudited answer, respect cancellation, discard stale session writes, and recover',async()=>{
  const lib=new FormulaLibrary(), f={...standard(),id:'again'};
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(lib.verifyAndAdd(f,evaluate,cancelled.signal),/cancelled/u);
  const wrong:FormulaEvaluate=async()=>evaluate('1');await assert.rejects(lib.verifyAndAdd(f,wrong),/test_failed/u);
  let restored=false;
  const clearing:FormulaEvaluate=async(input,s)=>{const value=await evaluate(input,s);if(!restored){lib.clear();restored=true;}return value;};
  await assert.rejects(lib.verifyAndAdd(f,clearing),/cancelled/u);
  assert.equal(lib.resolve(f.id,f.version),undefined);
  await lib.verifyAndAdd(f,evaluate);assert.equal((await lib.execute(f.id,f.version,{},evaluate)).value,'1/2');
});
