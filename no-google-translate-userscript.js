// ==UserScript==
// @name         No Google Translate (All Countries)
// @namespace    https://github.com/atakanelmas/no-google-translate-userscript
// @version      1.2
// @description  Hide Google Search translation rows and redirect translate proxy URLs to their originals, across all Google country domains.
// @author       Atakan Elmas
// @match        *://*.translate.goog/*
// @include      /^https?:\/\/translate\.google\.[^/]+\/translate.*$/
// @include      /^https?:\/\/(www\.|m\.)?google\.[a-z.]+\/search.*$/
// @run-at       document-start
// @grant        none
// @noframes
// @downloadURL  https://raw.githubusercontent.com/atakanelmas/no-google-translate-userscript/main/no-google-translate-userscript.js
// @updateURL    https://raw.githubusercontent.com/atakanelmas/no-google-translate-userscript/main/no-google-translate-userscript.js
// ==/UserScript==

/* ---------------- Helpers ---------------- */
const isVisible = (el) => {
  try {
    if (!el) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility();
    const rect = el.getBoundingClientRect?.() || { width: 0, height: 0, top: 0 };
    return !!(rect.width || rect.height) && !!(el.offsetParent || rect.top >= 0);
  } catch { return false; }
};

const once = (fn) => {
  let done = false;
  return (...args) => { if (done) return; done = true; try { fn(...args); } catch {} };
};

const rafDebounce = (fn) => {
  let scheduled = false;
  return (...args) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { fn(...args); } catch {}
    });
  };
};

const isTranslateHost = (host) =>
  /(^|\.)translate\.goog$/i.test(host) || /^translate\.google\.[a-z.]+$/i.test(host);

/* ------------- Part 1: Redirect translate proxy -> original URL ------------- */
const maybeRedirectFromTranslate = () => {
  try {
    const host = location.hostname;
    if (!isTranslateHost(host)) return;

    const u = new URL(location.href);
    const p = u.searchParams;

    const candidate =
      p.get("u") || p.get("q") || p.get("url") || p.get("ref") || p.get("target");
    if (!candidate) return;

    const target = new URL(candidate, location.href);
    if (!/^https?:$/i.test(target.protocol)) return;
    if (isTranslateHost(target.hostname)) return;

    location.replace(target.href);
  } catch {}
};

maybeRedirectFromTranslate();

/* ------------- Part 2: Clean Google Search translation rows ------------- */
const normalizeTranslateWrappedLink = (a) => {
  try {
    if (!a?.href) return;
    const href = a.href;
    const m = href.match(/^https?:\/\/translate\.google\.[^/]+\/translate\?(.+)$/i);
    if (!m) return;
    const params = new URLSearchParams(m[1]);
    const original = params.get("u") || params.get("q") || params.get("url");
    if (original) a.href = original;
  } catch {}
};

const cleanResult = async (resultDiv) => {
  try {
    if (!resultDiv) return;

    const seeOriginalButton = resultDiv.querySelector(
      'span[jsaction="YjLrZe"][role="button"][tabindex="0"]'
    );
    if (seeOriginalButton && isVisible(seeOriginalButton)) {
      const prev = seeOriginalButton.previousElementSibling;
      const ok = (prev?.textContent ?? "").includes("Google");
      if (ok) seeOriginalButton.click();
    }

    const translationDiv = resultDiv.querySelector('div.nlNnsd.ApHyTb[jsaction="rcuQ6b:npT2md"]');
    if (translationDiv) translationDiv.style.display = "none";

    const links = resultDiv.querySelectorAll('a[jsname="UWckNb"], a[data-jsname="UWckNb"], a');
    for (const a of links) normalizeTranslateWrappedLink(a);
  } catch {}
};

const scanAllResults = async () => {
  const selectors = [
    "#rso div.MjjYud",
    "#rso div.xGj8Mb",
    "#rso div.qXbDwb",
    "#rhs div.xGj8Mb",
    "#rhs div.qXbDwb",
  ].join(", ");
  const resultDivs = document.querySelectorAll(selectors);
  await Promise.all(Array.from(resultDivs).map(cleanResult));
};

const setupSearchCleaner = () => {
  const run = rafDebounce(() => { scanAllResults().catch(() => {}); });
  const initRun = once(run);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initRun, { once: true, passive: true });
  } else {
    initRun();
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("#rso, #rhs, #rso * , #rhs *") || node.closest?.("#rso, #rhs")) {
          run();
          return;
        }
      }
    }
  });

  const target = document.querySelector("#rso") || document.querySelector("#rhs") || document.body;
  if (target) observer.observe(target, { childList: true, subtree: true });

  window.addEventListener("pagehide", () => observer.disconnect(), { passive: true });
};

(() => {
  const host = location.hostname;
  const path = location.pathname;
  const isGoogleSearchHost = /(^|\.)google\.[a-z.]+$/i.test(host);
  const isSearchPath = path.startsWith("/search");
  if (isGoogleSearchHost && isSearchPath) setupSearchCleaner();
})();