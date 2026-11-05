"use strict";
// Basic consent mode: no Google requests until the visitor opts in.
(() => {
  const ID = "G-RHQQKT6J0E";
  const production = location.hostname === "clashref.github.io";
  const key = "cr.analytics";
  let consent = null;
  try { consent = localStorage.getItem(key); } catch {}
  if (!["allow", "deny"].includes(consent)) consent = null;
  let loaded = false, current = null, lastSent = "", previous = "";
  const notice = document.querySelector("#analyticsNotice");
  const select = document.querySelector("#analyticsChoice");
  const googleDisabled = "ga-disable-" + ID;
  function tag() { window.dataLayer.push(arguments); }
  function sync() {
    select.value = consent || "";
    notice.hidden = !production || consent !== null || document.querySelector("#welcomeTH").open;
  }
  function load() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = tag;
    tag("consent", "default", {analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied"});
    tag("consent", "update", {analytics_storage: "granted"});
    tag("js", new Date());
    tag("config", ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: location.hostname,
      cookie_flags: "SameSite=Lax;Secure",
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
    document.head.append(script);
  }
  function send() {
    if (!production || consent !== "allow" || !current || current.path === lastSent) return;
    window[googleDisabled] = false;
    load();
    const url = new URL(current.path, location.origin);
    // Keep campaign attribution; never forward search text or arbitrary URL parameters.
    const query = new URLSearchParams(location.search);
    for (const name of ["utm_source", "utm_medium", "utm_campaign"]) {
      if (query.has(name)) url.searchParams.set(name, query.get(name));
    }
    let referrer = previous;
    if (!referrer && document.referrer) {
      try { const source = new URL(document.referrer); referrer = source.origin + source.pathname; } catch {}
    }
    tag("event", "page_view", {send_to: ID, page_title: current.title, page_location: url.href, page_referrer: referrer});
    lastSent = current.path;
    previous = url.href;
  }
  function choose(value) {
    if (!["allow", "deny"].includes(value)) return;
    consent = value;
    try { localStorage.setItem(key, value); } catch {}
    window[googleDisabled] = value !== "allow";
    if (value === "deny") {
      lastSent = "";
      // Clear this site's GA identifiers when a visitor withdraws consent.
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.split("=")[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) continue;
        for (const domain of ["", ";domain=" + location.hostname, ";domain=." + location.hostname]) {
          document.cookie = name + "=;Max-Age=0;path=/" + domain + ";SameSite=Lax;Secure";
        }
      }
    } else {
      if (loaded) tag("consent", "update", {analytics_storage: "granted"});
      send();
    }
    sync();
  }
  window.ClashAnalytics = {page(page) { current = page; send(); }};
  document.querySelector("#allowAnalytics").onclick = () => choose("allow");
  document.querySelector("#denyAnalytics").onclick = () => choose("deny");
  select.onchange = () => choose(select.value);
  document.querySelector("#welcomeTH").addEventListener("close", sync);
  document.addEventListener("DOMContentLoaded", sync);
})();
