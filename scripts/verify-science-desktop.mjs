import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {runWindowsToolBenchmark} from '../benchmarks/windows-tool.mjs';

const [baseline,candidate,receiptPath,outputArg]=process.argv.slice(2);
assert(outputArg,'Pass approved 0.4.1 executable, 0.5.0 executable, verified hosted receipt and output directory.');
const baseReceipt=JSON.parse(await readFile(new URL('../evidence/objective-04/revision-01/windows-artifact.json',import.meta.url)));
const receipt=JSON.parse(await readFile(receiptPath));
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(hash(await readFile(baseline)),baseReceipt.exe_sha256);
assert.equal(hash(await readFile(candidate)),receipt.exe_sha256);
assert.equal(receipt.exe_version,'0.5.0');assert.equal(receipt.windows_job_conclusion,'success');
const out=resolve(outputArg);await mkdir(out,{recursive:true});
const modules=['statistics','probability','simulation','optimization','physics-engineering','graph-lab','data-lab'];
const scienceWorker=/\/(?:tool-(?:statistics|probability|simulation|optimization|physics-engineering|graph-lab)|data-lab)-worker-[^/]+\.js$/u;
const results={};
const closeTo=(actual,expected,tolerance)=>assert(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance);

function checkExample(id, operation, result) {
  switch (id) {
    case 'statistics':
      assert.equal(result.mean,3);
      assert.equal(result.median,3);
      assert.equal(result.variance,2.5);
      return;
    case 'probability':
      assert.equal(result.distribution,'normal');
      closeTo(result.point.cdf,0.5,1e-14);
      return;
    case 'simulation':
      assert.equal(result.seed,'42');
      assert.equal(result.samples,10000);
      assert.equal(result.distribution,'normal');
      return;
    case 'optimization':
      assert.equal(result.status,'converged');
      closeTo(result.point[0],Math.sqrt(2),1e-7);
      return;
    case 'physics-engineering':
      assert.deepEqual(result.values.current,{value:'2',unit:'A'});
      assert.deepEqual(result.values.power,{value:'24',unit:'W'});
      return;
    case 'graph-lab':
      if(operation==='surface'){
        assert(result.grid.z.length>=8);
        const row=Math.floor(result.grid.y.length/2), col=Math.floor(result.grid.x.length/2);
        closeTo(result.grid.z[row][col],Math.sin(result.grid.x[col])*Math.cos(result.grid.y[row]),1e-12);
      }else{
        assert.equal(result.series.length,2);
        const [[x,y]]=result.series[0].points;
        closeTo(y,Math.sin(x),1e-12);
      }
      return;
    case 'data-lab':
      assert.equal(result.rows,2);
      assert.equal(result.profile[1].statistics.sum,'15/4');
      return;
    default:
      assert.fail('Unexpected module '+id);
  }
}

async function verifyWasmAssets(page, inventory) {
  const assets = await page.evaluate(async (entries) => {
    const observed = [];
    for (const { name } of entries) {
      const response=await fetch(new URL('assets/'+name,location.href));
      if(!response.ok) throw new Error(`Packaged WebAssembly ${name} returned ${response.status}`);
      const bytes=await response.arrayBuffer();
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const sha256=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
      observed.push({name,sha256});
    }
    return observed;
  },inventory);
  assert.deepEqual(assets,inventory.map(({name,sha256})=>({name,sha256})));
  return assets;
}

