(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const state = {
    mode: 'user',
    session: { authenticated: false, username: '', loginAt: 0, tty: 'pts/0' },
    previousDirectory: '/home/munitos',
    host: 'munitos',
    user: 'munitos',
    cwd: '/home/munitos',
    language: navigator.language || 'en-US',
    history: [],
    historyFallback: [],
    variables: new Map(),
    exported: new Set(),
    readonly: new Set(),
    positional: [],
    umask: '0022',
    shellOptions: new Map(),
    users: new Map(),
    groups: new Map(),
    passwords: new Map(),
    jobs: new Map(),
    nextJobId: 1,
    nextPid: 2000,
    processes: new Map(),
    sessions: new Map(),
    mounts: new Map(),
    blockDevices: [],
    usbDevices: [],
    namespaces: [],
    tty: { echo: true, canonical: true, signal: true, columns: 80, rows: 24, opost: true },
    security: { uid: 1000, euid: 1000, gid: 1000, egid: 1000, supplementaryGroups: [1000], capabilities: [], noNewPrivs: false },
    lastExitCode: 0,
    clock: { user: 0, system: 0, childUser: 0, childSystem: 0 },
    historyIndex: -1,
    executionGeneration: 0,
    executionSequence: 0,
    latestForegroundOperationId: null,
    latestForegroundSequence: 0,
    lastExitCodeSequence: 0,
    draft: '',
    commands: new Map(),
    aliases: new Map(),
    transcript: [],
    persistenceKey: 'munitos-terminal-ui:v1',
    installedPackages: new Set(),
    pkgModules: new Map(),
    pkgRegistry: new Map(),
    pkgCache: new Map(),
    activeFlow: null,
    activeFlowOperationId: null,
    identityStack: [],
    packageLifecycle: null,
    shell: '/bin/bash',
    terminal: 'MUNITOS GNU/Linux Rolling',
    os: 'MUNITOS GNU/Linux',
    kernel: `MUNITOS Virtual Kernel ${FILE_VERSION}`,
    memory: { totalMB: navigator.deviceMemory ? navigator.deviceMemory * 1024 : 4096, display: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown' },
    cpu: { architecture: 'x86_64', vendor: 'MUNITOS Virtual CPU', model: 'MUNITOS Virtual Processor', cpuCount: navigator.hardwareConcurrency || 4, coresPerSocket: navigator.hardwareConcurrency || 4, threadsPerCore: 1, minMHz: 1000, maxMHz: 3200, flags: ['fpu', 'mmx', 'sse', 'sse2', 'sse4_1', 'sse4_2', 'avx', 'avx2'], display: 'Unknown' },
    gpu: 'Unknown',
    resolution: 'Unknown',
    packages: '0 Installed Packages',
    uptime: '00:00:00',
    bootAt: Date.now(),
    startedAt: Date.now(),
    cores: navigator.hardwareConcurrency || '?',
    resizeRaf: 0
  };
  if (!window.MUNITOSVFS || typeof window.MUNITOSVFS.create !== 'function') throw new Error('MUNITOS VFS failed to load.');
  const vfs = typeof window.MUNITOSVFS.install === 'function' ? window.MUNITOSVFS.install(state) : window.MUNITOSVFS.create(state);
  const fs = vfs.api;
  let uiBridge = null;
  const setUIBridge = bridge => { uiBridge = bridge && typeof bridge === 'object' ? bridge : null; };
  const uiCall = (name, ...args) => typeof uiBridge?.[name] === 'function' ? uiBridge[name](...args) : undefined;
  const appendTranscript = entries => uiCall('appendTranscript', entries);
  const clearTranscript = () => uiCall('clearTranscript');
  const syncLiveEntries = () => uiCall('syncLiveEntries');
  const updatePrompt = () => uiCall('updatePrompt');
  const updateCaret = () => uiCall('updateCaret');
  const scrollToBottom = () => uiCall('scrollToBottom');
  const focusInput = () => uiCall('focusInput');
  const normalizeInput = value => uiCall('normalizeUserInput', value) ?? String(value ?? '');
  let operationCounter = 0;
  let eventsBound = false;
  let gpuDetected = false;
  let gpuCached = 'Unknown';
  let gpuCanvas = null;
  let gpuContext = null;
  let cachedCaretH = '';
  const operationRegistry = new Map();
  const flowRegistry = new Map();
  const createOperationId = () => `op-${Date.now()}-${++operationCounter}`;
  const createOperation = (command, options = {}) => {
    const id = createOperationId();
    const background = options.background === true;
    const sequence = ++state.executionSequence;
    if (!background) {
      for (const previous of operationRegistry.values()) {
        if (!previous.finished && !previous.cancelled && !previous.background && previous.id !== id) previous.supersede();
      }
      state.latestForegroundOperationId = id;
      state.latestForegroundSequence = sequence;
    }
    const operation = {
      id,
      command,
      status: 'CREATED',
      createdAt: Date.now(),
      controller: new AbortController(),
      timers: new Set(),
      readers: new Set(),
      output: [],
      error: null,
      cancelled: false,
      superseded: false,
      finished: false,
      flowSession: null,
      pendingChain: null,
      retryCount: 0,
      block: null,
      outputSeq: 0,
      generation: state.executionGeneration,
      sequence,
      background,
      jobId: options.jobId ?? null,
      append(entries) {
        if (!this.canEmitOutput() || !Array.isArray(entries) || !entries.length) return;
        const validEntries = entries.filter(entry => entry && typeof entry === 'object').map(entry => {
          this.outputSeq++;
          return {
            ...entry,
            operationId: this.id,
            sequence: this.outputSeq
          };
        });
        if (!validEntries.length) return;
        this.output.push(...validEntries);
        if (this.block) {
          this.block.entries.push(...validEntries);
          uiCall('appendOperationEntries', this.block, validEntries);
          return;
        }
        appendTranscript(validEntries);
      },
      isLatestForeground() {
        return !this.background && !this.superseded && this.sequence === state.latestForegroundSequence && state.latestForegroundOperationId === this.id && this.generation === state.executionGeneration;
      },
      canEmitOutput() {
        return !this.finished && !this.cancelled && !this.superseded && this.generation === state.executionGeneration;
      },
      isActive() {
        return this.canEmitOutput();
      },
      isExecutionLive() {
        return !this.finished && !this.cancelled && this.generation === state.executionGeneration;
      },
      isSuperseded() {
        return this.superseded === true;
      },
      setStatus(status) {
        if (!this.finished) this.status = status;
      },
      commitExitCode(code) {
        const normalized = Number.isInteger(code) ? code : 0;
        if (this.isLatestForeground()) {
          state.lastExitCode = normalized;
          state.lastExitCodeSequence = this.sequence;
        }
        return normalized;
      },
      clearResources() {
        for (const timer of this.timers) {
          clearTimeout(timer);
          clearInterval(timer);
        }
        this.timers.clear();
        for (const reader of this.readers) {
          try {
            reader.cancel();
          } catch {}
        }
        this.readers.clear();
      },
      supersede() {
        if (this.finished || this.cancelled || this.superseded) return;
        this.superseded = true;
        if (this.flowSession && state.activeFlowOperationId === this.id) clearActiveFlow();
        this.flowSession = null;
        try {
          this.controller?.abort();
        } catch {}
        this.clearResources();
        this.setStatus('SUPERSEDED');
      },
      finish(status = 'COMPLETED') {
        if (this.finished) return;
        this.status = this.superseded && status === 'COMPLETED' ? 'SUPERSEDED' : status;
        this.finished = true;
        try {
          this.controller?.abort();
        } catch {}
        this.clearResources();
        this.controller = null;
        if (this.flowSession && state.activeFlowOperationId === this.id) clearActiveFlow();
        this.flowSession = null;
        operationRegistry.delete(this.id);
        if (state.latestForegroundOperationId === this.id && status !== 'COMPLETED') state.latestForegroundOperationId = null;
      },
      cancel() {
        if (this.finished) return;
        this.cancelled = true;
        const activeFlow = this.flowSession;
        if (activeFlow && typeof activeFlow.cancel === 'function') {
          try {
            void activeFlow.cancel();
          } catch {}
        }
        try {
          this.controller?.abort();
        } catch {}
        this.flowSession = null;
        this.clearResources();
        this.finish('CANCELLED');
      },
      fail(err) {
        if (this.finished) return;
        this.error = err;
        this.finish('FAILED');
      },
      startRetry() {
        if (this.finished) return;
        this.retryCount++;
        this.setStatus('RETRYING');
      }
    };
    operationRegistry.set(id, operation);
    return operation;
  };
  const createEntryRecord = entry => ({ type: 'entry', entry });
  const createOperationContext = operation => {
    const registerTimer = (fn, ms) => {
      if (!operation.isActive()) return 0;
      const id = setTimeout(() => {
        operation.timers.delete(id);
        if (!operation.isActive()) return;
        try {
          fn();
        } catch {}
      }, ms);
      operation.timers.add(id);
      return id;
    };
    const registerInterval = (fn, ms) => {
      if (!operation.isActive()) return 0;
      const id = setInterval(() => {
        if (!operation.isActive()) {
          clearInterval(id);
          operation.timers.delete(id);
          return;
        }
        try {
          fn();
        } catch {}
      }, ms);
      operation.timers.add(id);
      return id;
    };
    const registerReader = reader => {
      if (!operation.isActive()) return reader;
      operation.readers.add(reader);
      return reader;
    };
    return {
      requestId: operation.id,
      operation,
      background: operation.background === true,
      append: entries => operation.append(entries),
      appendNow: entries => operation.append(entries),
      appendLater: entries => operation.append(entries),
      isActive: () => operation.isActive(),
      isLatest: () => operation.isLatestForeground(),
      isCancelled: () => operation.cancelled || operation.superseded || operation.generation !== state.executionGeneration,
      getSignal: () => operation.controller?.signal,
      registerTimer,
      registerInterval,
      registerReader,
      createChildTask: (fn, ...args) => Promise.resolve().then(() => {
        if (!operation.isExecutionLive()) return undefined;
        return fn(...args);
      }),
      flow: Object.freeze({
        begin: () => null,
        next: () => null,
        cancel: () => null,
        resume: () => null
      })
    };
  };
  const formatUptime = ms => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const escHtml = str => String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const tokenize = input => {
    input = normalizeInput(input);
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
    let match;
    while ((match = re.exec(String(input ?? ''))) !== null) out.push(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '');
    return out;
  };
  const detectGPU = () => {
    if (gpuDetected) return gpuCached;
    try {
      if (!gpuCanvas) {
        gpuCanvas = document.createElement('canvas');
        gpuCanvas.width = 1;
        gpuCanvas.height = 1;
      }
      if (!gpuContext) {
        gpuContext = gpuCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) || gpuCanvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: false });
      }
      if (!gpuContext) {
        gpuCached = 'Unknown';
        gpuDetected = true;
        return gpuCached;
      }
      const debugInfo = gpuContext.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gpuContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gpuContext.getParameter(gpuContext.RENDERER);
      gpuCached = renderer || 'Unknown';
      gpuDetected = true;
      return gpuCached;
    } catch {
      gpuCached = 'Unknown';
      gpuDetected = true;
      return gpuCached;
    }
  };
  const kernelRuntimeSnapshot = () => {
    try {
      const kernel = window.MUNITOSKernel;
      return kernel && typeof kernel.snapshot === 'function' ? kernel.snapshot() : null;
    } catch { return null; }
  };
  const refreshStaticRuntimeState = () => {
    const cores = navigator.hardwareConcurrency;
    state.cpu.cpuCount = Number.isFinite(cores) ? cores : 4;
    state.cpu.coresPerSocket = state.cpu.cpuCount;
    state.cpu.display = Number.isFinite(cores) ? `${cores} Core${cores === 1 ? '' : 's'}` : 'Unknown';
    state.cores = Number.isFinite(cores) ? cores : '?';
    state.gpu = detectGPU();
    const viewport = window.visualViewport;
    const width = Math.max(0, Math.round(viewport?.width || window.innerWidth || document.documentElement?.clientWidth || 0));
    const height = Math.max(0, Math.round(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0));
    const dpr = Number(window.devicePixelRatio || 1);
    state.resolution = width > 0 && height > 0
      ? `${width}×${height}${dpr !== 1 ? ` @ ${dpr}x` : ''}`
      : 'Unknown';
    state.packages = `${state.installedPackages.size} Installed Package${state.installedPackages.size === 1 ? '' : 's'}`;
    const snapshot = kernelRuntimeSnapshot();
    if (snapshot?.version) state.kernel = `MUNITOS Virtual Kernel ${snapshot.version}`;
    if (snapshot?.capabilities?.hardware?.cpuCount) state.cpu.cpuCount = Number(snapshot.capabilities.hardware.cpuCount) || state.cpu.cpuCount;
  };
  const refreshDynamicRuntimeState = () => {
    state.uptime = formatUptime(Date.now() - state.bootAt);
  };
  const makeLine = (text, cls = 'output') => ({ type: 'line', html: `<span class="${escHtml(cls)}">${escHtml(text)}</span>` });
  const makeHtmlLine = html => ({ type: 'line', html: String(html ?? '') });
  const makeSpacer = () => ({ type: 'spacer' });
  const makeLiveLine = (key, getText, cls = 'output') => ({ type: 'live', liveKey: key, getText, cls });
  const getPromptUser = () => state.mode === 'root' ? 'root' : state.mode === 'ghost' ? 'ghost' : state.user;
  const promptSymbol = () => state.mode === 'root' ? '#' : '$';
  const promptModeClass = () => state.mode;
  const getStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
  const persist = () => {
    try {
      getStorage()?.setItem(state.persistenceKey, JSON.stringify({
        identitySchema: 1,
        mode: state.mode,
        cwd: state.cwd,
        user: state.user,
        history: state.history.slice(-200),
        session: { authenticated: state.session.authenticated === true, username: state.session.authenticated ? (state.session.username || state.user) : '', loginAt: state.session.authenticated && Number.isFinite(state.session.loginAt) ? state.session.loginAt : 0, tty: state.session.tty || 'pts/0' },
        identityStack: state.identityStack.slice(-32),
        passwordConfigured: Object.fromEntries(Array.from(state.passwords.entries()).map(([k, v]) => [k, Boolean(String(v || '').length)]))
      }));
    } catch {}
  };
  const safeJsonParse = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const restore = () => {
    try {
      let raw = getStorage()?.getItem(state.persistenceKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.cwd) state.cwd = fs.resolve(saved.cwd);
        if (saved?.user && typeof saved.user === 'string') state.user = saved.user;
        if (saved?.mode && ['user', 'root', 'ghost'].includes(saved.mode)) state.mode = saved.mode;
        if (saved?.identitySchema === 1 && saved?.session && typeof saved.session === 'object') {
          state.session.authenticated = saved.session.authenticated === true;
          state.session.username = state.session.authenticated && typeof saved.session.username === 'string' ? saved.session.username : '';
          state.session.loginAt = state.session.authenticated && Number.isFinite(saved.session.loginAt) ? saved.session.loginAt : 0;
          state.session.tty = typeof saved.session.tty === 'string' && saved.session.tty ? saved.session.tty : 'pts/0';
        } else {
          state.session.authenticated = false;
          state.session.username = '';
          state.session.loginAt = 0;
          state.session.tty = 'pts/0';
          state.mode = 'user';
          state.user = 'munitos';
          state.cwd = '/home/munitos';
          state.previousDirectory = '/home/munitos';
          state.identityStack.length = 0;
        }
        if (Array.isArray(saved?.history)) {
          state.history = saved.history.slice(-200);
          state.historyIndex = state.history.length;
        }
        if (state.session.authenticated && Array.isArray(saved?.identityStack)) {
          state.identityStack = saved.identityStack
            .filter(item => item && typeof item === 'object' && item.authenticated !== false)
            .slice(-32)
            .map(item => ({
              mode: ['user', 'root', 'ghost'].includes(item.mode) ? item.mode : 'user',
              user: typeof item.user === 'string' ? item.user : 'munitos',
              sessionUsername: typeof item.sessionUsername === 'string' ? item.sessionUsername : '',
              authenticated: true,
              cwd: typeof item.cwd === 'string' ? fs.resolve(item.cwd) : '/home/munitos',
              previousDirectory: typeof item.previousDirectory === 'string' ? fs.resolve(item.previousDirectory) : '/home/munitos'
            }));
        } else {
          state.identityStack.length = 0;
        }
      }
    } catch {
      state.session.authenticated = false;
      state.session.username = '';
      state.session.loginAt = 0;
      state.mode = 'user';
      state.user = 'munitos';
      state.cwd = '/home/munitos';
      state.previousDirectory = '/home/munitos';
      state.identityStack.length = 0;
    }
    const restoredUser = state.session.authenticated ? String(state.session.username || '') : '';
    if (state.session.authenticated && ['munitos', 'root'].includes(restoredUser) && state.users.has(restoredUser)) {
      state.user = restoredUser;
      state.mode = restoredUser === 'root' ? 'root' : 'user';
      state.cwd = fs.resolve(state.cwd || state.users.get(restoredUser).home);
      state.previousDirectory = fs.resolve(state.previousDirectory || state.cwd);
    } else {
      state.session.authenticated = false;
      state.session.username = '';
      state.session.loginAt = 0;
      state.user = 'munitos';
      state.mode = 'user';
      state.cwd = '/home/munitos';
      state.previousDirectory = '/home/munitos';
      state.identityStack.length = 0;
      state.sessions.delete('pts/0');
    }
  };
  const currentUser = () => state.mode === 'root' ? 'root' : state.mode === 'ghost' ? 'ghost' : (state.user || state.session.username || 'munitos');
  const currentUserRecord = () => state.users.get(currentUser()) || state.users.get('munitos');
  const syncIdentityEnvironment = () => {
    const name = currentUser();
    const record = currentUserRecord();
    const home = state.mode === 'ghost' ? '/home/ghost' : state.mode === 'root' ? '/root' : record?.home || '/home/munitos';
    state.variables.set('USER', name);
    state.variables.set('LOGNAME', name);
    state.variables.set('HOME', home);
    state.variables.set('PWD', state.cwd);
    state.variables.set('OLDPWD', state.previousDirectory || state.cwd);
  };
  const setMode = mode => {
    const next = String(mode || '').toLowerCase();
    if (!['user', 'root', 'ghost'].includes(next)) return false;
    if (!state.session.authenticated && next !== 'user') return false;
    if (next === 'root' && state.mode === 'ghost') return false;
    if (next === 'ghost' && state.mode !== 'user') return false;
    const identityName = next === 'root' ? 'root' : next === 'ghost' ? 'ghost' : (state.user || state.session.username || 'munitos');
    const identity = state.users.get(identityName);
    if (!identity) return false;
    state.mode = next;
    state.user = identityName;
    state.session.username = state.session.authenticated ? identityName : '';
    state.security.uid = identity.uid;
    state.security.euid = identity.uid;
    state.security.gid = identity.gid;
    state.security.egid = identity.gid;
    state.security.supplementaryGroups = Array.from(state.groups.values()).filter(g => g.members?.includes(identityName)).map(g => g.gid);
    if (!state.security.supplementaryGroups.length) state.security.supplementaryGroups = [identity.gid];
    syncIdentityEnvironment();
    updatePrompt();
    updateCaret();
    refreshDynamicRuntimeState();
    syncLiveEntries();
    const status = document.getElementById('screenStatus');
    if (status) status.textContent = next === 'root' ? 'Root mode enabled.' : next === 'ghost' ? 'Ghost mode enabled.' : 'User mode enabled.';
    persist();
    return true;
  };
  const snapshotIdentity = () => ({
    mode: state.mode,
    user: state.user,
    sessionUsername: state.session.username,
    authenticated: state.session.authenticated === true,
    cwd: state.cwd,
    previousDirectory: state.previousDirectory
  });
  const restoreIdentity = snapshot => {
    if (!snapshot || snapshot.authenticated !== true || !state.session.authenticated) return false;
    if (!['user', 'root', 'ghost'].includes(snapshot.mode)) return false;
    const identityName = snapshot.mode === 'root' ? 'root' : snapshot.mode === 'ghost' ? 'ghost' : snapshot.user;
    if (!state.users.has(identityName)) return false;
    state.user = identityName;
    state.session.username = identityName;
    state.cwd = fs.resolve(snapshot.cwd || state.users.get(identityName).home);
    state.previousDirectory = fs.resolve(snapshot.previousDirectory || state.cwd);
    return setMode(snapshot.mode);
  };
  const pushIdentity = () => {
    if (!state.session.authenticated || state.identityStack.length >= 32) return false;
    state.identityStack.push(snapshotIdentity());
    persist();
    return state.identityStack.length;
  };
  const popIdentity = () => {
    if (!state.session.authenticated) return false;
    const snapshot = state.identityStack.pop();
    if (!snapshot) return false;
    if (!restoreIdentity(snapshot)) {
      state.identityStack.push(snapshot);
      return false;
    }
    persist();
    return true;
  };
  const switchUser = (username, options = {}) => {
    const name = String(username || '').trim();
    const mode = String(options.mode || 'user').toLowerCase();
    if (!state.session.authenticated) return false;
    if (mode === 'ghost') {
      if (name !== 'ghost' || state.mode !== 'user' || !state.users.has('ghost')) return false;
    } else if (mode === 'root') {
      if (name !== 'root' || state.mode === 'ghost' || !state.users.has('root')) return false;
    } else if (!state.users.has(name)) {
      return false;
    }
    state.user = name;
    state.session.username = name;
    if (options.resetHome) {
      state.previousDirectory = state.cwd;
      state.cwd = fs.resolve(state.users.get(name).home);
    }
    return setMode(mode);
  };
  const enterRoot = options => {
    if (!state.session.authenticated || state.mode === 'ghost' || state.mode === 'root') return false;
    if (options?.stack && !pushIdentity()) return false;
    if (!switchUser('root', { mode: 'root', resetHome: options?.resetHome === true })) {
      if (options?.stack) popIdentity();
      return false;
    }
    return true;
  };
  const enterGhost = options => {
    if (!state.session.authenticated || state.mode !== 'user') return false;
    if (options?.stack && !pushIdentity()) return false;
    if (!switchUser('ghost', { mode: 'ghost', resetHome: options?.resetHome !== false })) {
      if (options?.stack) popIdentity();
      return false;
    }
    return true;
  };
  const loginAs = (username, options = {}) => {
    const name = String(username || '').trim();
    if (state.session.authenticated) return false;
    if (!['munitos', 'root'].includes(name) || !state.users.has(name)) return false;
    state.identityStack.length = 0;
    state.session.authenticated = true;
    state.session.loginAt = Date.now();
    state.session.username = name;
    state.user = name;
    const home = state.users.get(name).home;
    state.previousDirectory = state.cwd;
    state.cwd = fs.resolve(options.resetHome === false ? state.cwd : home);
    return setMode(name === 'root' ? 'root' : 'user');
  };
  const logoutSession = () => {
    state.identityStack.length = 0;
    state.sessions.delete(state.session.tty);
    state.session.authenticated = false;
    state.session.username = '';
    state.session.loginAt = 0;
    state.user = 'munitos';
    state.mode = 'user';
    state.cwd = '/home/munitos';
    state.previousDirectory = '/home/munitos';
    state.security.uid = 1000;
    state.security.euid = 1000;
    state.security.gid = 1000;
    state.security.egid = 1000;
    state.security.supplementaryGroups = [1000];
    syncIdentityEnvironment();
    updatePrompt();
    updateCaret();
    refreshDynamicRuntimeState();
    syncLiveEntries();
    persist();
    return true;
  };
  const runAsRoot = async fn => {
    if (typeof fn !== 'function') return null;
    if (state.mode === 'ghost') return null;
    if (state.mode === 'root') return await fn();
    const snapshot = snapshotIdentity();
    if (!setMode('root')) return null;
    try {
      return await fn();
    } finally {
      restoreIdentity(snapshot);
    }
  };
  const canSudo = username => {
    const name = String(username || currentUser());
    if (name === 'root') return true;
    return Boolean(state.groups.get('sudo')?.members?.includes(name));
  };
  const setCwd = path => {
    state.cwd = fs.resolve(path);
    updatePrompt();
    updateCaret();
    persist();
  };
  const COMMAND_PRIORITY = Object.freeze({ fallback: -1000000, external: 100, internal: 200, linux: 300, core: 400 });
  const packageCommandPriority = command => {
    if (!command) return COMMAND_PRIORITY.fallback;
    if (command.source === 'core') return COMMAND_PRIORITY.core;
    if (command.source === 'linux') return COMMAND_PRIORITY.linux;
    if (command.source === 'package') {
      const record = state.pkgRegistry.get(command.packageKey);
      const external = String(record?.installMode || '').toLowerCase() === 'external-https' || String(record?.sourceKind || '').toLowerCase() === 'https';
      return external ? COMMAND_PRIORITY.external : COMMAND_PRIORITY.internal;
    }
    return COMMAND_PRIORITY.fallback;
  };
  const fallbackCommands = new Map();
  const registerFallbackCommand = (name, meta = {}) => {
    const lower = String(name ?? '').trim().toLowerCase();
    if (!lower || fallbackCommands.has(lower)) return false;
    fallbackCommands.set(lower, { name: lower, description: meta.description ?? '', usage: meta.usage ?? lower, aliases: Array.isArray(meta.aliases) ? meta.aliases.map(v => String(v).toLowerCase()) : [], kind: meta.kind === 'flow' ? 'flow' : 'plain', source: 'fallback', packageKey: null, begin: typeof meta.begin === 'function' ? meta.begin : null, next: typeof meta.next === 'function' ? meta.next : null, cancel: typeof meta.cancel === 'function' ? meta.cancel : null, resume: typeof meta.resume === 'function' ? meta.resume : null, run: typeof meta.run === 'function' ? meta.run : (() => []) });
    return true;
  };
  const unregisterFallbackCommand = name => fallbackCommands.delete(String(name ?? '').trim().toLowerCase());
  const registerCommand = (name, meta = {}, options = {}) => {
    const lower = String(name).trim().toLowerCase();
    if (!lower) return false;
    const isPackageCommand = options.source === 'package';
    const existing = state.commands.get(lower);
    if (existing && !isPackageCommand) return false;
    if (existing && isPackageCommand && existing.source === 'core') return false;
    const entry = { name: lower, description: meta?.description ?? '', usage: meta?.usage ?? '', aliases: Array.isArray(meta?.aliases) ? meta.aliases.map(a => String(a).toLowerCase()) : [], kind: meta?.kind === 'flow' ? 'flow' : 'plain', source: isPackageCommand ? 'package' : 'core', bridge: meta?.bridge === true, packageKey: isPackageCommand ? options.packageKey || null : null, begin: typeof meta?.begin === 'function' ? meta.begin : null, next: typeof meta?.next === 'function' ? meta.next : null, cancel: typeof meta?.cancel === 'function' ? meta.cancel : null, resume: typeof meta?.resume === 'function' ? meta.resume : null, run: typeof meta?.run === 'function' ? meta.run : (() => []) };
    state.commands.set(lower, entry);
    for (const alias of entry.aliases) {
      const existingAlias = state.aliases.get(alias);
      if (!existingAlias || !isPackageCommand) state.aliases.set(alias, lower);
    }
    return true;
  };
  const unregisterCommand = name => {
    const lower = String(name).toLowerCase();
    const cmd = state.commands.get(lower);
    if (!cmd) return false;
    for (const alias of cmd.aliases) if (state.aliases.get(alias) === lower) state.aliases.delete(alias);
    state.commands.delete(lower);
    return true;
  };
  const unregisterPackageCommands = packageKey => {
    const key = String(packageKey ?? '').trim();
    if (!key) return;
    for (const [name, command] of state.commands) if (command?.source === 'package' && command?.packageKey === key) unregisterCommand(name);
  };
  const resolveCommand = name => {
    const lower = String(name ?? '').toLowerCase();
    const candidates = [];
    const direct = state.commands.get(lower);
    if (direct && !(direct.source === 'core' && direct.bridge)) candidates.push({ command: direct, priority: packageCommandPriority(direct) });
    const aliasTarget = state.aliases.get(lower);
    if (aliasTarget) {
      const aliasCommand = state.commands.get(aliasTarget);
      if (aliasCommand && !(aliasCommand.source === 'core' && aliasCommand.bridge)) candidates.push({ command: aliasCommand, priority: packageCommandPriority(aliasCommand) });
    }
    const linuxDirect = linuxRegistry.get(lower);
    if (linuxDirect) {
      const linuxCommand = linuxDirect.isAlias ? linuxRegistry.get(linuxDirect.target) : linuxDirect;
      if (linuxCommand) candidates.push({ command: linuxCommand, priority: COMMAND_PRIORITY.linux });
    } else if (state.aliases.has(lower)) {
      const target = state.aliases.get(lower);
      const linuxAlias = linuxRegistry.get(target);
      if (linuxAlias) candidates.push({ command: linuxAlias.isAlias ? linuxRegistry.get(linuxAlias.target) : linuxAlias, priority: COMMAND_PRIORITY.linux });
    }
    const fallback = fallbackCommands.get(lower);
    if (fallback) candidates.push({ command: fallback, priority: COMMAND_PRIORITY.fallback });
    const mappedFallback = Array.from(fallbackCommands.values()).find(command => command.aliases.includes(lower));
    if (mappedFallback) candidates.push({ command: mappedFallback, priority: COMMAND_PRIORITY.fallback });
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0]?.command ?? null;
  };
  const commandList = () => Array.from(state.commands.values()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const commandTokens = () => {
    const set = new Set();
    for (const cmd of state.commands.values()) set.add(cmd.name);
    for (const alias of state.aliases.keys()) set.add(alias);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'en'));
  };
  const helpLines = () => {
    const lines = [
      makeLine('Project sponser: t.me/Net_activenull', 'cyan-light'),
      makeLine(`                 and https://t.me/MUNITOS`, 'cyan-light'),
      makeSpacer(),
      makeLine('Latest changes and news: t.me/MUNITOS', 'purple'),
      makeSpacer(),
      makeLine('Available commands:', 'accent')
    ];
    for (const command of commandList()) {
      lines.push(makeLine(`${command.name}${command.usage ? `  ${command.usage}` : ''}`));
      if (command.description) {
        lines.push(makeLine(`  ${command.description}`, 'muted'));
      }
    }
    return lines;
  };
  const setActiveFlow = (flow, operation = null) => {
    if (flow && operation) {
      flow._operationId = operation.id;
      flowRegistry.set(operation.id, flow);
      state.activeFlow = flow;
      state.activeFlowOperationId = operation.id;
    } else if (flow) {
      state.activeFlow = flow;
      state.activeFlowOperationId = null;
    } else {
      state.activeFlow = null;
      state.activeFlowOperationId = null;
    }
  };
  const clearActiveFlow = () => {
    const flow = state.activeFlow;
    if (flow?._operationId) flowRegistry.delete(flow._operationId);
    state.activeFlow = null;
    state.activeFlowOperationId = null;
  };
  const cancelAllOperations = (reason = 'cancelled') => {
  state.executionGeneration++;
  let operations = 0;
  for (const operation of Array.from(operationRegistry.values())) {
    if (!operation.finished) {
      operation.cancel();
      operations++;
    }
  }
  let jobs = 0;
  for (const job of Array.from(state.jobs.values())) {
    if (
      job.state === 'RUNNING' ||
      job.process?.state === 'RUNNING'
    ) {
      terminateJob(job, 143, 'TERMINATED');
      jobs++;
    }
  }
  state.activeFlow = null;
  state.activeFlowOperationId = null;
  try {
    persist();
  } catch {}
  return {
    operations,
    jobs,
    reason: String(reason || 'cancelled')
  };
};
  const deepFreeze = obj => {
    if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object' && !Object.isFrozen(obj[key])) deepFreeze(obj[key]);
    }
    return obj;
  };
  const vk = window.MUNITOSVK;
  const manager = window.MUNITOSManager;
  if (!vk || typeof vk.bind !== 'function') throw new Error('MUNITOS Virtual Kernel failed to load.');
  if (!manager || typeof manager.installPackage !== 'function') throw new Error('MUNITOS Package Manager failed to load.');
  const isPackageLifecycleOutputBlocked = (...args) => manager.isPackageLifecycleOutputBlocked(...args);
  const normalizePermissions = (...args) => manager.normalizePermissions(...args);
  const summarizePermissions = (...args) => manager.summarizePermissions(...args);
  const getRemotePackageDisplayName = (...args) => manager.getRemotePackageDisplayName(...args);
  const normalizeInstallSource = (...args) => manager.normalizeInstallSource(...args);
  const resolveInstallMode = (...args) => manager.resolveInstallMode(...args);
  const installPackage = (...args) => manager.installPackage(...args);
  const removePackage = (...args) => manager.removePackage(...args);
  const reinstallPackages = (...args) => manager.reinstallPackages(...args);
  const packageFailLines = (...args) => manager.packageFailLines(...args);
  const markPackageStatus = (...args) => manager.markPackageStatus(...args);
  const getPackageStatus = (...args) => manager.getPackageStatus?.(...args);
  const getPackageInventory = (...args) => manager.getPackageInventory?.(...args);
  const preparePackageEnable = (...args) => manager.preparePackageEnable?.(...args);
  const commitPackageEnable = (...args) => manager.commitPackageEnable?.(...args);
  const disablePackage = (...args) => manager.disablePackage?.(...args);
  const refreshPackageHashes = (...args) => manager.refreshPackageHashes?.(...args);
  const persistPackageRegistry = (...args) => manager.persistPackageRegistry(...args);
  const persistPackageCache = (...args) => manager.persistPackageCache(...args);
  const createScopedApi = ctx => {
    const scopedApi = Object.assign({}, apiRef, {
      runCommand: input => runCommand(input, ctx),
      append: entries => ctx?.append?.(entries),
      getSignal: () => ctx?.getSignal?.(),
      isActive: () => ctx?.isActive?.() === true,
      isCancelled: () => ctx?.isCancelled?.() === true,
      operation: ctx?.operation || null,
      package: Object.assign({}, apiRef.package, {
        install: (input, options, _ctx) => installPackage(input, options, _ctx || ctx),
        reinstall: _ctx => reinstallPackages(_ctx || ctx)
      })
    });
    Object.defineProperty(scopedApi, '__operationContext', {
      value: ctx,
      enumerable: false,
      configurable: false
    });
    return scopedApi;
  };
  const requestYesNo = async (title, detail = '', ctx = null) => {
    const operation = ctx?.operation || null;
    const appendFn = ctx?.append && typeof ctx.append === 'function' ? ctx.append : appendTranscript;
    appendFn([
      makeLine(title, 'accent'),
      detail ? makeLine(detail, 'muted') : makeSpacer(),
      makeLine('[Y] yes   [N] no')
    ]);
    return new Promise(resolve => {
      let finalized = false;
      const finalize = value => {
        if (finalized) return;
        finalized = true;
        if (operation) {
          operation.flowSession = null;
          if (state.activeFlowOperationId === operation.id) {
            clearActiveFlow();
          }
          if (!operation.finished) {
            operation.setStatus('RUNNING');
          }
        } else {
          clearActiveFlow();
        }
        resolve(Boolean(value));
      };
      const session = {
        step: 'waiting-yn',
        _operationId: operation?.id || null,
        next: async input => {
          const value = String(input ?? '').trim().toLowerCase();
          if (value === 'y' || value === 'yes') {
            finalize(true);
            return [makeLine('Confirmed.', 'accent')];
          }
          if (value === 'n' || value === 'no' || value === 'cancel') {
            finalize(false);
            return [makeLine(value === 'cancel' ? 'Cancelled.' : 'Declined.', 'muted')];
          }
          return [
            makeLine('Invalid response.', 'danger'),
            makeLine('Please answer Y or N.', 'muted')
          ];
        },
        cancel: async () => {
          finalize(false);
          return [makeLine('Cancelled.', 'muted')];
        },
        resume: () => [makeLine('Flow is waiting for Y/N input.', 'muted')],
        status: () => ({
          active: !finalized,
          finalized,
          step: finalized ? 'idle' : 'waiting-yn'
        })
      };
      if (operation) {
        operation.flowSession = session;
        operation.setStatus('WAITING');
        setActiveFlow(session, operation);
      } else {
        setActiveFlow(session, null);
      }
    });
  };
  const normalizeCommandOutput = result => result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result.lines) ? result.lines : Array.isArray(result) ? result : [];
  const shouldClearActiveFlow = flow => {
    try {
      const s = typeof flow?.status === 'function' ? flow.status() : null;
      return !s || s.active === false || s.finalized === true || s.step === 'idle';
    } catch {
      return false;
    }
  };
  const isFlowSession = x => Boolean(x && typeof x === 'object' && typeof x.next === 'function' && typeof x.cancel === 'function' && typeof x.resume === 'function' && typeof x.status === 'function');
