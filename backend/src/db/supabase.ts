// Thin Supabase client factory for the Node backend.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;

/** Service-role client: used by the verify-target route and the gate's own
 *  lookups, same as the original Deno edge functions used the service role
 *  to bypass RLS directly (see recycle/migrations' comment on that). */
export function getServiceSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  }
  serviceClient = createClient(url, key);
  return serviceClient;
}
