/* assets/js/wallet.js */

// Default fallback settings (used only if database fetch fails)
let CONFIG = {
  minWithdrawal: 1000,
  feePercent: 8,
  startHour: 9,
  endHour: 17,
  allowedDays: [1, 2, 3, 4, 5, 6] // Mon(1) to Sat(6)
};

// 1. Fetch Real Settings from Database
async function loadWithdrawalSettings() {
  if (!window.supabase) return;

  const { data: settings, error } = await window.supabase
    .from('settings')
    .select('*');

  if (!error && settings) {
    // Helper to safely get values from the settings array
    const getVal = (key, defaultVal) => {
      const setting = settings.find(s => s.key === key);
      return setting ? setting.value : defaultVal;
    };

    // Update CONFIG with real database values
    CONFIG.minWithdrawal = parseFloat(getVal('min_withdrawal', 1000));
    CONFIG.feePercent = parseFloat(getVal('withdrawal_fee_percent', 8));
    CONFIG.startHour = parseInt(getVal('withdrawal_start_hour', 9));
    CONFIG.endHour = parseInt(getVal('withdrawal_end_hour', 17));
    
    try {
      CONFIG.allowedDays = JSON.parse(getVal('withdrawal_days', '[1,2,3,4,5,6]'));
    } catch (e) {
      CONFIG.allowedDays = [1, 2, 3, 4, 5, 6];
    }
    
    console.log("Withdrawal settings loaded from DB:", CONFIG);
  }
}

// 2. Check Withdrawal Time Window
function checkWithdrawalWindow() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  
  const isAllowedDay = CONFIG.allowedDays.includes(day);
  const isWithinHours = hour >= CONFIG.startHour && hour < CONFIG.endHour;
  
  const btn = document.getElementById('submitWithdrawBtn');
  const statusMsg = document.getElementById('withdrawStatusMsg');
  
  if (!isAllowedDay || !isWithinHours) {
    // DISABLE WITHDRAWAL
    if(btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.innerText = 'Withdrawals Closed';
    }
    
    if(statusMsg) {
      let msg = `Withdrawals are only open ${formatDays(CONFIG.allowedDays)}, ${CONFIG.startHour}:00 - ${CONFIG.endHour}:00.`;
      if (!isAllowedDay) msg = `Withdrawals are closed today. Please check back on an allowed day.`;
      else if (hour < CONFIG.startHour) msg = `Withdrawals open at ${CONFIG.startHour}:00 today.`;
      else if (hour >= CONFIG.endHour) msg = `Withdrawals closed for today. Please return tomorrow at ${CONFIG.startHour}:00.`;
      
      statusMsg.innerHTML = `<div class="alert alert-error show">⏰ ${msg}</div>`;
    }
    return false;
  } else {
    // ENABLE WITHDRAWAL
    if(btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.innerText = 'Submit Withdrawal Request';
    }
    if(statusMsg) statusMsg.innerHTML = '<div class="alert alert-success show">✅ Withdrawal window is currently OPEN.</div>';
    return true;
  }
}

// Helper to format days nicely (e.g., "Mon - Sat")
function formatDays(days) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (days.length === 7) return 'Daily';
  if (days.length === 0) return 'Never';
  return days.map(d => dayNames[d]).join(', ');
}

// 3. Calculate Fees Dynamically
function calculateWithdrawalDetails() {
  const amountInput = document.getElementById('withdrawAmount');
  const feeDisplay = document.getElementById('feeDisplay');
  const netDisplay = document.getElementById('netDisplay');
  const minDisplay = document.getElementById('minDisplay');
  
  if(!amountInput) return;

  const amount = parseFloat(amountInput.value) || 0;
  const fee = amount * (CONFIG.feePercent / 100);
  const net = amount - fee;

  feeDisplay.innerText = '' + fee.toLocaleString(undefined, {minimumFractionDigits: 2});
  netDisplay.innerText = '₦' + net.toLocaleString(undefined, {minimumFractionDigits: 2});

  // Validation Visuals
  if (amount > 0 && amount < CONFIG.minWithdrawal) {
    minDisplay.innerText = `Minimum withdrawal is ₦${CONFIG.minWithdrawal.toLocaleString()}`;
    minDisplay.style.color = 'var(--danger)';
  } else {
    minDisplay.innerText = ' ';
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for settings to load from DB before checking UI
  await loadWithdrawalSettings();
  
  // Run time check immediately and every minute
  checkWithdrawalWindow();
  setInterval(checkWithdrawalWindow, 60000); 
  
  // Attach calculator
  const amountInput = document.getElementById('withdrawAmount');
  if(amountInput) amountInput.addEventListener('input', calculateWithdrawalDetails);
});
