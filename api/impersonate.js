import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Service Role Key in Vercel' });
  }

  // 1. Verify Admin
  // Inside api/impersonate.js
// Change this:
// const authHeader = req.headers.get('authorization');

// To this:
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Admin privileges required' });

  // 2. Generate Link
  const { email } = req.body;
  
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery', 
    email: email,
    options: {
      // THIS IS THE FIX: Force the link to redirect to your live dashboard
      redirectTo: 'https://yakatarise.vercel.app/dashboard.html' 
    }
  });

  if (error) return res.status(500).json({ error: error.message });

  const link = data.properties?.action_link || data.action_link;
  return res.status(200).json({ magic_link: link });
}
