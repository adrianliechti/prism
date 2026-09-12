import { test, expect, type Page } from '@playwright/test';

let upstream: string;
const responsePane = (page: Page) => page.getByRole('region', { name: 'Response', exact: true });
const urlInput = (page: Page) => page.getByPlaceholder('Enter request URL');

async function send(page: Page) {
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/proxy/')),
    page.getByRole('button', { name: 'Send', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
}

async function echo(page: Page): Promise<{ method: string; body: string; url: string; headers: Record<string,string[]> }> {
  const pre = responsePane(page).locator('pre').first();
  await expect(pre).toContainText('"method"');
  return JSON.parse((await pre.textContent())!);
}

async function bodyType(page: Page, type: string) {
  await page.getByRole('tab', { name: 'Body', exact: true }).click();
  await page.getByRole('combobox').nth(1).selectOption(type);
}

test.beforeEach(async ({ page, request }) => {
  upstream = (await (await request.get('/test-config')).json()).upstream;
  for (const store of ['drafts', 'requests']) {
    const entries: {id: string}[] = await (await request.get(`/data/${store}`)).json();
    for (const entry of entries) await request.delete(`/data/${store}/${entry.id}`);
  }
  await page.goto('/');
  await expect(urlInput(page)).toBeVisible();
});

test('draft navigation, body formats, and reload preserve unsent work', async ({ page }) => {
  await page.getByLabel('Request name', { exact: true }).fill('Draft A');
  await urlInput(page).fill(`${upstream}/draft-a?x=1`);
  await bodyType(page, 'raw');
  await page.locator('textarea').fill('unsent payload');
  await bodyType(page, 'none');
  await bodyType(page, 'raw');
  await expect(page.locator('textarea')).toHaveValue('unsent payload');
  await page.getByTitle('New request', { exact: true }).click();
  await page.getByLabel('Request name', { exact: true }).fill('Draft B');
  await urlInput(page).fill(`${upstream}/draft-b`);
  await page.locator('aside').getByRole('button', { name: /Draft A/ }).click();
  await expect(urlInput(page)).toHaveValue(`${upstream}/draft-a?x=1`);
  await expect(page.locator('textarea')).toHaveValue('unsent payload');
  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect(page.getByLabel('Request name', { exact: true })).toHaveValue('Draft A');
  await expect(page.locator('textarea')).toHaveValue('unsent payload');
  await expect(page.locator('aside').getByRole('button', { name: /Draft B/ })).toBeVisible();
});

test('HTTP methods, GET payloads, and redirects reach the target', async ({ page }) => {
  await urlInput(page).fill(`${upstream}/echo`);
  await bodyType(page, 'raw');
  await page.locator('textarea').fill('payload');
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/proxy/')),
    urlInput(page).press('Enter'),
  ]);
  expect(await echo(page)).toMatchObject({ method:'GET', body:'payload' });
  await page.getByRole('combobox').first().selectOption('OPTIONS');
  await urlInput(page).fill(`${upstream}/options`);
  await send(page);
  await expect(responsePane(page)).toContainText('202');
  await page.getByRole('combobox').first().selectOption('POST');
  for (const code of [307,308]) {
    await urlInput(page).fill(`${upstream}/redirect${code}`);
    await send(page);
    expect(await echo(page)).toMatchObject({ method:'POST', body:'payload', url:'/echo' });
  }
  await page.getByTitle('Following redirects', { exact:true }).click();
  await send(page);
  await expect(responsePane(page)).toContainText('308');
});

