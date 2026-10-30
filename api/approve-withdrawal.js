import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';
import { createMgmPayout } from './mgm.js';

async function getWithdrawalMode() {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'withdrawal_mode').maybeSingle();
  return data?.value === 'gateway' ? 'gateway' : 'manual';
}

async function addTotalWithdrawn(userId, amount) {
  const { data: wallet, error } = await supabaseAdmin.from('wallets').select('total_withdrawn').eq('user_id', userId).single();
  if (error || !wallet) throw new Error('Wallet not found while finalizing withdrawal');
  const { error: updateError } = await supabaseAdmin.from('wallets').update({ total_withdrawn: Number(wallet.total_withdrawn || 0) + Number(amount) }).eq('user_id', userId);
  if (updateError) throw updateError;
}

async function rejectWithdrawal(transactionId) {
  const { data: tx, error: txError } = await supabaseAdmin.from('transactions').select('*').eq('id', transactionId).eq('type', 'withdrawal').eq('status', 'pending').single();
  if (txError || !tx) return { status: 404, error: 'Pending withdrawal not found' };
  const { data: wallet, error: walletError } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', tx.user_id).single();
  if (walletError || !wallet) return { status: 500, error: 'Wallet not found; withdrawal was not changed' };
  const { error: refundError } = await supabaseAdmin.from('wallets').update({ balance: Number(wallet.balance || 0) + Number(tx.amount) }).eq('user_id', tx.user_id);
  if (refundError) throw refundError;
  const { error: statusError } = await supabaseAdmin.from('transactions').update({ status: 'rejected', gateway_status: 'rejected_by_admin', gateway_refunded_at: new Date().toISOString() }).eq('id', tx.id).eq('status', 'pending');
  if (statusError) throw statusError;
  await supabaseAdmin.from('transactions').insert({ user_id: tx.user_id, type: 'withdrawal_refund', amount: Number(tx.amount), status: 'completed', reference: `REFUND-${tx.reference}`, description: 'Withdrawal rejected by admin' });
  return { success: true, message: 'Withdrawal rejected and refunded.' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  try {
    await getAdminUser(req);
    const { transaction_id, action = 'approve' } = req.body || {};
    if (!transaction_id) return jsonResponse(res, 400, { error: 'transaction_id is required' });
    if (action === 'reject') {
      const result = await rejectWithdrawal(transaction_id);
      return jsonResponse(res, result.status || 200, result);
    }

    const { data: tx, error: txErr } = await supabaseAdmin.from('transactions').select('*').eq('id', transaction_id).eq('status', 'pending').eq('type', 'withdrawal').single();
    if (txErr || !tx) return jsonResponse(res, 404, { error: 'Withdrawal request not found or already processed' });

    const mode = await getWithdrawalMode();
    if (mode === 'manual') {
      const { error } = await supabaseAdmin.from('transactions').update({ status: 'approved', gateway: 'manual', gateway_status: 'manual_paid', approved_at: new Date().toISOString() }).eq('id', transaction_id).eq('status', 'pending');
      if (error) throw error;
      await addTotalWithdrawn(tx.user_id, tx.amount);
      return jsonResponse(res, 200, { success: true, mode, message: 'Withdrawal marked as paid manually.' });
    }

    if (!tx.bank_code || !tx.account_number || !tx.account_name) return jsonResponse(res, 400, { error: 'This withdrawal is missing bank payout details. Reject it and ask the user to resubmit.' });
    const orderId = tx.reference || `WD-${tx.id}`;
    const submissionTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin.from('transactions').update({ status: 'approved', gateway: 'mgm', gateway_status: 'submitting', approved_at: submissionTime }).eq('id', transaction_id).eq('status', 'pending').select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return jsonResponse(res, 409, { error: 'Withdrawal is already being processed' });

    const response = await createMgmPayout({ orderId, payoutAmount: tx.amount, accountName: tx.account_name, accountNumber: tx.account_number, bankCode: tx.bank_code });
    if (response?.state !== 'ok' || !response.data) {
      await supabaseAdmin.from('transactions').update({ status: 'pending', gateway_status: 'submission_failed', gateway_payload: response }).eq('id', transaction_id).eq('status', 'approved');
      return jsonResponse(res, 502, { error: response?.message || 'MGM Pay rejected the payout request' });
    }

    const data = response.data;
    const { error: updateError } = await supabaseAdmin.from('transactions').update({ status: 'approved', gateway: 'mgm', gateway_status: data.status || 'accepted', gateway_status_code: data.status_code ?? null, gateway_status_detail: data.status_detail || null, gateway_order_id: data.order_id || orderId, gateway_settlement_id: data.settlement_id || null, gateway_payload: response, approved_at: submissionTime, gateway_submitted_at: new Date().toISOString() }).eq('id', transaction_id).eq('status', 'approved');
    if (updateError) throw updateError;
    return jsonResponse(res, 200, { success: true, mode, status: 'approved', message: 'Withdrawal approved and sent to MGM Pay for processing.' });
  } catch (error) {
    console.error('APPROVE WITHDRAWAL ERROR:', error);
    if (error.message?.includes('Admin')) return jsonResponse(res, 403, { error: error.message });
    return jsonResponse(res, 500, { error: error.message || 'Internal server error' });
  }
}
