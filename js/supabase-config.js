// ============================================================
// THUKU ENTERPRISE — SUPABASE CONFIGURATION
// ============================================================

const SUPABASE_URL = 'https://ipbqeyeanlyvklrjcbxl.supabase.co';

const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYnFleWVhbmx5dmtscmpjYnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NjAzOTYsImV4cCI6MjA5ODQzNjM5Nn0.tzqpOhol3sbrxMlpHFemK7cDbiW8NNeColEARHPmK5E';


// ============================================================
// SUPABASE CLIENT
// ============================================================
// IMPORTANT:
// Authentication is stored in sessionStorage instead of
// localStorage.
//
// Result:
// - Login remains available while the current browser tab is open.
// - Closing the tab removes the session.
// - Logging out removes the session.
// - The next person must log in with their own credentials.
// ============================================================

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);


// ============================================================
// REMOVE OLD PERSISTENT SUPABASE LOGIN
// ============================================================
// Your previous version may have stored the login in localStorage.
// Remove that old session so it cannot automatically log someone
// into the previous user's account.
//
// This does NOT remove your application data.
// It only removes the old Supabase authentication token.
// ============================================================

try {
  const oldAuthKey = 'sb-ipbqeyeanlyvklrjcbxl-auth-token';

  if (localStorage.getItem(oldAuthKey)) {
    localStorage.removeItem(oldAuthKey);
  }
} catch (error) {
  console.warn('Could not clear old authentication session:', error);
}


