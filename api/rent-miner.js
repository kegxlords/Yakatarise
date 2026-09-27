import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAuthenticatedUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const user = await getAuthenticatedUser(req);
    const userId = user.id;
    const { miner_id } = req.body;

    if (!miner_id) return jsonResponse(res, 400, { error: 'Miner ID is required' });

    // 1. Fetch Miner Details
    const { data: miner, error: minerErr } = await supabaseAdmin
      .from('miners').select('*').eq('id', miner_id).single();
    if (minerErr || !miner) return jsonResponse(res, 404, { error: 'Miner not found' });

    // 2. Check Purchase Limit
    const { count, error: countErr } = await supabaseAdmin
      .from('user_miners').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('miner_id', miner_id);
    
    if (count >= miner.purchase_limit) {
      return jsonResponse(res, 400, { error: `You have reached the limit for ${miner.name}` });
    }

    // 3. Check Wallet Balance
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('wallets').select('balance').eq('user_id', userId).single();
      
    if (wallet.balance < miner.price) {
      return jsonResponse(res, 400, { error: 'Insufficient wallet balance' });
    }

    // 4. Deduct Balance & Create Miner Record
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + miner.duration_days);

    const { error: insertErr } = await supabaseAdmin
      .from('user_miners').insert({
        user_id: userId,
        miner_id: miner.id,
        end_date: endDate.toISOString(),
        status: 'active'
      });
    if (insertErr) throw insertErr;

    // Deduct balance
    await supabaseAdmin
      .from('wallets').update({ balance: wallet.balance - miner.price })
      .eq('user_id', userId);

    // Record Transaction
    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      type: 'miner_purchase',
      amount: -miner.price,
      status: 'completed',
      description: `Rented ${miner.name}`
    });

    // 5. Pay 3-Level Referral Commissions (Based on Rental Price)
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('upline_level_1, upline_level_2, upline_level_3').eq('id', userId).single();

    const commissions = [
      { level: 1, userId: profile.upline_level_1, percent: 0.05 }, // 5%
      { level: 2, userId: profile.upline_level_2, percent: 0.02 }, // 2%
      { level: 3, userId: profile.upline_level_3, percent: 0.01 }  // 1%
    ];

    for (const comm of commissions) {
      if (comm.userId) {
        const commAmount = miner.price * comm.percent;
        
        // Credit Upline Wallet
        const { data: uplineWallet } = await supabaseAdmin
          .from('wallets').select('balance').eq('user_id', comm.userId).single();
          
        if (uplineWallet) {
          await supabaseAdmin
            .from('wallets').update({ balance: uplineWallet.balance + commAmount })
            .eq('user_id', comm.userId);

          // Record Commission Transaction
          await supabaseAdmin.from('transactions').insert({
            user_id: comm.userId,
            type: 'referral_bonus',
            amount: commAmount,
            status: 'completed',
            description: `Level ${comm.level} commission from ${user.email}`
          });
        }
      }
    }

    return jsonResponse(res, 200, { success: true, message: 'Miner rented and commissions paid!' });

  } catch (error) {
    if (error.message.includes('token')) return jsonResponse(res, 401, { error: error.message });
    console.error(error);
    return jsonResponse(res, 500, { error: 'Internal server error' });
  }
}
