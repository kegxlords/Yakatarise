// api/request-withdrawal.js
import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAuthenticatedUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const user = await getAuthenticatedUser(req);
    const { amount, bank_name, account_number, account_name } = req.body;

    if (!amount || amount < 1000) return jsonResponse(res, 400, { error: 'Invalid amount' });

    // 🚨 RULE CHECK: Must have an active miner
    const { count, error: minerErr } = await supabaseAdmin
      .from('user_miners')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (minerErr) throw minerErr;
    if (!count || count === 0) {
      return jsonResponse(res, 403, { error: 'You must rent an active miner before you can withdraw funds.' });
    }

    // 1. Get Wallet & Settings
    const { data: wallet } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', user.id).single();
    const { data: settings } = await supabaseAdmin.from('settings').select('key, value');
    
    const getSetting = (key) => settings?.find(s => s.key === key)?.value;
    const feePercent = parseFloat(getSetting('withdrawal_fee_percent') || 8);
    const minWithdrawal = parseFloat(getSetting('min_withdrawal') || 1000);

    if (amount < minWithdrawal) return jsonResponse(res, 400, { error: `Minimum withdrawal is ₦${minWithdrawal}` });
    if (wallet.balance < amount) return jsonResponse(res, 400, { error: 'Insufficient balance' });

    // 2. Calculate Fee & Deduct Balance Immediately (Lock funds)
    const fee = amount * (feePercent / 100);
    const netAmount = amount - fee;
    const newBalance = wallet.balance - amount;

    await supabaseAdmin.from('wallets').update({ balance: newBalance }).eq('user_id', user.id);

    // 3. Create Pending Withdrawal Transaction
    const txRef = 'WD-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const bankDetails = `${bank_name} | ${account_number} | ${account_name}`;

    await supabaseAdmin.from('transactions').insert({
      user_id: user.id,
      type: 'withdrawal',
      amount: netAmount, // Store the net amount they will receive
      status: 'pending',
      description: bankDetails,
      reference: txRef
    });

    // 4. Record the Fee as a separate transaction (optional, but good for accounting)
    if (fee > 0) {
      await supabaseAdmin.from('transactions').insert({
        user_id: user.id,
        type: 'withdrawal_fee',
        amount: -fee,
        status: 'completed',
        description: 'Withdrawal processing fee'
      });
    }

    return jsonResponse(res, 200, { success: true, message: 'Withdrawal request submitted!' });

  } catch (error) {
    if (error.message.includes('token') || error.message.includes('Admin')) return jsonResponse(res, 401, { error: error.message });
    console.error(error);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
    }
