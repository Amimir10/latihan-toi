(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const APP_VERSION = "v5.13.0-ai-tutor";
  const STORAGE_KEY = "asas-gasal-jawa-xi-v1";
  const CUSTOM_PREFIX = STORAGE_KEY + ":soal:";
  const CREATOR_PIN_KEY = STORAGE_KEY + ":creator-pin";
  const KEYS = {
    preferences: STORAGE_KEY,
    customBank: CUSTOM_PREFIX,
    progress: STORAGE_KEY + ":progress",
    studyProgress: STORAGE_KEY + ":progres-belajar",
    studyContent: STORAGE_KEY + ":materi",
    creator: CREATOR_PIN_KEY
  };
  const DEFAULT_CREATOR_PIN = "ASAS2026";
  const LETTERS = ["A", "B", "C", "D", "E"];
  const BANK_LABEL = { latihan: "Latihan" };
  const MODE_LABEL = { belajar: "Belajar", latihan: "Latihan" };
  const FLOW_ENABLED = (() => {
    try {
      return !!(window.history && typeof window.history.pushState === "function");
    } catch (error) {
      return false;
    }
  })();
  const FLOW_PAGE_IDS = { landing: "landingPage", subjects: "subjectsPage", intro: "introPage", modes: "modePage" };
  let subjectRevealObserver = null;
  const STUDY_SECTIONS = { ringkas: "Materi Ringkas", peta: "Mind Mapping", flashcard: "Flashcard", poin: "Poin Penting", glosarium: "Istilah Penting" };
  const STUDY_STATUS = { tersedia: "Materi Tersedia", draft: "Draf Materi", menunggu: "Menunggu Materi" };
  const STUDY_MODULES = {
    "bahasa-jawa": { bedahTembung: true, bedahGatra: true, useGlobalGlossary: true }
  };
  const STUDY_EDITOR_SECTIONS = {
    materiRingkas: "Materi Ringkas",
    mindMap: "Mind Mapping",
    flashcards: "Flashcard",
    poinPenting: "Poin Penting",
    istilahPenting: "Istilah Penting"
  };
  const DAY_LABEL = { 1: "Selasa", 2: "Rabu", 3: "Kamis", 4: "Jumat", 5: "Senin", 6: "Selasa" };
  const EXAM_START = { year: 2026, month: 11, day: 1 };
  const EXAM_GROUP_OFFSETS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 6, 6: 7 };
  const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const WEEKDAYS_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const WEEKDAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const DAY_META = window.DAY_GROUPS || [];
  const ACCENTS = {
    amber: { main: "var(--color-amber-600)", soft: "var(--state-amber-soft)" },
    teal: { main: "var(--state-success)", soft: "var(--state-success-soft)" },
    red: { main: "var(--state-danger)", soft: "var(--state-danger-soft)" },
    green: { main: "var(--state-success)", soft: "var(--state-success-soft)" },
    gold: { main: "var(--color-amber-600)", soft: "var(--state-amber-soft)" },
    slate: { main: "var(--border-strong)", soft: "var(--surface-sunken)" }
  };

  if (!window.QUESTION_BANK) {
    console.error("[ASAS] window.QUESTION_BANK tidak ditemukan. Pastikan questions.js dimuat sebelum app.js.");
    return;
  }

  const BANK = window.QUESTION_BANK;
  const GLOSSARY = window.GLOSSARY || {};
  const SUBJECTS = Object.values(BANK).map((s) => {
    const meta = DAY_META.find((m) => m.id === s.id) || {};
    return {
      id: s.id,
      nama: s.namaMapel,
      namaMapel: s.namaMapel,
      hari: examDateParts(meta.grup || 1).weekdayLong,
      grup: meta.grup || 1,
      durasiMenit: s.durasiMenit || 90
    };
  });

  const state = {
    appPage: FLOW_ENABLED ? "landing" : "room",
    flowSubject: "bahasa-jawa",
    subject: "bahasa-jawa",
    bank: "latihan",
    mode: "belajar",
    theme: "light",
    creatorMode: false,
    wrongOnly: false,
    fullSession: null,
    queue: [],
    current: 0,
    answers: {},
    hintsUsed: {},
    flagged: {},
    optionOrder: {},
    status: "idle",
    startedAt: 0,
    finishedAt: 0,
    finishReason: "Selesai",
    lastResult: null,
    streak: 0,
    bestStreak: 0,
    highlight: false,
    studySection: "ringkas",
    studyCardIndex: 0,
    studyRevealed: false,
    studyProgress: null,
    studyTopicId: "",
    studyFlashFilterTopik: "",
    studyFlashShuffle: false,
    studyFlashMasteredOnly: false,
    studyFlashOrder: [],
    studyFlashOrderKey: "",
    studyGlossaryQuery: "",
    studyGlossaryTopik: "",
    studyGlossarySort: "alfabetis",
    studyGlossaryFavoriteOnly: false,
    studyGlossarySelected: "",
    studyExpandedNodes: {},
    studyEditorDraft: null,
    studyEditorDirty: false,
    editingIndex: -1,
    timerId: 0,
    footClicks: 0,
    footClickTimer: 0,
    importStatusTimer: 0,
    downloadStatusTimer: 0,
    themeTransitionTimer: 0,
    modeTransitionTimer: 0,
    contentTransitionTimer: 0
  };

  let cache = [];
  let aiTutor = null;

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function md(value) {
    const renderer = window.ASAS_MARKDOWN;
    return renderer && typeof renderer.toHtml === "function" ? renderer.toHtml(value) : escapeHTML(value);
  }

  function mdInline(value) {
    const renderer = window.ASAS_MARKDOWN;
    return renderer && typeof renderer.toInlineHtml === "function" ? renderer.toInlineHtml(value) : escapeHTML(value);
  }

  function currentFlowSubject() {
    return BANK[state.flowSubject] ? state.flowSubject : state.subject;
  }

  function flowHash(page, subject = currentFlowSubject(), mode = state.mode) {
    if (page === "subjects") return "#/mapel";
    if (page === "intro") return `#/mapel/${encodeURIComponent(subject)}`;
    if (page === "modes") return `#/mapel/${encodeURIComponent(subject)}/mode`;
    if (page === "room") return `#/ruang/${encodeURIComponent(subject)}/${encodeURIComponent(mode)}`;
    return "#/";
  }

  function routeFromHash() {
    const raw = window.location?.hash || "";
    if (!raw || raw === "#creator") return null;
    let parts;
    try {
      parts = raw.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    } catch (error) {
      return null;
    }
    if (!parts.length) return { page: "landing" };
    if (parts[0] === "mapel") {
      if (!parts[1] || !BANK[parts[1]]) return { page: "subjects" };
      if (parts[2] === "mode") return { page: "modes", subject: parts[1] };
      return { page: "intro", subject: parts[1] };
    }
    if (parts[0] === "ruang") {
      return {
        page: "room",
        subject: BANK[parts[1]] ? parts[1] : state.subject,
        mode: MODE_LABEL[parts[2]] ? parts[2] : state.mode
      };
    }
    return { page: "landing" };
  }

  function setFlowHash(hash, replace = false) {
    if (!FLOW_ENABLED) return;
    try {
      if (window.location.hash === hash) return;
      if (replace && window.history.replaceState) window.history.replaceState(null, "", hash);
      else if (window.history.pushState) window.history.pushState(null, "", hash);
      else window.location.hash = hash;
    } catch (error) {
      try {
        window.location.hash = hash;
      } catch (ignored) {}
    }
  }

  function applyRoute(route) {
    if (!route) return;
    const previousSubject = state.subject;
    state.appPage = route.page;
    if (route.subject && BANK[route.subject]) state.flowSubject = route.subject;
    if (route.page === "room") {
      if (route.subject && BANK[route.subject]) state.subject = route.subject;
      if (route.mode && MODE_LABEL[route.mode]) state.mode = route.mode;
    }
    if (state.subject !== previousSubject && aiTutor) aiTutor.reset();
    renderAppPage();
  }

  function syncRouteToState() {
    if (!FLOW_ENABLED) return;
    applyRoute(routeFromHash());
    renderShell();
    renderWorkspace();
  }

  function navigateFlow(page, options = {}) {
    const subject = BANK[options.subject] ? options.subject : currentFlowSubject();
    const mode = MODE_LABEL[options.mode] ? options.mode : state.mode;
    state.flowSubject = subject;
    state.appPage = page;
    if (page === "room") {
      if (subject !== state.subject) switchSubject(subject);
      if (mode !== state.mode) switchMode(mode);
      state.subject = subject;
      state.mode = mode;
      savePreferences();
      renderShell();
      renderWorkspace();
    }
    setFlowHash(flowHash(page, subject, mode));
    renderAppPage();
    if (page !== "room" && window.scrollTo) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function subjectPracticeInfo(subject) {
    const count = bankCount(subject.id, "latihan");
    return {
      count,
      ready: count > 0,
      label: count ? `${count} soal tersedia` : "Menunggu kisi-kisi"
    };
  }

  function subjectStudyInfo(subject) {
    const content = loadStudyContent(subject.id);
    const status = content?.status || "menunggu";
    return {
      content,
      status,
      ready: status === "tersedia",
      label: STUDY_STATUS[status] || STUDY_STATUS.menunggu
    };
  }

  function statusChipHtml(kind, subject) {
    if (kind === "materi") {
      const study = subjectStudyInfo(subject);
      const studyStatusClass = study.ready ? "ready" : (study.status === "draft" ? "partial" : "empty");
      const studyStatusLabel = study.ready ? "Materi tersedia" : (study.status === "draft" ? "Materi masih berupa draf." : "Belum ada materi");
      return `<span class="flow-status ${studyStatusClass}" data-status="${studyStatusClass}" aria-label="${escapeHTML(studyStatusLabel)}">${escapeHTML(studyStatusLabel)}</span>`;
    }
    if (kind === "latihan") {
      const practice = subjectPracticeInfo(subject);
      const practiceStatusClass = practice.ready ? "ready" : "empty";
      const practiceStatusLabel = practice.ready ? `${practice.count} soal latihan` : "Belum ada latihan";
      return `<span class="flow-status ${practiceStatusClass}" data-status="${practiceStatusClass}" aria-label="${escapeHTML(practiceStatusLabel)}">${escapeHTML(practiceStatusLabel)}</span>`;
    }
    return "";
  }

  function subjectTopics(subject) {
    const authored = (loadStudyContent(subject.id)?.topik || []).map((topic) => topic.nama).filter(Boolean);
    if (authored.length) return authored;
    return [...new Set((BANK[subject.id]?.latihan || []).map((q) => q.topik).filter(Boolean))];
  }

  function subjectDescription(subject) {
    const study = subjectStudyInfo(subject);
    const topics = subjectTopics(subject);
    if (study.ready && topics.length) return `Materi tersedia: ${topics.join(", ")}.`;
    if (study.status === "draft") return "Materi masih berupa draf.";
    return "Materi dan latihan sedang disiapkan.";
  }

  function revealSubjectCards() {
    const grid = $("subjectCardGrid");
    const cards = grid ? Array.from(grid.querySelectorAll(".subject-card")) : [];
    if (!cards.length) return;
    if (subjectRevealObserver) subjectRevealObserver.disconnect();
    const prefersReducedMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || typeof IntersectionObserver !== "function") {
      cards.forEach((card) => card.classList.add("subject-card-visible"));
      return;
    }
    subjectRevealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("subject-card-visible");
        observer.unobserve(entry.target);
      });
    }, { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    cards.forEach((card, i) => {
      card.style.setProperty("--reveal-delay", `${(i % 3) * 65}ms`);
      subjectRevealObserver.observe(card);
    });
  }

  function dateTileHtml(grup, { small = false } = {}) {
    const tile = formatExamTile(grup);
    return `<span class="date-tile${small ? " date-tile-sm" : ""}" aria-label="${escapeHTML(formatExamLong(grup))}"><span class="date-tile-face" aria-hidden="true"><span class="date-tile-weekday">${escapeHTML(tile.weekdayShort)}</span><strong class="date-tile-date">${escapeHTML(tile.day)}</strong><span class="date-tile-month">${escapeHTML(tile.monthShort)}</span></span></span>`;
  }

  function subjectGroupTitleHtml(grup, items) {
    const group = Number(grup) || 1;
    const readyCount = items.filter((subject) => subjectStudyInfo(subject).ready).length;
    const progress = readyCount > 0 && readyCount < items.length
      ? `<span class="subject-group-progress">${readyCount} dari ${items.length} materi siap</span>`
      : "";
    return `<div class="subject-group-heading">
      ${dateTileHtml(group)}
      <div class="subject-group-copy">
        <p class="subject-group-title">${escapeHTML(formatExamLong(group))} · Grup ${group}</p>
        <p class="subject-group-meta">${items.length} mapel${progress}</p>
      </div>
    </div>`;
  }

  function subjectCardHtml(subject, index) {
    const study = subjectStudyInfo(subject);
    return `<button class="subject-card ${study.ready ? "subject-card-has-material" : ""}" type="button" data-subject-card="${escapeHTML(subject.id)}">
      <span class="subject-card-strip" aria-hidden="true"></span>
      <span class="subject-card-top">
        <span class="subject-card-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="subject-card-go" aria-hidden="true">→</span>
      </span>
      <strong class="subject-card-name">${escapeHTML(subject.namaMapel)}</strong>
      <span class="subject-card-desc">${escapeHTML(subjectDescription(subject))}</span>
      <span class="subject-card-statuses">
        ${statusChipHtml("materi", subject)}
        ${statusChipHtml("latihan", subject)}
      </span>
    </button>`;
  }

  function renderSubjectCards() {
    const grid = $("subjectCardGrid");
    if (!grid) return;
    const count = $("subjectCountFlow");
    if (count) count.textContent = `${SUBJECTS.length} mapel`;
    const groups = [...new Set(SUBJECTS.map((s) => Number(s.grup) || 1))]
      .sort((a, b) => a - b);
    grid.innerHTML = groups.map((grup) => {
      const items = SUBJECTS.filter((s) => (Number(s.grup) || 1) === grup);
      return `<div class="subject-card-group">
        ${subjectGroupTitleHtml(grup, items)}
        <div class="subject-card-row">${items.map((subject) => subjectCardHtml(subject, SUBJECTS.indexOf(subject))).join("")}</div>
      </div>`;
    }).join("");
    revealSubjectCards();
  }

  function renderIntroPage() {
    const subject = BANK[state.flowSubject] ? BANK[state.flowSubject] : activeSubject();
    const meta = SUBJECTS.find((s) => s.id === subject.id) || activeSubject();
    state.flowSubject = subject.id;
    const study = subjectStudyInfo(meta);
    const practice = subjectPracticeInfo(meta);
    const topics = subjectTopics(meta);
    if ($("introSubjectName")) $("introSubjectName").textContent = meta.namaMapel;
    if ($("introSubjectSchedule")) $("introSubjectSchedule").textContent = `${formatExamLong(meta.grup)} · Grup ${meta.grup} · Durasi ${meta.durasiMenit} menit`;
    if ($("introExamBadge")) $("introExamBadge").innerHTML = dateTileHtml(meta.grup);
    const objective = topics.length
      ? `Tujuan pembelajaran khusus belum tersedia sebagai data tersendiri. Cakupan materi yang tercatat menjadi acuan: ${topics.join(", ")}.`
      : "Tujuan pembelajaran khusus belum tersedia. Materi dapat ditambahkan melalui Mode Pembuat bila tersedia.";
    const topicText = topics.length
      ? `<ul class="intro-topic-list">${topics.map((topic) => `<li>${escapeHTML(topic)}</li>`).join("")}</ul>`
      : `<p class="intro-empty">Topik atau cakupan materi belum tercatat untuk mapel ini.</p>`;
    const modeRows = [
      ["Belajar", "Materi ringkas, mind mapping, flashcard, poin penting, dan istilah penting."],
      ["Latihan", "Soal dengan umpan balik langsung, petunjuk, pembahasan, dan evaluasi."]
    ].map(([name, desc]) => `<li><strong>${name}</strong><span>${desc}</span></li>`).join("");
    const body = $("introBody");
    if (body) {
      body.innerHTML = `<div class="intro-grid">
        <section class="intro-block">
          <p class="eyebrow">Deskripsi Singkat</p>
          <p class="intro-paragraph">${escapeHTML(subjectDescription(meta))}</p>
        </section>
        <section class="intro-block">
          <p class="eyebrow">Tujuan Pembelajaran</p>
          <p class="intro-paragraph">${escapeHTML(objective)}</p>
        </section>
        <section class="intro-block intro-block-wide">
          <p class="eyebrow">Topik / Cakupan Materi</p>
          ${topicText}
        </section>
        <section class="intro-block">
          <p class="eyebrow">Ketersediaan</p>
          <div class="intro-availability">
            ${statusChipHtml("materi", meta)}
            ${statusChipHtml("latihan", meta)}
          </div>
        </section>
        <section class="intro-block intro-block-wide">
          <p class="eyebrow">Mode yang Tersedia</p>
          <ul class="intro-mode-list">${modeRows}</ul>
        </section>
      </div>`;
    }
  }

  function renderModePage() {
    const subject = BANK[state.flowSubject] ? BANK[state.flowSubject] : activeSubject();
    if ($("modeSubjectName")) $("modeSubjectName").textContent = subject.namaMapel;
  }

  function renderAppPage() {
    if (!FLOW_ENABLED) {
      if (document.body) document.body.dataset.page = "room";
      return;
    }
    if (document.body) document.body.dataset.page = state.appPage;
    if (document.documentElement) document.documentElement.dataset.page = state.appPage;
    Object.entries(FLOW_PAGE_IDS).forEach(([page, id]) => {
      $(id)?.classList.toggle("hidden", state.appPage !== page);
    });
    const range = $("landingExamRange");
    if (range) range.textContent = `Ujian ${formatExamRange(1, 6)}`;
    renderSubjectCards();
    renderIntroPage();
    renderModePage();
  }

  function examDateParts(grup) {
    const group = Number(grup) || 1;
    const offset = EXAM_GROUP_OFFSETS[group] ?? 0;
    const date = new Date(Date.UTC(EXAM_START.year, EXAM_START.month, EXAM_START.day + offset));
    const weekday = date.getUTCDay();
    const month = MONTHS_ID[date.getUTCMonth()];
    return {
      date,
      weekdayLong: WEEKDAYS_LONG[weekday],
      weekdayShort: WEEKDAYS_SHORT[weekday],
      day: String(date.getUTCDate()),
      monthLong: month,
      monthShort: month.slice(0, 3),
      year: date.getUTCFullYear()
    };
  }

  function formatExamLong(grup) {
    const parts = examDateParts(grup);
    return `${parts.weekdayLong}, ${parts.day} ${parts.monthLong} ${parts.year}`;
  }

  function formatExamShort(grup) {
    const parts = examDateParts(grup);
    return `${parts.day} ${parts.monthShort} ${parts.year}`;
  }

  function formatExamTile(grup) {
    const parts = examDateParts(grup);
    return { weekdayShort: parts.weekdayShort, day: parts.day, monthShort: parts.monthShort };
  }

  function formatExamRange(grupAwal, grupAkhir) {
    const start = examDateParts(grupAwal);
    const end = examDateParts(grupAkhir);
    if (start.year === end.year && start.monthLong === end.monthLong) {
      return `${start.day} – ${end.day} ${end.monthShort} ${end.year}`;
    }
    if (start.year === end.year) {
      return `${start.day} ${start.monthShort} – ${end.day} ${end.monthShort} ${end.year}`;
    }
    return `${start.day} ${start.monthShort} ${start.year} – ${end.day} ${end.monthShort} ${end.year}`;
  }

  function examDateOnly(grup, short = false) {
    const parts = examDateParts(grup);
    return short
      ? `${parts.day} ${parts.monthShort} ${parts.year}`
      : `${parts.day} ${parts.monthLong} ${parts.year}`;
  }

  function tDay(subject) {
    return examDateParts(subject?.grup || 1).weekdayLong;
  }

  function warnExamDateMismatch(subject, expected) {
    const group = Number(subject?.grup) || 1;
    const meta = DAY_META.find((item) => Number(item.grup) === group);
    const id = subject?.id || subject?.namaMapel || meta?.id || `grup-${group}`;
    const key = `${id}|${group}|${expected}`;
    if (warnedExamDateGroups.has(key)) return;
    warnedExamDateGroups.add(key);
    console.warn(`[ASAS] Hari ${subject?.hari || meta?.hari} untuk ${id} tidak cocok; memakai ${expected} dari tanggal ujian.`);
  }

  function subjectExamLabel(subject) {
    const label = formatExamLong(subject?.grup || 1);
    const expected = label.split(",")[0];
    const group = Number(subject?.grup) || 1;
    const meta = DAY_META.find((item) => Number(item.grup) === group);
    const declared = subject?.hari || meta?.hari || DAY_LABEL[group];
    if (declared && declared !== expected) warnExamDateMismatch(subject, expected);
    return label;
  }

  function examDateForSubject(subject, short = false) {
    if (short) return formatExamShort(subject?.grup || 1);
    return subjectExamLabel(subject);
  }

  const warnedExamDateGroups = new Set();

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function shuffleArray(input) {
    const arr = input.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function accentFor(key) {
    return ACCENTS[key] || ACCENTS.amber;
  }

  function safeFilename(value) {
    return String(value || "ASAS").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ASAS";
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function validateQuestion(q) {
    return isPlainObject(q) && typeof q.id === "string" && !!q.id
      && typeof q.question === "string" && !!q.question.trim()
      && isPlainObject(q.options)
      && LETTERS.every((l) => typeof q.options[l] === "string")
      && LETTERS.includes(q.answer);
  }

  function validateOptionOrder(order) {
    return Array.isArray(order) && order.length === 5 && new Set(order).size === 5 && order.every((l) => LETTERS.includes(l));
  }

  function activeSubject() {
    return SUBJECTS.find((s) => s.id === state.subject) || SUBJECTS[0];
  }

  function currentTutorContext() {
    const subject = activeSubject();
    const topics = studyTopicList(loadStudyContent(subject.id));
    const selectedId = state.studyTopicId || topics[0]?.id || "";
    const selected = topics.find((topic) => topic.id === selectedId);
    return {
      subjectId: subject.id,
      subjectName: subject.namaMapel,
      topic: selected?.nama || "Umum"
    };
  }

  function mountAITutor() {
    const api = window.AI_TUTOR;
    if (!api || !$("aiTutorForm") || !$("aiTutorLog") || !$("aiTutorEmpty")) return;
    aiTutor = api.createController({
      elements: {
        form: $("aiTutorForm"),
        input: $("aiTutorInput"),
        sendBtn: $("aiTutorSendBtn"),
        sendLabel: $("aiTutorSendLabel"),
        log: $("aiTutorLog"),
        empty: $("aiTutorEmpty"),
        status: $("aiTutorStatusText"),
        statusBox: $("aiTutorStatus"),
        context: $("aiTutorContext"),
        resetBtn: $("aiTutorResetBtn")
      },
      endpoint: api.resolveEndpoint({
        location: window.location,
        override: window.AI_TUTOR_ENDPOINT,
        useDirectLocal: false
      }),
      getContext: currentTutorContext,
      fetchImpl: (...args) => window.fetch(...args),
      createElement: (tag) => document.createElement(tag)
    });
    $("aiTutorForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (aiTutor) aiTutor.submit($("aiTutorInput").value);
    });
    $("aiTutorResetBtn").addEventListener("click", () => {
      if (aiTutor) aiTutor.reset();
    });
    aiTutor.refreshContext();
  }

  function isJawaSubject(subject = state.subject) {
    return subject === "bahasa-jawa";
  }

  function tBank(key) {
    return BANK_LABEL[key] || key;
  }

  function tMode(key) {
    return MODE_LABEL[key] || key;
  }

  function tStudySection(key) {
    return STUDY_SECTIONS[key] || key;
  }

  function tStudyStatus(key) {
    return STUDY_STATUS[key] || key;
  }

  function tEditorSection(key) {
    return key === "topik" ? "Daftar Topik" : (STUDY_EDITOR_SECTIONS[key] || key);
  }

  function tDay(subject) {
    return subject.hari;
  }


  function studyContentKey(subject = state.subject) {
    return KEYS.studyContent + ":" + subject;
  }

  function studyProgressKey(subject = state.subject) {
    return KEYS.studyProgress + ":" + subject;
  }

  function studyUnique(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
  }

  function studyClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function studySlug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "umum";
  }

  function studyText(value) {
    return String(value == null ? "" : value).trim();
  }

  function studyTopicList(content) {
    const explicit = Array.isArray(content?.topik) ? content.topik : [];
    if (explicit.length) {
      return explicit.map((topic) => ({
        id: studyText(topic?.id) || studySlug(topic?.nama),
        nama: studyText(topic?.nama) || "Umum",
        indikatorKisi: Array.isArray(topic?.indikatorKisi) ? topic.indikatorKisi : []
      }));
    }
    const names = studyUnique([
      ...(content?.ringkas || []).map((item) => item.topik),
      ...(content?.flashcards || []).map((item) => item.topik),
      ...(content?.poin || []).map((item) => item.topik),
      ...(content?.glosarium || []).map((item) => item.topik)
    ]);
    return names.map((nama) => ({ id: studySlug(nama), nama, indikatorKisi: [] }));
  }

  function studyTopicName(content, id) {
    return studyTopicList(content).find((topic) => topic.id === id)?.nama || (id === "umum" ? "Umum" : id || "Umum");
  }

  function studyModules(subjectId = state.subject) {
    return STUDY_MODULES[subjectId] || {};
  }

  function resetStudyUiState() {
    state.studySection = "ringkas";
    state.studyCardIndex = 0;
    state.studyRevealed = false;
    state.studyTopicId = "";
    state.studyFlashFilterTopik = "";
    state.studyFlashShuffle = false;
    state.studyFlashMasteredOnly = false;
    state.studyFlashOrder = [];
    state.studyFlashOrderKey = "";
    state.studyGlossaryQuery = "";
    state.studyGlossaryTopik = "";
    state.studyGlossarySort = "alfabetis";
    state.studyGlossaryFavoriteOnly = false;
    state.studyGlossarySelected = "";
    state.studyExpandedNodes = {};
  }

  function buildBuiltinStudy(subjectId) {
    const authored = window.STUDY_CONTENT?.[subjectId];
    if (authored) {
      const clean = validateStudyContent(authored);
      if (clean) return clean;
    }
    const bank = BANK[subjectId];
    const all = bank?.latihan || [];
    if (!all.length) {
      return {
        status: "menunggu",
        sumber: "",
        topik: [],
        ringkas: [],
        mindMap: null,
        flashcards: [],
        poin: [],
        glosarium: [],
        materiRingkas: [],
        poinPenting: [],
        istilahPenting: []
      };
    }
    const topics = new Map();
    all.forEach((q) => {
      const topic = q.topik || "Umum";
      if (!topics.has(topic)) topics.set(topic, []);
      topics.get(topic).push(q);
    });
    const ringkas = [...topics.entries()].map(([judul, items]) => {
      const subtopik = studyUnique(items.map((q) => q.subtopik));
      const indikator = studyUnique(items.map((q) => q.indikator));
      const tingkat = studyUnique(items.map((q) => q.levelKisi || (q.level ? `Level ${q.level}` : "")));
      const pokok = subtopik.length ? subtopik.join(", ") : "aspek utama topik";
      const isi = [
        `Topik "${judul}" membahas ${pokok}.`,
        indikator.length ? `Fokus penilaian: ${indikator.join("; ")}.` : "",
        tingkat.length ? `Tingkat kognitif yang dilatih: ${tingkat.join(", ")}.` : "",
        "Ringkasan ini disusun dari butir soal yang tersedia. Jika uraian materi tidak disediakan, penjelasan ini dibuat dari indikator, subtopik, dan konteks soal, bukan kutipan dari sumber lain."
      ].filter(Boolean).join("\n\n");
      return { judul, isi, subtopik, indikatorKisi: indikator };
    });
    const mindMap = {
      pusat: bank.namaMapel || subjectId,
      cabang: [...topics.entries()].map(([judul, items], i) => ({
        id: `auto-cabang-${i + 1}`,
        judul,
        anak: studyUnique([
          ...items.map((q) => q.subtopik),
          ...items.map((q) => q.levelKisi || (q.level ? `Level ${q.level}` : ""))
        ])
      }))
    };
    const flashcards = all.map((q) => ({
      id: q.id,
      topik: q.topik || "Umum",
      pertanyaan: q.question || "",
      jawaban: [
        q.answer ? `${q.answer}. ${q.options?.[q.answer] || ""}`.trim() : "",
        q.explanation || ""
      ].filter(Boolean).join(" — ")
    }));
    const poin = [];
    const glosarium = [];
    const subjectGlossary = studyModules(subjectId).useGlobalGlossary ? GLOSSARY : {};
    const seenPoin = new Set();
    const seenGlosarium = new Set();
    all.forEach((q) => {
      (q.keyTerms || []).forEach((term) => {
        const name = typeof term === "string" ? term : term.term || term.istilah || term.kata;
        const meaning = typeof term === "string"
          ? (subjectGlossary[name] || "Istilah penting dalam bank soal ini.")
          : (term.meaning || term.teges || term.definisi || term.arti || "Istilah penting dalam bank soal ini.");
        if (!name) return;
        if (!seenPoin.has(name)) {
          seenPoin.add(name);
          poin.push({ topik: q.topik || "Umum", teks: `${name} — ${meaning}` });
        }
        if (!seenGlosarium.has(name)) {
          seenGlosarium.add(name);
          glosarium.push({ istilah: name, arti: meaning });
        }
      });
    });
    return {
      status: "tersedia",
      sumber: `Ringkasan ini disusun dari ${all.length} butir soal ${bank.namaMapel} yang tersedia. Bila uraian materi tidak disediakan, penjelasan dibuat dari indikator, subtopik, dan konteks butir soal; bukan kutipan dari sumber lain.`,
      topik: studyTopicList({ ringkas, flashcards, poin, glosarium }),
      ringkas,
      mindMap,
      flashcards,
      poin,
      glosarium,
      materiRingkas: ringkas,
      poinPenting: poin,
      istilahPenting: glosarium
    };
  }

  function validateStudyContent(raw) {
    if (!isPlainObject(raw)) return null;
    const pick = (obj, ...keys) => {
      for (const key of keys) {
        if (obj && obj[key] != null && obj[key] !== "") return obj[key];
      }
      return "";
    };
    const indicators = (value) => Array.isArray(value)
      ? value.map(Number).filter((n) => Number.isFinite(n))
      : [];
    const topikSource = pick(raw, "topik", "topics");
    const topik = (Array.isArray(topikSource) ? topikSource : []).map((item) => {
      const nama = studyText(typeof item === "string" ? item : pick(item, "nama", "judul", "name"));
      return nama ? {
        id: studyText(pick(item, "id")) || studySlug(nama),
        nama,
        indikatorKisi: indicators(pick(item, "indikatorKisi"))
      } : null;
    }).filter(Boolean);
    const topicContext = { topik };
    const topicIdFor = (item, fallbackName = "") => studyText(pick(item, "topikId", "topicId"))
      || studySlug(studyText(pick(item, "topik", "topic")) || fallbackName);
    const topicNameFor = (item, fallbackId = "") => studyText(pick(item, "topik", "topic"))
      || studyTopicName(topicContext, studyText(pick(item, "topikId", "topicId")) || fallbackId);
    const topicIndicatorsFor = (item, fallbackName = "") => {
      const direct = indicators(pick(item, "indikatorKisi", "indikator"));
      if (direct.length) return direct;
      const id = studyText(pick(item, "topikId", "topicId"))
        || studySlug(studyText(pick(item, "topik", "topic")) || fallbackName);
      const nama = studyText(pick(item, "topik", "topic")) || fallbackName;
      const found = topik.find((t) => t.id === id || t.nama === nama);
      return found ? [...found.indikatorKisi] : [];
    };
    const ringkasSource = pick(raw, "materiRingkas", "ringkas");
    const ringkas = (Array.isArray(ringkasSource) ? ringkasSource : []).map((item) => {
      const judul = studyText(pick(item, "judul", "nama"));
      const isi = studyText(pick(item, "isi", "penjelasan", "konten"));
      const topikId = topicIdFor(item, judul);
      return judul && isi ? {
        id: studyText(pick(item, "id")) || `mr-${topikId}-${studySlug(judul)}`,
        topikId,
        topik: topicNameFor(item, topikId),
        judul,
        isi,
        subtopik: studyUnique(Array.isArray(pick(item, "subtopik")) ? pick(item, "subtopik") : []),
        indikatorKisi: topicIndicatorsFor(item, judul)
      } : null;
    }).filter(Boolean);
    const normalizeNode = (node, path = "n0") => {
      if (typeof node === "string" || typeof node === "number") {
        const judul = studyText(node);
        return judul ? { judul, anak: [] } : null;
      }
      if (!isPlainObject(node)) return null;
      const judul = studyText(pick(node, "judul", "nama", "label"));
      if (!judul) return null;
      const children = pick(node, "anak", "children", "anakCabang", "cabang");
      return {
        id: studyText(pick(node, "id")) || path,
        topikId: topicIdFor(node, judul),
        judul,
        indikatorKisi: topicIndicatorsFor(node, judul),
        anak: (Array.isArray(children) ? children : []).map((child, i) => normalizeNode(child, `${path}-${i}`)).filter(Boolean)
      };
    };
    const mindSource = pick(raw, "mindMap", "peta");
    const cabang = (Array.isArray(pick(mindSource, "cabang", "branches")) ? pick(mindSource, "cabang", "branches") : [])
      .map((item, i) => normalizeNode(item, `mm-${i}`))
      .filter(Boolean);
    const mindMap = cabang.length
      ? { pusat: studyText(pick(mindSource, "pusat", "center")) || activeSubject().namaMapel, cabang }
      : null;
    const flashSource = pick(raw, "flashcards", "kartu");
    const flashcards = (Array.isArray(flashSource) ? flashSource : []).map((item) => {
      const pertanyaan = studyText(pick(item, "pertanyaan", "front", "question"));
      const jawaban = studyText(pick(item, "jawaban", "back", "answer"));
      const topikId = topicIdFor(item, "Umum");
      return pertanyaan && jawaban ? {
        id: studyText(pick(item, "id")) || `fc-${studySlug(pertanyaan).slice(0, 28)}`,
        topikId,
        topik: topicNameFor(item, topikId),
        jenis: studyText(pick(item, "jenis", "type")) || "Pengertian",
        pertanyaan,
        jawaban
      } : null;
    }).filter(Boolean);
    const poinSource = pick(raw, "poinPenting", "poin");
    const poin = (Array.isArray(poinSource) ? poinSource : []).map((item) => {
      const value = typeof item === "string" ? item : pick(item, "teks", "text", "isi");
      const teks = studyText(value);
      const topikId = topicIdFor(item, "Umum");
      return teks ? {
        id: studyText(pick(item, "id")) || `pp-${studySlug(teks).slice(0, 28)}`,
        topikId,
        topik: topicNameFor(item, topikId),
        teks,
        wajib: pick(item, "wajib", "required") === true
      } : null;
    }).filter(Boolean);
    const glosariumSource = pick(raw, "istilahPenting", "glosarium");
    const glosarium = (Array.isArray(glosariumSource) ? glosariumSource : []).map((item) => {
      const istilah = studyText(pick(item, "istilah", "term"));
      const arti = studyText(pick(item, "arti", "meaning", "definisi"));
      const topikId = topicIdFor(item, "Umum");
      return istilah && arti ? {
        id: studyText(pick(item, "id")) || `ip-${studySlug(istilah)}`,
        topikId,
        topik: topicNameFor(item, topikId),
        istilah,
        arti,
        penjelasan: studyText(pick(item, "penjelasan", "keterangan")),
        contoh: studyText(pick(item, "contoh", "example"))
      } : null;
    }).filter(Boolean);
    const status = raw.status === "draft" ? "draft" : "tersedia";
    if (!ringkas.length && !mindMap && !flashcards.length && !poin.length && !glosarium.length && status !== "draft") return null;
    const sumber = studyText(raw.sumber) || "Materi dikelola melalui Mode Pembuat.";
    return {
      status,
      sumber,
      topik,
      ringkas,
      mindMap,
      flashcards,
      poin,
      glosarium,
      materiRingkas: studyClone(ringkas),
      poinPenting: studyClone(poin),
      istilahPenting: studyClone(glosarium)
    };
  }

  function loadStudyContent(subject = state.subject) {
    try {
      const raw = JSON.parse(localStorage.getItem(studyContentKey(subject)) || "null");
      const custom = validateStudyContent(raw);
      if (custom) return custom;
    } catch (error) {
      console.warn("[ASAS] Materi kustom tidak dapat dibaca.", error);
    }
    return buildBuiltinStudy(subject);
  }

  function saveStudyContent(content, subject = state.subject) {
    const clean = validateStudyContent(content);
    if (!clean) throw new Error("Minimal satu bagian materi harus diisi.");
    localStorage.setItem(studyContentKey(subject), JSON.stringify(clean));
  }

  function clearStudyContent(subject = state.subject) {
    localStorage.removeItem(studyContentKey(subject));
  }

  function defaultStudyProgress() {
    return {
      sections: {},
      flashcards: {},
      flashcardsMastered: {},
      glossary: {},
      favorites: {},
      poin: {},
      topics: {},
      updatedAt: 0
    };
  }

  function loadStudyProgress(subject = state.subject) {
    const fallback = defaultStudyProgress();
    try {
      const raw = JSON.parse(localStorage.getItem(studyProgressKey(subject)) || "null");
      if (!isPlainObject(raw)) return fallback;
      return {
        sections: isPlainObject(raw.sections) ? raw.sections : {},
        flashcards: isPlainObject(raw.flashcards) ? raw.flashcards : {},
        flashcardsMastered: isPlainObject(raw.flashcardsMastered) ? raw.flashcardsMastered : {},
        glossary: isPlainObject(raw.glossary) ? raw.glossary : {},
        favorites: isPlainObject(raw.favorites) ? raw.favorites : {},
        poin: isPlainObject(raw.poin) ? raw.poin : {},
        topics: isPlainObject(raw.topics) ? raw.topics : {},
        updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0
      };
    } catch (error) {
      console.warn("[ASAS] Progres belajar tidak dapat dibaca.", error);
      return fallback;
    }
  }

  function saveStudyProgress() {
    try {
      state.studyProgress.updatedAt = Date.now();
      localStorage.setItem(studyProgressKey(), JSON.stringify(state.studyProgress));
    } catch (error) {
      console.warn("[ASAS] Progres belajar tidak dapat disimpan.", error);
    }
  }

  function markStudySeen(kind, key) {
    if (!state.studyProgress || !key) return;
    if (!state.studyProgress[kind]) state.studyProgress[kind] = {};
    if (state.studyProgress[kind][key]) return;
    state.studyProgress[kind][key] = true;
    saveStudyProgress();
  }

  function toggleStudyMark(kind, key) {
    if (!state.studyProgress || !key) return;
    if (!state.studyProgress[kind]) state.studyProgress[kind] = {};
    if (state.studyProgress[kind][key]) delete state.studyProgress[kind][key];
    else state.studyProgress[kind][key] = true;
    saveStudyProgress();
  }

  function studyProgressSummary(content) {
    const progress = state.studyProgress || defaultStudyProgress();
    const sectionsDone = Object.keys(STUDY_SECTIONS).filter((key) => progress.sections[key]).length;
    const cardsDone = content.flashcards.filter((card) => progress.flashcards[card.id || card.pertanyaan]).length;
    const termsDone = content.glosarium.filter((term) => progress.glossary[term.id || term.istilah]).length;
    const masteredDone = content.flashcards.filter((card) => progress.flashcardsMastered?.[card.id || card.pertanyaan]).length;
    const favoriteDone = content.glosarium.filter((term) => progress.favorites?.[term.id || term.istilah]).length;
    const poinDone = content.poin.filter((item) => progress.poin?.[item.id || item.teks]).length;
    return { sectionsDone, cardsDone, termsDone, masteredDone, favoriteDone, poinDone };
  }

  function findQuestionById(id) {
    if (!id) return null;
    for (const bank of Object.values(BANK)) {
      const found = (bank?.latihan || []).find((q) => q.id === id);
      if (found) return found;
    }
    return null;
  }

  function currentStudyQuestion() {
    const content = loadStudyContent();
    const card = content.flashcards[state.studyCardIndex] || content.flashcards[0];
    if (!card) return null;
    const linked = findQuestionById(card.id);
    if (linked) return linked;
    return {
      id: card.id,
      question: card.pertanyaan || "",
      stimulusText: card.jawaban || "",
      options: {},
      keyTerms: []
    };
  }

  function customKey(subject = state.subject, bank = state.bank) {
    return `${KEYS.customBank}${subject}:${bank}`;
  }

  function progressKey() {
    return `${KEYS.progress}:${state.subject}:${state.bank}:${state.mode}`;
  }

  function loadPreferences() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.preferences) || "{}");
      if (!isPlainObject(raw)) return;
      if (typeof raw.subject === "string" && BANK[raw.subject]) state.subject = raw.subject;
      state.bank = "latihan";
      if (MODE_LABEL[raw.mode]) state.mode = raw.mode;
      if (STUDY_SECTIONS[raw.studySection]) state.studySection = raw.studySection;
      if (raw.theme === "dark" || raw.theme === "light") state.theme = raw.theme;
    } catch (error) {
      console.warn("[ASAS] Preferensi tidak dapat dibaca.", error);
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(KEYS.preferences, JSON.stringify({
        subject: state.subject,
        bank: state.bank,
        mode: state.mode,
        studySection: state.studySection,
        theme: state.theme
      }));
    } catch (error) {
      console.warn("[ASAS] Preferensi tidak dapat disimpan.", error);
    }
  }

  function loadCustomQuestions(subject = state.subject, bank = state.bank) {
    try {
      const raw = JSON.parse(localStorage.getItem(customKey(subject, bank)) || "[]");
      return Array.isArray(raw) ? raw.map((q, i) => normalizeQuestion(q, i)).filter(validateQuestion) : [];
    } catch (error) {
      console.warn("[ASAS] Soal kustom tidak dapat dibaca.", error);
      return [];
    }
  }

  function saveCustomQuestions(list, subject = state.subject, bank = state.bank) {
    try {
      const clean = list.map((q, i) => normalizeQuestion(q, i)).filter(validateQuestion);
      if (clean.length !== list.length) console.warn("[ASAS] Sebagian soal kustom ditolak karena data tidak valid.");
      localStorage.setItem(customKey(subject, bank), JSON.stringify(clean));
    } catch (error) {
      console.warn("[ASAS] Soal kustom tidak dapat disimpan.", error);
    }
  }

  function normalizeQuestion(q, index = 0) {
    const options = q.options || {};
    return {
      ...q,
      id: String(q.id || `custom-${Date.now().toString(36)}-${index + 1}`),
      no: Number(q.no) || index + 1,
      topik: q.topik || "Umum",
      subtopik: q.subtopik || "Bank Kustom",
      indikator: q.indikator || "",
      level: q.level || "C2",
      stimulus: q.stimulus || null,
      stimulusText: q.stimulusText || "",
      question: q.question || "",
      options: Object.fromEntries(LETTERS.map((l) => [l, String(options[l] || "")])),
      answer: LETTERS.includes(q.answer) ? q.answer : "A",
      explanation: q.explanation || "Belum ada pembahasan.",
      hints: Array.isArray(q.hints) ? q.hints.filter(Boolean) : [],
      keyTerms: Array.isArray(q.keyTerms) ? q.keyTerms : [],
      imageUrl: q.imageUrl || "",
      imageCaption: q.imageCaption || "",
      posterMockup: q.posterMockup || null
    };
  }

  function activeQuestions() {
    const builtin = (BANK[state.subject]?.[state.bank] || []).map((q, i) => normalizeQuestion(q, i));
    const custom = loadCustomQuestions().map((q, i) => normalizeQuestion(q, builtin.length + i));
    return [...builtin, ...custom];
  }

  function refreshActiveQuestions() {
    cache = activeQuestions();
    return cache;
  }

  function byId(id) {
    return cache.find((q) => q.id === id);
  }

  function validateProgressData(raw, ids) {
    if (!isPlainObject(raw) || !Array.isArray(raw.queue)) return null;
    const queue = [...new Set(raw.queue.filter((id) => typeof id === "string" && ids.has(id)))];
    if (!queue.length) return null;
    const allowed = new Set(queue);
    const answers = isPlainObject(raw.answers)
      ? Object.fromEntries(Object.entries(raw.answers).filter(([id, letter]) => allowed.has(id) && LETTERS.includes(letter)))
      : {};
    const optionOrder = isPlainObject(raw.optionOrder)
      ? Object.fromEntries(Object.entries(raw.optionOrder).filter(([id, order]) => allowed.has(id) && validateOptionOrder(order)))
      : {};
    const lastValid = isPlainObject(raw.lastResult)
      && isFiniteNumber(raw.lastResult.score)
      && isFiniteNumber(raw.lastResult.correct)
      && isFiniteNumber(raw.lastResult.total)
      ? raw.lastResult
      : null;
    return {
      queue,
      current: isFiniteNumber(raw.current) ? clamp(raw.current, 0, queue.length - 1) : 0,
      answers,
      hintsUsed: isPlainObject(raw.hintsUsed) ? raw.hintsUsed : {},
      flagged: isPlainObject(raw.flagged) ? raw.flagged : {},
      optionOrder,
      status: raw.status === "finished" ? "finished" : "running",
      startedAt: isFiniteNumber(raw.startedAt) ? raw.startedAt : Date.now(),
      finishedAt: isFiniteNumber(raw.finishedAt) ? raw.finishedAt : 0,
      finishReason: typeof raw.finishReason === "string" && raw.finishReason ? raw.finishReason : "Selesai",
      lastResult: lastValid,
      streak: isFiniteNumber(raw.streak) ? raw.streak : 0,
      bestStreak: isFiniteNumber(raw.bestStreak) ? raw.bestStreak : 0,
      wrongOnly: !!raw.wrongOnly,
      fullSession: isPlainObject(raw.fullSession) ? raw.fullSession : null
    };
  }

  function snapshotSession() {
    return {
      queue: state.queue.slice(),
      current: state.current,
      answers: { ...state.answers },
      hintsUsed: { ...state.hintsUsed },
      flagged: { ...state.flagged },
      optionOrder: { ...state.optionOrder },
      status: state.status,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      finishReason: state.finishReason,
      lastResult: state.lastResult ? JSON.parse(JSON.stringify(state.lastResult)) : null,
      streak: state.streak,
      bestStreak: state.bestStreak
    };
  }

  function restoreSession(snap) {
    if (!snap) return;
    state.queue = Array.isArray(snap.queue) ? snap.queue.slice() : [];
    state.current = clamp(snap.current, 0, Math.max(0, state.queue.length - 1));
    state.answers = { ...(snap.answers || {}) };
    state.hintsUsed = { ...(snap.hintsUsed || {}) };
    state.flagged = { ...(snap.flagged || {}) };
    state.optionOrder = { ...(snap.optionOrder || {}) };
    state.status = snap.status === "finished" ? "finished" : "running";
    state.startedAt = isFiniteNumber(snap.startedAt) ? snap.startedAt : Date.now();
    state.finishedAt = isFiniteNumber(snap.finishedAt) ? snap.finishedAt : 0;
    state.finishReason = snap.finishReason || "Selesai";
    state.lastResult = snap.lastResult || null;
    state.streak = isFiniteNumber(snap.streak) ? snap.streak : 0;
    state.bestStreak = isFiniteNumber(snap.bestStreak) ? snap.bestStreak : 0;
  }

  function saveProgress() {
    try {
      refreshActiveQuestions();
      const raw = {
        ...snapshotSession(),
        wrongOnly: state.wrongOnly,
        fullSession: state.fullSession
      };
      const clean = validateProgressData(raw, new Set(cache.map((q) => q.id)));
      if (!clean) return;
      localStorage.setItem(progressKey(), JSON.stringify(clean));
    } catch (error) {
      console.warn("[ASAS] Progres tidak dapat disimpan.", error);
    }
  }

  function loadProgress() {
    try {
      const raw = JSON.parse(localStorage.getItem(progressKey()) || "null");
      refreshActiveQuestions();
      return validateProgressData(raw, new Set(cache.map((q) => q.id)));
    } catch (error) {
      console.warn("[ASAS] Progres tidak dapat dibaca.", error);
      return null;
    }
  }

  function buildQueue(questions) {
    const optionOrder = {};
    questions.forEach((q) => {
      optionOrder[q.id] = LETTERS.slice();
    });
    return { queue: questions.map((q) => q.id), optionOrder };
  }

  function applyProgress(raw) {
    refreshActiveQuestions();
    const clean = validateProgressData(raw, new Set(cache.map((q) => q.id)));
    if (!clean) return false;
    restoreSession(clean);
    state.wrongOnly = clean.wrongOnly;
    state.fullSession = clean.fullSession;
    Object.keys(state.optionOrder).forEach((id) => {
      if (!validateOptionOrder(state.optionOrder[id])) delete state.optionOrder[id];
    });
    state.queue.forEach((id) => {
      if (!state.optionOrder[id]) state.optionOrder[id] = LETTERS.slice();
    });
    if (state.status === "running" && !state.startedAt) state.startedAt = Date.now();
    return true;
  }

  function startSession(fresh = true) {
    stopTimer();
    if (state.mode === "belajar") {
      state.queue = [];
      state.status = "idle";
      state.studyProgress = loadStudyProgress();
      state.studyCardIndex = 0;
      state.studyRevealed = false;
      renderShell();
      renderWorkspace();
      updateTimerDisplay(true);
      return;
    }
    if (fresh) {
      refreshActiveQuestions();
      if (!cache.length) {
        state.queue = [];
        state.status = "idle";
        renderShell();
        renderWorkspace();
        updateTimerDisplay(true);
        return;
      }
      const built = buildQueue(cache);
      state.queue = built.queue;
      state.optionOrder = built.optionOrder;
      state.current = 0;
      state.answers = {};
      state.hintsUsed = {};
      state.flagged = {};
      state.status = "running";
      state.startedAt = Date.now();
      state.finishedAt = 0;
      state.finishReason = "Selesai";
      state.lastResult = null;
      state.streak = 0;
      state.bestStreak = 0;
      state.wrongOnly = false;
      state.fullSession = null;
    } else {
      const raw = loadProgress();
      if (!raw || !applyProgress(raw)) {
        startSession(true);
        return;
      }
    }
    saveProgress();
    renderShell();
    renderWorkspace();
    if (state.status === "running") startTimer();
  }

  function elapsedSessionMs() {
    const now = Date.now();
    if (state.status === "finished") {
      const end = state.finishedAt || now;
      return Math.max(0, end - (state.startedAt || end));
    }
    if (state.status !== "running") return 0;
    return Math.max(0, now - (state.startedAt || now));
  }

  function startTimer() {
    stopTimer();
    state.timerId = window.setInterval(updateTimerDisplay, 250);
    updateTimerDisplay(true);
  }

  function stopTimer() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = 0;
  }

  function updateTimerDisplay(force = false) {
    const el = $("timerText");
    if (!el) return;
    const next = formatTime(Math.floor(elapsedSessionMs() / 1000));
    if (!force && el.textContent === next) return;
    el.textContent = next;
    const chip = $("timerChip");
    if (!chip) return;
    chip.classList.toggle("timer-active", state.status === "running");
    chip.classList.remove("timer-tick");
    void chip.offsetWidth;
    chip.classList.add("timer-tick");
  }

  function renderSafely(fn, label) {
    try {
      fn();
    } catch (error) {
      console.error(`[ASAS] Gagal ${label}:`, error);
    }
  }

  function syncStickyOffsets() {
    const header = document.querySelector?.(".topbar");
    const height = Math.ceil(header?.getBoundingClientRect?.().height || header?.offsetHeight || 0);
    if (height) document.documentElement.style.setProperty("--topbar-h", `${height}px`);
  }

  function renderShell() {
    renderSafely(() => {
      refreshActiveQuestions();
      $("subjectCount").textContent = String(SUBJECTS.length);
      const subject = activeSubject();
      $("activeSubjectName").textContent = subject.namaMapel;
      $("activeSubjectHari").textContent = `${subjectExamLabel(subject)} · Grup ${subject.grup}`;
      $("scheduleDateBadge").textContent = formatExamShort(1);
      $("examSubjectName").textContent = `${subject.namaMapel} - ${tMode(state.mode)}`;
      $("examDateLabel").textContent = formatExamLong(subject.grup);
      const studying = state.mode === "belajar";
      $("mainNav").classList.toggle("hidden", !studying);
      $("examTopbar").classList.toggle("hidden", studying);
      $("timerLabel").textContent = "Waktu Berjalan";
      const study = studying ? loadStudyContent() : null;
      const summary = studying ? studyProgressSummary(study) : null;
      const sectionCount = Object.keys(STUDY_SECTIONS).length;
      $("questionCount").textContent = studying
        ? `Mode Belajar - ${study.status === "tersedia" ? `${sectionCount} bagian materi` : tStudyStatus("menunggu")}`
        : `${cache.length} soal - Mode ${tMode(state.mode)}`;
      $("studyProgressCount").textContent = studying && study.status === "tersedia"
        ? `Progres belajar: ${summary.sectionsDone}/${sectionCount} bagian - ${summary.cardsDone}/${study.flashcards.length} kartu`
        : "Progres belajar: -";
      $("currentBankLabel").textContent = studying ? "Materi Belajar" : `Bank ${tBank(state.bank)}`;

      const groupKeys = [...new Set(SUBJECTS.map((s) => Number(s.grup) || 1))]
        .sort((a, b) => a - b);
      $("subjectGrid").innerHTML = groupKeys.map((grup) => {
        const items = SUBJECTS.filter((s) => (Number(s.grup) || 1) === grup);
        return `<p class="subject-group-title">${escapeHTML(formatExamLong(grup))}</p>` + items.map((s) => {
          const count = bankCount(s.id, state.bank);
          const active = s.id === state.subject;
          const studyReady = loadStudyContent(s.id).status === "tersedia";
          const detail = studying
            ? (studyReady ? "Materi tersedia" : tStudyStatus("menunggu"))
            : (count ? `${count} soal - Bank ${tBank(state.bank)}` : "Menunggu kisi-kisi");
          const statusText = studyReady ? "Ada Materi" : "Belum Ada Materi";
          return `
            <button class="subject-btn subject-row ${active ? "active" : ""}" data-subject-id="${escapeHTML(s.id)}" type="button">
              <span class="subject-index">${String(SUBJECTS.indexOf(s) + 1).padStart(2, "0")}</span>
              <span class="subject-main">
                <span class="subject-name truncate">${escapeHTML(s.namaMapel)}</span>
                <span class="subject-status ${studyReady ? "ready" : "waiting"}" title="${escapeHTML(statusText)}">
                  <span class="subject-status-dot" aria-hidden="true"></span>${escapeHTML(statusText)}
                </span>
              </span>
              <span class="subject-day truncate">${escapeHTML(detail)}</span>
            </button>`;
        }).join("");
      }).join("");

      $("modeStudyBtn").classList.toggle("active", studying);
      $("modePracticeBtn").classList.toggle("active", state.mode === "latihan");
      $("modeStudyBtn").setAttribute("aria-selected", String(studying));
      $("modePracticeBtn").setAttribute("aria-selected", String(state.mode === "latihan"));
      $("wrongOnlyBtn").classList.toggle("hidden", studying);
      $("wrongOnlyBtn").textContent = state.wrongOnly ? "Kembali ke Bank Penuh" : "Ulangi Soal Salah";
      $("downloadPanel").classList.toggle("hidden", studying || cache.length === 0);
      applyCreatorVisibility();
      renderCustomList();
      updateSubjectScrollUI();
      syncStickyOffsets();
    }, "merender shell");
  }

  function updateSubjectScrollUI() {
    const grid = $("subjectGrid");
    if (!grid || grid.classList.contains("hidden")) return;
    const max = Math.max(0, (grid.scrollHeight || 0) - (grid.clientHeight || 0));
    const ratio = max ? Math.min(1, Math.max(0, (grid.scrollTop || 0) / max)) : 0;
    grid.style.setProperty("--scroll-progress", `${Math.round(ratio * 100)}%`);
  }

  function revealActiveSubject() {
    const grid = $("subjectGrid");
    if (!grid || grid.classList.contains("hidden")) return;
    const active = grid.querySelector?.(".subject-row.active");
    if (active?.scrollIntoView) active.scrollIntoView({ behavior: "smooth", block: "nearest" });
    updateSubjectScrollUI();
  }

  function closeSubjectMenu() {
    $("subjectGrid").classList.add("hidden");
    $("subjectMenuBtn").setAttribute("aria-expanded", "false");
  }

  function closeMobileNav() {
    $("mobileNavSheet").classList.add("hidden");
  }

  function openMobileNav() {
    if ($("quizWorkspace").classList.contains("hidden") || state.status !== "running") return;
    renderNavigator();
    $("mobileNavSheet").classList.remove("hidden");
  }

  function toggleNavCollapsed() {
    const collapsed = $("quizWorkspace").classList.toggle("nav-collapsed");
    $("collapseNavBtn").textContent = collapsed ? "Buka" : "Ciutkan";
  }

  function bankCount(subject, bank) {
    const builtin = (BANK[subject]?.[bank] || []).length;
    let custom = 0;
    try {
      const raw = JSON.parse(localStorage.getItem(customKey(subject, bank)) || "[]");
      custom = Array.isArray(raw) ? raw.length : 0;
    } catch (error) {
      custom = 0;
    }
    return builtin + custom;
  }

  function renderWorkspace() {
    renderSafely(() => {
      if (state.mode === "belajar") {
        $("emptyState").classList.add("hidden");
        $("quizWorkspace").classList.add("hidden");
        $("resultView").classList.add("hidden");
        $("studyWorkspace").classList.remove("hidden");
        $("mobileNavBtn").classList.add("hidden");
        closeMobileNav();
        renderStudy();
        return;
      }
      $("studyWorkspace").classList.add("hidden");
      const hasQuestions = cache.length > 0;
      const examActive = hasQuestions && state.status === "running";
      $("mobileNavBtn").classList.toggle("hidden", !examActive);
      if (!examActive) closeMobileNav();
      $("emptyState").classList.toggle("hidden", hasQuestions);
      $("quizWorkspace").classList.toggle("hidden", !hasQuestions || state.status === "finished");
      $("resultView").classList.toggle("hidden", !hasQuestions || state.status !== "finished");
      if (!hasQuestions) return;
      if (state.status === "finished") {
        renderResult();
      } else {
        renderQuizSafely();
      }
    }, "merender workspace");
  }

  function studyEmptySection(message) {
    return `<div class="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--paper-soft)] p-6 text-center text-sm font-semibold text-[var(--muted)]">${escapeHTML(message)}</div>`;
  }

  function studyTopicChips(content, scope, selected) {
    const topics = studyTopicList(content);
    return `<div class="mb-3 flex flex-wrap gap-1.5">
      <button class="study-chip ${!selected ? "active" : ""}" type="button" data-study-filter="${scope}" data-value="">Semua</button>
      ${topics.map((topic) => `<button class="study-chip ${selected === topic.id ? "active" : ""}" type="button" data-study-filter="${scope}" data-value="${escapeHTML(topic.id)}">${escapeHTML(topic.nama)}</button>`).join("")}
    </div>`;
  }

  function studyItemKey(item, fallback = "") {
    return item?.id || fallback || item?.pertanyaan || item?.istilah || item?.teks || item?.judul || "";
  }

  function studyCurrentFlashcards(content) {
    const ids = content.flashcards.map((card) => studyItemKey(card)).join("|");
    const key = [state.subject, ids, state.studyFlashFilterTopik, state.studyFlashMasteredOnly, state.studyFlashShuffle].join("::");
    if (state.studyFlashOrderKey !== key) {
      let list = content.flashcards.filter((card) => !state.studyFlashFilterTopik || card.topikId === state.studyFlashFilterTopik);
      if (state.studyFlashMasteredOnly) {
        list = list.filter((card) => state.studyProgress?.flashcardsMastered?.[studyItemKey(card)]);
      }
      state.studyFlashOrder = (state.studyFlashShuffle ? shuffleArray(list) : list).map((card) => studyItemKey(card));
      state.studyFlashOrderKey = key;
    }
    const byKey = new Map(content.flashcards.map((card) => [studyItemKey(card), card]));
    return state.studyFlashOrder.map((id) => byKey.get(id)).filter(Boolean);
  }

  function studyMindNodeCount(node) {
    const children = Array.isArray(node?.anak) ? node.anak : [];
    return 1 + children.reduce((total, child) => total + studyMindNodeCount(child), 0);
  }

  function studyMindTotal(nodes) {
    return (nodes || []).reduce((total, node) => total + studyMindNodeCount(node), 0);
  }

  function studyMindTopicIds(nodes, seen = new Set()) {
    (nodes || []).forEach((node) => {
      if (node?.topikId) seen.add(node.topikId);
      studyMindTopicIds(node?.anak, seen);
    });
    return seen;
  }

  function studyMindKey(node, path) {
    return studyText(node?.id) || path;
  }

  function studyMindWalk(nodes, visit, depth = 0, parentPath = "") {
    (nodes || []).forEach((node, index) => {
      const path = depth === 0 ? `mm-${index}` : `${parentPath}-${index}`;
      const key = studyMindKey(node, path);
      visit(node, depth, key, index);
      studyMindWalk(node?.anak, visit, depth + 1, key);
    });
  }

  function isNodeExpanded(key, depth, total) {
    if (Object.prototype.hasOwnProperty.call(state.studyExpandedNodes, key)) return state.studyExpandedNodes[key];
    return depth < 2 || total <= 40;
  }

  function studyNodeHTML(node, path, depth = 0, index = 0, total = 0) {
    if (!node) return "";
    const judul = studyText(node.judul);
    const plainJudul = judul.replace(/[*_`]/g, "");
    const children = Array.isArray(node.anak) ? node.anak : [];
    const key = studyMindKey(node, path);
    const expanded = isNodeExpanded(key, depth, total);
    const depthClass = depth === 0 ? "mind-depth-0" : depth === 1 ? "mind-depth-1" : "mind-depth-deep";
    const branchStyle = depth === 0 ? ` style="--branch-accent:var(--mind-c${(index % 5) + 1})"` : "";
    const seen = !!(node.topikId && state.studyProgress?.topics?.[node.topikId]);
    const active = !!(node.topikId && state.studyTopicId === node.topikId);
    const titleClass = `mind-node-title${seen ? " is-seen" : ""}${active ? " is-active" : ""}`;
    const rowClass = `mind-node-row${plainJudul.length > 28 ? " is-long" : ""}`;
    const title = node.topikId
      ? `<button class="${titleClass}" type="button" data-study-topic-pick="${escapeHTML(node.topikId)}">${mdInline(judul)}</button>`
      : `<span class="${titleClass}">${mdInline(judul)}</span>`;
    const badge = depth === 0 ? String(index + 1).padStart(2, "0") : "";
    const toggleLabel = expanded ? `Tutup cabang: ${plainJudul}` : `Buka cabang: ${plainJudul}`;
    const toggle = children.length
      ? `<button class="mind-node-toggle" type="button" data-study-node-toggle="${escapeHTML(key)}" aria-expanded="${expanded ? "true" : "false"}" aria-label="${escapeHTML(toggleLabel)}"><span class="mind-node-sign" aria-hidden="true">${expanded ? "−" : "+"}</span></button>`
      : `<span class="mind-node-dot" aria-hidden="true"></span>`;
    const seenMarkup = seen ? `<span class="mind-node-seen" role="img" aria-label="Sudah dibaca">✓</span>` : "";
    return `<li class="mind-node ${depthClass}${children.length ? " has-children" : ""}" data-depth="${Math.min(depth, 3)}" data-key="${escapeHTML(key)}"${branchStyle}>
      <div class="${rowClass}">
        ${badge ? `<span class="mind-node-badge">${badge}</span>` : ""}
        ${title}
        ${seenMarkup}
        ${children.length ? `<span class="mind-node-count">${children.length} sub</span>` : ""}
        ${toggle}
      </div>
      ${children.length && expanded ? `<ul class="mind-children">${children.map((child, i) => studyNodeHTML(child, `${key}-${i}`, depth + 1, i, total)).join("")}</ul>` : ""}
    </li>`;
  }

  function renderStudyRingkas(content) {
    if (!content.ringkas.length) {
      $("studyBody").innerHTML = studyEmptySection("Materi ringkas belum tersedia untuk mapel ini.");
      return;
    }
    const items = state.studyTopicId
      ? content.ringkas.filter((item) => item.topikId === state.studyTopicId)
      : content.ringkas;
    $("studyBody").innerHTML = `${studyTopicChips(content, "ringkas", state.studyTopicId)}
      ${items.length ? `<div class="grid gap-3 md:grid-cols-2">${items.map((item, i) => `
        <article class="rounded-xl border border-[var(--line)] bg-[var(--paper-soft)] p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)]">${escapeHTML(item.topik || `Konsep ${String(i + 1).padStart(2, "0")}`)}</p>
            <span class="text-[10px] font-bold text-[var(--muted)]">${escapeHTML(item.subtopik.length)} subtopik</span>
          </div>
          <h3 class="font-bacaan mt-2 text-base font-extrabold">${mdInline(item.judul)}</h3>
          <div class="font-bacaan mt-2 text-sm leading-7 text-[var(--muted)] markdown-content">${md(item.isi)}</div>
          ${item.indikatorKisi?.length ? `<p class="mt-2 text-[10px] font-bold text-[var(--muted)]">Indikator kisi: ${item.indikatorKisi.join(", ")}</p>` : ""}
          ${item.subtopik.length ? `<div class="mt-3 flex flex-wrap gap-1.5">${item.subtopik.map((s) => `<span class="study-chip">${escapeHTML(s)}</span>`).join("")}</div>` : ""}
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="link-btn" type="button" data-study-jump="peta" data-topik-id="${escapeHTML(item.topikId || "")}">Lihat di Peta</button>
            <button class="link-btn" type="button" data-study-jump="flashcard" data-topik-id="${escapeHTML(item.topikId || "")}">Latih Flashcard</button>
          </div>
        </article>`).join("")}</div>` : studyEmptySection("Belum ada ringkas pada topik ini.")}`;
  }

  function renderStudyPeta(content) {
    if (!content.mindMap || !content.mindMap.cabang.length) {
      $("studyBody").innerHTML = studyEmptySection("Mind mapping belum tersedia untuk mapel ini.");
      return;
    }
    const cabang = content.mindMap.cabang;
    const total = studyMindTotal(cabang);
    const topics = studyMindTopicIds(cabang);
    const done = [...topics].filter((topicId) => state.studyProgress?.topics?.[topicId]).length;
    const percent = topics.size ? Math.round((done / topics.size) * 100) : 0;
    $("studyBody").innerHTML = `
      <div class="mind-map-toolbar">
        <div class="mind-progress" role="progressbar" aria-label="Progres topik peta" aria-valuemin="0" aria-valuemax="${topics.size}" aria-valuenow="${done}">
          <span class="mind-progress-text">${done} dari ${topics.size} topik sudah dipelajari</span>
          <span class="mind-progress-track"><span class="mind-progress-fill" style="--mind-progress:${percent}%"></span></span>
        </div>
        <div class="mind-map-actions">
          <button class="ink-btn mind-tool-btn" type="button" data-study-mind-expand="all">Buka semua</button>
          <button class="ink-btn mind-tool-btn" type="button" data-study-mind-expand="none">Tutup semua</button>
        </div>
        <div class="mind-legend" aria-label="Legenda peta">
          <span class="mind-legend-item"><span class="mind-legend-check" aria-hidden="true">✓</span> sudah dibaca</span>
          <span class="mind-legend-item"><span class="mind-legend-ring" aria-hidden="true"></span> cincin = topik aktif</span>
        </div>
      </div>
      <div class="mind-map">
        <div class="mind-map-scroll">
          <div class="mind-tree">
            <div class="mind-center">
              <span class="mind-center-icon" aria-hidden="true">◈</span>
              <span>${mdInline(content.mindMap.pusat || activeSubject().namaMapel)}</span>
            </div>
            <ul class="mind-root">${cabang.map((branch, i) => studyNodeHTML(branch, `mm-${i}`, 0, i, total)).join("")}</ul>
          </div>
        </div>
      </div>
      <p class="mind-map-hint">Klik judul bertopik untuk membuka ringkas. Tombol + / − membuka atau menutup turunan.</p>`;
  }

  function captureMindViewport() {
    const scroller = document.querySelector(".mind-map-scroll");
    return scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null;
  }

  function restoreMindViewport(viewport) {
    const scroller = document.querySelector(".mind-map-scroll");
    if (!scroller || !viewport) return;
    scroller.scrollLeft = viewport.left;
    scroller.scrollTop = viewport.top;
  }

  function renderStudyFlashcards(content) {
    if (!content.flashcards.length) {
      $("studyBody").innerHTML = studyEmptySection("Flashcard belum tersedia untuk mapel ini.");
      return;
    }
    const list = studyCurrentFlashcards(content);
    if (!list.length) {
      $("studyBody").innerHTML = `${studyTopicChips(content, "flashcard", state.studyFlashFilterTopik)}${studyEmptySection("Tidak ada kartu sesuai filter ini.")}`;
      return;
    }
    state.studyCardIndex = clamp(state.studyCardIndex, 0, list.length - 1);
    const card = list[state.studyCardIndex];
    const cardKey = studyItemKey(card);
    const mastered = !!state.studyProgress?.flashcardsMastered?.[cardKey];
    markStudySeen("flashcards", cardKey);
    $("studyBody").innerHTML = `
      <div class="mb-3 grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper-soft)] p-3 sm:grid-cols-3">
        <label class="block text-[11px] font-bold">Topik
          <select class="field-input mt-1 w-full" data-study-filter="flashcardTopik">
            <option value="">Semua topik</option>
            ${studyTopicList(content).map((topic) => `<option value="${escapeHTML(topic.id)}" ${state.studyFlashFilterTopik === topic.id ? "selected" : ""}>${escapeHTML(topic.nama)}</option>`).join("")}
          </select>
        </label>
        <label class="flex items-end gap-2 text-[11px] font-bold"><input type="checkbox" data-study-filter="flashcardShuffle" ${state.studyFlashShuffle ? "checked" : ""} /> Acak kartu</label>
        <label class="flex items-end gap-2 text-[11px] font-bold"><input type="checkbox" data-study-filter="flashcardMasteredOnly" ${state.studyFlashMasteredOnly ? "checked" : ""} /> Hanya yang dikuasai</label>
      </div>
      <div class="rounded-xl border border-[var(--line)] bg-[var(--paper-soft)] p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">Kartu ${state.studyCardIndex + 1} / ${list.length}</p>
          <span class="study-chip">${escapeHTML(card.topik || studyTopicName(content, card.topikId))}</span>
        </div>
        <div class="flashcard mt-4 ${state.studyRevealed ? "revealed" : ""}">
          <p class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">${state.studyRevealed ? "Jawaban" : card.jenis || "Pertanyaan"}</p>
          <div class="font-bacaan mt-3 text-base font-bold leading-8 markdown-content">${md(state.studyRevealed ? card.jawaban : card.pertanyaan)}</div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button class="ink-btn" type="button" data-study-card-action="prev" ${state.studyCardIndex === 0 ? "disabled" : ""}>← Sebelumnya</button>
          <button class="ink-btn" type="button" data-study-card-action="flip">${state.studyRevealed ? "Tampilkan Pertanyaan" : "Tampilkan Jawaban"}</button>
          <button class="ink-btn ${mastered ? "finish" : ""}" type="button" data-study-card-action="master">${mastered ? "✓ Dikuasai" : "Tandai Dikuasai"}</button>
          <button class="ink-btn ml-auto" type="button" data-study-card-action="next" ${state.studyCardIndex >= list.length - 1 ? "disabled" : ""}>Berikutnya →</button>
        </div>
      </div>`;
  }

  function renderStudyPoin(content) {
    if (!content.poin.length) {
      $("studyBody").innerHTML = studyEmptySection("Poin penting belum tersedia untuk mapel ini.");
      return;
    }
    const items = state.studyTopicId
      ? content.poin.filter((item) => item.topikId === state.studyTopicId)
      : content.poin;
    $("studyBody").innerHTML = `${studyTopicChips(content, "poin", state.studyTopicId)}
      ${items.length ? `<div class="grid gap-3 md:grid-cols-2">${items.map((item, i) => {
        const key = studyItemKey(item, `pp-${i + 1}`);
        const checked = !!state.studyProgress?.poin?.[key];
        return `
          <article class="study-point ${checked ? "seen" : ""}">
            <span class="study-point-num">${String(i + 1).padStart(2, "0")}</span>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">${escapeHTML(item.topik || studyTopicName(content, item.topikId))}${item.wajib ? " - Wajib" : ""}</p>
              <label class="font-bacaan mt-1 flex cursor-pointer gap-2 text-sm leading-7">
                <input type="checkbox" class="mt-1.5" data-study-point-check="${escapeHTML(key)}" ${checked ? "checked" : ""} />
                <span>${mdInline(item.teks)}</span>
              </label>
            </div>
          </article>`;
      }).join("")}</div>` : studyEmptySection("Belum ada poin pada topik ini.")}`;
  }

  function renderStudyGlosarium(content) {
    if (!content.glosarium.length) {
      $("studyBody").innerHTML = studyEmptySection("Istilah penting belum tersedia untuk mapel ini.");
      return;
    }
    const query = state.studyGlossaryQuery.trim().toLowerCase();
    let items = content.glosarium.filter((item) => {
      if (state.studyGlossaryTopik && item.topikId !== state.studyGlossaryTopik) return false;
      if (state.studyGlossaryFavoriteOnly && !state.studyProgress?.favorites?.[studyItemKey(item)]) return false;
      if (!query) return true;
      return `${item.istilah} ${item.arti} ${item.penjelasan || ""} ${item.contoh || ""}`.toLowerCase().includes(query);
    });
    if (state.studyGlossarySort === "topik") {
      items = items.slice().sort((a, b) => (a.topik || "").localeCompare(b.topik || "") || a.istilah.localeCompare(b.istilah));
    } else if (state.studyGlossarySort === "terbaru") {
      items = items.slice().reverse();
    } else {
      items = items.slice().sort((a, b) => a.istilah.localeCompare(b.istilah));
    }
    const selected = items.find((item) => studyItemKey(item) === state.studyGlossarySelected) || items[0];
    $("studyBody").innerHTML = `${studyTopicChips(content, "glosarium", state.studyGlossaryTopik)}
      <div class="mb-3 grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper-soft)] p-3 sm:grid-cols-3">
        <label class="block text-[11px] font-bold">Cari istilah<input class="field-input mt-1 w-full" type="search" placeholder="Contoh: guru lagu" value="${escapeHTML(state.studyGlossaryQuery)}" data-study-filter="glosariumQuery" /></label>
        <label class="block text-[11px] font-bold">Urutkan
          <select class="field-input mt-1 w-full" data-study-filter="glosariumSort">
            <option value="alfabetis" ${state.studyGlossarySort === "alfabetis" ? "selected" : ""}>Alfabetis</option>
            <option value="topik" ${state.studyGlossarySort === "topik" ? "selected" : ""}>Berdasarkan topik</option>
            <option value="terbaru" ${state.studyGlossarySort === "terbaru" ? "selected" : ""}>Urutan materi</option>
          </select>
        </label>
        <label class="flex items-end gap-2 text-[11px] font-bold"><input type="checkbox" data-study-filter="glosariumFavoriteOnly" ${state.studyGlossaryFavoriteOnly ? "checked" : ""} /> Hanya favorit</label>
      </div>
      ${items.length ? `<div class="grid gap-3 sm:grid-cols-2">${items.map((item) => {
        const key = studyItemKey(item);
        const seen = !!state.studyProgress?.glossary?.[key];
        const favorite = !!state.studyProgress?.favorites?.[key];
        return `
          <div class="study-term ${seen ? "seen" : ""} ${selected && studyItemKey(selected) === key ? "active" : ""}">
            <button class="w-full text-left" type="button" data-study-term="${escapeHTML(key)}">
              <span class="font-bacaan block text-sm font-extrabold">${mdInline(item.istilah)}</span>
              <span class="mt-1 block text-xs leading-6 text-[var(--muted)]">${mdInline(item.arti)}</span>
              <span class="mt-1 block text-[10px] font-bold text-[var(--muted)]">${escapeHTML(item.topik || studyTopicName(content, item.topikId))}</span>
            </button>
            <button class="ml-2 glass glass-icon" type="button" data-study-favorite="${escapeHTML(key)}" aria-label="Tandai favorit">${favorite ? "★" : "☆"}</button>
          </div>`;
      }).join("")}</div>
      ${selected ? `<div class="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <p class="eyebrow">Penjelasan istilah</p>
        <h3 class="font-bacaan mt-1 text-lg font-extrabold">${mdInline(selected.istilah)}</h3>
        <div class="mt-2 text-sm leading-7 markdown-content"><strong>Arti:</strong> ${mdInline(selected.arti)}</div>
        ${selected.penjelasan ? `<div class="font-bacaan mt-2 text-sm leading-7 markdown-content">${md(selected.penjelasan)}</div>` : ""}
        ${selected.contoh ? `<div class="mt-2 text-xs leading-6 text-[var(--muted)] markdown-content"><strong>Contoh:</strong> ${mdInline(selected.contoh)}</div>` : ""}
      </div>` : ""}` : studyEmptySection("Tidak ada istilah sesuai pencarian ini.")}`;
  }

  function renderStudy() {
    renderSafely(() => {
      const content = loadStudyContent();
      const waiting = content.status === "menunggu";
      const summary = studyProgressSummary(content);
      $("studyHeaderSubject").textContent = activeSubject().namaMapel;
      $("studyStatusBadge").textContent = tStudyStatus(content.status);
      $("studyStatusBadge").classList.toggle("waiting", waiting);
      $("studySourceNote").textContent = content.sumber || "Materi untuk mapel ini belum tersedia. Tambahkan melalui Mode Pembuat.";
      $("studyProgressText").textContent = waiting
        ? "Progres belajar belum tersedia."
        : `${summary.sectionsDone}/${Object.keys(STUDY_SECTIONS).length} bagian dilihat - ${summary.cardsDone}/${content.flashcards.length} kartu dibaca - ${summary.masteredDone} dikuasai - ${summary.poinDone}/${content.poin.length} poin dicentang - ${summary.favoriteDone} istilah favorit`;
      $("studyTabs").classList.toggle("hidden", waiting);
      $("studyBody").classList.toggle("hidden", waiting);
      $("studyEmpty").classList.toggle("hidden", !waiting);
      const modules = studyModules();
      const hasOptionalModules = modules.bedahTembung || modules.bedahGatra;
      $("studyJawaTools").classList.toggle("hidden", waiting || !hasOptionalModules);
      $("studyBedahTembungBtn").classList.toggle("hidden", !modules.bedahTembung);
      $("studyBedahGatraBtn").classList.toggle("hidden", !modules.bedahGatra);
      $("studyBedahOutput").classList.add("hidden");
      if (waiting) return;
      $("studyTabs").innerHTML = Object.entries(STUDY_SECTIONS).map(([key]) => `
        <button class="study-tab ${state.studySection === key ? "active" : ""} ${state.studyProgress?.sections?.[key] ? "seen" : ""}" data-study-section="${key}" type="button">${escapeHTML(tStudySection(key))}</button>`).join("");
      const renderers = {
        ringkas: renderStudyRingkas,
        peta: renderStudyPeta,
        flashcard: renderStudyFlashcards,
        poin: renderStudyPoin,
        glosarium: renderStudyGlosarium
      };
      (renderers[state.studySection] || renderStudyRingkas)(content);
    }, "merender Mode Belajar");
    if (aiTutor) aiTutor.refreshContext();
  }

  function renderQuizSafely() {
    renderSafely(() => {
      refreshActiveQuestions();
      if (!state.queue.length) return;
      updateTimerDisplay();
      const answered = state.queue.filter((id) => state.answers[id] !== undefined).length;
      $("progressFill").style.width = `${Math.round((answered / state.queue.length) * 100)}%`;
      $("progressText").textContent = `Terjawab ${answered} dari ${state.queue.length}`;
      $("streakValue").textContent = String(state.streak);
      $("bestStreakValue").textContent = String(state.bestStreak);
      $("highlightBtn").textContent = state.highlight ? "Hilangkan Sorotan" : "Sorot Kata Kunci";
      renderCurrentQuestion();
      renderNavigator();
    }, "merender soal");
  }

  function currentQuestion() {
    return byId(state.queue[state.current]);
  }

  function safeUrl(value) {
    const url = String(value || "").trim();
    return /^(https?:\/\/|data:image\/|\/|\.\/)/i.test(url) ? url : "";
  }

  function stimulusBlocks(q) {
    const raw = q?.stimulus ?? q?.stimulusText ?? "";
    const source = Array.isArray(raw) ? raw : [raw];
    const blocks = [];
    source.forEach((block) => {
      if (block === null || block === undefined || block === "") return;
      if (typeof block === "string") {
        if (block.trim()) blocks.push({ type: "text", text: block, caption: "" });
        return;
      }
      if (!isPlainObject(block)) return;
      const type = String(block.type || (block.headers ? "table" : block.items ? "list" : block.src ? "image" : "text")).toLowerCase();
      if (type === "table") {
        blocks.push({ type, headers: Array.isArray(block.headers) ? block.headers : [], rows: Array.isArray(block.rows) ? block.rows : [], caption: block.caption || "" });
      } else if (type === "list") {
        blocks.push({ type, ordered: !!block.ordered, items: Array.isArray(block.items) ? block.items : [], caption: block.caption || "" });
      } else if (type === "image") {
        const src = safeUrl(block.src || block.imageUrl || block.url);
        if (src) blocks.push({ type, src, alt: block.alt || block.caption || "Ilustrasi soal", caption: block.caption || "" });
      } else if (type === "quote") {
        blocks.push({ type, text: String(block.text || block.content || ""), source: block.source || "", caption: block.caption || "" });
      } else {
        const text = String(block.text || block.content || "");
        if (text.trim()) blocks.push({ type: "text", text, caption: block.caption || "" });
      }
    });
    return blocks;
  }

  function stimulusPlainText(q) {
    return stimulusBlocks(q).map((block) => {
      const parts = [block.text, block.source, block.caption];
      if (block.headers) parts.push(...block.headers);
      if (block.rows) block.rows.forEach((row) => parts.push(...(Array.isArray(row) ? row : [row])));
      if (block.items) parts.push(...block.items);
      return parts
        .filter((part) => part !== null && part !== undefined && String(part).trim())
        .map((part) => String(part).trim())
        .join(" ");
    }).filter(Boolean).join("\n");
  }

  function renderStimulusBlock(block, q) {
    const terms = q?.keyTerms || [];
    const caption = block.caption ? `<p class="stimulus-caption">${renderKeyTerms(String(block.caption), terms)}</p>` : "";
    if (block.type === "table") {
      const head = block.headers.length ? `<thead><tr>${block.headers.map((h) => `<th>${renderKeyTerms(String(h), terms)}</th>`).join("")}</tr></thead>` : "";
      const body = `<tbody>${block.rows.map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((cell) => `<td>${renderKeyTerms(String(cell ?? ""), terms)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `<div class="stimulus-block"><table class="stimulus-table">${head}${body}</table>${caption}</div>`;
    }
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      return `<div class="stimulus-block"><${tag} class="stimulus-list">${block.items.map((item) => `<li>${renderKeyTerms(String(item ?? ""), terms)}</li>`).join("")}</${tag}>${caption}</div>`;
    }
    if (block.type === "image") {
      return `<figure class="stimulus-block"><img class="stimulus-image" src="${escapeHTML(block.src)}" alt="${escapeHTML(block.alt)}" /><figcaption class="stimulus-caption">${renderKeyTerms(String(block.alt || block.caption || ""), terms)}</figcaption></figure>`;
    }
    if (block.type === "quote") {
      return `<blockquote class="stimulus-block stimulus-quote"><span class="font-bacaan whitespace-pre-line markdown-content">${renderKeyTerms(String(block.text || ""), terms, true)}</span>${block.source ? `<span class="stimulus-caption">— ${renderKeyTerms(String(block.source), terms)}</span>` : ""}${caption}</blockquote>`;
    }
    return `<div class="stimulus-block"><p class="font-bacaan whitespace-pre-line markdown-content">${renderKeyTerms(String(block.text || ""), terms, true)}</p>${caption}</div>`;
  }

  function renderStimulus(q) {
    const blocks = stimulusBlocks(q);
    $("stimulusCard").classList.toggle("hidden", !blocks.length);
    $("stimulusText").innerHTML = blocks.map((block) => renderStimulusBlock(block, q)).join("");
  }

  function renderCurrentQuestion() {
    const q = currentQuestion();
    if (!q) return;
    const subject = activeSubject();
    const poster = q.posterMockup || {};
    const accent = accentFor(poster.accent);
    const posterCard = $("posterCard");
    posterCard.style.setProperty("--poster-accent", accent.main);
    posterCard.style.setProperty("--poster-bg", accent.soft);
    posterCard.style.setProperty("--poster-ink", "var(--ink)");
    $("posterLabel").textContent = poster.label || subject.namaMapel.toUpperCase();
    $("posterTitle").textContent = poster.title || q.topik || subject.namaMapel;
    $("posterTagline").textContent = poster.tagline || q.subtopik || "Lembar kerja ASAS Gasal XI";
    $("posterCaption").textContent = poster.footer || `${subject.namaMapel} - ${subject.hari}`;
    $("posterEmblem").textContent = poster.icon === "lintang" ? "✦" : poster.icon === "sheet" ? "✎" : "◈";

    $("questionCounter").textContent = `Soal ${state.current + 1} / ${state.queue.length}`;
    $("questionType").textContent = q.level || "Pilihan Ganda";
    $("questionText").innerHTML = renderKeyTerms(q.question, q.keyTerms, false);

    renderStimulus(q);

    const hasImage = safeUrl(q.imageUrl) ? true : false;
    $("imagePanel").classList.toggle("hidden", !hasImage);
    if (hasImage) {
      $("previewImage").src = safeUrl(q.imageUrl);
      $("captionInput").value = q.imageCaption || "";
    }

    const chosen = state.answers[q.id];
    const order = state.optionOrder[q.id] || LETTERS;
    $("optionsContainer").innerHTML = order.map((letter) => {
      const selected = chosen === letter;
      let stateClass = "";
      if (selected && state.mode === "latihan") {
        stateClass = letter === q.answer ? "correct" : "wrong";
      }
      return `
        <button class="option-btn ${selected ? "selected" : ""} ${stateClass}" data-letter="${escapeHTML(letter)}" type="button">
          <span class="option-key">${escapeHTML(letter)}</span>
          <span class="option-text">${renderKeyTerms(q.options[letter] || "", q.keyTerms, false)}</span>
        </button>`;
    }).join("");

    const canAdvance = chosen !== undefined && state.status === "running";
    $("inlinePrevBtn").classList.toggle("hidden", state.current === 0 || state.status !== "running");
    $("inlineNextBtn").classList.toggle("hidden", !canAdvance);
    $("inlineNextBtn").textContent = state.current >= state.queue.length - 1 ? "Selesaikan ✓" : "Selanjutnya →";

    const revealed = state.mode === "latihan" && chosen !== undefined;
    $("explanationBox").classList.toggle("hidden", !revealed);
    if (revealed) {
      $("explanationText").innerHTML = renderKeyTerms(q.explanation, q.keyTerms, true);
    }

    const hints = q.hints || [];
    const used = clamp(state.hintsUsed[q.id] || 0, 0, hints.length);
    $("hintText").classList.toggle("hidden", used === 0);
    $("hintText").textContent = hints.slice(0, used).map((h, i) => `${i + 1}. ${h}`).join("  •  ");
    $("hintBtn").textContent = used === 0 ? "Buka Petunjuk" : used < hints.length ? "Petunjuk Lain" : "Petunjuk Habis";
    $("hintBtn").disabled = used >= hints.length;

    const flagged = !!state.flagged[q.id];
    $("flagBtn").textContent = flagged ? "✓ Ragu" : "Ragu";
    $("flagBtn").setAttribute("aria-pressed", String(flagged));
    $("flagBtn").classList.toggle("active", flagged);

    const modules = studyModules();
    $("jawaTools").classList.toggle("hidden", !(modules.bedahTembung || modules.bedahGatra));
    $("bedahTembungBtn").classList.toggle("hidden", !modules.bedahTembung);
    $("bedahGatraBtn").classList.toggle("hidden", !modules.bedahGatra);
    $("bedahOutput").classList.add("hidden");
    $("keyTermPopover").classList.add("hidden");
  }

  function renderNavigator() {
    const buttons = state.queue.map((id, i) => {
      const q = byId(id);
      const classes = [
        "nav-btn",
        i === state.current ? "current" : "",
        state.answers[id] !== undefined ? "answered" : "",
        state.flagged[id] ? "flagged" : ""
      ].join(" ").trim();
      return `<button class="${classes}" data-index="${i}" type="button" title="${escapeHTML(q?.topik || `Soal ${i + 1}`)}">${i + 1}</button>`;
    }).join("");
    $("navContainer").innerHTML = buttons;
    $("mobileNavContainer").innerHTML = buttons;
    $("mobileNavSummary").textContent = `Soal ${Math.min(state.current + 1, state.queue.length)} dari ${state.queue.length}`;
  }

  function glossaryEntries(terms = []) {
    const entries = [];
    const seen = new Set();
    const add = (term, meaning) => {
      const t = String(term || "").trim().replace(/^["']|["']$/g, "");
      if (!t) return;
      const key = t.toLocaleLowerCase("id-ID");
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ term: t, meaning: String(meaning || GLOSSARY[key] || "Istilah penting dalam soal.") });
    };
    terms.forEach((t) => {
      if (typeof t === "string") add(t);
      else if (t && typeof t === "object") add(t.term || t.istilah || t.kata, t.meaning || t.teges || t.definisi || t.arti);
    });
    const globalTerms = studyModules().useGlobalGlossary ? Object.entries(GLOSSARY) : [];
    globalTerms.forEach(([term, meaning]) => {
      if (term.length >= 5) add(term, meaning);
    });
    return entries.sort((a, b) => b.term.length - a.term.length);
  }

  function renderKeyTerms(text, terms = [], block = false) {
    const raw = String(text || "");
    const baseHtml = block ? md(raw) : mdInline(raw);
    const entries = glossaryEntries(terms);
    if (!entries.length || typeof document === "undefined") return baseHtml;
    const pattern = new RegExp(`(${entries.map((e) => escapeRegExp(e.term)).join("|")})`, "gi");
    const markClass = state.highlight ? "key-term-mark key-term-mark-strong" : "key-term-mark";
    const host = document.createElement("div");
    host.innerHTML = baseHtml;
    const textNodes = [];
    const collect = (node) => {
      Array.from(node.childNodes || []).forEach((child) => {
        if (child.nodeName === "CODE" || child.nodeName === "PRE") return;
        if (child.nodeType === 3) textNodes.push(child);
        else collect(child);
      });
    };
    collect(host);
    textNodes.forEach((node) => {
      const value = String(node.nodeValue || "");
      const fragment = document.createDocumentFragment();
      let last = 0;
      value.replace(pattern, (match, _group, offset) => {
        if (offset > last) fragment.appendChild(document.createTextNode(value.slice(last, offset)));
        const found = entries.find((e) => e.term.toLocaleLowerCase("id-ID") === String(match).toLocaleLowerCase("id-ID")) || { term: match, meaning: "Istilah penting." };
        const mark = document.createElement("mark");
        mark.className = markClass;
        mark.setAttribute("data-term", found.term);
        mark.setAttribute("data-meaning", found.meaning);
        mark.textContent = match;
        fragment.appendChild(mark);
        last = offset + String(match).length;
        return match;
      });
      if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
    return host.innerHTML;
  }

  function showTermPopover(term, meaning) {
    $("keyTermPopoverTitle").textContent = term;
    $("keyTermPopoverText").textContent = meaning || "Istilah penting dalam soal.";
    $("keyTermPopover").classList.remove("hidden");
  }

  function findGlossaryTerms(text) {
    if (!studyModules().useGlobalGlossary) return [];
    const raw = String(text || "").toLocaleLowerCase("id-ID");
    return Object.entries(GLOSSARY)
      .filter(([term]) => term.length >= 5 && raw.includes(term.toLocaleLowerCase("id-ID")))
      .map(([term, meaning]) => ({ term, meaning }))
      .sort((a, b) => b.term.length - a.term.length)
      .slice(0, 12);
  }

  function currentBedahQuestion() {
    return state.mode === "belajar" ? currentStudyQuestion() : currentQuestion();
  }

  function bedahOutputEl() {
    return state.mode === "belajar" ? $("studyBedahOutput") : $("bedahOutput");
  }

  function bedahTembung() {
    if (!studyModules().bedahTembung) return;
    const q = currentBedahQuestion();
    if (!q) return;
    const text = [stimulusPlainText(q), q.question, ...Object.values(q.options)].join(" ");
    const terms = q.keyTerms?.length ? q.keyTerms : findGlossaryTerms(text);
    const rows = terms.length
      ? terms.map((t) => {
          const term = typeof t === "string" ? t : t.term || t.istilah || t.kata;
          const meaning = typeof t === "string" ? GLOSSARY[term] : t.meaning || t.teges || t.definisi || t.arti;
          return `<div class="mt-1.5"><strong>${escapeHTML(term)}</strong> — ${escapeHTML(meaning || "Arti kata belum tercatat.")}</div>`;
        }).join("")
      : "<div class='mt-1.5'>Kata sulit belum tercatat di bank soal ini.</div>";
    bedahOutputEl().innerHTML = `<p class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--teal)]">Arti Kata Sulit</p>${rows}`;
    bedahOutputEl().classList.remove("hidden");
  }

  function bedahGatra() {
    if (!studyModules().bedahGatra) return;
    const q = currentBedahQuestion();
    if (!q) return;
    const lines = stimulusPlainText(q).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const rows = lines.length
      ? lines.map((line, i) => {
          const words = line.split(/\s+/).filter(Boolean);
          const last = words[words.length - 1] || "";
          const lagu = last.slice(-1) || "-";
          return `<li class="mt-1.5"><span class="font-bold">Gatra ${i + 1}:</span> ${escapeHTML(line)} <span class="text-[var(--muted)]">— wanda ${words.length}, guru lagu "${escapeHTML(lagu)}"</span></li>`;
        }).join("")
      : "<li class='mt-1.5'>Bahan bacaan berupa gatra belum tersedia.</li>";
    bedahOutputEl().innerHTML = `<p class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--teal)]">Analisis Gatra</p><ol class="mt-1 list-decimal pl-5">${rows}</ol>`;
    bedahOutputEl().classList.remove("hidden");
  }

  function selectAnswer(letter) {
    if (!LETTERS.includes(letter) || state.status !== "running") return;
    const q = currentQuestion();
    if (!q) return;
    const previous = state.answers[q.id];
    state.answers[q.id] = letter;
    if (previous === undefined) state.hintsUsed[q.id] = state.hintsUsed[q.id] || 0;
    if (letter === q.answer) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
    }
    saveProgress();
    renderShell();
    renderQuizSafely();
  }

  function goTo(index) {
    if (!state.queue.length || state.status === "finished") return;
    state.current = clamp(index, 0, state.queue.length - 1);
    saveProgress();
    renderQuizSafely();
    const card = $("questionCard");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleFlag() {
    const q = currentQuestion();
    if (!q) return;
    state.flagged[q.id] = !state.flagged[q.id];
    saveProgress();
    renderQuizSafely();
  }

  function nextHint() {
    const q = currentQuestion();
    if (!q) return;
    const hints = q.hints || [];
    const used = clamp(state.hintsUsed[q.id] || 0, 0, hints.length);
    if (used >= hints.length) return;
    state.hintsUsed[q.id] = used + 1;
    saveProgress();
    renderQuizSafely();
  }

  const ENCOURAGEMENT_MESSAGES = {
    tinggi: [
      "Setiap latihan adalah langkah kecil menuju pemahaman yang lebih baik.",
      "Kerja bagus! Kamu sudah meluangkan waktu untuk belajar hari ini.",
      "Hasil hari ini adalah bahan evaluasi untuk hari berikutnya."
    ],
    sedang: [
      "Tidak harus langsung sempurna. Yang penting terus berkembang.",
      "Teruslah belajar. Kemampuan berkembang melalui proses.",
      "Setiap latihan adalah langkah kecil menuju pemahaman yang lebih baik."
    ],
    rendah: [
      "Kesalahan bukan akhir, tetapi kesempatan untuk memahami sesuatu lebih dalam.",
      "Tidak harus langsung sempurna. Yang penting terus berkembang.",
      "Teruslah belajar. Kemampuan berkembang melalui proses."
    ]
  };

  function pickEncouragement(score) {
    const band = score >= 85 ? "tinggi" : score >= 50 ? "sedang" : "rendah";
    const list = ENCOURAGEMENT_MESSAGES[band];
    return list[Math.floor(Math.random() * list.length)];
  }

  function computeResult(reason = state.finishReason || "Selesai") {
    const topics = {};
    const levels = {};
    const indicators = {};
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    state.queue.forEach((id) => {
      const q = byId(id);
      if (!q) return;
      const chosen = state.answers[id];
      const isCorrect = chosen === q.answer;
      if (chosen === undefined) unanswered += 1;
      else if (isCorrect) correct += 1;
      else wrong += 1;
      const topic = q.topik || "Umum";
      const level = q.level || "C2";
      const indicator = q.indikator || q.subtopik || "Umum";
      topics[topic] ||= { total: 0, correct: 0 };
      levels[level] ||= { total: 0, correct: 0 };
      indicators[indicator] ||= { total: 0, correct: 0 };
      topics[topic].total += 1;
      levels[level].total += 1;
      indicators[indicator].total += 1;
      if (isCorrect) {
        topics[topic].correct += 1;
        levels[level].correct += 1;
        indicators[indicator].correct += 1;
      }
    });
    const total = state.queue.length;
    const score = total ? Math.round((correct / total) * 100) : 0;
    return {
      reason,
      total,
      correct,
      wrong,
      unanswered,
      flagged: Object.values(state.flagged).filter(Boolean).length,
      score,
      encouragement: pickEncouragement(score),
      bestStreak: state.bestStreak,
      duration: state.startedAt ? Math.max(0, (state.finishedAt || Date.now()) - state.startedAt) : 0,
      topics,
      levels,
      indicators
    };
  }

  function finishSession(reason = "Selesai") {
    if (state.status === "finished") return;
    stopTimer();
    state.status = "finished";
    state.finishedAt = Date.now();
    state.finishReason = reason;
    state.lastResult = computeResult(reason);
    saveProgress();
    renderShell();
    renderWorkspace();
    updateTimerDisplay(true);
    const view = $("resultView");
    if (view?.scrollIntoView) view.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function groupBars(groups) {
    const entries = Object.entries(groups || {}).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) return "<p class='text-xs text-[var(--muted)]'>Belum ada data.</p>";
    return entries.map(([name, v]) => {
      const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0;
      return `
        <div>
          <div class="flex items-center justify-between text-xs font-semibold">
            <span>${escapeHTML(name)}</span><span>${v.correct}/${v.total} (${pct}%)</span>
          </div>
          <div class="result-bar-track"><div class="result-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join("");
  }

  function resultEvaluation(r) {
    if (r.score >= 85) {
      return {
        label: "Sangat baik",
        tone: "text-[var(--state-success)] dark:text-[var(--color-success-300)]",
        summary: "Pemahaman kamu sudah sangat kuat pada sesi ini. Pertahankan ritme belajarmu.",
        lines: [
          `${r.correct} dari ${r.total} soal terjawab benar.`,
          r.wrong ? `${r.wrong} jawaban masih perlu ditinjau kembali.` : "Tidak ada jawaban yang salah pada sesi ini.",
          r.unanswered ? `${r.unanswered} soal belum dijawab karena sesi diakhiri.` : "Seluruh soal dalam sesi ini sudah dijawab."
        ]
      };
    }
    if (r.score >= 70) {
      return {
        label: "Baik",
        tone: "text-[var(--state-success)] dark:text-[var(--color-success-300)]",
        summary: "Pemahaman kamu sudah baik. Beberapa bagian masih bisa diperketat.",
        lines: [
          `${r.correct} dari ${r.total} soal terjawab benar.`,
          `${r.wrong} jawaban perlu ditinjau sebelum latihan berikutnya.`,
          r.unanswered ? `${r.unanswered} soal belum dijawab karena sesi diakhiri.` : "Seluruh soal dalam sesi ini sudah dijawab."
        ]
      };
    }
    if (r.score >= 50) {
      return {
        label: "Cukup",
        tone: "text-[var(--color-amber-600)] dark:text-[var(--color-amber-300)]",
        summary: "Pemahaman kamu mulai terbentuk. Fokus pada bagian yang masih sering salah.",
        lines: [
          `${r.correct} dari ${r.total} soal terjawab benar.`,
          `${r.wrong} jawaban perlu dipelajari lagi lewat pembahasan.`,
          r.unanswered ? `${r.unanswered} soal belum dijawab karena sesi diakhiri.` : "Seluruh soal dalam sesi ini sudah dijawab."
        ]
      };
    }
    return {
      label: "Perlu latihan",
      tone: "text-[var(--state-danger)] dark:text-[var(--color-danger-300)]",
      summary: "Ini bukan kegagalan. Ada bagian materi yang perlu dibaca ulang sebelum latihan berikutnya.",
      lines: [
        `${r.correct} dari ${r.total} soal terjawab benar.`,
        `${r.wrong} jawaban bisa menjadi fokus belajarmu berikutnya.`,
        r.unanswered ? `${r.unanswered} soal belum dijawab karena sesi diakhiri.` : "Seluruh soal dalam sesi ini sudah dijawab."
      ]
    };
  }

  function resultRecommendations(r) {
    const list = [];
    if (r.unanswered > 0) {
      list.push("Selesaikan seluruh soal pada sesi berikutnya agar hasil menggambarkan pemahamanmu.");
    }
    if (r.wrong > 0) {
      list.push("Buka pembahasan soal salah, lalu ulangi dengan tombol Ulangi Soal Salah.");
    }
    Object.entries(r.topics || {})
      .map(([name, v]) => ({ name, total: v.total, correct: v.correct, pct: v.total ? Math.round((v.correct / v.total) * 100) : 0 }))
      .filter((v) => v.correct < v.total)
      .sort((a, b) => a.pct - b.pct || b.total - a.total)
      .slice(0, 2)
      .forEach((v) => {
        list.push(`Fokus mengulang materi ${v.name} (${v.correct}/${v.total}, ${v.pct}%).`);
      });
    if (!list.length) {
      list.push("Pertahankan konsistensi dengan mengulang bank ini beberapa hari setelahnya.");
    }
    if (r.flagged > 0 && list.length < 4) {
      list.push(`Tinjau kembali ${r.flagged} soal yang ditandai ragu.`);
    }
    return list.slice(0, 4);
  }

  function renderResult() {
    renderSafely(() => {
      if (!state.lastResult) state.lastResult = computeResult();
      const r = state.lastResult;
      const subject = activeSubject();
      const evaluation = resultEvaluation(r);
      $("resultTitle").textContent = `${subject.namaMapel} - ${tBank(state.bank)} - ${tMode(state.mode)}`;
      $("resultMessage").textContent = "Latihan selesai. Berikut ringkasan hasil dan langkah berikutnya untukmu.";
      $("resultEncouragement").textContent = r.encouragement || pickEncouragement(r.score);
      $("resultAccuracy").textContent = `${r.score}% benar`;
      $("scoreValue").textContent = String(r.score);
      $("scoreRing").style.setProperty("--score", String(r.score));
      $("resultEvaluation").innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-extrabold ${evaluation.tone}">${escapeHTML(evaluation.label)}</p>
          <span class="result-badge">${r.score}/100</span>
        </div>
        <p class="text-xs leading-6 text-[var(--muted)]">${mdInline(evaluation.summary)}</p>
        <ul class="result-check-list">
          ${evaluation.lines.map((line) => `<li>${mdInline(line)}</li>`).join("")}
        </ul>`;
      $("resultRecommendations").innerHTML = `
        <ol class="result-recommendation-list">
          ${resultRecommendations(r).map((item, i) => `
            <li>
              <span class="result-recommendation-num">${i + 1}</span>
              <span>${mdInline(item)}</span>
            </li>`).join("")}
        </ol>`;
      $("retryWrongBtn").disabled = r.wrong === 0;
      const stats = [
        ["Benar", r.correct, "text-[var(--state-success)] dark:text-[var(--color-success-300)]"],
        ["Salah", r.wrong, "text-[var(--state-danger)] dark:text-[var(--color-danger-300)]"],
        ["Kosong", r.unanswered, "text-[var(--text-secondary)] dark:text-[var(--text-secondary)]"],
        ["Ragu", r.flagged, "text-[var(--color-amber-600)] dark:text-[var(--color-amber-300)]"]
      ];
      $("resultStats").innerHTML = stats.map(([label, value, color]) => `
        <div class="stat-card text-center">
          <p class="${color} text-xl font-extrabold">${value}</p>
          <p class="mt-1 text-[11px] font-semibold text-[var(--muted)]">${label}</p>
        </div>`).join("") + `
        <div class="stat-card col-span-2 text-center">
          <p class="text-sm font-extrabold" style="font-family:var(--mono)">${formatTime(Math.floor(r.duration / 1000))}</p>
          <p class="mt-1 text-[11px] font-semibold text-[var(--muted)]">${mdInline(r.reason)} - streak terbaik ${r.bestStreak}</p>
        </div>`;
      $("resultTopics").innerHTML = groupBars(r.topics);
      $("resultLevels").innerHTML = groupBars(r.levels);
      $("resultIndicators").innerHTML = groupBars(r.indicators);
      renderReview();
    }, "merender rekap");
  }

  function renderReview() {
    const box = $("reviewContainer");
    box.innerHTML = "";
    const header = document.createElement("div");
    header.innerHTML = `<h3 class="text-sm font-bold">Pembahasan Seluruh Soal</h3><p class="mt-1 text-xs text-[var(--muted)]">Tinjau kembali jawaban, istilah penting, dan pembahasan panjang.</p>`;
    box.appendChild(header);
    state.queue.forEach((id) => {
      const q = byId(id);
      if (!q) return;
      const chosen = state.answers[id];
      const isCorrect = chosen === q.answer;
      const card = document.createElement("article");
      card.className = "review-card";
      const keyTermRows = (q.keyTerms || []).map((t) => {
        const term = typeof t === "string" ? t : t.term || t.istilah || t.kata;
        const meaning = typeof t === "string" ? GLOSSARY[term] : t.meaning || t.teges || t.definisi || t.arti;
        return `<li><strong>${escapeHTML(term)}</strong> — ${escapeHTML(meaning || "Istilah penting.")}</li>`;
      }).join("");
      card.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-lg bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-bold text-[var(--accent)]">Soal ${escapeHTML(q.no || "-")}</span>
          <span class="text-[11px] font-semibold ${isCorrect ? "text-[var(--state-success)] dark:text-[var(--color-success-300)]" : "text-[var(--state-danger)] dark:text-[var(--color-danger-300)]"}">${chosen === undefined ? "Belum dijawab" : isCorrect ? "Benar" : "Salah"}</span>
          <span class="text-[11px] font-semibold text-[var(--muted)]">${escapeHTML(q.topik || "Umum")}</span>
          ${q.indikator ? `<span class="text-[11px] font-semibold text-[var(--teal)]">${escapeHTML(q.indikator)}</span>` : ""}
        </div>
        ${stimulusBlocks(q).length ? `<div class="font-bacaan mt-3 text-xs leading-6 text-[var(--muted)]">${stimulusBlocks(q).map((block) => renderStimulusBlock(block, q)).join("")}</div>` : ""}
        <p class="font-bacaan mt-3 text-sm font-bold leading-relaxed">${renderKeyTerms(q.question, q.keyTerms, false)}</p>
        <div class="mt-3 grid gap-1.5 text-xs">
          ${LETTERS.map((l) => `<div class="rounded-lg px-2.5 py-1.5 ${l === q.answer ? "bg-[var(--state-success-soft)] font-bold text-[var(--state-success)] dark:bg-[var(--state-success-soft)] dark:text-[var(--color-success-300)]" : l === chosen ? "bg-[var(--state-danger-soft)] text-[var(--state-danger)] dark:bg-[var(--state-danger-soft)] dark:text-[var(--color-danger-300)]" : "bg-[var(--paper-soft)] text-[var(--muted)]"}"><span class="font-extrabold">${l}.</span> ${renderKeyTerms(q.options[l] || "", q.keyTerms, false)}</div>`).join("")}
        </div>
        <p class="mt-3 text-xs font-bold text-[var(--muted)]">Kunci: ${escapeHTML(q.answer)} | Jawabanmu: ${escapeHTML(chosen || "-")}</p>
        ${keyTermRows ? `<ul class="mt-3 list-disc pl-5 text-xs leading-6">${keyTermRows}</ul>` : ""}
        <div class="mt-3 border-t border-[var(--line)] pt-3">
          <p class="text-xs font-bold text-[var(--teal)]">Pembahasan / Arti Kata</p>
          <div class="font-bacaan mt-2 text-sm leading-7 text-[var(--muted)] markdown-content">${renderKeyTerms(q.explanation || "", q.keyTerms, true)}</div>
        </div>`;
      box.appendChild(card);
    });
  }

  function enterWrongOnly() {
    const wrong = state.queue.filter((id) => state.answers[id] !== undefined && state.answers[id] !== byId(id)?.answer);
    if (!wrong.length) {
      setDownloadStatus("Belum ada soal salah untuk diulang.", true);
      return;
    }
    if (!state.wrongOnly) state.fullSession = snapshotSession();
    state.queue = wrong;
    state.optionOrder = Object.fromEntries(wrong.map((id) => [id, (state.optionOrder[id] || LETTERS).slice()]));
    state.current = 0;
    state.answers = {};
    state.hintsUsed = {};
    state.flagged = {};
    state.status = "running";
    state.startedAt = Date.now();
    state.finishedAt = 0;
    state.finishReason = "Selesai";
    state.lastResult = null;
    state.streak = 0;
    state.wrongOnly = true;
    startTimer();
    saveProgress();
    renderShell();
    renderWorkspace();
    setDownloadStatus(`${wrong.length} soal salah siap diulang.`, false);
  }

  function exitWrongOnly() {
    if (state.fullSession) restoreSession(state.fullSession);
    state.wrongOnly = false;
    state.fullSession = null;
    stopTimer();
    if (state.status === "running") startTimer();
    saveProgress();
    renderShell();
    renderWorkspace();
  }

  function animateContentSwap() {
    const workspace = state.mode === "belajar" ? $("studyWorkspace") : $("quizWorkspace");
    if (!workspace) return;
    window.clearTimeout(state.contentTransitionTimer);
    workspace.classList.remove("content-swap");
    void workspace.offsetWidth;
    workspace.classList.add("content-swap");
    state.contentTransitionTimer = window.setTimeout(() => workspace.classList.remove("content-swap"), 520);
  }

  function switchSubject(id) {
    if (!BANK[id] || id === state.subject) return;
    closeSubjectMenu();
    closeMobileNav();
    saveProgress();
    state.subject = id;
    state.flowSubject = id;
    state.wrongOnly = false;
    state.fullSession = null;
    resetStudyUiState();
    if (aiTutor) aiTutor.reset();
    savePreferences();
    startSession(false);
    animateContentSwap();
  }

  function switchBank(bank) {
    if (!BANK_LABEL[bank] || bank === state.bank) return;
    saveProgress();
    state.bank = bank;
    state.wrongOnly = false;
    state.fullSession = null;
    savePreferences();
    startSession(false);
    animateContentSwap();
  }

  function animateModeSwitch(mode) {
    const targets = mode === "belajar"
      ? [$("mainNav"), $("studyWorkspace"), $("modeStudyBtn")]
      : [$("examTopbar"), $("quizWorkspace"), $("modePracticeBtn")];
    const sweep = $("modeSweep");
    window.clearTimeout(state.modeTransitionTimer);
    targets.forEach((el, i) => {
      if (!el) return;
      el.classList.remove("mode-enter", "mode-tab-pulse");
      void el.offsetWidth;
      el.classList.add(i === targets.length - 1 ? "mode-tab-pulse" : "mode-enter");
    });
    if (sweep) {
      sweep.classList.remove("run");
      void sweep.offsetWidth;
      sweep.classList.add("run");
    }
    state.modeTransitionTimer = window.setTimeout(() => {
      targets.forEach((el) => el?.classList.remove("mode-enter", "mode-tab-pulse"));
      sweep?.classList.remove("run");
    }, 700);
  }

  function switchMode(mode) {
    if (!MODE_LABEL[mode] || mode === state.mode) return;
    closeSubjectMenu();
    closeMobileNav();
    saveProgress();
    state.mode = mode;
    state.wrongOnly = false;
    state.fullSession = null;
    resetStudyUiState();
    savePreferences();
    startSession(mode === "belajar");
    animateModeSwitch(mode);
  }

  function setDownloadStatus(text, isError = false) {
    const el = $("downloadStatus");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden", "text-[var(--state-danger)]", "text-[var(--state-success)]", "dark:text-[var(--color-danger-300)]", "dark:text-[var(--color-success-300)]");
    el.classList.add(isError ? "text-[var(--state-danger)] dark:text-[var(--color-danger-300)]" : "text-[var(--state-success)] dark:text-[var(--color-success-300)]");
    window.clearTimeout(state.downloadStatusTimer);
    state.downloadStatusTimer = window.setTimeout(() => el.classList.add("hidden"), 6000);
  }

  function setImportStatus(text, isError = false) {
    const el = $("importStatus");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden", "text-[var(--state-danger)]", "text-[var(--state-success)]", "dark:text-[var(--color-danger-300)]", "dark:text-[var(--color-success-300)]");
    el.classList.add(isError ? "text-[var(--state-danger)] dark:text-[var(--color-danger-300)]" : "text-[var(--state-success)] dark:text-[var(--color-success-300)]");
    window.clearTimeout(state.importStatusTimer);
    state.importStatusTimer = window.setTimeout(() => el.classList.add("hidden"), 6000);
  }

  function isThemeDark() {
    return state.theme === "dark";
  }

  function applyTheme() {
    const dark = isThemeDark();
    const light = !dark;
    document.documentElement.classList.toggle("dark", dark);
    document.body.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", light);
    document.body.classList.toggle("light", light);
    $("themeIcon").textContent = dark ? "☀" : "☾";
    $("themeLabel").textContent = dark ? "Terang" : "Gelap";
    $("themeToggleBtn").setAttribute("aria-pressed", String(dark));
    $("themeToggleBtn").setAttribute("aria-label", dark ? "Ganti ke tema terang" : "Ganti ke tema gelap");
    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", dark ? "dark" : "light");
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute("content", dark ? "#0F172A" : "#F8FAFC");
  }

  function toggleTheme() {
    document.documentElement.classList.add("theme-transition");
    state.theme = isThemeDark() ? "light" : "dark";
    applyTheme();
    savePreferences();
    window.clearTimeout(state.themeTransitionTimer);
    state.themeTransitionTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 360);
  }

  function ensurePin() {
    try {
      if (!localStorage.getItem(KEYS.creator)) localStorage.setItem(KEYS.creator, DEFAULT_CREATOR_PIN);
    } catch (error) {
      console.warn("[ASAS] PIN tidak dapat disimpan.", error);
    }
  }

  function applyCreatorVisibility() {
    const on = state.creatorMode;
    document.body.classList.toggle("creator-mode", on);
    $("creatorTools").classList.toggle("hidden", !on);
    $("creatorBadge").classList.toggle("hidden", !on);
    $("creatorLoginBtn").classList.toggle("hidden", on);
    document.querySelectorAll("[data-creator-only]").forEach((el) => el.classList.toggle("hidden", !on));
  }

  function enableCreatorMode() {
    state.creatorMode = true;
    applyCreatorVisibility();
    renderCustomList();
  }

  function disableCreatorMode() {
    state.creatorMode = false;
    closeModal("questionModal");
    closeModal("creatorPinModal");
    closeModal("studyModal");
    applyCreatorVisibility();
  }

  function openPinModal() {
    $("creatorPinError").classList.add("hidden");
    $("creatorPinInput").value = "";
    $("creatorPinModal").classList.remove("hidden");
    window.setTimeout(() => $("creatorPinInput").focus(), 30);
  }

  function submitPin() {
    let stored = DEFAULT_CREATOR_PIN;
    try { stored = localStorage.getItem(KEYS.creator) || DEFAULT_CREATOR_PIN; } catch (error) { stored = DEFAULT_CREATOR_PIN; }
    if ($("creatorPinInput").value.trim() === stored) {
      enableCreatorMode();
      closeModal("creatorPinModal");
      setDownloadStatus("Mode Pembuat dibuka.", false);
    } else {
      $("creatorPinError").textContent = "PIN salah.";
      $("creatorPinError").classList.remove("hidden");
    }
  }

  function openModal(id) {
    $(id).classList.remove("hidden");
  }

  function closeModal(id) {
    $(id).classList.add("hidden");
  }

  function parseTerms(raw) {
    return String(raw || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).map((term) => ({
      term,
      meaning: GLOSSARY[term.toLocaleLowerCase("id-ID")] || "Istilah penting dalam soal."
    }));
  }

  function uniqueId(questions, base) {
    let id = base;
    let suffix = 2;
    const ids = new Set(questions.map((q) => q.id));
    while (ids.has(id)) id = `${base}-${suffix++}`;
    return id;
  }

  function renderCustomList() {
    const list = loadCustomQuestions();
    const box = $("customQuestionList");
    if (!state.creatorMode || !list.length) {
      box.innerHTML = state.creatorMode ? "<p class='text-xs text-[var(--muted)]'>Belum ada soal kustom di bank ini.</p>" : "";
      return;
    }
    box.innerHTML = list.map((q, i) => `
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper-soft)] p-3">
        <span class="rounded-lg bg-[var(--accent-soft)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--accent)]">${i + 1}</span>
        <p class="min-w-0 flex-1 truncate text-xs font-bold">${escapeHTML(q.question)}</p>
        <button class="ink-btn" data-edit-custom="${i}" type="button">Ubah</button>
        <button class="ink-btn danger" data-delete-custom="${i}" type="button">Hapus</button>
      </div>`).join("");
  }

  function openQuestionModal(index = -1) {
    if (!state.creatorMode) return;
    const list = loadCustomQuestions();
    const q = index >= 0 ? list[index] : null;
    state.editingIndex = index;
    $("questionModalTitle").textContent = q ? "Ubah Soal" : "Tambah Soal";
    $("questionModalSubject").textContent = `${activeSubject().namaMapel} - Bank ${tBank(state.bank)}`;
    $("qTopik").value = q?.topik || "Umum";
    $("qSubtopik").value = q?.subtopik || "";
    $("qIndikator").value = q?.indikator || "";
    $("qLevel").value = q?.level || "C2";
    $("qStimulus").value = q?.stimulusText || "";
    $("qImageUrl").value = q?.imageUrl || "";
    $("qImageCaption").value = q?.imageCaption || "";
    $("qQuestion").value = q?.question || "";
    $("qKeyTerms").value = (q?.keyTerms || []).map((t) => typeof t === "string" ? t : t.term).join("; ");
    LETTERS.forEach((l) => { $(`qOption${l}`).value = q?.options?.[l] || ""; });
    $("qAnswer").value = q?.answer || "A";
    $("qExplanation").value = q?.explanation || "";
    $("qHints").value = (q?.hints || []).join("; ");
    openModal("questionModal");
  }

  function closeQuestionModal() {
    state.editingIndex = -1;
    closeModal("questionModal");
  }

  function handleQuestionSubmit(event) {
    event.preventDefault();
    if (!state.creatorMode) return;
    const list = loadCustomQuestions();
    const options = Object.fromEntries(LETTERS.map((l) => [l, $(`qOption${l}`).value.trim()]));
    const q = normalizeQuestion({
      id: state.editingIndex >= 0 ? list[state.editingIndex]?.id : "",
      no: state.editingIndex >= 0 ? list[state.editingIndex]?.no : undefined,
      topik: $("qTopik").value.trim() || "Umum",
      subtopik: $("qSubtopik").value.trim() || "Bank Kustom",
      indikator: $("qIndikator").value.trim(),
      level: $("qLevel").value,
      stimulusText: $("qStimulus").value.trim(),
      imageUrl: $("qImageUrl").value.trim(),
      imageCaption: $("qImageCaption").value.trim(),
      question: $("qQuestion").value.trim(),
      options,
      answer: $("qAnswer").value,
      explanation: $("qExplanation").value.trim(),
      hints: $("qHints").value.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean),
      keyTerms: parseTerms($("qKeyTerms").value),
      posterMockup: state.editingIndex >= 0 ? list[state.editingIndex]?.posterMockup : null
    }, list.length);
    if (!q.question || LETTERS.some((l) => !q.options[l])) {
      setImportStatus("Pertanyaan dan kelima opsi wajib diisi.", true);
      return;
    }
    if (state.editingIndex >= 0 && list[state.editingIndex]) {
      list[state.editingIndex] = q;
    } else {
      q.id = uniqueId([...refreshActiveQuestions(), ...list], `custom-${Date.now().toString(36)}`);
      list.push(q);
    }
    saveCustomQuestions(list);
    closeQuestionModal();
    startSession(true);
    setImportStatus("Soal kustom tersimpan.", false);
  }

  function parseStudyLines(raw, separator = "|") {
    return String(raw || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(separator);
      return { left: parts.shift()?.trim() || "", right: parts.join(separator).trim() };
    });
  }

  function studySerializeNode(node) {
    const own = studyText(node?.judul || node);
    if (!own) return "";
    const children = (Array.isArray(node?.anak) ? node.anak : []).map(studySerializeNode).filter(Boolean);
    return children.length ? `${own} > ${children.join(" > ")}` : own;
  }

  function studyParseMindChildren(raw) {
    return String(raw || "").split(/[;]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
      const levels = part.split(">").map((s) => s.trim()).filter(Boolean);
      let root = null;
      let cursor = null;
      levels.forEach((label) => {
        const node = { judul: label, anak: [] };
        if (!root) root = node;
        else cursor.anak.push(node);
        cursor = node;
      });
      return root;
    }).filter(Boolean);
  }

  function studyDraftFromContent(content) {
    return {
      sumber: content.sumber || "",
      mindPusat: content.mindMap?.pusat || activeSubject().namaMapel,
      topik: studyTopicList(content).map((topic) => ({
        id: topic.id,
        nama: topic.nama,
        indikator: topic.indikatorKisi.join(", ")
      })),
      materiRingkas: (content.ringkas || []).map((item) => studyClone(item)),
      mindMap: (content.mindMap?.cabang || []).map((item) => ({
        id: item.id || "",
        topikId: item.topikId || "umum",
        judul: item.judul || "",
        anak: (item.anak || []).map(studySerializeNode).filter(Boolean).join("; ")
      })),
      flashcards: (content.flashcards || []).map((item) => studyClone(item)),
      poinPenting: (content.poin || []).map((item) => studyClone(item)),
      istilahPenting: (content.glosarium || []).map((item) => studyClone(item))
    };
  }

  function studyBlankDraftItem(section, draft) {
    const firstTopic = draft.topik[0]?.id || "umum";
    if (section === "topik") return { id: "", nama: "", indikator: "" };
    if (section === "materiRingkas") return { id: "", topikId: firstTopic, judul: "", isi: "", subtopik: "" };
    if (section === "mindMap") return { id: "", topikId: firstTopic, judul: "", anak: "" };
    if (section === "flashcards") return { id: "", topikId: firstTopic, jenis: "Pengertian", pertanyaan: "", jawaban: "" };
    if (section === "poinPenting") return { id: "", topikId: firstTopic, teks: "", wajib: false };
    return { id: "", topikId: firstTopic, istilah: "", arti: "", penjelasan: "", contoh: "" };
  }

  function studyTopicOptions(draft, selected) {
    const options = studyUnique([...(draft.topik || []).map((t) => t.id || studySlug(t.nama)), selected, "umum"]);
    return options.map((id) => {
      const name = draft.topik?.find((t) => (t.id || studySlug(t.nama)) === id)?.nama || (id === "umum" ? "Umum" : id);
      return `<option value="${escapeHTML(id)}" ${selected === id ? "selected" : ""}>${escapeHTML(name)}</option>`;
    }).join("");
  }

  function studyEditorField(section, index, field, value, options = "") {
    const base = `data-editor-section="${section}" data-editor-index="${index}" data-editor-field="${field}"`;
    if (options === "textarea") {
      return `<textarea class="field-input mt-1 w-full font-bacaan" rows="3" ${base}>${escapeHTML(value)}</textarea>`;
    }
    if (options === "checkbox") {
      return `<input type="checkbox" class="mt-1" ${base} ${value ? "checked" : ""} />`;
    }
    if (typeof options === "string" && options.startsWith("select:")) {
      return `<select class="field-input mt-1 w-full" ${base}>${options.slice(7)}</select>`;
    }
    return `<input class="field-input mt-1 w-full" value="${escapeHTML(value)}" ${base} />`;
  }

  function studyEditorRow(section, item, index, draft) {
    const label = (field, text, input) => `<label class="block text-[11px] font-bold">${text}${input}</label>`;
    const remove = `<button class="text-[11px] font-extrabold text-[var(--accent)] underline" type="button" data-editor-remove="${section}" data-index="${index}">Hapus</button>`;
    let fields = "";
    if (section === "topik") {
      fields = `<div class="grid gap-2 sm:grid-cols-3">
        ${label("nama", "Nama topik", studyEditorField(section, index, "nama", item.nama || ""))}
        ${label("id", "ID topik", studyEditorField(section, index, "id", item.id || ""))}
        ${label("indikator", "Indikator kisi", studyEditorField(section, index, "indikator", item.indikator || ""))}
      </div>`;
    } else if (section === "materiRingkas") {
      fields = `<div class="grid gap-2 sm:grid-cols-2">
        ${label("topikId", "Topik", studyEditorField(section, index, "topikId", item.topikId || "umum", `select:${studyTopicOptions(draft, item.topikId || "umum")}`))}
        ${label("judul", "Judul", studyEditorField(section, index, "judul", item.judul || ""))}
      </div>
      ${label("isi", "Penjelasan", studyEditorField(section, index, "isi", item.isi || "", "textarea"))}
      ${label("subtopik", "Subtopik (pisahkan dengan koma)", studyEditorField(section, index, "subtopik", Array.isArray(item.subtopik) ? item.subtopik.join(", ") : item.subtopik || ""))}`;
    } else if (section === "mindMap") {
      fields = `<div class="grid gap-2 sm:grid-cols-2">
        ${label("topikId", "Topik", studyEditorField(section, index, "topikId", item.topikId || "umum", `select:${studyTopicOptions(draft, item.topikId || "umum")}`))}
        ${label("judul", "Judul cabang", studyEditorField(section, index, "judul", item.judul || ""))}
      </div>
      ${label("anak", "Anak (pisahkan ; untuk cabang, > untuk turunan)", studyEditorField(section, index, "anak", item.anak || "", "textarea"))}`;
    } else if (section === "flashcards") {
      fields = `<div class="grid gap-2 sm:grid-cols-3">
        ${label("topikId", "Topik", studyEditorField(section, index, "topikId", item.topikId || "umum", `select:${studyTopicOptions(draft, item.topikId || "umum")}`))}
        ${label("jenis", "Jenis", studyEditorField(section, index, "jenis", item.jenis || "Pengertian", `select:${["Pengertian", "Ciri-ciri", "Fungsi", "Perbedaan", "Analisis", "Contoh"].map((v) => `<option value="${v}" ${item.jenis === v ? "selected" : ""}>${v}</option>`).join("")}`))}
        ${label("id", "ID (opsional)", studyEditorField(section, index, "id", item.id || ""))}
      </div>
      ${label("pertanyaan", "Pertanyaan", studyEditorField(section, index, "pertanyaan", item.pertanyaan || "", "textarea"))}
      ${label("jawaban", "Jawaban", studyEditorField(section, index, "jawaban", item.jawaban || "", "textarea"))}`;
    } else if (section === "poinPenting") {
      fields = `<div class="grid gap-2 sm:grid-cols-2">
        ${label("topikId", "Topik", studyEditorField(section, index, "topikId", item.topikId || "umum", `select:${studyTopicOptions(draft, item.topikId || "umum")}`))}
        ${label("wajib", "Wajib", studyEditorField(section, index, "wajib", item.wajib === true, "checkbox"))}
      </div>
      ${label("teks", "Poin", studyEditorField(section, index, "teks", item.teks || "", "textarea"))}`;
    } else {
      fields = `<div class="grid gap-2 sm:grid-cols-2">
        ${label("topikId", "Topik", studyEditorField(section, index, "topikId", item.topikId || "umum", `select:${studyTopicOptions(draft, item.topikId || "umum")}`))}
        ${label("istilah", "Istilah", studyEditorField(section, index, "istilah", item.istilah || ""))}
      </div>
      ${label("arti", "Arti", studyEditorField(section, index, "arti", item.arti || ""))}
      ${label("penjelasan", "Penjelasan", studyEditorField(section, index, "penjelasan", item.penjelasan || "", "textarea"))}
      ${label("contoh", "Contoh", studyEditorField(section, index, "contoh", item.contoh || ""))}`;
    }
    return `<div class="rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] p-3">
      <div class="mb-2 flex items-center justify-between gap-2"><span class="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Entri ${index + 1}</span>${remove}</div>
      ${fields}
    </div>`;
  }

  function renderStudyItemEditor() {
    const draft = state.studyEditorDraft;
    if (!draft) return;
    const titles = Object.fromEntries(["topik", ...Object.keys(STUDY_EDITOR_SECTIONS)].map((key) => [key, tEditorSection(key)]));
    const order = ["topik", ...Object.keys(STUDY_EDITOR_SECTIONS)];
    $("studyItemEditor").innerHTML = `
      <label class="block text-xs font-bold">Pusat Mind Mapping<input class="field-input mt-1 w-full" data-editor-global="mindPusat" value="${escapeHTML(draft.mindPusat || "")}" /></label>
      ${order.map((section) => `
        <section class="rounded-xl border border-[var(--line)] p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-xs font-extrabold text-[var(--accent)]">${escapeHTML(titles[section])} <span class="font-normal text-[var(--muted)]">(${draft[section].length})</span></p>
            <button class="ink-btn" type="button" data-editor-add="${section}">+ Tambah</button>
          </div>
          <div class="space-y-2">${draft[section].length
            ? draft[section].map((item, i) => studyEditorRow(section, item, i, draft)).join("")
            : `<p class="text-[11px] text-[var(--muted)]">Belum ada entri.</p>`}</div>
        </section>`).join("")}`;
  }

  function studyDraftToContent() {
    const draft = state.studyEditorDraft;
    const topik = (draft.topik || []).map((item) => {
      const nama = studyText(item.nama);
      return nama ? {
        id: studyText(item.id) || studySlug(nama),
        nama,
        indikatorKisi: String(item.indikator || "").split(/[,\s]+/).map(Number).filter(Number.isFinite)
      } : null;
    }).filter(Boolean);
    const getId = (item) => studyText(item.id) || studySlug(studyText(item.judul || item.istilah || item.pertanyaan || item.teks) || "item");
    const subtopikOf = (item) => String(item.subtopik || "").split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
    return {
      status: "tersedia",
      sumber: $("studySumberInput").value.trim(),
      topik,
      materiRingkas: (draft.materiRingkas || []).map((item) => ({
        id: studyText(item.id) || `mr-${studySlug(item.judul || "materi")}`,
        topikId: studyText(item.topikId) || "umum",
        judul: studyText(item.judul),
        isi: studyText(item.isi),
        subtopik: subtopikOf(item)
      })).filter((item) => item.judul && item.isi),
      mindMap: {
        pusat: $("studyItemEditor").querySelector('[data-editor-global="mindPusat"]')?.value.trim() || activeSubject().namaMapel,
        cabang: (draft.mindMap || []).map((item) => ({
          id: studyText(item.id) || getId(item),
          topikId: studyText(item.topikId) || "umum",
          judul: studyText(item.judul),
          anak: studyParseMindChildren(item.anak)
        })).filter((item) => item.judul)
      },
      flashcards: (draft.flashcards || []).map((item) => ({
        id: studyText(item.id) || `fc-${studySlug(item.pertanyaan || "kartu").slice(0, 32)}`,
        topikId: studyText(item.topikId) || "umum",
        jenis: studyText(item.jenis) || "Pengertian",
        pertanyaan: studyText(item.pertanyaan),
        jawaban: studyText(item.jawaban)
      })).filter((item) => item.pertanyaan && item.jawaban),
      poinPenting: (draft.poinPenting || []).map((item) => ({
        id: studyText(item.id) || `pp-${studySlug(item.teks || "poin").slice(0, 32)}`,
        topikId: studyText(item.topikId) || "umum",
        teks: studyText(item.teks),
        wajib: item.wajib === true
      })).filter((item) => item.teks),
      istilahPenting: (draft.istilahPenting || []).map((item) => ({
        id: studyText(item.id) || `ip-${studySlug(item.istilah || "istilah")}`,
        topikId: studyText(item.topikId) || "umum",
        istilah: studyText(item.istilah),
        arti: studyText(item.arti),
        penjelasan: studyText(item.penjelasan),
        contoh: studyText(item.contoh)
      })).filter((item) => item.istilah && item.arti)
    };
  }

  function openStudyModal() {
    if (!state.creatorMode) return;
    const content = loadStudyContent();
    $("studyModalSubject").textContent = `${activeSubject().namaMapel} - Mode Belajar`;
    $("studySumberInput").value = content.sumber || "";
    $("studyMindCenterInput").value = content.mindMap?.pusat || activeSubject().namaMapel;
    $("studyRingkasInput").value = content.ringkas.map((item) => `${item.judul} | ${item.isi}`).join("\n");
    $("studyMindInput").value = (content.mindMap?.cabang || []).map((item) => `${item.judul} | ${item.anak.map(studySerializeNode).join("; ")}`).join("\n");
    $("studyFlashInput").value = content.flashcards.map((item) => `${item.pertanyaan} | ${item.jawaban}`).join("\n");
    $("studyPoinInput").value = content.poin.map((item) => `${item.topik} | ${item.teks}`).join("\n");
    $("studyGlosariumInput").value = content.glosarium.map((item) => `${item.istilah} | ${item.arti}`).join("\n");
    state.studyEditorDraft = studyDraftFromContent(content);
    state.studyEditorDirty = false;
    renderStudyItemEditor();
    openModal("studyModal");
  }

  function buildStudyFromForm() {
    const pairs = (id) => parseStudyLines($(id).value).filter((item) => item.left && item.right);
    return {
      sumber: $("studySumberInput").value.trim(),
      ringkas: pairs("studyRingkasInput").map((item) => ({ judul: item.left, isi: item.right, subtopik: [] })),
      mindMap: {
        pusat: $("studyMindCenterInput").value.trim() || activeSubject().namaMapel,
        cabang: pairs("studyMindInput").map((item) => ({ judul: item.left, anak: item.right.split(/[;,]+/).map((s) => s.trim()).filter(Boolean) }))
      },
      flashcards: pairs("studyFlashInput").map((item) => ({ topik: "Umum", pertanyaan: item.left, jawaban: item.right })),
      poin: parseStudyLines($("studyPoinInput").value).map((item) => item.right
        ? { topik: item.left, teks: item.right }
        : { topik: "Umum", teks: item.left }).filter((item) => item.teks),
      glosarium: pairs("studyGlosariumInput").map((item) => ({ istilah: item.left, arti: item.right }))
    };
  }

  function handleStudySubmit(event) {
    event.preventDefault();
    if (!state.creatorMode) return;
    try {
      const content = state.studyEditorDirty && state.studyEditorDraft
        ? studyDraftToContent()
        : buildStudyFromForm();
      saveStudyContent(content);
      closeModal("studyModal");
      resetStudyUiState();
      renderShell();
      renderWorkspace();
      setImportStatus(`Materi ${activeSubject().namaMapel} tersimpan.`, false);
    } catch (error) {
      setImportStatus(`Gagal menyimpan materi: ${error.message || "data tidak valid."}`, true);
    }
  }

  function exportStudyContent() {
    if (!state.creatorMode) return;
    const content = loadStudyContent();
    const payload = {
      format: "asas-study-content",
      version: 1,
      subject: state.subject,
      exportedAt: new Date().toISOString(),
      content
    };
    saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `ASAS-Materi-${safeFilename(activeSubject().namaMapel)}.json`);
    setImportStatus("Materi Mode Belajar diekspor.", false);
  }

  async function handleStudyImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setImportStatus(`Membaca ${file.name}...`, false);
    try {
      const data = JSON.parse(await file.text());
      const content = data.content || data.materi || data;
      if (data.format && data.format !== "asas-study-content") throw new Error("format JSON materi tidak dikenal.");
      if (data.subject && data.subject !== state.subject) throw new Error(`JSON untuk ${data.subject}, bukan ${state.subject}.`);
      saveStudyContent(content);
      input.value = "";
      resetStudyUiState();
      renderShell();
      renderWorkspace();
      setImportStatus("Materi Mode Belajar berhasil diimpor.", false);
    } catch (error) {
      console.error("[ASAS] Impor materi gagal.", error);
      setImportStatus(`Gagal mengimpor materi: ${error.message || "format tidak dikenal."}`, true);
      input.value = "";
    }
  }

  function resetStudyContent() {
    if (!state.creatorMode) return;
    if (!window.confirm(`Hapus materi kustom ${activeSubject().namaMapel} dan kembali ke materi bawaan?`)) return;
    clearStudyContent();
    resetStudyUiState();
    renderShell();
    renderWorkspace();
    setImportStatus("Materi kustom dihapus.", false);
  }

  function htmlToText(html) {
    const doc = typeof DOMParser === "function" ? new DOMParser() : null;
    const el = doc ? doc.parseFromString(String(html || ""), "text/html") : document.createElement("div");
    if (!doc) el.innerHTML = String(html || "");
    el.querySelectorAll("script,style").forEach((node) => node.remove());
    return (el.innerText || el.textContent || "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function parseQuestionsFromText(text) {
    const clean = String(text || "").replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
    if (!clean) return [];
    const blocks = clean.split(/\n[ \t]*(?=(?:\d{1,3}[.)]|No\.?\s*\d{1,3}|Pertanyaan\s*:|Question\s*:|Soal\s*:))/i).filter((b) => b.trim());
    return blocks.map((block, i) => {
      const qMatch = block.match(/(?:Pertanyaan|Question|Soal)\s*:\s*([\s\S]*?)(?=\n\s*[A-Ea-e][.)]\s|$)/i)
        || block.match(/^\s*(?:\d{1,3}[.)]|No\.?\s*\d{1,3})\s*([\s\S]*?)(?=\n\s*[A-Ea-e][.)]\s|$)/i);
      let question = (qMatch?.[1] || block.split("\n")[0] || "").trim().replace(/\s+/g, " ");
      if (!question && /[?]/.test(block)) question = block.split("?")[0].trim() + "?";
      const options = {};
      LETTERS.forEach((letter) => {
        const re = new RegExp(`(?:^|\\n)\\s*${letter}[.)]\\s*([^\\n]+(?:\\n(?!\\s*(?:[A-Ea-e][.)]|Jawaban|Kunci|Pembahasan|Petunjuk|Explanation)\\s)[^\\n]*)*)`, "i");
        const m = block.match(re);
        if (m) options[letter] = m[1].trim().replace(/\s+/g, " ");
      });
      const keyMatch = block.match(/(?:Jawaban|Kunci|Answer|Key)\s*:\s*([A-Ea-e])\b/i);
      const explMatch = block.match(/(?:Pembahasan|Penjelasan|Explanation)\s*:\s*([\s\S]*?)(?=\n\s*(?:Petunjuk|Hints?|Clue|Cara)|\n\s*\d{1,3}[.)]|$)/i);
      const hintMatch = block.match(/(?:Petunjuk|Hints?|Clue)\s*:\s*([\s\S]*?)(?=\n\s*\d{1,3}[.)]|$)/i);
      const stimMatch = block.match(/(?:Stimulus|Bahan Bacaan|Teks)\s*:\s*([\s\S]*?)(?=\n\s*(?:Pertanyaan|Question|Soal|\d{1,3}[.)])|$)/i);
      if (!question || LETTERS.some((l) => !options[l]) || !keyMatch) return null;
      return normalizeQuestion({
        id: `import-${Date.now().toString(36)}-${i + 1}`,
        topik: "Impor",
        subtopik: "Bank Kustom",
        level: "C2",
        stimulusText: stimMatch?.[1]?.trim() || "",
        question,
        options,
        answer: keyMatch[1].toUpperCase(),
        explanation: explMatch?.[1]?.trim() || "Belum ada pembahasan.",
        hints: hintMatch?.[1]?.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean) || [],
        keyTerms: [],
        imageUrl: "",
        imageCaption: ""
      }, i);
    }).filter(Boolean);
  }

  async function readPdfText(arrayBuffer) {
    const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const parts = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      parts.push((content.items || []).map((item) => item.str || "").join(" "));
    }
    return parts.join("\n\n");
  }

  async function handleImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const type = input.dataset.importType || "json";
    setImportStatus(`Membaca ${file.name}...`, false);
    try {
      let questions = [];
      if (type === "json") {
        const data = JSON.parse(await file.text());
        questions = Array.isArray(data) ? data : data.questions || data[state.bank] || [];
      } else if (type === "docx") {
        if (!window.mammoth) throw new Error("Mammoth belum termuat.");
        const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        questions = parseQuestionsFromText(htmlToText(result.value));
      } else if (type === "pdf") {
        questions = parseQuestionsFromText(await readPdfText(await file.arrayBuffer()));
      }
      if (!Array.isArray(questions) || !questions.length) throw new Error("Tidak ada soal yang terbaca.");
      const list = loadCustomQuestions();
      const existingIds = new Set([...refreshActiveQuestions().map((q) => q.id), ...list.map((q) => q.id)]);
      questions.forEach((q, i) => {
        const clean = normalizeQuestion(q, list.length + i);
        clean.id = uniqueId([...list, ...Array.from(existingIds).map((id) => ({ id }))], clean.id.startsWith("import-") ? clean.id : `import-${Date.now().toString(36)}-${i + 1}`);
        existingIds.add(clean.id);
        list.push(clean);
      });
      saveCustomQuestions(list);
      input.value = "";
      startSession(true);
      setImportStatus(`${questions.length} soal berhasil ditambahkan.`, false);
    } catch (error) {
      console.error("[ASAS] Impor gagal.", error);
      setImportStatus(`Gagal mengimpor: ${error.message || "format tidak dikenal."}`, true);
      input.value = "";
    }
  }

  function exportJson() {
    const builtIn = (BANK[state.subject]?.[state.bank] || []).map((q, i) => normalizeQuestion(q, i));
    const custom = loadCustomQuestions();
    const payload = {
      format: "asas-question-bank",
      version: 1,
      subject: state.subject,
      bank: state.bank,
      exportedAt: new Date().toISOString(),
      builtIn,
      custom,
      questions: custom
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    saveBlob(blob, `ASAS-${safeFilename(activeSubject().namaMapel)}-${state.bank}-bank.json`);
    setImportStatus(`${builtIn.length} soal bawaan dan ${custom.length} soal kustom diekspor.`, false);
  }

  function clearCustomQuestions() {
    if (!window.confirm("Hapus semua soal kustom pada bank ini? Soal bawaan tidak dihapus.")) return;
    saveCustomQuestions([]);
    startSession(true);
    setImportStatus("Soal kustom dihapus.", false);
  }

  function saveBlob(blob, filename) {
    if (window.saveAs) {
      window.saveAs(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function buildPrintHTML(includeKey) {
    refreshActiveQuestions();
    const subject = activeSubject();
    const questions = cache;
    const rows = questions.map((q, i) => {
      const stimulusText = stimulusPlainText(q);
      const stimulus = stimulusText ? `<p style="font-family:'Lora',Georgia,serif;white-space:pre-line;margin:0 0 10px;line-height:1.7;">${escapeHTML(stimulusText)}</p>` : "";
      const options = LETTERS.map((l) => `<p style="font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:4px 0 4px 18px;line-height:1.5;">${l}. ${escapeHTML(q.options[l])}</p>`).join("");
      const key = includeKey ? `
        <p style="margin:10px 0 4px;font-size:12px;"><strong>Kunci:</strong> ${escapeHTML(q.answer)}</p>
        <p style="font-family:'Lora',Georgia,serif;margin:0 0 6px;font-size:12px;line-height:1.6;"><strong>Pembahasan:</strong> ${escapeHTML(q.explanation)}</p>
        ${(q.keyTerms || []).length ? `<p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px;"><strong>Istilah kunci:</strong> ${q.keyTerms.map((t) => escapeHTML(typeof t === "string" ? t : t.term)).join(", ")}</p>` : ""}` : "";
      return `
        <section style="break-inside:avoid;margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid var(--border-medium);">
          <p style="font-size:11px;font-weight:700;color:var(--state-accent);text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">${i + 1}. ${escapeHTML(q.topik || "Umum")} - ${escapeHTML(q.level || "C2")}</p>
          ${stimulus}
          <p style="font-family:'Lora',Georgia,serif;font-weight:700;line-height:1.7;margin:0 0 8px;">${escapeHTML(q.question)}</p>
          ${options}
          ${key}
        </section>`;
    }).join("");
    return `
      <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;color:var(--text-primary);background:var(--surface-raised);">
        <header style="border-bottom:3px solid var(--state-accent);padding-bottom:14px;margin-bottom:20px;">
          <p style="font-size:10px;font-weight:800;letter-spacing:2px;color:var(--state-accent);text-transform:uppercase;margin:0;">Ruang Latihan ASAS - Gasal Kelas XI</p>
          <h1 style="font-family:'Lora',Georgia,serif;font-size:24px;margin:6px 0 4px;">${escapeHTML(subject.namaMapel)}</h1>
          <p style="font-size:12px;color:var(--text-secondary);margin:0;">Bank ${tBank(state.bank)} - ${questions.length} soal - Durasi ${subject.durasiMenit} menit${includeKey ? " - Lengkap dengan kunci dan pembahasan" : ""}</p>
        </header>
        ${rows}
        <footer style="margin-top:24px;border-top:1px solid var(--border-medium);padding-top:10px;font-size:10px;color:var(--text-secondary);">Dicetak dari Ruang Latihan ASAS - ${APP_VERSION}</footer>
      </div>`;
  }

  function withPrintContainer(html) {
    const el = document.createElement("div");
    el.id = "asasPrintContainer";
    el.style.cssText = "position:fixed;left:0;top:0;z-index:-9999;width:794px;padding:48px;background:var(--surface-raised);color:var(--text-primary);";
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  async function downloadPdf(includeKey) {
    if (!cache.length) {
      setDownloadStatus("Tidak ada soal untuk diunduh.", true);
      return;
    }
    if (!window.html2pdf) {
      setDownloadStatus("Pustaka PDF belum termuat. Periksa koneksi internet.", true);
      return;
    }
    setDownloadStatus(`Menyiapkan PDF${includeKey ? " lengkap" : " soal"}...`, false);
    const el = withPrintContainer(buildPrintHTML(includeKey));
    const subject = activeSubject();
    const filename = `ASAS-${safeFilename(subject.namaMapel)}-${state.bank}${includeKey ? "-kunci" : ""}.pdf`;
    try {
      await window.html2pdf().set({
        margin: [12, 12, 14, 12],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).from(el).save();
      setDownloadStatus("PDF berhasil diunduh.", false);
    } catch (error) {
      console.error("[ASAS] PDF gagal.", error);
      setDownloadStatus("Gagal membuat PDF.", true);
    } finally {
      el.remove();
    }
  }

  function docxParagraph(text, options = {}) {
    const docx = window.docx;
    return new docx.Paragraph({
      children: [new docx.TextRun({
        text: String(text == null ? "" : text),
        font: "Times New Roman",
        size: options.size || 22,
        bold: !!options.bold,
        color: options.color
      })],
      spacing: { before: options.before || 0, after: options.after == null ? 80 : options.after },
      indent: options.indent ? { left: options.indent } : undefined
    });
  }

  async function downloadDocx() {
    if (!cache.length) {
      setDownloadStatus("Tidak ada soal untuk diunduh.", true);
      return;
    }
    if (!window.docx) {
      setDownloadStatus("Pustaka Word belum termuat. Periksa koneksi internet.", true);
      return;
    }
    setDownloadStatus("Menyiapkan dokumen Word...", false);
    try {
      const docx = window.docx;
      const subject = activeSubject();
      const children = [
        docxParagraph("Ruang Latihan ASAS - Gasal Kelas XI", { bold: true, size: 20, color: "AD402B", after: 40 }),
        docxParagraph(subject.namaMapel, { bold: true, size: 32, after: 40 }),
        docxParagraph(`Bank ${tBank(state.bank)} - ${cache.length} soal - Durasi ${subject.durasiMenit} menit - Lengkap dengan kunci dan pembahasan`, { size: 20, after: 240 })
      ];
      cache.forEach((q, i) => {
        children.push(docxParagraph(`${i + 1}. ${q.topik || "Umum"} (${q.level || "C2"})`, { bold: true, before: 180, after: 80 }));
        const stimulusText = stimulusPlainText(q);
        if (stimulusText) children.push(docxParagraph(stimulusText, { after: 120 }));
        children.push(docxParagraph(q.question, { bold: true, after: 80 }));
        LETTERS.forEach((l) => children.push(docxParagraph(`${l}. ${q.options[l]}`, { indent: 360, after: 40 })));
        children.push(docxParagraph(`Kunci: ${q.answer}`, { bold: true, before: 80, after: 40 }));
        children.push(docxParagraph(`Pembahasan: ${q.explanation}`, { after: 80 }));
        if ((q.keyTerms || []).length) {
          const terms = q.keyTerms.map((t) => (typeof t === "string" ? t : t.term)).join(", ");
          children.push(docxParagraph(`Istilah kunci: ${terms}`, { size: 20, after: 120 }));
        }
      });
      const doc = new docx.Document({ sections: [{ children }] });
      const blob = await docx.Packer.toBlob(doc);
      saveBlob(blob, `ASAS-${safeFilename(subject.namaMapel)}-${state.bank}-lengkap.docx`);
      setDownloadStatus("Dokumen Word berhasil diunduh.", false);
    } catch (error) {
      console.error("[ASAS] DOCX gagal.", error);
      setDownloadStatus("Gagal membuat dokumen Word.", true);
    }
  }

  function handleKeydown(event) {
    if (event.altKey && event.shiftKey && (event.key === "M" || event.key === "m")) {
      event.preventDefault();
      if (state.creatorMode) disableCreatorMode();
      else openPinModal();
      return;
    }
    const target = event.target;
    if (target && (target.matches("input,textarea,select") || target.isContentEditable)) {
      if (event.key === "Escape" && !$("creatorPinModal").classList.contains("hidden")) closeModal("creatorPinModal");
      return;
    }
    if (event.key === "Escape") {
      closeModal("creatorPinModal");
      closeQuestionModal();
      closeModal("studyModal");
      closeSubjectMenu();
      closeMobileNav();
      $("keyTermPopover").classList.add("hidden");
      $("bedahOutput").classList.add("hidden");
      return;
    }
    const modalOpen = ["creatorPinModal", "questionModal", "studyModal"].some((id) => !$(id).classList.contains("hidden"));
    if (modalOpen || state.status !== "running" || !$("quizWorkspace") || $("quizWorkspace").classList.contains("hidden")) return;
    const letterByDigit = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
    const key = String(event.key || "").toUpperCase();
    if (LETTERS.includes(key)) {
      event.preventDefault();
      selectAnswer(key);
    } else if (letterByDigit[key]) {
      event.preventDefault();
      selectAnswer(letterByDigit[key]);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(state.current + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(state.current - 1);
    }
  }

  function bindEvents() {
    $("themeToggleBtn").addEventListener("click", toggleTheme);
    const skipLink = document.querySelector(".skip-link");
    if (skipLink) {
      skipLink.addEventListener("click", (event) => {
        const main = $("mainContent");
        if (!main) return;
        event.preventDefault();
        if (typeof main.focus === "function") main.focus();
        if (main.scrollIntoView) main.scrollIntoView({ block: "start" });
      });
    }
    $("landingStartBtn").addEventListener("click", () => navigateFlow("subjects"));
    $("introStartBtn").addEventListener("click", () => navigateFlow("modes", { subject: currentFlowSubject() }));
    $("subjectCardGrid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-subject-card]");
      if (card && BANK[card.dataset.subjectCard]) navigateFlow("intro", { subject: card.dataset.subjectCard });
    });
    $("modePage").addEventListener("click", (e) => {
      const choice = e.target.closest("[data-flow-mode]");
      if (choice && MODE_LABEL[choice.dataset.flowMode]) navigateFlow("room", { subject: currentFlowSubject(), mode: choice.dataset.flowMode });
    });
    document.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-flow-nav]");
      if (nav) {
        const target = nav.dataset.flowNav;
        if (target === "home") navigateFlow("landing");
        if (target === "subjects") navigateFlow("subjects");
        if (target === "intro") navigateFlow("intro", { subject: currentFlowSubject() });
        if (target === "modes") navigateFlow("modes", { subject: currentFlowSubject() });
      }
      const scroll = e.target.closest("[data-flow-scroll]");
      if (scroll) {
        const target = $(scroll.dataset.flowScroll);
        if (target?.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    if (FLOW_ENABLED && typeof window.addEventListener === "function") {
      window.addEventListener("hashchange", syncRouteToState);
      window.addEventListener("popstate", syncRouteToState);
    }
    $("subjectMenuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = $("subjectGrid").classList.contains("hidden");
      $("subjectGrid").classList.toggle("hidden", !open);
      $("subjectMenuBtn").setAttribute("aria-expanded", String(open));
      if (open) {
        revealActiveSubject();
        window.setTimeout(revealActiveSubject, 80);
      }
    });
    $("subjectGrid").addEventListener("scroll", updateSubjectScrollUI);
    $("subjectGrid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-subject-id]");
      if (btn) switchSubject(btn.dataset.subjectId);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#subjectMenuBtn") && !e.target.closest("#subjectGrid")) closeSubjectMenu();
      if (e.target.closest("[data-close-mobile-nav]")) closeMobileNav();
    });
    $("backToModesBtn").addEventListener("click", () => {
      if (FLOW_ENABLED) {
        navigateFlow("modes");
        return;
      }
      switchMode("belajar");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("mobileNavBtn").addEventListener("click", openMobileNav);
    $("closeMobileNavBtn").addEventListener("click", closeMobileNav);
    $("collapseNavBtn").addEventListener("click", toggleNavCollapsed);
    $("modeStudyBtn").addEventListener("click", () => switchMode("belajar"));
    $("modePracticeBtn").addEventListener("click", () => switchMode("latihan"));
    $("studyTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-study-section]");
      if (!btn || !STUDY_SECTIONS[btn.dataset.studySection]) return;
      state.studySection = btn.dataset.studySection;
      markStudySeen("sections", state.studySection);
      savePreferences();
      renderStudy();
      renderShell();
    });
    $("studyBody").addEventListener("click", (e) => {
      const term = e.target.closest("[data-study-term]");
      if (term) {
        state.studyGlossarySelected = term.dataset.studyTerm;
        markStudySeen("glossary", term.dataset.studyTerm);
        renderStudy();
        renderShell();
        return;
      }
      const favorite = e.target.closest("[data-study-favorite]");
      if (favorite) {
        toggleStudyMark("favorites", favorite.dataset.studyFavorite);
        renderStudy();
        renderShell();
        return;
      }
      const filterBtn = e.target.closest("button[data-study-filter]");
      if (filterBtn) {
        const scope = filterBtn.dataset.studyFilter;
        const value = filterBtn.dataset.value || "";
        if (scope === "ringkas" || scope === "poin") state.studyTopicId = value;
        if (scope === "flashcard") {
          state.studyFlashFilterTopik = value;
          state.studyFlashOrderKey = "";
          state.studyCardIndex = 0;
          state.studyRevealed = false;
        }
        if (scope === "glosarium") state.studyGlossaryTopik = value;
        markStudySeen("topics", value || "semua");
        renderStudy();
        renderShell();
        return;
      }
      const mindExpand = e.target.closest("[data-study-mind-expand]");
      if (mindExpand) {
        const action = mindExpand.dataset.studyMindExpand;
        const viewport = captureMindViewport();
        studyMindWalk(loadStudyContent().mindMap?.cabang || [], (node, depth, key) => {
          state.studyExpandedNodes[key] = action === "all" || depth === 0;
        });
        renderStudy();
        restoreMindViewport(viewport);
        const focusKey = mindExpand.dataset.studyMindExpand;
        const restored = document.querySelector(`[data-study-mind-expand="${focusKey}"]`);
        if (restored) restored.focus({ preventScroll: true });
        return;
      }
      const pickTopic = e.target.closest("[data-study-topic-pick]");
      if (pickTopic) {
        const topicId = pickTopic.dataset.studyTopicPick;
        if (topicId) {
          state.studyTopicId = topicId;
          state.studyFlashFilterTopik = topicId;
          state.studyGlossaryTopik = topicId;
          state.studySection = "ringkas";
          state.studyFlashOrderKey = "";
          state.studyCardIndex = 0;
          markStudySeen("topics", topicId);
          savePreferences();
        }
        renderStudy();
        renderShell();
        return;
      }
      const jump = e.target.closest("[data-study-jump]");
      if (jump) {
        const topicId = jump.dataset.topikId;
        state.studyTopicId = topicId;
        state.studyFlashFilterTopik = topicId;
        state.studySection = jump.dataset.studyJump;
        state.studyFlashOrderKey = "";
        state.studyCardIndex = 0;
        state.studyRevealed = false;
        markStudySeen("topics", topicId);
        savePreferences();
        renderStudy();
        renderShell();
        return;
      }
      const nodeToggle = e.target.closest("[data-study-node-toggle]");
      if (nodeToggle) {
        const key = nodeToggle.dataset.studyNodeToggle;
        const viewport = captureMindViewport();
        state.studyExpandedNodes[key] = nodeToggle.getAttribute("aria-expanded") !== "true";
        renderStudy();
        restoreMindViewport(viewport);
        const restored = document.querySelector(`[data-study-node-toggle="${key}"]`)
          || document.querySelector(`[data-study-node-toggle="${CSS.escape(key)}"]`);
        if (restored) restored.focus({ preventScroll: true });
        return;
      }
      const action = e.target.closest("[data-study-card-action]")?.dataset.studyCardAction;
      if (!action) return;
      const list = studyCurrentFlashcards(loadStudyContent());
      if (!list.length) return;
      if (action === "flip") state.studyRevealed = !state.studyRevealed;
      if (action === "master") toggleStudyMark("flashcardsMastered", studyItemKey(list[state.studyCardIndex]));
      if (action === "prev" && state.studyCardIndex > 0) {
        state.studyCardIndex -= 1;
        state.studyRevealed = false;
      }
      if (action === "next" && state.studyCardIndex < list.length - 1) {
        state.studyCardIndex += 1;
        state.studyRevealed = false;
      }
      renderStudy();
      renderShell();
    });
    $("studyBody").addEventListener("change", (e) => {
      const check = e.target.closest("[data-study-point-check]");
      if (check) {
        toggleStudyMark("poin", check.dataset.studyPointCheck);
        renderStudy();
        renderShell();
        return;
      }
      const target = e.target.closest("[data-study-filter]");
      if (!target || target.dataset.studyFilter === "glosariumQuery") return;
      const filter = target.dataset.studyFilter;
      if (filter === "flashcardTopik") {
        state.studyFlashFilterTopik = target.value;
        state.studyFlashOrderKey = "";
        state.studyCardIndex = 0;
        state.studyRevealed = false;
      }
      if (filter === "flashcardShuffle") {
        state.studyFlashShuffle = target.checked;
        state.studyFlashOrderKey = "";
        state.studyCardIndex = 0;
        state.studyRevealed = false;
      }
      if (filter === "flashcardMasteredOnly") {
        state.studyFlashMasteredOnly = target.checked;
        state.studyFlashOrderKey = "";
        state.studyCardIndex = 0;
        state.studyRevealed = false;
      }
      if (filter === "glosariumSort") state.studyGlossarySort = target.value;
      if (filter === "glosariumFavoriteOnly") state.studyGlossaryFavoriteOnly = target.checked;
      renderStudy();
    });
    $("studyBody").addEventListener("input", (e) => {
      const input = e.target.closest('[data-study-filter="glosariumQuery"]');
      if (!input) return;
      const caret = input.selectionStart;
      state.studyGlossaryQuery = input.value;
      renderStudy();
      const next = $("studyBody").querySelector('[data-study-filter="glosariumQuery"]');
      if (next) {
        next.focus();
        if (typeof caret === "number") next.setSelectionRange(caret, caret);
      }
    });
    $("wrongOnlyBtn").addEventListener("click", () => state.wrongOnly ? exitWrongOnly() : enterWrongOnly());
    $("downloadPdfBtn").addEventListener("click", () => downloadPdf(false));
    $("downloadPdfKeyBtn").addEventListener("click", () => downloadPdf(true));
    $("downloadDocxBtn").addEventListener("click", downloadDocx);
    $("highlightBtn").addEventListener("click", () => {
      state.highlight = !state.highlight;
      renderQuizSafely();
    });
    $("optionsContainer").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-letter]");
      if (btn) selectAnswer(btn.dataset.letter);
    });
    const handleNavClick = (e) => {
      const btn = e.target.closest("[data-index]");
      if (!btn) return;
      goTo(Number(btn.dataset.index));
      closeMobileNav();
    };
    $("navContainer").addEventListener("click", handleNavClick);
    $("mobileNavContainer").addEventListener("click", handleNavClick);
    $("mobileNavSheet").addEventListener("click", (e) => {
      const action = e.target.closest("[data-quiz-action]")?.dataset.quizAction;
      if (!action) return;
      if (action === "prev") goTo(state.current - 1);
      if (action === "next") goTo(state.current + 1);
      if (action === "finish") finishSession("Selesai");
      closeMobileNav();
    });
    $("prevBtn").addEventListener("click", () => goTo(state.current - 1));
    $("inlinePrevBtn").addEventListener("click", () => goTo(state.current - 1));
    $("nextBtn").addEventListener("click", () => goTo(state.current + 1));
    $("inlineNextBtn").addEventListener("click", () => {
      if (state.current >= state.queue.length - 1) finishSession("Selesai");
      else goTo(state.current + 1);
    });
    $("finishBtn").addEventListener("click", () => finishSession("Selesai"));
    $("flagBtn").addEventListener("click", toggleFlag);
    $("hintBtn").addEventListener("click", nextHint);
    $("bedahTembungBtn").addEventListener("click", bedahTembung);
    $("bedahGatraBtn").addEventListener("click", bedahGatra);
    $("studyBedahTembungBtn").addEventListener("click", bedahTembung);
    $("studyBedahGatraBtn").addEventListener("click", bedahGatra);
    $("editStudyBtn").addEventListener("click", openStudyModal);
    $("resetStudyBtn").addEventListener("click", resetStudyContent);
    $("closeStudyModal").addEventListener("click", () => closeModal("studyModal"));
    $("cancelStudyModal").addEventListener("click", () => closeModal("studyModal"));
    $("studyForm").addEventListener("submit", handleStudySubmit);
    $("studySumberInput").addEventListener("input", () => { state.studyEditorDirty = true; });
    $("studyItemEditor").addEventListener("click", (e) => {
      const draft = state.studyEditorDraft;
      if (!draft) return;
      const add = e.target.closest("[data-editor-add]");
      if (add) {
        draft[add.dataset.editorAdd].push(studyBlankDraftItem(add.dataset.editorAdd, draft));
        state.studyEditorDirty = true;
        renderStudyItemEditor();
        return;
      }
      const remove = e.target.closest("[data-editor-remove]");
      if (remove) {
        draft[remove.dataset.editorRemove].splice(Number(remove.dataset.index), 1);
        state.studyEditorDirty = true;
        renderStudyItemEditor();
      }
    });
    const updateStudyDraftField = (e) => {
      const draft = state.studyEditorDraft;
      if (!draft) return;
      const global = e.target.closest("[data-editor-global]");
      if (global) {
        draft[global.dataset.editorGlobal] = global.value;
        state.studyEditorDirty = true;
        return;
      }
      const field = e.target.closest("[data-editor-field]");
      if (!field) return;
      const section = field.dataset.editorSection;
      const item = draft[section]?.[Number(field.dataset.editorIndex)];
      if (!item) return;
      item[field.dataset.editorField] = field.type === "checkbox" ? field.checked : field.value;
      state.studyEditorDirty = true;
    };
    $("studyItemEditor").addEventListener("input", updateStudyDraftField);
    $("studyItemEditor").addEventListener("change", updateStudyDraftField);
    $("keyTermPopoverClose").addEventListener("click", () => $("keyTermPopover").classList.add("hidden"));
    document.addEventListener("click", (e) => {
      const mark = e.target.closest(".key-term-mark");
      if (mark) showTermPopover(mark.dataset.term, mark.dataset.meaning);
    });
    $("captionSaveBtn").addEventListener("click", () => {
      if (!state.creatorMode) {
        setDownloadStatus("Keterangan gambar hanya dapat diubah di Mode Pembuat.", true);
        return;
      }
      const q = currentQuestion();
      if (!q || !q.id.startsWith("custom-")) {
        setDownloadStatus("Keterangan hanya tersedia untuk soal kustom.", true);
        return;
      }
      const list = loadCustomQuestions();
      const item = list.find((x) => x.id === q.id);
      if (item) {
        item.imageCaption = $("captionInput").value.trim();
        saveCustomQuestions(list);
        startSession(true);
        setDownloadStatus("Keterangan gambar tersimpan.", false);
      }
    });
    $("reviewJumpBtn").addEventListener("click", () => {
      const box = $("reviewContainer");
      if (!box) return;
      box.classList.remove("hidden");
      if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("retryWrongBtn").addEventListener("click", () => enterWrongOnly());
    $("restartBtn").addEventListener("click", () => {
      state.wrongOnly = false;
      state.fullSession = null;
      startSession(true);
    });
    $("backBtn").addEventListener("click", () => {
      if (FLOW_ENABLED) {
        navigateFlow("modes");
        return;
      }
      switchMode("belajar");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("creatorLoginBtn").addEventListener("click", openPinModal);
    $("creatorExitBtn").addEventListener("click", disableCreatorMode);
    $("footerTitle").addEventListener("click", () => {
      if (state.creatorMode) return;
      state.footClicks += 1;
      window.clearTimeout(state.footClickTimer);
      state.footClickTimer = window.setTimeout(() => { state.footClicks = 0; }, 3000);
      if (state.footClicks >= 5) {
        state.footClicks = 0;
        openPinModal();
      }
    });
    $("creatorPinSubmit").addEventListener("click", submitPin);
    $("creatorPinCancel").addEventListener("click", () => closeModal("creatorPinModal"));
    $("creatorPinInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitPin();
    });
    $("addQuestionBtn").addEventListener("click", () => openQuestionModal(-1));
    $("closeQuestionModal").addEventListener("click", closeQuestionModal);
    $("cancelQuestionModal").addEventListener("click", closeQuestionModal);
    $("questionForm").addEventListener("submit", handleQuestionSubmit);
    $("exportJsonBtn").addEventListener("click", exportJson);
    $("clearAllBtn").addEventListener("click", clearCustomQuestions);
    $("importJsonBtn").addEventListener("click", () => {
      const input = $("importFileInput");
      input.dataset.importType = "json";
      input.accept = ".json,application/json";
      input.click();
    });
    $("importDocxBtn").addEventListener("click", () => {
      const input = $("importFileInput");
      input.dataset.importType = "docx";
      input.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      input.click();
    });
    $("importPdfBtn").addEventListener("click", () => {
      const input = $("importFileInput");
      input.dataset.importType = "pdf";
      input.accept = ".pdf,application/pdf";
      input.click();
    });
    $("importFileInput").addEventListener("change", handleImportFile);
    $("exportStudyJsonBtn").addEventListener("click", exportStudyContent);
    $("importStudyJsonBtn").addEventListener("click", () => $("studyImportFileInput").click());
    $("studyImportFileInput").addEventListener("change", handleStudyImportFile);
    $("customQuestionList").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit-custom]");
      const del = e.target.closest("[data-delete-custom]");
      if (edit) openQuestionModal(Number(edit.dataset.editCustom));
      if (del) {
        const index = Number(del.dataset.deleteCustom);
        const list = loadCustomQuestions();
        if (!list[index] || !window.confirm(`Hapus soal kustom ${index + 1}?`)) return;
        list.splice(index, 1);
        saveCustomQuestions(list);
        startSession(true);
        setImportStatus("Soal kustom dihapus.", false);
      }
    });
    document.addEventListener("keydown", handleKeydown);
  }

  function init() {
    loadPreferences();
    if (FLOW_ENABLED) {
      const initialRoute = routeFromHash();
      if (initialRoute) applyRoute(initialRoute);
      else if (window.location.hash !== "#creator") setFlowHash(flowHash("landing"), true);
    }
    renderAppPage();
    ensurePin();
    applyTheme();
    bindEvents();
    mountAITutor();
    syncStickyOffsets();
    if (typeof window.addEventListener === "function") {
      window.addEventListener("resize", syncStickyOffsets);
      window.addEventListener("orientationchange", () => window.setTimeout(syncStickyOffsets, 120));
    }
    if (FLOW_ENABLED && typeof ResizeObserver === "function") {
      const header = document.querySelector?.(".topbar");
      if (header) new ResizeObserver(syncStickyOffsets).observe(header);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("creator") === "1" || window.location.hash === "#creator") openPinModal();
    const raw = loadProgress();
    if (raw && applyProgress(raw)) {
      renderShell();
      renderWorkspace();
      if (state.status === "running") startTimer();
    } else {
      startSession(true);
    }
    applyCreatorVisibility();
  }

  init();
})();
