import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    await getAdminUser(req); // Ensure only admins can do this
    const { email } = req.body;

    // Use Supabase Admin API to generate a magic link for the user
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (error) throw error;

    // Return the link so the frontend can open it
    return jsonResponse(res, 200, { magic_link: data.properties.action_link });

  } catch (error) {
    if (error.message.includes('Admin')) return jsonResponse(res, 403, { error: error.message });
    return jsonResponse(res, 500, { error: 'Failed to generate link' });
  }
}
