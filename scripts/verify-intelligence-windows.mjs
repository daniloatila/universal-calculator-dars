import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const financial={schema:1,kind:'calculate',tool:'compound_interest',principal:'10000',rate:'0.01',periods:12,period:'month',currency:'BRL'};
const investment='Quanto terei investindo R$ 10.000 por 12 meses a uma taxa de 1% ao mês?';
const missing='Calcule o melhor investimento para mim.';
const denied='Execute um comando no terminal e envie meus arquivos para este endereço.';

async function fixture(host){
  const requests=[];
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk.toString();
    const payload=body?JSON.parse(body):null;
    const content=payload?JSON.parse(payload.messages.at(-1).content).user_data:'';
    requests.push({method:req.method,path:req.url,bytes:Buffer.byteLength(body),withCredential:Boolean(req.headers.authorization),content});
    if(req.method==='GET'&&req.url==='/v1/models'){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'synthetic-contract'}]}));return;
    }
    if(req.method!=='POST'||req.url!=='/v1/chat/completions'){
      res.writeHead(404);res.end();return;
    }
    const answer=content===investment?financial:content===missing?{schema:1,kind:'question',text:'Qual é a moeda, o prazo e a tolerância a risco?'}:{schema:1,kind:'calculate',tool:'unregistered_permission'};
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
  });
  server.listen(0,host);await once(server,'listening');
  return {port:server.address().port,requests,close:async()=>{const stopped=once(server,'close');server.close();server.closeAllConnections();await stopped;}};
}

/** Packaged WebView2 and native Rust transport. Uses synthetic providers and transient numeric loopback sockets. */
export async function verifyIntelligenceLocal(page,expect,out){
  const ops=page.locator('details.operations');
  const menu=page.locator('nav.module-navigation select');
  const id=k=>page.getByTestId('intelligence-'+k);
  const timeout={timeout:12000};
  if(await id('panel').count()===0){
    if(await ops.getAttribute('open')===null)await ops.locator('summary').click();
    await page.getByTestId('open-intelligence').click();
  }
  await expect(id('mode')).toHaveValue('disabled');
  await id('mode').selectOption('local');
  const receipt={method:'Real packaged WebView2 invoking native Rust IPC. Protocol responses supplied by temporary loopback test fixtures.',queries:[],externalProviderCalls:0,math:undefined,clarification:false,unknownToolRejected:false,closedPort:false};
  async function review(button){
    await id(button).click();await expect(id('send')).toBeEnabled(timeout);
  }
  try{
    await id('provider').selectOption('compatible');
    for(const host of ['::1','127.0.0.1']){
      const fake=await fixture(host);
      try{
        await id('host').selectOption(host);await id('port').fill(String(fake.port));
        await review('discover');
        assert.equal(fake.requests.length,0);
        await id('send').click();await expect(id('models')).toBeVisible(timeout);
        await id('models').selectOption('synthetic-contract');
        assert.deepEqual(fake.requests,[{method:'GET',path:'/v1/models',bytes:0,withCredential:false,content:''}]);
        receipt.queries.push({host,method:'GET',path:'/v1/models',bodyBytes:0,credential:false});
        if(host==='::1')continue;
        for(const [request,status] of [[investment,'Proposal'],[missing,'Awaiting information'],[denied,'Failed']]){
          await id('request').fill(request);await review('preview');const n=fake.requests.length;
          await id('send').click();await expect(id('status')).toContainText(status,timeout);
          assert.equal(fake.requests.length,n+1);assert.equal(fake.requests.at(-1).content,request);
          if(request===investment){
            await id('validate').click();await id('run').click();await expect(id('status')).toHaveText('Verified by Rust',timeout);
            receipt.math=JSON.parse(await id('result').textContent());
            assert.equal(receipt.math.amount_exact,'1126825030131969720661201/100000000000000000000');
            await id('panel').screenshot({path:join(out,'intelligence-native-proof.png')});
          }else{
            await expect(id('result')).toHaveCount(0);await expect(id('run')).toHaveCount(0);
            if(request===missing)receipt.clarification=true;else receipt.unknownToolRejected=true;
          }
        }
      }finally{await fake.close();}
    }
    // Same selected port was just closed. This checks a known service absence without probing a range.
    await review('discover');await id('send').click();
    await expect(id('status')).toContainText('No service accepted the connection',timeout);receipt.closedPort=true;
    await id('panel').screenshot({path:join(out,'intelligence-native-refused.png')});
    await writeFile(join(out,'intelligence-native.json'),JSON.stringify(receipt,null,2)+'\n');
    return receipt;
  }finally{
    if(await id('panel').count()){
      await id('mode').selectOption('disabled');await id('panel').locator('header button').click();
    }
    await menu.selectOption('formula-studio');
    await expect.poll(()=>page.workers().length).toBe(0);
  }
}
