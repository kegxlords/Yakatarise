/* assets/js/admin-guard.js */
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function protectAdminRoute() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = '../login.html';
    return;
  }

  // Check if user is admin in the database
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (!profile || !profile.is_admin) {
    alert('Access Denied: Admin privileges required.');
    window.location.href = '../dashboard.html';
  }
}

protectAdminRoute();
