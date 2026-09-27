/* assets/js/wallet.js */

// Configuration (In Phase 5, these will come from the Database Settings)
const CONFIG = {
  minWithdrawal: 1000,
  feePercent: 8,
  startHour: 9,
  endHour: 17, // 5 PM
  allowedDays: [1, 2, 3, 4, 5, 6] // Mon(1) to Sat(6). Sunday(0) is blocked.
};

// 1. Check Withdrawal Time Window
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
      let msg = "Withdrawals are only open Monday to Saturday, 9AM - 5PM.";
      if (day === 0) msg = "Withdrawals are closed on Sundays. Please return tomorrow.";
      else if (hour < CONFIG.startHour) msg = `Withdrawals open at 9:00 AM today.`;
      else if (hour >= CONFIG.endHour) msg = `Withdrawals closed for today. Please return tomorrow at 9:00 AM.`;
      
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

// 2. Calculate Fees Dynamically
function calculateWithdrawalDetails() {
  const amountInput = document.getElementById('withdrawAmount');
  const feeDisplay = document.getElementById('feeDisplay');
  const netDisplay = document.getElementById('netDisplay');
  const minDisplay = document.getElementById('minDisplay');
  
  if(!amountInput) return;

  const amount = parseFloat(amountInput.value) || 0;
  const fee = amount * (CONFIG.feePercent / 100);
  const net = amount - fee;

  feeDisplay.innerText = '₦' + fee.toLocaleString(undefined, {minimumFractionDigits: 2});
  netDisplay.innerText = '₦' + net.toLocaleString(undefined, {minimumFractionDigits: 2});

  // Validation Visuals
  if (amount > 0 && amount < CONFIG.minWithdrawal) {
    minDisplay.innerText = `Minimum withdrawal is ${CONFIG.minWithdrawal}`;
    minDisplay.style.color = 'var(--danger)';
  } else {
    minDisplay.innerText = ' ';
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Run time check immediately and every minute
  checkWithdrawalWindow();
  setInterval(checkWithdrawalWindow, 60000); 
  
  // Attach calculator
  const amountInput = document.getElementById('withdrawAmount');
  if(amountInput) amountInput.addEventListener('input', calculateWithdrawalDetails);
});
