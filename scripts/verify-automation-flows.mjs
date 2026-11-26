import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const root=fileURLToPath(new URL('../apps/web/',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try{
  await server.listen();
  browser=await chromium.launch({channel:process.env.DARS_BROWSER_CHANNEL||undefined});
  const page=await browser.newPage();
  const base='http://127.0.0.1:'+server.httpServer.address().port;
  const external=[];
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==base){external.push('external');return route.abort();}
    return route.continue();
  });
  await page.goto(base);
  const docs={};
  for(const name of ['finance','business','statistics','science'])
    docs[name]=JSON.parse(await readFile(new URL('../apps/web/src/automation-examples/'+name+'.json',import.meta.url)));
  const runs=await page.evaluate(async docs=>{
    const {runFlow,parseFlow,openFlowFile,matchesHistoric}=await import('/src/automation-flow.ts');
    const {createDetachedCapabilitySession}=await import('/src/capability-session.ts');
    const lifetime=new AbortController(),session=createDetachedCapabilitySession(lifetime.signal);
    const checks={};
    const prepare=(f,signal=lifetime.signal,progress)=>runFlow(f,session,undefined,signal,progress);
    try{
      for(const [name,doc] of Object.entries(docs)){
        const file=name==='business'?'cost,price\n80,100\n75,125\n':name==='statistics'?'value\n1\n""\n4\n7\n':undefined;
        const once=()=>runFlow(doc,session,file?new Blob([file]):undefined,lifetime.signal);
        const r=await once(),again=await once();
        const restored=openFlowFile(JSON.stringify(r));
        checks[name]={status:r.status,error:r.error,outputs:r.outputs,hashes:r.sourceHashes,operations:r.used.operations,
          first_ms:r.elapsedMs,repeated_ms:again.elapsedMs,bytes_charged:r.used.chargedBytes,rows_charged:r.used.rows,
          historical_replay:matchesHistoric(again,restored.historic),
          proofs:r.trace.filter(t=>t.proof).length,replay:JSON.stringify([r.trace,r.outputs,r.sourceHashes])===JSON.stringify([again.trace,again.outputs,again.sourceHashes])};
      }
      const minimal={format:'dars-flow',version:1,id:'fixture',inputs:{},outputs:['x'],steps:[{op:'let',id:'x',value:'1'}]};
      for(const [name,steps] of Object.entries({
        unregistered:[{id:'x',op:'call',module:'os',operation:'unknown',input:'1'}],
        reference:[{id:'x',op:'let',value:{ref:'missing'}}],
        cycle:[{id:'x',op:'let',value:{ref:'x'}}],
        unrestricted:[{id:'x',op:'repeat',value:'1'}],
      })){try{parseFlow(JSON.stringify({...minimal,steps}));checks[name]=false;}catch{checks[name]=true;}}
      const loop={...minimal,steps:[{id:'x',op:'each',items:Array(65).fill('1'),body:[{id:'v',op:'let',value:{ref:'item'}}],result:'v'}]};
      checks.iterations=(await prepare(loop)).error;
      const low={...minimal,steps:[{id:'a',op:'let',value:'x'.repeat(8192)},{id:'x',op:'each',items:Array(64).fill('1'),
        body:[{id:'v',op:'let',value:{ref:'a'}}],result:'v'}]};
      const limited=Object.create(session);limited.getBudget=()=>65536;
      checks.cumulative=(await runFlow(low,limited,undefined,lifetime.signal)).error;
      const c=new AbortController();checks.cancel=(await prepare(docs.finance,c.signal,()=>c.abort())).status;
      checks.recovery=(await prepare(minimal)).status;
      const custom=await prepare({...minimal,steps:[{id:'x',op:'formula',formula:'simple-interest',version:'1.0.0',arguments:{}}]});
      checks.formula={output:custom.outputs.x,version:custom.trace[0].formula?.definition.version,tests:custom.trace[0].formula?.tests.length,error:custom.error};
      const typed={id:'x',op:'arithmetic',left:{value:'2',unit:'m'},operator:'+',right:{value:'3',unit:'m'},unit:'m'};
      checks.typed=(await prepare({...minimal,steps:[typed]})).outputs.x;
      checks.bad_units=(await prepare({...minimal,steps:[{...typed,right:{value:'3',unit:'s'}}]})).error;
      const historical=openFlowFile(JSON.stringify(custom)).historic;
      historical.outputs={x:'5000'};checks.modified_history=matchesHistoric(custom,historical);
      // A synthetic transport checks accounting independently of the 16 MiB importer.
      const counted=Object.create(session);
      counted.dataset=async(...args)=>{const reply=await session.dataset(...args);return {...reply,profile:{...reply.profile,source_rows:100001}};};
      const tab={op:'dataset',config:{format:'csv'}};
      checks.cumulative_rows=(await runFlow({...minimal,steps:[{...tab,id:'a'},{...tab,id:'x'}]},counted,new Blob(['x\n1\n']),lifetime.signal)).error;
      return checks;
    } finally{lifetime.abort();session.dispose();}
  },docs);
  for(const name of Object.keys(docs)){assert.equal(runs[name].status,'verified',JSON.stringify({name,...runs[name]}));assert(runs[name].replay && runs[name].historical_replay);}
  assert.equal(runs.finance.outputs.scenario_a.amount,'11268.25');
  assert.equal(runs.finance.outputs.winner,'B');
  assert.equal(runs.business.outputs.total_gain,'70');
  assert.equal(runs.business.outputs.weighted_margin,'14/45');
  assert.equal(runs.statistics.outputs.statistics.sum,'12');
  for(const name of ['unregistered','reference','cycle','unrestricted']) assert.equal(runs[name],true,name);
  assert.equal(runs.cancel,'cancelled'); assert.equal(runs.iterations,'limit');assert.equal(runs.cumulative,'resource_budget');
  assert.equal(runs.recovery,'verified');assert.deepEqual(external,[]);
  assert.deepEqual(runs.formula.output,{value:'1200',unit:'BRL'});assert.equal(runs.formula.version,'1.0.0');assert.equal(runs.formula.tests,3);
  assert.deepEqual(runs.typed,{value:'5',unit:'m'});assert.equal(runs.bad_units,'unit');
  assert.equal(runs.modified_history,false);assert.equal(runs.cumulative_rows,'row_limit');
  const summary={browser:browser.version(),external_requests:external.length,runs};
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(summary,null,2)+'\n');
  console.log('Four flows reproduced with engine proofs. Formula version, units, cumulative budgets, replay, cancellation and recovery passed.');
}finally{await browser?.close();await server.close();}
