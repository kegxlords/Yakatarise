// api/run-payout.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Initialize Supabase Admin
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Call the SQL function we created in the editor!
    const { data, error } = await supabase.rpc('process_daily_payouts');

    if (error) {
      console.error("SQL Payout Error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Daily payouts processed via SQL!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
