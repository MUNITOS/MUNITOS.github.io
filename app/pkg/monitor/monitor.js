(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'monitor',
    version: '1.0.0',
    description: 'Advanced floating browser/runtime monitor with layered system metrics, live telemetry, network probes, charts and persistent settings.',
    help: 'monitor help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'low',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'write',
      network: 'read',
      filesystem: 'none'
    }),
    commands: Object.freeze(['monitor']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'monitor';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_monitor';
  const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, maxFormsToTest: 200, mainTaskLimit: 384, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, maxFormsToTest: 80, mainTaskLimit: 48, label: 'LOW-POWER (mobile)' })
  });

  const COOKIE_KEY = 'munitos-monitor:v1';
  const HISTORY_MAX = 48;
  const RESIZE_DEBOUNCE = 150;
  const STORAGE_REFRESH_INTERVAL = 8000;
  const ERROR_HISTORY_MAX = 24;

  const DEFAULTS = Object.freeze({
    enabled: false,
    panelX: 24,
    panelY: 24,
    panelW: 440,
    panelH: 660,
    compact: false,
    autoSample: true,
    sampleInterval: 3000,
    theme: 'dark',
    showSettings: false,
    activeNetworkProbe: true,
    probeInterval: 10000,
    showSystem: true,
    showRuntime: true,
    showNetwork: true,
    showPage: true,
    showStorage: true,
    showErrors: true
  });

  const state = {
    api: null,
    settings: null,
    root: null,
    styleEl: null,
    sampleTimer: null,
    asyncTimer: null,
    raf: 0,
    dragging: false,
    dragId: null,
    dragPointerId: null,
    dragStartClientX: 0,
    dragStartClientY: 0,
    dragStartLeft: 0,
    dragStartTop: 0,
    dragCurrentLeft: 0,
    dragCurrentTop: 0,
    dragEvent: null,
    dragFrame: 0,
    dragHandle: null,
    resizing: false,
    resizeId: null,
    resizePointerId: null,
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartW: 0,
    resizeStartH: 0,
    resizeEvent: null,
    resizeFrame: 0,
    resizeHandle: null,
    expectedTick: 0,
    cpuHistory: [],
    ramHistory: [],
    fpsHistory: [],
    lagHistory: [],
    networkHistory: [],
    pingHistory: [],
    errorHistory: [],
    frameStats: { frames: 0, lastTime: 0, fps: 0, frameTime: 0, dropped: 0 },
    runtimeStats: { eventLoopLag: 0, longTasks: 0, worstLongTask: 0, totalLongTaskTime: 0, cls: 0, fcp: 0, lcp: 0, inp: 0 },
    asyncMetrics: {
      systemMemory: null, systemCpu: null, storage: null, ping: null,
      pingJitter: null, pingMin: null, pingMax: null, battery: null,
      gpu: null, permissionSummary: null, serviceWorker: null,
      lastProbeAt: 0, lastStorageAt: 0
    },
    errors: { js: 0, promise: 0, warnings: 0, last: null, history: [] },
    networkProbeSamples: [],
    observer: { longTask: null, layoutShift: null, paint: null, lcp: null, event: null, resource: null },
    lastSampleAt: 0,
    lastSnapshot: null,
    lastPagePerformance: null,
    panelRefs: null,
    resizeTimer: null,
    boundResize: null,
    boundVisibility: null,
    boundOnline: null,
    boundOffline: null,
    boundError: null,
    boundUnhandledRejection: null,
    boundConsoleWarn: null
  };

  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };
  const networkFetch = async (url, options = {}) => {
    const network = getNetworkApi();
    if (!network?.fetch) throw new Error('FreeUserProxy network API is not available.');
    return network.fetch(url, options);
  };
  const clamp = (v, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  };
  const round = (v, d = 1) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    const f = 10 ** d;
    return Math.round((n + Number.EPSILON) * f) / f;
  };
  const formatBytes = (bytes, d = 1) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return 'n/a';
    if (n < 1024) return `${Math.round(n)} B`;
    const u = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${round(v, d)} ${u[i]}`;
  };
  const formatDuration = ms => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return 'n/a';
    if (n < 1000) return `${round(n, 1)} ms`;
    return `${round(n / 1000, 2)} s`;
  };
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const line = (text, cls = 'output') => ({ type: 'line', html: `<span class="${esc(cls)}">${esc(text)}</span>` });
  const safeNumber = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const cookieEncode = v => { try { return encodeURIComponent(JSON.stringify(v)); } catch { return ''; } };
  const cookieDecode = raw => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const p = JSON.parse(decodeURIComponent(raw));
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch { return null; }
  };
  const cookieCanUseSecure = () => { try { return location.protocol === 'https:'; } catch { return false; } };
  const setCookie = (name, value, maxAgeDays = 365) => {
    try {
      if (!name || typeof name !== 'string' || !/^[\w:-]+$/.test(name)) return false;
      const enc = cookieEncode(value);
      if (!enc) return false;
      const maxAge = Math.max(1, Math.floor(Math.abs(Number(maxAgeDays) || 365) * 86400));
      const attrs = ['path=/', `max-age=${maxAge}`, 'samesite=lax'];
      if (cookieCanUseSecure()) attrs.push('secure');
      document.cookie = `${name}=${enc}; ${attrs.join('; ')}`;
      return true;
    } catch { return false; }
  };
  const getCookie = name => {
    try {
      if (!name || typeof name !== 'string' || !document.cookie) return null;
      const prefix = `${name}=`;
      for (const part of document.cookie.split('; ')) {
        if (part && part.startsWith(prefix)) return cookieDecode(part.slice(prefix.length));
      }
    } catch {}
    return null;
  };
  const deleteCookie = name => {
    try {
      if (!name || typeof name !== 'string') return;
      const attrs = ['path=/', 'max-age=0', 'samesite=lax'];
      if (cookieCanUseSecure()) attrs.push('secure');
      document.cookie = `${name}=; ${attrs.join('; ')}`;
    } catch {}
  };

  const sanitizeSettings = raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const clean = { ...DEFAULTS };
    if (typeof raw.enabled === 'boolean') clean.enabled = raw.enabled;
    if (Number.isFinite(Number(raw.panelX))) clean.panelX = Math.max(0, Number(raw.panelX));
    if (Number.isFinite(Number(raw.panelY))) clean.panelY = Math.max(0, Number(raw.panelY));
    if (Number.isFinite(Number(raw.panelW))) clean.panelW = clamp(raw.panelW, 320, 4096);
    if (Number.isFinite(Number(raw.panelH))) clean.panelH = clamp(raw.panelH, 300, 4096);
    if (typeof raw.compact === 'boolean') clean.compact = raw.compact;
    if (typeof raw.autoSample === 'boolean') clean.autoSample = raw.autoSample;
    if (Number.isFinite(Number(raw.sampleInterval))) clean.sampleInterval = clamp(raw.sampleInterval, 1000, 15000);
    if (raw.theme === 'dark' || raw.theme === 'light') clean.theme = raw.theme;
    if (typeof raw.showSettings === 'boolean') clean.showSettings = raw.showSettings;
    if (typeof raw.activeNetworkProbe === 'boolean') clean.activeNetworkProbe = raw.activeNetworkProbe;
    if (Number.isFinite(Number(raw.probeInterval))) clean.probeInterval = clamp(raw.probeInterval, 5000, 60000);
    for (const k of ['showSystem', 'showRuntime', 'showNetwork', 'showPage', 'showStorage', 'showErrors']) {
      if (typeof raw[k] === 'boolean') clean[k] = raw[k];
    }
    return clean;
  };
  const mergeSettings = saved => Object.assign({}, DEFAULTS, sanitizeSettings(saved) || {});
  const saveSettings = () => { if (state.settings) setCookie(COOKIE_KEY, state.settings, 365); };
  const loadSettings = () => { state.settings = mergeSettings(getCookie(COOKIE_KEY)); };

  const getMaxX = panel => Math.max(0, window.innerWidth - (panel ? panel.offsetWidth : state.settings.panelW));
  const getMaxY = panel => Math.max(0, window.innerHeight - (panel ? panel.offsetHeight : state.settings.panelH));
  const clampPanelPosition = panel => {
    if (!panel || !state.settings) return;
    state.settings.panelX = clamp(state.settings.panelX, 0, getMaxX(panel));
    state.settings.panelY = clamp(state.settings.panelY, 0, getMaxY(panel));
    panel.style.left = `${state.settings.panelX}px`;
    panel.style.top = `${state.settings.panelY}px`;
  };
  const blurIfInside = c => {
    if (!c) return;
    try { if (c.contains(document.activeElement)) document.activeElement.blur(); } catch {}
  };

  const getHostCandidates = () => {
    const r = [];
    try { if (state.api) r.push(state.api); } catch {}
    try { if (window.__munitosSystemMetrics) r.push(window.__munitosSystemMetrics); } catch {}
    try { if (window.__MUNITOS_SYSTEM_METRICS__) r.push(window.__MUNITOS_SYSTEM_METRICS__); } catch {}
    try { if (window.__SYSTEM_METRICS__) r.push(window.__SYSTEM_METRICS__); } catch {}
    try { if (window.__MUNITOS_HOST__) r.push(window.__MUNITOS_HOST__); } catch {}
    return r.filter(i => i && typeof i === 'object');
  };

  const deepFindValue = (obj, keys, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
    for (const v of Object.values(obj)) if (v && typeof v === 'object') {
      const f = deepFindValue(v, keys, depth + 1);
      if (f != null) return f;
    }
    return null;
  };
  const callHostMethod = async (c, names) => {
    if (!c || typeof c !== 'object') return null;
    for (const n of names) {
      try { if (typeof c[n] === 'function') { const v = await c[n](); if (v != null) return v; } } catch {}
    }
    return null;
  };
  const readHostMetrics = async () => {
    const c = getHostCandidates();
    for (const x of c) {
      const v = await callHostMethod(x, ['getSystemMetrics', 'getMetrics', 'systemMetrics', 'metrics', 'readSystemMetrics', 'readMetrics', 'getTelemetry', 'telemetry']);
      if (v && typeof v === 'object') return v;
    }
    for (const x of c) {
      try {
        if (x.system && typeof x.system === 'object') return x.system;
        if (x.snapshot && typeof x.snapshot === 'function') {
          const s = await x.snapshot();
          if (s && typeof s === 'object') return s;
        }
      } catch {}
    }
    return null;
  };

  const parseSystemMemory = raw => {
    if (!raw || typeof raw !== 'object') return null;
    const usedC = ['usedMemory', 'memoryUsed', 'ramUsed', 'usedRam', 'used', 'usedBytes', 'memoryUsedBytes'];
    const totalC = ['totalMemory', 'memoryTotal', 'ramTotal', 'totalRam', 'total', 'totalBytes', 'memoryTotalBytes'];
    const availC = ['availableMemory', 'memoryAvailable', 'ramAvailable', 'availableRam', 'freeMemory', 'freeRam', 'free', 'availableBytes'];
    let used = safeNumber(deepFindValue(raw, usedC));
    let total = safeNumber(deepFindValue(raw, totalC));
    let available = safeNumber(deepFindValue(raw, availC));
    const memC = deepFindValue(raw, ['memory', 'ram', 'systemMemory', 'systemRam']);
    if (memC && typeof memC === 'object') {
      if (used == null) used = safeNumber(deepFindValue(memC, usedC));
      if (total == null) total = safeNumber(deepFindValue(memC, totalC));
      if (available == null) available = safeNumber(deepFindValue(memC, availC));
    }
    const unit = String(deepFindValue(raw, ['memoryUnit', 'ramUnit', 'unit']) || '').toLowerCase();
    const mult = unit === 'kb' ? 1024 : unit === 'mb' ? 1048576 : unit === 'gb' ? 1073741824 : 1;
    if (used != null) used *= mult;
    if (total != null) total *= mult;
    if (available != null) available *= mult;
    if (total == null && used != null && available != null) total = used + available;
    if (used == null && total != null && available != null) used = Math.max(0, total - available);
    const pctRaw = safeNumber(deepFindValue(raw, ['memoryPercent', 'ramPercent', 'memoryUsagePercent', 'ramUsagePercent', 'percent']));
    const pct = pctRaw != null ? clamp(pctRaw, 0, 100) : total > 0 && used != null ? clamp((used / total) * 100, 0, 100) : null;
    if (total == null && used == null && pct == null) return null;
    return { used: used ?? 0, total: total ?? 0, available: available ?? 0, pct: pct ?? 0, source: 'system' };
  };
  const parseSystemCpu = raw => {
    if (!raw || typeof raw !== 'object') return null;
    const cpuRaw = deepFindValue(raw, ['cpu', 'cpuUsage', 'cpuPercent', 'cpuUsagePercent', 'processor']);
    let value = null;
    if (typeof cpuRaw === 'number') value = cpuRaw;
    else if (typeof cpuRaw === 'object' && cpuRaw) value = safeNumber(deepFindValue(cpuRaw, ['usage', 'percent', 'percentage', 'total', 'value']));
    if (value == null) value = safeNumber(deepFindValue(raw, ['cpuUsage', 'cpuPercent', 'cpuUsagePercent']));
    if (value == null) return null;
    return { usage: clamp(value, 0, 100), source: 'system' };
  };
  const memoryFallback = () => {
    try {
      const m = performance?.memory;
      if (m && Number.isFinite(m.usedJSHeapSize) && Number.isFinite(m.totalJSHeapSize) && Number.isFinite(m.jsHeapSizeLimit)) {
        const used = m.usedJSHeapSize, total = m.jsHeapSizeLimit;
        return { used, total, available: Math.max(0, total - used), pct: clamp((used / total) * 100, 0, 100), label: `${formatBytes(used)} / ${formatBytes(total)}`, detail: `heap ${formatBytes(m.totalJSHeapSize)}`, source: 'js-heap' };
      }
    } catch {}
    try {
      const dm = Number(navigator.deviceMemory);
      if (Number.isFinite(dm) && dm > 0) {
        const total = dm * 1073741824;
        const used = total * 0.55;
        return { used, total, available: total - used, pct: 55, label: `~${round(dm, 1)} GB class`, detail: 'fallback estimate', source: 'fallback' };
      }
    } catch {}
    return { used: 0, total: 0, available: 0, pct: 0, label: 'Unavailable', detail: 'no data', source: 'unavailable' };
  };
  const updateFrameStats = now => {
    if (!state.frameStats.lastTime) { state.frameStats.lastTime = now; return; }
    const delta = now - state.frameStats.lastTime;
    state.frameStats.lastTime = now;
    if (delta > 0 && delta < 500) {
      const fps = 1000 / delta;
      state.frameStats.frames++;
      state.frameStats.frameTime = state.frameStats.frameTime === 0 ? delta : state.frameStats.frameTime * 0.85 + delta * 0.15;
      state.frameStats.fps = state.frameStats.fps === 0 ? fps : state.frameStats.fps * 0.85 + fps * 0.15;
      if (delta > 20) state.frameStats.dropped += Math.max(1, Math.round(delta / 16.67) - 1);
    }
    requestAnimationFrame(updateFrameStats);
  };
  const startFrameMonitor = () => {
    if (state.frameStats.lastTime) return;
    state.frameStats.lastTime = performance.now();
    requestAnimationFrame(updateFrameStats);
  };
  const sampleEventLoopLag = () => new Promise(resolve => {
    const started = performance.now();
    setTimeout(() => resolve(Math.max(0, performance.now() - started - 10)), 10);
  });
  const updateRuntimeCpuScore = s => {
    let score = 8;
    score += clamp((s.eventLoopLag || 0) * 2.1, 0, 34);
    score += clamp((s.longTasks || 0) * 3.5, 0, 20);
    score += clamp(((s.frameTime || 16.67) - 16.67) * 2.2, 0, 22);
    score += clamp((s.frameDropped || 0) * 1.4, 0, 14);
    return clamp(score, 0, 100);
  };
  const netInfo = () => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const downlink = c && Number.isFinite(c.downlink) ? c.downlink : 0;
    const rtt = c && Number.isFinite(c.rtt) ? c.rtt : 0;
    const effectiveType = c?.effectiveType ? String(c.effectiveType) : navigator.onLine ? 'online' : 'offline';
    const saveData = Boolean(c?.saveData);
    const online = Boolean(navigator.onLine);
    const theoretical = downlink > 0 ? clamp(downlink * 2.5, 0, 100) : online ? 50 : 0;
    const latency = rtt > 0 ? clamp(100 - rtt * 0.55, 0, 100) : online ? 70 : 0;
    return {
      downlink, rtt, effectiveType, online, saveData,
      speedScore: round(theoretical * 0.55 + latency * 0.45, 1),
      stabilityScore: round(online ? clamp(latency * 0.7 + theoretical * 0.3, 0, 100) : 0, 1)
    };
  };
  const pushHistory = (arr, value, min = 0, max = 100, limit = HISTORY_MAX) => {
    if (!Array.isArray(arr)) return;
    const n = Number(value);
    arr.push(Number.isFinite(n) ? clamp(n, min, max) : min);
    while (arr.length > limit) arr.shift();
  };
  const timeLabel = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const getBrowserInfo = () => {
    const ua = String(navigator.userAgent || '');
    let browser = 'Unknown';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
    return {
      browser,
      platform: String(navigator.platform || 'unknown'),
      ua,
      language: navigator.language || 'unknown',
      languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
      online: navigator.onLine,
      cookies: navigator.cookieEnabled,
      cores: Number(navigator.hardwareConcurrency) || 0,
      deviceMemory: Number.isFinite(Number(navigator.deviceMemory)) ? Number(navigator.deviceMemory) : 0
    };
  };
  const getDisplayInfo = () => ({
    screenW: Number(screen.width) || 0,
    screenH: Number(screen.height) || 0,
    availW: Number(screen.availWidth) || 0,
    availH: Number(screen.availHeight) || 0,
    viewportW: Number(window.innerWidth) || 0,
    viewportH: Number(window.innerHeight) || 0,
    dpr: Number(window.devicePixelRatio) || 1,
    colorDepth: Number(screen.colorDepth) || 0,
    orientation: screen.orientation?.type || (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait')
  });
  const getPageDomInfo = () => {
    const tagCounts = { div: 0, span: 0, img: 0, script: 0, style: 0, link: 0, iframe: 0, canvas: 0, video: 0, audio: 0, input: 0, button: 0 };
    for (const tag of Object.keys(tagCounts)) tagCounts[tag] = document.getElementsByTagName(tag).length;
    return { elements: document.querySelectorAll('*').length, bodyChildren: document.body?.children?.length || 0, ...tagCounts };
  };
  const getNavigationPerformance = () => {
    try {
      const entries = performance.getEntriesByType('navigation');
      if (!entries.length) return null;
      const nav = entries[0];
      return {
        dns: Math.max(0, nav.domainLookupEnd - nav.domainLookupStart),
        tcp: Math.max(0, nav.connectEnd - nav.connectStart),
        tls: nav.secureConnectionStart > 0 ? Math.max(0, nav.connectEnd - nav.secureConnectionStart) : 0,
        ttfb: Math.max(0, nav.responseStart - nav.requestStart),
        domInteractive: Math.max(0, nav.domInteractive - nav.startTime),
        domContentLoaded: Math.max(0, nav.domContentLoadedEventEnd - nav.startTime),
        load: Math.max(0, nav.loadEventEnd - nav.startTime),
        transferSize: Number(nav.transferSize) || 0,
        encodedBodySize: Number(nav.encodedBodySize) || 0,
        decodedBodySize: Number(nav.decodedBodySize) || 0
      };
    } catch { return null; }
  };
  const getResourceStats = () => {
    try {
      const resources = performance.getEntriesByType('resource');
      let jsBytes = 0, cssBytes = 0, imageBytes = 0, fontBytes = 0, otherBytes = 0;
      let scripts = 0, styles = 0, images = 0, fonts = 0, fetches = 0, xhr = 0;
      for (const item of resources) {
        const name = String(item.name || '').toLowerCase();
        const initiator = String(item.initiatorType || '').toLowerCase();
        const bytes = Number(item.transferSize) || Number(item.encodedBodySize) || 0;
        if (initiator === 'script' || /\.(js|mjs)(\?|$)/i.test(name)) { scripts++; jsBytes += bytes; }
        else if (initiator === 'css' || /\.css(\?|$)/i.test(name)) { styles++; cssBytes += bytes; }
        else if (initiator === 'img' || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(name)) { images++; imageBytes += bytes; }
        else if (initiator === 'font' || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(name)) { fonts++; fontBytes += bytes; }
        else if (initiator === 'fetch') { fetches++; otherBytes += bytes; }
        else if (initiator === 'xmlhttprequest') { xhr++; otherBytes += bytes; }
        else otherBytes += bytes;
      }
      return { total: resources.length, scripts, styles, images, fonts, fetches, xhr, jsBytes, cssBytes, imageBytes, fontBytes, otherBytes, totalBytes: jsBytes + cssBytes + imageBytes + fontBytes + otherBytes };
    } catch {
      return { total: 0, scripts: 0, styles: 0, images: 0, fonts: 0, fetches: 0, xhr: 0, jsBytes: 0, cssBytes: 0, imageBytes: 0, fontBytes: 0, otherBytes: 0, totalBytes: 0 };
    }
  };
  const getStorageInfo = async () => {
    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const r = await navigator.storage.estimate();
        return {
          usage: Number(r.usage) || 0,
          quota: Number(r.quota) || 0,
          pct: Number(r.quota) > 0 ? clamp((Number(r.usage) / Number(r.quota)) * 100, 0, 100) : 0,
          source: 'storage'
        };
      }
    } catch {}
    return { usage: 0, quota: 0, pct: 0, source: 'unavailable' };
  };
  const getGpuInfo = () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { available: false, vendor: 'Unavailable', renderer: 'Unavailable' };
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      let vendor = 'Restricted', renderer = 'Restricted';
      if (info) {
        vendor = gl.getParameter(info.UNMASKED_VENDOR_WEBGL) || 'Restricted';
        renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || 'Restricted';
      }
      return { available: true, vendor: String(vendor), renderer: String(renderer), version: String(gl.getParameter(gl.VERSION) || 'unknown') };
    } catch {
      return { available: false, vendor: 'Unavailable', renderer: 'Unavailable', version: 'unknown' };
    }
  };
  const getServiceWorkerInfo = async () => {
    try {
      if (!navigator?.serviceWorker) return { supported: false, controller: false, state: 'unavailable' };
      const reg = await navigator.serviceWorker.getRegistration();
      return { supported: true, controller: Boolean(navigator.serviceWorker.controller), state: reg?.active?.state || reg?.installing?.state || reg?.waiting?.state || 'none' };
    } catch { return { supported: false, controller: false, state: 'unavailable' }; }
  };
  const getPermissionSummary = async () => {
    if (!navigator.permissions?.query) return { available: false, entries: [] };
    const names = ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write'];
    const entries = [];
    for (const name of names) {
      try { const r = await navigator.permissions.query({ name }); entries.push({ name, state: r.state }); } catch {}
    }
    return { available: true, entries };
  };
  const getBatteryInfo = async () => {
    try {
      if (typeof navigator.getBattery !== 'function') return null;
      const b = await navigator.getBattery();
      return {
        level: Math.round(clamp(Number(b.level) * 100, 0, 100)),
        charging: Boolean(b.charging),
        chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : 0,
        dischargingTime: Number.isFinite(b.dischargingTime) ? b.dischargingTime : 0
      };
    } catch { return null; }
  };
  const getPingTarget = () => {
    try { if (location.origin && location.origin !== 'null') return `${location.origin}/favicon.ico`; } catch {}
    try { return location.href; } catch { return null; }
  };
  const performPing = async () => {
    if (!navigator.onLine) return null;
    const target = getPingTarget();
    if (!target) return null;
    const url = target + (target.includes('?') ? '&' : '?') + `_monitor=${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const started = performance.now();
    try { await networkFetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', redirect: 'follow' }); return Math.max(0, performance.now() - started); } catch {}
    try { await networkFetch(url, { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'follow' }); return Math.max(0, performance.now() - started); } catch { return null; }
  };
  const calculatePingStats = () => {
    const values = state.networkProbeSamples.filter(v => Number.isFinite(v)).slice(-8);
    if (!values.length) return { current: null, min: null, max: null, jitter: null };
    const jitter = values.length > 1 ? values.slice(1).reduce((s, v, i) => s + Math.abs(v - values[i]), 0) / (values.length - 1) : 0;
    return { current: values[values.length - 1], min: Math.min(...values), max: Math.max(...values), jitter };
  };
  const refreshAsyncMetrics = async force => {
    const now = Date.now();
    if (force || now - state.asyncMetrics.lastStorageAt >= STORAGE_REFRESH_INTERVAL) {
      try { state.asyncMetrics.storage = await getStorageInfo(); } catch {}
      state.asyncMetrics.lastStorageAt = now;
      try { state.asyncMetrics.battery = await getBatteryInfo(); } catch {}
      try { state.asyncMetrics.gpu = getGpuInfo(); } catch {}
      try { state.asyncMetrics.permissionSummary = await getPermissionSummary(); } catch {}
      try { state.asyncMetrics.serviceWorker = await getServiceWorkerInfo(); } catch {}
    }
    if (state.settings?.activeNetworkProbe && (force || now - state.asyncMetrics.lastProbeAt >= state.settings.probeInterval)) {
      const ping = await performPing();
      if (ping != null) {
        state.networkProbeSamples.push(ping);
        while (state.networkProbeSamples.length > 12) state.networkProbeSamples.shift();
      }
      const stats = calculatePingStats();
      state.asyncMetrics.ping = stats.current;
      state.asyncMetrics.pingMin = stats.min;
      state.asyncMetrics.pingMax = stats.max;
      state.asyncMetrics.pingJitter = stats.jitter;
      state.asyncMetrics.lastProbeAt = now;
    }
    try {
      const host = await readHostMetrics();
      if (host) {
        const memory = parseSystemMemory(host);
        const cpu = parseSystemCpu(host);
        if (memory) state.asyncMetrics.systemMemory = memory;
        if (cpu) state.asyncMetrics.systemCpu = cpu;
      }
    } catch {}
    updatePanel();
  };

  const setupPerformanceObservers = () => {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        state.observer.longTask = new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            state.runtimeStats.longTasks++;
            state.runtimeStats.totalLongTaskTime += Number(e.duration) || 0;
            state.runtimeStats.worstLongTask = Math.max(state.runtimeStats.worstLongTask, Number(e.duration) || 0);
          }
        });
        state.observer.longTask.observe({ entryTypes: ['longtask'] });
      }
    } catch {}
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
        state.observer.layoutShift = new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) state.runtimeStats.cls += Number(e.value) || 0;
        });
        state.observer.layoutShift.observe({ entryTypes: ['layout-shift'] });
      }
    } catch {}
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('paint')) {
        state.observer.paint = new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') state.runtimeStats.fcp = Number(e.startTime) || 0;
        });
        state.observer.paint.observe({ entryTypes: ['paint'] });
      }
    } catch {}
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
        state.observer.lcp = new PerformanceObserver(list => {
          const entries = list.getEntries();
          if (entries.length) state.runtimeStats.lcp = Number(entries[entries.length - 1].startTime) || 0;
        });
        state.observer.lcp.observe({ entryTypes: ['largest-contentful-paint'] });
      }
    } catch {}
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
        state.observer.event = new PerformanceObserver(list => {
          for (const e of list.getEntries()) state.runtimeStats.inp = Math.max(state.runtimeStats.inp, Number(e.duration) || 0);
        });
        state.observer.event.observe({ type: 'event', buffered: true, durationThreshold: 40 });
      }
    } catch {}
  };

  const setupErrorTracking = () => {
    state.boundError = e => {
      state.errors.js++;
      state.errors.last = e?.message || e?.error?.message || 'JavaScript error';
      state.errors.history.push({ type: 'js', time: Date.now(), message: String(state.errors.last) });
      while (state.errors.history.length > ERROR_HISTORY_MAX) state.errors.history.shift();
    };
    state.boundUnhandledRejection = e => {
      state.errors.promise++;
      let reason = 'Unhandled promise rejection';
      try { if (e?.reason?.message) reason = e.reason.message; else if (e?.reason != null) reason = String(e.reason); } catch {}
      state.errors.last = reason;
      state.errors.history.push({ type: 'promise', time: Date.now(), message: String(reason) });
      while (state.errors.history.length > ERROR_HISTORY_MAX) state.errors.history.shift();
    };
    window.addEventListener('error', state.boundError, true);
    window.addEventListener('unhandledrejection', state.boundUnhandledRejection);
    try {
      const originalWarn = console.warn;
      if (!console.__munitosMonitorWrapped) {
        const wrapped = (...args) => {
          try {
            state.errors.warnings++;
            state.errors.last = args.map(item => { try { return typeof item === 'string' ? item : JSON.stringify(item); } catch { return String(item); } }).join(' ');
          } catch {}
          return originalWarn.apply(console, args);
        };
        console.warn = wrapped;
        console.__munitosMonitorWrapped = true;
        console.__munitosMonitorOriginalWarn = originalWarn;
      }
    } catch {}
  };
  const removeErrorTracking = () => {
    if (state.boundError) { window.removeEventListener('error', state.boundError, true); state.boundError = null; }
    if (state.boundUnhandledRejection) { window.removeEventListener('unhandledrejection', state.boundUnhandledRejection); state.boundUnhandledRejection = null; }
    try {
      if (console.__munitosMonitorWrapped && console.__munitosMonitorOriginalWarn) {
        console.warn = console.__munitosMonitorOriginalWarn;
        delete console.__munitosMonitorWrapped;
        delete console.__munitosMonitorOriginalWarn;
      }
    } catch {}
  };

  const currentSnapshot = () => {
    const browser = getBrowserInfo();
    const display = getDisplayInfo();
    const dom = getPageDomInfo();
    const navigation = getNavigationPerformance();
    const resources = getResourceStats();
    const network = netInfo();
    const pingStats = calculatePingStats();
    const fps = clamp(Number(state.frameStats.fps) || 0, 0, 240);
    const frameTime = Number(state.frameStats.frameTime) || 0;
    const eventLoopLag = Number(state.runtimeStats.eventLoopLag) || 0;
    const runtimeCpu = updateRuntimeCpuScore({ eventLoopLag, longTasks: state.runtimeStats.longTasks, frameTime, frameDropped: state.frameStats.dropped });
    const memory = state.asyncMetrics.systemMemory
      ? { ...state.asyncMetrics.systemMemory, label: `${formatBytes(state.asyncMetrics.systemMemory.used)} / ${formatBytes(state.asyncMetrics.systemMemory.total)}`, detail: state.asyncMetrics.systemMemory.available > 0 ? `free ${formatBytes(state.asyncMetrics.systemMemory.available)}` : 'system memory' }
      : memoryFallback();
    const cpu = state.asyncMetrics.systemCpu ? state.asyncMetrics.systemCpu.usage : runtimeCpu;
    return {
      at: Date.now(),
      label: timeLabel(),
      browser, display, dom, navigation, resources,
      cpu,
      cpuSource: state.asyncMetrics.systemCpu?.source || 'runtime',
      memory,
      fps,
      frameTime,
      frameDropped: state.frameStats.dropped,
      eventLoopLag,
      longTasks: state.runtimeStats.longTasks,
      worstLongTask: state.runtimeStats.worstLongTask,
      longTaskTime: state.runtimeStats.totalLongTaskTime,
      cls: state.runtimeStats.cls,
      fcp: state.runtimeStats.fcp,
      lcp: state.runtimeStats.lcp,
      inp: state.runtimeStats.inp,
      errors: { js: state.errors.js, promise: state.errors.promise, warnings: state.errors.warnings, last: state.errors.last },
      network: { ...network, ping: pingStats.current, pingMin: pingStats.min, pingMax: pingStats.max, jitter: pingStats.jitter },
      storage: state.asyncMetrics.storage || { usage: 0, quota: 0, pct: 0, source: 'unavailable' },
      battery: state.asyncMetrics.battery,
      gpu: state.asyncMetrics.gpu || getGpuInfo(),
      serviceWorker: state.asyncMetrics.serviceWorker,
      permissions: state.asyncMetrics.permissionSummary,
      visibility: document.visibilityState || 'unknown',
      focused: document.hasFocus?.() || false
    };
  };

  const createChartSVG = strokeClass => `
    <svg class="monitor-chart" viewBox="0 0 320 88" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="grid" points="0,44 320,44"></polyline>
      <polyline class="grid thin" points="0,22 320,22"></polyline>
      <polyline class="grid thin" points="0,66 320,66"></polyline>
      <polyline class="${esc(strokeClass)}" points=""></polyline>
    </svg>
  `;
  const updateChartPolyline = (polyline, values, width = 320, height = 88, min = 0, max = 100) => {
    if (!polyline || !Array.isArray(values)) return;
    if (!values.length) { polyline.setAttribute('points', ''); return; }
    const safe = values.map(v => clamp(v, min, max));
    const range = max - min || 1;
    const stepX = safe.length > 1 ? width / (safe.length - 1) : width;
    polyline.setAttribute('points', safe.map((v, i) => {
      const norm = (v - min) / range;
      const y = height - norm * (height - 8) - 4;
      return `${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
    }).join(' '));
  };

  const createPanelHTML = () => {
    if (!state.settings) return '';
    const themeClass = state.settings.theme === 'light' ? 'theme-light' : 'theme-dark';
    const compactClass = state.settings.compact ? 'is-compact' : '';
    const settingsOpen = state.settings.showSettings ? 'open' : '';

    return `
      <div class="monitor-shell ${themeClass} ${compactClass}" data-monitor-shell role="dialog" aria-label="MUNITOS Monitor">
        <div class="monitor-scanlines" aria-hidden="true"></div>
        <div class="monitor-header" data-monitor-drag>
          <div class="monitor-title">
            <div class="monitor-status-dot"></div>
            <div>
              <div class="monitor-name"><span class="prompt-prefix">root@munitos</span>:~# monitor</div>
              <div class="monitor-sub">SYSTEM · RUNTIME · NETWORK · PAGE</div>
            </div>
          </div>
          <div class="monitor-actions">
            <button class="monitor-btn" data-monitor-action="settings" title="Settings" aria-label="Open settings">⚙</button>
            <button class="monitor-btn" data-monitor-action="sample" title="Refresh" aria-label="Refresh metrics">↻</button>
            <button class="monitor-btn danger" data-monitor-action="off" title="Hide" aria-label="Hide panel">×</button>
          </div>
        </div>
        <div class="monitor-body">
          ${state.settings.showSystem ? `
          <section class="monitor-section" data-section="system">
            <div class="monitor-section-title">
              <span><i class="dot-red"></i> SYSTEM</span>
              <small data-metric="system-source">collecting</small>
            </div>
            <div class="monitor-grid-2">
              <div class="monitor-card">
                <div class="monitor-card-head"><span>CPU</span><strong data-metric="cpu-value">0%</strong></div>
                <div class="monitor-bar"><div class="monitor-bar-fill cpu" data-metric="cpu-bar" style="width:0%"></div></div>
                <div class="monitor-meta"><span data-metric="cpu-source">runtime</span><span data-metric="cpu-cores">cores: n/a</span></div>
                <div data-chart="cpu">${createChartSVG('cpu-line')}</div>
              </div>
              <div class="monitor-card">
                <div class="monitor-card-head"><span>RAM</span><strong data-metric="ram-value">0%</strong></div>
                <div class="monitor-bar"><div class="monitor-bar-fill ram" data-metric="ram-bar" style="width:0%"></div></div>
                <div class="monitor-meta"><span data-metric="ram-label">unavailable</span><span data-metric="ram-source">fallback</span></div>
                <div class="monitor-meta"><span data-metric="ram-detail">-</span></div>
                <div data-chart="ram">${createChartSVG('ram-line')}</div>
              </div>
            </div>
            <div class="monitor-grid-3 system-mini-grid">
              <div class="monitor-pill"><span>CORES</span><b data-metric="cores">0</b></div>
              <div class="monitor-pill"><span>DEVICE</span><b data-metric="device-memory">n/a</b></div>
              <div class="monitor-pill"><span>GPU</span><b data-metric="gpu-status">n/a</b></div>
            </div>
          </section>` : ''}
          ${state.settings.showRuntime ? `
          <section class="monitor-section" data-section="runtime">
            <div class="monitor-section-title"><span><i class="dot-red"></i> RUNTIME</span><small data-metric="visibility">visible</small></div>
            <div class="monitor-grid-3">
              <div class="monitor-card compact-card"><span class="metric-label">FPS</span><strong data-metric="fps">0</strong></div>
              <div class="monitor-card compact-card"><span class="metric-label">FRAME</span><strong data-metric="frame-time">0 ms</strong></div>
              <div class="monitor-card compact-card"><span class="metric-label">LAG</span><strong data-metric="loop-lag">0 ms</strong></div>
            </div>
            <div class="monitor-card">
              <div class="monitor-card-head"><span>PERFORMANCE</span><strong data-metric="long-task-status">OK</strong></div>
              <div class="monitor-meta two">
                <span data-metric="long-tasks">long tasks: 0</span>
                <span data-metric="worst-task">worst: 0 ms</span>
                <span data-metric="dropped">dropped: 0</span>
                <span data-metric="jank">jank: 0%</span>
              </div>
              <div data-chart="fps">${createChartSVG('fps-line')}</div>
            </div>
            <div class="monitor-grid-3">
              <div class="monitor-pill"><span>DOM</span><b data-metric="dom-count">0</b></div>
              <div class="monitor-pill"><span>CLS</span><b data-metric="cls">0</b></div>
              <div class="monitor-pill"><span>INP</span><b data-metric="inp">0 ms</b></div>
            </div>
          </section>` : ''}
          ${state.settings.showNetwork ? `
          <section class="monitor-section" data-section="network">
            <div class="monitor-section-title"><span><i class="dot-red"></i> NETWORK</span><small data-metric="net-online">offline</small></div>
            <div class="monitor-card">
              <div class="monitor-card-head"><span>CONNECTION</span><strong data-metric="net-type">unknown</strong></div>
              <div class="monitor-meta two">
                <span data-metric="net-downlink">downlink: n/a</span>
                <span data-metric="net-rtt">rtt: n/a</span>
                <span data-metric="net-ping">ping: n/a</span>
                <span data-metric="net-jitter">jitter: n/a</span>
                <span data-metric="net-save">save-data: off</span>
              </div>
              <div class="monitor-bars">
                <div><small>quality</small><div class="monitor-bar"><div class="monitor-bar-fill net" data-metric="net-quality-bar" style="width:0%"></div></div></div>
                <div><small>stability</small><div class="monitor-bar"><div class="monitor-bar-fill net2" data-metric="net-stability-bar" style="width:0%"></div></div></div>
              </div>
              <div data-chart="net">${createChartSVG('net-line')}</div>
            </div>
          </section>` : ''}
          ${state.settings.showPage ? `
          <section class="monitor-section" data-section="page">
            <div class="monitor-section-title"><span><i class="dot-red"></i> PAGE</span><small data-metric="page-resource-count">0 resources</small></div>
            <div class="monitor-grid-2">
              <div class="monitor-card">
                <div class="monitor-card-head"><span>LOAD</span><strong data-metric="page-load">0 ms</strong></div>
                <div class="monitor-meta two">
                  <span data-metric="page-ttfb">TTFB: 0 ms</span>
                  <span data-metric="page-dom">DOM: 0 ms</span>
                  <span data-metric="page-fcp">FCP: 0 ms</span>
                  <span data-metric="page-lcp">LCP: 0 ms</span>
                </div>
              </div>
              <div class="monitor-card">
                <div class="monitor-card-head"><span>TRANSFER</span><strong data-metric="page-bytes">0 B</strong></div>
                <div class="monitor-meta two">
                  <span data-metric="page-scripts">JS: 0</span>
                  <span data-metric="page-images">IMG: 0</span>
                  <span data-metric="page-css">CSS: 0</span>
                  <span data-metric="page-fonts">FONT: 0</span>
                </div>
              </div>
            </div>
            <div class="monitor-grid-3">
              <div class="monitor-pill"><span>SCREEN</span><b data-metric="screen">0×0</b></div>
              <div class="monitor-pill"><span>VIEWPORT</span><b data-metric="viewport">0×0</b></div>
              <div class="monitor-pill"><span>DPR</span><b data-metric="dpr">1</b></div>
            </div>
          </section>` : ''}
          ${state.settings.showStorage ? `
          <section class="monitor-section" data-section="storage">
            <div class="monitor-section-title"><span><i class="dot-red"></i> STORAGE</span><small data-metric="storage-source">checking</small></div>
            <div class="monitor-card">
              <div class="monitor-card-head"><span>QUOTA</span><strong data-metric="storage-value">n/a</strong></div>
              <div class="monitor-bar"><div class="monitor-bar-fill storage" data-metric="storage-bar" style="width:0%"></div></div>
              <div class="monitor-meta"><span data-metric="storage-usage">used: n/a</span><span data-metric="storage-quota">quota: n/a</span></div>
            </div>
          </section>` : ''}
          ${state.settings.showErrors ? `
          <section class="monitor-section" data-section="errors">
            <div class="monitor-section-title"><span><i class="dot-red"></i> ERRORS</span><small data-metric="error-state">clean</small></div>
            <div class="monitor-grid-3">
              <div class="monitor-card compact-card"><span class="metric-label">JS</span><strong data-metric="error-js">0</strong></div>
              <div class="monitor-card compact-card"><span class="metric-label">PROMISE</span><strong data-metric="error-promise">0</strong></div>
              <div class="monitor-card compact-card"><span class="metric-label">WARN</span><strong data-metric="error-warning">0</strong></div>
            </div>
            <div class="monitor-last-error" data-metric="last-error">No recorded errors.</div>
            <div data-chart="errors">${createChartSVG('error-line')}</div>
          </section>` : ''}
          <section class="monitor-section">
            <div class="monitor-meta footer-meta">
              <span data-metric="browser">Browser</span>
              <span data-metric="platform">Platform</span>
              <span data-metric="last-sample">--:--:--</span>
            </div>
          </section>
        </div>
        <div class="monitor-settings ${settingsOpen}" data-monitor-settings aria-hidden="${state.settings.showSettings ? 'false' : 'true'}">
          <div class="monitor-settings-head"><span>Settings</span><button class="monitor-btn" data-monitor-action="settings" title="Close" aria-label="Close settings">✕</button></div>
          <label class="monitor-field"><span>Auto sampling</span><button class="monitor-switch ${state.settings.autoSample ? 'on' : ''}" data-monitor-toggle="autoSample" role="switch" aria-checked="${state.settings.autoSample ? 'true' : 'false'}"><i></i></button></label>
          <label class="monitor-field"><span>Active network probe</span><button class="monitor-switch ${state.settings.activeNetworkProbe ? 'on' : ''}" data-monitor-toggle="activeNetworkProbe" role="switch" aria-checked="${state.settings.activeNetworkProbe ? 'true' : 'false'}"><i></i></button></label>
          <label class="monitor-field"><span>Compact mode</span><button class="monitor-switch ${state.settings.compact ? 'on' : ''}" data-monitor-toggle="compact" role="switch" aria-checked="${state.settings.compact ? 'true' : 'false'}"><i></i></button></label>
          <label class="monitor-field"><span>Theme</span><select class="monitor-select" data-monitor-select="theme"><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
          <label class="monitor-field"><span>Sample interval</span><input class="monitor-range" data-monitor-range="sampleInterval" type="range" min="1000" max="15000" step="500" value="${state.settings.sampleInterval}" /></label>
          <label class="monitor-field"><span>Probe interval</span><input class="monitor-range" data-monitor-range="probeInterval" type="range" min="5000" max="60000" step="1000" value="${state.settings.probeInterval}" /></label>
          <div class="monitor-settings-separator"></div>
          ${[['showSystem', 'System section'], ['showRuntime', 'Runtime section'], ['showNetwork', 'Network section'], ['showPage', 'Page section'], ['showStorage', 'Storage section'], ['showErrors', 'Errors section']].map(([k, l]) => `
            <label class="monitor-field"><span>${esc(l)}</span><button class="monitor-switch ${state.settings[k] ? 'on' : ''}" data-monitor-toggle="${esc(k)}" role="switch" aria-checked="${state.settings[k] ? 'true' : 'false'}"><i></i></button></label>
          `).join('')}
          <div class="monitor-mini"><span data-metric="pos-x">X 0</span><span data-metric="pos-y">Y 0</span><span data-metric="pos-w">W 0</span><span data-metric="pos-h">H 0</span></div>
          <div class="monitor-settings-actions">
            <button class="monitor-ghost" data-monitor-action="reset">Reset</button>
            <button class="monitor-ghost" data-monitor-action="sample">Sample</button>
          </div>
        </div>
        <div class="monitor-resize-handle" data-monitor-resize="se" title="Resize"></div>
      </div>
    `;
  };

  const cachePanelRefs = panel => {
    if (!panel) { state.panelRefs = null; return; }
    const cpuChart = panel.querySelector('[data-chart="cpu"]');
    const ramChart = panel.querySelector('[data-chart="ram"]');
    const fpsChart = panel.querySelector('[data-chart="fps"]');
    const netChart = panel.querySelector('[data-chart="net"]');
    const errorChart = panel.querySelector('[data-chart="errors"]');
    state.panelRefs = {
      systemSource: panel.querySelector('[data-metric="system-source"]'),
      cpuValue: panel.querySelector('[data-metric="cpu-value"]'),
      cpuBar: panel.querySelector('[data-metric="cpu-bar"]'),
      cpuSource: panel.querySelector('[data-metric="cpu-source"]'),
      cpuCores: panel.querySelector('[data-metric="cpu-cores"]'),
      cpuPolyline: cpuChart?.querySelector('.cpu-line') || null,
      ramValue: panel.querySelector('[data-metric="ram-value"]'),
      ramBar: panel.querySelector('[data-metric="ram-bar"]'),
      ramLabel: panel.querySelector('[data-metric="ram-label"]'),
      ramSource: panel.querySelector('[data-metric="ram-source"]'),
      ramDetail: panel.querySelector('[data-metric="ram-detail"]'),
      ramPolyline: ramChart?.querySelector('.ram-line') || null,
      cores: panel.querySelector('[data-metric="cores"]'),
      deviceMemory: panel.querySelector('[data-metric="device-memory"]'),
      gpuStatus: panel.querySelector('[data-metric="gpu-status"]'),
      fps: panel.querySelector('[data-metric="fps"]'),
      frameTime: panel.querySelector('[data-metric="frame-time"]'),
      loopLag: panel.querySelector('[data-metric="loop-lag"]'),
      longTaskStatus: panel.querySelector('[data-metric="long-task-status"]'),
      longTasks: panel.querySelector('[data-metric="long-tasks"]'),
      worstTask: panel.querySelector('[data-metric="worst-task"]'),
      dropped: panel.querySelector('[data-metric="dropped"]'),
      jank: panel.querySelector('[data-metric="jank"]'),
      fpsPolyline: fpsChart?.querySelector('.fps-line') || null,
      domCount: panel.querySelector('[data-metric="dom-count"]'),
      cls: panel.querySelector('[data-metric="cls"]'),
      inp: panel.querySelector('[data-metric="inp"]'),
      visibility: panel.querySelector('[data-metric="visibility"]'),
      netOnline: panel.querySelector('[data-metric="net-online"]'),
      netType: panel.querySelector('[data-metric="net-type"]'),
      netDownlink: panel.querySelector('[data-metric="net-downlink"]'),
      netRtt: panel.querySelector('[data-metric="net-rtt"]'),
      netPing: panel.querySelector('[data-metric="net-ping"]'),
      netJitter: panel.querySelector('[data-metric="net-jitter"]'),
      netSave: panel.querySelector('[data-metric="net-save"]'),
      netQualityBar: panel.querySelector('[data-metric="net-quality-bar"]'),
      netStabilityBar: panel.querySelector('[data-metric="net-stability-bar"]'),
      netPolyline: netChart?.querySelector('.net-line') || null,
      pageLoad: panel.querySelector('[data-metric="page-load"]'),
      pageTtfb: panel.querySelector('[data-metric="page-ttfb"]'),
      pageDom: panel.querySelector('[data-metric="page-dom"]'),
      pageFcp: panel.querySelector('[data-metric="page-fcp"]'),
      pageLcp: panel.querySelector('[data-metric="page-lcp"]'),
      pageBytes: panel.querySelector('[data-metric="page-bytes"]'),
      pageScripts: panel.querySelector('[data-metric="page-scripts"]'),
      pageImages: panel.querySelector('[data-metric="page-images"]'),
      pageCss: panel.querySelector('[data-metric="page-css"]'),
      pageFonts: panel.querySelector('[data-metric="page-fonts"]'),
      pageResourceCount: panel.querySelector('[data-metric="page-resource-count"]'),
      screen: panel.querySelector('[data-metric="screen"]'),
      viewport: panel.querySelector('[data-metric="viewport"]'),
      dpr: panel.querySelector('[data-metric="dpr"]'),
      storageSource: panel.querySelector('[data-metric="storage-source"]'),
      storageValue: panel.querySelector('[data-metric="storage-value"]'),
      storageBar: panel.querySelector('[data-metric="storage-bar"]'),
      storageUsage: panel.querySelector('[data-metric="storage-usage"]'),
      storageQuota: panel.querySelector('[data-metric="storage-quota"]'),
      errorState: panel.querySelector('[data-metric="error-state"]'),
      errorJs: panel.querySelector('[data-metric="error-js"]'),
      errorPromise: panel.querySelector('[data-metric="error-promise"]'),
      errorWarning: panel.querySelector('[data-metric="error-warning"]'),
      lastError: panel.querySelector('[data-metric="last-error"]'),
      errorPolyline: errorChart?.querySelector('.error-line') || null,
      browser: panel.querySelector('[data-metric="browser"]'),
      platform: panel.querySelector('[data-metric="platform"]'),
      lastSample: panel.querySelector('[data-metric="last-sample"]'),
      posX: panel.querySelector('[data-metric="pos-x"]'),
      posY: panel.querySelector('[data-metric="pos-y"]'),
      posW: panel.querySelector('[data-metric="pos-w"]'),
      posH: panel.querySelector('[data-metric="pos-h"]')
    };
  };

  const updatePanelMetrics = panel => {
    if (!panel || !state.panelRefs || !state.settings) return;
    const refs = state.panelRefs;
    const snap = state.lastSnapshot || currentSnapshot();

    if (refs.systemSource) refs.systemSource.textContent = `RAM:${snap.memory.source} CPU:${snap.cpuSource}`;
    if (refs.cpuValue) refs.cpuValue.textContent = `${round(snap.cpu, 1)}%`;
    if (refs.cpuBar) refs.cpuBar.style.width = `${clamp(snap.cpu, 0, 100)}%`;
    if (refs.cpuSource) refs.cpuSource.textContent = `source: ${snap.cpuSource}`;
    if (refs.cpuCores) refs.cpuCores.textContent = `${snap.browser.cores || 'n/a'} cores`;
    if (refs.cpuPolyline) updateChartPolyline(refs.cpuPolyline, state.cpuHistory);
    if (refs.ramValue) refs.ramValue.textContent = `${round(snap.memory.pct, 1)}%`;
    if (refs.ramBar) refs.ramBar.style.width = `${clamp(snap.memory.pct, 0, 100)}%`;
    if (refs.ramLabel) refs.ramLabel.textContent = snap.memory.label;
    if (refs.ramSource) refs.ramSource.textContent = `source: ${snap.memory.source}`;
    if (refs.ramDetail) refs.ramDetail.textContent = snap.memory.detail || '-';
    if (refs.ramPolyline) updateChartPolyline(refs.ramPolyline, state.ramHistory);
    if (refs.cores) refs.cores.textContent = String(snap.browser.cores || 0);
    if (refs.deviceMemory) refs.deviceMemory.textContent = snap.browser.deviceMemory ? `${snap.browser.deviceMemory} GB` : 'n/a';
    if (refs.gpuStatus) refs.gpuStatus.textContent = snap.gpu?.available ? 'WebGL' : 'n/a';
    if (refs.fps) refs.fps.textContent = round(snap.fps, 1);
    if (refs.frameTime) refs.frameTime.textContent = `${round(snap.frameTime, 1)} ms`;
    if (refs.loopLag) refs.loopLag.textContent = `${round(snap.eventLoopLag, 1)} ms`;
    const jank = snap.frameTime > 16.67 ? clamp(((snap.frameTime - 16.67) / 16.67) * 100, 0, 100) : 0;
    if (refs.longTaskStatus) refs.longTaskStatus.textContent = snap.longTasks > 0 || jank > 25 ? 'DEGRADED' : 'OK';
    if (refs.longTasks) refs.longTasks.textContent = `long tasks: ${snap.longTasks}`;
    if (refs.worstTask) refs.worstTask.textContent = `worst: ${round(snap.worstLongTask, 1)} ms`;
    if (refs.dropped) refs.dropped.textContent = `dropped: ${snap.frameDropped}`;
    if (refs.jank) refs.jank.textContent = `jank: ${round(jank, 1)}%`;
    if (refs.fpsPolyline) updateChartPolyline(refs.fpsPolyline, state.fpsHistory, 320, 88, 0, 120);
    if (refs.domCount) refs.domCount.textContent = String(snap.dom.elements);
    if (refs.cls) refs.cls.textContent = round(snap.cls, 3);
    if (refs.inp) refs.inp.textContent = `${round(snap.inp, 1)} ms`;
    if (refs.visibility) refs.visibility.textContent = `${snap.visibility}${snap.focused ? ' • focus' : ''}`;
    if (refs.netOnline) refs.netOnline.textContent = snap.network.online ? 'online' : 'offline';
    if (refs.netType) refs.netType.textContent = snap.network.effectiveType;
    if (refs.netDownlink) refs.netDownlink.textContent = `downlink: ${snap.network.downlink ? `${round(snap.network.downlink, 2)} Mbps` : 'n/a'}`;
    if (refs.netRtt) refs.netRtt.textContent = `rtt: ${snap.network.rtt ? `${Math.round(snap.network.rtt)} ms` : 'n/a'}`;
    if (refs.netPing) refs.netPing.textContent = `ping: ${snap.network.ping != null ? `${round(snap.network.ping, 1)} ms` : 'n/a'}`;
    if (refs.netJitter) refs.netJitter.textContent = `jitter: ${snap.network.jitter != null ? `${round(snap.network.jitter, 1)} ms` : 'n/a'}`;
    if (refs.netSave) refs.netSave.textContent = `save-data: ${snap.network.saveData ? 'on' : 'off'}`;
    const pingQuality = snap.network.ping != null ? clamp(100 - snap.network.ping * 0.8, 0, 100) : snap.network.speedScore;
    const netQuality = clamp(pingQuality * 0.55 + snap.network.speedScore * 0.45, 0, 100);
    if (refs.netQualityBar) refs.netQualityBar.style.width = `${netQuality}%`;
    if (refs.netStabilityBar) refs.netStabilityBar.style.width = `${snap.network.stabilityScore}%`;
    if (refs.netPolyline) updateChartPolyline(refs.netPolyline, state.networkHistory);
    if (refs.pageResourceCount) refs.pageResourceCount.textContent = `${snap.resources.total} resources`;
    if (refs.pageLoad) refs.pageLoad.textContent = snap.navigation ? formatDuration(snap.navigation.load) : 'n/a';
    if (refs.pageTtfb) refs.pageTtfb.textContent = `TTFB: ${snap.navigation ? formatDuration(snap.navigation.ttfb) : 'n/a'}`;
    if (refs.pageDom) refs.pageDom.textContent = `DOM: ${snap.navigation ? formatDuration(snap.navigation.domContentLoaded) : 'n/a'}`;
    if (refs.pageFcp) refs.pageFcp.textContent = `FCP: ${snap.fcp ? formatDuration(snap.fcp) : 'n/a'}`;
    if (refs.pageLcp) refs.pageLcp.textContent = `LCP: ${snap.lcp ? formatDuration(snap.lcp) : 'n/a'}`;
    if (refs.pageBytes) refs.pageBytes.textContent = formatBytes(snap.resources.totalBytes);
    if (refs.pageScripts) refs.pageScripts.textContent = `JS: ${snap.resources.scripts}`;
    if (refs.pageImages) refs.pageImages.textContent = `IMG: ${snap.resources.images}`;
    if (refs.pageCss) refs.pageCss.textContent = `CSS: ${snap.resources.styles}`;
    if (refs.pageFonts) refs.pageFonts.textContent = `FONT: ${snap.resources.fonts}`;
    if (refs.screen) refs.screen.textContent = `${snap.display.screenW}×${snap.display.screenH}`;
    if (refs.viewport) refs.viewport.textContent = `${snap.display.viewportW}×${snap.display.viewportH}`;
    if (refs.dpr) refs.dpr.textContent = round(snap.display.dpr, 2);
    if (refs.storageSource) refs.storageSource.textContent = snap.storage.source;
    if (refs.storageValue) refs.storageValue.textContent = snap.storage.quota ? `${round(snap.storage.pct, 2)}%` : 'n/a';
    if (refs.storageBar) refs.storageBar.style.width = `${clamp(snap.storage.pct, 0, 100)}%`;
    if (refs.storageUsage) refs.storageUsage.textContent = `used: ${snap.storage.quota ? formatBytes(snap.storage.usage) : 'n/a'}`;
    if (refs.storageQuota) refs.storageQuota.textContent = `quota: ${snap.storage.quota ? formatBytes(snap.storage.quota) : 'n/a'}`;
    const errorTotal = snap.errors.js + snap.errors.promise + snap.errors.warnings;
    if (refs.errorState) refs.errorState.textContent = errorTotal ? `${errorTotal} recorded` : 'clean';
    if (refs.errorJs) refs.errorJs.textContent = String(snap.errors.js);
    if (refs.errorPromise) refs.errorPromise.textContent = String(snap.errors.promise);
    if (refs.errorWarning) refs.errorWarning.textContent = String(snap.errors.warnings);
    if (refs.lastError) refs.lastError.textContent = snap.errors.last ? String(snap.errors.last).slice(0, 180) : 'No recorded errors.';
    if (refs.errorPolyline) updateChartPolyline(refs.errorPolyline, state.errorHistory, 320, 88, 0, Math.max(5, ...state.errorHistory));
    if (refs.browser) refs.browser.textContent = snap.browser.browser;
    if (refs.platform) refs.platform.textContent = snap.browser.platform;
    if (refs.lastSample) refs.lastSample.textContent = snap.label;
    if (refs.posX) refs.posX.textContent = `X ${Math.round(state.settings.panelX)}`;
    if (refs.posY) refs.posY.textContent = `Y ${Math.round(state.settings.panelY)}`;
    if (refs.posW) refs.posW.textContent = `W ${Math.round(state.settings.panelW)}`;
    if (refs.posH) refs.posH.textContent = `H ${Math.round(state.settings.panelH)}`;
  };

  const getPanel = () => state.root?.querySelector('[data-monitor-shell]') || null;
  const updatePanel = () => { const p = getPanel(); if (p) updatePanelMetrics(p); };

  const rebuildPanel = () => {
    if (!state.root || !state.settings || !state.settings.enabled) return;
    const existing = getPanel();
    if (existing) { removePanelListeners(existing); existing.remove(); }
    cachePanelRefs(null);
    const temp = document.createElement('div');
    temp.innerHTML = createPanelHTML();
    const panel = temp.firstElementChild;
    if (!panel) return;
    state.root.appendChild(panel);
    bindPanel(panel);
    cachePanelRefs(panel);
    applyPanelSettings(panel);
    updatePanel();
  };

  const ensureRoot = () => {
    if (state.root && document.body.contains(state.root)) return state.root;
    let root = document.getElementById('monitor-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'monitor-root';
      root.className = 'monitor-root';
      root.setAttribute('data-pkg', PKG);
      document.body.appendChild(root);
    }
    state.root = root;
    return root;
  };

  const ensurePanel = () => {
    if (!state.settings || !state.settings.enabled) return null;
    const root = ensureRoot();
    let panel = root.querySelector('[data-monitor-shell]');
    if (!panel) {
      const temp = document.createElement('div');
      temp.innerHTML = createPanelHTML();
      panel = temp.firstElementChild;
      if (!panel) return null;
      root.appendChild(panel);
      bindPanel(panel);
      cachePanelRefs(panel);
    }
    applyPanelSettings(panel);
    updatePanel();
    return panel;
  };

  const applyPanelSettings = panel => {
    if (!panel || !state.settings) return;
    const maxW = Math.max(320, window.innerWidth - 16);
    const maxH = Math.max(300, window.innerHeight - 16);
    panel.style.width = `${clamp(state.settings.panelW, 320, maxW)}px`;
    panel.style.height = `${clamp(state.settings.panelH, 300, maxH)}px`;
    panel.style.display = state.settings.enabled ? 'flex' : 'none';
    panel.style.transform = '';
    clampPanelPosition(panel);
    panel.classList.toggle('theme-light', state.settings.theme === 'light');
    panel.classList.toggle('theme-dark', state.settings.theme === 'dark');
    panel.classList.toggle('is-compact', state.settings.compact);
    const settingsEl = panel.querySelector('[data-monitor-settings]');
    if (settingsEl) {
      settingsEl.classList.toggle('open', state.settings.showSettings);
      settingsEl.setAttribute('aria-hidden', String(!state.settings.showSettings));
      if (!state.settings.showSettings) blurIfInside(settingsEl);
    }
  };

  const handleResize = () => {
    if (!state.settings) return;
    if (state.resizeTimer) clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      const panel = getPanel();
      if (panel) {
        state.settings.panelW = clamp(state.settings.panelW, 320, Math.max(320, window.innerWidth - 16));
        state.settings.panelH = clamp(state.settings.panelH, 300, Math.max(300, window.innerHeight - 16));
        applyPanelSettings(panel);
        updatePanel();
      }
      saveSettings();
      state.resizeTimer = null;
    }, RESIZE_DEBOUNCE);
  };

  const isInteractiveTarget = t => Boolean(t?.closest?.('button,select,input,textarea,option,[role="switch"],[contenteditable="true"],[data-monitor-action],[data-monitor-toggle],[data-monitor-select],[data-monitor-range]'));

  const scheduleDragFrame = () => { if (!state.dragFrame) state.dragFrame = requestAnimationFrame(applyDragUpdate); };
  const applyDragUpdate = () => {
    if (!state.dragging) { state.dragFrame = 0; return; }
    const panel = getPanel();
    if (!panel) { state.dragFrame = 0; return; }
    const e = state.dragEvent;
    state.dragEvent = null;
    if (!e) { state.dragFrame = 0; scheduleDragFrame(); return; }
    const newX = clamp(state.dragStartLeft + (e.clientX - state.dragStartClientX), 0, getMaxX(panel));
    const newY = clamp(state.dragStartTop + (e.clientY - state.dragStartClientY), 0, getMaxY(panel));
    state.dragCurrentLeft = newX;
    state.dragCurrentTop = newY;
    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
    state.dragFrame = 0;
    if (state.dragEvent) scheduleDragFrame();
  };
  const beginDrag = (event, panel, handle) => {
    if (!panel || !handle || state.dragging || isInteractiveTarget(event.target)) return;
    const rect = panel.getBoundingClientRect();
    const left = Number.parseFloat(panel.style.left);
    const top = Number.parseFloat(panel.style.top);
    state.dragging = true;
    state.dragId = event.pointerId;
    state.dragPointerId = event.pointerId;
    state.dragStartClientX = event.clientX;
    state.dragStartClientY = event.clientY;
    state.dragStartLeft = Number.isFinite(left) ? left : rect.left;
    state.dragStartTop = Number.isFinite(top) ? top : rect.top;
    state.dragCurrentLeft = state.dragStartLeft;
    state.dragCurrentTop = state.dragStartTop;
    state.dragHandle = handle;
    state.dragEvent = event;
    panel.classList.add('is-dragging');
    try { handle.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
    scheduleDragFrame();
  };
  const moveDrag = event => {
    if (!state.dragging || state.dragId !== event.pointerId) return;
    state.dragEvent = event;
    scheduleDragFrame();
  };
  const endDrag = (event, handle) => {
    if (state.dragPointerId !== event.pointerId) return;
    state.dragging = false;
    state.dragId = null;
    state.dragPointerId = null;
    state.dragEvent = null;
    state.dragHandle = null;
    if (state.dragFrame) { cancelAnimationFrame(state.dragFrame); state.dragFrame = 0; }
    const panel = getPanel();
    if (panel) {
      panel.classList.remove('is-dragging');
      panel.style.transform = '';
      panel.style.left = `${state.dragCurrentLeft}px`;
      panel.style.top = `${state.dragCurrentTop}px`;
      if (state.settings) {
        state.settings.panelX = state.dragCurrentLeft;
        state.settings.panelY = state.dragCurrentTop;
        clampPanelPosition(panel);
      }
    }
    if (handle?.releasePointerCapture) { try { handle.releasePointerCapture(event.pointerId); } catch {} }
    saveSettings();
  };
  const cancelDrag = handle => {
    if (!state.dragging) return;
    const pid = state.dragPointerId;
    state.dragging = false;
    state.dragId = null;
    state.dragPointerId = null;
    state.dragEvent = null;
    state.dragHandle = null;
    if (state.dragFrame) { cancelAnimationFrame(state.dragFrame); state.dragFrame = 0; }
    const panel = getPanel();
    if (panel) {
      panel.classList.remove('is-dragging');
      panel.style.transform = '';
      if (state.settings) {
        panel.style.left = `${state.settings.panelX}px`;
        panel.style.top = `${state.settings.panelY}px`;
      }
    }
    if (handle?.releasePointerCapture && pid != null) { try { handle.releasePointerCapture(pid); } catch {} }
  };

  const scheduleResizeFrame = () => { if (!state.resizeFrame) state.resizeFrame = requestAnimationFrame(applyResizeUpdate); };
  const applyResizeUpdate = () => {
    if (!state.resizing) { state.resizeFrame = 0; return; }
    const panel = getPanel();
    if (!panel) { state.resizeFrame = 0; return; }
    const e = state.resizeEvent;
    state.resizeEvent = null;
    if (!e) { state.resizeFrame = 0; scheduleResizeFrame(); return; }
    const newW = clamp(state.resizeStartW + (e.clientX - state.resizeStartX), 320, Math.max(320, window.innerWidth - 10));
    const newH = clamp(state.resizeStartH + (e.clientY - state.resizeStartY), 300, Math.max(300, window.innerHeight - 10));
    panel.style.width = `${newW}px`;
    panel.style.height = `${newH}px`;
    if (state.settings) { state.settings.panelW = newW; state.settings.panelH = newH; }
    state.resizeFrame = 0;
    if (state.resizeEvent) scheduleResizeFrame();
  };
  const beginResize = (event, panel, handle) => {
    if (!panel || !handle || state.resizing) return;
    state.resizing = true;
    state.resizeId = event.pointerId;
    state.resizePointerId = event.pointerId;
    state.resizeStartX = event.clientX;
    state.resizeStartY = event.clientY;
    state.resizeStartW = parseFloat(panel.style.width) || panel.offsetWidth;
    state.resizeStartH = parseFloat(panel.style.height) || panel.offsetHeight;
    state.resizeHandle = handle;
    state.resizeEvent = event;
    panel.classList.add('is-resizing');
    try { handle.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
    scheduleResizeFrame();
  };
  const moveResize = event => {
    if (!state.resizing || state.resizeId !== event.pointerId) return;
    state.resizeEvent = event;
    scheduleResizeFrame();
  };
  const endResize = (event, handle) => {
    if (state.resizePointerId !== event.pointerId) return;
    state.resizing = false;
    state.resizeId = null;
    state.resizePointerId = null;
    state.resizeEvent = null;
    state.resizeHandle = null;
    if (state.resizeFrame) { cancelAnimationFrame(state.resizeFrame); state.resizeFrame = 0; }
    const panel = getPanel();
    if (panel) { panel.classList.remove('is-resizing'); clampPanelPosition(panel); }
    if (handle?.releasePointerCapture) { try { handle.releasePointerCapture(event.pointerId); } catch {} }
    saveSettings();
  };
  const cancelResize = handle => {
    if (!state.resizing) return;
    const pid = state.resizePointerId;
    state.resizing = false;
    state.resizeId = null;
    state.resizePointerId = null;
    state.resizeEvent = null;
    state.resizeHandle = null;
    if (state.resizeFrame) { cancelAnimationFrame(state.resizeFrame); state.resizeFrame = 0; }
    const panel = getPanel();
    if (panel && state.settings) {
      panel.classList.remove('is-resizing');
      panel.style.width = `${state.settings.panelW}px`;
      panel.style.height = `${state.settings.panelH}px`;
    }
    if (handle?.releasePointerCapture && pid != null) { try { handle.releasePointerCapture(pid); } catch {} }
  };

  const removePanelListeners = panel => {
    if (!panel) return;
    const dh = panel.querySelector('[data-monitor-drag]');
    if (dh) {
      for (const e of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
        const h = dh[`_${e}`];
        if (h) dh.removeEventListener(e, h);
        dh[`_${e}`] = null;
      }
    }
    const rh = panel.querySelector('[data-monitor-resize]');
    if (rh) {
      for (const e of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
        const h = rh[`_${e}`];
        if (h) rh.removeEventListener(e, h);
        rh[`_${e}`] = null;
      }
    }
    for (const b of panel.querySelectorAll('[data-monitor-action]')) {
      if (b._clickAction) b.removeEventListener('click', b._clickAction);
      b._clickAction = null;
    }
    for (const b of panel.querySelectorAll('[data-monitor-toggle]')) {
      if (b._clickToggle) b.removeEventListener('click', b._clickToggle);
      b._clickToggle = null;
    }
    for (const s of panel.querySelectorAll('[data-monitor-select]')) {
      if (s._changeSelect) s.removeEventListener('change', s._changeSelect);
      s._changeSelect = null;
    }
    for (const r of panel.querySelectorAll('[data-monitor-range]')) {
      if (r._inputRange) r.removeEventListener('input', r._inputRange);
      r._inputRange = null;
    }
  };

  const bindPanel = panel => {
    if (!panel) return;
    const dh = panel.querySelector('[data-monitor-drag]');
    if (dh) {
      dh._pointerdown = e => beginDrag(e, panel, dh);
      dh._pointermove = e => moveDrag(e);
      dh._pointerup = e => endDrag(e, dh);
      dh._pointercancel = e => endDrag(e, dh);
      dh._lostpointercapture = () => cancelDrag(dh);
      dh.addEventListener('pointerdown', dh._pointerdown);
      dh.addEventListener('pointermove', dh._pointermove);
      dh.addEventListener('pointerup', dh._pointerup);
      dh.addEventListener('pointercancel', dh._pointercancel);
      dh.addEventListener('lostpointercapture', dh._lostpointercapture);
    }
    const rh = panel.querySelector('[data-monitor-resize]');
    if (rh) {
      rh._pointerdown = e => beginResize(e, panel, rh);
      rh._pointermove = e => moveResize(e);
      rh._pointerup = e => endResize(e, rh);
      rh._pointercancel = e => endResize(e, rh);
      rh._lostpointercapture = () => cancelResize(rh);
      rh.addEventListener('pointerdown', rh._pointerdown);
      rh.addEventListener('pointermove', rh._pointermove);
      rh.addEventListener('pointerup', rh._pointerup);
      rh.addEventListener('pointercancel', rh._pointercancel);
      rh.addEventListener('lostpointercapture', rh._lostpointercapture);
    }
    for (const b of panel.querySelectorAll('[data-monitor-action]')) {
      const handler = () => {
        const action = b.getAttribute('data-monitor-action');
        if (action === 'off') setEnabled(false);
        else if (action === 'on') setEnabled(true);
        else if (action === 'toggle') setEnabled(!state.settings.enabled);
        else if (action === 'settings' || action === 'panel') showSettings(!state.settings.showSettings);
        else if (action === 'sample') sampleNow(true);
        else if (action === 'reset') resetSettings();
      };
      b._clickAction = handler;
      b.addEventListener('click', handler);
    }
    for (const b of panel.querySelectorAll('[data-monitor-toggle]')) {
      const handler = () => {
        const key = b.getAttribute('data-monitor-toggle');
        if (!key || !state.settings || typeof state.settings[key] !== 'boolean') return;
        state.settings[key] = !state.settings[key];
        b.classList.toggle('on', state.settings[key]);
        b.setAttribute('aria-checked', String(state.settings[key]));
        saveSettings();
        if (key === 'autoSample') scheduleSamples();
        else if (key === 'compact') { panel.classList.toggle('is-compact', state.settings.compact); applyPanelSettings(panel); }
        else if (/^show[A-Z]/.test(key)) rebuildPanel();
        else if (key === 'activeNetworkProbe' && state.settings.activeNetworkProbe) refreshAsyncMetrics(true);
      };
      b._clickToggle = handler;
      b.addEventListener('click', handler);
    }
    for (const s of panel.querySelectorAll('[data-monitor-select]')) {
      const handler = () => {
        const key = s.getAttribute('data-monitor-select');
        if (!key || !state.settings) return;
        if (key === 'theme' && (s.value === 'dark' || s.value === 'light')) state.settings.theme = s.value;
        saveSettings();
        if (key === 'theme') {
          panel.classList.toggle('theme-light', state.settings.theme === 'light');
          panel.classList.toggle('theme-dark', state.settings.theme === 'dark');
        }
      };
      s._changeSelect = handler;
      s.addEventListener('change', handler);
    }
    for (const r of panel.querySelectorAll('[data-monitor-range]')) {
      const handler = () => {
        const key = r.getAttribute('data-monitor-range');
        if (!state.settings || !key) return;
        if (key === 'sampleInterval') { state.settings.sampleInterval = clamp(Number(r.value), 1000, 15000); saveSettings(); scheduleSamples(); }
        if (key === 'probeInterval') { state.settings.probeInterval = clamp(Number(r.value), 5000, 60000); saveSettings(); }
      };
      r._inputRange = handler;
      r.addEventListener('input', handler);
    }
  };

  const sampleNow = async (forceAsync = false) => {
    if (!state.settings) return null;
    const now = performance.now();
    if (!state.expectedTick) state.expectedTick = now + state.settings.sampleInterval;
    const expected = state.expectedTick;
    const lag = now > expected ? now - expected : 0;
    state.expectedTick = now + state.settings.sampleInterval;
    const eventLoopLag = await sampleEventLoopLag();
    state.runtimeStats.eventLoopLag = Math.max(lag, eventLoopLag);
    const snapshot = currentSnapshot();
    state.lastSnapshot = snapshot;
    state.lastSampleAt = Date.now();
    pushHistory(state.cpuHistory, snapshot.cpu);
    pushHistory(state.ramHistory, snapshot.memory.pct);
    pushHistory(state.fpsHistory, snapshot.fps, 0, 120);
    pushHistory(state.lagHistory, snapshot.eventLoopLag, 0, 100);
    pushHistory(state.networkHistory, snapshot.network.stabilityScore);
    const errorTotal = snapshot.errors.js + snapshot.errors.promise + snapshot.errors.warnings;
    pushHistory(state.errorHistory, errorTotal, 0, Math.max(5, errorTotal), ERROR_HISTORY_MAX);
    state.lastPagePerformance = snapshot.navigation;
    updatePanel();
    if (forceAsync || !state.asyncTimer) refreshAsyncMetrics(Boolean(forceAsync)).catch(() => {});
    return snapshot;
  };

  const clearTimers = () => {
    if (state.sampleTimer) { clearInterval(state.sampleTimer); state.sampleTimer = null; }
    if (state.asyncTimer) { clearInterval(state.asyncTimer); state.asyncTimer = null; }
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  };

  const scheduleSamples = () => {
    if (state.sampleTimer) { clearInterval(state.sampleTimer); state.sampleTimer = null; }
    if (state.asyncTimer) { clearInterval(state.asyncTimer); state.asyncTimer = null; }
    if (!state.settings?.enabled || !state.settings.autoSample) return;
    state.sampleTimer = setInterval(() => {
      if (state.settings?.enabled && state.settings.autoSample) sampleNow(false).catch(() => {});
      else clearTimers();
    }, state.settings.sampleInterval);
    state.asyncTimer = setInterval(() => { refreshAsyncMetrics(false).catch(() => {}); }, 2000);
  };

  const setEnabled = enabled => {
    if (!state.settings) return;
    const next = Boolean(enabled);
    if (state.settings.enabled === next) {
      if (next) { ensurePanel(); scheduleSamples(); }
      return;
    }
    state.settings.enabled = next;
    if (next) {
      ensurePanel();
      startFrameMonitor();
      sampleNow(true).catch(() => {});
      scheduleSamples();
    } else {
      clearTimers();
      const p = getPanel();
      if (p) p.style.display = 'none';
    }
    saveSettings();
  };

  const resetSettings = () => {
    state.settings = { ...DEFAULTS };
    state.cpuHistory = []; state.ramHistory = []; state.fpsHistory = [];
    state.lagHistory = []; state.networkHistory = []; state.pingHistory = []; state.errorHistory = [];
    state.networkProbeSamples = [];
    state.lastSnapshot = null; state.lastSampleAt = 0; state.lastPagePerformance = null;
    state.expectedTick = 0;
    state.runtimeStats = { eventLoopLag: 0, longTasks: 0, worstLongTask: 0, totalLongTaskTime: 0, cls: 0, fcp: 0, lcp: 0, inp: 0 };
    state.errors = { js: 0, promise: 0, warnings: 0, last: null, history: [] };
    state.asyncMetrics = { systemMemory: null, systemCpu: null, storage: null, ping: null, pingJitter: null, pingMin: null, pingMax: null, battery: null, gpu: null, permissionSummary: null, serviceWorker: null, lastProbeAt: 0, lastStorageAt: 0 };
    saveSettings();
    if (state.settings.enabled) {
      ensureRoot();
      rebuildPanel();
      sampleNow(true).catch(() => {});
      scheduleSamples();
    } else {
      const p = getPanel();
      if (p) { removePanelListeners(p); p.remove(); }
      cachePanelRefs(null);
    }
  };

  const showSettings = open => {
    if (!state.settings) return;
    state.settings.showSettings = Boolean(open);
    saveSettings();
    if (!state.settings.enabled) setEnabled(true);
    const p = ensurePanel();
    if (!p) return;
    const s = p.querySelector('[data-monitor-settings]');
    if (!s) return;
    s.classList.toggle('open', state.settings.showSettings);
    s.setAttribute('aria-hidden', String(!state.settings.showSettings));
    if (!state.settings.showSettings) blurIfInside(s);
    else s.querySelector('[data-monitor-action="settings"]')?.focus();
  };

  const helpLines = () => [
    line(`${MANIFEST.name} ${VERSION}`, 'accent'),
    line(`${PKG} on | off | toggle`, 'output'),
    line(`${PKG} panel | settings`, 'output'),
    line(`${PKG} status | sample | reset`, 'output'),
    line(`${PKG} help`, 'output'),
    line('Drag header to move. Resize from lower-right corner.', 'muted')
  ];

  const statusLines = () => {
    if (!state.settings) return [line('Monitor not initialized.', 'danger')];
    const snap = state.lastSnapshot || currentSnapshot();
    return [
      line('Advanced monitor status', 'accent'),
      line(`enabled: ${state.settings.enabled}`),
      line(`theme: ${state.settings.theme}`),
      line(`auto sample: ${state.settings.autoSample}`),
      line(`sample interval: ${state.settings.sampleInterval} ms`),
      line(`network probe: ${state.settings.activeNetworkProbe}`),
      line(`CPU: ${round(snap.cpu, 1)}% [${snap.cpuSource}]`),
      line(`RAM: ${round(snap.memory.pct, 1)}% [${snap.memory.source}]`),
      line(`FPS: ${round(snap.fps, 1)}`),
      line(`event loop lag: ${round(snap.eventLoopLag, 1)} ms`),
      line(`network: ${snap.network.online ? 'online' : 'offline'}`),
      line(`ping: ${snap.network.ping != null ? `${round(snap.network.ping, 1)} ms` : 'n/a'}`),
      line(`resources: ${snap.resources.total}`),
      line(`DOM elements: ${snap.dom.elements}`),
      line(`errors: ${snap.errors.js + snap.errors.promise + snap.errors.warnings}`)
    ];
  };

  const runCommand = async ({ args = [] } = {}) => {
    if (!state.settings) return [line('Not initialized.', 'danger')];
    const sub = String(args[0] ?? '').trim().toLowerCase();
    switch (sub) {
      case '': case 'help': return helpLines();
      case 'on': setEnabled(true); return [line('Panel enabled.', 'accent')];
      case 'off': setEnabled(false); return [line('Panel hidden.', 'accent')];
      case 'toggle':
        setEnabled(!state.settings.enabled);
        return [line(state.settings.enabled ? 'Panel enabled.' : 'Panel hidden.', 'accent')];
      case 'panel': case 'settings': showSettings(true); return [line('Settings opened.', 'accent')];
      case 'status': return statusLines();
      case 'sample':
        setEnabled(true);
        await sampleNow(true);
        return [line('Sample captured.', 'accent')];
      case 'reset': resetSettings(); return [line('Settings reset.', 'accent')];
      default:
        return [line(`${PKG}: unknown command "${sub}"`, 'danger'), line(`Use "${MANIFEST.help}" for available commands.`, 'muted')];
    }
  };

  const validateApi = api => {
    if (!api || typeof api !== 'object') throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    const req = ['registerCommand', 'unregisterCommand', 'line', 'spacer'];
    for (const m of req) if (typeof api[m] !== 'function') throw new Error(`PACKAGE_BRIDGE_${m.toUpperCase()}_UNAVAILABLE`);
  };

  const injectStyles = () => {
    const existing = document.getElementById('monitor-style');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 'monitor-style';
    style.setAttribute('data-pkg', PKG);
    style.textContent = `
      .monitor-root{
        position:fixed;
        inset:0;
        z-index:2147483647;
        pointer-events:none;
        font-family:'JetBrains Mono','Fira Code','SF Mono',Consolas,'Courier New',monospace;
        -webkit-font-smoothing:antialiased;
        -moz-osx-font-smoothing:grayscale
      }
      .monitor-shell{
        position:absolute;
        left:24px;
        top:24px;
        width:440px;
        height:660px;
        pointer-events:auto;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        user-select:none;
        touch-action:manipulation;
        contain:layout style paint;
        box-sizing:border-box;
        color:#e6edf3;
        background:#05070a;
        border:1px solid rgba(255,46,77,.25);
        border-radius:6px;
        box-shadow:
          0 0 0 1px rgba(0,0,0,.9),
          0 0 24px rgba(255,46,77,.08),
          0 20px 60px rgba(0,0,0,.7);
        transition:none;
        font-size:11px;
        line-height:1.4
      }
      .monitor-shell *,
      .monitor-shell *::before,
      .monitor-shell *::after{box-sizing:border-box}
      .monitor-shell.is-dragging,
      .monitor-shell.is-resizing{will-change:left,top,width,height}
      .monitor-shell.theme-light{
        background:#f5f5f7;
        color:#0d1117;
        border-color:rgba(255,46,77,.35);
        box-shadow:
          0 0 0 1px rgba(0,0,0,.06),
          0 20px 50px rgba(0,0,0,.18)
      }
      .monitor-shell.is-compact{
        width:360px!important;
        height:440px!important
      }
      .monitor-scanlines{
        position:absolute;
        inset:0;
        pointer-events:none;
        z-index:1;
        background:
          repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0) 0px,
            rgba(255,255,255,0) 2px,
            rgba(255,255,255,.012) 2px,
            rgba(255,255,255,.012) 3px
          );
        opacity:.9;
        mix-blend-mode:overlay
      }
      .monitor-header{
        position:relative;
        z-index:2;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:9px 10px;
        cursor:grab;
        background:linear-gradient(180deg,rgba(255,46,77,.06),rgba(255,46,77,.02));
        border-bottom:1px solid rgba(255,46,77,.18);
        touch-action:none;
        flex:0 0 auto
      }
      .monitor-header:active{cursor:grabbing}
      .theme-light .monitor-header{
        background:linear-gradient(180deg,rgba(255,46,77,.05),rgba(255,46,77,.01));
        border-bottom-color:rgba(255,46,77,.25)
      }
      .monitor-title{
        display:flex;
        align-items:center;
        gap:9px;
        min-width:0
      }
      .monitor-status-dot{
        width:8px;
        height:8px;
        border-radius:999px;
        background:#ff2e4d;
        box-shadow:0 0 8px rgba(255,46,77,.75);
        animation:monitor-pulse 2s ease-in-out infinite;
        flex:0 0 auto
      }
      @keyframes monitor-pulse{
        0%,100%{opacity:1;box-shadow:0 0 8px rgba(255,46,77,.75)}
        50%{opacity:.55;box-shadow:0 0 3px rgba(255,46,77,.4)}
      }
      .monitor-name{
        font-size:11px;
        font-weight:700;
        line-height:1.15;
        letter-spacing:.02em;
        color:#e6edf3;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis
      }
      .theme-light .monitor-name{color:#0d1117}
      .prompt-prefix{
        color:#ff2e4d;
        font-weight:700
      }
      .monitor-sub{
        font-size:8px;
        color:#6e7681;
        margin-top:2px;
        letter-spacing:.12em;
        text-transform:uppercase
      }
      .monitor-actions{
        display:flex;
        gap:4px;
        flex:0 0 auto
      }
      .monitor-btn,
      .monitor-ghost,
      .monitor-switch,
      .monitor-select{
        border:0;
        outline:0;
        font:inherit
      }
      .monitor-btn{
        width:26px;
        height:26px;
        border-radius:4px;
        display:grid;
        place-items:center;
        cursor:pointer;
        color:#c9d1d9;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.07);
        font-size:12px;
        transition:transform .12s ease,background .12s ease,border-color .12s ease;
        padding:0
      }
      .theme-light .monitor-btn{
        color:#24292f;
        background:rgba(0,0,0,.03);
        border-color:rgba(0,0,0,.09)
      }
      .monitor-btn:hover{
        transform:translateY(-1px);
        background:rgba(255,46,77,.12);
        border-color:rgba(255,46,77,.35);
        color:#ff6b85
      }
      .theme-light .monitor-btn:hover{
        background:rgba(255,46,77,.1);
        color:#c8192f
      }
      .monitor-btn:focus-visible,
      .monitor-ghost:focus-visible,
      .monitor-switch:focus-visible,
      .monitor-select:focus-visible{
        outline:1px solid rgba(255,46,77,.75);
        outline-offset:2px
      }
      .monitor-btn.danger{
        color:#ff2e4d;
        border-color:rgba(255,46,77,.35)
      }
      .monitor-btn.danger:hover{
        background:rgba(255,46,77,.18);
        color:#ffb3c0
      }
      .monitor-body{
        position:relative;
        z-index:2;
        flex:1;
        overflow-y:auto;
        overflow-x:hidden;
        padding:8px;
        overscroll-behavior:contain
      }
      .monitor-section{margin-bottom:8px}
      .monitor-section:last-child{margin-bottom:0}
      .monitor-section-title{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        padding:2px 4px 5px;
        font-size:9px;
        letter-spacing:.14em;
        text-transform:uppercase;
        color:#8b949e;
        border-bottom:1px solid rgba(255,46,77,.15);
        margin-bottom:7px
      }
      .theme-light .monitor-section-title{
        color:#57606a;
        border-bottom-color:rgba(255,46,77,.2)
      }
      .monitor-section-title span{
        display:flex;
        align-items:center;
        gap:6px;
        color:#c9d1d9;
        font-weight:600
      }
      .theme-light .monitor-section-title span{color:#0d1117}
      .monitor-section-title small{
        font-size:8px;
        letter-spacing:.04em;
        opacity:.8;
        text-transform:none;
        color:#6e7681
      }
      .dot-red{
        display:inline-block;
        width:5px;
        height:5px;
        border-radius:1px;
        background:#ff2e4d;
        box-shadow:0 0 5px rgba(255,46,77,.7);
        transform:rotate(45deg);
        flex:0 0 auto
      }
      .monitor-grid-2{
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        gap:6px
      }
      .monitor-grid-3{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:6px
      }
      .monitor-card{
        border-radius:4px;
        padding:8px;
        background:rgba(255,255,255,.015);
        border:1px solid rgba(255,255,255,.055);
        position:relative
      }
      .monitor-card::before{
        content:'';
        position:absolute;
        top:-1px;
        left:8px;
        right:8px;
        height:1px;
        background:linear-gradient(90deg,transparent,rgba(255,46,77,.35),transparent);
        opacity:.7
      }
      .theme-light .monitor-card{
        background:rgba(0,0,0,.02);
        border-color:rgba(0,0,0,.07)
      }
      .theme-light .monitor-card::before{
        background:linear-gradient(90deg,transparent,rgba(255,46,77,.4),transparent)
      }
      .compact-card{
        display:flex;
        flex-direction:column;
        gap:3px;
        min-height:50px
      }
      .metric-label{
        font-size:8px;
        color:#6e7681;
        text-transform:uppercase;
        letter-spacing:.1em
      }
      .compact-card strong{
        font-size:15px;
        font-weight:700;
        color:#e6edf3;
        letter-spacing:-.02em
      }
      .theme-light .compact-card strong{color:#0d1117}
      .monitor-card-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:7px;
        margin-bottom:6px;
        font-size:9px;
        letter-spacing:.1em;
        text-transform:uppercase;
        color:#8b949e
      }
      .monitor-card-head strong{
        font-size:11px;
        letter-spacing:0;
        text-transform:none;
        color:#e6edf3;
        font-weight:700
      }
      .theme-light .monitor-card-head strong{color:#0d1117}
      .monitor-bar{
        width:100%;
        height:5px;
        border-radius:0;
        overflow:hidden;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.04);
        position:relative
      }
      .theme-light .monitor-bar{
        background:rgba(0,0,0,.06);
        border-color:rgba(0,0,0,.05)
      }
      .monitor-bar-fill{
        height:100%;
        width:0;
        border-radius:0;
        background:linear-gradient(90deg,#ff2e4d,#ff6b85);
        box-shadow:0 0 6px rgba(255,46,77,.55);
        transition:width .18s linear;
        will-change:width
      }
      .monitor-bar-fill.ram{
        background:linear-gradient(90deg,#e01e37,#ff5566);
        box-shadow:0 0 6px rgba(224,30,55,.5)
      }
      .monitor-bar-fill.net{
        background:linear-gradient(90deg,#c9184a,#ff4d6d);
        box-shadow:0 0 6px rgba(201,24,74,.5)
      }
      .monitor-bar-fill.net2{
        background:linear-gradient(90deg,#a4133c,#ff758f);
        box-shadow:0 0 6px rgba(164,19,60,.5)
      }
      .monitor-bar-fill.storage{
        background:linear-gradient(90deg,#d90429,#ef233c);
        box-shadow:0 0 6px rgba(217,4,41,.5)
      }
      .monitor-bar-fill.cpu{
        background:linear-gradient(90deg,#ff2e4d,#ff8095);
        box-shadow:0 0 6px rgba(255,46,77,.6)
      }
      .monitor-meta{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:6px;
        margin:5px 0 3px;
        font-size:9px;
        color:#6e7681;
        flex-wrap:wrap;
        line-height:1.35
      }
      .monitor-meta.two{justify-content:flex-start}
      .monitor-meta.two span{
        padding:3px 6px;
        border-radius:3px;
        background:rgba(255,46,77,.06);
        border:1px solid rgba(255,46,77,.14);
        color:#c9d1d9;
        font-size:8px
      }
      .theme-light .monitor-meta.two span{
        background:rgba(255,46,77,.05);
        border-color:rgba(255,46,77,.18);
        color:#24292f
      }
      .monitor-bars{
        display:grid;
        gap:7px;
        margin-bottom:5px
      }
      .monitor-bars small{
        display:block;
        margin-bottom:3px;
        font-size:8px;
        color:#6e7681;
        letter-spacing:.08em;
        text-transform:uppercase
      }
      .monitor-chart{
        width:100%;
        height:60px;
        margin-top:5px;
        display:block;
        contain:strict
      }
      .monitor-chart .grid{
        fill:none;
        stroke:rgba(255,255,255,.06);
        stroke-width:1;
        stroke-dasharray:1 3;
        shape-rendering:crispEdges
      }
      .theme-light .monitor-chart .grid{stroke:rgba(0,0,0,.08)}
      .monitor-chart .grid.thin{opacity:.4}
      .monitor-chart .cpu-line,
      .monitor-chart .ram-line,
      .monitor-chart .fps-line,
      .monitor-chart .net-line,
      .monitor-chart .error-line{
        fill:none;
        stroke-width:1.6;
        stroke-linecap:round;
        stroke-linejoin:round;
        filter:drop-shadow(0 0 3px rgba(255,46,77,.55))
      }
      .monitor-chart .cpu-line{stroke:#ff2e4d}
      .monitor-chart .ram-line{stroke:#e01e37}
      .monitor-chart .fps-line{stroke:#ff6b85}
      .monitor-chart .net-line{stroke:#c9184a}
      .monitor-chart .error-line{stroke:#ff8095}
      .monitor-pill{
        display:flex;
        flex-direction:column;
        gap:2px;
        min-height:42px;
        padding:7px;
        border-radius:3px;
        background:rgba(255,255,255,.02);
        border:1px solid rgba(255,255,255,.05)
      }
      .theme-light .monitor-pill{
        background:rgba(0,0,0,.02);
        border-color:rgba(0,0,0,.06)
      }
      .monitor-pill span{
        font-size:7px;
        color:#6e7681;
        letter-spacing:.1em;
        text-transform:uppercase
      }
      .monitor-pill b{
        font-size:11px;
        color:#e6edf3;
        font-weight:700
      }
      .theme-light .monitor-pill b{color:#0d1117}
      .system-mini-grid{margin-top:6px}
      .monitor-last-error{
        padding:7px;
        border-radius:3px;
        background:rgba(255,46,77,.05);
        border-left:2px solid #ff2e4d;
        font-size:9px;
        line-height:1.45;
        color:#c9d1d9;
        word-break:break-word;
        font-family:inherit
      }
      .theme-light .monitor-last-error{
        background:rgba(255,46,77,.04);
        color:#24292f
      }
      .footer-meta{
        margin:0;
        padding-top:4px;
        border-top:1px solid rgba(255,255,255,.05)
      }
      .theme-light .footer-meta{border-top-color:rgba(0,0,0,.06)}
      .monitor-settings{
        position:absolute;
        right:8px;
        top:48px;
        width:min(260px,calc(100% - 16px));
        max-height:calc(100% - 60px);
        overflow-y:auto;
        overflow-x:hidden;
        padding:10px;
        border-radius:5px;
        border:1px solid rgba(255,46,77,.25);
        background:rgba(5,7,10,.99);
        box-shadow:0 0 24px rgba(255,46,77,.15),0 16px 40px rgba(0,0,0,.55);
        transform:translateX(6px) scale(.985);
        opacity:0;
        pointer-events:none;
        transition:opacity .14s ease,transform .14s ease;
        overscroll-behavior:contain;
        z-index:5
      }
      .theme-light .monitor-settings{
        background:rgba(250,250,250,.99);
        border-color:rgba(255,46,77,.3);
        box-shadow:0 0 18px rgba(255,46,77,.1),0 16px 34px rgba(0,0,0,.15)
      }
      .monitor-settings.open{
        opacity:1;
        pointer-events:auto;
        transform:translateX(0) scale(1)
      }
      .monitor-settings-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        margin-bottom:9px;
        font-size:10px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#ff2e4d;
        padding-bottom:6px;
        border-bottom:1px solid rgba(255,46,77,.15)
      }
      .monitor-field{
        display:grid;
        gap:5px;
        margin-bottom:8px;
        font-size:9px;
        color:#c9d1d9
      }
      .theme-light .monitor-field{color:#24292f}
      .monitor-field span{opacity:.85}
      .monitor-switch{
        width:48px;
        height:24px;
        border-radius:3px;
        background:rgba(255,255,255,.06);
        position:relative;
        cursor:pointer;
        padding:0;
        border:1px solid rgba(255,255,255,.08);
        transition:background .14s ease
      }
      .theme-light .monitor-switch{
        background:rgba(0,0,0,.06);
        border-color:rgba(0,0,0,.1)
      }
      .monitor-switch i{
        position:absolute;
        top:2px;
        left:2px;
        width:18px;
        height:18px;
        border-radius:2px;
        background:#6e7681;
        transform:translateX(0);
        transition:transform .14s ease,background .14s ease
      }
      .monitor-switch.on{
        background:rgba(255,46,77,.18);
        border-color:rgba(255,46,77,.5)
      }
      .monitor-switch.on i{
        transform:translateX(22px);
        background:#ff2e4d;
        box-shadow:0 0 8px rgba(255,46,77,.7)
      }
      .monitor-select,
      .monitor-range{width:100%}
      .monitor-select{
        height:28px;
        border-radius:3px;
        padding:0 8px;
        color:inherit;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.1);
        font-family:inherit;
        font-size:10px
      }
      .theme-light .monitor-select{
        background:rgba(0,0,0,.03);
        border-color:rgba(0,0,0,.1)
      }
      .monitor-range{
        accent-color:#ff2e4d;
        height:4px
      }
      .monitor-mini{
        display:flex;
        justify-content:space-between;
        gap:6px;
        font-size:8px;
        color:#6e7681;
        margin:8px 0;
        flex-wrap:wrap;
        padding:5px 6px;
        border-radius:3px;
        background:rgba(255,255,255,.02);
        border:1px solid rgba(255,255,255,.05)
      }
      .theme-light .monitor-mini{
        background:rgba(0,0,0,.02);
        border-color:rgba(0,0,0,.06)
      }
      .monitor-settings-separator{
        height:1px;
        background:rgba(255,46,77,.15);
        margin:9px 0
      }
      .monitor-settings-actions{
        display:grid;
        gap:6px;
        grid-template-columns:1fr 1fr
      }
      .monitor-ghost{
        height:28px;
        border-radius:3px;
        cursor:pointer;
        color:#c9d1d9;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        font-size:10px;
        font-family:inherit;
        letter-spacing:.04em;
        text-transform:uppercase;
        transition:background .12s ease,border-color .12s ease,color .12s ease
      }
      .theme-light .monitor-ghost{
        color:#24292f;
        background:rgba(0,0,0,.03);
        border-color:rgba(0,0,0,.08)
      }
      .monitor-ghost:hover{
        background:rgba(255,46,77,.12);
        border-color:rgba(255,46,77,.4);
        color:#ff6b85
      }
      .theme-light .monitor-ghost:hover{
        background:rgba(255,46,77,.1);
        color:#c8192f
      }
      .monitor-resize-handle{
        position:absolute;
        bottom:0;
        right:0;
        width:16px;
        height:16px;
        cursor:nwse-resize;
        touch-action:none;
        background:transparent;
        z-index:4
      }
      .monitor-resize-handle::after{
        content:'';
        position:absolute;
        bottom:3px;
        right:3px;
        width:7px;
        height:7px;
        border-right:1px solid rgba(255,46,77,.7);
        border-bottom:1px solid rgba(255,46,77,.7);
        pointer-events:none;
        box-shadow:1px -1px 0 -1px rgba(255,46,77,.35),2px -2px 0 -2px rgba(255,46,77,.2)
      }
      .theme-light .monitor-resize-handle::after{
        border-color:rgba(200,25,47,.6)
      }
      .monitor-body::-webkit-scrollbar,
      .monitor-settings::-webkit-scrollbar{
        width:5px;
        height:5px
      }
      .monitor-body::-webkit-scrollbar-track,
      .monitor-settings::-webkit-scrollbar-track{
        background:transparent
      }
      .monitor-body::-webkit-scrollbar-thumb,
      .monitor-settings::-webkit-scrollbar-thumb{
        background:rgba(255,46,77,.35);
        border-radius:0
      }
      .monitor-body::-webkit-scrollbar-thumb:hover,
      .monitor-settings::-webkit-scrollbar-thumb:hover{
        background:rgba(255,46,77,.55)
      }
      .theme-light .monitor-body::-webkit-scrollbar-thumb,
      .theme-light .monitor-settings::-webkit-scrollbar-thumb{
        background:rgba(200,25,47,.35)
      }
      @media (max-width:600px){
        .monitor-shell{
          width:calc(100vw - 16px);
          height:calc(100vh - 16px);
          left:8px;
          top:8px
        }
      }
    `;
    document.head.appendChild(style);
    state.styleEl = style;
  };

  const setupWindowEvents = () => {
    state.boundResize = handleResize;
    state.boundVisibility = () => updatePanel();
    state.boundOnline = () => { updatePanel(); refreshAsyncMetrics(true).catch(() => {}); };
    state.boundOffline = () => updatePanel();
    window.addEventListener('resize', state.boundResize, { passive: true });
    window.addEventListener('orientationchange', state.boundResize, { passive: true });
    document.addEventListener('visibilitychange', state.boundVisibility, { passive: true });
    window.addEventListener('online', state.boundOnline, { passive: true });
    window.addEventListener('offline', state.boundOffline, { passive: true });
  };

  const removeWindowEvents = () => {
    if (state.boundResize) {
      window.removeEventListener('resize', state.boundResize);
      window.removeEventListener('orientationchange', state.boundResize);
      state.boundResize = null;
    }
    if (state.boundVisibility) { document.removeEventListener('visibilitychange', state.boundVisibility); state.boundVisibility = null; }
    if (state.boundOnline) { window.removeEventListener('online', state.boundOnline); state.boundOnline = null; }
    if (state.boundOffline) { window.removeEventListener('offline', state.boundOffline); state.boundOffline = null; }
  };

  const disconnectObservers = () => {
    for (const key of Object.keys(state.observer)) {
      try { state.observer[key]?.disconnect(); } catch {}
      state.observer[key] = null;
    }
  };

  const getState = () => {
    if (!state.settings) return null;
    return Object.freeze({
      settings: Object.freeze({ ...state.settings }),
      lastSampleAt: state.lastSampleAt,
      lastSnapshot: state.lastSnapshot ? Object.freeze({ ...state.lastSnapshot }) : null,
      cpuHistory: Object.freeze([...state.cpuHistory]),
      ramHistory: Object.freeze([...state.ramHistory]),
      fpsHistory: Object.freeze([...state.fpsHistory]),
      lagHistory: Object.freeze([...state.lagHistory]),
      networkHistory: Object.freeze([...state.networkHistory]),
      errorHistory: Object.freeze([...state.errorHistory])
    });
  };

  // ==================== COMMANDS map (single source of truth) ====================
  const COMMANDS = Object.freeze({
    monitor: {
      description: 'Advanced floating browser/runtime monitor with layered system metrics, live telemetry, network probes, charts and persistent settings.',
      usage: 'monitor <on|off|toggle|panel|settings|status|sample|reset|help>',
      aliases: [],
      kind: 'plain',
      run: runCommand
    }
  });

  const install = async api => {
    validateApi(api);
    state.api = api;
    loadSettings();
    injectStyles();
    setupPerformanceObservers();
    setupErrorTracking();
    setupWindowEvents();
    startFrameMonitor();

    for (const [name, definition] of Object.entries(COMMANDS)) {
      if (!MANIFEST.commands.includes(name)) {
        throw new Error(`COMMAND_NOT_DECLARED:${name}`);
      }
      const registered = api.registerCommand(name, definition);
      if (registered === false) {
        throw new Error(`PACKAGE_COMMAND_REGISTRATION_FAILED:${name}`);
      }
    }

    if (state.settings.enabled) {
      ensureRoot();
      ensurePanel();
      await sampleNow(true);
      scheduleSamples();
    }

    saveSettings();
    return [];
  };

  const uninstall = async api => {
    const hostApi = api || state.api;
    for (const name of MANIFEST.commands) {
      try { if (hostApi?.unregisterCommand) hostApi.unregisterCommand(name); } catch {}
    }
    clearTimers();
    disconnectObservers();
    removeErrorTracking();
    removeWindowEvents();
    if (state.resizeTimer) { clearTimeout(state.resizeTimer); state.resizeTimer = null; }
    if (state.dragging) cancelDrag(state.dragHandle);
    if (state.resizing) cancelResize(state.resizeHandle);
    const panel = getPanel();
    if (panel) removePanelListeners(panel);
    if (state.root?.parentNode) { try { state.root.parentNode.removeChild(state.root); } catch {} }
    if (state.styleEl?.parentNode) { try { state.styleEl.parentNode.removeChild(state.styleEl); } catch {} }
    deleteCookie(COOKIE_KEY);
    state.api = null;
    state.settings = null;
    state.root = null;
    state.styleEl = null;
    state.panelRefs = null;
    state.cpuHistory = []; state.ramHistory = []; state.fpsHistory = [];
    state.lagHistory = []; state.networkHistory = []; state.pingHistory = []; state.errorHistory = [];
    state.networkProbeSamples = [];
    state.lastSnapshot = null; state.lastSampleAt = 0; state.lastPagePerformance = null;
    state.expectedTick = 0;
    state.dragging = false; state.dragId = null; state.dragPointerId = null; state.dragEvent = null; state.dragHandle = null;
    state.resizing = false; state.resizeId = null; state.resizePointerId = null; state.resizeEvent = null; state.resizeHandle = null;
    return [];
  };

  const packageModule = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall,
    getManifest: () => MANIFEST,
    getState
  });

  globalThis[GLOBAL_KEY] = packageModule;
})();