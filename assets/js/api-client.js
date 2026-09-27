/* assets/js/api-client.js */

// ️ REPLACE THESE WITH YOUR ACTUAL SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://oinsfepzlnfpydzdngly.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbnNmZXB6bG5mcHlkemRuZ2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0OTg2NDcsImV4cCI6MjEwNjA3NDY0N30.eXyO-ZYcThiwMIy5cAGbOsGECLSqGhLgWVxgnPDxNKQ';

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to make secure API calls to your Vercel backend
async function callApi(endpoint, data = null) {
  // 1. Get the user's current session token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = 'login.html';
    return { error: 'Not authenticated' };
  }

  try {
    // 2. Make the request to your Vercel API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}` // 🔑 Sends the secure token
      },
      body: data ? JSON.stringify(data) : null
    });

    return await response.json();
  } catch (error) {
    console.error('API Call Failed:', error);
    return { error: 'Network error' };
  }
            }
