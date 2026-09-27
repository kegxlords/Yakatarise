import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    await getAdminUser(req);
    const { transaction_id } = req.body;

    const { data: tx, error: txErr } = await supabaseAdmin
      .from('transactions').select('*').eq('id', transaction_id).eq('status', 'pending').eq('type', 'withdrawal').single();
      
    if (txErr || !tx) return jsonResponse(res, 404, { error: 'Withdrawal request not found' });

    // Note: Balance was already deducted when the user REQUESTED the withdrawal.
    // We just need to mark it as approved/paid.
    await supabaseAdmin
      .from('transactions').update({ status: 'approved' }).eq('id', transaction_id);

    // Update total_withdrawn in wallet
    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('total_withdrawn').eq('user_id', tx.user_id).single();
      
    await supabaseAdmin
      .from('wallets').update({ total_withdrawn: wallet.total_withdrawn + tx.amount })
      .eq('user_id', tx.user_id);

    return jsonResponse(res, 200, { success: true, message: 'Withdrawal marked as paid.' });

  } catch (error) {
    if (error.message.includes('Admin')) return jsonResponse(res, 403, { error: error.message });
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
