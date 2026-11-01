const { test } = require('node:test');
const assert = require('node:assert/strict');
const valid = { tracking_token: "a".repeat(64), id: 'f1db366b-20cd-42ca-b22c-ddf7c9fec55a', customer_name: ' Test Passenger ', email: 'TEST@example.test', phone: '+1 555 010 1234', service: 'Airport transfer', pickup_date: '2030-06-16', pickup_time: '14:30', pickup_timezone: 'America/New_York', passengers: 2, pickup: 'Test airport', destination: 'Test hotel', notes: '<img src=x>', consent: true, website: '' };
test('Server validates customer requests and ignores privileged fields', async () => {
  const { validateRequest } = await import('../supabase/functions/submit-ride/validation.mjs');
  const now = new Date('2030-06-15T12:00:00Z');
  const result = validateRequest({ ...valid, status: 'confirmed', driver_id: 'not-allowed', staff_notes: 'not-allowed' }, now);
  assert.equal(result.customer_name, 'Test Passenger'); assert.equal(result.email, 'test@example.test');
  assert.equal(result.status, undefined); assert.equal(result.driver_id, undefined); assert.equal(result.staff_notes, undefined);
  for (const overrides of [{ pickup: ' ' }, { customer_name: ' ' }, { email: 'bad' }, { phone: 'letters only' }, { passengers: 0 }, { passengers: 31 }, { passengers: 1.5 }, { service: 'fake' }, { pickup_date: '2030-02-30' }, { pickup_date: '2030-06-14' }, { pickup_date: '2032-06-14' }, { pickup_time: '25:00' }, { pickup_timezone: 'invalid' }, { consent: false }, { website: 'spam' }, { notes: 'a'.repeat(601) }]) {
    assert.throws(() => validateRequest({ ...valid, ...overrides }, now), Error, JSON.stringify(overrides));
  }
});
