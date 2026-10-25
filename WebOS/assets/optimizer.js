(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const VERSION=FILE_VERSION;
  const MAX_ACTIONS = 256;
  const MAX_ERRORS = 64;
  const MIN_CHUNK = 8;
  const MAX_CHUNK = 2048;
  const now = () => {
    try { return typeof globalThis.performance?.now === 'function' ? performance.now() : Date.now(); } catch { return Date.now(); }
  };
  const safe = (fn, fallback = null) => {
    try { return typeof fn === 'function' ? fn() : fallback; } catch { return fallback; }
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  const idle = (callback, timeout = 2000) => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => safe(callback), { timeout: Math.max(1, Number(timeout) || 2000) });
      return () => { try { cancelIdleCallback(id); } catch {} };
    }
    const id = setTimeout(() => safe(callback), Math.max(0, Number(timeout) || 0));
    return () => clearTimeout(id);
  };
  const yieldControl = () => new Promise(resolve => {
    if (typeof globalThis.navigator?.scheduler?.postTask === 'function') {
      try { navigator.scheduler.postTask(resolve, { priority: 'background' }); return; } catch {}
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
  const state = {
    phase: 'cold',
    version: VERSION,
    startedAt: 0,
    readyAt: 0,
    lastMaintenanceAt: 0,
    maintenanceRuns: 0,
    scheduled: 0,
    cancelled: 0,
    memoryPressure: 'unknown',
    profile: 'balanced',
    actions: [],
    errors: [],
    workerCalls: 0,
    workerFailures: 0,
    workerBytes: 0
  };
  const record = (type, payload = {}) => {
    const entry = Object.freeze({ at: Date.now(), type: String(type), ...payload });
    state.actions.push(entry);
    if (state.actions.length > MAX_ACTIONS) state.actions.splice(0, state.actions.length - MAX_ACTIONS);
    return entry;
  };
  const recordError = (error, context = '') => {
    const entry = Object.freeze({ at: Date.now(), context: String(context || ''), error: String(error?.message || error || 'UNKNOWN') });
    state.errors.push(entry);
    if (state.errors.length > MAX_ERRORS) state.errors.splice(0, state.errors.length - MAX_ERRORS);
  };
  const detectProfile = () => {
    const nav = globalThis.navigator || {};
    const cpu = Math.max(1, Number(nav.hardwareConcurrency) || 4);
    const memory = Number.isFinite(Number(nav.deviceMemory)) ? Number(nav.deviceMemory) : null;
    const connection = String(nav.connection?.effectiveType || '').toLowerCase();
    if (connection.includes('slow-2g') || connection === '2g') return 'economy';
    if (memory !== null && memory <= 2) return cpu >= 6 ? 'balanced' : 'economy';
    if (memory !== null && memory >= 8 && cpu >= 8) return 'performance';
    if (cpu >= 8) return 'balanced-plus';
    return 'balanced';
  };
  const profileChunk = () => {
    const base = { economy: 32, balanced: 96, 'balanced-plus': 192, performance: 384 }[state.profile] || 96;
    const cpu = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency) || 4);
    return clamp(Math.round(base * Math.min(4, Math.max(0.5, cpu / 4))), MIN_CHUNK, MAX_CHUNK);
  };
  const getWorker = () => {
    const kernel = globalThis.MUNITOSKernel;
    return kernel?.worker && typeof kernel.worker.request === 'function' ? kernel.worker : null;
  };
  const workerRequest = async (type, payload, timeout = 8000) => {
    const worker = getWorker();
    if (!worker) throw new Error('WORKER_UNAVAILABLE');
    state.workerCalls++;
    try {
      const result = await worker.request(type, payload, timeout);
      const bytes = Number(result?.bytes || result?.byteLength || 0);
      if (Number.isFinite(bytes) && bytes > 0) state.workerBytes += bytes;
      return result;
    } catch (error) {
      state.workerFailures++;
      throw error;
    }
  };
  const byteLength = value => {
    try {
      if (value instanceof Blob) return value.size;
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      return new TextEncoder().encode(String(value ?? '')).byteLength;
    } catch { return String(value ?? '').length * 2; }
  };
  const serialize = async (value, options = {}) => {
    const threshold = clamp(options.workerThreshold ?? 32768, 1024, 1048576);
    const forceWorker = options.forceWorker === true;
    if (forceWorker) {
      try {
        const result = await workerRequest('serialize', { value }, Number(options.timeout) || 12000);
        if (typeof result?.text === 'string') return result.text;
      } catch (error) { recordError(error, 'serialize-worker'); }
    } else {
      let estimated = 0;
      try { estimated = JSON.stringify(value).length; } catch { throw new TypeError('OPTIMIZER_SERIALIZE_UNSUPPORTED'); }
      if (estimated >= threshold) {
        try {
          const result = await workerRequest('serialize', { value }, Number(options.timeout) || 12000);
          if (typeof result?.text === 'string') return result.text;
        } catch (error) { recordError(error, 'serialize-worker'); }
      }
      return JSON.stringify(value);
    }
    return JSON.stringify(value);
  };
  const parse = async (text, options = {}) => {
    const raw = String(text ?? '');
    const threshold = clamp(options.workerThreshold ?? 32768, 1024, 1048576);
    if (raw.length >= threshold) {
      try {
        const result = await workerRequest('parse', { text: raw }, Number(options.timeout) || 12000);
        if (Object.prototype.hasOwnProperty.call(result || {}, 'value')) return result.value;
      } catch (error) { recordError(error, 'parse-worker'); }
    }
    return JSON.parse(raw);
  };
  const runChunked = async (items, worker, options = {}) => {
    if (!Array.isArray(items)) throw new TypeError('OPTIMIZER_ITEMS_ARRAY_REQUIRED');
    if (typeof worker !== 'function') throw new TypeError('OPTIMIZER_WORKER_FUNCTION_REQUIRED');
    const output = new Array(items.length);
    const signal = options.signal;
    let chunk = clamp(options.chunkSize ?? profileChunk(), MIN_CHUNK, MAX_CHUNK);
    let cursor = 0;
    while (cursor < items.length) {
      if (signal?.aborted) { state.cancelled++; throw new DOMException('Operation aborted', 'AbortError'); }
      const started = now();
      const end = Math.min(items.length, cursor + chunk);
      for (; cursor < end; cursor++) {
        if (signal?.aborted) { state.cancelled++; throw new DOMException('Operation aborted', 'AbortError'); }
        output[cursor] = await worker(items[cursor], cursor);
      }
      const elapsed = now() - started;
      if (elapsed > 24) chunk = Math.max(MIN_CHUNK, Math.floor(chunk * 0.72));
      else if (elapsed < 6) chunk = Math.min(MAX_CHUNK, Math.floor(chunk * 1.18));
      record('chunk', { processed: cursor, total: items.length, chunk });
      if (cursor < items.length) await yieldControl();
    }
    return output;
  };
  const inspectStorageLight = () => {
    const output = { localStorageKeys: 0, sessionStorageKeys: 0, cookieBytes: 0 };
    try { output.localStorageKeys = Number(globalThis.localStorage?.length) || 0; } catch {}
    try { output.sessionStorageKeys = Number(globalThis.sessionStorage?.length) || 0; } catch {}
    try { output.cookieBytes = new TextEncoder().encode(String(document.cookie || '')).byteLength; } catch {}
    return Object.freeze(output);
  };
  const inspectDeep = async () => {
    const output = { ...inspectStorageLight(), indexedDB: [], caches: [] };
    try { if (typeof globalThis.indexedDB?.databases === 'function') output.indexedDB = await globalThis.indexedDB.databases(); } catch (error) { recordError(error, 'indexeddb-inspect'); }
    try { if (typeof globalThis.caches?.keys === 'function') output.caches = await globalThis.caches.keys(); } catch (error) { recordError(error, 'cache-inspect'); }
    return Object.freeze(output);
  };
  const boot = async (options = {}) => {
    if (state.phase === 'ready' || state.phase === 'maintenance') return snapshot();
    state.startedAt ||= Date.now();
    state.profile = detectProfile();
    state.phase = 'ready';
    state.readyAt = Date.now();
    record('boot', { profile: state.profile, deferred: options.deferred !== false });
    if (options.scheduleMaintenance !== false) {
      state.scheduled++;
      idle(() => { void maintenance({ deep: false, scheduled: true }); }, 2500);
    }
    return snapshot();
  };
  const maintenance = async (options = {}) => {
    if (state.phase === 'maintenance') return snapshot();
    state.phase = 'maintenance';
    try {
      state.lastMaintenanceAt = Date.now();
      state.maintenanceRuns++;
      const deep = options.deep === true;
      const report = deep ? await inspectDeep() : inspectStorageLight();
      state.memoryPressure = memoryPressure();
      record('maintenance', { deep, report });
      return Object.freeze({ ...report, memoryPressure: state.memoryPressure });
    } catch (error) {
      recordError(error, 'maintenance');
      throw error;
    } finally {
      state.phase = 'ready';
    }
  };
  const memoryPressure = () => {
    try {
      const used = Number(globalThis.performance?.memory?.usedJSHeapSize);
      const limit = Number(globalThis.performance?.memory?.jsHeapSizeLimit);
      if (used > 0 && limit > 0) {
        const ratio = used / limit;
        state.memoryPressure = ratio >= 0.88 ? 'critical' : ratio >= 0.72 ? 'high' : ratio >= 0.55 ? 'moderate' : 'normal';
        return state.memoryPressure;
      }
    } catch {}
    state.memoryPressure = 'unknown';
    return state.memoryPressure;
  };
  const schedule = (fn, options = {}) => {
    const delay = Math.max(0, Number(options.delay) || 0);
    state.scheduled++;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try { fn(); } catch (error) { recordError(error, 'scheduled'); }
    };
    const timer = setTimeout(run, delay);
    return () => { cancelled = true; clearTimeout(timer); state.cancelled++; };
  };
  const cleanup = async (options = {}) => {
    return maintenance({ deep: options.deep === true, scheduled: false });
  };
  const snapshot = () => Object.freeze({
    version: VERSION,
    phase: state.phase,
    startedAt: state.startedAt,
    readyAt: state.readyAt,
    lastMaintenanceAt: state.lastMaintenanceAt,
    maintenanceRuns: state.maintenanceRuns,
    scheduled: state.scheduled,
    cancelled: state.cancelled,
    memoryPressure: state.memoryPressure,
    profile: state.profile,
    worker: Object.freeze({ calls: state.workerCalls, failures: state.workerFailures, bytes: state.workerBytes }),
    actions: state.actions.length,
    errors: state.errors.length
  });
  const api = Object.freeze({
    version: VERSION,
    boot,
    maintenance,
    cleanup,
    schedule,
    idle,
    yield: yieldControl,
    runChunked,
    serialize,
    parse,
    byteLength,
    profile: () => state.profile,
    detectProfile,
    memoryPressure,
    inspect: inspectDeep,
    status: snapshot,
    snapshot,
    state: () => Object.freeze({ ...state, actions: state.actions.slice(), errors: state.errors.slice() })
  });
  globalThis.MUNITOSOptimizer = api;
  Object.defineProperty(globalThis, '__MUNITOSOptimizerCore__', { value: api, configurable: true, enumerable: false, writable: false });
})();
