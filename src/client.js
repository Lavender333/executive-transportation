import { createClient } from '@supabase/supabase-js';
export const config = window.TRANSPORT_CONFIG || {};
export const client = config.url && config.publishableKey ? createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, storage: window.sessionStorage, detectSessionInUrl: false }
}) : null;
export const $ = id => document.getElementById(id);
export function message(id, text, error = false) {
  const element = $(id);
  element.textContent = text;
  element.classList.toggle('error', error);
}
