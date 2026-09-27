import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    await getAdminUser(req); // Ensure only admins can call this
    const { transaction_id } = req.body;

    // 1. Get the pending transaction
    const { data: tx, error: txErr } = await supabaseAdmin
      .from('transactions').select('*').eq('id', transaction_id).eq('status', 'pending').single();
      
    if (txErr || !tx) return jsonResponse(res, 404, { error: 'Transaction not found or already processed' });

    // 2. Credit User Wallet
    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance, total_deposited').eq('user_id', tx.user_id).single();

    await supabaseAdmin
      .from('wallets').update({ 
        balance: wallet.balance + tx.amount,
        total_deposited: wallet.total_deposited + tx.amount 
      }).eq('user_id', tx.user_id);

    // 3. Update Transaction Status
    await supabaseAdmin
      .from('transactions').update({ status: 'approved' }).eq('id', transaction_id);

    return jsonResponse(res, 200, { success: true, message: 'Deposit approved and wallet credited.' });

  } catch (error) {
    if (error.message.includes('Admin')) return jsonResponse(res, 403, { error: error.message });
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
