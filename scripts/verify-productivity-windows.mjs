import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const amount='1126825030131969720661201/100000000000000000000';
const interest='126825030131969720661201/100000000000000000000';

/** Exercise the packaged workspaces after the comparable Standard/science memory measurements. */
export async function verifyProductivity(page,expect,out) {
  const menu=page.locator('nav.module-navigation select');
  const receipt={};
  const workers={opened:0,closed:0,peak:0};
  const observe=worker=>{
    workers.opened++;
    workers.peak=Math.max(workers.peak,workers.opened-workers.closed);
    worker.once('close',()=>workers.closed++);
  };
  page.on('worker',observe);
  try {
    await menu.selectOption('math-notebook');
    await page.getByTestId('notebook-example').click();
    await page.getByTestId('notebook-run').click();
    await expect(page.getByTestId('notebook-result-growth')).toHaveAttribute('data-canonical',amount,{timeout:35000});
    await expect(page.getByTestId('notebook-result-gain')).toHaveAttribute('data-canonical',interest);
    receipt.notebook={amount,interest};
    await page.screenshot({path:join(out,'math-notebook.png')});
    await menu.selectOption('formula-studio');
    await page.getByTestId('formula-pick-arithmetic-mean-1.0.0').click();
    await page.getByTestId('formula-run').click();
    await expect(page.getByTestId('formula-result')).toHaveAttribute('data-value','1/2');
    receipt.formula={pin:'arithmetic-mean@1.0.0',exact:'1/2'};
    await page.screenshot({path:join(out,'formula-studio.png')});
    await menu.selectOption('automation-studio');
    await page.getByTestId('flow-demo').selectOption('finance');
    await page.getByTestId('flow-example').click();
    await page.getByTestId('flow-run').click();
    await expect(page.getByTestId('flow-results')).toBeVisible({timeout:35000});
    const result=JSON.parse(await page.getByTestId('flow-results').textContent());
    assert.equal(result.scenario_a.amount_exact,amount);
    assert.equal(result.scenario_b.amount_exact,'4897252030306448390395044241/409600000000000000000000');
    receipt.automation={flow:'finance',result_sha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
    await page.screenshot({path:join(out,'automation-studio.png')});
    await menu.selectOption('standard');
    const ops=page.locator('details.operations');
    if(await ops.getAttribute('open')===null) await ops.locator('summary').click();
    await page.getByTestId('open-intelligence').click();
    await expect(page.getByTestId('intelligence-mode')).toHaveValue('disabled');
    await page.getByTestId('intelligence-example').click();
    await page.getByTestId('intelligence-validate').click();
    await page.getByTestId('intelligence-run').click();
    const verified=page.getByTestId('intelligence-result');
    await expect(verified).toBeVisible();
    assert.equal(JSON.parse(await verified.textContent()).amount_exact,amount);
    receipt.intelligence={provider_mode:'disabled',source:'built-in declarative proposal',verified_amount:amount};
    await page.screenshot({path:join(out,'intelligence.png')});
    await page.getByTestId('intelligence-panel').locator('header button').click();
    // Standard may own its normal idle engine. Releasable jobs must finish before
    // comparing worker counts, so leave the app in a lightweight dormant workspace.
    await menu.selectOption('formula-studio');
    await expect.poll(()=>page.workers().length).toBe(0);
    await expect.poll(()=>workers.opened-workers.closed).toBe(0);
    assert(workers.opened>0);
    return {...receipt,workers};
  } finally {page.off('worker',observe);}
}
