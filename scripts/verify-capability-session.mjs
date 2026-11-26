import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const {chromium} = require('@playwright/test');
const {createServer} = await import(pathToFileURL(require.resolve('vite')).href);
const root = fileURLToPath(new URL('../apps/web/', import.meta.url));
const server = await createServer({root, server:{host:'127.0.0.1',port:0}, logLevel:'error'});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({channel:process.env.DARS_BROWSER_CHANNEL || undefined});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:'+address.port);
  const receipt = await page.evaluate(async () => {
    const {createDetachedCapabilitySession} = await import('/src/capability-session.ts');
    const {capabilities} = await import('/src/capability-catalog.ts');
    const controller = new AbortController();
    const session = createDetachedCapabilitySession(controller.signal);
    const call = (module,operation,input) => session.run({schema:1,module,operation,input,options:{}});
    const observed = {};
    try {
      observed.standard = (await call('standard','evaluate','9007199254740993+1/3')).result;
      observed.scientific = (await call('scientific','evaluate','sqrt(81)')).result;
      observed.finance = JSON.parse((await call('financial','compound_interest','{"principal":"10000","rate":"0.01","periods":12}')).result);
      const bounded = await session.dataset(new Blob(['[{"v":1.25},{"v":"2,50"}]']),{format:'json',decimal:'comma',types:{v:'decimal'}},4*1024*1024);
      observed.data = bounded.profile.profile[0].statistics;
      try { await call('unregistered','evaluate','1'); } catch (e) { observed.unknown = e.message; }
      const cancel = new AbortController();
      cancel.abort();
      try { await session.run({schema:1,module:'standard',operation:'evaluate',input:'3',options:{}},cancel.signal); } catch(e) { observed.cancelled=e.message; }
      observed.recovered = (await call('standard','evaluate','2+3')).result;
      observed.modules = [...new Set(capabilities.map(c=>c.module))].length;
      observed.capabilities = capabilities.length;
      return observed;
    } finally { controller.abort(); session.dispose(); }
  });
  assert.equal(receipt.modules,22);
  assert.equal(receipt.standard,'27021597764222980/3');
  assert.equal(receipt.scientific,'9');
  assert.equal(receipt.data.mean,'15/8');
  assert.equal(receipt.recovered,'5');
  assert.equal(receipt.unknown,'unsupported');
  assert.equal(receipt.cancelled,'cancelled');
  console.log(JSON.stringify(receipt));
  if (process.argv[2]) await writeFile(process.argv[2],JSON.stringify(receipt,null,2)+'\n');
} finally { await browser?.close(); await server.close(); }
