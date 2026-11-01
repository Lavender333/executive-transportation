const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
let server, browser, baseURL;
before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve('_site', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(path.resolve('_site') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
const fakeURL = 'https://transport-test.supabase.co';
async function visit(t, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  t.after(() => page.close());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser errors'));
  await page.clock.install({ time: new Date('2030-06-15T12:00:00') });
  await page.route('**/public/backend-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.TRANSPORT_CONFIG={url:'${fakeURL}',publishableKey:'test-publishable-key',functionKey:'test-function-key'};` }));
  await page.goto(baseURL);
  return page;
}
async function fill(page) {
  await page.fill('#customer-name', 'Test Passenger'); await page.fill('#customer-email', 'customer@example.test'); await page.fill('#customer-phone', '+1 555 010 1234');
  await page.selectOption('#type', { label: 'Airport transfer' }); await page.fill('#date', '2030-06-16'); await page.fill('#time', '14:30');
  await page.fill('#pickup', 'Test airport'); await page.fill('#dropoff', 'Test hotel'); await page.check('#consent');
}
async function submit(page) { await page.locator('#submit-request').click(); }
test('Desktop and mobile navigation works without overflow', async t => {
  for (const width of [320,375,768,1440]) {
    const page = await visit(t, { viewport: { width, height: 900 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const id of ['services','experience','booking']) {
      await page.locator(`nav a[href="#${id}"]`).click();
      assert.ok(await page.evaluate(id => document.querySelector(`#${id} h2`).getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom, id));
    }
  }
});
test('The ride request starts on the opening screen', async t => {
  const page = await visit(t, { viewport: { width: 1440, height: 900 } });
  assert.equal(await page.locator('#booking').count(), 1);
  assert.ok(await page.locator('#customer-name').isVisible());
  assert.ok((await page.locator('#booking').boundingBox()).y < 900);
});
test('Customer details, valid passengers, future dates, and consent are required', async t => {
  const page = await visit(t); let requests = 0;
  await page.route(fakeURL + '/**', route => { requests++; return route.abort(); });
  await submit(page); assert.equal(requests, 0);
  await fill(page);
  for (const value of ['0','31','1.5']) { await page.fill('#passengers', value); await submit(page); assert.equal(requests, 0); }
  await page.fill('#passengers', '1'); await page.fill('#date', '2030-06-14'); await submit(page); assert.equal(requests, 0);
  await page.fill('#date', '2030-06-16'); await page.fill('#pickup', ' '); await submit(page); assert.equal(requests, 0);
  await page.fill('#pickup', 'Airport'); await page.uncheck('#consent'); await submit(page); assert.equal(requests, 0);
});
test('All service requests send their details and only show success after receipt', async t => {
  const page = await visit(t, { viewport: { width: 375, height: 812 } }); const received = [];
  await page.route(fakeURL + '/functions/v1/submit-ride', async route => {
    const payload = route.request().postDataJSON(); received.push(payload);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: payload.id, status: 'received' }) });
  });
  const services = (await page.locator('#type option').allTextContents()).slice(1);
  for (const service of services) {
    await fill(page); await page.selectOption('#type', { label: service }); await page.fill('#notes', '<img src=x onerror=alert(1)> Flight AB123');
    await submit(page); await page.locator('#confirmation.show').waitFor();
    assert.ok((await page.locator('#confirmation').innerText()).includes('awaiting confirmation'));
    assert.equal(received.at(-1).service, service); assert.equal(received.at(-1).notes, '<img src=x onerror=alert(1)> Flight AB123');
    assert.equal(received.at(-1).customer_name, 'Test Passenger');
    assert.equal(await page.locator('#confirmation img').count(), 0);
  }
  assert.equal(received.length, 6);
});
test('Failed requests retain fields and retry with the same reference', async t => {
  const page = await visit(t); const ids = [];
  await page.route(fakeURL + '/functions/v1/submit-ride', async route => {
    ids.push(route.request().postDataJSON().id);
    await route.fulfill({ status: ids.length === 1 ? 503 : 201, contentType: 'application/json', body: JSON.stringify(ids.length === 1 ? { error: 'Temporary failure' } : { id: ids.at(-1), status: 'received' }) });
  });
  await fill(page); await submit(page);
  await page.waitForFunction(() => document.getElementById('booking-status').textContent === 'Temporary failure');
  assert.equal(await page.inputValue('#customer-name'), 'Test Passenger');
  assert.equal(await page.locator('#confirmation').isVisible(), false);
  await submit(page); await page.locator('#confirmation.show').waitFor(); assert.equal(ids[0], ids[1]);
});
test('Unconfigured and JavaScript-disabled forms cannot pretend to accept requests', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.route('**/public/backend-config.js', route => route.fulfill({contentType:'text/javascript',body:'window.TRANSPORT_CONFIG={};'}));
  await page.goto(baseURL);
  assert.equal(await page.locator('#submit-request').isDisabled(), true);
  assert.ok((await page.locator('#booking-status').innerText()).includes('not connected'));
  const disabled = await browser.newPage({ javaScriptEnabled: false }); t.after(() => disabled.close()); await disabled.goto(baseURL);
  assert.equal(await disabled.locator('#submit-request').isDisabled(), true); assert.equal(await disabled.locator('noscript').isVisible(), true);
});
const ride = { id:'f1db366b-20cd-42ca-b22c-ddf7c9fec55a', customer_name:'Test Passenger', email:'customer@example.test', phone:'5550101234', service:'Airport transfer', pickup_date:'2030-06-16', pickup_time:'14:30:00', pickup_timezone:'America/New_York', passengers:2, pickup:'Test airport', destination:'Test hotel', notes:'Flight AB123', status:'pending', driver_id:null, staff_notes:'', created_at:'2030-06-15T10:00:00Z', updated_at:'2030-06-15T10:00:00Z' };
async function mockStaff(page, authorized = true) {
  const payload = Buffer.from(JSON.stringify({ sub:'11111111-1111-4111-8111-111111111111', role:'authenticated', email:'staff@example.test', exp:2200000000 })).toString('base64url');
  const access_token = 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.mock-signature';
  const state = { rows:[{...ride}], drivers:[], patches:[] };
  await page.route(fakeURL + '/**', async route => {
    const request = route.request(), url = new URL(request.url()); const method = request.method();
    let body = [], status = 200;
    if (url.pathname.includes('/auth/v1/token')) body = { access_token, token_type:'bearer', expires_in:3600, refresh_token:'test-refresh-token', user:{id:'11111111-1111-4111-8111-111111111111',email:'staff@example.test'} };
    else if (url.pathname.includes('/auth/v1/logout')) body = {};
    else if (url.pathname.includes('/rest/v1/staff_access')) body = authorized ? [{ email:'staff@example.test' }] : [];
    else if (url.pathname.includes('/rest/v1/drivers')) {
      if (method === 'POST') { const data = request.postDataJSON(); state.drivers.push({ ...data,id:'22222222-2222-4222-8222-222222222222',active:true,updated_at:'2030-06-15T11:00:00Z' }); }
      body = state.drivers;
    } else if (url.pathname.includes('/rest/v1/ride_requests')) {
      if (method === 'PATCH') { const patch = request.postDataJSON(); state.patches.push(patch); Object.assign(state.rows[0],patch,{updated_at:'2030-06-15T12:00:00Z'}); }
      body = state.rows;
      if (method === 'HEAD') return route.fulfill({ status:200,headers:{'content-range':`0-0/${state.rows.filter(row => 'eq.' + row.status === url.searchParams.get('status')).length}`,'access-control-expose-headers':'content-range'},body:'' });
    } else { status = 404; body = { error:'Unexpected test endpoint' }; }
    await route.fulfill({ status,contentType:'application/json',body:JSON.stringify(body) });
  });
  return state;
}
async function login(page) { await page.goto(baseURL+'dashboard.html'); await page.fill('#email','staff@example.test'); await page.fill('#password','test-password-only'); await page.locator('#login-form button').click(); }
test('Staff can receive, confirm, assign, and sign out of the dashboard', async t => {
  const page = await visit(t); const state = await mockStaff(page);
  await login(page); await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('.request').click(); assert.ok((await page.locator('#details').innerText()).includes('Flight AB123')); assert.equal(await page.locator('#driver-link').isDisabled(),true);
  await page.selectOption('#request-status','confirmed'); await page.locator('#request-form button').click();
  await page.waitForFunction(() => document.getElementById('request-message').textContent.startsWith('Saved.'));
  assert.equal(state.patches[0].status,'confirmed');
  await page.fill('#driver-name','Test Driver'); await page.fill('#driver-phone','5550105678'); await page.fill('#driver-vehicle','Sedan / TEST'); await page.locator('#driver-form button').click();
  await page.locator('#drivers .driver').waitFor();
  await page.selectOption('#request-status','assigned'); await page.selectOption('#assigned-driver','22222222-2222-4222-8222-222222222222'); await page.locator('#request-form button').click();
  await page.waitForFunction(() => document.getElementById('request-message').textContent.startsWith('Saved.'));
  assert.equal(state.patches.at(-1).driver_id,'22222222-2222-4222-8222-222222222222');
  assert.equal(await page.locator('#driver-link').isDisabled(),false);
  assert.equal(await page.locator('#assigned-count').innerText(),'1');
  if (process.env.DASHBOARD_SCREENSHOT) await page.screenshot({path:process.env.DASHBOARD_SCREENSHOT,fullPage:true});
  await page.locator('#logout').click(); assert.equal(await page.locator('#workspace').isVisible(),false); assert.equal(await page.locator('#requests').innerText(),'');
});
test('Unauthorized users are refused, and mobile dashboard fits', async t => {
  const page = await visit(t,{ viewport:{width:375,height:812} }); await mockStaff(page,false); await login(page);
  await page.waitForFunction(() => document.getElementById('login-message').textContent.includes('not authorized'));
  assert.equal(await page.locator('#workspace').isVisible(),false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});
test('Demo login is isolated from production and can practice dispatch', async t => {
  const page=await visit(t);let calls=0;await page.route(fakeURL+'/**',route=>{calls++;return route.abort();});
  await page.goto(baseURL+'demo.html');await page.fill('#email','demo@example.test');await page.fill('#password','demo123');await page.locator('#login-form button').click();
  await page.locator('#workspace').waitFor({state:'visible'});await page.locator('.request').click();await page.selectOption('#request-status','assigned');await page.selectOption('#assigned-driver','demo-driver');await page.locator('#request-form button').click();
  await page.waitForFunction(()=>document.getElementById('request-message').textContent.startsWith('Saved.'));
  assert.ok((await page.locator('.request').textContent()).includes('Driver assigned'),await page.locator('.request').innerText());
  await page.locator('#driver-link').click();assert.ok((await page.locator('#driver-link-result').innerText()).includes('never reads or sends your location'));
  await page.locator('#logout').click();
  await page.fill('#email','demo@example.test');await page.fill('#password','demo123');await page.locator('#login-form button').click();
  await page.waitForFunction(()=>document.querySelector('.request')?.textContent.includes('Awaiting review'));
  assert.equal(calls,0);
});
test('Customer tracking shows genuine update timestamps and stale location labels',async t=>{
  const page=await visit(t);let stale=false;
  await page.route(fakeURL+'/functions/v1/track-ride',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'assigned',driver:{name:'Test',vehicle:'Test sedan'},location:{lat:40.75,lng:-73.98,accuracy:15,updated_at:stale?'2030-06-15T10:00:00':'2030-06-15T12:00:00'}})}));
  await page.goto(baseURL+'track.html#id='+ride.id+'&token='+'a'.repeat(64));
  await page.waitForFunction(()=>document.getElementById('location-details').textContent.includes('Live location'));
  assert.ok((await page.locator('#map-link').getAttribute('href')).includes('openstreetmap.org'));
  stale=true;await page.locator('#refresh-tracking').click();await page.waitForFunction(()=>document.getElementById('location-details').textContent.includes('not live'));
});
test('Drivers explicitly start and stop location sharing',async t=>{
  const page=await visit(t,{geolocation:{latitude:40.75,longitude:-73.98},permissions:['geolocation']});const sent=[];
  await page.route(fakeURL+'/functions/v1/track-ride',route=>{sent.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:'{"saved":true}'});});
  await page.goto(baseURL+'driver.html#id='+ride.id+'&token='+'b'.repeat(64));assert.equal(sent.length,0);
  await page.locator('#start-sharing').click();await page.waitForFunction(()=>document.getElementById('tracking-message').textContent.includes('is active'));
  assert.equal(sent[0].action,'location');assert.equal(sent[0].lat,40.75);
  await page.locator('#stop-sharing').click();assert.equal(await page.locator('#start-sharing').isEnabled(),true);assert.ok((await page.locator('#tracking-message').innerText()).includes('stopped'));
});
