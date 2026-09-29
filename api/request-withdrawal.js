// api/request-withdrawal.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

    const { amount, bank_name, account_number, account_name } = req.body;
    if (!amount || !bank_name || !account_number || !account_name)
      return res.status(400).json({ error: 'All fields are required' });

    // 🛡️ RULE: Must have an active miner
    const { count } = await supabase.from('user_miners')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'active');
    if (!count || count === 0)
      return res.status(403).json({ error: 'You must rent an active miner before withdrawing.' });

    // Settings: min + fee only (NO time window)
    const { data: settings } = await supabase.from('settings').select('key, value');
    const g = (k, d) => { const x = settings?.find(i => i.key === k); return x ? parseFloat(x.value) : d; };
    const min = g('min_withdrawal', 1000);
    const feePct = g('withdrawal_fee_percent', 8);

    if (amount < min) return res.status(400).json({ error: `Minimum withdrawal is ₦${min.toLocaleString()}` });

    // Balance check
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user.id).single();
    if (!wallet || Number(wallet.balance) < amount)
      return res.status(400).json({ error: 'Insufficient balance' });

    const fee = amount * (feePct / 100);
    const net = amount - fee;

    // Deduct full amount now (locks the funds)
    await supabase.from('wallets').update({ balance: Number(wallet.balance) - amount }).eq('user_id', user.id);

    // Pending withdrawal (stores NET amount user receives)
    const ref = 'WD-' + Math.random().toString(36).slice(2, 9).toUpperCase();
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'withdrawal',
      amount: net,
      status: 'pending',
      reference: ref,
      description: `${bank_name} | ${account_number} | ${account_name}`
    });

    // Fee ledger entry
    if (fee > 0) {
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'withdrawal_fee',
        amount: -fee,
        status: 'completed',
        description: 'Withdrawal processing fee'
      });
    }

    return res.status(200).json({ success: true, message: 'Withdrawal request submitted!' });
  } catch (e) {
    console.error('WITHDRAW ERROR:', e);
    return res.status(500).json({ error: e.message });
  }
}
