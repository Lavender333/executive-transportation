const form = document.getElementById('booking');
const $ = id => document.getElementById(id);
const config = window.TRANSPORT_CONFIG || {};
let requestId = crypto.randomUUID(), sending = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function updateDate() {
  const now = new Date();
  const zone = $('timezone').value || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  $('date').min = `${parts.year}-${parts.month}-${parts.day}`;
}
function validateText() {
  ['pickup', 'dropoff', 'customer-name'].forEach(id => $(id).setCustomValidity($(id).value.trim() ? '' : 'Please enter a value.'));
}
function clearResult() { $('confirmation').classList.remove('show'); $('confirmation').replaceChildren(); }
function headerSize() { document.documentElement.style.setProperty('--header-height', `${document.querySelector('header').offsetHeight + 8}px`); }
headerSize(); new ResizeObserver(headerSize).observe(document.querySelector('header'));
updateDate();
const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC'];
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
[...new Set([localZone, 'UTC', ...zones])].forEach(zone => $('timezone').append(new Option(zone.replaceAll('_', ' '), zone)));
$('timezone').value = localZone;
form.addEventListener('input', () => { if (sending) return; clearResult(); validateText(); updateDate(); requestId = crypto.randomUUID(); });
form.addEventListener('change', () => { if (!sending) { clearResult(); updateDate(); requestId = crypto.randomUUID(); } });
form.addEventListener('focusin', updateDate);
window.addEventListener('focus', updateDate);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !config.url || !config.functionKey) return;
  clearResult(); updateDate(); validateText();
  if (!form.reportValidity()) return;
  const value = id => $(id).value.trim();
  const payload = {
    id: requestId, customer_name: value('customer-name'), email: value('customer-email'), phone: value('customer-phone'),
    service: value('type'), pickup_date: value('date'), pickup_time: value('time'), pickup_timezone: value('timezone'),
    passengers: Number(value('passengers')), pickup: value('pickup'), destination: value('dropoff'), notes: value('notes'), consent: $('consent').checked, website: value('website')
  };
  sending = true;
  const controls = [...form.querySelectorAll('input,select,textarea,button')];
  controls.forEach(control => control.disabled = true);
  $('submit-request').textContent = 'Sending request…';
  $('booking-status').textContent = 'Sending your request…';
  try {
    const response = await fetch(config.url + '/functions/v1/submit-ride', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.functionKey, Authorization: 'Bearer ' + config.functionKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Your request could not be saved. Please try again.');
    if (data.id !== requestId || data.status !== 'received') throw new Error('We could not verify receipt. Please retry without changing your details.');
    const heading = document.createElement('strong'); heading.textContent = 'Request received — awaiting confirmation.';
    const reference = document.createElement('p'); reference.textContent = `Your reference: ${data.id}. Our team will contact you using the details you provided. Your ride is not booked until the team confirms availability and pricing.`;
    $('confirmation').append(heading, reference); $('confirmation').classList.add('show');
    form.reset(); $('timezone').value = localZone; requestId = crypto.randomUUID();
    $('booking-status').textContent = '';
    $('confirmation').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
  } catch (error) {
    $('booking-status').textContent = error.name === 'TimeoutError' || error.name === 'TypeError' ? 'We could not confirm receipt. Check your connection and retry without changing your details to avoid a duplicate request.' : error.message;
  } finally {
    sending = false; controls.forEach(control => control.disabled = false); $('submit-request').textContent = 'Send Ride Request';
  }
});
if (config.url && config.functionKey) $('submit-request').disabled = false;
else $('booking-status').textContent = 'Online booking is not connected yet. Please check back soon.';