// ============================================================
// BRANDED POPUP
// ============================================================

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
      'display:none;' +
      'position:fixed;' +
      'inset:0;' +
      'background:rgba(0,0,0,0.5);' +
      'z-index:200;';

    panel = document.createElement('div');
    panel.id = 'branded-alert-panel';
    panel.className = 'card';

    panel.style.cssText =
      'display:none;' +
      'position:fixed;' +
      'top:30%;' +
      'left:50%;' +
      'transform:translateX(-50%);' +
      'width:88%;' +
      'max-width:340px;' +
      'z-index:210;' +
      'text-align:center;';

    panel.innerHTML = `
      <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">
        Thuku Enterprise
      </h3>

      <p
        id="branded-alert-message"
        style="margin:0 0 16px 0; white-space:pre-line;"
      ></p>

      <button id="branded-alert-ok" style="width:100%;">
        OK
      </button>
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


// ============================================================
// BRANDED CONFIRM
// ============================================================

function confirmDialog(message) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('branded-confirm-overlay');
    let panel = document.getElementById('branded-confirm-panel');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'branded-confirm-overlay';

      overlay.style.cssText =
        'display:none;' +
        'position:fixed;' +
        'inset:0;' +
        'background:rgba(0,0,0,0.5);' +
        'z-index:200;';

      panel = document.createElement('div');
      panel.id = 'branded-confirm-panel';
      panel.className = 'card';

      panel.style.cssText =
        'display:none;' +
        'position:fixed;' +
        'top:30%;' +
        'left:50%;' +
        'transform:translateX(-50%);' +
        'width:88%;' +
        'max-width:360px;' +
        'z-index:210;' +
        'text-align:center;';

      panel.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:10px; color:var(--navy, #0f2137);">
          Thuku Enterprise
        </h3>

        <p
          id="branded-confirm-message"
          style="margin:0 0 16px 0; white-space:pre-line;"
        ></p>

        <div style="display:flex; gap:8px;">
          <button
            class="secondary"
            id="branded-confirm-cancel"
            style="flex:1;"
          >
            Cancel
          </button>

          <button
            id="branded-confirm-ok"
            style="flex:1;"
          >
            Confirm
          </button>
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

    panel.querySelector('#branded-confirm-cancel').onclick =
      () => finish(false);

    panel.querySelector('#branded-confirm-ok').onclick =
      () => finish(true);
  });
}


// ============================================================
// SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch((err) => {
        console.warn(
          'Service worker registration failed',
          err
        );
      });
  });
}


// ============================================================
// AUTH — GET CURRENT STAFF
// ============================================================

async function getCurrentStaff() {
  const {
    data: { user }
  } = await supabaseClient.auth
    .getUser()
    .catch(() => ({
      data: { user: null }
    }));

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const effectiveUser = user || session?.user;

  if (!effectiveUser) {
    return null;
  }


  // ----------------------------------------------------------
  // ONLINE — get the latest staff profile from Supabase
  // ----------------------------------------------------------

  if (navigator.onLine) {
    const { data, error } = await supabaseClient
      .from('staff')
      .select('*')
      .eq('id', effectiveUser.id)
      .single();

    if (!error && data) {
      cacheSet(
        'staff_profile_' + effectiveUser.id,
        data
      );

      return data;
    }
  }


  // ----------------------------------------------------------
  // OFFLINE — use last-known staff profile
  // ----------------------------------------------------------

  const cached = cacheGet(
    'staff_profile_' + effectiveUser.id
  );

  if (cached) {
    return cached.data;
  }

  return null;
}


// ============================================================
// AUTH — REQUIRE LOGIN
// ============================================================

async function requireAuth(allowedRoles = null) {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();


  // ----------------------------------------------------------
  // NO LOGIN
  // ----------------------------------------------------------

  if (!session) {
    window.location.replace('index.html');
    return null;
  }


  // ----------------------------------------------------------
  // GET STAFF PROFILE
  // ----------------------------------------------------------

  const staff = await getCurrentStaff();


  // ----------------------------------------------------------
  // STAFF DOES NOT EXIST / ACCOUNT DISABLED
  // ----------------------------------------------------------

  if (!staff || !staff.is_active) {
    if (navigator.onLine) {
      await supabaseClient.auth.signOut({
        scope: 'local'
      });
    }

    // Remove local browser session
    try {
      sessionStorage.removeItem(
        'sb-ipbqeyeanlyvklrjcbxl-auth-token'
      );
    } catch (error) {
      console.warn(
        'Could not clear authentication session:',
        error
      );
    }

    window.location.replace('index.html');
    return null;
  }


  // ----------------------------------------------------------
  // ROLE CHECK
  // ----------------------------------------------------------

  if (
    allowedRoles &&
    !allowedRoles.includes(staff.role)
  ) {
    alert('You do not have access to this page.');

    window.location.replace('pos.html');

    return null;
  }


  return staff;
}


// ============================================================
// LOGOUT
// ============================================================
// IMPORTANT:
//
// When the admin/staff clicks Logout:
//
// 1. Supabase signs out the current user.
// 2. The authentication token is removed from sessionStorage.
// 3. Old localStorage authentication is also removed.
// 4. User is returned to the login page.
// 5. The next person MUST enter their own credentials.
// ============================================================

async function logout() {
  try {

    // --------------------------------------------------------
    // Sign out from the current Supabase session
    // --------------------------------------------------------

    const { error } = await supabaseClient.auth.signOut({
      scope: 'local'
    });

    if (error) {
      console.error('Logout error:', error);

      alert(
        'Logout failed. Please try again.'
      );

      return;
    }


    // --------------------------------------------------------
    // Remove current Supabase session from sessionStorage
    // --------------------------------------------------------

    try {
      sessionStorage.removeItem(
        'sb-ipbqeyeanlyvklrjcbxl-auth-token'
      );
    } catch (error) {
      console.warn(
        'Could not clear session storage:',
        error
      );
    }


    // --------------------------------------------------------
    // Remove any OLD persistent Supabase session
    // --------------------------------------------------------

    try {
      localStorage.removeItem(
        'sb-ipbqeyeanlyvklrjcbxl-auth-token'
      );
    } catch (error) {
      console.warn(
        'Could not clear old local storage session:',
        error
      );
    }


    // --------------------------------------------------------
    // Go to login page
    // --------------------------------------------------------

    window.location.replace('index.html');

  } catch (error) {

    console.error('Unexpected logout error:', error);


    // --------------------------------------------------------
    // Emergency cleanup
    // --------------------------------------------------------

    try {
      sessionStorage.removeItem(
        'sb-ipbqeyeanlyvklrjcbxl-auth-token'
      );

      localStorage.removeItem(
        'sb-ipbqeyeanlyvklrjcbxl-auth-token'
      );
    } catch (cleanupError) {
      console.warn(
        'Session cleanup failed:',
        cleanupError
      );
    }


    // --------------------------------------------------------
    // Always return to login
    // --------------------------------------------------------

    window.location.replace('index.html');
  }
}
