/* ASAS_FX — sistem animasi scroll global terpusat.
 * Satu IntersectionObserver bersama, tanpa listener scroll berat,
 * progressive enhancement (tanpa JS / tanpa IO => konten tetap tampil).
 */
(() => {
  "use strict";

  const SEEN_KEYS = new Set();
  const MAX_STAGGER = 8;
  const SAFETY_MS = 1500;

  let observer = null;
  let observerReady = false;
  let motionQuery = null;
  let onMotionChange = null;

  /* ---------- util ---------- */
  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function readToken(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  /* ---------- observer ---------- */
  function ensureObserver() {
    if (observerReady) return observer;
    if (typeof IntersectionObserver !== "function") return null;
    observerReady = true;
    observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealElement(entry.target);
        obs.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    return observer;
  }

  function revealElement(target) {
    if (!target || target.classList.contains("is-in")) return;
    target.classList.add("is-in");
    target.style.removeProperty("--reveal-delay");
    if (observer) observer.unobserve(target);
  }

  /* ---------- refresh ---------- */
  function applyStagger(root) {
    const groups = new Map();
    root.querySelectorAll("[data-reveal-stagger]").forEach((parent) => {
      groups.set(parent, Array.from(parent.querySelectorAll(":scope > [data-reveal]")));
    });
    groups.forEach((items) => {
      items.forEach((item, i) => item.style.setProperty("--i", String(Math.min(i, MAX_STAGGER))));
    });
    // elemen tanpa induk stagger: indeks menurut urutan di root
    root.querySelectorAll("[data-reveal]").forEach((node) => {
      if (node.closest("[data-reveal-stagger]")) return;
      if (node.style.getPropertyValue("--i")) return;
    });
  }

  function collect(root) {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    if (root.matches && root.matches("[data-reveal]")) return [root];
    return Array.from(root.querySelectorAll("[data-reveal]"));
  }

  function refresh(root = document, options = {}) {
    const opts = options || {};
    const key = opts.key;

    if (key && SEEN_KEYS.has(key)) {
      // Tampilan ini sudah pernah ditampilkan: elemen baru langsung tampil,
      // tanpa memutar ulang animasi masuk.
      collect(root).forEach(revealElement);
      return;
    }
    if (key) SEEN_KEYS.add(key);

    const nodes = collect(root);
    if (!nodes.length) return;

    if (!ensureObserver()) {
      nodes.forEach(revealElement);
      return;
    }

    applyStagger(root);

    nodes.forEach((node) => {
      if (node.classList.contains("is-in")) return;
      if (node.dataset.revealDelay) {
        node.style.setProperty("--reveal-delay", node.dataset.revealDelay);
      }
      const rect = node.getBoundingClientRect();
      const inViewport = rect.top < (window.innerHeight || 0) && rect.bottom > 0;
      if (inViewport) {
        // Sudah di layar saat dipasang: tampil di frame berikutnya tanpa kedipan.
        window.requestAnimationFrame(() => revealElement(node));
      } else {
        observer.observe(node);
      }
    });

    // Pengaman: bila 1,5 detik lalu ada elemen yang masih tersembunyi
    // padahal sudah masuk layar, tampilkan paksa.
    window.setTimeout(() => {
      nodes.forEach((node) => {
        if (node.classList.contains("is-in")) return;
        const rect = node.getBoundingClientRect();
        if (rect.top < (window.innerHeight || 0) && rect.bottom > 0) revealElement(node);
      });
    }, SAFETY_MS);
  }

  /* ---------- scroll UI: progress bar, topbar, back-to-top ---------- */
  let progressEl = null;
  let backEl = null;
  let ticking = false;

  function buildScrollUI() {
    const topbar = document.querySelector(".topbar");
    if (topbar && !topbar.querySelector("[data-fx-progress]")) {
      progressEl = el("div", "scroll-progress");
      progressEl.setAttribute("data-fx-progress", "");
      progressEl.setAttribute("aria-hidden", "true");
      topbar.appendChild(progressEl);
    }
    if (!document.querySelector("[data-fx-back-to-top]")) {
      backEl = el("button", "back-to-top", "\u2191");
      backEl.type = "button";
      backEl.setAttribute("data-fx-back-to-top", "");
      backEl.setAttribute("aria-label", "Kembali ke atas");
      backEl.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      });
      document.body.appendChild(backEl);
    }
  }

  function onScroll() {
    ticking = false;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

    if (progressEl) progressEl.style.transform = `scaleX(${ratio.toFixed(4)})`;
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.classList.toggle("is-scrolled", y > 8);
    if (backEl) backEl.classList.toggle("is-visible", y > 600);
  }

  function attachScroll() {
    if (typeof window.addEventListener !== "function") return;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(onScroll);
    }, { passive: true });
    onScroll();
  }

  /* ---------- count-up ---------- */
  function countUp(node) {
    if (node.dataset.fxCounted === "1") return;
    node.dataset.fxCounted = "1";
    const target = Number(node.dataset.fxCount ?? node.textContent.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(target)) return;
    if (reducedMotion()) {
      node.textContent = String(target);
      return;
    }
    const duration = readToken("--fx-duration", 480);
    const start = performance.now();
    const from = 0;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(from + (target - from) * eased));
      if (p < 1) window.requestAnimationFrame(step);
      else node.textContent = String(target);
    };
    window.requestAnimationFrame(step);
  }

  /* ---------- focus safety ---------- */
  function ensureFocusVisible() {
    document.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      const node = target.closest("[data-reveal]");
      if (node && !node.classList.contains("is-in")) revealElement(node);
    }, true);
  }

  /* ---------- MutationObserver safety net ---------- */
  let mutationTimer = null;
  function attachMutation() {
    if (typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    const mo = new MutationObserver((records) => {
      let pending = false;
      records.forEach((rec) => {
        rec.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("[data-reveal]")) pending = true;
          if (node.querySelectorAll && node.querySelectorAll("[data-reveal]").length) pending = true;
        });
      });
      if (!pending) return;
      if (mutationTimer) window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        mutationTimer = null;
        refresh();
      }, 80);
    });
    mo.observe(target, { childList: true, subtree: true });
  }

  /* ---------- init ---------- */
  function init() {
    if (typeof document === "undefined") return;
    if (typeof window.matchMedia === "function") {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      onMotionChange = () => {
        if (reducedMotion()) {
          document.querySelectorAll("[data-fx-count]").forEach(countUp);
        } else {
          document.documentElement.classList.add("fx-ready");
        }
      };
      if (typeof motionQuery.addEventListener === "function") motionQuery.addEventListener("change", onMotionChange);
      else if (typeof motionQuery.addListener === "function") motionQuery.addListener(onMotionChange);
    }

    const canObserve = typeof IntersectionObserver === "function";
    const canTransform = canObserve && !reducedMotion();
    if (canObserve) document.documentElement.classList.add("fx-ready");

    buildScrollUI();
    attachScroll();
    ensureFocusVisible();
    attachMutation();
    refresh();

    // Parallax dekoratif hero (desktop >= 1024px, nonaktif saat gerak dikurangi)
    if (canTransform && typeof window.matchMedia === "function") {
      const wide = window.matchMedia("(min-width: 1024px)");
      const apply = () => {
        const glows = document.querySelectorAll("[data-fx-parallax]");
        glows.forEach((node) => {
          const depth = Number(node.dataset.fxParallax) || 0.2;
          const rect = node.getBoundingClientRect();
          const offset = Math.max(-40, Math.min(40, (rect.top - window.innerHeight / 2) * depth * -1));
          node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
        });
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.addEventListener("scroll", () => {
          if (!wide.matches) return;
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(() => { apply(); ticking = false; });
        }, { passive: true });
      }
    }
  }

  window.ASAS_FX = { init, refresh, countUp, revealElement };

  init();
})();
