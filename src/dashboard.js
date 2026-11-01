import { client, config, isDemo, $, message } from './client.js';
let requests = [], drivers = [], selected = null, pageNumber = 0, hasMore = false, sessionVersion = 0, realtimeChannel = null, reloadTimer = null;
const PAGE_SIZE = 50;
const displayStatus = { pending: 'Awaiting review', confirmed: 'Confirmed', assigned: 'Driver assigned', completed: 'Completed', cancelled: 'Cancelled' };
const element = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
function resetWorkspace() {
  sessionVersion++;
  if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
  if (realtimeChannel) { client.removeChannel(realtimeChannel); realtimeChannel = null; }
  requests = []; drivers = []; selected = null;
  $('requests').replaceChildren(); $('drivers').replaceChildren(); $('details').replaceChildren();
  $('staff-notes').value = '';
  $('detail-content').hidden = true; $('detail-empty').hidden = false;
  $('workspace').hidden = true; $('logout').hidden = true; $('setup-panel').hidden = true;
  $('login-panel').hidden = false;
}
function scheduleLiveRefresh() {
  if (reloadTimer) return;
  reloadTimer = setTimeout(async () => {
    reloadTimer = null;
    if (!document.hidden && !selected) await Promise.all([loadRequests(), loadDrivers()]);
  }, 400);
}
function subscribeToLiveUpdates() {
  if (isDemo || !config.realtime || realtimeChannel || typeof client.channel !== 'function') return;
  realtimeChannel = client.channel('staff-dispatch-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests' }, scheduleLiveRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, scheduleLiveRefresh)
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        message('workspace-message', 'Live updates are temporarily unavailable. Use Refresh requests to check for new arrivals.', true);
      }
    });
}
async function loadRequests(append = false) {
  const version = sessionVersion;
  message('workspace-message', 'Loading requests…');
  const status = $('status-filter').value;
  let query = client.from('ride_requests').select('*').order('created_at', { ascending: false }).order('id');
  if (status) query = query.eq('status', status);
  const nextPage = append ? pageNumber + 1 : 0;
  const { data, error } = await query.range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
  if (version !== sessionVersion) return;
  if (error) { message('workspace-message', 'Could not load requests. Try refreshing or signing in again.', true); return; }
  requests = append ? requests.concat(data) : data;
  pageNumber = nextPage; hasMore = data.length === PAGE_SIZE;
  renderRequests();
  message('workspace-message', 'Requests refreshed. Use Refresh requests to check for new arrivals.');
  const counts = await Promise.all(['pending', 'confirmed', 'assigned'].map(status => client.from('ride_requests').select('id', { count: 'exact', head: true }).eq('status', status)));
  if (version !== sessionVersion) return;
  ['pending', 'confirmed', 'assigned'].forEach((status, index) => { $(status + '-count').textContent = counts[index].error ? '—' : (counts[index].count ?? '—'); });
}
function renderRequests() {
  const search = $('search').value.trim().toLowerCase();
  const rows = requests.filter(row => [row.customer_name, row.email, row.pickup, row.destination, row.id].join(' ').toLowerCase().includes(search));
  $('requests').replaceChildren();
  for (const row of rows) {
    const button = element('button', '', 'request'); button.type = 'button';
    button.setAttribute('aria-pressed', String(row.id === selected?.id));
    const heading = element('div', '', 'row between');
    heading.append(element('strong', row.customer_name), element('span', displayStatus[row.status], 'badge ' + row.status));
    button.append(heading, element('div', `${row.pickup} → ${row.destination}`), element('small', `${row.pickup_date} at ${row.pickup_time.slice(0, 5)} (${row.pickup_timezone}) · ${row.passengers} passenger(s)`));
    button.addEventListener('click', () => selectRequest(row));
    $('requests').append(button);
  }
  message('list-message', rows.length ? `${rows.length} request(s) shown${hasMore ? '. Load more to search older requests.' : '.'}` : 'No matching requests.');
  $('load-more').hidden = !hasMore;
}
function selectRequest(row) {
  selected = row;
  $('detail-content').hidden = false; $('detail-empty').hidden = true;
  $('details').replaceChildren();
  const entries = [
    ['Reference', row.id], ['Customer', row.customer_name], ['Email', row.email], ['Phone', row.phone],
    ['Service', row.service], ['Pickup', `${row.pickup_date} at ${row.pickup_time.slice(0, 5)} (${row.pickup_timezone})`],
    ['Route', `${row.pickup} → ${row.destination}`], ['Passengers', String(row.passengers)], ['Trip notes', row.notes || 'None'],
    ['Received', new Date(row.created_at).toLocaleString()]
  ];
  for (const [label, value] of entries) $('details').append(element('dt', label), element('dd', value));
  $('request-status').value = row.status;
  $('staff-notes').value = row.staff_notes;
  updateDriverOptions();
  message('request-message', '');
  $('driver-link-result').replaceChildren();
  renderRequests();
  if (matchMedia('(max-width:800px)').matches) $('detail-panel').scrollIntoView({ block: 'start' });
}
function updateDriverOptions() {
  $('assigned-driver').replaceChildren(new Option('Not assigned', ''));
  drivers.filter(driver => driver.active || driver.id === selected?.driver_id).forEach(driver => {
    $('assigned-driver').append(new Option(`${driver.name} · ${driver.vehicle}${driver.active ? '' : ' (inactive)'}`, driver.id));
  });
  $('assigned-driver').value = selected?.driver_id || '';
}
async function loadDrivers() {
  const version = sessionVersion;
  const { data, error } = await client.from('drivers').select('*').order('name');
  if (version !== sessionVersion) return;
  if (error) { message('driver-message', 'Could not load drivers. Refresh the page to try again.', true); return; }
  drivers = data;
  $('drivers').replaceChildren();
  for (const driver of drivers) {
    const card = element('div', '', 'driver');
    card.append(element('strong', driver.name), element('small', `${driver.vehicle} · ${driver.phone}`));
    const label = element('label', '', 'check');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = driver.active;
    checkbox.setAttribute('aria-label', `Available for new assignments: ${driver.name}`);
    label.append(checkbox, document.createTextNode('Available for new assignments'));
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      const result = await client.from('drivers').update({ active: checkbox.checked }).eq('id', driver.id).eq('updated_at', driver.updated_at).select('id');
      if (result.error || !result.data?.length) message('driver-message', 'Driver was not updated. Refresh and try again.', true);
      await loadDrivers();
    });
    card.append(label); $('drivers').append(card);
  }
  updateDriverOptions();
}
async function openWorkspace() {
  const version = sessionVersion;
  const { data, error } = await client.from('staff_access').select('email').limit(1);
  if (version !== sessionVersion) return;
  if (error || !data?.length) {
    await client.auth.signOut({ scope: 'local' }); resetWorkspace();
    message('login-message', 'This account is not authorized for the staff dashboard.', true); return;
  }
  $('login-panel').hidden = true; $('setup-panel').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  await Promise.all([loadRequests(), loadDrivers()]);
  subscribeToLiveUpdates();
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) return;
  const button = event.submitter; button.disabled = true;
  message('login-message', 'Signing in…');
  try {
    const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('password').value = '';
    if (error) { message('login-message', 'Sign-in failed. Check your email and password and try again.', true); return; }
    message('login-message', ''); await openWorkspace();
  } catch { message('login-message', 'Unable to connect. Please try again.', true); }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  resetWorkspace();
  await client.auth.signOut({ scope: 'local' });
  message('login-message', 'Signed out.');
});
$('setup-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('new-password').value !== $('repeat-password').value) { message('setup-message', 'Passwords do not match.', true); return; }
  const button = event.submitter; button.disabled = true;
  try {
    const { error } = await client.auth.updateUser({ password: $('new-password').value });
    if (error) { message('setup-message', 'Password could not be saved. Try a stronger password or request a new setup link.', true); return; }
    $('setup-form').reset(); await openWorkspace();
  } catch { message('setup-message', 'Unable to connect. Please try again.', true); }
  finally { button.disabled = false; }
});
$('refresh').addEventListener('click', async () => {
  selected = null; $('detail-content').hidden = true; $('detail-empty').hidden = false;
  await Promise.all([loadRequests(), loadDrivers()]);
});
$('status-filter').addEventListener('change', () => loadRequests());
$('search').addEventListener('input', renderRequests);
$('load-more').addEventListener('click', () => loadRequests(true));
$('request-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected) return;
  const current = selected;
  const status = $('request-status').value, driverId = $('assigned-driver').value || null;
  if (['assigned', 'completed'].includes(status) && !driverId) { message('request-message', 'Choose a driver before assigning or completing this trip.', true); return; }
  if (status === 'pending' && driverId) { message('request-message', 'Confirm this request before assigning a driver.', true); return; }
  if (driverId && status === 'confirmed') { message('request-message', 'Choose “Driver assigned” to save a driver assignment.', true); return; }
  const button = event.submitter; button.disabled = true;
  message('request-message', 'Saving changes…');
  try {
    const { data, error } = await client.from('ride_requests').update({ status, driver_id: driverId, staff_notes: $('staff-notes').value.trim() }).eq('id', current.id).eq('updated_at', current.updated_at).select('*');
    if (error || !data?.length) { message('request-message', 'Not saved. This request may have changed, or your session expired. Refresh before trying again.', true); return; }
    await loadRequests();
    selectRequest(data[0]); message('request-message', 'Saved. Contact the customer and driver directly with the updated arrangements.');
  } catch { message('request-message', 'Unable to connect. Your changes were not confirmed; refresh before retrying.', true); }
  finally { button.disabled = false; }
});
$('driver-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('driver-name').value.trim(), phone = $('driver-phone').value.trim(), vehicle = $('driver-vehicle').value.trim();
  if (!name || !vehicle || phone.length < 7) { message('driver-message', 'Enter a driver name, phone number, and vehicle.', true); return; }
  const button = event.submitter; button.disabled = true;
  try {
    const { error } = await client.from('drivers').insert({ name, phone, vehicle });
    if (error) { message('driver-message', 'Could not add the driver. Please try again.', true); return; }
    $('driver-form').reset(); message('driver-message', 'Driver added.'); await loadDrivers();
  } catch { message('driver-message', 'Unable to connect. Refresh before trying again.', true); }
  finally { button.disabled = false; }
});
async function init() {
  if (!client) { message('login-message', 'The booking dashboard is not connected yet. Please contact the site administrator.', true); $('login-form').querySelector('button').disabled = true; return; }
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') resetWorkspace(); });
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('error_description')) {
    history.replaceState(null, '', location.pathname + location.search);
    message('login-message', 'This invitation or reset link is invalid or expired. Request a new one from the site administrator.', true);
    return;
  }
  if (params.has('access_token') && params.has('refresh_token') && ['invite', 'recovery'].includes(params.get('type'))) {
    history.replaceState(null, '', location.pathname + location.search);
    const { error } = await client.auth.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token') });
    if (error) { message('login-message', 'This invitation is invalid or expired. Request a new one.', true); return; }
    $('login-panel').hidden = true; $('setup-panel').hidden = false; return;
  }
  if (params.has('setup')) {
    history.replaceState(null, '', location.pathname + location.search);
    const { error } = await client.auth.verifyOtp({ token_hash: params.get('setup'), type: params.get('type') === 'recovery' ? 'recovery' : 'invite' });
    if (error) { message('login-message', 'This setup link is invalid or expired. Request a new one from the site administrator.', true); return; }
    $('login-panel').hidden = true; $('setup-panel').hidden = false; return;
  }
  const { data: { session } } = await client.auth.getSession();
  if (session) await openWorkspace();
}
init().catch(() => message('login-message', 'Unable to connect. Reload the page to try again.', true));

$('driver-link').addEventListener('click', async () => {
  if (isDemo) { message('driver-link-result', 'Driver location sharing is available only for real assigned trips. This demo never reads or sends your location.'); return; }
  if (!selected || selected.status !== 'assigned') { message('driver-link-result', 'Assign a driver and save first.', true); return; }
  $('driver-link').disabled = true;
  try {
    const { data: { session } } = await client.auth.getSession();
    const response = await fetch(config.url + '/functions/v1/track-ride', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.functionKey, Authorization: 'Bearer ' + config.functionKey }, body: JSON.stringify({ action: 'driver-link', id: selected.id, staff_token: session?.access_token }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to create link.');
    const link = document.createElement('a');
    link.href = new URL('driver.html', location.href).href + '#' + new URLSearchParams({ id: selected.id, token: result.token });
    link.textContent = 'Open private driver location-sharing page';
    $('driver-link-result').replaceChildren(link, document.createTextNode(' — Copy this link and send it only to the assigned driver. Creating a new link disables the previous one.'));
  } catch (error) { message('driver-link-result', error.message, true); }
  finally { $('driver-link').disabled = false; }
});
