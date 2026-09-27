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
const footerHTML = `
  <nav class="bottom-nav-floating">
    <a href="dashboard.html" class="nav-item-floating active">
      <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      <span>Home</span>
    </a>
    <a href="rent-miners.html" class="nav-item-floating">
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
      <span>Miners</span>
    </a>
    
    <!-- Center Pop-out Button (Treasure/Wallet) -->
    <a href="wallet.html" class="nav-item-floating nav-center-btn">
      <svg viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
      <span>Wallet</span>
    </a>

    <a href="team.html" class="nav-item-floating">
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      <span>Team</span>
    </a>
    <a href="profile.html" class="nav-item-floating">
      <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      <span>Profile</span>
    </a>
  </nav>
`;

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
