(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const PACKAGE_CACHE_KEY_TEMPLATE='munitos-terminal-ui:pkg-cache:v1:1';
  const PACKAGE_REGISTRY_KEY='munitos-terminal-ui:pkg-registry:v1';
  const PACKAGE_STATE_KEY='munitos-terminal-ui:pkg-state:v1';
  const PACKAGE_CACHE_NAME='munitos-package-runtime-v1-v1';
  const PACKAGE_CACHE_VERSION=1;
  const KERNEL_CONFIG = Object.freeze({
    version: FILE_VERSION,
    packageCacheVersion: PACKAGE_CACHE_VERSION,
    packageCacheName: PACKAGE_CACHE_NAME,
    packageTimeoutMs: 30000,
    packageLoadRetries: 2,
    schedulerYieldMs: 0,
    maxParallelPackages: 12,
    workerScript: 'assets/MUNITOS-Worker.js',
    enableCacheStorage: true,
    enablePersistentStorage: true,
    enableBrowserFsAdapters: true
  });
  const kernelEvents = new Map();
  const workerRuntime = {
    status: 'cold',
    startedAt: 0,
    readyAt: 0,
    tasks: 0,
    failures: 0,
    restarts: 0,
    worker: null,
    nextId: 0,
    pending: new Map(),
    startPromise: null,
    maxPending: 48
  };
  const workerSnapshot = () => Object.freeze({
    status: workerRuntime.status,
    startedAt: workerRuntime.startedAt,
    readyAt: workerRuntime.readyAt,
    tasks: workerRuntime.tasks,
    failures: workerRuntime.failures,
    restarts: workerRuntime.restarts,
    pending: workerRuntime.pending.size,
    maxPending: workerRuntime.maxPending,
    supported: typeof Worker === 'function'
  });
  const rejectWorkerPending = error => {
    for (const [id, pending] of workerRuntime.pending) {
      try { clearTimeout(pending.timer); } catch {}
      try { pending.reject(error); } catch {}
      workerRuntime.pending.delete(id);
    }
  };
  const scheduleWorkerRestart = () => {
    if (workerRuntime.status === 'restart-scheduled' || workerRuntime.restarts >= 3) return;
    workerRuntime.status = 'restart-scheduled';
    const run = () => {
      workerRuntime.status = 'cold';
      try { void startWorkerRuntime().catch(() => {}); } catch {}
    };
    if (globalThis.MUNITOSOptimizer?.idle) globalThis.MUNITOSOptimizer.idle(run, 1500);
    else setTimeout(run, 1500);
  };
  const startWorkerRuntime = () => {
    if (typeof Worker !== 'function') {
      workerRuntime.status = 'unsupported';
      return null;
    }
    if (workerRuntime.worker) return workerRuntime.worker;
    if (workerRuntime.startPromise) return workerRuntime.startPromise;
    workerRuntime.startPromise = Promise.resolve().then(() => {
      const worker = new Worker(KERNEL_CONFIG?.workerScript || 'assets/MUNITOS-Worker.js', { name: 'MUNITOS-Worker-v1' });
      workerRuntime.worker = worker;
      workerRuntime.status = 'starting';
      workerRuntime.startedAt = Date.now();
      worker.onmessage = event => {
        const message = event?.data || {};
        const pending = workerRuntime.pending.get(String(message.id || ''));
        if (!pending) return;
        workerRuntime.pending.delete(String(message.id || ''));
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result);
        else {
          workerRuntime.failures++;
          pending.reject(new Error(String(message.error || 'WORKER_TASK_FAILED')));
        }
      };
      worker.onerror = event => {
        workerRuntime.failures++;
        workerRuntime.status = 'degraded';
        const error = new Error(String(event?.message || 'WORKER_RUNTIME_ERROR'));
        rejectWorkerPending(error);
        try { worker.terminate(); } catch {}
        workerRuntime.worker = null;
        workerRuntime.startPromise = null;
        workerRuntime.restarts++;
        emitKernelEvent('worker-degraded', workerSnapshot());
        scheduleWorkerRestart();
      };
      workerRuntime.startPromise = null;
      void workerTask('ping', {}, 4000).then(() => {
        workerRuntime.status = 'ready';
        workerRuntime.readyAt = Date.now();
        emitKernelEvent('worker-ready', workerSnapshot());
      }).catch(() => {
        if (workerRuntime.status === 'starting') workerRuntime.status = 'degraded';
      });
      return worker;
    }).catch(error => {
      workerRuntime.startPromise = null;
      workerRuntime.status = 'degraded';
      workerRuntime.failures++;
      throw error;
    });
    return workerRuntime.worker || workerRuntime.startPromise;
  };
  const estimateWorkerPayloadBytes = (value, limit = 4 * 1024 * 1024) => {
    const encoder = new TextEncoder();
    const seen = new Set();
    const stack = [{ value, weight: 0 }];
    let total = 0;
    while (stack.length) {
      const entry = stack.pop();
      const current = entry?.value;
      if (current == null) { total += 4; continue; }
      const type = typeof current;
      if (type === 'string') total += encoder.encode(current).byteLength + 2;
      else if (type === 'number' || type === 'boolean') total += 12;
      else if (type === 'bigint') total += 24;
      else if (type === 'function' || type === 'symbol' || type === 'undefined') continue;
      else if (type === 'object') {
        if (seen.has(current)) continue;
        seen.add(current);
        if (current instanceof ArrayBuffer) total += current.byteLength;
        else if (ArrayBuffer.isView(current)) total += current.byteLength;
        else if (current instanceof Blob) total += Number(current.size) || 0;
        else if (current instanceof Map) {
          total += 16;
          for (const [key, value2] of current) { stack.push({ value: key }); stack.push({ value: value2 }); }
        } else if (current instanceof Set) {
          total += 8;
          for (const value2 of current) stack.push({ value: value2 });
        } else if (Array.isArray(current)) {
          total += 8 + current.length * 2;
          for (const item of current) stack.push({ value: item });
        } else {
          total += 16;
          for (const [key, value2] of Object.entries(current)) {
            total += encoder.encode(key).byteLength + 2;
            stack.push({ value: value2 });
          }
        }
      }
      if (total > limit) return total;
    }
    return total;
  };
  const workerTask = async (type, payload = {}, timeoutMs = 7000) => {
    let worker = workerRuntime.worker;
    if (!worker) {
      try { worker = await startWorkerRuntime(); } catch { throw new Error('WORKER_UNAVAILABLE'); }
    }
    if (!worker || typeof worker.postMessage !== 'function') throw new Error('WORKER_UNAVAILABLE');
    if (workerRuntime.pending.size >= workerRuntime.maxPending) throw new Error('WORKER_QUEUE_LIMIT');
    const id = `wk-${Date.now()}-${++workerRuntime.nextId}`;
    let payloadBytes = 0;
    try { payloadBytes = estimateWorkerPayloadBytes(payload); } catch { payloadBytes = 0; }
    if (payloadBytes > 4 * 1024 * 1024) throw new Error('WORKER_PAYLOAD_LIMIT');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        workerRuntime.pending.delete(id);
        workerRuntime.failures++;
        try { worker.postMessage({ type: 'cancel', id }); } catch {}
        reject(new Error('WORKER_TIMEOUT'));
      }, Math.max(500, Number(timeoutMs) || 7000));
      workerRuntime.pending.set(id, { resolve, reject, timer });
      workerRuntime.tasks++;
      try { worker.postMessage({ id, type: 'task', task: String(type || ''), payload }); }
      catch (error) {
        clearTimeout(timer);
        workerRuntime.pending.delete(id);
        workerRuntime.failures++;
        reject(error);
      }
    });
  };
  const startBootWorker = () => {
    const start = () => { try { void startWorkerRuntime().catch(() => {}); } catch {} };
    if (globalThis.MUNITOSOptimizer?.idle) globalThis.MUNITOSOptimizer.idle(start, 2200);
    else setTimeout(start, 2200);
  };
  const workerReady = () => workerRuntime.status === 'ready';
  const kernelCapabilities = { phase: 'booting', startedAt: Date.now(), completedAt: 0, score: 0, profile: 'balanced', hardware: { cpuCount: 4, memoryGB: null, connection: '' }, storage: { quota: 0, usage: 0, usageRatio: 0, persisted: null }, flags: Object.create(null) };
  const onKernelEvent = (event, handler) => { const key=String(event??'').trim(); if(!key||typeof handler!=='function') return ()=>{}; const set=kernelEvents.get(key)||new Set(); set.add(handler); kernelEvents.set(key,set); return ()=>set.delete(handler); };
  const emitKernelEvent = (event, payload={}) => { for(const handler of kernelEvents.get(String(event??''))||[]) { try{handler(payload)}catch{} } };
  const capabilitySnapshot = () => Object.freeze({ phase: kernelCapabilities.phase, startedAt: kernelCapabilities.startedAt, completedAt: kernelCapabilities.completedAt, score: kernelCapabilities.score, profile: kernelCapabilities.profile, hardware: Object.freeze({...kernelCapabilities.hardware}), storage: Object.freeze({...kernelCapabilities.storage}), flags: Object.freeze({...kernelCapabilities.flags}) });
  const detectBrowserCapabilities = async (options = {}) => {
    const deep = options.deep === true;
    const n = globalThis?.navigator || {};
    const w = globalThis?.window || globalThis;
    const f = kernelCapabilities.flags;
    f.webWorkers = typeof Worker === 'function';
    f.sharedWorkers = typeof SharedWorker === 'function';
    f.webGPU = Boolean(n.gpu);
    f.webAssembly = typeof WebAssembly === 'object';
    f.offscreenCanvas = typeof OffscreenCanvas === 'function';
    f.cacheStorage = typeof w.caches?.open === 'function';
    f.indexedDB = typeof w.indexedDB !== 'undefined';
    f.serviceWorker = Boolean(n.serviceWorker);
    f.storageEstimate = Boolean(n.storage?.estimate);
    f.storagePersist = Boolean(n.storage?.persist);
    f.fileSystemAccess = typeof w.showOpenFilePicker === 'function' || typeof w.showDirectoryPicker === 'function';
    f.opfs = Boolean(n.storage?.getDirectory);
    f.streams = typeof ReadableStream === 'function' && typeof TransformStream === 'function';
    f.compressionStreams = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
    f.schedulerPostTask = Boolean(n.scheduler?.postTask);
    f.locks = Boolean(n.locks?.request);
    f.broadcastChannel = typeof BroadcastChannel === 'function';
    f.sharedArrayBuffer = typeof SharedArrayBuffer === 'function';
    f.crossOriginIsolated = Boolean(w.crossOriginIsolated);
    f.performance = Boolean(w.performance?.now);
    f.requestIdleCallback = typeof w.requestIdleCallback === 'function';
    f.intersectionObserver = typeof IntersectionObserver === 'function';
    f.resizeObserver = typeof ResizeObserver === 'function';
    kernelCapabilities.hardware.cpuCount = Math.max(1, Number(n.hardwareConcurrency) || 4);
    kernelCapabilities.hardware.memoryGB = Number.isFinite(Number(n.deviceMemory)) ? Number(n.deviceMemory) : null;
    kernelCapabilities.hardware.connection = String(n.connection?.effectiveType || n.connection?.type || '');
    if (deep) {
      try {
        const c = typeof document?.createElement === 'function' ? document.createElement('canvas') : null;
        if (c) f.webGL2 = Boolean(c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }));
      } catch { f.webGL2 = false; }
      if (f.webWorkers && !workerRuntime.worker) { try { void startWorkerRuntime().catch(() => {}); } catch {} }
      if (f.webGPU && typeof n.gpu?.requestAdapter === 'function') {
        try {
          const a = await n.gpu.requestAdapter({ powerPreference: 'high-performance' });
          f.webGPUAdapter = Boolean(a);
          f.webGPUSoftware = Boolean(a?.isFallbackAdapter);
        } catch { f.webGPUAdapter = false; }
      } else f.webGPUAdapter = false;
      if (f.storageEstimate) {
        try {
          const e = await n.storage.estimate();
          kernelCapabilities.storage = { ...kernelCapabilities.storage, quota: Number(e?.quota || 0), usage: Number(e?.usage || 0), usageRatio: Number(e?.quota) > 0 ? Number(e?.usage || 0) / Number(e.quota) : 0 };
        } catch {}
      }
      if (typeof n.storage?.persisted === 'function') {
        try { kernelCapabilities.storage.persisted = await n.storage.persisted(); } catch { kernelCapabilities.storage.persisted = null; }
      } else kernelCapabilities.storage.persisted = null;
    }
    f.workerRuntime = workerSnapshot();
    const weights = { webWorkers: 10, webAssembly: 8, webGL2: 5, webGPUAdapter: 8, offscreenCanvas: 3, cacheStorage: 7, indexedDB: 8, serviceWorker: 4, storageEstimate: 3, storagePersist: 2, fileSystemAccess: 4, opfs: 6, streams: 5, compressionStreams: 4, schedulerPostTask: 3, locks: 3, broadcastChannel: 2, sharedArrayBuffer: 2, crossOriginIsolated: 3 };
    const base = Object.entries(weights).reduce((sum, [k, v]) => sum + (f[k] ? v : 0), 0);
    const cpuBonus = Math.min(12, Math.max(0, kernelCapabilities.hardware.cpuCount - 2));
    const memBonus = kernelCapabilities.hardware.memoryGB ? Math.min(12, Math.max(0, kernelCapabilities.hardware.memoryGB - 2) * 2) : 4;
    kernelCapabilities.score = Math.round(base + cpuBonus + memBonus);
    const connection = kernelCapabilities.hardware.connection.toLowerCase();
    if (connection.includes('2g') || connection.includes('slow-2g')) kernelCapabilities.profile = 'economy';
    else if (kernelCapabilities.score >= 55) kernelCapabilities.profile = 'performance';
    else if (kernelCapabilities.score >= 38) kernelCapabilities.profile = 'balanced-plus';
    else kernelCapabilities.profile = 'balanced';
    kernelCapabilities.phase = deep ? 'ready' : 'partial';
    kernelCapabilities.completedAt = Date.now();
    emitKernelEvent('capabilities-ready', capabilitySnapshot());
    return capabilitySnapshot();
  };
  const scheduleCapabilityProbe = () => {
    const run = () => { void detectBrowserCapabilities({ deep: true }).catch(() => { kernelCapabilities.phase = 'degraded'; kernelCapabilities.completedAt = Date.now(); }); };
    if (globalThis.MUNITOSOptimizer?.idle) globalThis.MUNITOSOptimizer.idle(run, 3200);
    else setTimeout(run, 3200);
  };
  let backgroundRestoreScheduled = false;
  const runtime = {
    state: null,
    coreApi: null,
    registerCommand: null,
    unregisterCommand: null,
    append: null,
    syncLiveEntries: null,
    refreshStaticRuntimeState: null,
    persist: null,
    requestYesNo: null,
    setActiveFlow: null,
    clearActiveFlow: null,
    unregisterPackageCommands: null,
    makeLine: null,
    makeSpacer: null
  };
  const bind = api => {
    const value = api && typeof api === 'object' ? api : {};
    runtime.state = value.state || null;
    runtime.coreApi = typeof value.coreApi === 'function' ? value.coreApi : () => value.coreApi || null;
    runtime.registerCommand = typeof value.registerCommand === 'function' ? value.registerCommand : () => false;
    runtime.unregisterCommand = typeof value.unregisterCommand === 'function' ? value.unregisterCommand : () => false;
    runtime.append = typeof value.append === 'function' ? value.append : () => false;
    runtime.syncLiveEntries = typeof value.syncLiveEntries === 'function' ? value.syncLiveEntries : () => false;
    runtime.refreshStaticRuntimeState = typeof value.refreshStaticRuntimeState === 'function' ? value.refreshStaticRuntimeState : () => false;
    runtime.persist = typeof value.persist === 'function' ? value.persist : () => false;
    runtime.requestYesNo = typeof value.requestYesNo === 'function' ? value.requestYesNo : async () => false;
    runtime.setActiveFlow = typeof value.setActiveFlow === 'function' ? value.setActiveFlow : () => false;
    runtime.clearActiveFlow = typeof value.clearActiveFlow === 'function' ? value.clearActiveFlow : () => false;
    runtime.unregisterPackageCommands = typeof value.unregisterPackageCommands === 'function' ? value.unregisterPackageCommands : () => false;
    runtime.makeLine = typeof value.makeLine === 'function' ? value.makeLine : (text, cls = 'output') => ({ type: 'line', text: String(text ?? ''), cls });
    runtime.makeSpacer = typeof value.makeSpacer === 'function' ? value.makeSpacer : () => ({ type: 'spacer' });
    return true;
  };
  const state = new Proxy({}, { get: (_, key) => runtime.state?.[key], set: (_, key, value) => { if (!runtime.state) return false; runtime.state[key] = value; return true; } });
  const apiRef = new Proxy({}, { get: (_, key) => runtime.coreApi()?.[key] });
  const registerCommand = (...args) => runtime.registerCommand(...args);
  const unregisterCommand = (...args) => runtime.unregisterCommand(...args);
  const appendTranscript = entries => runtime.append(entries);
  const syncLiveEntries = () => runtime.syncLiveEntries();
  const refreshStaticRuntimeState = () => runtime.refreshStaticRuntimeState();
  const persist = () => runtime.persist();
  const requestYesNo = (...args) => runtime.requestYesNo(...args);
  const setActiveFlow = (...args) => runtime.setActiveFlow(...args);
  const clearActiveFlow = (...args) => runtime.clearActiveFlow(...args);
  const unregisterPackageCommands = (...args) => runtime.unregisterPackageCommands(...args);
  const makeLine = (text, cls = 'output') => runtime.makeLine(text, cls);
  const makeSpacer = () => runtime.makeSpacer();
  const getStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
  const savePersistentMap = (key, map) => { try { const storage=getStorage(); if(!storage) return false; storage.setItem(key, JSON.stringify(Object.fromEntries(map))); return true; } catch { return false; } };
  const safeJsonParse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
  const loadPersistentMap = key => { try { const storage=getStorage(); const data=safeJsonParse(storage?.getItem(key),{}); return new Map(Object.entries(data && typeof data==='object' && !Array.isArray(data) ? data : {})); } catch { return new Map(); } };
  const deepFreeze = obj => { if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) return obj; Object.freeze(obj); for (const key of Object.keys(obj)) if (obj[key] && typeof obj[key] === 'object' && !Object.isFrozen(obj[key])) deepFreeze(obj[key]); return obj; };
  const INTERNAL_PACKAGE_LINKS=Object.freeze([
    'assets/pkg/attackkit/attackkit.js',
    'assets/pkg/booster/booster.js',
    'assets/pkg/ipscan/ipscan.js',
    'assets/pkg/monitor/monitor.js',
    'assets/pkg/ninjadb/ninjadb.js',
    'assets/pkg/nmap/nmap.js',
    'assets/pkg/sitescanner/sitescanner.js',
    'assets/pkg/wpcrack/wpcrack.js',
    'assets/pkg/xfcelite/xfcelite.js',
    'assets/pkg/xsspectre/xsspectre.js'
  ]);
  let packageCatalog=null;
  let packageCatalogPromise=null;
  const extractPackageManifestBlock=source=>{
    const text=String(source??'');
    const match=/\b(?:const|let|var)\s+MANIFEST\s*=\s*(?:Object\.freeze\s*\(\s*)?\{/m.exec(text);
    if(!match)throw new Error('PACKAGE_MANIFEST_MISSING');
    const open=match.index+match[0].lastIndexOf('{');
    let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
    for(let i=open;i<text.length;i++){
      const ch=text[i],next=text[i+1];
      if(lineComment){if(ch==='\n')lineComment=false;continue;}
      if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
      if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote='';continue;}
      if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
      if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
      if(ch==="'"||ch==='"'||ch==='`'){quote=ch;continue;}
      if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return text.slice(open,i+1);
    }
    throw new Error('PACKAGE_MANIFEST_UNBALANCED');
  };
  const parsePackageArray=(block,key)=>{
    const match=new RegExp('\\b'+key+'\\s*:\\s*(?:Object\\.freeze\\s*\\(\\s*)?\\[([\\s\\S]*?)\\]\\s*\\)?','m').exec(block);
    if(!match)return[];
    const out=[],re=/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;let item;
    while((item=re.exec(match[1]))!==null)out.push((item[1]??item[2]??'').replace(/\\(['"\\])/g,'$1'));
    return out;
  };
  const readPackageManifest=(source,fallbackName)=>{
    const block=extractPackageManifestBlock(source);
    const readString=key=>{const match=new RegExp('\\b'+key+'\\s*:\\s*([\'\"])([\\s\\S]*?)\\1','m').exec(block);return match?String(match[2]).replace(/\\(['"\\])/g,'$1'):'';};
    const readBoolean=key=>{const match=new RegExp('\\b'+key+'\\s*:\\s*(true|false)\\b','m').exec(block);return match?match[1]==='true':false;};
    const permissionMatch=/\bpermissions\s*:\s*(?:Object\.freeze\s*\(\s*)?\{([\s\S]*?)\}\s*\)?/m.exec(block);
    const permissions={storage:'none',cookies:'none',network:'none',filesystem:'none'};
    if(permissionMatch)for(const key of Object.keys(permissions)){const match=new RegExp('\\b'+key+'\\s*:\\s*([\'\"])(.*?)\\1','m').exec(permissionMatch[1]);if(match)permissions[key]=match[2].trim().toLowerCase();}
    const name=readString('name')||String(fallbackName||'').trim();
    if(!name)throw new Error('PACKAGE_MANIFEST_NAME_MISSING');
    return {name,version:readString('version')||'unknown',description:readString('description'),help:readString('help'),author:readString('author')||'unknown',official:readBoolean('official'),default:readBoolean('default'),securityLevel:readString('securityLevel')||'medium',permissions,commands:parsePackageArray(block,'commands'),dependencies:parsePackageArray(block,'dependencies'),entry:readString('entry')||'install',source:'internal',path:`assets/pkg/${name}/${name}.js`};
  };
  const loadPackageCatalog=async()=>{
    if(packageCatalog)return packageCatalog;
    if(packageCatalogPromise)return packageCatalogPromise;
    packageCatalogPromise=Promise.resolve().then(async()=>{
      const packages=await Promise.all(INTERNAL_PACKAGE_LINKS.map(async link=>{
        const url=new URL(link,document.baseURI);
        const parts=url.pathname.split('/').filter(Boolean);
        const name=parts[parts.length-2]||'';
        if(!/^[a-z0-9_-]+$/i.test(name))throw new Error(`PACKAGE_SOURCE_PATH_INVALID:${link}`);
        const response=await fetch(url.href,{cache:'no-store',credentials:'same-origin'});
        if(!response.ok)throw new Error(`PACKAGE_SOURCE_UNAVAILABLE:${name}:${response.status}`);
        const source=await response.text();
        if(!source.trim()||source.length>2_000_000)throw new Error(`PACKAGE_SOURCE_INVALID:${name}`);
        const metadata=readPackageManifest(source,name);
        if(metadata.name.toLowerCase()!==name.toLowerCase())throw new Error(`PACKAGE_IDENTITY_MISMATCH:${name}`);
        return metadata;
      }));
      packageCatalog=deepFreeze({name:'munitos-package-index',version:FILE_VERSION,schema:1,description:'Package metadata is read automatically from each package source.',packages});
      return packageCatalog;
    }).catch(()=>{
      packageCatalog={name:'munitos-package-index',version:FILE_VERSION,schema:1,packages:[]};
      return packageCatalog;
    }).finally(()=>{packageCatalogPromise=null;});
    return packageCatalogPromise;
  };
  const getPackageCatalogEntry = async name => {
    const key = String(name ?? '').trim();
    const cat = await loadPackageCatalog();
    return cat?.packages?.find(entry => String(entry?.name || '').trim() === key) || null;
  };
  const isHtmlLike = text => /^\s*(?:<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(String(text ?? ''));
  const buildLocalPackagePath = name => { const clean = String(name ?? '').trim(); return clean ? new URL(`./assets/pkg/${encodeURIComponent(clean)}/${encodeURIComponent(clean)}.js`, document.baseURI).href : ''; };
  const resolveLocalPackageUrl = value => {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    const base = new URL(document.baseURI);
    const packageRoot = new URL('./assets/pkg/', base);
    if (/^https?:\/\//i.test(clean)) {
      const url = new URL(clean, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(packageRoot.pathname) || !/\.js$/i.test(url.pathname)) throw new Error('PACKAGE_LOCAL_SOURCE_INVALID');
      return url.href;
    }
    const pathLike = clean.replace(/^\.\//, '').replace(/\\/g, '/');
    if (/^assets\/pkg\//i.test(pathLike)) {
      const url = new URL(pathLike, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(packageRoot.pathname) || !/\.js$/i.test(url.pathname)) throw new Error('PACKAGE_LOCAL_SOURCE_INVALID');
      return url.href;
    }
    const name = pathLike.replace(/^pkg\//i, '').split('/')[0];
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('PACKAGE_LOCAL_SOURCE_INVALID');
    return new URL(`./assets/pkg/${encodeURIComponent(name)}/${encodeURIComponent(name)}.js`, base).href;
  };
  const normalizeInstallSource = input => { const raw = String(input ?? '').trim(); if (!raw) return { kind: 'local', value: raw, display: raw }; if (/^www\./i.test(raw)) { const url = new URL(`https://${raw}`); return { kind: 'remote', value: url.toString(), display: url.toString() }; } if (/^https:\/\//i.test(raw)) { const url = new URL(raw); return { kind: 'remote', value: url.toString(), display: url.toString() }; } if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) throw new Error('MUNITOS accepts only internal package names or external HTTPS package URLs.'); return { kind: 'local', value: raw, display: raw }; };
  const resolveInstallMode = ({ toolKey = '', target = '', normalized = null } = {}) => { const raw = String(target ?? '').trim(); if (/^https:\/\//i.test(raw) || /^www\./i.test(raw)) return 'external-https'; if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return 'invalid'; if (normalized?.kind === 'remote') return 'external-https'; return 'internal'; };
  const isTamperEvent = record => ['corrupted','tampered','hash-changed','quarantined'].includes(String(record?.status || '').toLowerCase()) || record?.hash?.status === 'changed';
  const normalizePermissions = manifest => { const raw = manifest?.permissions ?? {}; return Object.freeze({ storage: String(raw.storage ?? 'none').toLowerCase(), cookies: String(raw.cookies ?? 'none').toLowerCase(), network: String(raw.network ?? 'none').toLowerCase(), filesystem: String(raw.filesystem ?? 'none').toLowerCase() }); };
  const summarizePermissions = manifest => normalizePermissions(manifest);
  const bufferConfig={min:1,max:Math.max(1,Number(KERNEL_CONFIG.maxParallelPackages)||12),size:Math.max(1,Math.min(Math.max(1,Number(KERNEL_CONFIG.maxParallelPackages)||12,4)))};
  const bufferLoop=Object.freeze({run:async(items,worker)=>{const list=Array.isArray(items)?items:[];const out=new Array(list.length);let cursor=0;const count=Math.max(1,Math.min(bufferConfig.size,list.length||1));const runner=async()=>{while(true){const index=cursor++;if(index>=list.length)return;try{out[index]=await worker(list[index],index);}catch(error){out[index]={error};}}};await Promise.all(Array.from({length:Math.min(count,list.length||1)},()=>runner()));return out;},getSize:()=>bufferConfig.size,setSize:value=>{const next=Math.max(bufferConfig.min,Math.min(bufferConfig.max,Number(value)||bufferConfig.size));bufferConfig.size=next;return next;}});
  const tuneKernelExecution = () => {
    const cpuCount = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency) || 4);
    const profile = String(kernelCapabilities?.profile || 'balanced').toLowerCase();
    const targets = {
      economy: 2,
      balanced: Math.min(4, cpuCount),
      'balanced-plus': Math.min(8, Math.max(4, cpuCount)),
      performance: Math.min(bufferConfig.max, Math.max(6, cpuCount))
    };
    const target = Number(targets[profile]) || Math.min(4, cpuCount);
    return bufferLoop.setSize(target);
  };
  const PACKAGE_CACHE_KEY=PACKAGE_CACHE_KEY_TEMPLATE;
  const PACKAGE_TIMEOUT = Math.max(5000, Number(KERNEL_CONFIG.packageTimeoutMs)||30000);
  const PACKAGE_LOAD_RETRIES = Math.max(1, Number(KERNEL_CONFIG.packageLoadRetries)||2);
  const packageCacheUrl = url => { try { const u=new URL(String(url||''),document.baseURI); u.searchParams.set('v',String(PACKAGE_CACHE_VERSION)); return u.toString(); } catch { return String(url||''); } };
  const getPackageCache = async () => { if(!KERNEL_CONFIG.enableCacheStorage||typeof globalThis.caches?.open!=='function') return null; try{return await globalThis.caches.open(PACKAGE_CACHE_NAME)}catch{return null} };
  const hashSource = async source => {
    const managerHash = globalThis.MUNITOSManager?.hashSource;
    if (typeof managerHash === 'function') {
      return managerHash(source);
    }
    const text = String(source ?? '');
    if (text.length >= 16384) {
      try { const result = await workerTask('hash', { text }, 9000); if (/^[a-f0-9]{64}$/i.test(String(result?.hash || ''))) return String(result.hash).toLowerCase(); } catch {}
    }
    try {
      if (globalThis.crypto?.subtle && typeof globalThis.TextEncoder === 'function') {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,'0')).join('');
      }
    } catch {}
    throw new Error('PACKAGE_HASH_UNAVAILABLE');
  };
  const yieldToBrowser = async () => { if(globalThis.navigator?.scheduler?.postTask){try{await globalThis.navigator.scheduler.postTask(()=>{},{priority:'user-visible'});return}catch{}} if(typeof requestAnimationFrame==='function'){await new Promise(resolve=>requestAnimationFrame(()=>resolve()));return;} await Promise.resolve(); };
  const persistPackageRegistry = () => savePersistentMap(PACKAGE_REGISTRY_KEY, state.pkgRegistry);
  const persistPackageCache = () => savePersistentMap(PACKAGE_CACHE_KEY, state.pkgCache);
  const persistPackageState = () => {
    persistPackageRegistry();
    persistPackageCache();
    try {
      const storage=getStorage();
      storage?.setItem(PACKAGE_STATE_KEY, JSON.stringify({ schema: 1, installed: Array.from(state.installedPackages), updatedAt: Date.now() }));
    } catch {}
    return true;
  };
  const restorePackageState = () => {
    state.pkgRegistry = loadPersistentMap(PACKAGE_REGISTRY_KEY);
    state.pkgCache = loadPersistentMap(PACKAGE_CACHE_KEY);
    let installed = [];
    try {
      const storage=getStorage();
      const v = safeJsonParse(storage?.getItem(PACKAGE_STATE_KEY), null);
      if ((v?.schema === 1 || v?.schema === 2) && Array.isArray(v.installed)) installed = v.installed;
    } catch {}
    if (!installed.length) {
      try {
        const current = safeJsonParse(getStorage()?.getItem(state.persistenceKey), null);
        if (Array.isArray(current?.installed)) installed = current.installed;
      } catch {}
    }
    const persistedInstalled = new Set(installed.map(value => String(value || '').trim()).filter(Boolean));
    const activeRegistry = new Set();
    for (const [key, record] of state.pkgRegistry) {
      const normalized = String(record?.key || key || '').trim();
      const status = String(record?.status || '').trim().toLowerCase();
      if (!normalized || record?.enabled === false || !['installed', 'enabled', 'verified'].includes(status)) continue;
      activeRegistry.add(normalized);
    }
    state.installedPackages = new Set(Array.from(persistedInstalled).filter(key => activeRegistry.has(key)));
    for (const key of activeRegistry) state.installedPackages.add(key);
    for (const key of Array.from(state.pkgRegistry.keys())) {
      const record = state.pkgRegistry.get(key);
      const status = String(record?.status || '').trim().toLowerCase();
      if (!record || ['disabled', 'removed', 'restore-failed', 'quarantined', 'verification-pending'].includes(status)) continue;
      if (!state.installedPackages.has(key) && !['installed', 'enabled', 'verified'].includes(status)) state.pkgRegistry.delete(key);
    }
    return { installed: Array.from(state.installedPackages), registry: state.pkgRegistry.size, cache: state.pkgCache.size };
  };
  const beginPackageLifecycle = (pkgKey, phase) => { state.packageLifecycle = { pkgKey: String(pkgKey ?? '').trim(), phase: String(phase ?? '').trim().toLowerCase(), startedAt: Date.now() }; };
  const endPackageLifecycle = pkgKey => { if (!state.packageLifecycle) return; if (pkgKey && state.packageLifecycle.pkgKey !== String(pkgKey).trim()) return; state.packageLifecycle = null; };
  const isPackageLifecycleOutputBlocked = () => { const phase = String(state.packageLifecycle?.phase || ''); return phase === 'install' || phase === 'uninstall'; };
  const loadPackageRecord = pkgKey => state.pkgRegistry.get(pkgKey) || null;
  const markPackageStatus = (pkgKey, patch, options = {}) => {
    const current = state.pkgRegistry.get(pkgKey) || { key: pkgKey };
    const next = { ...current, ...patch, key: pkgKey, updatedAt: Date.now() };
    state.pkgRegistry.set(pkgKey, next);
    if (options.persist !== false) persistPackageRegistry();
    return next;
  };
  const sanitizePackageId = value => String(value ?? '').trim().replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'pkg';
  const getUrlFileStem = url => {
    try {
      const u = new URL(url, document.baseURI);
      const parts = u.pathname.split('/').filter(Boolean);
      return sanitizePackageId(parts[parts.length - 1] || '');
    } catch {
      return '';
    }
  };
  const getRemotePackageDisplayName = input => {
    const raw = String(input ?? '').trim();
    if (!raw) return 'pkg';
    if (/^https?:\/\//i.test(raw)) return getUrlFileStem(raw) || 'pkg';
    return raw;
  };
  const getCanonicalPackageName = (requestedKey, manifest = null) => {
    const manifestName = String(manifest?.name ?? '').trim();
    if (manifestName) return manifestName;
    return String(requestedKey ?? '').trim() || 'pkg';
  };
  const migratePackageIdentity = (fromKey, toKey) => {
    const sourceKey = String(fromKey ?? '').trim();
    const targetKey = String(toKey ?? '').trim();
    if (!sourceKey || !targetKey || sourceKey === targetKey) return targetKey;
    const sourceRecord = state.pkgRegistry.get(sourceKey) || null;
    const targetRecord = state.pkgRegistry.get(targetKey) || null;
    const mergedRecord = sourceRecord || targetRecord
      ? {
          ...(sourceRecord || {}),
          ...(targetRecord || {}),
          key: targetKey,
          name: targetRecord?.name || sourceRecord?.name || targetKey,
          manifest: targetRecord?.manifest || sourceRecord?.manifest || null,
          resolved: sourceRecord?.resolved || targetRecord?.resolved || '',
          sourceKind: sourceRecord?.sourceKind || targetRecord?.sourceKind || '',
          transport: sourceRecord?.transport || targetRecord?.transport || '',
          exportKey: targetRecord?.exportKey || sourceRecord?.exportKey || ''
        }
      : null;
    if (sourceRecord) state.pkgRegistry.delete(sourceKey);
    if (mergedRecord) state.pkgRegistry.set(targetKey, mergedRecord);
    if (state.installedPackages.has(sourceKey)) {
      state.installedPackages.delete(sourceKey);
      state.installedPackages.add(targetKey);
    }
    if (state.pkgModules.has(sourceKey)) {
      const moduleRecord = state.pkgModules.get(sourceKey);
      state.pkgModules.delete(sourceKey);
      state.pkgModules.set(targetKey, moduleRecord);
    }
    return targetKey;
  };
  const normalizePersistedPackageIdentities = () => {
    const candidates = new Set([...Array.from(state.installedPackages), ...Array.from(state.pkgRegistry.keys())]);
    let changed = false;
    for (const key of candidates) {
      const rawKey = String(key ?? '').trim();
      if (!/^https?:\/\//i.test(rawKey)) continue;
      const record = state.pkgRegistry.get(rawKey);
      const manifestName = String(record?.manifest?.name ?? '').trim();
      const canonicalName = manifestName || getRemotePackageDisplayName(rawKey);
      if (!canonicalName || canonicalName === rawKey) continue;
      migratePackageIdentity(rawKey, canonicalName);
      changed = true;
    }
    if (changed) {
      persistPackageRegistry();
      persist();
    }
  };
  const makePackageGlobalKey = id => `__munitos_pkg_${sanitizePackageId(id)}`;
  const evaluatePackageSource = (source, pkgKey, resolvedUrl, options = {}) => {
    const sandbox = options.sandbox === true;
    const exportKeys = [...new Set([makePackageGlobalKey(pkgKey), makePackageGlobalKey(getUrlFileStem(resolvedUrl)), makePackageGlobalKey(pkgKey)].filter(Boolean))];
    const moduleObj = { exports: {} };
    const exportsObj = moduleObj.exports;
    if (!sandbox) {
      const runner = new Function(
        'window','globalThis','module','exports','document','fetch','navigator','location',
        'localStorage','sessionStorage','indexedDB','caches','WebSocket','Worker','SharedWorker',
        'XMLHttpRequest','EventSource','BroadcastChannel','Notification','ServiceWorker',
        'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame',
        'addEventListener','removeEventListener','performance','crypto','TextEncoder','TextDecoder',
        'URL','URLSearchParams','Blob','File','FileReader','Event','CustomEvent','Node','Element','HTMLElement',
        'MutationObserver','ResizeObserver','PerformanceObserver','IntersectionObserver','AbortController',
        'structuredClone','requestIdleCallback','cancelIdleCallback','eval','Function',
        String(source || '') + `\nreturn (${exportKeys.map(key => `window['${key}'] ?? globalThis['${key}'] ??`).join('')}module.exports?.default ?? module.exports ?? exports.default ?? exports);`
      );
      let raw;
      try {
        raw = runner(
          window, window, moduleObj, exportsObj,
          globalThis.document, globalThis.fetch, globalThis.navigator, globalThis.location,
          globalThis.localStorage, globalThis.sessionStorage, globalThis.indexedDB, globalThis.caches,
          globalThis.WebSocket, globalThis.Worker, globalThis.SharedWorker,
          globalThis.XMLHttpRequest, globalThis.EventSource, globalThis.BroadcastChannel,
          globalThis.Notification, globalThis.ServiceWorker,
          globalThis.setTimeout, globalThis.clearTimeout, globalThis.setInterval, globalThis.clearInterval,
          globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame,
          globalThis.addEventListener, globalThis.removeEventListener,
          globalThis.performance, globalThis.crypto, globalThis.TextEncoder, globalThis.TextDecoder,
          globalThis.URL, globalThis.URLSearchParams, globalThis.Blob, globalThis.File, globalThis.FileReader,
          globalThis.Event, globalThis.CustomEvent, globalThis.Node, globalThis.Element, globalThis.HTMLElement,
          globalThis.MutationObserver, globalThis.ResizeObserver, globalThis.PerformanceObserver, globalThis.IntersectionObserver,
          globalThis.AbortController, globalThis.structuredClone, globalThis.requestIdleCallback, globalThis.cancelIdleCallback,
          globalThis.eval, globalThis.Function
        );
      } catch (error) {
        throw new Error(`PACKAGE_EVALUATION_FAILED:${String(error?.message || error || 'UNKNOWN_ERROR').slice(0, 180)}`);
      }
      const mod = raw?.default ?? raw ?? null;
      const exportKey = exportKeys.find(key => window[key] === mod || globalThis[key] === mod) || null;
      if (!mod || typeof mod.install !== 'function') throw new Error('PACKAGE_ENTRY_INVALID');
      return { module: mod, exportKey: exportKey || makePackageGlobalKey(pkgKey), globalKey: exportKeys[0] || makePackageGlobalKey(pkgKey), sandboxed:false };
    }
    const sandboxGlobal = Object.create(null);
    const denied = () => { throw new Error('PACKAGE_SANDBOX_DENIED'); };
    const safeLocation = { href:String(resolvedUrl||''), origin:(()=>{try{return new URL(resolvedUrl,document.baseURI).origin}catch{return ''}})() };
    const safeNavigator = { userAgent:String(globalThis.navigator?.userAgent||'MUNITOS Sandbox'), language:String(globalThis.navigator?.language||'en-US') };
    const safeSetTimeout = (...args) => globalThis.setTimeout(...args);
    const safeClearTimeout = (...args) => globalThis.clearTimeout(...args);
    const safeSetInterval = (...args) => globalThis.setInterval(...args);
    const safeClearInterval = (...args) => globalThis.clearInterval(...args);
    const safeRAF = (...args) => globalThis.requestAnimationFrame?.(...args);
    const safeCancelRAF = (...args) => globalThis.cancelAnimationFrame?.(...args);
    const safeFetch = (input, init={}) => withPackageContext(pkgKey, () => globalThis.fetch(input, {...init, credentials:init.credentials ?? 'omit'}));
    const freeUserProxyRuntime = globalThis.__FreeUserProxy;
    const proxyCompatiblePackages = new Set(['ipscan', 'attackkit', 'sitescanner', 'wpcrack', 'xsspectre', 'ninjadb']);
    const allowFreeUserProxy = proxyCompatiblePackages.has(String(pkgKey || '').trim().toLowerCase());
    const freeUserProxyBridge = allowFreeUserProxy && typeof freeUserProxyRuntime === 'function'
      ? Object.assign((input, options = {}) => freeUserProxyRuntime(input, options), freeUserProxyRuntime.network || {}, {
          management: freeUserProxyRuntime.management || freeUserProxyRuntime.api?.management || null,
          api: freeUserProxyRuntime.api || null
        })
      : null;
    Object.assign(sandboxGlobal, {
      window:sandboxGlobal, globalThis:sandboxGlobal, module:moduleObj, exports:exportsObj, console:globalThis.console,
      URL, URLSearchParams, TextEncoder, TextDecoder, Promise, Array, Object, String, Number, Boolean, RegExp, Date, Math, JSON,
      Map, Set, WeakMap, WeakSet, Symbol, BigInt, Error, TypeError, RangeError, SyntaxError, Intl, parseInt, parseFloat, isNaN, isFinite,
      Uint8Array, Uint16Array, Uint32Array, ArrayBuffer, DataView, crypto:globalThis.crypto, performance:globalThis.performance,
      navigator:safeNavigator, location:safeLocation, __FreeUserProxy:freeUserProxyBridge, document:new Proxy({}, {get:()=>denied}), fetch:safeFetch,
      XMLHttpRequest:denied, WebSocket:denied, EventSource:denied, BroadcastChannel:denied, Worker:denied, SharedWorker:denied,
      ServiceWorker:denied, Notification:denied, indexedDB:denied, caches:denied,
      localStorage:new Proxy({}, {get:()=>denied}), sessionStorage:new Proxy({}, {get:()=>denied}),
      alert:denied, confirm:denied, prompt:denied, open:denied, eval:denied, Function:denied,
      setTimeout:safeSetTimeout, clearTimeout:safeClearTimeout, setInterval:safeSetInterval, clearInterval:safeClearInterval,
      requestAnimationFrame:safeRAF, cancelAnimationFrame:safeCancelRAF, addEventListener:denied, removeEventListener:denied
    });
    const runner = new Function('window','globalThis','module','exports','document','fetch','navigator','location','localStorage','sessionStorage','indexedDB','caches','WebSocket','Worker','SharedWorker','XMLHttpRequest','EventSource','BroadcastChannel','Notification','ServiceWorker','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','eval','Function', String(source || '') + `\nreturn (${exportKeys.map(key => `window['${key}'] ?? globalThis['${key}'] ??`).join('')}module.exports?.default ?? module.exports ?? exports.default ?? exports);`);
    let raw;
    try { raw = runner(sandboxGlobal,sandboxGlobal,moduleObj,exportsObj,sandboxGlobal.document,safeFetch,safeNavigator,safeLocation,sandboxGlobal.localStorage,sandboxGlobal.sessionStorage,sandboxGlobal.indexedDB,sandboxGlobal.caches,sandboxGlobal.WebSocket,sandboxGlobal.Worker,sandboxGlobal.SharedWorker,sandboxGlobal.XMLHttpRequest,sandboxGlobal.EventSource,sandboxGlobal.BroadcastChannel,sandboxGlobal.Notification,sandboxGlobal.ServiceWorker,safeSetTimeout,safeClearTimeout,safeSetInterval,safeClearInterval,safeRAF,safeCancelRAF,sandboxGlobal.addEventListener,sandboxGlobal.removeEventListener,denied,denied); } catch { throw new Error('PACKAGE_SANDBOX_EVALUATION_FAILED'); }
    const mod = raw?.default ?? raw ?? null;
    const exportKey = exportKeys.find(key => sandboxGlobal[key] === mod) || null;
    if (!mod || typeof mod.install !== 'function') throw new Error('PACKAGE_ENTRY_INVALID');
    return { module:mod, exportKey:exportKey || makePackageGlobalKey(pkgKey), globalKey:exportKeys[0] || makePackageGlobalKey(pkgKey), sandboxed:true };
  };
  const loadPackageViaScript = async (normalized, pkgKey, options = {}) => {
    const url=normalized.kind==='local'?resolveLocalPackageUrl(normalized.value):normalized.value;
    if(!url) throw new Error('PACKAGE_SOURCE_INVALID');
    const fetched=await loadPackageSource({kind:normalized.kind,value:url},pkgKey,options);
    const evaluated=evaluatePackageSource(fetched.source,pkgKey,fetched.resolved,{sandbox:options.sandbox===true});
    return {...fetched,...evaluated,transport:'fetch-eval'};
  };
  const loadPackageSource = async (normalized,pkgKey='',options={}) => {
    const baseUrl=normalized.kind==='local'?resolveLocalPackageUrl(normalized.value):normalized.value;
    if(!baseUrl) throw new Error('PACKAGE_SOURCE_INVALID');
    const fresh=options.fresh===true;
    const url=packageCacheUrl(baseUrl);
    if(normalized.kind==='remote'&&!/^https:\/\//i.test(url)) throw new Error('PACKAGE_SOURCE_HTTPS_REQUIRED');
    if(!fresh&&normalized.kind==='remote'){
      try{
        const cache=await getPackageCache(); const cached=cache?await cache.match(url):null;
        if(cached){const source=await cached.text();if(!source.trim())throw new Error('PACKAGE_SOURCE_EMPTY');if(isHtmlLike(source))throw new Error('PACKAGE_SOURCE_HTML');const hash=await hashSource(source);const key=String(pkgKey||getRemotePackageDisplayName(baseUrl));state.pkgCache.set(key,{key,url,version:PACKAGE_CACHE_VERSION,cachedAt:Date.now(),transport:'cache-storage',size:source.length,hash});persistPackageCache();return{source,sourceName:url,resolved:url,kind:normalized.kind,transport:'cache-storage',hash};}
      }catch(error){if(error?.message==='PACKAGE_HASH_UNAVAILABLE')throw error;}
    }
    let lastError=null;
    for(let attempt=0;attempt<PACKAGE_LOAD_RETRIES;attempt++){
      try{
        const res=await fetch(url,{cache:fresh?'no-store':'default',credentials:normalized.kind==='local'?'same-origin':'omit',redirect:'follow'});
        if(!res.ok)throw new Error('PACKAGE_SOURCE_UNAVAILABLE');
        const source=await res.text(); if(!source.trim())throw new Error('PACKAGE_SOURCE_EMPTY'); if(isHtmlLike(source))throw new Error('PACKAGE_SOURCE_HTML');
        const hash=await hashSource(source);
        try{const cache=await getPackageCache();if(cache)await cache.put(url,new Response(source,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=300'}}));}catch{}
        const key=String(pkgKey||getRemotePackageDisplayName(baseUrl));state.pkgCache.set(key,{key,url,version:PACKAGE_CACHE_VERSION,cachedAt:Date.now(),transport:'fetch',size:source.length,hash});persistPackageCache();
        return{source,sourceName:url,resolved:url,kind:normalized.kind,transport:'fetch',hash};
      }catch(error){lastError=error;if(attempt+1<PACKAGE_LOAD_RETRIES)await yieldToBrowser();}
    }
    throw lastError||new Error('PACKAGE_SOURCE_UNAVAILABLE');
  };
  const PACKAGE_LIMITS = Object.freeze({
    commandRegistrations: 128,
    aliases: 256,
    listeners: 256,
    timers: 128,
    observers: 64,
    storageOpsWindow: 1024,
    storageBytesWindow: 16 * 1024 * 1024,
    networkRequestsWindow: 512,
    networkConcurrent: 64,
    filesystemOpsWindow: 1500,
    filesystemBytesWindow: 48 * 1024 * 1024,
    outputEntriesWindow: 20000,
    mutationBackups: 512,
    maxRollbackBytes: 8 * 1024 * 1024
  });
  const packageSupervisor = {
    records: new Map(),
    current: null,
    listenerMap: new WeakMap(),
    originals: null,
    cleanupFns: new Set(),
    incidentLimit: 64
  };
  let quarantinePackageHandler = null;
  const packageContext = pkgKey => { const key=String(pkgKey??'').trim(); return key ? packageSupervisor.records.get(key)||null : null; };
  const sandboxedPackageContext = pkgKey => { const rec=packageContext(pkgKey); return rec && (rec.sourceKind==='https' || rec.installMode==='external-https') ? rec : null; };
  const touchWindow = record => {
    const current = Date.now();
    if (!record.window || current - record.window.startedAt >= 60000) { record.window = { startedAt: current, counts: Object.create(null), bytes: Object.create(null) }; record.strikes = 0; record.lastBreachAt = 0; }
    return record.window;
  };
  const getSupervisorRecord = (pkgKey, manifest = {}) => {
    const key = String(pkgKey ?? '').trim();
    let record = packageSupervisor.records.get(key);
    if (record) {
      record.manifest = manifest && typeof manifest === 'object' ? manifest : record.manifest;
      record.permissions = normalizePermissions(manifest || record.manifest || {});
      return record;
    }
    const permissions = normalizePermissions(manifest);
    record = {
      key,
      manifest,
      permissions,
      startedAt: Date.now(),
      strikes: 0,
      lastBreachAt: 0,
      counters: Object.create(null),
      window: { startedAt: Date.now(), counts: Object.create(null), bytes: Object.create(null) },
      resources: { timeouts: new Set(), intervals: new Set(), rafs: new Set(), listeners: [], observers: new Set() },
      storageBackups: new Map(),
      cookieBackups: new Map(),
      fsBackups: new Map(),
      rollbackBytes: 0,
      memory: { baseline: 0, last: 0, highSamples: 0, samples: 0 },
      lifecyclePhase: 'idle',
      sourceKind: 'unknown'
    };
    try {
      record.memory.baseline = Number(globalThis.performance?.memory?.usedJSHeapSize) || 0;
      record.memory.last = record.memory.baseline;
    } catch {}
    packageSupervisor.records.set(key, record);
    return record;
  };
  const migrateSupervisorIdentity = (fromKey, toKey) => {
    const sourceKey = String(fromKey ?? '').trim();
    const targetKey = String(toKey ?? '').trim();
    if (!sourceKey || !targetKey || sourceKey === targetKey) return targetKey;
    const source = packageSupervisor.records.get(sourceKey);
    if (!source) return targetKey;
    const target = packageSupervisor.records.get(targetKey);
    if (target && target !== source) throw new Error('PACKAGE_SUPERVISOR_IDENTITY_COLLISION');
    source.key = targetKey;
    packageSupervisor.records.delete(sourceKey);
    packageSupervisor.records.set(targetKey, source);
    return targetKey;
  };
  const notePackageUsage = (pkgKey, metric, amount = 1, options = {}) => {
    const record = sandboxedPackageContext(pkgKey);
    if (!record) return true;
    const value = Math.max(0, Number(amount) || 0);
    const window = touchWindow(record);
    const isBytes = options.bytes === true;
    const field = String(metric || 'operations');
    const map = isBytes ? window.bytes : window.counts;
    map[field] = (Number(map[field]) || 0) + value;
    record.counters[field] = (Number(record.counters[field]) || 0) + value;
    let limit = Number(options.limit);
    if (!Number.isFinite(limit)) {
      const defaults = {
        commandRegistrations: PACKAGE_LIMITS.commandRegistrations,
        aliases: PACKAGE_LIMITS.aliases,
        listeners: PACKAGE_LIMITS.listeners,
        timers: PACKAGE_LIMITS.timers,
        observers: PACKAGE_LIMITS.observers,
        storageOps: PACKAGE_LIMITS.storageOpsWindow,
        storageBytes: PACKAGE_LIMITS.storageBytesWindow,
        networkRequests: PACKAGE_LIMITS.networkRequestsWindow,
        filesystemOps: PACKAGE_LIMITS.filesystemOpsWindow,
        filesystemBytes: PACKAGE_LIMITS.filesystemBytesWindow,
        outputEntries: PACKAGE_LIMITS.outputEntriesWindow
      };
      limit = defaults[field] || Infinity;
    }
    if (map[field] > limit) {
      const nowMs = Date.now();
      const hard = map[field] > limit * 1.75 || ['commandRegistrations', 'aliases'].includes(field);
      if (nowMs - record.lastBreachAt > 1500) record.strikes = Math.max(0, record.strikes) + 1;
      record.lastBreachAt = nowMs;
      const incident = { packageKey: record.key, metric: field, value: map[field], limit, hard, at: nowMs };
      record.lastIncident = incident;
      emitKernelEvent('package-resource-breach', incident);
      if (hard || record.strikes >= 2) {
        try { quarantinePackageHandler?.(record.key, `resource-limit:${field}`, incident); } catch {}
        throw new Error('PACKAGE_SECURITY_RESOURCE_LIMIT');
      }
    }
    return true;
  };
  const withPackageContext = async (pkgKey, fn) => {
    const key = String(pkgKey ?? '').trim() || null;
    const previous = packageSupervisor.current;
    const record = packageContext(key);
    const previousPhase = record?.lifecyclePhase || 'idle';
    if (record) record.lifecyclePhase = String(state.packageLifecycle?.phase || record.lifecyclePhase || 'runtime').toLowerCase();
    packageSupervisor.current = key;
    try { return await fn(); } finally { if (record) record.lifecyclePhase = previousPhase; packageSupervisor.current = previous; }
  };
  const withPackageContextSync = (pkgKey, fn) => {
    const key = String(pkgKey ?? '').trim() || null;
    const previous = packageSupervisor.current;
    const record = packageContext(key);
    const previousPhase = record?.lifecyclePhase || 'idle';
    if (record) record.lifecyclePhase = String(state.packageLifecycle?.phase || record.lifecyclePhase || 'runtime').toLowerCase();
    packageSupervisor.current = key;
    try { return fn(); } finally { if (record) record.lifecyclePhase = previousPhase; packageSupervisor.current = previous; }
  };
  const wrapPackageResources = () => {
    if (packageSupervisor.originals) return;
    const originals = packageSupervisor.originals = {
      setTimeout: globalThis.setTimeout?.bind(globalThis),
      clearTimeout: globalThis.clearTimeout?.bind(globalThis),
      setInterval: globalThis.setInterval?.bind(globalThis),
      clearInterval: globalThis.clearInterval?.bind(globalThis),
      requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis),
      cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
      fetch: globalThis.fetch?.bind(globalThis),
      addEventListener: EventTarget?.prototype?.addEventListener,
      removeEventListener: EventTarget?.prototype?.removeEventListener,
      MutationObserver: globalThis.MutationObserver
    };
    if (originals.setTimeout) globalThis.setTimeout = function(handler, delay, ...args) {
      const key = packageSupervisor.current;
      const rec = sandboxedPackageContext(key);
      if (!rec || typeof handler !== 'function') return originals.setTimeout(handler, delay, ...args);
      notePackageUsage(key, 'timers', 1, { limit: PACKAGE_LIMITS.timers });
      let id;
      const wrapped = (...cbArgs) => {
        rec.resources.timeouts.delete(id);
        return withPackageContextSync(key, () => { const value = handler(...cbArgs); samplePackageMemory(key); return value; });
      };
      id = originals.setTimeout(wrapped, delay, ...args);
      rec.resources.timeouts.add(id);
      return id;
    };
    if (originals.clearTimeout) globalThis.clearTimeout = function(id) {
      const key = packageSupervisor.current;
      for (const rec of packageSupervisor.records.values()) rec.resources.timeouts.delete(id);
      return originals.clearTimeout(id);
    };
    if (originals.setInterval) globalThis.setInterval = function(handler, delay, ...args) {
      const key = packageSupervisor.current;
      const rec = sandboxedPackageContext(key);
      if (!rec || typeof handler !== 'function') return originals.setInterval(handler, delay, ...args);
      notePackageUsage(key, 'timers', 1, { limit: PACKAGE_LIMITS.timers });
      const wrapped = (...cbArgs) => withPackageContextSync(key, () => { const value = handler(...cbArgs); samplePackageMemory(key); return value; });
      const id = originals.setInterval(wrapped, delay, ...args);
      rec.resources.intervals.add(id);
      return id;
    };
    if (originals.clearInterval) globalThis.clearInterval = function(id) {
      for (const rec of packageSupervisor.records.values()) rec.resources.intervals.delete(id);
      return originals.clearInterval(id);
    };
    if (originals.requestAnimationFrame) globalThis.requestAnimationFrame = callback => {
      const key = packageSupervisor.current;
      const rec = sandboxedPackageContext(key);
      if (!rec || typeof callback !== 'function') return originals.requestAnimationFrame(callback);
      notePackageUsage(key, 'timers', 1, { limit: PACKAGE_LIMITS.timers });
      let id;
      const wrapped = timestamp => { rec.resources.rafs.delete(id); return withPackageContextSync(key, () => { const value = callback(timestamp); samplePackageMemory(key); return value; }); };
      id = originals.requestAnimationFrame(wrapped);
      rec.resources.rafs.add(id);
      return id;
    };
    if (originals.cancelAnimationFrame) globalThis.cancelAnimationFrame = id => {
      for (const rec of packageSupervisor.records.values()) rec.resources.rafs.delete(id);
      return originals.cancelAnimationFrame(id);
    };
    if (originals.fetch) globalThis.fetch = function(input, init) {
      const key = packageSupervisor.current;
      const rec = sandboxedPackageContext(key);
      if (!rec) return originals.fetch(input, init);
      const permission = String(rec.permissions?.network || 'none').toLowerCase();
      if (rec.lifecyclePhase === 'evaluate' || permission === 'none') throw new Error('PACKAGE_DIRECT_NETWORK_BLOCKED');
      const limit = permission === 'full' ? PACKAGE_LIMITS.networkConcurrent : 16;
      notePackageUsage(key, 'networkRequests', 1, { limit: PACKAGE_LIMITS.networkRequestsWindow });
      rec.networkInflight = (Number(rec.networkInflight) || 0) + 1;
      if (rec.networkInflight > limit) {
        rec.networkInflight--;
        throw new Error('PACKAGE_NETWORK_CONCURRENCY_LIMIT');
      }
      return Promise.resolve(originals.fetch(input, init)).then(response => {
        rec.networkInflight = Math.max(0, rec.networkInflight - 1);
        const length = Number(response?.headers?.get?.('content-length') || 0);
        if (length > 0) notePackageUsage(key, 'networkBytes', length, { bytes: true, limit: 32 * 1024 * 1024 });
        return response;
      }, error => {
        rec.networkInflight = Math.max(0, rec.networkInflight - 1);
        throw error;
      });
    };
    if (globalThis.Storage?.prototype) {
      const storagePrototype = globalThis.Storage.prototype;
      const originalGetItem = storagePrototype.getItem;
      const originalSetItem = storagePrototype.setItem;
      const originalRemoveItem = storagePrototype.removeItem;
      const originalClear = storagePrototype.clear;
      const originalKey = storagePrototype.key;
      const isPackageStorage = target => target === globalThis.localStorage || target === globalThis.sessionStorage;
      if (typeof originalGetItem === 'function') storagePrototype.getItem = function(name) {
        const key = packageSupervisor.current;
        const rec = isPackageStorage(this) ? sandboxedPackageContext(key) : null;
        if (rec) notePackageUsage(key, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
        return originalGetItem.call(this, name);
      };
      if (typeof originalSetItem === 'function') storagePrototype.setItem = function(name, value) {
        const key = packageSupervisor.current;
        const rec = isPackageStorage(this) ? sandboxedPackageContext(key) : null;
        if (rec) {
          if (rec.lifecyclePhase === 'evaluate') throw new Error('PACKAGE_DIRECT_STORAGE_BLOCKED');
          if (String(rec.permissions?.storage || 'none').toLowerCase() === 'none') throw new Error('PACKAGE_DIRECT_STORAGE_BLOCKED');
          notePackageUsage(key, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          notePackageUsage(key, 'storageBytes', String(value ?? '').length * 2, { bytes: true, limit: PACKAGE_LIMITS.storageBytesWindow });
          recordStorageBackup(key, name);
        }
        const result = originalSetItem.call(this, name, value); samplePackageMemory(key); return result;
      };
      if (typeof originalRemoveItem === 'function') storagePrototype.removeItem = function(name) {
        const key = packageSupervisor.current;
        const rec = isPackageStorage(this) ? sandboxedPackageContext(key) : null;
        if (rec) {
          if (rec.lifecyclePhase === 'evaluate') throw new Error('PACKAGE_DIRECT_STORAGE_BLOCKED');
          if (String(rec.permissions?.storage || 'none').toLowerCase() === 'none') throw new Error('PACKAGE_DIRECT_STORAGE_BLOCKED');
          notePackageUsage(key, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          recordStorageBackup(key, name);
        }
        const result = originalRemoveItem.call(this, name); samplePackageMemory(key); return result;
      };
      if (typeof originalClear === 'function') storagePrototype.clear = function() {
        const key = packageSupervisor.current;
        const rec = isPackageStorage(this) ? sandboxedPackageContext(key) : null;
        if (rec) throw new Error('PACKAGE_STORAGE_CLEAR_DENIED');
        return originalClear.call(this);
      };
      if (typeof originalKey === 'function') storagePrototype.key = function(index) {
        const key = packageSupervisor.current;
        const rec = isPackageStorage(this) ? sandboxedPackageContext(key) : null;
        if (rec) notePackageUsage(key, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
        return originalKey.call(this, index);
      };
    }
    if (globalThis.IDBFactory?.prototype) {
      const idbProto = globalThis.IDBFactory.prototype;
      const idbOpen = idbProto.open;
      const idbDelete = idbProto.deleteDatabase;
      if (typeof idbOpen === 'function') idbProto.open = function(...args) {
        const key = packageSupervisor.current; if (sandboxedPackageContext(key)) throw new Error('PACKAGE_DIRECT_INDEXEDDB_BLOCKED');
        return idbOpen.apply(this, args);
      };
      if (typeof idbDelete === 'function') idbProto.deleteDatabase = function(...args) {
        const key = packageSupervisor.current; if (sandboxedPackageContext(key)) throw new Error('PACKAGE_DIRECT_INDEXEDDB_BLOCKED');
        return idbDelete.apply(this, args);
      };
    }
    if (globalThis.CacheStorage?.prototype) {
      const cacheProto = globalThis.CacheStorage.prototype;
      for (const method of ['open', 'delete', 'match', 'has']) {
        const original = cacheProto[method];
        if (typeof original !== 'function') continue;
        cacheProto[method] = function(...args) {
          const key = packageSupervisor.current; if (sandboxedPackageContext(key)) throw new Error('PACKAGE_DIRECT_CACHE_BLOCKED');
          return original.apply(this, args);
        };
      }
    }
    if (originals.addEventListener && EventTarget?.prototype) {
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        const key = packageSupervisor.current;
        const rec = sandboxedPackageContext(key);
        if (!rec || !listener) return originals.addEventListener.call(this, type, listener, options);
        notePackageUsage(key, 'listeners', 1, { limit: PACKAGE_LIMITS.listeners });
        const wrapped = typeof listener === 'function'
          ? function(...args) { return withPackageContextSync(key, () => { const value = listener.apply(this, args); samplePackageMemory(key); return value; }); }
          : { handleEvent: (...args) => withPackageContextSync(key, () => { const value = listener.handleEvent(...args); samplePackageMemory(key); return value; }) };
        const record = { target: this, type: String(type), listener, wrapped, options };
        rec.resources.listeners.push(record);
        return originals.addEventListener.call(this, type, wrapped, options);
      };
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        const key = packageSupervisor.current;
        const rec = sandboxedPackageContext(key);
        if (rec) {
          const idx = rec.resources.listeners.findIndex(item => item.target === this && item.type === String(type) && item.listener === listener);
          if (idx >= 0) {
            const item = rec.resources.listeners.splice(idx, 1)[0];
            return originals.removeEventListener.call(this, type, item.wrapped, options);
          }
        }
        return originals.removeEventListener.call(this, type, listener, options);
      };
    }
    if (originals.MutationObserver) {
      globalThis.MutationObserver = class MUNITOSOwnedMutationObserver extends originals.MutationObserver {
        constructor(callback) {
          const key = packageSupervisor.current;
          const rec = sandboxedPackageContext(key);
          if (!rec || typeof callback !== 'function') { super(callback); return; }
          notePackageUsage(key, 'observers', 1, { limit: PACKAGE_LIMITS.observers });
          super((...args) => withPackageContextSync(key, () => { const value = callback(...args); samplePackageMemory(key); return value; }));
          rec.resources.observers.add(this);
        }
      };
    }
  };
  const restorePackageResources = (pkgKey, options = {}) => {
    const rec = packageContext(pkgKey);
    if (!rec) return { removed: 0, restored: 0 };
    let removed = 0;
    let restored = 0;
    const raw = packageSupervisor.originals || {};
    for (const id of rec.resources.timeouts) { try { raw.clearTimeout?.(id); removed++; } catch {} }
    for (const id of rec.resources.intervals) { try { raw.clearInterval?.(id); removed++; } catch {} }
    for (const id of rec.resources.rafs) { try { raw.cancelAnimationFrame?.(id); removed++; } catch {} }
    for (const item of rec.resources.listeners.splice(0)) { try { raw.removeEventListener?.call(item.target, item.type, item.wrapped, item.options); removed++; } catch {} }
    for (const observer of rec.resources.observers) { try { observer.disconnect(); removed++; } catch {} }
    rec.resources.timeouts.clear(); rec.resources.intervals.clear(); rec.resources.rafs.clear(); rec.resources.observers.clear();
    if (options.rollback !== false && rec.storageBackups.size) {
      for (const [key, value] of rec.storageBackups) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
          restored++;
        } catch {}
      }
    }
    if (options.rollback !== false && rec.cookieBackups.size) {
      for (const [name, value] of rec.cookieBackups) {
        try { document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value ?? '')}; path=/; SameSite=Lax`; restored++; } catch {}
      }
    }
    if (options.rollback !== false && rec.fsBackups.size && apiRef?.vfs) {
      for (const [path, backup] of rec.fsBackups) {
        try {
          if (backup.exists) {
            if (backup.kind === 'dir') apiRef.vfs.mkdirp?.(path);
            else if (backup.kind === 'file') apiRef.vfs.write(path, backup.data ?? '', { create: true, replace: true, mode: backup.mode, uid: backup.uid, gid: backup.gid });
          } else apiRef.vfs.remove(path, { recursive: true });
          restored++;
        } catch {}
      }
    }
    return { removed, restored };
  };
  const recordStorageBackup = (pkgKey, key) => {
    const rec = sandboxedPackageContext(pkgKey); if (!rec) return;
    const fullKey = String(key);
    if (rec.storageBackups.has(fullKey)) return;
    try { rec.storageBackups.set(fullKey, localStorage.getItem(fullKey)); } catch { rec.storageBackups.set(fullKey, null); }
    if (rec.storageBackups.size > PACKAGE_LIMITS.mutationBackups) rec.storageBackups.delete(rec.storageBackups.keys().next().value);
  };
  const recordCookieBackup = (pkgKey, name) => {
    const rec = packageContext(pkgKey); if (!rec) return;
    const key = String(name);
    if (rec.cookieBackups.has(key)) return;
    let value = '';
    try { value = document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${encodeURIComponent(key)}=`))?.split('=').slice(1).join('=') || ''; } catch {}
    rec.cookieBackups.set(key, decodeURIComponent(value || ''));
    if (rec.cookieBackups.size > PACKAGE_LIMITS.mutationBackups) rec.cookieBackups.delete(rec.cookieBackups.keys().next().value);
  };
  const recordFsBackup = (pkgKey, path) => {
    const rec = packageContext(pkgKey); if (!rec || rec.fsBackups.has(String(path))) return;
    const key = String(path);
    try {
      const node = apiRef?.vfs?.stat?.(key);
      if (!node) { rec.fsBackups.set(key, { exists: false }); return; }
      const size = Number(node.size || 0);
      if (rec.rollbackBytes + size > PACKAGE_LIMITS.maxRollbackBytes) { rec.fsBackups.set(key, { exists: true, unsupported: true }); return; }
      const data = node.kind === 'file' ? apiRef.vfs.read(key) : null;
      rec.fsBackups.set(key, { exists: true, kind: node.kind, data, mode: node.mode, uid: node.uid, gid: node.gid });
      rec.rollbackBytes += Math.max(0, size);
    } catch { rec.fsBackups.set(key, { exists: false }); }
    while (rec.fsBackups.size > PACKAGE_LIMITS.mutationBackups) {
      const first = rec.fsBackups.keys().next().value; rec.fsBackups.delete(first);
    }
  };
  const samplePackageMemory = pkgKey => {
    const rec = packageContext(pkgKey); if (!rec) return;
    try {
      const used = Number(globalThis.performance?.memory?.usedJSHeapSize) || 0;
      const limit = Number(globalThis.performance?.memory?.jsHeapSizeLimit) || 0;
      if (!used || !limit) return;
      rec.memory.samples++;
      const delta = used - rec.memory.baseline;
      if (delta > 192 * 1024 * 1024 && used / limit > 0.85) rec.memory.highSamples++;
      else rec.memory.highSamples = Math.max(0, rec.memory.highSamples - 1);
      rec.memory.last = used;
      if (rec.memory.highSamples >= 3) {
        const incident = { packageKey: pkgKey, metric: 'heap-growth', delta, used, limit, at: Date.now() };
        emitKernelEvent('package-memory-breach', incident);
        try { quarantinePackageHandler?.(pkgKey, 'memory-growth', incident); } catch {}
        throw new Error('PACKAGE_MEMORY_LIMIT');
      }
    } catch (error) {
      if (String(error?.message || '') === 'PACKAGE_MEMORY_LIMIT') throw error;
    }
  };
  wrapPackageResources();
  if (!packageSupervisor.memoryWatchdog) {
    const monitor = () => {
      for (const record of packageSupervisor.records.values()) {
        if (!['runtime', 'ready'].includes(String(record.lifecyclePhase || 'runtime').toLowerCase())) continue;
        try { samplePackageMemory(record.key); } catch {}
      }
    };
    try { packageSupervisor.memoryWatchdog = globalThis.setInterval?.(monitor, 3000); } catch { packageSupervisor.memoryWatchdog = null; }
  }
  const buildPackageBridge = ({ pkgKey, manifest, record, ctx = null, lifecycle = null }) => {
    const denied = scope => () => {
      throw new Error(`${scope} access denied for ${pkgKey}`);
    };
    const appendPackageOutput = entries => {
      const phase = String(lifecycle?.phase || state.packageLifecycle?.phase || '').toLowerCase();
      if (phase === 'install' || phase === 'uninstall') return;
      const target = ctx?.append && typeof ctx.append === 'function' ? ctx.append : apiRef.append;
      if (typeof target !== 'function') return;
      const list = Array.isArray(entries) ? entries : [];
      notePackageUsage(pkgKey, 'outputEntries', list.length, { limit: PACKAGE_LIMITS.outputEntriesWindow });
      target(list);
      samplePackageMemory(pkgKey);
    };
    const bridge = {
      packageKey: pkgKey,
      manifest: deepFreeze({
        ...manifest,
        help: String(manifest?.help || `${pkgKey} help`).trim() || `${pkgKey} help`
      }),
      record,
      append: appendPackageOutput,
      line: (text, cls = 'output') => makeLine(text, cls),
      spacer: makeSpacer,
      snapshot: () => apiRef.snapshot(),
      getMode: () => apiRef.getMode(),
      registerCommand: (name, meta) => {
        notePackageUsage(pkgKey, 'commandRegistrations', 1, { limit: PACKAGE_LIMITS.commandRegistrations });
        const wrap = fn => typeof fn === 'function' ? (...args) => withPackageContext(pkgKey, () => fn(...args)) : fn;
        const commandMeta = { ...(meta || {}) };
        for (const field of ['run', 'begin', 'next', 'cancel', 'resume']) if (typeof commandMeta[field] === 'function') commandMeta[field] = wrap(commandMeta[field]);
        const aliases = Array.isArray(commandMeta.aliases) ? commandMeta.aliases.length : 0;
        if (aliases) notePackageUsage(pkgKey, 'aliases', aliases, { limit: PACKAGE_LIMITS.aliases });
        const ok = registerCommand(name, commandMeta, { source: 'package', packageKey: pkgKey });
        if (!ok) {
          const rec = packageContext(pkgKey);
          if (rec) rec.counters.commandRegistrations = Math.max(0, Number(rec.counters.commandRegistrations || 0) - 1);
        }
        samplePackageMemory(pkgKey);
        return ok;
      },
      unregisterCommand: name => unregisterCommand(name),
      confirm: (title, detail) => requestYesNo(title, detail, ctx),
      permissions: Object.freeze(normalizePermissions(manifest)),
      storage: Object.freeze({
        get: key => {
          if (normalizePermissions(manifest).storage === 'none') throw new Error(`Storage access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          return localStorage.getItem(`munitos:pkg:${pkgKey}:${String(key)}`);
        },
        set: (key, value) => {
          if (normalizePermissions(manifest).storage === 'none') throw new Error(`Storage access denied for ${pkgKey}`);
          const fullKey = `munitos:pkg:${pkgKey}:${String(key)}`;
          const text = String(value ?? '');
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          notePackageUsage(pkgKey, 'storageBytes', text.length * 2, { bytes: true, limit: PACKAGE_LIMITS.storageBytesWindow });
          recordStorageBackup(pkgKey, fullKey);
          localStorage.setItem(fullKey, text);
          samplePackageMemory(pkgKey);
          return true;
        },
        remove: key => {
          if (normalizePermissions(manifest).storage === 'none') throw new Error(`Storage access denied for ${pkgKey}`);
          const fullKey = `munitos:pkg:${pkgKey}:${String(key)}`;
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          recordStorageBackup(pkgKey, fullKey);
          localStorage.removeItem(fullKey);
          return true;
        },
        keys: () => {
          if (normalizePermissions(manifest).storage === 'none') return [];
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          return Object.keys(localStorage).filter(k => k.startsWith(`munitos:pkg:${pkgKey}:`)).map(k => k.slice(`munitos:pkg:${pkgKey}:`.length));
        }
      }),
      cookies: Object.freeze({
        get: name => {
          if (normalizePermissions(manifest).cookies === 'none') return '';
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          return (document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(`${encodeURIComponent(String(name))}=`)) || '').split('=').slice(1).join('=');
        },
        set: (name, value) => {
          if (normalizePermissions(manifest).cookies === 'none') throw new Error(`Cookie access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          recordCookieBackup(pkgKey, name);
          document.cookie = `${encodeURIComponent(String(name))}=${encodeURIComponent(String(value ?? ''))}; path=/; SameSite=Lax`;
          return true;
        },
        remove: name => {
          if (normalizePermissions(manifest).cookies === 'none') throw new Error(`Cookie access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'storageOps', 1, { limit: PACKAGE_LIMITS.storageOpsWindow });
          recordCookieBackup(pkgKey, name);
          document.cookie = `${encodeURIComponent(String(name))}=; path=/; max-age=0`;
          return true;
        }
      }),
      network: Object.freeze({
        fetch: (input, init = {}) => {
          if (normalizePermissions(manifest).network === 'none') throw new Error(`Network access denied for ${pkgKey}`);
          return withPackageContext(pkgKey, () => fetch(input, { ...init, credentials: init.credentials ?? 'omit' }));
        },
        request: (input, init = {}) => {
          if (normalizePermissions(manifest).network === 'none') throw new Error(`Network access denied for ${pkgKey}`);
          return withPackageContext(pkgKey, () => fetch(input, { ...init, credentials: init.credentials ?? 'omit' }));
        }
      }),
      filesystem: Object.freeze({
        read: path => {
          if (normalizePermissions(manifest).filesystem === 'none') throw new Error(`Filesystem access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'filesystemOps', 1, { limit: PACKAGE_LIMITS.filesystemOpsWindow });
          const value = apiRef?.vfs?.read?.(path);
          notePackageUsage(pkgKey, 'filesystemBytes', Number(apiRef?.vfs?.byteLength?.(value) || value?.byteLength || String(value ?? '').length * 2), { bytes: true, limit: PACKAGE_LIMITS.filesystemBytesWindow });
          return value;
        },
        write: (path, data, options) => {
          if (normalizePermissions(manifest).filesystem === 'none') throw new Error(`Filesystem access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'filesystemOps', 1, { limit: PACKAGE_LIMITS.filesystemOpsWindow });
          const bytes = Number(apiRef?.vfs?.byteLength?.(data) || 0);
          notePackageUsage(pkgKey, 'filesystemBytes', bytes, { bytes: true, limit: PACKAGE_LIMITS.filesystemBytesWindow });
          recordFsBackup(pkgKey, path);
          const result = apiRef?.vfs?.write?.(path, data, options);
          samplePackageMemory(pkgKey);
          return result;
        },
        remove: path => {
          if (normalizePermissions(manifest).filesystem === 'none') throw new Error(`Filesystem access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'filesystemOps', 1, { limit: PACKAGE_LIMITS.filesystemOpsWindow });
          recordFsBackup(pkgKey, path);
          return apiRef?.vfs?.remove?.(path);
        },
        list: path => {
          if (normalizePermissions(manifest).filesystem === 'none') throw new Error(`Filesystem access denied for ${pkgKey}`);
          notePackageUsage(pkgKey, 'filesystemOps', 1, { limit: PACKAGE_LIMITS.filesystemOpsWindow });
          return apiRef?.vfs?.list?.(path) || [];
        }
      }),
      flow: Object.freeze({ begin: flowCtx => flowCtx, next: input => input, cancel: () => null, resume: () => null })
    };
    for (const key of Object.keys(bridge)) {
      Object.defineProperty(bridge, key, { writable: false, configurable: false });
    }
    return bridge;
  };
  const normalizePackageManifest = (pkgKey, mod, fallback = {}) => {
    const sourceManifest = mod?.manifest && typeof mod.manifest === 'object' ? mod.manifest : fallback;
    const normalizedName = String(sourceManifest?.name || pkgKey).trim() || pkgKey;
    const normalizedHelp = String(sourceManifest?.help || `${normalizedName} help`).trim() || `${normalizedName} help`;
    return deepFreeze({
      name: normalizedName,
      version: String(sourceManifest?.version || 'unknown').trim() || 'unknown',
      description: String(sourceManifest?.description || ''),
      author: String(sourceManifest?.author || 'unknown'),
      help: normalizedHelp,
      permissions: normalizePermissions(sourceManifest),
      commands: Array.isArray(sourceManifest?.commands) ? sourceManifest.commands.slice() : [],
      dependencies: Array.isArray(sourceManifest?.dependencies) ? sourceManifest.dependencies.slice() : [],
      entry: String(sourceManifest?.entry || 'install'),
      official: sourceManifest?.official === true
    });
  };
  const classifyPackageFailure = (err, meta = {}) => {
    const message = String(err?.message || err || '').toLowerCase();
    if (/entry_invalid|no valid install|valid install|install\(api\)/i.test(message)) return 'PACKAGE_ENTRY_INVALID';
    if (/syntax|unexpected token|invalid or unexpected token|evaluation/i.test(message)) return 'PACKAGE_SYNTAX_ERROR';
    if (/html|doctype|<html|source is html/i.test(message)) return 'PACKAGE_SOURCE_HTML';
    if (/fetch|cors|network|failed to load|source_unavailable/i.test(message)) return 'PACKAGE_SOURCE_UNAVAILABLE';
    if (/antivirus|analysis|rejected/i.test(message)) return 'PACKAGE_ANALYSIS_FAILED';
    if (/register command|command registration/i.test(message)) return 'PACKAGE_COMMAND_REGISTRATION_FAILED';
    if (/manifest|identity/i.test(message)) return 'PACKAGE_MANIFEST_INVALID';
    if (/https/i.test(message) && meta?.sourceType === 'https') return 'PACKAGE_HTTPS_LOAD_FAILED';
    return 'PACKAGE_INSTALL_FAILED';
  };
  const packageFailLines = (toolKey, pkgKey, stage, err, meta = {}) => {
    const code = classifyPackageFailure(err, meta);
    const sourceType = String(meta?.sourceType || 'unknown');
    const installMode = String(meta?.installMode || 'unknown');
    const transport = String(meta?.transport || 'unknown');
    const lines = [
      makeLine(`E: ${toolKey} failed to install ${pkgKey}`, 'danger'),
      makeLine(`Stage: ${stage}`, 'muted'),
      makeLine(`Code: ${code}`, 'danger'),
      makeLine(`Install Mode: ${installMode}`, 'muted'),
      makeLine(`Source Type: ${sourceType}`, 'muted'),
      makeLine(`Transport: ${transport}`, 'muted')
    ];
    if (meta?.resolved) lines.push(makeLine(`Resolved: ${String(meta.resolved)}`, 'dim'));
    if (meta?.globalKey) lines.push(makeLine(`Expected export: globalThis.${meta.globalKey}`, 'dim'));
    return lines;
  };
  const buildExternalAnalysisLines = (pkgKey, result) => {
    const risk=Math.max(0,Math.min(100,Number(result?.riskPercentage)||0)); const status=String(result?.status||'unknown').toUpperCase();
    const out=[makeLine(`Antivirus analysis: ${pkgKey}`,'accent'),makeLine(`Risk: ${risk}% | Status: ${status}`,result?.status==='dangerous'?'danger':result?.status==='suspicious'?'muted':'output'),makeLine(String(result?.summary||'External package analysis completed.'),'muted')];
    for(const finding of (Array.isArray(result?.findings)?result.findings:[]).slice(0,6)) out.push(makeLine(`${String(finding?.severity||'medium').toUpperCase()} ${String(finding?.code||'FINDING')}: ${String(finding?.message||finding?.reason||'')}`,'muted'));
    return out;
  };
  const analyzeExternalPackage = async ({packageName,source,manifest,resolved}) => {
    const managerAnalyze = globalThis.MUNITOSManager?.analyzeExternalPackage;
    if (typeof managerAnalyze === 'function') {
      return managerAnalyze({packageName,source,manifest,resolved});
    }
    const api=globalThis.MUNITOSAntivirusAPI; if(!api||typeof api.scan!=='function') throw new Error('ANTIVIRUS_API_UNAVAILABLE');
    const timeout=Math.max(3000,Math.min(20000,PACKAGE_TIMEOUT));
    const result=await Promise.race([Promise.resolve(api.scan({packageName,source,manifest,resolved})),new Promise((_,reject)=>setTimeout(()=>reject(new Error('ANTIVIRUS_API_TIMEOUT')),timeout))]);
    if(typeof api.validateResult==='function'&&!api.validateResult(result)) throw new Error('ANTIVIRUS_API_INVALID_RESPONSE');
    return result;
  };
  const installPackageInternal = async (rawInput, options = {}, ctx = null) => {
    const {force=false,silent=false,toolKey='pkg',installMode:requestedInstallMode='',preloaded=null,session=null,skipConfirmation=false,approvedHash='',restore=false,analysisResult=null}=options;
    const assertSession=()=>{if(session&&session.active!==true)throw new Error('PACKAGE_SESSION_EXPIRED');if(session&&Date.now()>session.deadlineAt){session.active=false;throw new Error('PACKAGE_SESSION_EXPIRED');}};
    assertSession(); const raw=String(rawInput??'').trim(); if(!raw)return[makeLine(`${toolKey} install: missing package name or URL`,'danger')];
    let normalized,packageKey=getRemotePackageDisplayName(raw);
    try{normalized=normalizeInstallSource(raw);}catch(error){return packageFailLines(toolKey,packageKey,'source',error,{sourceType:'unknown',installMode:'invalid',transport:'unknown'});}
    const installMode=String(requestedInstallMode||resolveInstallMode({toolKey,target:raw,normalized})).toLowerCase();
    if(!['internal','external-https'].includes(installMode))return packageFailLines(toolKey,packageKey,'source',new Error('INVALID_INSTALL_MODE'),{sourceType:'invalid',installMode,transport:'unknown'});
    if(installMode==='external-https'&&normalized.kind!=='remote')return packageFailLines(toolKey,packageKey,'source',new Error('PACKAGE_HTTPS_SOURCE_REQUIRED'),{sourceType:'invalid',installMode,transport:'unknown'});
    if(installMode==='internal'&&normalized.kind!=='local')return packageFailLines(toolKey,packageKey,'source',new Error('PACKAGE_INTERNAL_SOURCE_REQUIRED'),{sourceType:'invalid',installMode,transport:'unknown'});
    if(normalized.kind==='remote')packageKey=getUrlFileStem(normalized.value)||packageKey; packageKey=String(packageKey).trim()||'pkg';
    const appendFn=ctx?.append&&typeof ctx.append==='function'?ctx.append:appendTranscript; const emit=entries=>{if(!silent&&Array.isArray(entries)&&entries.length)appendFn(entries)}; const emitStep=(text,cls='muted')=>{assertSession();if(!silent)emit([makeLine(text,cls)])};
    const existing = loadPackageRecord(packageKey);
    const wasInstalled = state.installedPackages.has(packageKey) && state.pkgModules.has(packageKey);
    const hadSuccessfulRecord = Boolean(existing && ['installed', 'enabled', 'verified'].includes(String(existing.status || '').toLowerCase()) && existing.enabled !== false);
    if ((wasInstalled || hadSuccessfulRecord) && !force) return [makeLine(`Package ${packageKey} is already installed.`, 'danger')];
    const preliminary=normalized.kind==='local'?buildLocalPackagePath(normalized.value):normalized.value; const sourceKind=installMode==='external-https'?'https':'internal';
    let fetched=null,manifest=null,globalKey=makePackageGlobalKey(packageKey),analysis=analysisResult;
    try{
      if(installMode==='internal'){
        emitStep(`Loading internal package ${packageKey}...`); fetched=preloaded||await loadPackageViaScript(normalized,packageKey,{fresh:true,sandbox:false}); assertSession();
        const mod=fetched.module; if(!mod||typeof mod.install!=='function')throw new Error('PACKAGE_ENTRY_INVALID');
        manifest=normalizePackageManifest(packageKey,mod,{name:packageKey,version:'unknown',permissions:{},commands:[],dependencies:[]}); const canonical=getCanonicalPackageName(packageKey,manifest);
        if(canonical!==packageKey){
          if(state.installedPackages.has(canonical)||state.pkgModules.has(canonical)||state.pkgRegistry.has(canonical)) throw new Error('PACKAGE_IDENTITY_COLLISION');
          const requestedKey = packageKey;
          migratePackageIdentity(requestedKey,canonical);
          migrateSupervisorIdentity(requestedKey,canonical);
          packageKey=canonical;
          globalKey=makePackageGlobalKey(packageKey);
        }
        const supervisor=getSupervisorRecord(packageKey,manifest); supervisor.sourceKind='internal'; supervisor.installMode='internal'; supervisor.lifecyclePhase='install';
        beginPackageLifecycle(packageKey,'install'); try{await withPackageContext(packageKey,()=>mod.install(buildPackageBridge({pkgKey:packageKey,manifest,record:state.pkgRegistry.get(packageKey),ctx,lifecycle:{phase:'install'}})));}finally{endPackageLifecycle(packageKey);supervisor.lifecyclePhase='runtime';}
        assertSession(); const hash=String(fetched.hash||'').toLowerCase(); if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('PACKAGE_HASH_INVALID');
        state.installedPackages.add(packageKey); state.pkgModules.set(packageKey,{module:mod,manifest,hash,source:fetched.source,sourceKind:'internal',resolved:fetched.resolved,transport:fetched.transport,status:'installed',exportKey:fetched.exportKey||fetched.globalKey||globalKey});
        markPackageStatus(packageKey,{status:'enabled',enabled:true,manifest,sourceKind:'internal',installMode:'internal',resolved:fetched.resolved,transport:fetched.transport,exportKey:fetched.exportKey||fetched.globalKey||globalKey,quarantined:false,sandbox:'not-applicable',trust:'internal',approval:'internal-trusted',antivirus:{status:'not-applicable',riskPercentage:null},hash:{current:hash,trusted:hash,reference:hash,status:existing?.hash?.current&&existing.hash.current!==hash?'updated':'initialized',updated:Boolean(existing?.hash?.current&&existing.hash.current!==hash),checkedAt:Date.now()},error:null});
      } else {
        emitStep(`Fetching external package ${packageKey}...`); fetched=preloaded||await loadPackageSource(normalized,packageKey,{fresh:true}); assertSession();
        const supervisor=getSupervisorRecord(packageKey,{}); supervisor.sourceKind='https'; supervisor.installMode='external-https'; supervisor.lifecyclePhase='evaluate';
        const evaluated=evaluatePackageSource(fetched.source,packageKey,fetched.resolved,{sandbox:true}); supervisor.lifecyclePhase='runtime'; const mod=evaluated.module;
        manifest=normalizePackageManifest(packageKey,mod,{name:packageKey,version:'unknown',permissions:{},commands:[],dependencies:[]}); const canonical=getCanonicalPackageName(packageKey,manifest);
        if(canonical!==packageKey){
          if(state.installedPackages.has(canonical)||state.pkgModules.has(canonical)||state.pkgRegistry.has(canonical)) throw new Error('PACKAGE_IDENTITY_COLLISION');
          const requestedKey = packageKey;
          migratePackageIdentity(requestedKey,canonical);
          migrateSupervisorIdentity(requestedKey,canonical);
          packageKey=canonical;
          globalKey=makePackageGlobalKey(packageKey);
        }
        const hash=String(fetched.hash||'').toLowerCase(); if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('PACKAGE_HASH_INVALID');
        const trusted=String(existing?.hash?.trusted||'').toLowerCase(); if(restore&&trusted&&trusted!==hash)throw new Error('PACKAGE_HASH_CHANGED');
        analysis=analysis||await analyzeExternalPackage({packageName:packageKey,source:fetched.source,manifest,resolved:fetched.resolved});
        if (!skipConfirmation && !restore) {
          emit(buildExternalAnalysisLines(packageKey, analysis));
          const approved = await requestYesNo(`Confirm external package: ${packageKey}`, `Risk ${Number(analysis?.riskPercentage) || 0}% (${String(analysis?.status || 'unknown')}). Enable this external package?`, ctx);
          if (!approved) {
            if (!wasInstalled) {
              state.pkgRegistry.delete(packageKey);
              state.pkgCache.delete(packageKey);
            } else if (existing) {
              state.pkgRegistry.set(packageKey, existing);
            }
            return [makeSpacer(), makeLine(`Package ${packageKey} remains disabled.`, 'muted')];
          }
        }
        beginPackageLifecycle(packageKey,'install'); try{await withPackageContext(packageKey,()=>mod.install(buildPackageBridge({pkgKey:packageKey,manifest,record:state.pkgRegistry.get(packageKey),ctx,lifecycle:{phase:'install'}})));}finally{endPackageLifecycle(packageKey);supervisor.lifecyclePhase='runtime';}
        assertSession(); const trustedHash=String(approvedHash||hash).toLowerCase(); state.installedPackages.add(packageKey); state.pkgModules.set(packageKey,{module:mod,manifest,hash,source:fetched.source,sourceKind:'https',resolved:fetched.resolved,transport:fetched.transport,status:'installed',exportKey:evaluated.exportKey||evaluated.globalKey||makePackageGlobalKey(packageKey)});
        markPackageStatus(packageKey,{status:'enabled',enabled:true,manifest,sourceKind:'https',installMode:'external-https',resolved:fetched.resolved,transport:fetched.transport,exportKey:evaluated.exportKey||evaluated.globalKey||makePackageGlobalKey(packageKey),quarantined:false,sandbox:'active',trust:'user-approved',approval:'approved',antivirus:{...analysis,checkedAt:Date.now()},hash:{current:hash,trusted:trustedHash,reference:trustedHash,status:trusted&&trusted!==hash?'updated':'unchanged',updated:Boolean(trusted&&trusted!==hash),checkedAt:Date.now()},error:null});
      }
      refreshStaticRuntimeState();syncLiveEntries();persistPackageRegistry();persistPackageCache();persist(); if(silent)return[]; return[makeLine(`${toolKey}: ${packageKey} installed successfully.`,'accent')];
    }catch(err){
      const transport=fetched?.transport||(installMode==='external-https'?'fetch':'script'); const resolved=fetched?.resolved||preliminary;
      const failedModule=fetched?.module||null;
      if(failedModule&&typeof failedModule.uninstall==='function'){
        try{await Promise.resolve(failedModule.uninstall(buildPackageBridge({pkgKey:packageKey,manifest:manifest||{},record:existing||null,ctx,lifecycle:{phase:'uninstall'}})))}catch{}
      }
      try{restorePackageResources(packageKey,{rollback:true})}catch{}
      try{unregisterPackageCommands(packageKey)}catch{};
      try{const keys=new Set([globalKey,makePackageGlobalKey(packageKey),makePackageGlobalKey(getUrlFileStem(resolved))].filter(Boolean));for(const k of keys){try{delete window[k]}catch{}try{delete globalThis[k]}catch{}}}catch{}
      if (String(err?.message || '') === 'PACKAGE_HASH_CHANGED') {
        quarantinePackage(packageKey, 'hash-changed', { packageKey, previousHash: existing?.hash?.trusted, currentHash: fetched?.hash || '' });
      } else {
        state.installedPackages.delete(packageKey);
        state.pkgModules.delete(packageKey);
        if (existing && wasInstalled) {
          state.pkgRegistry.set(packageKey, existing);
        } else {
          state.pkgRegistry.delete(packageKey);
          state.pkgCache.delete(packageKey);
        }
      }
      return packageFailLines(toolKey,packageKey,'install',err,{sourceType:sourceKind,installMode,transport,globalKey,resolved});
    }
  };
  const installPackage = installPackageInternal;
  const removePackage = async pkgName => {
    const key = String(pkgName ?? '').trim();
    if (!key) return [makeLine('Package removal failed: missing package name.', 'danger')];
    if (!state.installedPackages.has(key)) return [makeLine(`Package ${key} is not installed.`, 'danger')];
    const pkgData = state.pkgModules.get(key);
    const registryRecord = state.pkgRegistry.get(key);
    let uninstallError = null;
    try {
      if (pkgData?.module && typeof pkgData.module.uninstall === 'function') {
        const lifecycle = { phase: 'uninstall' };
        beginPackageLifecycle(key, 'uninstall');
        try {
          await Promise.resolve(pkgData.module.uninstall(buildPackageBridge({
            pkgKey: key,
            manifest: pkgData.manifest,
            record: registryRecord,
            lifecycle
          })));
        } finally {
          lifecycle.phase = 'runtime';
          endPackageLifecycle(key);
        }
      }
    } catch (error) {
      uninstallError = error;
    }
    if (uninstallError) {
      try { restorePackageResources(key, { rollback: true }); } catch {}
      persistPackageState();
      persist();
      return packageFailLines('pkg', key, 'uninstall', uninstallError, {
        sourceType: registryRecord?.sourceKind || 'internal',
        installMode: registryRecord?.installMode || 'internal',
        transport: registryRecord?.transport || 'internal',
        globalKey: pkgData?.exportKey || registryRecord?.exportKey || makePackageGlobalKey(key),
        resolved: registryRecord?.resolved || key
      });
    }
    try { restorePackageResources(key, { rollback: false }); } catch {}
    unregisterPackageCommands(key);
    state.installedPackages.delete(key);
    state.pkgModules.delete(key);
    refreshStaticRuntimeState();
    syncLiveEntries();
    const exportKey = pkgData?.exportKey || registryRecord?.exportKey || makePackageGlobalKey(key);
    try {
      delete window[exportKey];
    } catch {}
    try {
      delete globalThis[exportKey];
    } catch {}
    state.pkgRegistry.delete(key);
    state.pkgCache.delete(key);
    persistPackageRegistry();
    persistPackageCache();
    persistPackageState();
    persist();
    return [makeLine(`Package ${key} removed successfully.`, 'accent')];
  };
  const quarantinePackage = (packageKey, reason='runtime-policy', incident=null) => {
    const key=String(packageKey??'').trim(); if(!key)return false; const previous=state.pkgRegistry.get(key)||{}; const pkgData=state.pkgModules.get(key);
    try{restorePackageResources(key,{rollback:true})}catch{} try{unregisterPackageCommands(key)}catch{} const exportKey=String(pkgData?.exportKey||previous.exportKey||makePackageGlobalKey(key)); try{delete window[exportKey]}catch{} try{delete globalThis[exportKey]}catch{}
    state.installedPackages.delete(key); state.pkgModules.delete(key);
    markPackageStatus(key,{...previous,status:'quarantined',enabled:false,quarantined:true,quarantinedAt:Date.now(),quarantineReason:String(reason),approval:'required',trust:'invalidated',error:'PACKAGE_QUARANTINED',securityIncident:incident||null,hash:{...(previous.hash||{}),status:String(reason).toLowerCase().includes('hash')?'changed':(previous.hash?.status||'quarantined'),trusted:String(previous.hash?.trusted||''),current:String(previous.hash?.current||''),checkedAt:Date.now()}});
    persistPackageRegistry();persistPackageState();try{refreshStaticRuntimeState();syncLiveEntries();persist()}catch{} emitKernelEvent('package-quarantined',{packageKey:key,reason,incident}); return true;
  };
  const packageTargetList = () => Array.from(state.pkgRegistry.values()).map(rec=>String(rec?.key||'').trim()).filter(Boolean);
  const packageSourceFor = pkg => { const rec=loadPackageRecord(pkg); const source=String(rec?.resolved||'').trim(); const mode=String(rec?.installMode||(rec?.sourceKind==='https'?'external-https':'internal')); return {source:mode==='external-https'&&/^https:\/\//i.test(source)?source:pkg,options:{force:true,silent:true,toolKey:'pkg',installMode:mode,restore:true,skipConfirmation:true,approvedHash:String(rec?.hash?.trusted||'')}}; };
  const refreshPackageHashes = async () => {
    await loadPackageCatalog(); const records=Array.from(state.pkgRegistry.values()).filter(rec=>rec?.key); let internalUpdated=0,externalQuarantined=0,unavailable=0;
    const results=await bufferLoop.run(records,async rec=>{ const key=String(rec.key).trim(); const external=String(rec.installMode|| (rec.sourceKind==='https'?'external-https':'internal')).toLowerCase()==='external-https'||String(rec.sourceKind||'').toLowerCase()==='https'; const source=String(rec.resolved||'').trim(); if(!source)return{key,kind:external?'external':'internal',status:'missing'};
      try{const loaded=await loadPackageSource(external?{kind:'remote',value:source}:{kind:'local',value:key},key,{fresh:true});const current=String(loaded.hash||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(current))throw new Error('PACKAGE_HASH_INVALID');
        if(external){const trusted=String(rec.hash?.trusted||'').toLowerCase();if(trusted&&trusted!==current){quarantinePackage(key,'hash-changed',{packageKey:key,previousHash:trusted,currentHash:current});return{key,kind:'external',status:'quarantined'};}const good=Boolean(trusted);markPackageStatus(key,{hash:{...(rec.hash||{}),current, trusted, reference:trusted||current,status:good?'unchanged':'untrusted',updated:false,checkedAt:Date.now()},hashStatus:good?'unchanged':'untrusted',approval:good?'approved':'required',trust:good?'user-approved':'untrusted',sandbox:'required',enabled:Boolean(good&&rec.enabled),status:good&&rec.enabled?'enabled':(rec.status==='quarantined'?'quarantined':'disabled')},{persist:false});return{key,kind:'external',status:good?'unchanged':'untrusted'};}
        const prior=String(rec.hash?.current||rec.hash?.reference||'').toLowerCase();const updated=Boolean(prior&&prior!==current);markPackageStatus(key,{hash:{...(rec.hash||{}),current,trusted:current,reference:current,status:updated?'updated':'unchanged',updated,checkedAt:Date.now()},hashStatus:updated?'updated':'unchanged',trust:'internal',approval:'internal-trusted',sandbox:'not-applicable',enabled:Boolean(rec.enabled),status:'enabled'},{persist:false});return{key,kind:'internal',status:updated?'updated':'unchanged'};
      }catch(error){unavailable++;markPackageStatus(key,{hash:{...(rec.hash||{}),status:'unavailable',checkedAt:Date.now()},hashStatus:'unavailable',hashError:String(error?.message||'HASH_CHECK_FAILED')},{persist:false});return{key,kind:external?'external':'internal',status:'unavailable',error:String(error?.message||'')};}
    });
    internalUpdated=results.filter(x=>x?.status==='updated').length;externalQuarantined=results.filter(x=>x?.kind==='external'&&x?.status==='quarantined').length;persistPackageRegistry();persistPackageCache();return{internalUpdated,externalQuarantined,unavailable,results};
  };
  const restoreOptionalPackages = async (ctx=null) => {
    const out = [];
    let loadedCount = 0;
    const records = Array.from(state.pkgRegistry.values())
      .filter(rec => rec?.key)
      .sort((a, b) => Number(String(a.installMode || '') === 'external-https') - Number(String(b.installMode || '') === 'external-https'));
    for (const rec of records) {
      const key = String(rec.key || '').trim();
      if (!key || !rec.enabled || ['quarantined', 'disabled', 'verification-pending'].includes(String(rec.status || '').toLowerCase())) continue;
      if (String(rec.installMode || 'internal') === 'external-https' && String(rec.hash?.status || '') !== 'unchanged') continue;
      const src = packageSourceFor(key);
      if (String(rec.installMode || 'internal') === 'external-https') src.options.analysisResult = rec.antivirus || null;
      try {
        const result = await installPackage(src.source, src.options, ctx);
        if (state.pkgModules.has(key)) loadedCount++;
        if (Array.isArray(result) && result.length) {
          const failed = result.some(x => /^E:\s/i.test(String(x?.text || '')) || /^Code:\s+PACKAGE_/i.test(String(x?.text || '')));
          if (failed) out.push(...result.slice(0, 8));
        }
      } catch (error) {
        const current = loadPackageRecord(key) || rec;
        const currentStatus = String(current.status || '').toLowerCase();
        const terminal = ['quarantined', 'disabled', 'verification-pending'].includes(currentStatus);
        markPackageStatus(key, {
          status: terminal ? current.status : 'restore-failed',
          enabled: Boolean(current.enabled),
          lastRestoreAt: Date.now(),
          lastRestoreError: String(error?.message || error || 'PACKAGE_RESTORE_FAILED').slice(0, 240)
        }, { persist: false });
        out.push(makeLine(`Package ${key} could not be restored; it remains available for retry.`, 'danger'));
        out.push(makeLine(String(error?.message || error || 'PACKAGE_RESTORE_FAILED'), 'muted'));
      }
      await yieldToBrowser();
    }
    Object.defineProperty(out, 'loadedCount', { value: loadedCount, enumerable: false });
    return out;
  };
  const scheduleBackgroundRestore = ctx => { if(backgroundRestoreScheduled)return false;backgroundRestoreScheduled=true;const run=async()=>{try{await restoreOptionalPackages(ctx)}catch{}finally{backgroundRestoreScheduled=false}};if(globalThis.MUNITOSOptimizer?.idle)globalThis.MUNITOSOptimizer.idle(()=>{void run()},1500);else setTimeout(()=>{void run()},1500);return true; };
  const resolveLazyPackageForCommand = commandName => { const name=String(commandName||'').trim().toLowerCase();if(!name)return null;for(const rec of state.pkgRegistry.values()){if(['quarantined','disabled','verification-pending'].includes(String(rec?.status||'').toLowerCase()))continue;const commands=Array.isArray(rec?.manifest?.commands)?rec.manifest.commands:[];if(commands.some(command=>String(command||'').trim().toLowerCase()===name))return String(rec.key||'').trim()||null;}return null; };
  const preparePackageEnable = async (packageKey, ctx=null) => { const key=String(packageKey||'').trim();const rec=loadPackageRecord(key);if(!rec)return{ok:false,error:'PACKAGE_NOT_FOUND'};if(String(rec.installMode||'internal')==='internal')return{ok:true,internal:true,packageKey:key};const source=String(rec.resolved||'').trim();if(!/^https:\/\//i.test(source))return{ok:false,error:'PACKAGE_SOURCE_INVALID'};const loaded=await loadPackageSource({kind:'remote',value:source},key,{fresh:true});const hash=String(loaded.hash||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(hash))return{ok:false,error:'PACKAGE_HASH_INVALID'};const evaluated=evaluatePackageSource(loaded.source,key,loaded.resolved,{sandbox:true});const manifest=normalizePackageManifest(key,evaluated.module,rec.manifest||{});const analysis=await analyzeExternalPackage({packageName:key,source:loaded.source,manifest,resolved:loaded.resolved});const hashChanged=Boolean(rec.hash?.trusted&&String(rec.hash.trusted).toLowerCase()!==hash);if(hashChanged)quarantinePackage(key,'hash-changed-before-activation',{packageKey:key,previousHash:rec.hash?.trusted,currentHash:hash});return{ok:true,internal:false,packageKey:key,source:loaded.resolved,loaded,hash,manifest,analysis,hashChanged}; };
  const commitPackageEnable = async (plan, ctx=null) => { const p=plan||{};if(!p.ok)return{ok:false,error:p.error||'PACKAGE_PLAN_INVALID'};if(p.internal){const result=await installPackage(p.packageKey,{force:true,silent:true,toolKey:'pkg',installMode:'internal'},ctx);return{ok:state.pkgModules.has(p.packageKey),output:result};}const rec=loadPackageRecord(p.packageKey);if(!rec)return{ok:false,error:'PACKAGE_NOT_FOUND'};const fresh=await loadPackageSource({kind:'remote',value:String(rec.resolved||p.source)},p.packageKey,{fresh:true});if(String(fresh.hash||'').toLowerCase()!==String(p.hash||'').toLowerCase()){quarantinePackage(p.packageKey,'hash-changed-during-activation',{packageKey:p.packageKey,expected:p.hash,current:fresh.hash});return{ok:false,error:'PACKAGE_HASH_CHANGED'};}const result=await installPackage(fresh.resolved,{force:true,silent:true,toolKey:'pkg',installMode:'external-https',skipConfirmation:true,approvedHash:fresh.hash,analysisResult:p.analysis},ctx);return{ok:state.pkgModules.has(p.packageKey),output:result}; };
  const disablePackage = async packageKey => { const key=String(packageKey||'').trim();if(!key)return{ok:false,error:'PACKAGE_NAME_MISSING'};const rec=loadPackageRecord(key);if(!rec)return{ok:false,error:'PACKAGE_NOT_FOUND'};try{restorePackageResources(key,{rollback:false})}catch{}try{unregisterPackageCommands(key)}catch{}const pkgData=state.pkgModules.get(key);const exportKey=String(pkgData?.exportKey||rec.exportKey||'');if(exportKey){try{delete window[exportKey]}catch{}try{delete globalThis[exportKey]}catch{}}state.installedPackages.delete(key);state.pkgModules.delete(key);markPackageStatus(key,{status:'disabled',enabled:false,approval:rec.sourceKind==='https'?'required':'internal-trusted',trust:rec.sourceKind==='https'?'untrusted':'internal',sandbox:rec.sourceKind==='https'?'required':'not-applicable'});refreshStaticRuntimeState();syncLiveEntries();persistPackageState();persist();return{ok:true,packageKey:key}; };
  const ensurePackageLoaded = async (packageKey,ctx=null) => { const key=String(packageKey||'').trim();if(!key)return false;if(state.pkgModules.has(key))return true;const rec=loadPackageRecord(key);if(!rec||!rec.enabled||['quarantined','verification-pending','disabled'].includes(String(rec.status||'').toLowerCase()))return false;if(String(rec.installMode||'internal')==='external-https'){const fresh=await loadPackageSource({kind:'remote',value:String(rec.resolved||'')},key,{fresh:true});if(String(fresh.hash||'').toLowerCase()!==String(rec.hash?.trusted||'').toLowerCase()){quarantinePackage(key,'hash-changed',{packageKey:key,previousHash:rec.hash?.trusted,currentHash:fresh.hash});return false;}await installPackage(fresh.resolved,{force:true,silent:true,toolKey:'pkg',installMode:'external-https',restore:true,skipConfirmation:true,approvedHash:fresh.hash},ctx).catch(()=>{});return state.pkgModules.has(key);}await installPackage(key,{force:true,silent:true,toolKey:'pkg',installMode:'internal'},ctx).catch(()=>{});return state.pkgModules.has(key); };
  const ensureRestorablePackageRecords = async () => {
    const catalog = await loadPackageCatalog();
    const entries = Array.isArray(catalog?.packages) ? catalog.packages : [];
    if (!entries.length || !state.installedPackages.size) return 0;
    const byName = new Map(entries.map(entry => [String(entry?.name || '').trim(), entry]).filter(([key]) => Boolean(key)));
    let added = 0;
    for (const key of state.installedPackages) {
      if (state.pkgRegistry.has(key)) continue;
      const entry = byName.get(key);
      if (!entry || String(entry.source || 'internal').toLowerCase() !== 'internal') continue;
      state.pkgRegistry.set(key, {
        key,
        name: key,
        version: String(entry.version || 'unknown'),
        manifest: { name: key, version: String(entry.version || 'unknown'), description: String(entry.description || ''), commands: [] },
        sourceKind: 'internal',
        installMode: 'internal',
        resolved: String(entry.path || buildLocalPackagePath(key)),
        enabled: true,
        status: 'enabled',
        trust: 'internal',
        approval: 'internal-trusted',
        sandbox: 'not-applicable',
        hash: { current: '', trusted: '', reference: '', status: 'unknown', updated: false },
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      added++;
    }
    if (added) persistPackageRegistry();
    return added;
  };
  const reinstallPackages = async (ctx=null,options={}) => {
    await cleanupRuntime();
    normalizePersistedPackageIdentities();
    try { await ensureRestorablePackageRecords(); } catch {}
    let report = { internalUpdated: 0, externalQuarantined: 0, unavailable: 0 };
    try { report = await refreshPackageHashes(ctx); } catch (error) {
      report = { ...report, unavailable: Math.max(1, Number(report.unavailable) || 0), error: String(error?.message || error || '') };
    }
    const output = [];
    if (report.internalUpdated) output.push(makeLine(`${report.internalUpdated} internal packages were automatically updated.`, 'accent'));
    if (report.externalQuarantined) output.push(makeLine(`${report.externalQuarantined} external packages were disabled because their content/hash changed.`, 'danger'));
    if (report.unavailable) output.push(makeLine(`${report.unavailable} package hash check(s) were unavailable; affected packages remain untrusted or disabled.`, 'muted'));
    let loadedCount = 0;
    let backgroundScheduled = false;
    if (options.background === true) {
      try {
        const extra = await restoreOptionalPackages(ctx);
        loadedCount = Number(extra?.loadedCount) || 0;
        if (extra.length) output.push(...extra);
      } catch (error) {
        output.push(makeLine(`Package restoration completed with recoverable errors: ${String(error?.message || error || 'PACKAGE_RESTORE_FAILED')}`, 'danger'));
      }
    } else {
      backgroundScheduled = scheduleBackgroundRestore(ctx);
    }
    try { refreshStaticRuntimeState(); } catch {}
    try { syncLiveEntries(); } catch {}
    try { persistPackageState(); } catch {}
    try { persist(); } catch {}
    Object.defineProperty(output, 'loadedCount', { value: loadedCount, enumerable: false });
    Object.defineProperty(output, 'backgroundScheduled', { value: options.background !== true && backgroundScheduled, enumerable: false });
    return output;
  };
  const removePackagePublic = async (...args) => { const lines = await removePackage(...args); persistPackageState(); return lines; };
  startBootWorker();
  const bindKernel = api => { bind(api); restorePackageState(); refreshStaticRuntimeState(); scheduleCapabilityProbe(); return true; };
  const reset = () => {
    const packages = Array.from(new Set([...state.installedPackages, ...state.pkgModules.keys(), ...state.pkgRegistry.keys()]));
    for (const pkg of packages) {
      const pkgData = state.pkgModules.get(pkg);
      try { restorePackageResources(pkg, { rollback: false }); } catch {}
      if (pkgData?.module && typeof pkgData.module.uninstall === 'function') {
        try { void pkgData.module.uninstall(buildPackageBridge({ pkgKey: pkg, manifest: pkgData.manifest, record: state.pkgRegistry.get(pkg), lifecycle: { phase: 'uninstall' } })); } catch {}
      }
      try { unregisterPackageCommands(pkg); } catch {}
      const exportKey = String(pkgData?.exportKey ?? '').trim();
      if (exportKey) {
        try { delete window[exportKey]; } catch {}
        try { delete globalThis[exportKey]; } catch {}
      }
    }
    state.installedPackages.clear();
    state.pkgModules.clear();
    state.pkgRegistry.clear();
    state.pkgCache.clear();
    state.packageLifecycle = null;
    try {
      const storage=getStorage();
      storage?.removeItem(PACKAGE_STATE_KEY);
      storage?.removeItem(PACKAGE_REGISTRY_KEY);
      storage?.removeItem(PACKAGE_CACHE_KEY);
    } catch {}
    refreshStaticRuntimeState();
    return true;
  };
  const snapshot = () => ({ installed:Array.from(state.installedPackages), registry:Array.from(state.pkgRegistry.values()), cache:Array.from(state.pkgCache.values()), antivirus:{available:Boolean(globalThis.MUNITOSAntivirusAPI?.scan)}, timeoutMs:PACKAGE_TIMEOUT, buffer:{size:bufferLoop.getSize(),min:bufferConfig.min,max:bufferConfig.max} });
  const getPackageStatus = packageKey => { const key=String(packageKey||'').trim();const rec=loadPackageRecord(key);if(!key||!rec)return null;const installed=state.installedPackages.has(key)||state.pkgModules.has(key);return Object.freeze({packageName:key,internal:String(rec.installMode||'internal')!=='external-https'&&String(rec.sourceKind||'internal')!=='https',sourceKind:rec.sourceKind||'internal',installMode:rec.installMode||'internal',enabled:Boolean(rec.enabled&&installed),status:rec.status||'unknown',sandbox:rec.sandbox||'not-applicable',hashStatus:rec.hash?.status||'unknown',hashCurrent:rec.hash?.current||'',hashTrusted:rec.hash?.trusted||'',trusted:rec.trust==='internal'||rec.trust==='user-approved',quarantined:Boolean(rec.quarantined||rec.status==='quarantined'),update:Boolean(rec.hash?.updated||rec.hash?.status==='updated'),approval:rec.approval||'unknown',approvalRequired:!['internal-trusted','approved'].includes(String(rec.approval||'')),approved:['internal-trusted','approved'].includes(String(rec.approval||'')),antivirus:rec.antivirus||{status:'not-applicable',riskPercentage:null},version:String(rec.manifest?.version||'unknown'),description:String(rec.manifest?.description||''),resolved:String(rec.resolved||'')}); };
  const getPackageInventory = () => {
    const keys = new Set(state.installedPackages);
    for (const key of state.pkgModules.keys()) keys.add(key);
    return Array.from(keys)
      .map(key => getPackageStatus(key))
      .filter(record => record && record.enabled && ['enabled', 'active', 'installed', 'verified'].includes(String(record.status || '').toLowerCase()))
      .sort((a, b) => a.packageName.localeCompare(b.packageName, undefined, { sensitivity: 'base', numeric: true }));
  };
  const cleanupRuntime = async () => {
    let result = null;
    try {
      if (window.__MUNITOSBootOptimizer?.cleanup) result = await window.__MUNITOSBootOptimizer.cleanup();
    } catch {}
    return result || window.__MUNITOSBootOptimizer?.snapshot?.() || null;
  };
  const optimizeRuntime = async () => {
    const cleanup = await cleanupRuntime();
    let worker = workerSnapshot();
    try {
      await workerTask('ping', {}, 2500);
      workerRuntime.status = 'ready';
      workerRuntime.readyAt = workerRuntime.readyAt || Date.now();
      worker = workerSnapshot();
    } catch {}
    try { await detectBrowserCapabilities(); } catch {}
    tuneKernelExecution();
    try { if (typeof apiRef?.vfs?.runtime?.refreshFiles === 'function') apiRef.vfs.runtime.refreshFiles(); } catch {}
    return Object.freeze({ cleanup, worker, capabilities: capabilitySnapshot(), buffer: { ...bufferConfig } });
  };
  const kernelApi = Object.freeze({ version:KERNEL_CONFIG.version, config:KERNEL_CONFIG, capabilities:capabilitySnapshot, probe:detectBrowserCapabilities, probeCapabilities:detectBrowserCapabilities, on:onKernelEvent, snapshot:()=>Object.freeze({version:KERNEL_CONFIG.version,config:KERNEL_CONFIG,capabilities:capabilitySnapshot(),packageCount:Number(state?.pkgRegistry?.size)||0,installedCount:Number(state?.installedPackages?.size)||0,buffer:{...bufferConfig},worker:workerSnapshot(),bootOptimizer:window.__MUNITOSBootOptimizer?.snapshot?.()||null}), scheduler:Object.freeze({profile:()=>kernelCapabilities.profile,concurrency:()=>bufferLoop.getSize(),setConcurrency:value=>bufferLoop.setSize(value),yield:yieldToBrowser}), worker:Object.freeze({status:workerSnapshot,request:workerTask,ping:()=>workerTask('ping',{},4000),bench:iterations=>workerTask('bench',{iterations},15000),stats:()=>workerTask('stats',{},4000),start:()=>{startWorkerRuntime();return workerSnapshot();}}), optimize:optimizeRuntime, cleanup:cleanupRuntime, isWorkerReady:workerReady, package:Object.freeze({resolveLazyCommand:resolveLazyPackageForCommand,ensureLoaded:ensurePackageLoaded,quarantine:quarantinePackage,resource:pkg=>{const r=sandboxedPackageContext(pkg);return r?Object.freeze({key:r.key,counters:{...r.counters},strikes:r.strikes,lastIncident:r.lastIncident||null}):null}}) });
  const api = Object.freeze({ bind:bindKernel, installPackage, removePackage:removePackagePublic, reinstallPackages, restorePackageState, persistPackageRegistry, persistPackageCache, persistPackageState, loadPackageCatalog, getPackageCatalogEntry, resolveLazyPackageForCommand, ensurePackageLoaded, quarantinePackage, getRemotePackageDisplayName, normalizeInstallSource, resolveInstallMode, normalizePermissions, summarizePermissions, packageFailLines, markPackageStatus, getPackageStatus, getPackageInventory, preparePackageEnable, commitPackageEnable, disablePackage, refreshPackageHashes, isPackageLifecycleOutputBlocked, reset, snapshot, bufferLoop, timeoutMs:PACKAGE_TIMEOUT, state:()=>state, kernel:kernelApi });
  Object.defineProperty(window, 'MUNITOSVK', { value: api, writable: false, configurable: false });
  try { Object.defineProperty(window, 'MUNITOSKernel', { value: kernelApi, writable: false, configurable: false }); } catch {}
  if (window.MUNITOSCore?.state) bindKernel(window.MUNITOSCore);
})();
