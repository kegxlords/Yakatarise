import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// This client bypasses Row Level Security (RLS) because it uses the Service Role Key.
// It should ONLY be used in backend API routes, never in the frontend.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const jsonResponse = (res, status, data) => {
  return res.status(status).json(data);
};
