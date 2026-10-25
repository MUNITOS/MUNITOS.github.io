(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const attachedCores = new WeakSet();
  const attach = coreApi => {
    const core = coreApi;
    if (!core || !core.state || !core.runtime) return false;
    if (typeof core === 'object' && attachedCores.has(core)) return core;
    if (window.location.protocol === 'file:') {
      document.body.innerHTML = '<h1 style="color:#c00;font-family:sans-serif;text-align:center;margin-top:2em;">MUNITOS does not support file:// protocol</h1><p style="font-family:sans-serif;text-align:center;">Please serve this application over HTTP/HTTPS.</p>';
      return false;
    }
    const state = core.state;
    const MAX_TRANSCRIPT_RECORDS = 2200;
    const transcript = document.getElementById('transcript');
    const screenStatus = document.getElementById('screenStatus');
    const status = screenStatus;
    const promptTop = document.getElementById('promptTop');
    const promptBottom = document.getElementById('promptBottom');
    const inputHolder = document.getElementById('inputHolder');
    const mirror = document.getElementById('mirror');
    const fakeCaret = document.getElementById('fakeCaret');
    const termInput = document.getElementById('termInput');
    const commandLine = document.getElementById('commandLine');
    const notifyBooster = (method, ...args) => { try { const runtime = window.__munitosBoosterRuntime; if (!runtime || runtime.enabled !== true) return; const fn = runtime[method]; if (typeof fn !== 'function') return; fn(...args); } catch {} };
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    let cachedCaretH = '';
    const escHtml = str => String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const normalizeUserInput = value => { let text = String(value ?? '').replace(/\r\n?/g, '\n'); try { text = text.normalize('NFC'); } catch {} let output = ''; for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); if (code >= 0xD800 && code <= 0xDBFF) { if (i + 1 < text.length) { const next = text.charCodeAt(i + 1); if (next >= 0xDC00 && next <= 0xDFFF) { output += text[i] + text[++i]; continue; } } output += '\uFFFD'; continue; } if (code >= 0xDC00 && code <= 0xDFFF) { output += '\uFFFD'; continue; } output += text[i]; } return output; };
    const sanitizeHtml = html => { const template = document.createElement('template'); template.innerHTML = String(html ?? ''); const allowedTags = new Set(['SPAN', 'BR']); const walk = node => { if (node.nodeType === Node.ELEMENT_NODE) { const tag = node.tagName; if (!allowedTags.has(tag)) { const frag = document.createDocumentFragment(); while (node.firstChild) frag.appendChild(node.firstChild); node.replaceWith(frag); return; } for (const attr of [...node.attributes]) { if (attr.name !== 'class') node.removeAttribute(attr.name); else node.setAttribute('class', String(attr.value).replace(/[^a-zA-Z0-9_\-\s]/g, '')); } for (const child of [...node.childNodes]) walk(child); } }; [...template.content.childNodes].forEach(walk); return template.innerHTML; };
    const safeClass = value => String(value || 'output').split(/\s+/).filter(Boolean).map(token => token.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).join(' ') || 'output';
    const renderEntry = entry => { const div = document.createElement('div'); if (!entry || typeof entry !== 'object') { div.className = 'line'; div.textContent = ''; return div; } if (entry.type === 'spacer') { div.className = 'line spacer'; div.setAttribute('aria-hidden', 'true'); return div; } if (entry.type === 'live') { div.className = 'line'; const span = document.createElement('span'); span.className = safeClass(entry.cls); span.dataset.liveKey = String(entry.liveKey ?? ''); span._liveGetter = typeof entry.getText === 'function' ? entry.getText : null; span.textContent = String(typeof span._liveGetter === 'function' ? span._liveGetter() ?? '' : entry.text ?? ''); div.appendChild(span); return div; } div.className = 'line'; div.innerHTML = sanitizeHtml(entry.html ?? entry.text ?? ''); return div; };
    const isNearBottom = () => transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 40;
    const scrollToBottom = () => { transcript.scrollTop = transcript.scrollHeight; };
    const maybeScrollToBottom = () => { if (isNearBottom()) scrollToBottom(); };
    const syncLiveEntries = () => { for (const node of transcript.querySelectorAll('[data-live-key]')) if (typeof node._liveGetter === 'function') { try { node.textContent = String(node._liveGetter() ?? ''); } catch { node.textContent = ''; } } };
    const renderRequestBlock = block => { const wrapper = document.createElement('div'); wrapper.className = 'request-block'; wrapper.dataset.operationId = String(block?.id ?? ''); wrapper.appendChild(renderEntry(block?.promptEntry)); for (const entry of Array.isArray(block?.entries) ? block.entries : []) wrapper.appendChild(renderEntry(entry)); return wrapper; };
    const trimTranscript = () => {
      if (!Array.isArray(state.transcript) || state.transcript.length <= MAX_TRANSCRIPT_RECORDS) return;
      const removeCount = state.transcript.length - MAX_TRANSCRIPT_RECORDS;
      const removed = state.transcript.splice(0, removeCount);
      for (const record of removed) {
        try {
          const container = record?.block?.container;
          if (container?.parentNode === transcript) container.remove();
          if (record?.block) { record.block.detached = true; record.block.container = null; }
        } catch {}
      }
    };
    const createRequestBlock = (operation, promptEntry) => { if (!operation) return null; const block = { id: operation.id, promptEntry, entries: [], detached: false, container: null }; state.transcript.push({ type: 'request', block }); operation.block = block; const wrapper = renderRequestBlock(block); block.container = wrapper; transcript.insertBefore(wrapper, commandLine); trimTranscript(); notifyBooster('onRequestBlock', wrapper); scrollToBottom(); return block; };
    const appendOperationEntries = (block, entries) => { if (!block || !Array.isArray(entries) || !entries.length) return; if (!block.detached && block.container?.isConnected) { const frag = document.createDocumentFragment(); for (const entry of entries) frag.appendChild(renderEntry(entry)); block.container.appendChild(frag); maybeScrollToBottom(); } };
    const appendTranscript = entries => { if (!Array.isArray(entries) || !entries.length) return; if (core.runtime.isPackageLifecycleOutputBlocked?.()) return; const accepted = []; const fragment = document.createDocumentFragment(); for (const entry of entries) { if (!entry || typeof entry !== 'object') continue; if (entry.operationId) { const operation = core.runtime.getOperation?.(entry.operationId); if (!operation || !operation.isActive()) continue; } state.transcript.push(core.runtime.createEntryRecord(entry)); fragment.appendChild(renderEntry(entry)); accepted.push(entry); } if (!accepted.length) return; transcript.insertBefore(fragment, commandLine); trimTranscript(); notifyBooster('onTranscriptAppend', accepted); maybeScrollToBottom(); };
    const clearTranscript = () => { state.transcript = []; while (transcript.firstChild && transcript.firstChild !== commandLine) transcript.removeChild(transcript.firstChild); for (const op of core.runtime.getOperations?.() || []) if (op.block) { op.block.detached = true; op.block.container = null; } notifyBooster('onTranscriptClear'); };
    const rebuildTranscript = () => { while (transcript.firstChild && transcript.firstChild !== commandLine) transcript.removeChild(transcript.firstChild); const frag = document.createDocumentFragment(); for (const record of Array.isArray(state.transcript) ? state.transcript : []) { if (record?.type === 'entry' && record.entry) frag.appendChild(renderEntry(record.entry)); else if (record?.type === 'request' && record.block) { const wrapper = renderRequestBlock(record.block); record.block.container = wrapper; record.block.detached = false; frag.appendChild(wrapper); } } transcript.insertBefore(frag, commandLine); scrollToBottom(); };
    const updatePrompt = () => { if (!promptTop || !promptBottom || !termInput || !fakeCaret) return; const user = state.mode === 'root' ? 'root' : state.mode === 'ghost' ? 'ghost' : state.user; const path = state.cwd || '/'; const mode = state.mode; promptTop.innerHTML = `<span class="segment ${mode}">┌──(${escHtml(user)}㉿${escHtml(state.host)})-[</span><span class="segment path">${escHtml(path)}</span><span class="segment ${mode}">]</span>`; promptBottom.className = `prompt-bottom ${mode}`; promptBottom.textContent = `└─${mode === 'root' ? '#' : '$'}`; termInput.className = `term-input ${mode}`; fakeCaret.className = `fake-caret ${mode}`; };
    const updateMirror = () => { if (!mirror || !termInput) return; mirror.textContent = termInput.value || ''; };
    const updateCaret = () => { if (!termInput || !inputHolder || !mirror || !fakeCaret) return; updateMirror(); const selectionEnd = typeof termInput.selectionStart === 'number' ? termInput.selectionStart : termInput.value.length; mirror.textContent = termInput.value.slice(0, selectionEnd); const inputRect = inputHolder.getBoundingClientRect(); const mirrorRect = mirror.getBoundingClientRect(); const scrollX = termInput.scrollLeft || 0; const x = clamp(mirrorRect.width - scrollX + 1, 0, Math.max(0, inputRect.width - 2)); fakeCaret.style.transform = `translate3d(${x}px,-50%,0)`; if (cachedCaretH) fakeCaret.style.height = cachedCaretH; };
    const uiFocusInput = () => { if (document.activeElement !== termInput) termInput.focus({ preventScroll: true }); updateCaret(); };
    const buildPromptEcho = cmd => { const user = state.mode === 'root' ? 'root' : state.mode === 'ghost' ? 'ghost' : state.user; const path = state.cwd || '/'; const mode = state.mode; return core.line ? { type: 'line', html: `<span class="segment ${mode}">┌──(${escHtml(user)}㉿${escHtml(state.host)})-[</span><span class="segment path">${escHtml(path)}</span><span class="segment ${mode}">]</span><br><span class="segment ${mode}">└─${escHtml(mode === 'root' ? '#' : '$')} </span><span class="${mode}">${escHtml(cmd)}</span>` } : { type: 'line', html: '' }; };
    const submitCommand = async () => { const value = normalizeUserInput(termInput.value); if (!value.trim()) { termInput.value = ''; state.draft = ''; termInput.scrollLeft = 0; updateCaret(); return; } termInput.value = ''; state.draft = ''; termInput.scrollLeft = 0; updateCaret(); if (/^(?:killall|cancel|stop)(?:\s+.*)?$/i.test(value.trim())) { core.runtime.cancelAllOperations(value); const operation = core.runtime.createOperation(value); operation.setStatus('RUNNING'); createRequestBlock(operation, buildPromptEcho(value)); operation.append([core.line('All virtual operations stopped.', 'accent'), core.line('Running jobs, timers, readers and active interactive flows were cancelled.', 'muted')]); operation.finish('CANCELLED'); state.history.push(value); state.historyIndex = state.history.length; core.runtime.persist(); updateCaret(); return; } if (state.activeFlow) { const operation = core.runtime.getOperation?.(state.activeFlowOperationId); const isPasswordFlow = state.activeFlow?.step === 'password' || state.activeFlow?.step === 'new-password'; const promptEntry = isPasswordFlow ? core.line('└─> ********', 'muted') : buildPromptEcho(value); if (operation?.isActive() && operation.block) operation.append([promptEntry]); else appendTranscript([promptEntry]); let result; try { result = await core.runtime.handleFlowInput(value); } catch { result = { output: [core.line('Error executing flow input.', 'danger')], ended: true }; } if (operation?.isActive()) { if (Array.isArray(result.output) && result.output.length) operation.append(result.output); if (result.ended) operation.finish('COMPLETED'); } if (!isPasswordFlow) { state.history.push(value); state.historyIndex = state.history.length; } updateCaret(); core.runtime.persist(); return; } const operation = core.runtime.createOperation(value); operation.setStatus('RUNNING'); createRequestBlock(operation, buildPromptEcho(value)); const ctx = core.runtime.createOperationContext(operation); let result; try { result = await core.runtime.runCommand(value, ctx); } catch { result = [core.line('Error executing command.', 'danger')]; } if (core.runtime.isFlowSession(result)) { operation.flowSession = result; operation.setStatus('WAITING'); core.runtime.setActiveFlow(result, operation); if (Array.isArray(result.lines)) operation.append(result.lines); } else { const lines = core.runtime.normalizeCommandOutput(result); if (operation.isActive() && lines.length) operation.append(lines); operation.finish('COMPLETED'); } state.history.push(value); state.historyIndex = state.history.length; updateCaret(); core.runtime.persist(); };
    const nextHistory = direction => { if (!state.history.length) return; if (direction < 0) { if (state.historyIndex <= 0) return; state.historyIndex--; termInput.value = normalizeUserInput(state.history[state.historyIndex] ?? ''); } else if (state.historyIndex < state.history.length - 1) { state.historyIndex++; termInput.value = normalizeUserInput(state.history[state.historyIndex] ?? ''); } else { state.historyIndex = state.history.length; termInput.value = state.draft; } updateCaret(); scrollToBottom(); };
    const autocomplete = () => { const raw = termInput.value; if (!raw.trim()) return; const firstSpace = raw.search(/\s/); const commandPart = firstSpace === -1 ? raw : raw.slice(0, firstSpace); const rest = firstSpace === -1 ? '' : raw.slice(firstSpace); const matches = core.runtime.commandTokens().filter(x => x.startsWith(commandPart.toLowerCase())); if (matches.length !== 1) return; termInput.value = matches[0] + rest; state.draft = termInput.value; updateCaret(); };
    const uiBridge = { normalizeUserInput, renderEntry, appendOperationEntries, appendTranscript, clearTranscript, syncLiveEntries, updatePrompt, updateCaret, focusInput: uiFocusInput, scrollToBottom, rebuildTranscript, buildPromptEcho, submitCommand, nextHistory, autocomplete };
    core.setUIBridge(uiBridge);
    window.MUNITOSUIController = Object.freeze(uiBridge);
    const runtime = Object.assign({}, core.runtime, uiBridge);
  const APP_STATE = Object.freeze({
    LOADING: 'loading',
    READY: 'ready',
    FAILED: 'failed'
  });
  const app = {
    state: APP_STATE.LOADING,
    eventsBound: false,
    started: false,
    readyAt: 0,
    resizeRaf: 0,
    caretRaf: 0,
    loadingTimer: 0,
    retryTimer: 0,
    destroyed: false,
    loadStartedAt: Date.now()
  };
  const CLEANUP = [];
  const addCleanup = fn => {
    if (typeof fn === 'function') CLEANUP.push(fn);
    return fn;
  };
  const safeCall = (fn, fallback = undefined) => {
    try {
      return typeof fn === 'function' ? fn() : fallback;
    } catch {
      return fallback;
    }
  };
  const safeAsync = async (fn, fallback = undefined) => {
    try {
      return typeof fn === 'function'
        ? await fn()
        : fallback;
    } catch {
      return fallback;
    }
  };
  const setStatus = (message, stateName = app.state) => {
    if (!status) return;
    status.textContent = String(message ?? '');
    status.dataset.state = String(stateName);
    status.setAttribute(
      'aria-busy',
      stateName === APP_STATE.LOADING ? 'true' : 'false'
    );
  };
  const setInputEnabled = enabled => {
    if (!termInput) return;
    const active = enabled === true && app.state === APP_STATE.READY;
    termInput.disabled = !active;
    termInput.setAttribute('aria-disabled', active ? 'false' : 'true');
    if (!active) {
      termInput.blur();
    }
  };
  const resetInput = () => {
    if (!termInput) return;
    termInput.value = '';
    state.draft = '';
    safeCall(runtime.updateCaret);
  };
  const focusInput = () => {
    if (app.state !== APP_STATE.READY) return;
    safeCall(runtime.focusInput);
  };
  const isInteractive = () =>
    app.state === APP_STATE.READY &&
    !app.destroyed;
  const shouldIgnoreTarget = target =>
    Boolean(
      target?.closest?.(
        'input, textarea, button, a, select, [contenteditable="true"]'
      )
    );
  const scheduleCaretUpdate = () => {
    if (app.destroyed) return;
    if (app.caretRaf) {
      cancelAnimationFrame(app.caretRaf);
    }
    app.caretRaf = requestAnimationFrame(() => {
      app.caretRaf = 0;
      if (!app.destroyed) {
        safeCall(runtime.updateCaret);
      }
    });
  };
  const markReady = () => {
    if (app.state === APP_STATE.READY || app.destroyed) {
      return;
    }
    app.state = APP_STATE.READY;
    app.readyAt = Date.now();
    if (status) {
      status.dataset.state = APP_STATE.READY;
      status.setAttribute('aria-busy', 'false');
    }
    setInputEnabled(true);
    safeCall(runtime.refreshStaticRuntimeState);
    safeCall(runtime.refreshDynamicRuntimeState);
    safeCall(runtime.syncLiveEntries);
    safeCall(runtime.updatePrompt);
    safeCall(runtime.updateCaret);
    safeCall(runtime.scrollToBottom);
    focusInput();
  };
  const failInitialization = reason => {
    if (app.destroyed || app.state === APP_STATE.READY) {
      return;
    }
    app.state = APP_STATE.FAILED;
    setInputEnabled(false);
    const message = String(
      reason ||
      'MUNITOS could not complete system initialization.'
    );
    setStatus(message, APP_STATE.FAILED);
    resetInput();
    if (status) {
      status.dataset.state = APP_STATE.FAILED;
      const existingButton = status.querySelector?.(
        '[data-munitos-reload]'
      );
      if (!existingButton) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';
        wrapper.style.marginTop = '6px';
        const text = document.createElement('span');
        text.textContent = 'Initialization failed.';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.munitosReload = 'true';
        button.textContent = 'Reload';
        button.addEventListener('click', () => {
          try {
            window.location.reload();
          } catch {
            window.location.href = window.location.href;
          }
        });
        wrapper.append(text, button);
        status.replaceChildren(
          document.createTextNode(message),
          wrapper
        );
      }
    }
  };
  const setupEvents = () => {
    if (app.eventsBound || app.destroyed) {
      return;
    }
    if (!termInput || !transcript || !commandLine || !promptTop || !promptBottom || !inputHolder || !mirror || !fakeCaret) {
      failInitialization('Terminal UI elements are unavailable.');
      return;
    }
    if (typeof core === 'object') attachedCores.add(core);
    const onTermKeyDown = event => {
      if (!isInteractive()) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!termInput.value.trim()) {
          resetInput();
          return;
        }
        void safeAsync(
          () => runtime.submitCommand(),
          null
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        safeCall(() => runtime.nextHistory(-1));
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        safeCall(() => runtime.nextHistory(1));
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        safeCall(runtime.autocomplete);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        resetInput();
        return;
      }
      scheduleCaretUpdate();
    };
    const onInput = () => {
      if (!isInteractive()) {
        resetInput();
        return;
      }
      state.draft = termInput.value;
      safeCall(runtime.updateCaret);
      safeCall(runtime.scrollToBottom);
    };
    const onWindowMouseDown = event => {
      if (!isInteractive()) {
        return;
      }
      if (!shouldIgnoreTarget(event.target)) {
        focusInput();
      }
    };
    const onTranscriptClick = event => {
      if (!isInteractive()) {
        return;
      }
      if (shouldIgnoreTarget(event.target)) {
        return;
      }
      const selection = safeCall(
        () => window.getSelection?.(),
        null
      );
      if (selection && !selection.isCollapsed) {
        return;
      }
      focusInput();
    };
    const onGlobalKeyDown = event => {
      if (!isInteractive()) {
        return;
      }
      if (
        !event.ctrlKey ||
        !event.altKey ||
        !event.shiftKey
      ) {
        return;
      }
      const key = String(event.key || '').toLowerCase();
      if (key === '1') {
        event.preventDefault();
        safeCall(() => runtime.setMode('user'));
        return;
      }
      if (key === '2') {
        event.preventDefault();
        safeCall(() => runtime.setMode('root'));
        return;
      }
      if (key === '3') {
        event.preventDefault();
        safeCall(() => runtime.setMode('ghost'));
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        safeCall(runtime.clearTranscript);
      }
    };
    const onStorage = event => {
      if (!isInteractive()) {
        return;
      }
      if (event.key !== state.persistenceKey) {
        return;
      }
      try {
        const data = JSON.parse(event.newValue || '{}');
        if (data?.cwd) {
          const resolver = core.commandServices?.resolvePath;
        if (typeof resolver === 'function') state.cwd = resolver(data.cwd);
        }
        if (
          data?.mode &&
          ['user', 'root', 'ghost'].includes(data.mode)
        ) {
          state.mode = data.mode;
        }
        safeCall(runtime.updatePrompt);
        scheduleCaretUpdate();
      } catch {
        return;
      }
    };
    const onResize = () => {
      if (app.destroyed) return;
      if (app.resizeRaf) {
        cancelAnimationFrame(app.resizeRaf);
      }
      app.resizeRaf = requestAnimationFrame(() => {
        app.resizeRaf = 0;
        if (app.destroyed) {
          return;
        }
        safeCall(runtime.refreshStaticRuntimeState);
        safeCall(runtime.updatePrompt);
        scheduleCaretUpdate();
        if (isInteractive()) {
          safeCall(runtime.scrollToBottom);
        }
      });
    };
    termInput.addEventListener(
      'keydown',
      onTermKeyDown,
      { passive: false }
    );
    termInput.addEventListener(
      'input',
      onInput,
      { passive: true }
    );
    termInput.addEventListener(
      'click',
      scheduleCaretUpdate,
      { passive: true }
    );
    termInput.addEventListener(
      'keyup',
      scheduleCaretUpdate,
      { passive: true }
    );
    termInput.addEventListener(
      'select',
      scheduleCaretUpdate,
      { passive: true }
    );
    termInput.addEventListener(
      'scroll',
      scheduleCaretUpdate,
      { passive: true }
    );
    window.addEventListener(
      'mousedown',
      onWindowMouseDown,
      { passive: true }
    );
    transcript.addEventListener(
      'click',
      onTranscriptClick,
      { passive: true }
    );
    window.addEventListener(
      'keydown',
      onGlobalKeyDown,
      { passive: false }
    );
    window.addEventListener(
      'storage',
      onStorage,
      { passive: true }
    );
    window.addEventListener(
      'resize',
      onResize,
      { passive: true }
    );
    window.visualViewport?.addEventListener(
      'resize',
      onResize,
      { passive: true }
    );
    addCleanup(() => {
      termInput.removeEventListener(
        'keydown',
        onTermKeyDown
      );
      termInput.removeEventListener(
        'input',
        onInput
      );
      termInput.removeEventListener(
        'click',
        scheduleCaretUpdate
      );
      termInput.removeEventListener(
        'keyup',
        scheduleCaretUpdate
      );
      termInput.removeEventListener(
        'select',
        scheduleCaretUpdate
      );
      termInput.removeEventListener(
        'scroll',
        scheduleCaretUpdate
      );
      window.removeEventListener(
        'mousedown',
        onWindowMouseDown
      );
      transcript.removeEventListener(
        'click',
        onTranscriptClick
      );
      window.removeEventListener(
        'keydown',
        onGlobalKeyDown
      );
      window.removeEventListener(
        'storage',
        onStorage
      );
      window.removeEventListener(
        'resize',
        onResize
      );
      window.visualViewport?.removeEventListener(
        'resize',
        onResize
      );
    });
    app.eventsBound = true;
  };
  const startLoadingWatchdog = () => {
    if (app.loadingTimer) {
      clearInterval(app.loadingTimer);
    }
    const started = Date.now();
    app.loadingTimer = window.setInterval(() => {
      if (
        app.destroyed ||
        app.state !== APP_STATE.LOADING
      ) {
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed < 3000) {
        setStatus(
          'Starting MUNITOS virtual environment...',
          APP_STATE.LOADING
        );
        return;
      }
      if (elapsed < 10000) {
        setStatus(
          `Initializing system services... ${Math.floor(elapsed / 1000)}s`,
          APP_STATE.LOADING
        );
        return;
      }
      if (elapsed < 20000) {
        setStatus(
          'Still initializing packages and virtual filesystem...',
          APP_STATE.LOADING
        );
        return;
      }
      failInitialization(
        'MUNITOS initialization timed out.'
      );
    }, 500);
    addCleanup(() => {
      if (app.loadingTimer) {
        clearInterval(app.loadingTimer);
        app.loadingTimer = 0;
      }
    });
  };
  const initializeRuntime = async () => {
    setStatus(
      'Starting MUNITOS virtual environment...',
      APP_STATE.LOADING
    );
    setInputEnabled(false);
    startLoadingWatchdog();
    try {
      setStatus(
        'Initializing virtual filesystem...',
        APP_STATE.LOADING
      );
      runtime.initializeFS();
      setStatus(
        'Initializing user session...',
        APP_STATE.LOADING
      );
      runtime.initializeUnifiedIdentity();
      runtime.setBaseVariables();
      setStatus(
        'Restoring saved session...',
        APP_STATE.LOADING
      );
      runtime.restore();
      runtime.initializeUnifiedIdentity();
      runtime.setBaseVariables();
      runtime.refreshStaticRuntimeState();
      runtime.refreshDynamicRuntimeState();
      state.transcript = [
        runtime.makeLine(
          `${state.os} ${state.kernel}`,
          'output'
        ),
        runtime.makeSpacer(),
        runtime.makeLine(
          'The programs included with the MUNITOS GNU/Linux system.',
          'muted'
        ),
        runtime.makeLine(
          'The exact distribution terms for each program are described in the',
          'muted'
        ),
        runtime.makeLine(
          'individual files in /usr/share/doc/*/copyright.',
          'muted'
        ),
        runtime.makeLine(
          'MUNITOS GNU/Linux comes with ABSOLUTELY NO WARRANTY,',
          'muted'
        ),
        runtime.makeLine(
          'to the extent permitted by applicable law.',
          'muted'
        ),
        runtime.makeSpacer(),
        runtime.makeLine(
          'Welcome to MUNITOS GNU/Linux Rolling...',
          'output'
        ),
        runtime.makeSpacer(),
        runtime.makeLine(
          'Type "help" to list available commands.',
          'muted'
        ),
        runtime.makeSpacer()
      ].map(runtime.createEntryRecord);
      runtime.rebuildTranscript();
      runtime.setMode(state.mode);
      runtime.updatePrompt();
      runtime.updateCaret();
      setupEvents();
      setStatus(
        'Starting Virtual Kernel and package manager...',
        APP_STATE.LOADING
      );
      await runtime.restorePackages();
      if (app.destroyed) {
        return;
      }
      runtime.refreshStaticRuntimeState();
      runtime.refreshDynamicRuntimeState();
      runtime.syncLiveEntries();
      runtime.updatePrompt();
      runtime.updateCaret();
      runtime.scrollToBottom();
      runtime.persist();
      markReady();
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? `MUNITOS initialization failed: ${error.message}`
          : 'MUNITOS initialization failed.';
      failInitialization(reason);
    }
  };
  const destroy = () => {
    if (app.destroyed) {
      return;
    }
    app.destroyed = true;
    app.state = APP_STATE.FAILED;
    if (app.resizeRaf) {
      cancelAnimationFrame(app.resizeRaf);
      app.resizeRaf = 0;
    }
    if (app.caretRaf) {
      cancelAnimationFrame(app.caretRaf);
      app.caretRaf = 0;
    }
    CLEANUP.splice(0).reverse().forEach(fn => {
      try {
        fn();
      } catch {}
    });
    setInputEnabled(false);
  };
  const boot = async () => {
    if (app.started || app.destroyed) {
      return;
    }
    app.started = true;
    app.loadStartedAt = Date.now();
    setInputEnabled(false);
    setupEvents();
    await initializeRuntime();
  };
  addCleanup(() => {
    if (app.retryTimer) {
      clearTimeout(app.retryTimer);
      app.retryTimer = 0;
    }
  });
  window.addEventListener(
    'beforeunload',
    destroy,
    { passive: true }
  );
  addCleanup(() => {
    window.removeEventListener(
      'beforeunload',
      destroy
    );
  });
  setInputEnabled(false);
  let bootRequested = false;
  const requestBoot = () => { if (bootRequested) return; bootRequested = true; void boot(); };
  window.addEventListener('load', requestBoot, { once: true });
  window.addEventListener('MUNITOSCommandsReady', requestBoot, { once: true });
  };
  window.MUNITOSUI = Object.freeze({ version: FILE_VERSION, standalone: true, attach });
  attach(window.MUNITOSCore || window.MUNITOSTerminalCore);
})();