test('Enter sends from the address bar and cannot duplicate a running request', async ({ page }) => {
  let sent = 0;
  page.on('request', request => { if (request.url().includes('/proxy/')) sent++; });
  await urlInput(page).fill(`${upstream}/slow`);
  await bodyType(page, 'raw');
  await page.locator('textarea').fill('payload');
  await page.locator('textarea').press('End');
  await page.locator('textarea').press('Enter');
  await expect(page.locator('textarea')).toHaveValue('payload\n');
  await urlInput(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  expect(sent).toBe(0);
  await urlInput(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await urlInput(page).press('Enter');
  expect(sent).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(responsePane(page)).toContainText('Request cancelled');
});

test('Params and URL stay synchronized and keep intentional duplicates', async ({ page }) => {
  await urlInput(page).fill(`${upstream}/echo?tag=one&tag=two`);
  await page.getByRole('tab', { name:/^Params/ }).click();
  await expect(page.getByPlaceholder('Parameter', { exact:true }).nth(0)).toHaveValue('tag');
  await page.getByPlaceholder('Value', { exact:true }).nth(0).fill('changed');
  await expect(urlInput(page)).toHaveValue(`${upstream}/echo?tag=changed&tag=two`);
  await send(page);
  expect((await echo(page)).url).toBe('/echo?tag=changed&tag=two');
});

test('each execution has immutable history', async ({ page, request }) => {
  await urlInput(page).fill(`${upstream}/echo`);
  await bodyType(page,'raw');
  await page.locator('textarea').fill('first'); await send(page);
  await page.locator('textarea').fill('second'); await send(page);
  await page.waitForLoadState('networkidle');
  const entries:{id:string}[]=await (await request.get('/data/requests')).json();
  expect(entries).toHaveLength(2);
  const saved=await Promise.all(entries.map(async entry=>(await request.get(`/data/requests/${entry.id}`)).json()));
  expect(saved.map(s=>s.http.body.content).sort()).toEqual(['first','second']);
  expect(new Set(saved.map(s=>s.requestId)).size).toBe(1);
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await expect(page.locator('aside time')).toHaveCount(2);
});

test('saved binary uploads survive reload and missing files cannot send',async({page})=>{
  await urlInput(page).fill(`${upstream}/echo`);
  await page.getByRole('combobox').first().selectOption('POST');
  await bodyType(page,'binary');
  await page.locator('input[type=file]').setInputFiles({name:'sample.txt',mimeType:'text/plain',buffer:Buffer.from('saved upload')});
  await send(page); expect((await echo(page)).body).toBe('saved upload');
  await page.waitForLoadState('networkidle'); await page.reload();
  await expect(page.getByText('sample.txt',{exact:true})).toBeVisible();
  await send(page); expect((await echo(page)).body).toBe('saved upload');
  await page.locator('input[type=file]').setInputFiles({name:'large.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(8*1024*1024+1)});
  await page.waitForLoadState('networkidle'); await page.reload();
  await expect(page.getByRole('alert')).toContainText('Reattach large.bin');
  await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
});

test('live events, parallel requests, and cancellation remain usable',async({page})=>{
  await page.getByLabel('Request name',{exact:true}).fill('Live events');
  await urlInput(page).fill(`${upstream}/stream`);
  await page.getByLabel('Request timeout in seconds').fill('0');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(responsePane(page)).toContainText('Receiving');
  await expect(responsePane(page)).toContainText('first');
  await page.getByTitle('New request',{exact:true}).click();
  await urlInput(page).fill(`${upstream}/echo`);
  await send(page); expect((await echo(page)).method).toBe('GET');
  await page.locator('aside').getByRole('button',{name:/Live events/}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(responsePane(page)).toContainText('Request cancelled');
  await expect(responsePane(page)).toContainText('first');
  await expect(page.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
});

test('timeout stops an unresponsive request',async({page})=>{
  await urlInput(page).fill(`${upstream}/slow`);
  await page.getByLabel('Request timeout in seconds').fill('1');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(responsePane(page)).toContainText('timed out after 1s');
  await expect(page.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
});

test('response cookies are visible and sessions stay in the upstream jar',async({page,context})=>{
  await urlInput(page).fill(`${upstream}/cookies`); await send(page);
  await responsePane(page).getByRole('button',{name:/Headers \(/}).click();
  await expect(responsePane(page)).toContainText('set-cookie');
  await expect(responsePane(page)).toContainText('synthetic-session');
  expect(await context.cookies()).toEqual([]);
  await urlInput(page).fill(`${upstream}/echo`); await send(page);
  expect((await echo(page)).headers.Cookie.join(';')).toContain('session=synthetic-session');
});

test('long parameter tables scroll without hiding the response',async({page})=>{
  await urlInput(page).fill(`${upstream}/echo?${Array.from({length:24},(_,i)=>`p${i}=v${i}`).join('&')}`);
  await page.getByRole('tab',{name:/^Params/}).click();
  await page.getByPlaceholder('Value',{exact:true}).nth(23).fill('last');
  await send(page);
  const bounds=await responsePane(page).boundingBox();
  expect(bounds!.y).toBeLessThan(700); expect(bounds!.height).toBeGreaterThan(100);
  const separator=page.getByRole('separator',{name:'Resize request and response'});
  await separator.focus(); await separator.press('ArrowUp');
  await expect(separator).toHaveAttribute('aria-valuenow','33');
  await page.screenshot({path:'test-results/long-params.png'});
});

test('failed draft saves are visible and can be retried',async({page})=>{
  await page.route('**/data/drafts/**',route=>route.request().method()==='PUT'?route.fulfill({status:500,body:'disk unavailable'}):route.continue());
  await page.getByLabel('Request name',{exact:true}).fill('Recover me');
  await expect(page.getByRole('alert')).toContainText('Could not save request');
  await page.getByTitle('New request', { exact: true }).click();
  await page.getByLabel('Request name', { exact: true }).fill('Another draft');
  await page.waitForLoadState('networkidle');
  await page.unroute('**/data/drafts/**');
  await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await page.waitForLoadState('networkidle'); await page.reload();
  await expect(page.getByLabel('Request name', { exact: true })).toHaveValue('Another draft');
  await page.locator('aside').getByRole('button', { name: /Recover me/ }).click();
  await expect(page.getByLabel('Request name',{exact:true})).toHaveValue('Recover me');
});

test('failed history saves retry both executions without resending requests', async ({ page, request }) => {
  let sent = 0;
  page.on('request', request => { if (request.url().includes('/proxy/')) sent++; });
  await page.route('**/data/requests/**', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: 'disk unavailable' }) : route.continue());
  await urlInput(page).fill(`${upstream}/echo`);
  await bodyType(page, 'raw');
  for (const body of ['first', 'second']) {
    await page.locator('textarea').fill(body);
    await send(page);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('alert')).toContainText('Could not save history');
  }
  await page.unroute('**/data/requests/**');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/data/requests')).json()).length).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const entries: { id: string }[] = await (await request.get('/data/requests')).json();
  expect(entries).toHaveLength(2);
  const saved = await Promise.all(entries.map(async entry => (await request.get(`/data/requests/${entry.id}`)).json()));
  expect(saved.map(entry => entry.http.body.content).sort()).toEqual(['first', 'second']);
  expect(sent).toBe(2);
});
