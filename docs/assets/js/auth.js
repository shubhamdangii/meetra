/* =========================================================
   LOGIN — Google or WhatsApp, through Supabase Auth.
   Load after config.js and app.js on every page.
   If supabaseUrl / supabaseAnonKey in config.js are empty, login is off
   and the site keeps working exactly as before.
   ========================================================= */
(function () {
  const C = window.CONFIG || {};
  const enabled = !!(C.supabaseUrl && C.supabaseAnonKey);
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  const NEXT_KEY = "mt-after-login";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let client = null;
  let state = { session: null, me: null };
  const listeners = [];

  function loadLib() {
    if (window.supabase) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS; s.onload = res; s.onerror = () => rej(new Error("Could not load the login library"));
      document.head.appendChild(s);
    });
  }

  async function refreshMe() {
    if (!state.session) { state.me = null; return null; }
    const { data, error } = await client.rpc("me");
    state.me = error ? null : (Array.isArray(data) ? data[0] : data) || null;
    return state.me;
  }

  const ready = (async () => {
    if (!enabled) return state;
    try {
      await loadLib();
      client = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
      });
      const { data } = await client.auth.getSession();
      state.session = data.session;
      await refreshMe();
      client.auth.onAuthStateChange((_evt, session) => {
        state.session = session;
        // Never call Supabase inside this callback directly: it runs while Supabase
        // holds its login lock, so an awaited call here would wait forever.
        setTimeout(async () => { await refreshMe(); renderSlot(); listeners.forEach(f => f(state)); }, 0);
      });
    } catch (e) {
      console.error(e);
    }
    return state;
  })();

  /* ---------- header: "Log in" or avatar menu ---------- */
  function renderSlot() {
    const slot = document.getElementById("authSlot");
    if (!slot) return;
    if (!state.session) {
      slot.innerHTML = `<a class="btn btn-ink btn-sm login-btn" href="login.html">Log in</a>`;
      return;
    }
    const me = state.me || {};
    const initial = esc((me.display_name || "?")[0]);
    const pic = me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="">` : initial;
    slot.innerHTML = `
      <button class="avatar-btn ${me.profile_complete ? "" : "todo"}" id="avatarBtn" aria-haspopup="true" aria-label="Your account">${pic}</button>
      <div class="city-menu account-menu" id="accountMenu" role="menu">
        <div class="acct-head"><b>${esc(me.display_name || "Your account")}</b>
          <small>Profile score ${me.profile_score ?? 0}/100${me.profile_complete ? " · complete ✓" : ""}</small></div>
        <a href="profile.html" role="menuitem"><span>My profile</span>${me.profile_complete ? "" : "<small class='dot'>●</small>"}</a>
        <a href="saved.html" role="menuitem"><span>Your plans</span></a>
        <a href="swipe.html" role="menuitem"><span>Discover plans</span></a>
        ${me.role === "admin" ? `<a href="admin.html" role="menuitem"><span>Admin</span></a>` : ""}
        <button id="logoutBtn" role="menuitem"><span>Log out</span></button>
      </div>`;
    const menu = document.getElementById("accountMenu");
    document.getElementById("avatarBtn").onclick = e => { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", e => { if (!menu.contains(e.target)) menu.classList.remove("open"); });
    document.getElementById("logoutBtn").onclick = logout;
  }

  /* ---------- reminder bar for incomplete profiles ---------- */
  function renderReminder() {
    const old = document.getElementById("profileNudge");
    if (old) old.remove();
    if (!state.session || !state.me || state.me.profile_score >= 70 || /(profile|admin)\.html$/.test(location.pathname)) return;
    const bar = document.createElement("div");
    bar.id = "profileNudge"; bar.className = "nudge";
    bar.innerHTML = `<div class="wrap"><span>👋 Your profile score is ${state.me.profile_score}/100. Seats go to the most complete profiles first.</span><a class="btn btn-sun btn-sm" href="profile.html">Add details →</a></div>`;
    const header = document.querySelector(".site-header");
    header ? header.after(bar) : document.body.prepend(bar);
  }

  async function logout() {
    try { await client.auth.signOut(); } catch {}
    state = { session: null, me: null };
    location.href = "index.html";
  }

  /* Call before anything that needs a known member (e.g. requesting a seat).
     Returns true when the visitor is logged in; otherwise sends them to the
     login page (and back here afterwards) and returns false.
     A short profile does NOT block anyone; it only lowers their priority.
     When login is switched off it returns true so the site keeps working. */
  async function requireLogin(nextUrl = location.href) {
    if (!enabled) return true;
    await ready;
    if (!state.session) { rememberNext(nextUrl); location.href = "login.html"; return false; }
    return true;
  }

  // A random id for this browser, used to count swipe interest without login.
  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("mt-device"); } catch {}
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID ? crypto.randomUUID()
        : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      try { localStorage.setItem("mt-device", id); } catch {}
    }
    return id;
  }
  function rememberNext(url) { try { sessionStorage.setItem(NEXT_KEY, url); } catch {} }
  function takeNext(fallback = "events.html") {
    let u = null; try { u = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch {}
    // only same-site pages
    try { if (u && new URL(u, location.href).origin === location.origin) return u; } catch {}
    return fallback;
  }

  window.AUTH = {
    enabled, ready, logout, requireLogin, deviceId, rememberNext, takeNext, refreshMe,
    get client() { return client; },
    get session() { return state.session; },
    get me() { return state.me; },
    onChange(fn) { listeners.push(fn); },
    redirectTo: page => new URL(page, location.href).href.split("#")[0].split("?")[0]
  };

  // Draw the header slot as soon as the header exists, then again once we know who's logged in.
  function boot() {
    if (enabled) { renderSlot(); ready.then(() => { renderSlot(); renderReminder(); }); }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
  listeners.push(renderReminder);
})();
