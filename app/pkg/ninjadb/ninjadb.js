(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'ninjadb',
    version: '1.0.0',
    description: 'NinjaDB — MUNITOS sensitive-path scanner powered by 23 DB modules.',
    help: 'ninjadb help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'medium',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'read',
      filesystem: 'none'
    }),
    commands: Object.freeze(['ninjadb']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, maxFormsToTest: 200, mainTaskLimit: 384, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, maxFormsToTest: 80, mainTaskLimit: 48, label: 'LOW-POWER (mobile)' })
  });

  const DB_BASE = (() => { try { return new URL('../../assets/DB/', document.baseURI).href; } catch { return '/assets/DB/'; } })();
  const DB_FILES = Object.freeze([
    'admin-panels.txt', 'api-endpoints.txt', 'attack-patterns.txt',
    'backup-paths.txt', 'cloud-devops.txt', 'config-secrets.txt',
    'cpanel-paths.txt', 'cve-paths.txt', 'darkweb-leaks.txt',
    'database-dumps.txt', 'database-json.txt', 'joomla-drupal-magento.txt',
    'json-db.txt', 'logs.txt', 'path-traversal.txt',
    'plugin-vulns.txt', 'premium-wordlists.txt', 'sensitive-files.txt',
    'servers.txt', 'sitemap-misc.txt', 'version-control.txt',
    'web-server-paths.txt', 'wordpress.txt'
  ]);

  const CACHE_BUSTER = '?v=1';
  const DB_TIMEOUT_MS = 5000;
  const DB_RETRIES = 3;
  const PROBE_TIMEOUT_MS = 8000;
  const SCAN_TIMEOUT_MS = 12000;

  let aborted = false;
  let DB_CACHE = null;

  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };

  const fetchNetwork = async (url, options = {}) => {
    const network = getNetworkApi();
    if (!network?.fetch) throw new Error('FreeUserProxy network API is not available.');
    const { timeout: _timeout, ...requestOptions } = options || {};
    return network.fetch(url, requestOptions);
  };

  function getFreeUserProxy() { try { return globalThis.__FreeUserProxy || null; } catch { return null; } }
  function isFreeUserProxyAvailable() { return Boolean(getFreeUserProxy()?.api?.proxy?.fetch || getFreeUserProxy()?.getWorkingProxies); }
  function pickFreeProxyUrl() {
    try {
      const fup = getFreeUserProxy();
      const pick = fup?.getRandomWorkingProxy?.();
      if (typeof pick === 'string') return pick;
      return pick?.template || pick?.url || pick?.proxy || null;
    } catch { return null; }
  }
  function applyProxyTemplate(template, url) {
    if (!template) return String(url);
    if (!String(template).includes('{url}')) return String(template);
    return String(template).replace(/\{url\}/g, encodeURIComponent(String(url)));
  }
  function normalizeTargetUrl(input) {
    let value=String(input??'').trim().replace(/^['"]+|['"]+$/g,'');
    if(!value)return null;
    if(!/^https?:\/\//i.test(value))value='https://'+value;
    try{const u=new URL(value);return u.hostname?u.origin:null;}catch{return null;}
  }
  function joinUrl(origin,path){return origin+(String(path).startsWith('/')?String(path):'/'+String(path));}
  const NLPAI=Object.freeze({
    analyze(){const signals=this.collectSignals(),score=this.score(signals),base=this.selectBaseProfile(signals,score),tuned=this.tuneConcurrency(base,signals,score);return{signals,score,profile:tuned.profile,effectiveConcurrent:tuned.concurrent,reasoning:tuned.reasoning};},
    collectSignals(){const nav=typeof navigator==='object'&&navigator?navigator:{},conn=nav.connection||nav.mozConnection||nav.webkitConnection||null,cores=Number(nav.hardwareConcurrency||0)||4,mem=Number(nav.deviceMemory||0)||4;return{cores,mem,effectiveType:conn?.effectiveType||null,downlink:typeof conn?.downlink==='number'?conn.downlink:null,rtt:typeof conn?.rtt==='number'?conn.rtt:null};},
    score(s){let score=50;if(s.cores>=16)score+=30;else if(s.cores>=8)score+=20;else if(s.cores>=4)score+=10;else score-=10;if(s.mem>=16)score+=25;else if(s.mem>=8)score+=15;else if(s.mem>=4)score+=5;else score-=10;switch(s.effectiveType){case'4g':score+=20;break;case'3g':score+=5;break;case'2g':score-=10;break;case'slow-2g':score-=20;break;}if(typeof s.downlink==='number'){if(s.downlink>=20)score+=15;else if(s.downlink>=10)score+=10;else if(s.downlink>=5)score+=5;else if(s.downlink<1)score-=10;}if(typeof s.rtt==='number'){if(s.rtt<=50)score+=10;else if(s.rtt<=150)score+=5;else if(s.rtt>400)score-=15;else if(s.rtt>150)score-=5;}return Math.max(0,Math.min(100,score));},
    selectBaseProfile(_s,score){return score>=30?PROFILES.high:PROFILES.low;},
    tuneConcurrency(base,s,score){const span=base.maxConcurrent-base.minConcurrent,t=Math.max(0,Math.min(1,(score-30)/70));let concurrent=Math.round(base.minConcurrent+span*t);const hwCap=Math.max(16,s.cores*32);concurrent=Math.min(concurrent,hwCap);concurrent=Math.max(base.minConcurrent,Math.min(base.maxConcurrent,concurrent));return{profile:base,concurrent,reasoning:`score=${score} cores=${s.cores} mem=${s.mem}GB net=${s.effectiveType||'n/a'}`};}
  });
  class AdaptiveWorkerPool {
    constructor({concurrent,mainTaskLimit}){this.concurrent=Math.max(1,concurrent|0);this.mainTaskLimit=Math.max(1,mainTaskLimit|0);this.active=0;this.cursor=0;this.queue=[];this.stats={dispatched:0,succeeded:0,failed:0,skipped:0};}
    setConcurrency(n){this.concurrent=Math.max(1,n|0);}
    async run(items,handler){this.queue=Array.isArray(items)?items.slice():[];this.cursor=0;this.stats={dispatched:0,succeeded:0,failed:0,skipped:0};const workerCount=Math.min(this.queue.length,this.concurrent,this.mainTaskLimit);await Promise.all(Array.from({length:workerCount},()=>this._worker(handler)));return this.stats;}
    async _worker(handler){while(!aborted&&this.cursor<this.queue.length){const idx=this.cursor++,item=this.queue[idx];this.active++;this.stats.dispatched++;try{const result=await handler(item,idx);if(result==='skip')this.stats.skipped++;else this.stats.succeeded++;}catch{this.stats.failed++;}finally{this.active--;}}}
  }
  async function tryDirectFetch(url,timeoutMs){
    try{const res=await fetchWithTimeout(url,{method:'GET',redirect:'follow',credentials:'omit',headers:{Accept:'*/*'}},timeoutMs);return{ok:true,res,via:'direct'};}catch(error){const msg=String(error?.message||error);if(/abort/i.test(msg))return{ok:false,reason:'timeout'};return{ok:false,reason:/cors|networkerror|failed to fetch|load failed/i.test(msg)?'cors':'network'};}
  }
  async function tryProxyFetch(url,timeoutMs){
    try{const network=getNetworkApi();if(!network?.resolve)throw new Error('NO_PROXY_API');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);const prepared=await network.resolve(url,{method:'GET',redirect:'follow',credentials:'omit',headers:{Accept:'*/*'}});const res=await globalThis.fetch(prepared.url,{...prepared.options,signal:controller.signal});clearTimeout(timer);return{ok:true,res,via:prepared.direct?'direct':'free-user-proxy',proxy:prepared.proxy||null};}catch(error){return{ok:false,reason:/abort/i.test(String(error?.message||error))?'timeout':'proxy-failed'};}
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = PROBE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchNetwork(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function fetchChecked(url, timeoutMs) {
    const direct = await tryDirectFetch(url, timeoutMs);
    if (direct.ok) return direct;
    if (direct.reason === 'timeout') return direct;
    return tryProxyFetch(url, timeoutMs);
  }

  async function signatureOfResponse(res) {
    let len = res.headers.get('content-length');
    let type = res.headers.get('content-type') || '';
    const status = res.status;
    if (!len) {
      try {
        const clone = res.clone();
        const buf = await clone.arrayBuffer();
        len = String(buf.byteLength);
        const txt = new TextDecoder('utf-8', { fatal: false })
          .decode(buf.slice(0, 2048)).toLowerCase();
        if (/not found|404|page not found|does not exist/.test(txt)) {
          type = 'text/html; charset=not-found';
        }
      } catch (_) { len = '0'; }
    }
    return `${status}|${type}|${len}`;
  }

  function isHealthy(sig, baseline, status) {
    if (!sig) return false;
    if (baseline.notFound && sig === baseline.notFound) return false;
    if (baseline.root && sig === baseline.root) return false;
    if (status >= 400 && status !== 401 && status !== 403) return false;
    return true;
  }

  async function buildBaseline(origin) {
    const randomPath = '/ninjadb-' + Math.random().toString(36).slice(2, 14) + '-' + Date.now();
    const notFoundUrl = origin + randomPath + CACHE_BUSTER;
    const rootUrl = origin + '/' + CACHE_BUSTER;
    const baseline = { notFound: null, root: null };
    const nf = await fetchChecked(notFoundUrl, PROBE_TIMEOUT_MS);
    if (nf.ok) baseline.notFound = await signatureOfResponse(nf.res);
    const rt = await fetchChecked(rootUrl, PROBE_TIMEOUT_MS);
    if (rt.ok) baseline.root = await signatureOfResponse(rt.res);
    return baseline;
  }

  async function loadDbFile(filename) {
    const url = DB_BASE + filename + CACHE_BUSTER;
    for (let attempt = 1; attempt <= DB_RETRIES; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {
          method: 'GET', cache: 'force-cache', credentials: 'omit'
        }, DB_TIMEOUT_MS);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (!text || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
          throw new Error('not plain-text');
        }
        return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      } catch (e) {
        if (attempt === DB_RETRIES) return null;
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
    return null;
  }

  async function phaseNormalize(rawUrl, api) {
    api.append([api.line('── Phase 1/3 · URL Normalization ──', 'accent')]);
    const origin = normalizeTargetUrl(rawUrl);
    if (!origin) {
      api.append([api.line('invalid URL: ' + rawUrl, 'danger')]);
      return null;
    }
    const p = new URL(origin);
    api.append([
      api.line('  origin   : ' + origin, 'muted'),
      api.line('  protocol : ' + p.protocol.replace(':', ''), 'dim'),
      api.line('  host     : ' + p.hostname, 'dim')
    ]);
    return origin;
  }

  async function phasePreload(api) {
    api.append([api.line('── Phase 2/3 · DB Preload (?v=1 · 3×retry · 5s timeout) ──', 'accent')]);
    const db = {};
    let ok = 0;
    for (let i = 0; i < DB_FILES.length; i++) {
      const f = DB_FILES[i];
      const t0 = Date.now();
      const lines = await loadDbFile(f);
      const dt = Date.now() - t0;
      if (lines && lines.length) {
        db[f] = lines; ok++;
        api.append([api.line(`  [${String(i + 1).padStart(2, '0')}/${DB_FILES.length}] ${f.padEnd(28)} ${String(lines.length).padStart(6)} paths  ${dt}ms`, 'dim')]);
      } else {
        api.append([api.line(`  [${String(i + 1).padStart(2, '0')}/${DB_FILES.length}] ${f.padEnd(28)} FAILED (${dt}ms)`, 'muted')]);
      }
    }
    api.append([api.line(`  loaded ${ok}/${DB_FILES.length} DB modules`, 'success')]);
    DB_CACHE = db;
    return db;
  }

  async function phaseScan(origin, db, profile, aiInfo, api) {
    api.append([
      api.line('── Phase 3/3 · Adaptive Scan ──', 'accent'),
      api.line(`  profile  : ${profile.label}`, 'purple'),
      api.line(`  workers  : ${aiInfo.effectiveConcurrent}  (min ${profile.minConcurrent} · max ${profile.maxConcurrent})`, 'purple'),
      api.line(`  reasoning: ${aiInfo.reasoning}`, 'dim')
    ]);

    const baseline = await buildBaseline(origin);
    api.append([
      api.line('  baseline 404 : ' + (baseline.notFound || 'n/a'), 'dim'),
      api.line('  baseline root: ' + (baseline.root || 'n/a'), 'dim')
    ]);

    const hits = [];
    const viaCount = { direct: 0, proxy: 0 };
    const pool = new AdaptiveWorkerPool({
      concurrent: aiInfo.effectiveConcurrent,
      mainTaskLimit: profile.mainTaskLimit
    });

    const files = Object.keys(db);
    const t0 = Date.now();

    for (let fi = 0; fi < files.length; fi++) {
      if (aborted) break;
      const filename = files[fi];
      const paths = db[filename];
      api.append([api.line(`  ▶ [${fi + 1}/${files.length}] ${filename}  ·  ${paths.length} paths  ·  scanning`, 'accent')]);

      if (fi > 0 && fi % 3 === 0) {
        const drift = (Math.random() - 0.5) * 0.1;
        const next = Math.round(aiInfo.effectiveConcurrent * (1 + drift));
        pool.setConcurrency(Math.max(profile.minConcurrent, Math.min(profile.maxConcurrent, next)));
      }

      const fileHits = [];
      await pool.run(paths, async (path) => {
        if (aborted) return 'skip';
        const full = joinUrl(origin, path);
        let attempt = await fetchChecked(full, SCAN_TIMEOUT_MS);
        if (!attempt.ok) {
          if (attempt.reason === 'cors' || attempt.reason === 'network') {
            attempt = await fetchChecked(full, SCAN_TIMEOUT_MS);
          } else if (attempt.reason === 'timeout') {
            return 'skip';
          }
        }
        if (!attempt.ok) return 'skip';
        let sig;
        try { sig = await signatureOfResponse(attempt.res); }
        catch (_) { return 'skip'; }
        if (!isHealthy(sig, baseline, attempt.res.status)) return 'skip';
        if (attempt.via === 'direct') viaCount.direct++;
        else viaCount.proxy++;
        const entry = {
          url: full,
          via: attempt.via,
          status: attempt.res.status,
          sig,
          file: filename
        };
        fileHits.push(entry);
        hits.push(entry);
        return entry;
      });

      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (fileHits.length) {
        api.append([api.line(`     ✓ ${fileHits.length} healthy  ·  ${dt}s`, 'success')]);
      } else {
        api.append([api.line(`     · 0 healthy  ·  ${dt}s`, 'dim')]);
      }
    }

    return { hits, viaCount, stats: pool.stats, duration: (Date.now() - t0) / 1000 };
  }

  async function runScan(rawUrl, mode, api) {
    aborted = false;
    const aiInfo = NLPAI.analyze();
    let profile;
    if (mode === 'low') profile = PROFILES.low;
    else if (mode === 'high') profile = PROFILES.high;
    else profile = aiInfo.profile;

    if (mode === 'low' && aiInfo.effectiveConcurrent > profile.maxConcurrent) {
      aiInfo.effectiveConcurrent = profile.maxConcurrent;
    }
    if (mode === 'high' && aiInfo.effectiveConcurrent < profile.minConcurrent) {
      aiInfo.effectiveConcurrent = profile.minConcurrent;
    }

    const origin = await phaseNormalize(rawUrl, api);
    if (!origin) return [];

    const db = DB_CACHE && Object.keys(DB_CACHE).length ? DB_CACHE : await phasePreload(api);
    if (!Object.keys(db).length) {
      api.append([api.line('no DB modules loaded — aborting', 'danger')]);
      return [];
    }

    const { hits, viaCount, stats, duration } = await phaseScan(origin, db, profile, aiInfo, api);

    api.append([
      api.spacer(),
      api.line('═════════════════════════════════════════════', 'accent'),
      api.line('  NINJADB · SCAN REPORT', 'accent'),
      api.line('═════════════════════════════════════════════', 'accent'),
      api.line(`  target   : ${origin}`, 'muted'),
      api.line(`  profile  : ${profile.label}`, 'purple'),
      api.line(`  workers  : ${aiInfo.effectiveConcurrent}`, 'purple'),
      api.line(`  duration : ${duration.toFixed(1)}s`, 'muted'),
      api.line(`  modules  : ${Object.keys(db).length}`, 'muted'),
      api.spacer()
    ]);

    if (hits.length) {
      api.append([api.line('  HEALTHY FINDINGS', 'accent'), api.line('  ─────────────────────────────────────────', 'dim')]);
      const byFile = {};
      for (const h of hits) (byFile[h.file] = byFile[h.file] || []).push(h);
      for (const file of Object.keys(byFile)) {
        api.append([api.line(`  ▸ ${file}`, 'purple')]);
        for (const h of byFile[file]) {
          const statusStr = String(h.status).padEnd(3);
          const viaStr = h.via === 'direct' ? 'direct' : h.via;
          api.append([api.line(`      ✓  ${h.url}  [${statusStr}]  ${viaStr}`, 'success')]);
        }
        api.spacer();
      }
      api.append([
        api.line('  ─────────────────────────────────────────', 'dim'),
        api.line(`  ${hits.length} healthy paths  ·  ${Object.keys(byFile).length} modules  ·  ${viaCount.direct} direct  ·  ${viaCount.proxy} proxy`, 'accent'),
        api.line(`  dispatched ${stats.dispatched}  ·  succeeded ${stats.succeeded}  ·  skipped ${stats.skipped}`, 'dim')
      ]);
    } else {
      api.append([
        api.line('  NO HEALTHY PATHS FOUND', 'muted'),
        api.line(`  dispatched ${stats.dispatched}  ·  succeeded ${stats.succeeded}  ·  skipped ${stats.skipped}`, 'dim')
      ]);
    }

    api.append([api.line('═════════════════════════════════════════════', 'accent')]);
    return [];
  }

  const COMMANDS = Object.freeze({
    ninjadb: {
      description: 'NinjaDB — MUNITOS sensitive-path scanner.',
      usage: 'ninjadb <scan|lowscan|profile|help> [args]',
      aliases: ['ndb'],
      kind: 'plain',
      run: async ({ args = [], api } = {}) => {
        const sub = (args[0] || '').toLowerCase();
        const rest = args.slice(1);

        if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
          return [
            api.line('ninjadb — MUNITOS Package', 'accent'),
            api.line('author: ', 'dim'),
            api.spacer(),
            api.line('Usage:', 'accent'),
            api.line('  ninjadb scan    <url>     high-power scan (NLP-AI profile)', 'muted'),
            api.line('  ninjadb lowscan <url>     low-power scan (mobile-safe)', 'muted'),
            api.line('  ninjadb profile           show NLP-AI analysis', 'muted'),
            api.line('  ninjadb help              show this help', 'muted')
          ];
        }

        if (sub === 'scan' || sub === 'highscan') {
          const url = rest.join(' ').trim();
          if (!url) return [api.line('usage: ninjadb scan <url>', 'danger')];
          return runScan(url, 'high', api);
        }

        if (sub === 'lowscan') {
          const url = rest.join(' ').trim();
          if (!url) return [api.line('usage: ninjadb lowscan <url>', 'danger')];
          return runScan(url, 'low', api);
        }
          if (sub === 'profile' || sub === 'ai') {
          const info = NLPAI.analyze();
          return [
            api.line('NLP-AI Runtime Analysis', 'accent'),
            api.line('───────────────────────', 'dim'),
            api.line('  score      : ' + info.score, 'purple'),
            api.line('  profile    : ' + info.profile.label, 'purple'),
            api.line('  workers    : ' + info.effectiveConcurrent, 'purple'),
            api.line('  reasoning  : ' + info.reasoning, 'dim'),
            api.spacer(),
            api.line('PROFILES:', 'accent'),
            api.line('  high → concurrent ' + PROFILES.high.concurrent + '  min ' + PROFILES.high.minConcurrent + '  max ' + PROFILES.high.maxConcurrent, 'muted'),
            api.line('  low  → concurrent ' + PROFILES.low.concurrent + '  min ' + PROFILES.low.minConcurrent + '  max ' + PROFILES.low.maxConcurrent, 'muted')
          ];
        }

        return [api.line('unknown subcommand: ' + sub + ' (try: ninjadb help)', 'danger')];
      }
    }
  });

  const install = async (api) => {
    for (const name of MANIFEST.commands) {
      const def = COMMANDS[name];
      if (!def) throw new Error(`COMMAND_NOT_DECLARED:${name}`);
      const ok = api.registerCommand(name, def);
      if (ok === false) throw new Error(`PACKAGE_COMMAND_REGISTRATION_FAILED:${name}`);
    }
    return [];
  };

  const uninstall = async (api) => {
    aborted = true;
    for (const name of MANIFEST.commands) api.unregisterCommand(name);
    DB_CACHE = null;
    return [];
  };

  window.__munitos_pkg_ninjadb = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall,
    __internal: Object.freeze({
      PROFILES,
      NLPAI,
      normalizeTargetUrl,
      getNetworkApi,
      getFreeUserProxy,
      isFreeUserProxyAvailable,
      pickFreeProxyUrl,
      applyProxyTemplate,
      joinUrl,
      AdaptiveWorkerPool
    })
  });
})();
