import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Verify User
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  // 2. Find Code
  const { data: giftCode, error: codeErr } = await supabase
    .from('gift_codes').select('*').eq('code', code.toUpperCase()).single();

  if (codeErr || !giftCode) return res.status(404).json({ error: 'Invalid code' });
  if (!giftCode.is_active) return res.status(400).json({ error: 'This code is inactive' });
  if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) return res.status(400).json({ error: 'This code has expired' });
  if (giftCode.used_count >= giftCode.max_uses) return res.status(400).json({ error: 'This code has reached its usage limit' });

  // 3. Check if user already used it
  const { data: existing } = await supabase
    .from('user_gift_redemptions').select('id').eq('user_id', user.id).eq('gift_code_id', giftCode.id).single();
  
  if (existing) return res.status(400).json({ error: 'You have already used this code' });

  // 4. Credit Wallet
  const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user.id).single();
  const newBalance = (wallet?.balance || 0) + giftCode.amount;
  
  await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', user.id);

  // 5. Update Code Usage
  await supabase.from('gift_codes').update({ used_count: giftCode.used_count + 1 }).eq('id', giftCode.id);

  // 6. Record Redemption
  await supabase.from('user_gift_redemptions').insert({
    user_id: user.id,
    gift_code_id: giftCode.id,
    amount_credited: giftCode.amount
  });

  // 7. Create Transaction Record
  await supabase.from('transactions').insert({
    user_id: user.id,
    type: 'gift_code_bonus',
    amount: giftCode.amount,
    status: 'completed',
    description: `Redeemed gift code: ${giftCode.code}`
  });

  return res.status(200).json({ success: true, message: `Successfully redeemed ₦${giftCode.amount}!` });
}
