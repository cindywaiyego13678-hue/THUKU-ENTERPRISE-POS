// ============================================================
// Supabase configuration
// ============================================================
const SUPABASE_URL = 'https://ipbqeyeanlyvklrjcbxl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYnFleWVhbmx5dmtscmpjYnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NjAzOTYsImV4cCI6MjA5ODQzNjM5Nn0.tzqpOhol3sbrxMlpHFemK7cDbiW8NNeColEARHPmK5E';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ---------- Branded popup ----------
const nativeAlert = window.alert;

window.alert = function (message) {
  showBrandedAlert(message);
};

function showBrandedAlert(message) {
  let overlay = document.getElementById('branded-alert-overlay');
  let panel = document.getElementById('branded-alert-panel');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'branded-alert-overlay';
    overlay.style.cssText =
      'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200;';

    panel = document.createElement('div');
    panel.id = 'branded-alert-panel';
    panel.className = 'card';
    panel.style.cssText =
      'display:none; position:fixed; top:30%; left:50%; transform:translateX(-50%); width:88%; max-width:340px; z-index:210; text-align:center;';

    panel.innerHTML = `
      <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">
        Thuku Enterprise
      </h3>
      <p id="branded-alert-message" style="margin:0 0 16px 0; white-space:pre-line;"></p>
      <button id="branded-alert-ok" style="width:100%;">OK</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    const close = () => {
      overlay.style.display = 'none';
      panel.style.display = 'none';
    };

    overlay.onclick = close;
    panel.querySelector('#branded-alert-ok').onclick = close;
  }

  panel.querySelector('#branded-alert-message').textContent = message;
  overlay.style.display = 'block';
  panel.style.display = 'block';
}

// ---------- Branded confirm ----------
function confirmDialog(message) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('branded-confirm-overlay');
    let panel = document.getElementById('branded-confirm-panel');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'branded-confirm-overlay';
      overlay.style.cssText =
        'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200;';

      panel = document.createElement('div');
      panel.id = 'branded-confirm-panel';
      panel.className = 'card';
      panel.style.cssText =
        'display:none; position:fixed; top:30%; left:50%; transform:translateX(-50%); width:88%; max-width:360px; z-index:210; text-align:center;';

      panel.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">
          Thuku Enterprise
        </h3>
        <p id="branded-confirm-message" style="margin:0 0 16px 0; white-space:pre-line;"></p>
        <div style="display:flex; gap:8px;">
          <button class="secondary" id="branded-confirm-cancel" style="flex:1;">Cancel</button>
          <button id="branded-confirm-ok" style="flex:1;">Confirm</button>
        </div>
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(panel);
    }

    panel.querySelector('#branded-confirm-message').textContent = message;
    overlay.style.display = 'block';
    panel.style.display = 'block';

    const finish = (result) => {
      overlay.style.display = 'none';
      panel.style.display = 'none';
      resolve(result);
    };

    overlay.onclick = () => finish(false);
    panel.querySelector('#branded-confirm-cancel').onclick = () => finish(false);
    panel.querySelector('#branded-confirm-ok').onclick = () => finish(true);
  });
}

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

// ---------- Auth helpers ----------
async function getCurrentStaff() {
  const { data: { user } } =
    await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));

  const { data: { session } } =
    await supabaseClient.auth.getSession();

  const effectiveUser = user || session?.user;

  if (!effectiveUser) return null;

  if (navigator.onLine) {
    const { data, error } = await supabaseClient
      .from('staff')
      .select('*')
      .eq('id', effectiveUser.id)
      .single();

    if (!error && data) {
      cacheSet('staff_profile_' + effectiveUser.id, data);
      return data;
    }
  }

  // Offline (or live call failed): use last-known staff profile
  const cached = cacheGet('staff_profile_' + effectiveUser.id);

  if (cached) return cached.data;

  return null;
}

// ---------- Require authentication ----------
async function requireAuth(allowedRoles = null) {
  const { data: { session } } =
    await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const staff = await getCurrentStaff();

  if (!staff || !staff.is_active) {
    if (navigator.onLine) {
      await supabaseClient.auth.signOut();
    }

    window.location.href = 'index.html';
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    alert('You do not have access to this page.');
    window.location.href = 'pos.html';
    return null;
  }

  return staff;
}

// ---------- Logout ----------
async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}
