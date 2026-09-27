/* assets/js/auth-guard.js */
// Put this at the bottom of every page inside the dashboard (dashboard.html, wallet.html, etc.)

const SUPABASE_URL = 'https://oinsfepzlnfpydzdngly.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbnNmZXB6bG5mcHlkemRuZ2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0OTg2NDcsImV4cCI6MjEwNjA3NDY0N30.eXyO-ZYcThiwMIy5cAGbOsGECLSqGhLgWVxgnPDxNKQ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function protectRoute() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    // User is not logged in, redirect to login
    window.location.href = 'login.html';
  }
}

// Run the check immediately
protectRoute();
