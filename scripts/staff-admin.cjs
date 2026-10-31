// Run locally with server credentials in the environment, never in frontend config.
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const type = process.argv.includes('--recovery') ? 'recovery' : 'invite';
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_URL } = process.env;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DASHBOARD_URL) throw new Error('Provide a staff email and set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DASHBOARD_URL.');
  const url = new URL(DASHBOARD_URL); if (url.protocol !== 'https:') throw new Error('Use an HTTPS dashboard URL.');
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.hashed_token) throw new Error('Unable to generate a setup link. For an existing account, use --recovery.');
  const { error: membershipError } = await db.from('staff_access').upsert({ email });
  if (membershipError) throw new Error('Unable to grant staff access. Check the database setup.');
  url.hash = new URLSearchParams({ setup: data.properties.hashed_token, type }).toString();
  console.log('Private, one-time staff setup link. Share only with the intended staff member:');
  console.log(url.href);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
