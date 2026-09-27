import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Initialize with SERVICE ROLE KEY (Crucial)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Service Role Key in Vercel' });
  }

  // 2. Verify Admin
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Admin privileges required' });

  // 3. Generate Link
  const { email } = req.body;
  
  // Use 'recovery' type to ensure a link is returned immediately
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery', 
    email: email,
  });

  if (error) return res.status(500).json({ error: error.message });

  // 4. Return the link
  const link = data.properties?.action_link || data.action_link;
  return res.status(200).json({ magic_link: link });
}
