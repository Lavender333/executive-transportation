import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { validateRequest } from './validation.mjs';
const allowedOrigin = 'https://lavender333.github.io';
const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== allowedOrigin) return reply({ error: 'Origin not allowed.' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'JSON required.' }, 415);
  try {
    // Enforce the limit while reading too: Content-Length may be absent or untrusted.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Request body required.' }, 400);
    let length = 0, raw = ''; const decoder = new TextDecoder();
    while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 12000) { await reader.cancel(); return reply({ error: 'Request too large.' }, 413); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode();
    let ride;
    try { ride = validateRequest(JSON.parse(raw)); } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Invalid request.' }, 400); }
    const trackingToken = ride.tracking_token;
    delete ride.tracking_token;
    ride.customer_token_hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(trackingToken)))).map(b => b.toString(16).padStart(2, '0')).join('');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    // Salted identifiers limit repeat submissions without storing raw network addresses.
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + value)))).map(b => b.toString(16).padStart(2, '0')).join('');
    const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
    for (const identity of ['email:' + ride.email, 'network:' + ip]) {
      const { data, error } = await db.rpc('consume_request_limit', { key_hash: await hash(identity) });
      if (error) return reply({ error: 'Booking is temporarily unavailable. Please try again later.' }, 503);
      if (!data) return reply({ error: 'Too many requests. Please try again in an hour.' }, 429);
    }
    const { error } = await db.from('ride_requests').insert(ride);
    // A retry with the same client-generated UUID must never create a duplicate.
    if (error?.code === '23505') {
      const { data: previous, error: readError } = await db.from('ride_requests').select('*').eq('id', ride.id).single();
      if (readError || !previous || Object.entries(ride).some(([key, value]) => key === 'pickup_time' ? previous[key].slice(0, 5) !== value : previous[key] !== value)) {
        return reply({ error: 'This reference was already used. Reload the form before submitting a different request.' }, 409);
      }
    } else if (error) return reply({ error: 'Your request could not be saved. Please try again.' }, 503);
    return reply({ id: ride.id, status: 'received' }, 201);
  } catch { return reply({ error: 'Your request could not be saved. Please try again.' }, 503); }
});
