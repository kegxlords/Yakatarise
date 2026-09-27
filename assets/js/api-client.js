/* assets/js/api-client.js */

// ⚠️ CRITICAL: Replace these with your actual Supabase keys!
const SUPABASE_URL = 'https://oinsfepzlnfpydzdngly.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbnNmZXB6bG5mcHlkemRuZ2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0OTg2NDcsImV4cCI6MjEwNjA3NDY0N30.eXyO-ZYcThiwMIy5cAGbOsGECLSqGhLgWVxgnPDxNKQ';

// Initialize Supabase and attach it to the window so all pages can use it
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to make secure API calls to your Vercel backend
async function callApi(endpoint, data = null) {
  const { data: { session } } = await window.supabase.auth.getSession();
  
  if (!session) {
    window.location.href = 'login.html';
    return { error: 'Not authenticated' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: data ? JSON.stringify(data) : null
    });

    return await response.json();
  } catch (error) {
    console.error('API Call Failed:', error);
    return { error: 'Network error' };
  }
}
