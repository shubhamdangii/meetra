/* =========================================================
   Shared logic for every page: builds the event list from the
   templates, draws header/footer/cards, handles saved plans.
   ========================================================= */
(function () {
  const C = window.CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- storage (safe) ---------- */
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  /* ---------- dates ---------- */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const mins = t => { const m = /(\d+)(?::(\d+))?\s*(am|pm)/i.exec(t || ""); if (!m) return 0; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return h * 60 + (+m[2] || 0); };
  const diffDays = d => Math.round((d - today) / 864e5);
  const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };
  const fmtDay = d => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  const relDay = d => { const n = diffDays(d); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : fmtDay(d); };

  /* ---------- build events from templates ---------- */
  const PAST_DAYS = 35, AHEAD_DAYS = 28;
  const all = [];
  Object.entries(C.cities).filter(([, c]) => c.live).forEach(([city]) => {
    window.TEMPLATES.forEach(t => {
      const ov = t.cities && t.cities[city]; if (!ov) return;
      const dates = [];
      if (t.once != null) dates.push(addDays(today, t.once));
      else for (let i = -PAST_DAYS; i < AHEAD_DAYS; i++) {
        const d = addDays(today, i);
        if (!t.days.includes(d.getDay())) continue;
        const week = Math.floor(d.getTime() / (7 * 864e5));
        if (t.every && week % t.every !== 0) continue;
        dates.push(d);
      }
      dates.forEach(d => {
        const week = Math.floor(d.getTime() / (7 * 864e5));
        let title = ov.title || t.title;
        if (t.themes) title += " · " + t.themes[week % t.themes.length];
        const id = `${t.key}-${city}-${ymd(d)}`;
        const seats = ov.seats || t.seats;
        const taken = Math.min(seats, Math.floor(seats * (0.35 + (hash(id) % 60) / 100)));
        all.push({
          id, key: t.key, city, date: d, day: diffDays(d), title,
          cat: t.cat, time: ov.time || t.time, end: ov.end || t.end, area: ov.area,
          hosts: ov.hosts || ["team"], price: ov.price ?? t.price, priceType: t.priceType,
          seats, left: Math.max(0, seats - taken), emoji: ov.emoji || t.emoji,
          pal: ov.pal ?? t.pal, pattern: t.pattern, blurb: ov.blurb || t.blurb,
          steps: t.steps, tags: t.tags || [], image: ov.image || t.image || null
        });
      });
    });
  });
  all.sort((a, b) => a.date - b.date || mins(a.time) - mins(b.time));
  const EVENTS = all.filter(e => e.day >= 0);
  const PAST = all.filter(e => e.day < 0).reverse();

  /* ---------- city ---------- */
  const getCity = () => { const c = store.get("mt-city", C.defaultCity); return c === "all" || (C.cities[c] && C.cities[c].live) ? c : C.defaultCity; };
  const setCity = c => { store.set("mt-city", c); document.dispatchEvent(new CustomEvent("citychange", { detail: c })); };
  const cityName = c => c === "all" ? "All cities" : C.cities[c].name;
  const inCity = (e, c = getCity()) => c === "all" || e.city === c;

  /* ---------- saved / my plans ---------- */
  const saved = new Set(store.get("mt-saved", []));
  const isSaved = id => saved.has(id);
  const toggleSave = id => { saved.has(id) ? saved.delete(id) : saved.add(id); store.set("mt-saved", [...saved]); toast(saved.has(id) ? "♥ Saved to your plans" : "Removed from saved"); return saved.has(id); };
  const requests = () => store.get("mt-requests", []);
  const addRequest = r => { const l = requests().filter(x => x.id !== r.id); l.unshift(r); store.set("mt-requests", l); };

  /* ---------- formatting ---------- */
  const hostNames = e => e.hosts.map(h => (window.HOSTS[h] || {}).name || h).join(" & ");
  const priceShort = e => e.priceType === "free" ? "Free" : e.priceType === "estimate" ? `~₹${e.price.toLocaleString("en-IN")}` : `₹${e.price.toLocaleString("en-IN")}`;
  const priceLabel = e => ({ free: "no charge", reservation: "seat reservation", "per person": "per person", estimate: "estimated total" })[e.priceType];
  const catOf = id => window.CATEGORIES.find(c => c.id === id) || window.CATEGORIES[0];
  const url = e => `event.html#${e.id}`;
  const byId = id => all.find(e => e.id === id);

  /* ---------- components ---------- */
  function poster(e, opts = {}) {
    const [bg, ac] = window.PALETTES[e.pal % window.PALETTES.length];
    const dark = bg === "#16122B" || bg === "#6C4CF5";
    const img = e.image ? `<img class="photo" src="${esc(e.image)}" alt="" loading="lazy">` : "";
    return `<div class="poster p-${e.pattern}${dark ? " dark" : ""}" style="--bg:${bg};--ac:${ac}">
      ${img}${img ? "" : `<div class="blob"></div><span class="em" aria-hidden="true">${e.emoji}</span>`}
      ${opts.title && !img ? `<span class="ptitle">${esc(e.title.split(" · ")[0])}</span>` : ""}
      ${opts.badge === false ? "" : dbadge(e.date)}
    </div>`;
  }
  const dbadge = d => `<div class="dbadge"><b>${DOW[d.getDay()].toUpperCase()}</b><i>${d.getDate()}</i><small>${MON[d.getMonth()].toUpperCase()}</small></div>`;

  function card(e) {
    const low = e.left <= 4;
    return `<article class="card reveal">
      ${poster(e)}
      <button class="save-btn ${isSaved(e.id) ? "on" : ""}" data-save="${e.id}" aria-label="Save ${esc(e.title)}">${isSaved(e.id) ? "♥" : "♡"}</button>
      ${e.tags.length ? `<div class="tagrow">${e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="card-body">
        <span class="when">${e.time} · ${esc(e.area)}${getCity() === "all" ? " · " + C.cities[e.city].name : ""}</span>
        <h3>${esc(e.title)}</h3>
        <span class="by">Hosted by ${esc(hostNames(e))}</span>
        <div class="price"><span><b>${priceShort(e)}</b> ${priceLabel(e)}</span>
          <span class="seats-left ${low ? "" : "ok"}">${e.left === 0 ? "Waitlist" : low ? `${e.left} left` : `${e.seats} seats`}</span></div>
      </div>
      <a class="card-link" href="${url(e)}" aria-label="${esc(e.title)}, ${fmtDay(e.date)}"></a>
    </article>`;
  }

  /* delegate save clicks everywhere */
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-save]"); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const on = toggleSave(b.dataset.save);
    $$(`[data-save="${b.dataset.save}"]`).forEach(x => { x.classList.toggle("on", on); if (!x.dataset.label) x.textContent = on ? "♥" : "♡"; else x.innerHTML = on ? "♥ Saved" : "♡ Save"; });
    document.dispatchEvent(new CustomEvent("savedchange"));
  });

  /* ---------- toast ---------- */
  let tEl, tT;
  function toast(msg) {
    if (!tEl) { tEl = document.createElement("div"); tEl.className = "toast"; tEl.setAttribute("role", "status"); document.body.appendChild(tEl); }
    tEl.textContent = msg; tEl.classList.add("show"); clearTimeout(tT); tT = setTimeout(() => tEl.classList.remove("show"), 2600);
  }

  /* ---------- reveal on scroll ---------- */
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -40px 0px" }) : null;
  function reveal(root = document) { $$(".reveal:not(.in)", root).forEach((el, i) => { if (!io) return el.classList.add("in"); el.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`; io.observe(el); }); checkReveal(); }
  // Fallback so content never stays hidden if the observer is slow.
  function checkReveal() { const h = innerHeight + 120; $$(".reveal:not(.in)").forEach(el => { if (el.getBoundingClientRect().top < h) el.classList.add("in"); }); }
  let rT; addEventListener("scroll", () => { clearTimeout(rT); rT = setTimeout(checkReveal, 80); }, { passive: true });
  addEventListener("resize", checkReveal);

  /* ---------- header & footer ---------- */
  const brand = `${esc(C.brand)}<i>.</i>`;
  function header(active) {
    const links = [["events", "events.html", "Explore", "🔍"], ["past", "past.html", "Past nights", "📸"], ["saved", "saved.html", "Your plans", "♥"], ["host", "host.html", "Host", "✨"]];
    const h = document.createElement("header");
    h.className = "site-header";
    h.innerHTML = `<div class="wrap nav">
      <a class="logo" href="index.html" aria-label="${esc(C.brand)} home">${brand}</a>
      <nav class="nav-links">${links.map(([k, u, l]) => `<a href="${u}" class="${active === k ? "active" : ""}">${l}</a>`).join("")}</nav>
      <div class="nav-right">
        <button class="city-btn" id="cityBtn" aria-haspopup="true">📍 <span id="cityLabel">${cityName(getCity())}</span> ▾</button>
        <div class="city-menu" id="cityMenu" role="menu">
          ${Object.entries(C.cities).map(([k, c]) => `<button data-city="${k}" ${c.live ? "" : "disabled"}><span>${c.name}</span><small>${c.live ? c.tag : "coming soon"}</small></button>`).join("")}
          <button data-city="all"><span>All cities</span><small>everything</small></button>
        </div>
      </div></div>`;
    document.body.prepend(h);
    const tb = document.createElement("nav");
    tb.className = "tabbar";
    tb.innerHTML = [["home", "index.html", "Home", "⌂"], ...links.filter(l => l[0] !== "past")].map(([k, u, l, i]) => `<a href="${u}" class="${active === k ? "active" : ""}"><span>${i}</span>${l}</a>`).join("");
    document.body.appendChild(tb);

    const menu = $("#cityMenu"), btn = $("#cityBtn");
    const mark = () => $$("button", menu).forEach(b => b.classList.toggle("on", b.dataset.city === getCity()));
    mark();
    btn.onclick = e => { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", e => { if (!menu.contains(e.target)) menu.classList.remove("open"); });
    menu.onclick = e => { const b = e.target.closest("[data-city]"); if (!b || b.disabled) return; setCity(b.dataset.city); $("#cityLabel").textContent = cityName(b.dataset.city); mark(); menu.classList.remove("open"); toast(`📍 Showing ${cityName(b.dataset.city)}`); };
    addEventListener("scroll", () => h.classList.toggle("scrolled", scrollY > 8), { passive: true });
  }

  function footer() {
    const f = document.createElement("footer");
    f.className = "site-footer";
    const liveCities = Object.values(C.cities).filter(c => c.live).map(c => c.name).join(" & ");
    f.innerHTML = `<div class="wrap">
      <div class="foot-grid">
        <div><a class="logo" href="index.html" style="color:#fff">${brand}</a><p>${esc(C.tagline)} Now in ${liveCities}.</p></div>
        <div><h5>Explore</h5><a href="events.html">Find a meetup</a><a href="events.html#weekend">This weekend</a><a href="past.html">Past nights</a><a href="saved.html">Saved plans</a></div>
        <div><h5>${esc(C.brand)}</h5><a href="about.html">How it works</a><a href="about.html#safety">Help & safety</a><a href="host.html">Host a meetup</a><a href="partners.html">For brands & venues</a></div>
        <div><h5>Say hi</h5><a href="${C.instagram}" target="_blank" rel="noopener">Instagram</a><a href="${C.whatsappCommunity}" target="_blank" rel="noopener">WhatsApp community</a><a href="mailto:${C.email}">${esc(C.email)}</a></div>
      </div>
      <div class="wordmark" aria-hidden="true">${esc(C.brand)}<i>.</i></div>
      <div class="foot-bottom"><span>© ${today.getFullYear()} ${esc(C.brand)}. Made with chai in ${liveCities}.</span><span><a href="about.html#terms">Terms</a> · <a href="about.html#privacy">Privacy</a></span></div>
    </div>`;
    document.body.appendChild(f);
  }

  /* ---------- WhatsApp booking ---------- */
  function whatsappLink(text) { return `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}`; }
  // Replaces a form with a "send on WhatsApp" button (a real link works everywhere, popups don't).
  function whatsappDone(form, text, heading) {
    form.innerHTML = `<div style="text-align:center;padding:8px 0"><div style="font-size:44px">✅</div>
      <h3 style="font-size:22px;letter-spacing:-.03em;margin:6px 0">${esc(heading)}</h3>
      <p class="muted" style="margin-bottom:14px">Last step: send the message we've written for you.</p>
      <a class="btn btn-sun btn-block" href="${whatsappLink(text)}" target="_blank" rel="noopener">Send on WhatsApp →</a></div>`;
  }
  // Share: native share sheet, else copy link, else tell the user.
  async function share(data) {
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(data.url); toast("Link copied"); } catch { toast("Copy the link from your address bar"); }
  }
  // Read ?key= or #value (hash links work on every host).
  const hashVal = () => decodeURIComponent(location.hash.slice(1));

  /* ---------- page title ---------- */
  function title(t) { document.title = t ? `${t} · ${C.brand}` : `${C.brand} · Hosted meetups in ${Object.values(C.cities).filter(c => c.live).map(c => c.name).join(" & ")}`; }

  window.APP = { $, $$, esc, store, today, addDays, fmtDay, relDay, mins, diffDays, DOW, MON, EVENTS, PAST, ALL: all, byId,
    getCity, setCity, cityName, inCity, isSaved, toggleSave, requests, addRequest, hostNames, priceShort, priceLabel, catOf, url,
    poster, dbadge, card, toast, reveal, header, footer, whatsappLink, whatsappDone, share, hashVal, title, hash };
})();