const parseCommandChain = input => {
  const source = String(input ?? '').trim();
  if (!source) return [];
  const units = [];
  let buffer = '';
  let quote = null;
  let escaped = false;
  const push = connector => {
    const command = buffer.trim();
    if (!command) {
      throw new CommandError(
        'SYNTAX_ERROR',
        `syntax error near unexpected token '${connector}'`
      );
    }
    units.push({
      command,
      next: connector
    });
    buffer = '';
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      buffer += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      buffer += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === ';') {
      push(';');
      continue;
    }
    if (ch === '&') {
      if (source[i + 1] === '&') {
        push('&&');
        i++;
      } else {
        push('&');
      }
      continue;
    }
    buffer += ch;
  }
  if (quote) {
    throw new CommandError(
      'SYNTAX_ERROR',
      `unexpected EOF while looking for matching '${quote}'`
    );
  }
  if (buffer.trim()) {
    units.push({
      command: buffer.trim(),
      next: null
    });
  } else if (
    units.length &&
    units.at(-1).next === '&&'
  ) {
    throw new CommandError(
      'SYNTAX_ERROR',
      'syntax error near unexpected token `&&`'
    );
  }
  return units;
};
const inferCommandExitCode = entries => {
  if (!Array.isArray(entries)) return 0;
  return entries.some(entry =>
    entry?.cls === 'danger' ||
    (
      typeof entry?.html === 'string' &&
      /class="danger"/.test(entry.html)
    )
  ) ? 1 : 0;
};
const normalizeExecutionResult = result => {
  if (isFlowSession(result)) {
    return {
      flow: result,
      entries: [],
      exitCode: 0
    };
  }
  if (result instanceof Result) {
    return {
      flow: null,
      entries: linuxResultToEntries(result),
      exitCode: result.exitCode
    };
  }
  if (Array.isArray(result)) {
    return {
      flow: null,
      entries: result,
      exitCode: inferCommandExitCode(result)
    };
  }
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray(result.lines)
  ) {
    return {
      flow: isFlowSession(result.flow)
        ? result.flow
        : null,
      entries: result.lines,
      exitCode: Number.isInteger(result.exitCode)
        ? result.exitCode
        : inferCommandExitCode(result.lines)
    };
  }
  if (result == null || result === undefined) {
    return {
      flow: null,
      entries: [],
      exitCode: 0
    };
  }
  return {
    flow: null,
    entries: [makeLine(String(result))],
    exitCode: 0
  };
};
const startBackgroundCommand = commandText => {
  const job = createJob(commandText);
  const operation = createOperation(
    commandText,
    {
      background: true,
      jobId: job.id
    }
  );
  job.process.operationId = operation.id;
  const backgroundCtx = createOperationContext(operation);
  void Promise.resolve().then(async () => {
    try {
      const result = await runCommand(
        commandText,
        backgroundCtx,
        { suppressBackground: true }
      );
      if (isFlowSession(result)) {
        try {
          await result.cancel?.();
        } catch {}
        clearActiveFlow();
        operation.append([
          makeLine(
            `[${job.id}] ${commandText}: interactive flow unavailable in background`,
            'danger'
          )
        ]);
        setJobState(job, 'STOPPED', 125);
      } else {
        const entries = normalizeCommandOutput(result);
        const exitCode =
          Number.isInteger(result?.exitCode)
            ? result.exitCode
            : inferCommandExitCode(entries);
        if (entries.length) {
          operation.append(entries);
        }
        setJobState(
          job,
          exitCode === 0 ? 'DONE' : 'FAILED',
          exitCode
        );
        operation.append([
          makeLine(
            `[${job.id}]  ${
              exitCode === 0
                ? 'Done'
                : `Exit ${exitCode}`
            }  ${commandText}`,
            exitCode === 0
              ? 'muted'
              : 'danger'
          )
        ]);
      }
    } catch (error) {
      operation.append([
        makeLine(
          `[${job.id}]  Exit 1  ${commandText}`,
          'danger'
        ),
        makeLine(
          String(
            error?.message ||
            error ||
            'background command failed'
          ),
          'muted'
        )
      ]);
      setJobState(job, 'FAILED', 1);
    } finally {
      operation.finish(
        operation.cancelled
          ? 'CANCELLED'
          : 'COMPLETED'
      );
      try {
        persist();
      } catch {}
    }
  });
  return {
    job,
    entry: makeLine(
      `[${job.id}] ${job.pid}`,
      'accent'
    )
  };
};
const executeCommandUnit = async (
  commandText,
  ctx = {}
) => {
  const input = String(commandText ?? '').trim();
  if (!input) {
    return {
      flow: null,
      entries: [],
      exitCode: 0
    };
  }
  const rawTokens = tokenize(input);
  if (!rawTokens.length) {
    return {
      flow: null,
      entries: [],
      exitCode: 0
    };
  }
  const [name, ...args] = rawTokens;
  const authGate = ensureAuthenticated(name);
  if (authGate) {
    return {
      flow: null,
      entries: authGate,
      exitCode: 1
    };
  }
  let cmd = resolveCommand(name);
  if (!cmd) {
    const lazyPackage = globalThis.MUNITOSVK?.resolveLazyPackageForCommand?.(name);
    if (lazyPackage) {
      try {
        await globalThis.MUNITOSVK.ensurePackageLoaded(lazyPackage, ctx);
        cmd = resolveCommand(name);
      } catch {}
    }
  }
  if (!cmd) {
    return {
      flow: null,
      entries: [
        makeLine(
          `bash: ${name}: command not found`,
          'danger'
        ),
        makeLine(
          'Type "help" to see available commands.',
          'muted'
        )
      ],
      exitCode: 127
    };
  }
  const scopedApi = createScopedApi(ctx);
  try {
    const result = cmd.source === 'linux' ? await linuxExecute(name, args, scopedApi, ctx) : cmd.kind === 'flow' ? await cmd.begin?.({ raw: input, tokens: rawTokens, args, api: scopedApi, ctx }) : await cmd.run({ raw: input, tokens: rawTokens, args, api: scopedApi, ctx });
    return normalizeExecutionResult(result);
  } catch {
    return {
      flow: null,
      entries: [
        makeLine(
          'Error: command execution failed.',
          'danger'
        )
      ],
      exitCode: 1
    };
  }
};
const executeCommandChain = async (
  units,
  ctx = {},
  startIndex = 0,
  previousExit = 0,
  collected = []
) => {
  let exitCode = previousExit;
  for (
    let i = startIndex;
    i < units.length;
    i++
  ) {
    const unit = units[i];
    const connector =
      i === 0
        ? null
        : units[i - 1].next;
    if (
      connector === '&&' &&
      exitCode !== 0
    ) {
      continue;
    }
    if (
      ctx?.operation &&
      !ctx.operation.isActive()
    ) {
      break;
    }
    if (unit.next === '&') {
      const background =
        startBackgroundCommand(
          unit.command
        );
      collected.push(
        background.entry
      );
      exitCode = 0;
      continue;
    }
    const execution =
      await executeCommandUnit(
        unit.command,
        ctx
      );
    if (execution.flow) {
      if (ctx?.operation) {
        ctx.operation.pendingChain = {
          units,
          nextIndex: i + 1,
          previousExit: execution.exitCode,
          collected: [...collected]
        };
      }
      return {
        flow: execution.flow,
        entries: collected,
        exitCode: execution.exitCode
      };
    }
    if (execution.entries.length) {
      collected.push(
        ...execution.entries
      );
    }
    exitCode = execution.exitCode;
    if (
      ctx?.operation &&
      !ctx.operation.isActive()
    ) {
      break;
    }
  }
  if (ctx?.operation) ctx.operation.commitExitCode(exitCode);
  else state.lastExitCode = exitCode;
  return {
    flow: null,
    entries: collected,
    exitCode
  };
};
const runCommand = async (
  inputRaw,
  ctx = {}
) => {
  if (ctx?.operation && !ctx.operation.isActive()) return [];
  const input = normalizeInput(inputRaw).trim();
  if (!input) return [];
  let units;
  try {
    units = parseCommandChain(input);
  } catch (error) {
    return [
      makeLine(
        String(
          error?.message ||
          'syntax error'
        ),
        'danger'
      )
    ];
  }
  if (!units.length) return [];
  const execution =
    await executeCommandChain(
      units,
      ctx,
      0,
      0,
      []
    );
  if (execution.flow) {
    return execution.flow;
  }
  return execution.entries;
};
const handleFlowInput = async input => {
  const operation =
    operationRegistry.get(
      state.activeFlowOperationId
    );
  const flow = state.activeFlow;
  if (!flow || !operation) {
    return {
      output: [],
      ended: false
    };
  }
  if (!flow._inputQueue) {
    flow._inputQueue = [];
  }
  if (!flow._processing) {
    flow._processing = false;
  }
  return new Promise(resolve => {
    flow._inputQueue.push({
      input,
      resolve
    });
    if (flow._processing) return;
    flow._processing = true;
    const processQueue = async () => {
      while (flow._inputQueue.length > 0) {
        const item =
          flow._inputQueue.shift();
        const {
          input: flowInput,
          resolve: flowResolve
        } = item;
        let output = [];
        let ended = false;
        try {
          if (/^(cancel|abort)$/i.test(flowInput)) {
            output =
              normalizeCommandOutput(
                await flow.cancel?.()
              );
          } else if (/^resume$/i.test(flowInput)) {
            output =
              normalizeCommandOutput(
                await flow.resume?.()
              );
          } else if (
            typeof flow.next === 'function'
          ) {
            output =
              normalizeCommandOutput(
                await flow.next(flowInput)
              );
          } else {
            output = [
              makeLine(
                'Flow does not accept input.',
                'danger'
              )
            ];
          }
          if (shouldClearActiveFlow(flow)) {
            clearActiveFlow();
            const pending =
              operation.pendingChain;
            operation.pendingChain = null;
            if (
              pending &&
              operation.isActive()
            ) {
              const continuation =
                await executeCommandChain(
                  pending.units,
                  createOperationContext(
                    operation
                  ),
                  pending.nextIndex,
                  pending.previousExit,
                  pending.collected
                );
              output = [
                ...output,
                ...continuation.entries
              ];
              if (continuation.flow) {
                operation.flowSession =
                  continuation.flow;
                operation.setStatus(
                  'WAITING'
                );
                setActiveFlow(
                  continuation.flow,
                  operation
                );
                ended = false;
              } else {
                ended = !state.activeFlow;
              }
            } else {
              ended = true;
            }
          }
        } catch {
          output = [
            makeLine(
              'Error: flow execution failed.',
              'danger'
            )
          ];
          clearActiveFlow();
          ended = true;
        }
        flowResolve({
          output,
          ended
        });
      }
      flow._processing = false;
    };
    processQueue().catch(() => {
      flow._processing = false;
    });
  });
};
  const linuxRegistry = new Map();
  const CMD_STATUS = Object.freeze({ FULL: 'FULL', PARTIAL: 'PARTIAL', VIRTUAL: 'VIRTUAL', BLOCKED: 'BLOCKED', UNAVAILABLE: 'UNAVAILABLE' });
  const CAPABILITY = Object.freeze({ NATIVE: 'native', VIRTUAL: 'virtual', EMULATED: 'emulated', PARTIAL: 'partial', BLOCKED: 'blocked' });
  class Result {
    constructor(opts = {}) {
      this.status = opts.status ?? 'success';
      this.exitCode = opts.exitCode ?? 0;
      this.stdout = opts.stdout ?? [];
      this.stderr = opts.stderr ?? [];
      this.message = opts.message ?? '';
      this.diagnostic = opts.diagnostic ?? '';
      this.changes = opts.changes ?? [];
      this.meta = opts.meta ?? {};
    }
    addLine(text, cls = 'output') {
      this.stdout.push({ text: String(text ?? ''), cls });
      return this;
    }
    addError(text, detail = '') {
      this.stderr.push({ text: String(text ?? ''), detail: String(detail ?? '') });
      return this;
    }
    addChange(change) {
      this.changes.push(change);
      return this;
    }
    setMessage(msg) {
      this.message = String(msg ?? '');
      return this;
    }
    setDiagnostic(diag) {
      this.diagnostic = String(diag ?? '');
      return this;
    }
    success(msg = '') {
      this.status = 'success';
      this.exitCode = 0;
      if (msg) this.message = String(msg);
      return this;
    }
    failure(msg = '') {
      this.status = 'failure';
      this.exitCode = 1;
      if (msg) this.message = String(msg);
      return this;
    }
  }
  class CommandError extends Error {
    constructor(code, message, opts = {}) {
      super(message);
      this.name = 'CommandError';
      this.code = String(code || 'COMMAND_ERROR');
      this.command = opts.command || '';
      this.path = opts.path || '';
      this.argument = opts.argument || '';
      this.expected = opts.expected ?? '';
      this.actual = opts.actual ?? '';
      this.suggestion = opts.suggestion || '';
    }
    toResult() {
      const r = new Result().failure(this.message);
      r.stderr.push({ text: `${this.code}: ${this.message}`, detail: this.suggestion ? `Suggestion: ${this.suggestion}` : '' });
      if (this.path) r.stderr.push({ text: `path: ${this.path}`, detail: '' });
      return r;
    }
  }
  const parseInteger = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const getSnapshot = () => ({ mode: state.mode, cwd: state.cwd, history: state.history.slice(), commands: Array.from(state.commands.keys()), installed: Array.from(state.installedPackages), packages: getPackageInventory?.() || [] });
  const getMode = () => String(state.mode || 'user');
  const getJob = value => {
    const key = String(value ?? '').replace(/^%/, '');
    if (!key) return null;
    const n = Number(key);
    if (Number.isInteger(n) && state.jobs.has(n)) return state.jobs.get(n);
    return Array.from(state.jobs.values()).find(job => String(job.pid) === key) || null;
  };
  const createJob = (command, options = {}) => {
  const pid = state.nextPid++;
  const process = {
    pid,
    command,
    state: 'RUNNING',
    nice: options.nice ?? 0,
    uid: state.security.euid,
    sid: pid,
    pgid: pid,
    startedAt: Date.now(),
    shellOwned: true,
    background: true,
    exitCode: null,
    detached: false,
    operationId: options.operationId ?? null
  };
  state.processes.set(pid, process);
  const job = {
    id: state.nextJobId++,
    pid,
    command,
    state: 'RUNNING',
    process,
    detached: false,
    createdAt: Date.now(),
    endedAt: null
  };
  state.jobs.set(job.id, job);
  return job;
};
const setJobState = (job, status, exitCode = null) => {
  if (!job) return false;
  const next = String(status || 'DONE').toUpperCase();
  job.state = next;
  job.process.state = next === 'RUNNING' ? 'RUNNING' : 'EXIT';
  if (Number.isInteger(exitCode)) {
    job.process.exitCode = exitCode;
  }
  if (next !== 'RUNNING') {
    job.endedAt = Date.now();
  }
  return true;
};
const terminateJob = (job, exitCode = 143, status = 'TERMINATED') => {
  if (!job) return false;
  setJobState(job, status, exitCode);
  const operationId = job.process?.operationId;
  if (operationId) {
    const operation = operationRegistry.get(operationId);
    if (operation) operation.cancel();
  }
  return true;
};
  const setBaseVariables = () => {
    const user = currentUserRecord();
    [['SHELL', '/bin/bash'], ['TERM', 'xterm-256color'], ['USER', currentUser()], ['LOGNAME', currentUser()], ['HOME', user?.home || '/home/munitos'], ['PWD', state.cwd], ['OLDPWD', state.previousDirectory], ['HOSTNAME', 'MUNITOS']].forEach(([k, v]) => {
      state.variables.set(k, v);
      state.exported.add(k);
    });
  };
  const factoryResetVirtualSystem = () => {
    cancelAllOperations('factory-reset');
    try { manager.reset?.(); } catch {}
    vfs.reset();
    state.cwd = '/home/munitos';
    state.previousDirectory = '/home/munitos';
    state.mode = 'user';
    state.user = 'munitos';
    state.identityStack.length = 0;
    state.session = { authenticated: false, username: '', loginAt: 0, tty: 'pts/0' };
    state.history = [];
    state.historyFallback = [];
    state.historyIndex = -1;
    state.draft = '';
    state.variables.clear();
    state.exported.clear();
    state.readonly.clear();
    state.positional = [];
    state.umask = '0022';
    state.shellOptions.clear();
    state.users.clear();
    state.groups.clear();
    state.passwords.clear();
    state.jobs.clear();
    state.processes.clear();
    state.sessions.clear();
    state.mounts.clear();
    state.blockDevices = [];
    state.usbDevices = [];
    state.namespaces = [];
    state.nextJobId = 1;
    state.nextPid = 2000;
    state.lastExitCode = 0;
    state.packageLifecycle = null;
    fs.initialize();
    initializeUnifiedIdentity();
    setBaseVariables();
    setMode('user');
    persist();
    return true;
  };
  const linuxRegister = (name, spec) => {
    const key = String(name ?? '').toLowerCase().trim();
    if (!key) return false;
    const fullSpec = {
      name: key,
      source: 'linux',
      description: spec.description ?? '',
      usage: spec.usage ?? key,
      category: spec.category ?? 3,
      status: spec.status ?? CMD_STATUS.FULL,
      capability: spec.capability ?? CAPABILITY.VIRTUAL,
      aliases: Array.isArray(spec.aliases) ? [...new Set(spec.aliases.map(alias => String(alias ?? '').trim().toLowerCase()).filter(Boolean))] : [],
      options: Array.isArray(spec.options) ? spec.options : [],
      arguments: Array.isArray(spec.arguments) ? spec.arguments : [],
      examples: Array.isArray(spec.examples) ? spec.examples : [],
      executor: typeof spec.executor === 'function' ? spec.executor : null,
      errorPolicy: spec.errorPolicy ?? 'display',
      outputPolicy: spec.outputPolicy ?? 'auto',
      mutatesFilesystem: spec.mutatesFilesystem === true,
      mutatesUsers: spec.mutatesUsers === true,
      mutatesJobs: spec.mutatesJobs === true,
      mutatesEnvironment: spec.mutatesEnvironment === true,
      mutatesSecurity: spec.mutatesSecurity === true,
      mutatesMounts: spec.mutatesMounts === true
    };
    if (!fullSpec.executor) fullSpec.status = CMD_STATUS.UNAVAILABLE;
    linuxRegistry.set(key, fullSpec);
    for (const alias of fullSpec.aliases) linuxRegistry.set(alias.toLowerCase(), { ...fullSpec, name: alias.toLowerCase(), isAlias: true, target: key });
    return true;
  };
  const linuxCommandExists = name => linuxRegistry.has(String(name ?? '').toLowerCase()) || Boolean(getSnapshot()?.commands?.includes?.(String(name ?? '').toLowerCase()));
  const linuxResolveCommand = name => {
    const key = String(name ?? '').toLowerCase();
    const direct = linuxRegistry.get(key);
    if (direct && !direct.isAlias) return direct;
    if (direct?.isAlias) return linuxRegistry.get(direct.target) || null;
    const resolved = resolveCommand(key);
    if (resolved?.source === 'package' || resolved?.source === 'core' || resolved?.source === 'fallback') return resolved;
    const snapshot = getSnapshot();
    if (Array.isArray(snapshot?.commands) && snapshot.commands.includes(key)) return { name: key, description: 'Bridge command', usage: key, category: 0, status: CMD_STATUS.FULL, capability: CAPABILITY.NATIVE, aliases: [], options: [], arguments: [], examples: [], executor: null, errorPolicy: 'display', outputPolicy: 'auto', source: 'bridge' };
    return null;
  };
  const linuxExecute = async (name, args, api = null, ctx = null) => {
    ctx = ctx || api?.__operationContext || null;
    const key = String(name ?? '').toLowerCase();
    const command = resolveCommand(key) || linuxResolveCommand(key);
    if (!command) return new Result().failure(`bash: ${name}: command not found`).addError(`bash: ${name}: command not found`, 'Command is not registered in the MUNITOS command registry.');
    if (command.source === 'bridge') return new Result().addLine(`${key}: bridge command`, 'muted');
    if (!command.executor) {
      const r = new Result().failure(`${key}: unavailable`);
      r.stderr.push({ text: `${key}: command unavailable`, detail: command.description || '' });
      return r;
    }
    try {
      const result = await command.executor({ args: Array.isArray(args) ? args : [], api, ctx, name: key, command });
      if (result instanceof Result) {
        if (command.mutatesFilesystem && ctx?.isActive?.() !== false) fs.persist();
        return result;
      }
      if (Array.isArray(result)) {
        const r = new Result({ exitCode: inferCommandExitCode(result) });
        result.forEach(item => r.addLine(typeof item === 'string' ? item : item?.text ?? '', item?.cls || 'output'));
        return r;
      }
      if (result == null || result === undefined) {
        const r = new Result().success('command completed successfully');
        r.setDiagnostic('stdout: empty by design');
        return r;
      }
      return new Result().addLine(String(result));
    } catch (error) {
      if (ctx?.isCancelled?.() || ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
      if (error instanceof CommandError) return error.toResult();
      return new Result().failure(`${key}: command execution failed`).addError(`${key}: command execution failed`, String(error?.message || error || 'COMMAND_EXECUTION_FAILED'));
    }
  };
  const linuxRegisterBlocked = (name, reasons) => linuxRegister(name, {
    description: `Unavailable: ${reasons[0] || ''}`,
    usage: name,
    category: 1,
    status: CMD_STATUS.BLOCKED,
    capability: CAPABILITY.BLOCKED,
    executor: () => {
      const r = new Result().failure(`${name}: unavailable`);
      r.stderr.push({ text: reasons[0] || `${name}: native implementation unavailable`, detail: reasons[1] || 'This capability requires native Bash/kernel support.' });
      r.setDiagnostic('MUNITOS virtual replacement: use related virtual commands instead.');
      return r;
    }
  });
  const linuxRegisterSimple = (name, spec) => linuxRegister(name, { ...spec, category: spec.category ?? 3 });
  const linuxResultToEntries = result => {
    if (!(result instanceof Result)) return [];
    const entries = [];
    for (const item of result.stdout) {
      entries.push(makeLine(item.text, item.cls || 'output'));
    }
    for (const item of result.stderr) {
      entries.push(makeLine(item.text, 'danger'));
      if (item.detail) {
        entries.push(makeLine(item.detail, 'muted'));
      }
    }
    if (result.message && result.status !== 'success' && !result.stderr.length) {
      entries.push(makeLine(result.message, 'danger'));
    }
    if (result.diagnostic && result.status === 'success' && !result.stdout.length) {
      entries.push(makeLine(result.diagnostic, 'muted'));
    }
    for (const change of result.changes) {
      entries.push(makeLine(change, 'muted'));
    }
    return entries;
  };
  const DEFAULT_VIRTUAL_PASSWORD = 'MUNITOS.github.io';
  const initializeUnifiedIdentity = () => {
    const today = Math.floor(Date.now() / 86400000);
    if (!state.users.has('root')) state.users.set('root', { username: 'root', uid: 0, gid: 0, gecos: 'root', home: '/root', shell: '/bin/bash', lastChange: today, minAge: 0, maxAge: 99999, warnAge: 7, inactive: -1, expire: -1 });
    if (!state.users.has('munitos')) state.users.set('munitos', { username: 'munitos', uid: 1000, gid: 1000, gecos: 'MUNITOS User', home: '/home/munitos', shell: '/bin/bash', lastChange: today, minAge: 0, maxAge: 99999, warnAge: 7, inactive: -1, expire: -1 });
    if (!state.users.has('ghost')) state.users.set('ghost', { username: 'ghost', uid: 2000, gid: 2000, gecos: 'MUNITOS Ghost User', home: '/home/ghost', shell: '/bin/bash', lastChange: today, minAge: 0, maxAge: 99999, warnAge: 7, inactive: -1, expire: -1 });
    if (!state.groups.has('root')) state.groups.set('root', { name: 'root', gid: 0, members: [] });
    if (!state.groups.has('munitos')) state.groups.set('munitos', { name: 'munitos', gid: 1000, members: ['munitos'] });
    if (!state.groups.has('ghost')) state.groups.set('ghost', { name: 'ghost', gid: 2000, members: ['ghost'] });
    if (!state.groups.has('sudo')) state.groups.set('sudo', { name: 'sudo', gid: 27, members: ['munitos'] });
    if (!state.groups.has('users')) state.groups.set('users', { name: 'users', gid: 100, members: ['munitos', 'ghost'] });
    if (!state.passwords.has('root')) state.passwords.set('root', '');
    if (!state.passwords.has('munitos')) state.passwords.set('munitos', '');
    if (!state.passwords.has('ghost')) state.passwords.set('ghost', '');
    fs.mkdirp('/root');
    fs.mkdirp('/home/munitos');
    fs.mkdirp('/home/ghost');
    if (state.session.authenticated === true) {
      const user = state.session.username || state.user || 'munitos';
      state.session.username = user;
      state.sessions.set('pts/0', { ...(state.sessions.get('pts/0') || {}), tty: 'pts/0', username: user, loginAt: state.session.loginAt || Date.now(), pid: 2000, idle: 0, host: 'virtual' });
    } else {
      state.session.username = '';
      state.session.loginAt = 0;
      state.sessions.delete('pts/0');
    }
  };
  const setVirtualPassword = (username, password) => {
    const user = String(username || '').trim();
    if (!state.users.has(user)) return false;
    state.passwords.set(user, String(password ?? ''));
    try {
      persist();
    } catch {}
    return true;
  };
  const verifyVirtualPassword = (username, password) => {
    const user = String(username || '').trim();
    if (!state.users.has(user)) return false;
    const configured = String(state.passwords.get(user) ?? '');
    const candidate = String(password ?? '');
    if (!configured) return candidate === '' || candidate === DEFAULT_VIRTUAL_PASSWORD;
    return candidate === configured;
  };
  const passwordConfigured = username => String(state.passwords.get(String(username || '')) ?? '').length > 0;
  const beginPasswordFlow = ({ title, username, onSuccess, ctx, maxAttempts = 3 }) => {
    const operation = ctx?.operation || null;
    const appendFn = ctx?.append && typeof ctx.append === 'function' ? ctx.append : appendTranscript;
    appendFn([makeLine(title, 'accent'), makeLine('Password:', 'muted')]);
    let finalized = false;
    let attempts = 0;
    const finish = async (ok, password = '') => {
      if (finalized) return [];
      if (!ok) {
        attempts++;
        if (attempts < Math.max(1, maxAttempts)) return [makeLine('Authentication failure.', 'danger'), makeLine(`Password: attempt ${attempts + 1}/${Math.max(1, maxAttempts)}`, 'muted')];
        finalized = true;
        clearActiveFlow();
        if (operation) {
          operation.flowSession = null;
          operation.setStatus('RUNNING');
        }
        return [makeLine('Authentication failed: too many attempts.', 'danger')];
      }
      finalized = true;
      clearActiveFlow();
      if (operation) {
        operation.flowSession = null;
        operation.setStatus('RUNNING');
      }
      return typeof onSuccess === 'function' ? await onSuccess(password) : [makeLine('Authentication successful.', 'accent')];
    };
    const flow = {
      step: 'password',
      _operationId: operation?.id || null,
      next: async input => finish(verifyVirtualPassword(username, input), input),
      cancel: async () => {
        finalized = true;
        clearActiveFlow();
        if (operation) {
          operation.flowSession = null;
          operation.setStatus('RUNNING');
        }
        return [makeLine('Authentication cancelled.', 'muted')];
      },
      resume: () => [makeLine('Waiting for password input.', 'muted')],
      status: () => ({ active: !finalized, finalized, step: finalized ? 'idle' : 'password' })
    };
    if (operation) {
      operation.flowSession = flow;
      operation.setStatus('WAITING');
      setActiveFlow(flow, operation);
    } else setActiveFlow(flow, null);
    return flow;
  };
  const ensureAuthenticated = name => {
    if (state.session.authenticated === true) return null;
    const requested = String(name || '').trim().toLowerCase();
    const canonical = state.aliases.get(requested) || requested;
    if (canonical === 'login' || canonical === 'logout' || canonical === 'help' || canonical === 'munitos') return null;
    return [makeLine('You are not logged in.', 'danger'), makeLine('Use "login [USERNAME]" to start a virtual session.', 'muted')];
  };
  vk.bind({
    state,
    coreApi: () => apiRef,
    registerCommand,
    unregisterCommand,
    append: appendTranscript,
    syncLiveEntries,
    refreshStaticRuntimeState,
    persist,
    requestYesNo,
    setActiveFlow,
    clearActiveFlow,
    unregisterPackageCommands,
    makeLine,
    makeSpacer
  });
  const apiRef = Object.freeze({
    registerCommand,
    unregisterCommand,
    registerFallbackCommand,
    unregisterFallbackCommand,
    setMode,
    snapshotIdentity,
    restoreIdentity,
    pushIdentity,
    popIdentity,
    switchUser,
    enterRoot,
    enterGhost,
    loginAs,
    logoutSession,
    runAsRoot,
    canSudo,
    setCwd,
    setUIBridge,
    renderEntry: entry => uiCall('renderEntry', entry),
    clear: clearTranscript,
    append: entries => appendTranscript(Array.isArray(entries) ? entries : []),
    line: makeLine,
    spacer: makeSpacer,
    snapshot: () => ({
      mode: state.mode,
      cwd: state.cwd,
      kernel: kernelRuntimeSnapshot(),
      vfs: typeof fs.stats === 'function' ? fs.stats() : null,
      history: state.history.slice(),
      commands: Array.from(state.commands.keys()),
      installed: Array.from(state.installedPackages),
      antivirusAvailable: Boolean(manager.antivirusAvailable?.()),
      packageInventory: getPackageInventory?.() || [],
      packages: Array.from(state.pkgRegistry.values())
    }),
    getMode: () => state.mode,
    runCommand,
requestYesNo,
cancelAllOperations,
factoryResetVirtualSystem,
    help: () => helpLines(),
    package: Object.freeze({
      install: (input, options, ctx) => installPackage(input, options, ctx),
      remove: name => removePackage(name),
      reinstall: ctx => reinstallPackages(ctx),
      resolveLazyCommand: name => manager.resolveLazyPackageForCommand?.(name) || null,
      ensureLoaded: (name, ctx) => manager.ensurePackageLoaded?.(name, ctx),
      registry: () => Array.from(state.pkgRegistry.values()),
      cache: () => Array.from(state.pkgCache.values()),
      getPackageStatus: name => manager.getPackageStatus?.(name) || null,
      getPackageInventory: () => manager.getPackageInventory?.() || [],
      preparePackageEnable: (name, ctx) => manager.preparePackageEnable?.(name, ctx),
      commitPackageEnable: (plan, ctx) => manager.commitPackageEnable?.(plan, ctx),
      disablePackage: name => manager.disablePackage?.(name),
      refreshPackageHashes: ctx => manager.refreshPackageHashes?.(ctx)
    })
  });
  const commandServices = Object.freeze({
    state,
    Result,
    CommandError,
    CMD_STATUS,
    CAPABILITY,
    linuxRegistry,
    linuxRegister,
    linuxRegisterBlocked,
    linuxRegisterSimple,
    registerFallbackCommand,
    unregisterFallbackCommand,
    linuxCommandExists,
    linuxResolveCommand,
    linuxExecute,
    linuxResultToEntries,
    clearTranscript,
    isPackageLifecycleOutputBlocked,
    fs,
    resolvePath: fs.resolve,
    currentUser,
    currentUserRecord,
    snapshotIdentity,
    restoreIdentity,
    pushIdentity,
    popIdentity,
    switchUser,
    enterRoot,
    enterGhost,
    loginAs,
    logoutSession,
    runAsRoot,
    canSudo,
    parseInteger,
    getSnapshot,
    createJob,
    getJob,
    setJobState,
terminateJob,
cancelAllOperations,
factoryResetVirtualSystem,
requestYesNo,
    makeLine,
    makeSpacer,
    setMode,
    setCwd,
    updatePrompt,
    updateCaret,
    appendTranscript,
    resolveCommand,
    helpLines,
    commandList,
    setActiveFlow,
    clearActiveFlow,
    beginPasswordFlow,
    setVirtualPassword,
    verifyVirtualPassword,
    passwordConfigured,
    getRemotePackageDisplayName,
    normalizeInstallSource,
    resolveInstallMode,
    installPackage,
    removePackage,
    reinstallPackages,
    packageFailLines,
    markPackageStatus,
    getPackageStatus,
    getPackageInventory,
    preparePackageEnable,
    commitPackageEnable,
    disablePackage,
    refreshPackageHashes,
    refreshStaticRuntimeState,
    refreshDynamicRuntimeState,
    syncLiveEntries,
    persist,
    persistPackageRegistry,
    persistPackageCache,
    normalizePermissions,
    summarizePermissions,
    package: apiRef.package,
    virtualKernel: vk,
    kernel: () => kernelRuntimeSnapshot(),
    bufferLoop: vk.bufferLoop
  });
  const coreApi = Object.freeze({
    ...apiRef,
    runCommand,
    state,
    commandServices,
    vfs: fs,
    kernel: Object.freeze({ snapshot: kernelRuntimeSnapshot, capabilities: () => window.MUNITOSKernel?.capabilities?.() || null, probe: () => window.MUNITOSKernel?.probe?.() || null }),
    runtime: Object.freeze({
      submitCommand: (...args) => uiCall('submitCommand', ...args),
      nextHistory: (...args) => uiCall('nextHistory', ...args),
      autocomplete: (...args) => uiCall('autocomplete', ...args),
      createOperation,
      createOperationContext,
      getOperation: id => operationRegistry.get(id) || null,
      getOperations: () => Array.from(operationRegistry.values()),
      handleFlowInput,
      isFlowSession,
      normalizeCommandOutput,
      commandTokens,
      runCommand,
      setActiveFlow,
      cancelAllOperations,
      initializeFS: fs.initialize,
      initializeUnifiedIdentity,
      setBaseVariables,
      restore,
      refreshStaticRuntimeState,
      refreshDynamicRuntimeState,
      syncLiveEntries: () => uiCall('syncLiveEntries'),
      persist,
      appendTranscript,
      clearTranscript,
      makeLiveLine,
      makeSpacer,
      makeLine,
      createEntryRecord,
      rebuildTranscript: (...args) => uiCall('rebuildTranscript', ...args),
      setMode,
      updatePrompt: () => uiCall('updatePrompt'),
      updateCaret: () => uiCall('updateCaret'),
      focusInput: () => uiCall('focusInput'),
      scrollToBottom: () => uiCall('scrollToBottom'),
      getPromptUser,
      promptSymbol,
      getPromptEcho: (...args) => uiCall('buildPromptEcho', ...args),
      installPackage,
      reinstallPackages,
      setupPackageBootstrap: async () => ({ ok: true, output: [] }),
      isPackageLifecycleOutputBlocked,
      restorePackages: async () => {
        try {
          const packageOutput = await manager.reinstallPackages(null, { background: true });
          const loadedCount = Number(packageOutput?.loadedCount) || 0;
          const output = [
            makeLine(`${loadedCount} package${loadedCount === 1 ? '' : 's'} restored successfully.`, 'output'),
            makeLine('Enabled packages are restored independently; a failure in one package does not stop the remaining packages.', 'muted'),
            makeLine('For detailed package information use: apt list', 'muted')
          ];
          if (packageOutput.length) output.push(makeSpacer(), ...packageOutput);
          appendTranscript(output);
        } catch (error) {
          appendTranscript([
            makeLine('Package restoration encountered a recoverable core-level error.', 'danger'),
            makeLine(String(error?.message || error || 'PACKAGE_RESTORE_FAILED'), 'muted'),
            makeLine('The core remains available and package restoration can be retried.', 'muted')
          ]);
        }
      }
    })
  });
  Object.defineProperty(window, 'MUNITOSTerminalUI', {
    value: coreApi,
    writable: false,
    configurable: false
  });
  Object.defineProperty(window, 'MUNITOSCore', {
    value: coreApi,
    writable: false,
    configurable: false
  });
  Object.defineProperty(window, 'MUNITOSTerminalCore', {
    value: coreApi,
    writable: false,
    configurable: false
  });
  if (!window.MUNITOSUI || typeof window.MUNITOSUI.attach !== 'function') throw new Error('MUNITOS UI failed to load.');
  window.MUNITOSUI.attach(coreApi);
})();
