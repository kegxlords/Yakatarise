/* assets/js/components.js */

const headerHTML = `
  <nav class="navbar">
    <div class="container nav-content">
      <a href="index.html" class="logo">
        <div class="logo-icon">J</div>
        <span class="logo-text">JaKaTaRise</span>
      </a>
      <div class="nav-links" id="navLinks">
        <!-- Links injected by JS based on auth state -->
      </div>
    </div>
  </nav>
`;

const footerHTML = `
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <h4 style="color: var(--accent);">JaKaTaRise Capital</h4>
          <p style="font-size: 14px; margin-top: 10px;">Mining Resources, Building Futures.</p>
        </div>
        <div>
          <h4 style="color: #fff;">Quick Links</h4>
          <ul class="footer-links">
            <li><a href="dashboard.html">Dashboard</a></li>
            <li><a href="rent-miners.html">Rent Miners</a></li>
            <li><a href="my-miners.html">My Miners</a></li>
            <li><a href="contact.html">Contact Support</a></li>
          </ul>
        </div>
        <div>
          <h4 style="color: #fff;">Legal</h4>
          <ul class="footer-links">
            <li><a href="#">Terms of Service</a></li>
            <li><a href="#">Privacy Policy</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2024 JaKaTaRise Capital. All rights reserved.</p>
      </div>
    </div>
  </footer>
`;

function loadComponents() {
  // Inject Header & Footer
  const headerContainer = document.getElementById('app-header');
  const footerContainer = document.getElementById('app-footer');
  
  if (headerContainer) headerContainer.innerHTML = headerHTML;
  if (footerContainer) footerContainer.innerHTML = footerHTML;

  // Simple Auth Check for Navigation Links
  const navLinks = document.getElementById('navLinks');
  if (navLinks) {
    // In a real app, check Supabase session here. For now, we show logged-in state if on dashboard pages.
    const isAuthPage = window.location.pathname.includes('dashboard') || 
                       window.location.pathname.includes('rent-miners') || 
                       window.location.pathname.includes('my-miners');
    
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

function logout() {
  // Add Supabase signOut logic here later
  window.location.href = 'login.html';
}

// Run on load
document.addEventListener('DOMContentLoaded', loadComponents);
