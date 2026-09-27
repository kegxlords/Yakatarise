// api/_auth.js
import { supabaseAdmin } from './_utils.js';

export async function getAuthenticatedUser(req) {
  // FIX: Use object property access instead of .get()
  const authHeader = req.headers.authorization; 
  
  if (!authHeader) throw new Error('No authorization token provided');

  const token = authHeader.replace('Bearer ', '');
  
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return user;
}

export async function getAdminUser(req) {
  const user = await getAuthenticatedUser(req);

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (error || !profile || !profile.is_admin) {
    throw new Error('Admin privileges required');
  }

  return user;
}
