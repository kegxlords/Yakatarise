// api/rent-miner.js
import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAuthenticatedUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(res, 500, { error: 'Server configuration error.' });
    }

    const user = await getAuthenticatedUser(req);
    const userId = user.id;
    const { miner_id } = req.body;

    if (!miner_id) return jsonResponse(res, 400, { error: 'Miner ID is required' });

    // 1. Fetch Miner Details
    const { data: miner, error: minerErr } = await supabaseAdmin
      .from('miners').select('*').eq('id', miner_id).single();
    if (minerErr || !miner) return jsonResponse(res, 404, { error: 'Miner not found' });

    // 2. Fetch Settings for Dynamic Percentages
    const { data: settings } = await supabaseAdmin.from('settings').select('key, value');
    const getSetting = (key, defaultVal) => {
      const s = settings?.find(x => x.key === key);
      return s ? parseFloat(s.value) : defaultVal;
    };

    // Get percentages from DB (fallback to 5, 2, 1 if not set)
    const L1_PERCENT = getSetting('referral_level_1', 5) / 100;
    const L2_PERCENT = getSetting('referral_level_2', 2) / 100;
    const L3_PERCENT = getSetting('referral_level_3', 1) / 100;
    const DIRECT_BONUS_PERCENT = getSetting('referral_bonus_direct', 8) / 100;

    // 3. Check Wallet
    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance').eq('user_id', userId).single();
      
    if (!wallet) return jsonResponse(res, 400, { error: 'Wallet not found.' });
    if (wallet.balance < miner.price) return jsonResponse(res, 400, { error: 'Insufficient balance' });

    // 4. Create Miner Record
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + miner.duration_days);

    await supabaseAdmin.from('user_miners').insert({
      user_id: userId, miner_id: miner.id, end_date: endDate.toISOString(),
      status: 'active', days_collected: 0, total_collected: 0
    });

    // 5. Deduct Balance
    await supabaseAdmin.from('wallets').update({ balance: wallet.balance - miner.price }).eq('user_id', userId);

    await supabaseAdmin.from('transactions').insert({
      user_id: userId, type: 'miner_purchase', amount: -miner.price,
      status: 'completed', description: `Rented ${miner.name}`
    });

    // 6. Pay Commissions using DYNAMIC percentages
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('upline_level_1, upline_level_2, upline_level_3, referred_by').eq('id', userId).single();

    if (profile) {
      const commissions = [
        { level: 1, userId: profile.upline_level_1, percent: L1_PERCENT },
        { level: 2, userId: profile.upline_level_2, percent: L2_PERCENT },
        { level: 3, userId: profile.upline_level_3, percent: L3_PERCENT }
      ];

      // Pay Direct Registration Bonus (if configured)
      if (profile.referred_by && DIRECT_BONUS_PERCENT > 0) {
         const bonusAmount = miner.price * DIRECT_BONUS_PERCENT;
         // Logic to credit direct referrer bonus would go here if needed separately
      }

      for (const comm of commissions) {
        if (comm.userId && comm.percent > 0) {
          const commAmount = miner.price * comm.percent;
          
          const { data: uplineWallet } = await supabaseAdmin
            .from('wallets').select('balance').eq('user_id', comm.userId).single();
            
          if (uplineWallet) {
            await supabaseAdmin.from('wallets').update({ balance: uplineWallet.balance + commAmount }).eq('user_id', comm.userId);
            await supabaseAdmin.from('transactions').insert({
              user_id: comm.userId, type: 'referral_bonus', amount: commAmount,
              status: 'completed', description: `Level ${comm.level} commission`
            });
          }
        }
      }
    }

    return jsonResponse(res, 200, { success: true, message: 'Miner rented!' });

  } catch (error) {
    console.error(error);
    return jsonResponse(res, 500, { error: error.message });
  }
}
