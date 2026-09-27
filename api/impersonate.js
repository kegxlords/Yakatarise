// api/impersonate.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Initialize Supabase with Secret Admin Keys
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Verify the person clicking the button is actually an Admin
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Admin privileges required' });

  // 2. Generate the Magic Login Link for the target user
  const { email } = req.body;
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: email,
  });

  if (error) return res.status(500).json({ error: error.message });

  // 3. Send the link back to the frontend
  return res.status(200).json({ magic_link: data.properties.action_link });
}