for(const [label,path] of [['baseline',baseline],['candidate',candidate]]){
  results[label]=await runWindowsToolBenchmark({
    module:'science-desktop',artifactObjective:'objective-05',label,
    async audit({page,expect,data,sample,action,calculateStandard}){
      const menu=page.locator('nav.module-navigation select');
      const standard=()=>menu.selectOption('standard');
      const origin=new URL(page.url()).origin;
      let externalRequests=0;
      const networkContext=page.context();
      const observeRequest=req=>{
        const url=new URL(req.url());
        if(['http:','https:'].includes(url.protocol)&&url.origin!==origin) externalRequests++;
      };
      networkContext.on('request',observeRequest);
      const resourceUrls=()=>page.evaluate(()=>performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname));
      data.initialAdvancedAssets=(await resourceUrls()).filter(p=>/\/(?:tool-|dars_tool_wasm|science-|data-lab-)/.test(p));
      assert.equal(data.initialAdvancedAssets.length,0);
      data.standardTimesMs=[];
      for(let i=0;i<12;i++){data.standardTimesMs.push(await calculateStandard({expression:(7+i)+'*3',expected:String((7+i)*3)}));}
      await sample('standard_idle','visible',6);
      const stats=()=>page.evaluate(()=>{const m=performance.memory;return m?{used:m.usedJSHeapSize,total:m.totalJSHeapSize}:null;});
      data.runtimePhases=[];data.modules=[];let started=0,closed=0;
      page.on('worker',w=>{
        if(!scienceWorker.test(new URL(w.url()).pathname)) return;
        started++;
        w.once('close',()=>closed++);
      });
      if(label==='candidate'){
        const session=await page.context().newCDPSession(page);
        await session.send('Network.enable');
        await session.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
        for(let cycle=0;cycle<3;cycle++){
          const subset=cycle===0?modules:['graph-lab','data-lab'];
          for(const id of subset){
            await menu.selectOption(id);
            const d=id==='data-lab';
            const operation=id==='graph-lab'?(cycle===1?'surface':'explicit'):null;
            if(operation) await page.getByTestId('science-operation').selectOption(operation);
            await page.getByTestId(d?'data-lab-example':'science-example').click();
            const at=performance.now();
            await page.getByTestId(d?'data-lab-run':'science-run').click();
            const view=page.getByTestId(d?'data-lab-result':'science-result');
            await expect(view).toHaveAttribute('data-canonical',/.+/, {timeout:30000});
            const canonical=await view.getAttribute('data-canonical');
            const parsed=JSON.parse(canonical);assert(parsed && typeof parsed==='object');
            checkExample(id,operation,parsed);
            if(id==='graph-lab'){await expect(page.locator('canvas').first()).toBeVisible();}
            data.modules.push({id,cycle:cycle+1,ms:performance.now()-at,result_sha256:hash(canonical)});
            if(cycle===0||id==='graph-lab'&&cycle===1){
              if(['probability','simulation','graph-lab'].includes(id)){
                await expect(page.getByTestId('science-canvas')).toHaveAttribute('data-draws',/^[1-9]/u);
              }
              const file=id+(cycle?'-surface':'')+'.png';
              await page.screenshot({path:join(out,file)});
            }
            await expect.poll(()=>page.workers().length).toBe(0);
            data.runtimePhases.push({id,cycle:cycle+1,heap:await stats(),workers:page.workers().length});
            if(id==='graph-lab'||d){await sample(id+'_'+cycle,'visible',3);}
          }
          await standard();await expect(page.getByTestId('result')).toBeVisible();
          assert.equal((await action('minimize')).state,'minimized');
          await sample('minimized_'+cycle,'minimized',4);
          assert.equal((await action('restore')).state,'visible');
          await sample('restored_'+cycle,'visible',4);
        }
        await session.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        await session.detach();
        // Perform manifest readback after the timed phases so it does not preload candidates.
        data.packagedWasmReadback=await verifyWasmAssets(page,receipt.packaged_wasm_receipt);
      }else{
        assert.equal((await action('minimize')).state,'minimized');await sample('minimized_0','minimized',4);
        assert.equal((await action('restore')).state,'visible');await sample('restored_0','visible',4);
      }
      await expect.poll(()=>started-closed).toBe(0);
      data.workers={scope:'science module workers',opened:started,closed};
      networkContext.off('request',observeRequest);
      data.externalHttpRequests=externalRequests;
      assert.equal(externalRequests,0);
    }
  },path);
  await writeFile(join(out,label+'.json'),JSON.stringify(results[label],null,2)+'\n');
}
console.log(JSON.stringify({paired:true,baseline:baseReceipt.exe_sha256,candidate:receipt.exe_sha256,phases:Object.keys(results.candidate.phases),modules:results.candidate.modules.length}));
