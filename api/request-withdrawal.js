import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const { amount: rawAmount, bank_name, bank_code, account_number, account_name } = req.body || {};
    const withdrawalAmount = Number(rawAmount);
    const bankCode = String(bank_code || '').trim();
    const accountNumber = String(account_number || '').trim();
    const bankName = String(bank_name || '').trim();
    const accountName = String(account_name || '').trim();

    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0 || !bankName || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'All withdrawal fields are required' });
    }
    if (!/^\d{5}$/.test(bankCode)) return res.status(400).json({ error: 'A valid 5-digit Nigerian bank code is required' });
    if (!/^\d{10}$/.test(accountNumber)) return res.status(400).json({ error: 'Account number must be 10 digits' });

    const { count: activeMinerCount, error: minerError } = await supabase
      .from('user_miners').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'active');
    if (minerError) throw minerError;
    if (!activeMinerCount) return res.status(403).json({ error: 'You must rent an active miner before withdrawing.' });

    const { data: settings, error: settingsError } = await supabase.from('settings').select('key, value');
    if (settingsError) throw settingsError;
    const settingNumber = (key, fallback) => {
      const row = settings?.find(item => item.key === key);
      const value = Number(row?.value);
      return Number.isFinite(value) ? value : fallback;
    };

    const minimumWithdrawal = settingNumber('min_withdrawal', 1000);
    const feePercent = settingNumber('withdrawal_fee_percent', 8);
    if (withdrawalAmount < minimumWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal is ₦${minimumWithdrawal.toLocaleString()}` });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('wallets').select('balance').eq('user_id', user.id).single();
    if (walletError || !wallet) return res.status(400).json({ error: 'Wallet not found' });
    if (Number(wallet.balance) < withdrawalAmount) return res.status(400).json({ error: 'Insufficient balance' });

    const fee = withdrawalAmount * (feePercent / 100);
    const netAmount = withdrawalAmount - fee;
    if (netAmount <= 0) return res.status(400).json({ error: 'Withdrawal amount is too small after fees' });

    const { error: balanceUpdateError } = await supabase.from('wallets')
      .update({ balance: Number(wallet.balance) - withdrawalAmount })
      .eq('user_id', user.id).gte('balance', withdrawalAmount);
    if (balanceUpdateError) throw balanceUpdateError;

    const reference = `WD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error: withdrawalError } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'withdrawal',
      amount: Number(netAmount.toFixed(2)),
      status: 'pending',
      reference,
      bank_name: bankName,
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
      gateway: 'pending_approval',
      gateway_status: 'awaiting_admin_approval',
      description: `${bankName} | ${accountNumber} | ${accountName}`
    });
    if (withdrawalError) throw withdrawalError;

    if (fee > 0) {
      const { error: feeError } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'withdrawal_fee',
        amount: -Number(fee.toFixed(2)),
        status: 'completed',
        reference: `FEE-${reference}`,
        description: 'Withdrawal processing fee'
      });
      if (feeError) throw feeError;
    }

    return res.status(200).json({ success: true, message: 'Withdrawal request submitted!' });
  } catch (error) {
    console.error('WITHDRAW ERROR:', error);
    return res.status(500).json({ error: error.message || 'Unable to submit withdrawal' });
  }
}
