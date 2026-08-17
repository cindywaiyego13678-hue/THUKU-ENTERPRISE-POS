// ============================================================
// Supabase configuration
// ============================================================
const SUPABASE_URL = 'https://ipbqeyeanlyvklrjcbxl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYnFleWVhbmx5dmtscmpjYnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NjAzOTYsImV4cCI6MjA5ODQzNjM5Nn0.tzqpOhol3sbrxMlpHFemK7cDbiW8NNeColEARHPmK5E';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ---------- Branded popup (replaces the browser's native alert()) ----------
// Native alert() always shows the raw domain (e.g. "yourname.github.io says"),
// which browsers don't allow websites to customize, for security reasons.
// This gives every page a "Thuku Enterprise" styled popup instead, using the
// exact same alert(message) calls already throughout the app.
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
    overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200;';

    panel = document.createElement('div');
    panel.id = 'branded-alert-panel';
    panel.className = 'card';
    panel.style.cssText = 'display:none; position:fixed; top:30%; left:50%; transform:translateX(-50%); width:88%; max-width:340px; z-index:210; text-align:center;';
    panel.innerHTML = `
      <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">Thuku Enterprise</h3>
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

// ---------- Branded confirm (replaces the browser's native confirm()) ----------
// Native confirm() is synchronous and blocking; a custom modal can't block
// like that, so every existing `if (!confirm(...)) return;` call site needs
// to become `if (!(await confirmDialog(...))) return;` — same logic, just
// awaited. (Search-replaced across the app alongside this change.)
function confirmDialog(message) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('branded-confirm-overlay');
    let panel = document.getElementById('branded-confirm-panel');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'branded-confirm-overlay';
      overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:200;';

      panel = document.createElement('div');
      panel.id = 'branded-confirm-panel';
      panel.className = 'card';
      panel.style.cssText = 'display:none; position:fixed; top:30%; left:50%; transform:translateX(-50%); width:88%; max-width:360px; z-index:210; text-align:center;';
      panel.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">Thuku Enterprise</h3>
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

// Register the service worker so the app shell works fully offline
// after the first successful visit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

// ---------- Auth helpers (offline-resilient) ----------
async function getCurrentStaff() {
  const { data: { user } } = await supabaseClient.auth.getUser().catch(() => ({ data: { user: null } }));

  // getSession() reads local storage only — works fully offline
  const { data: { session } } = await supabaseClient.auth.getSession();
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
    // Network call failed even though we think we're online — fall through to cache
  }

  // Offline (or the live call failed): use last-known staff profile
  const cached = cacheGet('staff_profile_' + effectiveUser.id);
  if (cached) return cached.data;
  return null;
}

async function requireAuth(allowedRoles = null) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  const staff = await getCurrentStaff();
  if (!staff || !staff.is_active) {
    // Only force sign-out if we're actually online and confirmed this from the server.
    // Offline with no cached profile just sends back to login without destroying the session.
    if (navigator.onLine) await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    alert('You do not have access to this page.');
    window.location.href = 'pos.html';
    return null;
  }
  injectChangePasswordUI();
  return staff;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// ---------- Change Password (self-service, appears next to Logout on every page) ----------
function injectChangePasswordUI() {
  const logoutBtn = document.querySelector('button[onclick="logout()"]');
  if (!logoutBtn || document.getElementById('change-password-btn')) return;

  const cpBtn = document.createElement('button');
  cpBtn.id = 'change-password-btn';
  cpBtn.className = logoutBtn.className;
  cpBtn.style.cssText = logoutBtn.style.cssText;
  cpBtn.textContent = 'Change Password';
  cpBtn.onclick = openChangePasswordModal;
  logoutBtn.parentNode.insertBefore(cpBtn, logoutBtn);

  const overlay = document.createElement('div');
  overlay.id = 'cp-overlay';
  overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:80;';
  overlay.onclick = closeChangePasswordModal;

  const panel = document.createElement('div');
  panel.id = 'cp-panel';
  panel.className = 'card';
  panel.style.cssText = 'display:none; position:fixed; top:15%; left:50%; transform:translateX(-50%); width:92%; max-width:360px; z-index:90;';
  panel.innerHTML = `
    <h3 style="margin-top:0;">Change Password</h3>
    <div class="field"><label>New password</label><input type="password" id="cp-new" placeholder="At least 6 characters"></div>
    <div class="field"><label>Confirm new password</label><input type="password" id="cp-confirm" placeholder="Repeat password"></div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button style="flex:1;" id="cp-save-btn" onclick="saveNewPassword()">Save</button>
      <button class="secondary" style="flex:1;" onclick="closeChangePasswordModal()">Cancel</button>
    </div>
    <p class="error-text" id="cp-error" style="display:none;"></p>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

function openChangePasswordModal() {
  document.getElementById('cp-overlay').style.display = 'block';
  document.getElementById('cp-panel').style.display = 'block';
}

function closeChangePasswordModal() {
  document.getElementById('cp-overlay').style.display = 'none';
  document.getElementById('cp-panel').style.display = 'none';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-error').style.display = 'none';
}

async function saveNewPassword() {
  const errorEl = document.getElementById('cp-error');
  errorEl.style.display = 'none';

  const pw = document.getElementById('cp-new').value;
  const confirmPw = document.getElementById('cp-confirm').value;

  if (pw.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    errorEl.style.display = 'block';
    return;
  }
  if (pw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('cp-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const { error } = await supabaseClient.auth.updateUser({ password: pw });

  btn.disabled = false;
  btn.textContent = 'Save';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  closeChangePasswordModal();
  alert('Password updated.');
}
