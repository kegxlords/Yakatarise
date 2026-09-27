// api/rent-miner.js
import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAuthenticatedUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    // 1. Check if keys are loaded
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(res, 500, { error: 'Server configuration error: Missing Service Role Key.' });
    }

    const user = await getAuthenticatedUser(req);
    const userId = user.id;
    const { miner_id } = req.body;

    if (!miner_id) return jsonResponse(res, 400, { error: 'Miner ID is required' });

    // 2. Fetch Miner Details
    const { data: miner, error: minerErr } = await supabaseAdmin
      .from('miners').select('*').eq('id', miner_id).single();
    if (minerErr || !miner) return jsonResponse(res, 404, { error: 'Miner not found' });

    // 3. Check Wallet (Safety Check)
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from('wallets').select('balance').eq('user_id', userId).single();
      
    // CRITICAL FIX: If wallet doesn't exist, stop here instead of crashing
    if (!wallet) {
      return jsonResponse(res, 400, { error: 'Wallet not found for this user. Please contact support.' });
    }

    if (wallet.balance < miner.price) {
      return jsonResponse(res, 400, { error: 'Insufficient wallet balance' });
    }

    // 4. Create Miner Record
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + miner.duration_days);

    const { error: insertErr } = await supabaseAdmin
      .from('user_miners').insert({
        user_id: userId,
        miner_id: miner.id,
        end_date: endDate.toISOString(),
        status: 'active',
        days_collected: 0,
        total_collected: 0
      });
    if (insertErr) throw insertErr;

    // 5. Deduct Balance
    await supabaseAdmin
      .from('wallets').update({ balance: wallet.balance - miner.price })
      .eq('user_id', userId);

    // 6. Record Transaction
    await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      type: 'miner_purchase',
      amount: -miner.price,
      status: 'completed',
      description: `Rented ${miner.name}`
    });

    // 7. Pay Commissions (Safe Check for Uplines)
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('upline_level_1, upline_level_2, upline_level_3').eq('id', userId).single();

    if (profile) {
      const commissions = [
        { level: 1, userId: profile.upline_level_1, percent: 0.05 },
        { level: 2, userId: profile.upline_level_2, percent: 0.02 },
        { level: 3, userId: profile.upline_level_3, percent: 0.01 }
      ];

      for (const comm of commissions) {
        if (comm.userId) {
          const commAmount = miner.price * comm.percent;
          
          // Credit Upline
          const { data: uplineWallet } = await supabaseAdmin
            .from('wallets').select('balance').eq('user_id', comm.userId).single();
            
          if (uplineWallet) {
            await supabaseAdmin
              .from('wallets').update({ balance: uplineWallet.balance + commAmount })
              .eq('user_id', comm.userId);

            await supabaseAdmin.from('transactions').insert({
              user_id: comm.userId,
              type: 'referral_bonus',
              amount: commAmount,
              status: 'completed',
              description: `Level ${comm.level} commission from rental`
            });
          }
        }
      }
    }

    return jsonResponse(res, 200, { success: true, message: 'Miner rented successfully!' });

  } catch (error) {
    console.error("RENT MINER ERROR:", error); // This prints to Vercel Logs
    // Return the actual error message so you can see what's wrong
    return jsonResponse(res, 500, { error: error.message }); 
  }
}
