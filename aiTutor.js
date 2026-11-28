(() => {
  "use strict";

  const scope = typeof window !== "undefined" ? window : globalThis;
  const DIRECT_LOCAL_ENDPOINT = "http://127.0.0.1:8788/v1/ai/tutor";
  const PROXY_LOCAL_ENDPOINT = "/v1/ai/tutor";
  const MAX_HISTORY = 10;
  const MAX_CONTENT = 4000;
  const TIMEOUT_MS = 30000;
  const STREAM_WORD_MS = 32;
  const STREAM_CHUNK_WORDS = 1;

  const MESSAGES = {
    empty: "Tulis pertanyaan terlebih dahulu.",
    unavailable: "AI Tutor belum tersedia di lingkungan ini. Jalankan frontend dan backend lokal.",
    typing: "AI Tutor sedang mengetik…",
    skip: "Lewati",
    badRequest: "Pertanyaan atau konteks tidak valid. Coba tulis ulang pertanyaanmu.",
    rateLimited: "Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi.",
    providerRateLimited: "Layanan AI sedang mencapai batas penggunaan. Coba lagi nanti.",
    unavailableService: "Layanan AI sedang tidak tersedia. Coba lagi nanti.",
    server: "AI Tutor sementara tidak dapat menjawab. Coba lagi nanti.",
    network: "Backend AI tidak dapat dijangkau. Pastikan server lokal berjalan.",
    timeout: "AI Tutor terlalu lama merespons. Coba lagi.",
    invalid: "Jawaban AI tidak dapat dibaca. Coba lagi."
  };

  function isLocalOrigin(location) {
    const source = location || scope.location || {};
    const protocol = String(source.protocol || "");
    const hostname = String(source.hostname || "");
    return protocol === "file:"
      || hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "[::1]";
  }

  function resolveEndpoint(options = {}) {
    const override = typeof options.override === "string" ? options.override.trim() : "";
    if (override) return override;
    const allowLocal = options.allowLocal !== false;
    if (!allowLocal || !isLocalOrigin(options.location)) return null;
    return options.useDirectLocal ? DIRECT_LOCAL_ENDPOINT : PROXY_LOCAL_ENDPOINT;
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .slice(-MAX_HISTORY)
      .map((item) => ({
        role: item && item.role === "assistant" ? "assistant" : "user",
        content: String(item && item.content != null ? item.content : "").trim().slice(0, MAX_CONTENT)
      }))
      .filter((item) => item.content.length > 0);
  }

  function buildRequest(input = {}) {
    const subjectSource = input.subject != null ? input.subject : input.subjectName != null ? input.subjectName : input.subjectId;
    return {
      subjectId: String(input.subjectId == null ? "" : input.subjectId).trim(),
      subject: String(subjectSource == null ? "" : subjectSource).trim().slice(0, 100),
      topic: String(input.topic == null || input.topic === "" ? "Umum" : input.topic).trim().slice(0, 200),
      message: String(input.message == null ? "" : input.message).trim().slice(0, MAX_CONTENT),
      history: normalizeHistory(input.history)
    };
  }

  function readAnswer(payload) {
    if (!payload || payload.ok !== true || !payload.data) throw new Error("INVALID_RESPONSE");
    if (typeof payload.data.answer !== "string" || !payload.data.answer.trim()) throw new Error("INVALID_RESPONSE");
    return payload.data.answer;
  }

  async function readErrorCode(response) {
    try {
      const payload = await response.json();
      const code = payload && payload.error && payload.error.code;
      return typeof code === "string" ? code : "";
    } catch (error) {
      return "";
    }
  }

  function describeError(status, code) {
    if (code === "PROVIDER_RATE_LIMITED") return MESSAGES.providerRateLimited;
    if (code === "DEV_PROXY_ERROR" || status === 502) return MESSAGES.network;
    if (status === 400 || code === "BAD_REQUEST" || code === "PAYLOAD_TOO_LARGE") return MESSAGES.badRequest;
    if (status === 429 || code === "RATE_LIMIT_EXCEEDED") return MESSAGES.rateLimited;
    if (status === 503 || code === "RATE_LIMITER_UNAVAILABLE" || code === "PROVIDER_UNAVAILABLE") return MESSAGES.unavailableService;
    if (typeof status === "number" && status >= 500) return MESSAGES.server;
    return MESSAGES.server;
  }

  function renderMarkdown(target, value) {
    const renderer = scope.ASAS_MARKDOWN;
    if (renderer && typeof renderer.renderInto === "function") renderer.renderInto(target, value);
    else target.textContent = value;
  }

  function removeNode(parent, child) {
    if (!parent || !child) return;
    if (typeof parent.removeChild === "function") parent.removeChild(child);
    else if (Array.isArray(parent.children)) {
      const index = parent.children.indexOf(child);
      if (index >= 0) parent.children.splice(index, 1);
    }
  }

  function answerChunks(value) {
    return String(value == null ? "" : value).match(/\S+\s*/g) || [];
  }

  function createController(options = {}) {
    const elements = options.elements || {};
    const endpoint = options.endpoint || null;
    const getContext = typeof options.getContext === "function" ? options.getContext : () => ({});
    const makeElement = typeof options.createElement === "function"
      ? options.createElement
      : (tag) => scope.document.createElement(tag);
    const fetchImpl = typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : (...args) => scope.fetch(...args);
    const timeoutMsRaw = Number(options.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : TIMEOUT_MS;
    const streamDelayRaw = Number(options.streamDelayMs);
    const streamDelayMs = Number.isFinite(streamDelayRaw) && streamDelayRaw >= 0 ? streamDelayRaw : STREAM_WORD_MS;
    const reducedMotionOverride = options.reducedMotion;
    const statusBox = elements.statusBox || elements.status;

    let history = [];
    let loading = false;
    let statusText = "";
    let requestId = 0;
    let activeStream = null;

    function showStatus(text) {
      if (elements.status) elements.status.textContent = text;
      if (statusBox) statusBox.classList.remove("hidden");
    }

    function hideStatus() {
      if (elements.status) elements.status.textContent = "";
      if (statusBox) statusBox.classList.add("hidden");
    }

    function setBusy(value) {
      loading = !!value;
      if (elements.sendBtn) elements.sendBtn.disabled = loading || !endpoint;
      if (elements.input) elements.input.disabled = loading || !endpoint;
      if (elements.sendLabel) elements.sendLabel.textContent = loading ? "Memproses…" : "Kirim";
      if (loading) {
        showStatus("AI Tutor sedang menyiapkan jawaban…");
      } else if (statusText) {
        showStatus(statusText);
      } else {
        hideStatus();
      }
    }

    function setEmpty(empty) {
      if (elements.empty) elements.empty.classList.toggle("hidden", !empty);
    }

    function scrollLog() {
      if (elements.log && elements.log.scrollHeight != null) elements.log.scrollTop = elements.log.scrollHeight;
    }

    function resizeInput() {
      if (!elements.input) return;
      const lines = String(elements.input.value || "").split(/\r?\n/).length;
      elements.input.rows = Math.min(5, Math.max(1, lines));
    }

    function appendMessage(role, text, options = {}) {
      if (!elements.log) return null;
      const bubble = makeElement("div");
      bubble.className = `ai-tutor-message ${role === "user" ? "is-user" : "is-assistant"}`;
      const label = makeElement("p");
      label.className = "ai-tutor-message-label";
      label.textContent = role === "user" ? "Kamu" : "AI Tutor";
      const body = makeElement("div");
      body.className = "ai-tutor-message-body markdown-content";
      if (role === "assistant" && options.markdown !== false) renderMarkdown(body, text);
      else body.textContent = text;
      bubble.appendChild(label);
      bubble.appendChild(body);
      let typing = null;
      if (options.typing) {
        typing = makeElement("span");
        typing.className = "ai-tutor-typing";
        typing.textContent = MESSAGES.typing;
        bubble.appendChild(typing);
      }
      elements.log.appendChild(bubble);
      setEmpty(false);
      scrollLog();
      return { bubble, label, body, typing };
    }

    function prefersReducedMotion() {
      if (typeof reducedMotionOverride === "boolean") return reducedMotionOverride;
      return typeof scope.matchMedia === "function" && scope.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function cancelActiveStream() {
      if (activeStream) activeStream.cancel();
    }

    function startAnswerStream(answer) {
      const reduced = prefersReducedMotion();
      const rendered = appendMessage("assistant", reduced ? answer : "", { markdown: true, typing: !reduced });
      if (!rendered) return;
      const { bubble, body, typing } = rendered;
      if (reduced) return;

      const skipBtn = makeElement("button");
      skipBtn.className = "ai-tutor-skip";
      skipBtn.type = "button";
      skipBtn.textContent = MESSAGES.skip;
      bubble.appendChild(skipBtn);

      const tokens = answerChunks(answer);
      const stream = { timer: null, cancelled: false };
      let cursor = 0;
      let shown = "";

      function cleanup() {
        removeNode(bubble, typing);
        removeNode(bubble, skipBtn);
      }

      function finish() {
        if (stream.cancelled || activeStream !== stream) return;
        if (stream.timer !== null) clearTimeout(stream.timer);
        stream.cancelled = true;
        activeStream = null;
        renderMarkdown(body, answer);
        cleanup();
        scrollLog();
      }

      function step() {
        if (stream.cancelled || activeStream !== stream) return;
        const next = Math.min(cursor + STREAM_CHUNK_WORDS, tokens.length);
        shown += tokens.slice(cursor, next).join("");
        cursor = next;
        renderMarkdown(body, shown);
        scrollLog();
        if (cursor >= tokens.length) {
          finish();
          return;
        }
        stream.timer = setTimeout(step, streamDelayMs);
      }

      stream.cancel = () => {
        stream.cancelled = true;
        if (stream.timer !== null) clearTimeout(stream.timer);
        cleanup();
        if (activeStream === stream) activeStream = null;
      };
      stream.finish = finish;
      activeStream = stream;
      if (typeof skipBtn.addEventListener === "function") skipBtn.addEventListener("click", finish);
      else skipBtn.onclick = finish;

      if (tokens.length) step();
      else finish();
    }

    function refreshContext() {
      const context = getContext() || {};
      const subjectName = context.subjectName || context.subjectId || "-";
      const topic = context.topic || "Umum";
      const text = `${subjectName} · ${topic}`;
      if (elements.context && elements.context.textContent !== text) elements.context.textContent = text;
      if (!endpoint) {
        statusText = MESSAGES.unavailable;
        showStatus(statusText);
        setBusy(false);
        return;
      }
      if (statusText === MESSAGES.unavailable) {
        statusText = "";
        hideStatus();
      }
      setBusy(loading);
    }

    async function submit(rawMessage) {
      if (loading) return;
      const message = String(rawMessage == null ? "" : rawMessage).trim();
      if (!message) {
        statusText = MESSAGES.empty;
        showStatus(statusText);
        return;
      }
      if (!endpoint) {
        statusText = MESSAGES.unavailable;
        showStatus(statusText);
        return;
      }

      cancelActiveStream();
      const currentRequest = ++requestId;
      const context = getContext() || {};
      const payload = buildRequest({ ...context, message, history });
      history.push({ role: "user", content: message });
      appendMessage("user", message);
      statusText = "";
      setBusy(true);

      const abortController = typeof AbortController === "function" ? new AbortController() : null;
      const fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      };
      if (abortController) fetchOptions.signal = abortController.signal;
      let timeoutId = null;
      const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          if (abortController && typeof abortController.abort === "function") abortController.abort();
          reject({ kind: "timeout" });
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([
          fetchImpl(endpoint, fetchOptions),
          timeoutPromise
        ]);
        if (!response || typeof response.ok !== "boolean") throw { kind: "network" };
        if (!response.ok) {
          const code = await readErrorCode(response);
          if (currentRequest !== requestId) return;
          throw { kind: "http", status: response.status, code };
        }
        let payloadBody;
        try {
          payloadBody = await response.json();
        } catch (error) {
          throw { kind: "invalid" };
        }
        if (currentRequest !== requestId) return;
        let answer;
        try {
          answer = readAnswer(payloadBody);
        } catch (error) {
          throw { kind: "invalid" };
        }
        history.push({ role: "assistant", content: answer });
        startAnswerStream(answer);
        if (elements.input) elements.input.value = "";
        resizeInput();
      } catch (error) {
        if (currentRequest !== requestId) return;
        if (error && error.kind === "timeout") {
          statusText = MESSAGES.timeout;
        } else if (error && error.kind === "http") {
          statusText = describeError(error.status, error.code);
        } else if (error && error.kind === "invalid") {
          statusText = MESSAGES.invalid;
        } else {
          statusText = MESSAGES.network;
        }
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (currentRequest === requestId) setBusy(false);
      }
    }

    function reset() {
      cancelActiveStream();
      requestId += 1;
      history = [];
      statusText = "";
      loading = false;
      if (elements.log) {
        if (typeof elements.log.replaceChildren === "function") elements.log.replaceChildren();
        else elements.log.innerHTML = "";
        if (elements.empty) elements.log.appendChild(elements.empty);
      }
      if (elements.input) elements.input.value = "";
      resizeInput();
      setEmpty(true);
      refreshContext();
    }

    if (elements.input && typeof elements.input.addEventListener === "function") {
      elements.input.addEventListener("input", resizeInput);
    }
    resizeInput();
    setBusy(false);
    refreshContext();

    return {
      submit,
      reset,
      refreshContext,
      getHistory: () => history.slice(),
      isLoading: () => loading,
      getEndpoint: () => endpoint,
      skip: () => {
        if (activeStream) activeStream.finish();
      }
    };
  }

  scope.AI_TUTOR = {
    DIRECT_LOCAL_ENDPOINT,
    PROXY_LOCAL_ENDPOINT,
    MAX_HISTORY,
    MAX_CONTENT,
    TIMEOUT_MS,
    STREAM_WORD_MS,
    STREAM_CHUNK_WORDS,
    MESSAGES,
    isLocalOrigin,
    resolveEndpoint,
    buildRequest,
    normalizeHistory,
    readAnswer,
    describeError,
    createController
  };
})();
