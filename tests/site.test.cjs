const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { chromium } = require('playwright');
let server, browser, baseURL;
before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(require('node:path').join(__dirname, '../index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = process.env.SITE_URL || `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function visit(t, options = {}) {
  const page = await browser.newPage(options);
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser errors'));
  await page.clock.install({ time: new Date('2030-06-15T12:00:00') });
  const response = await page.goto(baseURL);
  assert.equal(response.status(), 200);
  return page;
}
async function fill(page) {
  await page.selectOption('#type', { label: 'Airport transfer' });
  await page.fill('#date', '2030-06-16');
  await page.fill('#time', '14:30');
  await page.fill('#pickup', 'Airport terminal 1');
  await page.fill('#dropoff', 'Downtown hotel');
}
async function submit(page) { await page.locator('button[type=submit]').click(); }
async function visible(page) { return page.locator('#confirmation').isVisible(); }

test('Desktop and mobile layouts fit, and navigation targets clear the sticky header', async t => {
  for (const width of [320, 375, 768, 1440]) {
    const page = await visit(t, { viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    for (const target of ['services', 'experience', 'request']) {
      await page.locator(`nav a[href="#${target}"]`).click();
      await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top) < innerHeight, target);
      const bounds = await page.evaluate(id => ({
        heading: document.querySelector(`#${id} h2`).getBoundingClientRect().top,
        header: document.querySelector('header').getBoundingClientRect().bottom
      }), target);
      assert.ok(bounds.heading >= bounds.header, `Heading obscured at ${width}px: ${target}`);
    }
  }
});
test('Required fields, passenger limits, and past dates are rejected', async t => {
  const page = await visit(t);
  await submit(page);
  assert.equal(await visible(page), false);
  await fill(page);
  for (const number of ['0', '31', '1.5']) {
    await page.fill('#passengers', number);
    await submit(page);
    assert.equal(await visible(page), false);
  }
  await page.fill('#passengers', '1');
  await page.fill('#date', '2030-06-14');
  await submit(page);
  assert.equal(await visible(page), false);
});
test('Whitespace-only locations are rejected', async t => {
  const page = await visit(t);
  await fill(page);
  for (const id of ['pickup', 'dropoff']) {
    await page.fill(`#${id}`, '   ');
    await submit(page);
    assert.equal(await visible(page), false);
    await page.fill(`#${id}`, 'Valid location');
  }
});
test('Summary includes notes as plain text without sending or storing data', async t => {
  const page = await visit(t);
  await fill(page);
  const payload = '<img src=x onerror=alert(1)> Flight AB123';
  await page.fill('#notes', payload);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await submit(page);
  assert.equal(await visible(page), true);
  const summary = await page.locator('#confirmation').innerText();
  for (const value of ['no reservation has been submitted', 'Airport transfer', '2030-06-16', '14:30', 'Airport terminal 1', 'Downtown hotel', payload]) assert.ok(summary.includes(value), value);
  assert.equal(await page.locator('#confirmation img').count(), 0);
  assert.deepEqual(requests, []);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(await page.context().cookies(), []);
});
test('Editing a request clears its obsolete summary', async t => {
  const page = await visit(t);
  await fill(page);
  await submit(page);
  await page.fill('#pickup', 'New airport');
  assert.equal(await visible(page), false);
  await submit(page);
  assert.ok((await page.locator('#confirmation').innerText()).includes('New airport'));
});
test('The minimum pickup date refreshes when the page stays open overnight', async t => {
  const page = await visit(t);
  await fill(page);
  await page.fill('#date', '2030-06-15');
  await page.clock.setSystemTime(new Date('2030-06-16T12:00:00'));
  await submit(page);
  assert.equal(await visible(page), false);
  assert.equal(await page.locator('#date').getAttribute('min'), '2030-06-16');
});
test('Every service previews correctly on a phone', async t => {
  const page = await visit(t, { viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await fill(page);
  const services = await page.locator('#type option').allTextContents();
  for (const service of services.slice(1)) {
    await page.selectOption('#type', { label: service });
    await submit(page);
    assert.equal(await visible(page), true);
    assert.ok((await page.locator('#confirmation').innerText()).includes(service));
  }
});
test('No-JavaScript visitors see an explanation and cannot submit', async t => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  t.after(() => page.close());
  await page.goto(baseURL);
  assert.equal(await page.locator('noscript').isVisible(), true);
  assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
});
test('The date minimum uses the visitor local calendar in both timezone directions', async t => {
  for (const timezoneId of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    const page = await visit(t, { timezoneId });
    await page.clock.setSystemTime(new Date('2030-06-15T23:30:00Z'));
    await page.locator('#date').focus();
    const expected = timezoneId === 'Pacific/Kiritimati' ? '2030-06-16' : '2030-06-15';
    assert.equal(await page.locator('#date').getAttribute('min'), expected);
  }
});
