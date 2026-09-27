/* assets/js/components.js */

const headerHTML = `
  <nav class="navbar">
    <div class="container nav-content">
      <a href="index.html" class="logo">
        <div class="logo-icon">J</div>
        <span class="logo-text">JaKaTaRise</span>
      </a>
      <button class="mobile-menu-btn" onclick="toggleMobileMenu()">☰</button>
      <div class="nav-links" id="navLinks">
        <!-- Links injected by JS -->
      </div>
    </div>
  </nav>
`;

// ... (Keep the footerHTML exactly as it was in Phase 2) ...

function loadComponents() {
  const headerContainer = document.getElementById('app-header');
  const footerContainer = document.getElementById('app-footer');
  
  if (headerContainer) headerContainer.innerHTML = headerHTML;
  if (footerContainer) footerContainer.innerHTML = footerHTML;

  const navLinks = document.getElementById('navLinks');
  if (navLinks) {
    // Check if user is on an authenticated page
    const isAuthPage = window.location.pathname.includes('dashboard') || 
                       window.location.pathname.includes('rent-miners') || 
                       window.location.pathname.includes('my-miners') ||
                       window.location.pathname.includes('wallet') ||
                       window.location.pathname.includes('team');
    
    if (isAuthPage) {
      navLinks.innerHTML = `
        <a href="dashboard.html" class="nav-link">Dashboard</a>
        <a href="my-miners.html" class="nav-link">My Miners</a>
        <a href="wallet.html" class="nav-link">Wallet</a>
        <a href="login.html" class="btn btn-outline" style="padding: 8px 20px;" onclick="logout()">Logout</a>
      `;
    } else {
      navLinks.innerHTML = `
        <a href="index.html" class="nav-link">Home</a>
        <a href="login.html" class="btn btn-outline" style="padding: 8px 20px;">Login</a>
        <a href="register.html" class="btn btn-primary" style="padding: 8px 20px;">Register</a>
      `;
    }
  }
}

// Mobile Menu Toggle
window.toggleMobileMenu = function() {
  const nav = document.getElementById('navLinks');
  if (nav.style.display === 'flex') {
    nav.style.display = 'none';
  } else {
    nav.style.display = 'flex';
    nav.style.flexDirection = 'column';
    nav.style.position = 'absolute';
    nav.style.top = '70px';
    nav.style.left = '0';
    nav.style.right = '0';
    nav.style.background = '#fff';
    nav.style.padding = '20px';
    nav.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    nav.style.zIndex = '99';
  }
}

function logout() {
  // Add Supabase signOut logic here later
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', loadComponents);
