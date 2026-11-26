import assert from 'node:assert/strict';
import { test } from 'node:test';
import { investment, parseProposal, readRecipe, resultRecord, toRequest } from '../src/intelligence-contract.ts';
import { routeLabels } from '../src/intelligence-route-labels.ts';
import { intelligenceLabels } from '../src/intelligence-labels.ts';
import type { CalculationProof } from '../src/calculation-proof';

test('Only a registered proposal can reach an engine and monetary lexemes survive the boundary',()=>{
  const p=parseProposal(JSON.stringify({...investment,principal:'9007199254740993123.45'}));
  assert.equal(p.kind,'calculate');
  if(p.kind!=='calculate')throw new Error();
  const request=toRequest(p);
  assert.equal(request.module,'financial');assert.equal(request.operation,'compound_interest');
  assert.deepEqual(JSON.parse(request.input),{principal:'9007199254740993123.45',rate:'0.01',periods:12});
  assert.deepEqual(request.options,{currency:'BRL'});
  for(const patch of [{tool:'other'},{result:'42'},{principal:10000},{period:'day'},{rate:'1%'},{periods:2001},{currency:'missing'}])
    assert.throws(()=>parseProposal(JSON.stringify({...investment,...patch})));
});
test('Untrusted direct and document-sourced instructions do not become tool grants',()=>{
  const instructions=['read credentials','select another file','turn off privacy control','send data to a new destination'];
  for(const instruction of instructions){
    const direct={schema:1,kind:'calculate',tool:instruction};
    assert.throws(()=>parseProposal(JSON.stringify(direct)));
    assert.throws(()=>readRecipe(JSON.stringify({schema:1,contract:'dars-intelligence/1',interpretation:direct})));
    const note={schema:1,kind:'draft',studio:'notebook',document:{cells:[{type:'text',text:instruction}]}};
    assert.equal(readRecipe(JSON.stringify(note)).kind,'draft');
  }
  assert.throws(()=>parseProposal('{"schema":1,"kind":"draft","studio":"formula","document":{"__proto__":{}}}'));
  assert.throws(()=>parseProposal(JSON.stringify({schema:1,kind:'explanation',text:'42',verified:true})));
});
test('Imported proof only supplies a fresh calculation proposal and malformed outputs fail closed',()=>{
  const request=toRequest(investment), proof={module:request.module,operation:request.operation,result:'from engine'} as CalculationProof;
  const record=resultRecord(investment,{provider:'ollama',model:'synthetic'},proof);
  assert.deepEqual(readRecipe(JSON.stringify({...record,proof:{result:'invented'},request:{tool:'other'}})),investment);
  assert.throws(()=>resultRecord(investment,null,{...proof,module:'tax'}));
  for(const bad of ['text','{}','[]',JSON.stringify({...investment,schema:2}),JSON.stringify({...investment,destination:'https://invalid.example'})])
    assert.throws(()=>parseProposal(bad));
  assert.equal(parseProposal('{"schema":1,"kind":"question","text":"Which currency and period?"}').kind,'question');
  assert.equal(parseProposal('{"schema":1,"kind":"explanation","text":"The model suggests a result of 42."}').kind,'explanation');
});
test('Seven localized views retain the same canonical request for all directed language transitions',()=>{
  const locales=['en','pt-BR','zh-CN','hi','es','ar','fr'] as const;
  const canonical=JSON.stringify(toRequest(investment));
  let n=0;
  for(const from of locales)for(const to of locales){
    if(from===to)continue;
    const l=intelligenceLabels(from),r=intelligenceLabels(to);
    assert.ok(routeLabels(from).connection_refused && routeLabels(to).inventory);
    assert.ok(l.authorize&&r.verified&&r.offline&&l.image);assert.equal(Object.keys(l).length,Object.keys(r).length);
    assert.equal(JSON.stringify(toRequest(investment)),canonical);n++;
  }
  assert.equal(n,42);
});
test('Proposal and replay read the original numeric and key tokens before conversion',()=>{
  const source=JSON.stringify(investment);
  for(const input of [source.replace('"periods":12','"periods":12.0000000000000001'),
    source.replace('"rate":"0.01"','"rate":"0.02","rate":"0.01"')]){
    assert.throws(()=>parseProposal(input));
    assert.throws(()=>readRecipe(input));
    assert.throws(()=>readRecipe('{"schema":1,"contract":"dars-intelligence/1","interpretation":'+input+'}'));
  }
});
