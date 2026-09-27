import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    await getAdminUser(req); // Ensure only admins can do this
    const { user_id, action, amount, reason } = req.body;

    // 1. Get current wallet
    const { data: wallet, error: wErr } = await supabaseAdmin
      .from('wallets').select('balance').eq('user_id', user_id).single();
    if (wErr) throw wErr;

    let newBalance = wallet.balance;
    if (action === 'credit') newBalance += amount;
    else if (action === 'debit') newBalance -= amount;

    if (newBalance < 0) return jsonResponse(res, 400, { error: 'Insufficient funds for debit' });

    // 2. Update Wallet
    await supabaseAdmin.from('wallets').update({ balance: newBalance }).eq('user_id', user_id);

    // 3. Create Transaction Record
    await supabaseAdmin.from('transactions').insert({
      user_id: user_id,
      type: 'admin_adjustment',
      amount: action === 'credit' ? amount : -amount,
      status: 'completed',
      description: `Admin ${action}: ${reason}`
    });

    return jsonResponse(res, 200, { success: true });

  } catch (error) {
    if (error.message.includes('Admin')) return jsonResponse(res, 403, { error: error.message });
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
