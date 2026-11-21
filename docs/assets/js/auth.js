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
      client.auth.onAuthStateChange(async (_evt, session) => {
        state.session = session;
        await refreshMe();
        renderSlot(); listeners.forEach(f => f(state));
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
          <small>${me.profile_complete ? "✓ Profile complete" : "Profile not complete yet"}</small></div>
        <a href="profile.html" role="menuitem"><span>${me.profile_complete ? "My profile" : "Complete my profile"}</span>${me.profile_complete ? "" : "<small class='dot'>●</small>"}</a>
        <a href="saved.html" role="menuitem"><span>Your plans</span></a>
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
    if (!state.session || !state.me || state.me.profile_complete || /profile\.html$/.test(location.pathname)) return;
    const bar = document.createElement("div");
    bar.id = "profileNudge"; bar.className = "nudge";
    bar.innerHTML = `<div class="wrap"><span>👋 Finish your profile so hosts can confirm your seat.</span><a class="btn btn-sun btn-sm" href="profile.html">Complete profile →</a></div>`;
    const header = document.querySelector(".site-header");
    header ? header.after(bar) : document.body.prepend(bar);
  }

  async function logout() {
    try { await client.auth.signOut(); } catch {}
    state = { session: null, me: null };
    location.href = "index.html";
  }

  /* Call before anything that needs a trusted member (e.g. requesting a seat).
     Returns true when the visitor is logged in with a complete profile.
     Otherwise sends them to log in / finish their profile and returns false.
     When login is switched off it returns true so the site keeps working. */
  async function requireCompleteProfile(nextUrl = location.href) {
    if (!enabled) return true;
    await ready;
    if (!state.session) { rememberNext(nextUrl); location.href = "login.html"; return false; }
    if (!state.me || !state.me.profile_complete) { rememberNext(nextUrl); location.href = "profile.html"; return false; }
    return true;
  }
  function rememberNext(url) { try { sessionStorage.setItem(NEXT_KEY, url); } catch {} }
  function takeNext(fallback = "events.html") {
    let u = null; try { u = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch {}
    // only same-site pages
    try { if (u && new URL(u, location.href).origin === location.origin) return u; } catch {}
    return fallback;
  }

  window.AUTH = {
    enabled, ready, logout, requireCompleteProfile, rememberNext, takeNext, refreshMe,
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
