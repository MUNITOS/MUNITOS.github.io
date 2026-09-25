(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'sitescanner',
    version: '1.0.0',
    description: 'High-speed passive OSINT web scanner with baseline fingerprinting and adaptive worker pool.',
    help: 'sitescanner help',
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
    commands: Object.freeze(['sitescanner']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'sitescanner';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_sitescanner';

  const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, timeout: 8000, probeTimeout: 5000, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, timeout: 8000, probeTimeout: 7000, label: 'LOW-POWER' })
  });

  const DEFAULTS = Object.freeze({
    dnsApi: 'https://dns.google/resolve?name=',
    ipApi: 'https://ipwho.is/',
    ipinfoApi: 'https://ipinfo.io/{ip}/json',
    crtshApi: 'https://crt.sh/?q=%25.{domain}&output=json',
    waybackApi: 'https://web.archive.org/cdx/search/cdx?url={domain}&output=json&limit=10&filter=statuscode:200',
    rdapApi: 'https://rdap.org/domain/{domain}',
    bufferoverApi: 'https://dns.bufferover.run/dns?q=.{domain}',
    hackertargetApi: 'https://api.hackertarget.com/hostsearch/?q={domain}',
    sslinfoApi: 'https://api.hackertarget.com/sslinfo/?q={domain}',
    timeout: 9000,
    probeTimeout: 5000
  });

  const state = {
    api: null,
    settings: { ...DEFAULTS },
    proxyList: [],
    customProxy: null,
    proxyReady: false,
    runtime: {
      activeProfile: 'high',
      baseline: null,
      concurrency: 64
    }
  };

  // ==================== Utilities ====================
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (t, c = 'output') => state.api.line(String(t ?? ''), c);
  const SP = () => state.api.spacer();

  const hashText = s => {
    const str = String(s || '');
    let h = 5381;
    const lim = Math.min(str.length, 8192);
    for (let i = 0; i < lim; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  };

  const NOT_FOUND_PATTERNS = [
    /<title>\s*404/i, /<title>[^<]*not[\s-]*found/i, /page[\s-]+not[\s-]+found/i,
    /the[\s-]+requested[\s-]+url[\s-]+was[\s-]+not[\s-]+found/i, /nothing[\s-]+here/i,
    /does[\s-]+not[\s-]+exist/i, /error[\s-]*404/i, /404[\s-]*not[\s-]*found/i,
    /resource[\s-]+not[\s-]+found/i, /<h1[^>]*>\s*404\s*<\/h1>/i, /<h2[^>]*>\s*404\s*<\/h2>/i
  ];
  const looksLikeErrorPage = text => {
    const lower = String(text || '').slice(0, 4096).toLowerCase();
    return NOT_FOUND_PATTERNS.some(re => re.test(lower));
  };

  // ==================== Proxy layer ====================
  function getFreeUserProxy() {
    try { return window.__FreeUserProxy || globalThis.__FreeUserProxy || null; } catch { return null; }
  }
  const isValidProxyTemplate = t => typeof t === 'string' && t.trim().length > 0 && t.includes('{url}');
  const proxied = (t, url) => { if (!isValidProxyTemplate(t)) throw new Error('Invalid proxy template'); return t.replace('{url}', encodeURIComponent(String(url))); };

  async function testCustomProxy(template) {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 5000);
      const res = await fetch(proxied(template, 'https://httpbin.org/get'), { method: 'HEAD', signal: c.signal, mode: 'cors' });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }

  async function prepareProxyList(force = false) {
    if (!force && state.proxyReady && state.proxyList.length > 0) return state.proxyList;
    const fup = getFreeUserProxy();
    if (!fup || typeof fup.getWorkingProxies !== 'function') throw new Error('FreeUserProxy is not available.');
    let working = [];
    try { working = fup.getWorkingProxies() || []; } catch { working = []; }
    if (!Array.isArray(working)) working = [];
    if (state.customProxy && state.customProxy.includes('{url}')) {
      const okCustom = await testCustomProxy(state.customProxy);
      if (okCustom && !working.some(p => p.template === state.customProxy)) working.push({ name: 'custom', template: state.customProxy });
    }
    if (working.length === 0) throw new Error('No working proxies available.');
    state.proxyList = working;
    state.proxyReady = true;
    return working;
  }

  let proxyIdx = 0;
  const getNextProxy = () => {
    if (state.proxyList.length === 0) throw new Error('No proxy available.');
    const p = state.proxyList[proxyIdx % state.proxyList.length];
    proxyIdx = (proxyIdx + 1) % state.proxyList.length;
    return p;
  };

  function getRandomUserAgent() {
    const fup = getFreeUserProxy();
    if (fup && typeof fup.getRandomUserAgent === 'function') { try { const ua = fup.getRandomUserAgent(); if (ua) return ua; } catch {} }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  }

  async function fetchWithProxy(url, options = {}) {
    if (state.proxyList.length === 0) await prepareProxyList();
    const finalOptions = { ...options, headers: { 'User-Agent': getRandomUserAgent(), ...(options.headers || {}) } };
    const maxAttempts = Math.min(state.proxyList.length, 3);
    let lastError = null;
    for (let i = 0; i < maxAttempts; i++) {
      const proxy = state.proxyList[i % state.proxyList.length];
      try {
        const proxyUrl = proxied(proxy.template, url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), state.settings.timeout);
        const res = await fetch(proxyUrl, { ...finalOptions, signal: controller.signal, mode: 'cors' });
        clearTimeout(timer);
        if (res.ok || res.status < 400) return res;
        if (res.status === 429) await sleep(1000);
      } catch (err) { lastError = err; }
    }
    throw new Error(`Fetch failed for ${url}${lastError ? `: ${lastError.message}` : ''}`);
  }

  async function fetchText(url, options = {}) {
    const res = await fetchWithProxy(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  }
  async function fetchJSON(url, options = {}) {
    const res = await fetchWithProxy(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON from ${url}`); }
  }

  // ==================== Adaptive Worker Pool ====================
  class AdaptiveWorkerPool {
    constructor(concurrency) {
      this.concurrency = Math.max(1, concurrency | 0);
      this.active = 0;
      this.cursor = 0;
      this.queue = [];
    }
    setConcurrency(n) { this.concurrency = Math.max(1, n | 0); }
    async run(items, handler) {
      this.queue = items.slice();
      this.cursor = 0;
      const workers = [];
      for (let i = 0; i < Math.min(this.concurrency, items.length); i++) workers.push(this._worker(handler));
      await Promise.all(workers);
    }
    async _worker(handler) {
      while (this.cursor < this.queue.length) {
        const idx = this.cursor++;
        const item = this.queue[idx];
        this.active++;
        try { await handler(item, idx); } catch (_) {} finally { this.active--; }
      }
    }
  }

  // ==================== URL normalization ====================
  function normalizeTarget(rawUrl) {
    let value = String(rawUrl || '').trim();
    if (!value) throw new Error('URL is required');
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    let url;
    try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
    if (!url.pathname || url.pathname === '') url.pathname = '/';
    return url.href;
  }

  const normalizeHostname = h => String(h || '').trim().replace(/\.$/, '').toLowerCase();
  const isValidHostname = h => {
    const v = normalizeHostname(h);
    if (!v || v.length > 253) return false;
    return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(v);
  };

  // ==================== Baseline fingerprinting ====================
  async function buildBaseline(origin) {
    const randPath = `/__sitescanner_nf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const nfUrl = origin + randPath;
    const rootUrl = origin + '/';
    const baseline = { notFoundHash: null, notFoundLen: null, rootHash: null, rootLen: null, corsReadable: false };
    const safeFetch = async url => { try { return await fetchText(url, { timeout: state.settings.probeTimeout }); } catch { return ''; } };
    const [nf, rt] = await Promise.all([safeFetch(nfUrl), safeFetch(rootUrl)]);
    if (nf) { baseline.notFoundHash = hashText(nf); baseline.notFoundLen = nf.length; baseline.corsReadable = true; }
    if (rt) { baseline.rootHash = hashText(rt); baseline.rootLen = rt.length; baseline.corsReadable = true; }
    return baseline;
  }

  const isMirror = (text, baseline) => {
    if (!baseline || !text) return false;
    const h = hashText(text), len = text.length;
    if (baseline.notFoundHash && h === baseline.notFoundHash && baseline.notFoundLen === len) return true;
    if (baseline.rootHash && h === baseline.rootHash && baseline.rootLen === len) return true;
    return false;
  };

  // ==================== DNS ====================
  const DNS_TYPES = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'SRV', 'CAA', 'NAPTR', 'DS', 'DNSKEY', 'PTR'];

  async function resolveDNS(hostname, type = 'A') {
    const host = normalizeHostname(hostname);
    const recordType = String(type || 'A').toUpperCase();
    if (!host) throw new Error('Hostname is required');
    if (!DNS_TYPES.includes(recordType)) throw new Error(`Unsupported DNS type: ${recordType}`);
    const data = await fetchJSON(`${state.settings.dnsApi}${encodeURIComponent(host)}&type=${encodeURIComponent(recordType)}`);
    return Array.isArray(data?.Answer) ? data.Answer.map(r => ({ type: r.type, data: r.data, TTL: r.TTL })) : [];
  }
  const resolveIP = h => resolveDNS(h, 'A').then(r => r.map(x => x.data).filter(Boolean)).catch(() => []);
  const resolveIPv6 = h => resolveDNS(h, 'AAAA').then(r => r.map(x => x.data).filter(Boolean)).catch(() => []);
  const resolvePTR = async ip => {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(ip || ''))) return [];
    const parts = String(ip).split('.').map(Number);
    if (parts.some(p => p < 0 || p > 255)) return [];
    return resolveDNS(`${parts.reverse().join('.')}.in-addr.arpa`, 'PTR').then(r => r.map(x => x.data).filter(Boolean)).catch(() => []);
  };

  async function getIPInfoPrimary(ip) { try { return await fetchJSON(`${state.settings.ipApi}${encodeURIComponent(ip)}`); } catch { return null; } }
  async function getIPInfoSecondary(ip) { try { return await fetchJSON(state.settings.ipinfoApi.replace('{ip}', encodeURIComponent(ip))); } catch { return null; } }
  async function checkDNSBL(ip) {
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(ip || ''))) return 'N/A';
    const parts = String(ip).split('.').map(Number);
    if (parts.some(p => p < 0 || p > 255)) return 'N/A';
    try {
      const data = await fetchJSON(`https://dns.google/resolve?name=${parts.reverse().join('.')}.zen.spamhaus.org&type=A`);
      return Array.isArray(data?.Answer) && data.Answer.some(r => String(r.data).startsWith('127.')) ? 'Listed' : 'Not listed';
    } catch { return 'Unknown'; }
  }

  async function getSSLCert(domain) {
    try {
      const safe = normalizeHostname(domain);
      if (!isValidHostname(safe)) return null;
      const data = await fetchJSON(state.settings.crtshApi.replace('{domain}', encodeURIComponent(safe)));
      const entries = Array.isArray(data) ? data.filter(Boolean) : [];
      if (!entries.length) return null;
      return [...entries].sort((a, b) => {
        const at = Date.parse(a?.entry_timestamp || a?.not_before || '') || Number(a?.id) || 0;
        const bt = Date.parse(b?.entry_timestamp || b?.not_before || '') || Number(b?.id) || 0;
        return bt - at;
      })[0] || null;
    } catch { return null; }
  }
  async function getSSLInfo(domain) {
    try {
      const safe = normalizeHostname(domain);
      if (!isValidHostname(safe)) return null;
      const text = await fetchText(state.settings.sslinfoApi.replace('{domain}', encodeURIComponent(safe)));
      const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
      const info = {};
      for (const row of rows) { const sep = row.indexOf(':'); if (sep <= 0) continue; const k = row.slice(0, sep).trim().toLowerCase(); const v = row.slice(sep + 1).trim(); if (k && v) info[k] = v; }
      return Object.keys(info).length ? info : null;
    } catch { return null; }
  }
  async function fetchWaybackCount(domain) {
    try { const safe = normalizeHostname(domain); if (!isValidHostname(safe)) return 0; const data = await fetchJSON(state.settings.waybackApi.replace('{domain}', encodeURIComponent(safe))); return Array.isArray(data) ? data.length : 0; } catch { return 0; }
  }
  async function fetchRDAP(domain) {
    try { const safe = normalizeHostname(domain); if (!isValidHostname(safe)) return null; return await fetchJSON(state.settings.rdapApi.replace('{domain}', encodeURIComponent(safe))); } catch { return null; }
  }
  async function fetchSubsBufferOver(domain) {
    try { const safe = normalizeHostname(domain); if (!isValidHostname(safe)) return []; const data = await fetchJSON(state.settings.bufferoverApi.replace('{domain}', encodeURIComponent(safe))); const rows = Array.isArray(data?.FDNS_A) ? data.FDNS_A : []; return rows.map(e => String(e).split(',')[0].trim()).map(normalizeHostname).filter(h => h && (h === safe || h.endsWith('.' + safe))); } catch { return []; }
  }
  async function fetchSubsHackerTarget(domain) {
    try { const safe = normalizeHostname(domain); if (!isValidHostname(safe)) return []; const text = await fetchText(state.settings.hackertargetApi.replace('{domain}', encodeURIComponent(safe))); return text.split(/\r?\n/).map(r => r.trim()).filter(Boolean).map(r => r.split(',')[0]).map(normalizeHostname).filter(h => h && (h === safe || h.endsWith('.' + safe))); } catch { return []; }
  }

  const cleanHostname = v => { let h = String(v || '').trim().toLowerCase(); if (!h) return null; h = h.replace(/^\*\.\s*/, ''); try { if (h.includes('://')) h = new URL(h).hostname; } catch {} h = h.replace(/\.$/, ''); return h || null; };
  const isSubOf = (h, d) => { const a = cleanHostname(h), b = normalizeHostname(d); if (!a || !b) return false; return a === b || a.endsWith('.' + b); };

  // ==================== HTML / Tech analysis ====================
  function parseHTML(html, baseUrl = '') {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const count = s => doc.querySelectorAll(s).length;
    const meta = n => doc.querySelector(`meta[name="${n}"]`)?.getAttribute('content') || '';
    const metaProp = p => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content') || '';
    let base; try { base = new URL(baseUrl); } catch { base = null; }
    const resolve = raw => { try { return base ? new URL(raw, base.href).href : new URL(raw).href; } catch { return raw; } };
    const links = [...doc.querySelectorAll('a[href]')].map(a => resolve(a.getAttribute('href'))).filter(Boolean);
    const bh = base?.hostname?.toLowerCase() || '';
    const internal = links.filter(h => { try { return new URL(h).hostname.toLowerCase() === bh; } catch { return false; } });
    const doctype = doc.doctype?.name?.toLowerCase() || 'html';
    return {
      title: doc.querySelector('title')?.textContent?.trim() || '(none)',
      metaDescription: meta('description'), metaKeywords: meta('keywords'), metaAuthor: meta('author'),
      metaGenerator: meta('generator'), canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      charset: doc.characterSet || '', lang: doc.documentElement?.getAttribute('lang') || '',
      htmlVersion: doctype === 'html' ? 'HTML5' : doctype.toUpperCase(),
      headings: { h1: count('h1'), h2: count('h2'), h3: count('h3'), h4: count('h4'), h5: count('h5'), h6: count('h6') },
      images: count('img'), links: links.length, internalLinks: internal.length, externalLinks: links.length - internal.length,
      scripts: count('script[src]'), inlineScripts: count('script:not([src])'), stylesheets: count('link[rel="stylesheet"]'), forms: count('form'),
      ogTitle: metaProp('og:title'), ogDescription: metaProp('og:description'), twitterCard: meta('twitter:card')
    };
  }

  function detectTech(headersObj, html) {
    const H = {}; Object.entries(headersObj || {}).forEach(([k, v]) => { H[k.toLowerCase()] = String(v); });
    const body = String(html || '').toLowerCase();
    const found = new Set();
    const add = (cond, v) => { if (cond) found.add(v); };
    if (H['server']) add(true, `Server: ${H['server']}`);
    if (H['x-powered-by']) add(true, `X-Powered-By: ${H['x-powered-by']}`);
    if (H['x-aspnet-version']) add(true, 'ASP.NET');
    ['wp-content', 'drupal', 'joomla', 'shopify', 'magento', 'wix.com', 'squarespace'].forEach(k => add(body.includes(k), k.charAt(0).toUpperCase() + k.slice(1)));
    ['jquery', 'react', 'vue', 'angular', 'svelte', 'bootstrap', 'tailwind'].forEach(k => add(body.includes(k), k));
    if (H['cf-ray'] || body.includes('cloudflare')) add(true, 'Cloudflare');
    if (H['x-amz-cf-id'] || body.includes('cloudfront')) add(true, 'AWS CloudFront');
    if (H['x-akamai-transformed']) add(true, 'Akamai');
    if (body.includes('googletagmanager') || body.includes('gtag')) add(true, 'Google Analytics');
    if (body.includes('recaptcha')) add(true, 'reCAPTCHA');
    if (body.includes('stripe.com')) add(true, 'Stripe');
    return [...found].sort();
  }

  function detectWAF(headersObj, html) {
    const H = {}; Object.entries(headersObj || {}).forEach(([k, v]) => { H[k.toLowerCase()] = String(v); });
    const body = String(html || '').toLowerCase();
    const f = new Set();
    if (H['cf-ray'] || body.includes('cf-browser-verification')) f.add('Cloudflare');
    if (H['x-sucuri-id'] || body.includes('sucuri/cloudproxy')) f.add('Sucuri');
    if (H['x-iinfo']) f.add('Imperva/Incapsula');
    if (H['x-amz-cf-id']) f.add('AWS WAF');
    if (H['x-akamai-transformed']) f.add('Akamai');
    if (Object.keys(H).some(k => /^x-f5-/i.test(k))) f.add('F5 BIG-IP');
    if (H['x-modsecurity']) f.add('ModSecurity');
    return f.size ? [...f].sort() : ['None'];
  }

  function analyzeSecurityHeaders(headersObj) {
    const H = {}; Object.entries(headersObj || {}).forEach(([k, v]) => { H[k.toLowerCase()] = String(v); });
    const hs = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'strict-transport-security', 'referrer-policy', 'permissions-policy', 'x-xss-protection'];
    const out = {};
    for (const h of hs) out[h] = H[h] || 'missing';
    return out;
  }

  function analyzeCookies(headersObj) {
    const H = {}; Object.entries(headersObj || {}).forEach(([k, v]) => { H[k.toLowerCase()] = String(v); });
    const raw = H['set-cookie'] || '';
    if (!raw) return { total: 0, secure: false, httpOnly: false, sameSite: 'Unavailable', details: [], unavailable: true };
    const cookies = raw.split(/,(?=[^;]+=)/).filter(Boolean);
    const details = cookies.map(c => {
      const low = c.toLowerCase();
      const name = c.split('=')[0].trim();
      const ss = low.match(/samesite\s*=\s*(strict|lax|none)/i);
      return { name, secure: /\bsecure\b/i.test(low), httpOnly: /\bhttponly\b/i.test(low), sameSite: ss ? ss[1] : 'Missing' };
    });
    return { total: details.length, secure: details.length > 0 && details.every(c => c.secure), httpOnly: details.length > 0 && details.every(c => c.httpOnly), sameSite: details.length === 0 ? 'Unavailable' : (details.every(c => c.sameSite === details[0].sameSite) ? details[0].sameSite : 'Mixed'), details, unavailable: false };
  }

  // ==================== Output helpers ====================
  function treeLine(out, text, cls = 'output', indent = 0) {
    const prefix = indent > 0 ? '│   '.repeat(indent - 1) + '├── ' : '';
    out.push(L(prefix + text, cls));
  }

  function section(out, title) { out.push(SP()); out.push(L(`├── ${title}`, 'accent')); }

  // ==================== Main scan ====================
  async function runScan(api, rawUrl, mode) {
    const profile = PROFILES[mode] || PROFILES.high;
    state.runtime.activeProfile = mode;
    state.settings.timeout = profile.timeout;
    state.settings.probeTimeout = profile.probeTimeout;
    state.runtime.concurrency = profile.concurrent;
    state.api = api;

    const out = [];
    const t0 = Date.now();

    // 1. Normalize
    let normalized;
    try { normalized = normalizeTarget(rawUrl); }
    catch (e) { return [L(`Invalid URL: ${e.message}`, 'danger')]; }

    const url = new URL(normalized);
    const origin = url.origin;
    const domain = normalizeHostname(url.hostname);

    out.push(L('╔══════════════════════════════════════════════════╗', 'accent'));
    out.push(L(`║  SITESCANNER v${VERSION} · ${profile.label.padEnd(17)}║`, 'accent'));
    out.push(L('╚══════════════════════════════════════════════════╝', 'accent'));
    out.push(SP());
    out.push(L(`├── 🌍 TARGET`, 'accent'));
    out.push(L(`│   ├── Input: ${rawUrl}`, 'muted'));
    out.push(L(`│   ├── Normalized: ${normalized}`, 'success'));
    out.push(L(`│   ├── Domain: ${domain}`));
    out.push(L(`│   ├── Workers: ${profile.concurrent} (min ${profile.minConcurrent}, max ${profile.maxConcurrent})`));
    out.push(L(`│   └── Timeout: ${profile.timeout}ms`));

    // 2. Baseline fingerprinting
    out.push(SP());
    out.push(L('├── 🔬 BASELINE (404 + root)', 'accent'));
    const baseline = await buildBaseline(origin);
    state.runtime.baseline = baseline;
    out.push(L(`│   ├── 404 hash: ${baseline.notFoundHash ? baseline.notFoundHash.slice(0, 12) + '…' : 'unavailable'}`, baseline.notFoundHash ? 'muted' : 'dim'));
    out.push(L(`│   ├── root hash: ${baseline.rootHash ? baseline.rootHash.slice(0, 12) + '…' : 'unavailable'}`, baseline.rootHash ? 'muted' : 'dim'));
    out.push(L(`│   └── Mirror filter: ${baseline.corsReadable ? 'ARMED' : 'CORS blocked (limited)'}`, baseline.corsReadable ? 'success' : 'warning'));

    // 3. Proxy prep
    try { await prepareProxyList(); out.push(SP()); out.push(L(`├── 🔌 PROXY`, 'accent')); out.push(L(`│   └── ${state.proxyList.length} working proxies`, 'success')); }
    catch (e) { return [L(`Proxy error: ${e.message}`, 'danger')]; }

    // 4. Parallel phase
    const pool = new AdaptiveWorkerPool(profile.concurrent);

    const once = (() => { const c = new Map(); return (k, f) => { if (!c.has(k)) c.set(k, Promise.resolve().then(f).catch(() => null)); return c.get(k); }; })();

    const mainPage = once('main', async () => {
      const started = Date.now();
      try {
        const res = await fetchWithProxy(normalized);
        const html = await res.text();
        if (isMirror(html, baseline)) return { ok: false, error: 'mirror-baseline' };
        const headers = {}; res.headers.forEach((v, k) => { headers[k.toLowerCase()] = String(v); });
        return { ok: true, status: res.status, html, headers, finalUrl: res.url || normalized, responseTime: Date.now() - started, redirected: res.redirected };
      } catch (e) { return { ok: false, error: e.message, responseTime: Date.now() - started }; }
    });

    const ipv4 = once('ipv4', () => resolveIP(domain));
    const ipv6 = once('ipv6', () => resolveIPv6(domain));
    const primaryIP = once('primary-ip', async () => { const ips = await ipv4; return ips[0] || null; });
    const ptr = once('ptr', async () => { const ip = await primaryIP; return ip ? resolvePTR(ip) : []; });
    const infoP = once('info-p', async () => { const ip = await primaryIP; return ip ? getIPInfoPrimary(ip) : null; });
    const infoS = once('info-s', async () => { const ip = await primaryIP; return ip ? getIPInfoSecondary(ip) : null; });

    const dnsTypes = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'SRV', 'CAA', 'NAPTR'];
    const dns = {}; dnsTypes.forEach(t => { dns[t] = once(`dns:${t}`, () => resolveDNS(domain, t)); });
    const spf = once('spf', async () => (await dns.TXT || []).filter(r => String(r.data).toLowerCase().includes('v=spf1')).map(r => r.data));
    const dmarc = once('dmarc', async () => (await resolveDNS(`_dmarc.${domain}`, 'TXT') || []).filter(r => String(r.data).toUpperCase().startsWith('V=DMARC1')).map(r => r.data));
    const dkim = once('dkim', async () => { const sels = ['google', 'default', 'mail', 'selector1', 'selector2']; const r = []; for (const s of sels) { try { const x = await resolveDNS(`${s}._domainkey.${domain}`, 'TXT'); x.forEach(y => r.push(`${s}: ${y.data}`)); } catch {} } return r; });
    const dnssec = once('dnssec', async () => (await resolveDNS(domain, 'DS') || []).length > 0);
    const dnsbl = once('dnsbl', async () => { const ip = await primaryIP; return ip ? checkDNSBL(ip) : 'N/A'; });

    const crt = once('crt', async () => { try { const d = await fetchJSON(state.settings.crtshApi.replace('{domain}', encodeURIComponent(domain))); return Array.isArray(d) ? d : []; } catch { return []; } });
    const sslCert = once('ssl-cert', async () => { const e = await crt; if (!e.length) return null; return [...e].filter(Boolean).sort((a, b) => { const at = Date.parse(a.entry_timestamp || a.not_before || '') || Number(a.id) || 0; const bt = Date.parse(b.entry_timestamp || b.not_before || '') || Number(b.id) || 0; return bt - at; })[0] || null; });
    const sslInfo = once('ssl-info', () => getSSLInfo(domain));
    const wayback = once('wayback', () => fetchWaybackCount(domain));
    const rdap = once('rdap', () => fetchRDAP(domain));
    const subsBuffer = once('subs-buffer', () => fetchSubsBufferOver(domain));
    const subsHacker = once('subs-hacker', () => fetchSubsHackerTarget(domain));
    const robots = once('robots', () => fetchText(new URL('/robots.txt', normalized).href).catch(() => null));
    const sitemap = once('sitemap', () => fetchText(new URL('/sitemap.xml', normalized).href).catch(() => null));
    const securityTxt = once('sec-txt', () => fetchText(new URL('/.well-known/security.txt', normalized).href).catch(() => null));
    const manifestJson = once('manifest', () => fetchJSON(new URL('/MANIFEST.json', normalized).href).catch(() => null));

    const [
      mp, ips4, ips6, ptrs, ipP, ipS, aRec, aaaaRec, mxRec, nsRec, cnameRec, txtRec, soaRec, srvRec, caaRec, naptrRec,
      spfR, dmarcR, dkimR, dnssecR, dnsblR, crtR, sslCertR, sslInfoR, waybackR, rdapR, subBufR, subHackR, robotsR, sitemapR, secTxtR, manifestR
    ] = await Promise.all([
      mainPage, ipv4, ipv6, ptr, infoP, infoS,
      dns.A, dns.AAAA, dns.MX, dns.NS, dns.CNAME, dns.TXT, dns.SOA, dns.SRV, dns.CAA, dns.NAPTR,
      spf, dmarc, dkim, dnssec, dnsbl, crt, sslCert, sslInfo, wayback, rdap, subsBuffer, subsHacker, robots, sitemap, securityTxt, manifestJson
    ]);

    const scanTime = Date.now() - t0;

    // 5. Process results
    const html = mp?.ok ? mp.html : '';
    const headers = mp?.ok ? mp.headers : {};
    const finalUrl = mp?.ok ? mp.finalUrl : normalized;
    const status = mp?.ok ? mp.status : 0;
    const tech = detectTech(headers, html);
    const waf = detectWAF(headers, html);
    const secHeaders = analyzeSecurityHeaders(headers);
    const cookies = analyzeCookies(headers);
    const structure = parseHTML(html, finalUrl);

    const ipList = Array.isArray(ips4) ? ips4.filter(Boolean) : [];
    const ipv6List = Array.isArray(ips6) ? ips6.filter(Boolean) : [];
    const primaryIp = ipList[0] || null;
    const asn = ipP?.as || ipP?.asname || ipS?.org || 'N/A';

    const crtData = Array.isArray(crtR) ? crtR : [];
    const crtSubs = [...new Set(crtData.flatMap(e => String(e?.name_value || '').split(/\r?\n/)).map(cleanHostname).filter(Boolean).filter(h => isSubOf(h, domain)))];
    const allSubs = [...new Set([...crtSubs, ...(subBufR || []), ...(subHackR || [])])].map(cleanHostname).filter(Boolean).filter(h => isSubOf(h, domain)).sort();
    const relatedHosts = [...new Set(crtData.map(e => cleanHostname(e?.common_name)).filter(Boolean).filter(h => isSubOf(h, domain) || h === domain))].sort();
    const certDates = crtData.map(e => { const v = e?.entry_timestamp || e?.not_before || ''; const t = Date.parse(v); return Number.isFinite(t) ? t : null; }).filter(v => v !== null);

    // 6. Render tree
    // Network
    out.push(SP());
    out.push(L('├── 🌐 NETWORK INTELLIGENCE', 'accent'));
    out.push(L(`│   ├── IPv4: ${ipList.join(', ') || 'none'}`, ipList.length ? 'success' : 'muted'));
    out.push(L(`│   ├── IPv6: ${ipv6List.join(', ') || 'none'}`, ipv6List.length ? 'success' : 'dim'));
    out.push(L(`│   ├── ASN: ${asn}`));
    out.push(L(`│   ├── ISP: ${ipP?.isp || ipP?.org || ipS?.org || 'N/A'}`));
    out.push(L(`│   ├── Netblock: ${ipS?.asn?.route || ipP?.as || 'N/A'}`));
    out.push(L(`│   ├── PTR: ${(ptrs || []).join(', ') || 'none'}`));
    if (ipP && ipP.status !== 'fail') out.push(L(`│   ├── Geo: ${ipP.country || '?'} (${ipP.countryCode || '?'}) · ${ipP.regionName || '?'} · ${ipP.city || '?'}`));
    out.push(L(`│   ├── Abuse contact: ${ipS?.abuse?.email || 'N/A'}`));
    out.push(L(`│   └── DNSBL: ${dnsblR || 'N/A'}`, dnsblR === 'Listed' ? 'danger' : 'muted'));

    // DNS
    out.push(SP());
    out.push(L('├── 🧬 DNS INTELLIGENCE', 'accent'));
    const dnsSection = (label, recs, indent = 1) => {
      if (!recs || !recs.length) return;
      out.push(L(`│   ├── ${label}:`, 'muted'));
      recs.forEach(r => out.push(L(`│   │   └── ${r.type} (TTL ${r.TTL}): ${r.data}`, 'dim')));
    };
    dnsSection('A', aRec); dnsSection('AAAA', aaaaRec); dnsSection('MX', mxRec); dnsSection('NS', nsRec);
    dnsSection('CNAME', cnameRec); dnsSection('TXT', txtRec); dnsSection('SOA', soaRec); dnsSection('SRV', srvRec);
    dnsSection('CAA', caaRec); dnsSection('NAPTR', naptrRec);
    out.push(L(`│   ├── SPF: ${(spfR || []).join('; ') || 'Not found'}`, (spfR || []).length ? 'success' : 'warning'));
    out.push(L(`│   ├── DMARC: ${(dmarcR || []).join('; ') || 'Not found'}`, (dmarcR || []).length ? 'success' : 'warning'));
    out.push(L(`│   ├── DKIM: ${(dkimR || []).join('; ') || 'Not found'}`, (dkimR || []).length ? 'success' : 'warning'));
    out.push(L(`│   └── DNSSEC: ${dnssecR ? 'Enabled' : 'Not confirmed'}`, dnssecR ? 'success' : 'warning'));

    // OSINT
    out.push(SP());
    out.push(L('├── 🔍 DOMAIN OSINT', 'accent'));
    if (sslCertR) {
      out.push(L(`│   ├── Latest certificate:`, 'accent'));
      out.push(L(`│   │   ├── Issuer: ${sslCertR.issuer_name || 'N/A'}`));
      out.push(L(`│   │   ├── Subject: ${sslCertR.name_value || 'N/A'}`));
      out.push(L(`│   │   ├── Valid: ${sslCertR.not_before || '?'} → ${sslCertR.not_after || '?'}`));
      out.push(L(`│   │   └── SHA-1: ${sslCertR.sha1 || 'N/A'}`));
    } else out.push(L(`│   ├── Certificate Transparency: none`, 'muted'));
    if (sslInfoR) {
      out.push(L(`│   ├── TLS:`, 'accent'));
      Object.entries(sslInfoR).slice(0, 6).forEach(([k, v]) => out.push(L(`│   │   ├── ${k}: ${v}`, 'dim')));
    }
    out.push(L(`│   ├── Subdomains: ${allSubs.length}`, allSubs.length ? 'success' : 'muted'));
    if (allSubs.length > 0) {
      allSubs.slice(0, 15).forEach(s => out.push(L(`│   │   ├── ${s}`, 'dim')));
      if (allSubs.length > 15) out.push(L(`│   │   └── ... +${allSubs.length - 15} more`, 'dim'));
    }
    out.push(L(`│   ├── Related hostnames: ${relatedHosts.length}`, relatedHosts.length ? 'success' : 'muted'));
    if (relatedHosts.length) relatedHosts.slice(0, 8).forEach(h => out.push(L(`│   │   ├── ${h}`, 'dim')));
    out.push(L(`│   ├── Wayback snapshots: ${waybackR || 0}`));
    if (rdapR) out.push(L(`│   ├── RDAP: ${rdapR.name || rdapR.handle || 'N/A'} (${rdapR.type || 'N/A'})`));
    if (certDates.length) out.push(L(`│   └── Cert history: first=${new Date(Math.min(...certDates)).toISOString().slice(0, 10)} last=${new Date(Math.max(...certDates)).toISOString().slice(0, 10)}`));

    // Web
    out.push(SP());
    out.push(L('├── 🌐 WEB INTELLIGENCE', 'accent'));
    out.push(L(`│   ├── Final URL: ${finalUrl}`, finalUrl !== normalized ? 'warning' : 'success'));
    out.push(L(`│   ├── HTTP status: ${status}`, status >= 200 && status < 300 ? 'success' : status >= 400 ? 'danger' : 'warning'));
    out.push(L(`│   ├── Response time: ${mp?.responseTime || 0}ms`));
    out.push(L(`│   ├── Redirected: ${mp?.redirected ? 'Yes' : 'No'}`));
    if (mp?.error) out.push(L(`│   ├── Error: ${mp.error}`, 'danger'));
    out.push(L(`│   ├── Headers: ${Object.keys(headers).length}`));
    out.push(L(`│   ├── Cookies: ${cookies.total} (Secure=${cookies.secure ? 'Yes' : 'No'}, HttpOnly=${cookies.httpOnly ? 'Yes' : 'No'}, SameSite=${cookies.sameSite})`));
    out.push(L(`│   ├── Title: ${structure.title}`));
    out.push(L(`│   ├── Description: ${structure.metaDescription || 'missing'}`));
    out.push(L(`│   ├── Generator: ${structure.metaGenerator || 'none'}`));
    out.push(L(`│   ├── HTML version: ${structure.htmlVersion}`));
    out.push(L(`│   ├── Headings: H1=${structure.headings.h1} H2=${structure.headings.h2} H3=${structure.headings.h3}`));
    out.push(L(`│   ├── Links: ${structure.links} (int ${structure.internalLinks} / ext ${structure.externalLinks})`));
    out.push(L(`│   ├── Forms: ${structure.forms}`));
    out.push(L(`│   ├── robots.txt: ${robotsR ? 'found' : 'not found'}`, robotsR ? 'success' : 'muted'));
    out.push(L(`│   ├── sitemap.xml: ${sitemapR ? 'found' : 'not found'}`, sitemapR ? 'success' : 'muted'));
    out.push(L(`│   ├── security.txt: ${secTxtR ? 'found' : 'not found'}`, secTxtR ? 'success' : 'muted'));
    out.push(L(`│   └── MANIFEST.json: ${manifestR ? 'found' : 'not found'}`, manifestR ? 'success' : 'muted'));

    // Tech
    out.push(SP());
    out.push(L('├── ⚙️  TECHNOLOGY', 'accent'));
    if (tech.length) tech.forEach(t => out.push(L(`│   ├── ${t}`, 'success')));
    else out.push(L(`│   └── none detected`, 'muted'));

    // Security
    out.push(SP());
    out.push(L('├── 🛡️  SECURITY POSTURE', 'accent'));
    const missCount = Object.values(secHeaders).filter(v => v === 'missing').length;
    out.push(L(`│   ├── Security headers: ${Object.keys(secHeaders).length - missCount}/${Object.keys(secHeaders).length} present`, missCount === 0 ? 'success' : 'warning'));
    Object.entries(secHeaders).forEach(([h, v]) => out.push(L(`│   │   ├── ${v === 'missing' ? '❌' : '✅'} ${h}: ${v === 'missing' ? 'missing' : 'present'}`, v === 'missing' ? 'danger' : 'success')));
    out.push(L(`│   ├── WAF: ${waf.join(', ')}`, waf.includes('None') ? 'success' : 'danger'));
    out.push(L(`│   ├── TLS: ${sslCertR ? 'valid cert' : 'no cert found'}`, sslCertR ? 'success' : 'warning'));
    out.push(L(`│   ├── CORS:`));
    out.push(L(`│   │   ├── Allow-Origin: ${headers['access-control-allow-origin'] || 'Not set'}`));
    out.push(L(`│   │   ├── Allow-Methods: ${headers['access-control-allow-methods'] || 'Not set'}`));
    out.push(L(`│   │   └── Allow-Credentials: ${headers['access-control-allow-credentials'] || 'Not set'}`));
    out.push(L(`│   └── Email security: ${(spfR || []).length && (dmarcR || []).length ? 'Strong' : 'Weak'}`, (spfR || []).length && (dmarcR || []).length ? 'success' : 'warning'));

    // Reputation
    out.push(SP());
    out.push(L('├── 📊 REPUTATION', 'accent'));
    out.push(L(`│   ├── DNSBL (Spamhaus): ${dnsblR || 'N/A'}`, dnsblR === 'Listed' ? 'danger' : 'success'));
    out.push(L(`│   ├── Abuse contact: ${ipS?.abuse?.email || 'N/A'}`));
    out.push(L(`│   └── Organization: ${ipS?.org || ipP?.org || 'N/A'}`));

    // Summary
    out.push(SP());
    out.push(L('╰─────────────────────────────────────────────────', 'accent'));
    out.push(L(`  ✓ Scan complete in ${scanTime}ms · ${profile.label} · ${profile.concurrent} workers`, 'success'));
    out.push(L(`  ✓ Baseline filter: ${baseline.notFoundHash ? '404 hash + root hash armed' : 'limited (CORS blocked)'}`, baseline.notFoundHash ? 'success' : 'warning'));
    out.push(L(`  ✓ False-positive mirrors filtered: ${state.runtime.fpFiltered || 0}`, 'muted'));

    return out;
  }

  // ==================== Simple subcommand handlers ====================
  async function cmdTarget(api, rawUrl) {
    const url = new URL(normalizeTarget(rawUrl));
    return [
      L('── TARGET ──', 'accent'),
      L(`Original: ${rawUrl}`),
      L(`Normalized: ${url.href}`, 'success'),
      L(`Domain: ${url.hostname}`),
      L(`Protocol: ${url.protocol.replace(':', '')}`),
      L(`Path: ${url.pathname}`)
    ];
  }

  async function cmdHeaders(api, rawUrl) {
    const url = normalizeTarget(rawUrl);
    const res = await fetchWithProxy(url);
    const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });
    const out = [L('── HEADERS ──', 'accent')];
    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => out.push(L(`${k}: ${v}`)));
    return out;
  }

  async function cmdDNS(api, rawUrl, type) {
    const domain = normalizeHostname(new URL(normalizeTarget(rawUrl)).hostname);
    const records = await resolveDNS(domain, (type || 'A').toUpperCase());
    const out = [L(`── DNS ${type || 'A'} · ${domain} ──`, 'accent')];
    if (!records.length) out.push(L('none', 'muted'));
    else records.forEach(r => out.push(L(`${r.type} (TTL ${r.TTL}): ${r.data}`)));
    return out;
  }

  async function cmdVersion(api) {
    return [L(`sitescanner v${VERSION}`, 'accent'), L('High-speed passive OSINT scanner · MUNITOS', 'muted')];
  }

  function helpText(api) {
    return [
      L('╭──────────────────────────────────────────╮', 'accent'),
      L(`│  SITESCANNER v${VERSION} · COMMANDS        │`, 'accent'),
      L('╰──────────────────────────────────────────╯', 'accent'),
      SP(),
      L('FULL SCAN', 'accent'),
      L('  sitescanner scan <url>       High-power full scan', 'muted'),
      L('  sitescanner lowscan <url>    Mobile-safe low-power scan', 'muted'),
      SP(),
      L('QUICK MODULES', 'accent'),
      L('  sitescanner target <url>     URL normalization + basics', 'muted'),
      L('  sitescanner headers <url>    HTTP response headers', 'muted'),
      L('  sitescanner dns <url> [type] Single DNS query', 'muted'),
      L('  sitescanner version', 'muted'),
      SP(),
      L('Examples:', 'accent'),
      L('  sitescanner scan example.com', 'output'),
      L('  sitescanner lowscan example.com', 'output'),
      L('  sitescanner dns example.com MX', 'output')
    ];
  }

  // ==================== Command dispatch ====================
  async function runCommand({ args = [], api } = {}) {
    state.api = api;
    const sub = String(args[0] || '').toLowerCase();
    const rest = args.slice(1);
    const target = rest.join(' ').trim();

    if (!sub || sub === 'help' || sub === '-h' || sub === '--help') return helpText(api);
    if (sub === 'version' || sub === '-V') return cmdVersion(api);

    const needsUrl = ['scan', 'lowscan', 'target', 'headers', 'dns'];
    if (needsUrl.includes(sub) && !target) return [L(`usage: sitescanner ${sub} <url>`, 'danger')];

    try {
      if (sub === 'scan') return await runScan(api, target, 'high');
      if (sub === 'lowscan') return await runScan(api, target, 'low');
      if (sub === 'target') return await cmdTarget(api, target);
      if (sub === 'headers') return await cmdHeaders(api, target);
      if (sub === 'dns') return await cmdDNS(api, target, rest[1]);
      return [L(`Unknown subcommand: ${sub}. Try "sitescanner help".`, 'danger')];
    } catch (e) {
      return [L(`Error: ${e.message}`, 'danger')];
    }
  }

  // ==================== COMMANDS map (single source of truth) ====================
  const COMMANDS = Object.freeze({
    sitescanner: {
      description: 'High-speed passive OSINT web scanner with baseline fingerprinting.',
      usage: 'sitescanner <scan|lowscan|target|headers|dns|version|help> [args]',
      aliases: ['sscan'],
      kind: 'plain',
      run: runCommand
    }
  });

  // ==================== Manifest ====================
  

  // ==================== Lifecycle ====================
  async function install(api) {
    if (!api || typeof api !== 'object') throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    const required = ['registerCommand', 'unregisterCommand', 'line', 'spacer'];
    for (const m of required) if (typeof api[m] !== 'function') throw new Error(`PACKAGE_BRIDGE_${m.toUpperCase()}_UNAVAILABLE`);
    state.api = api;
    for (const [name, definition] of Object.entries(COMMANDS)) {
      if (!MANIFEST.commands.includes(name)) throw new Error(`COMMAND_NOT_DECLARED:${name}`);
      const registered = api.registerCommand(name, definition);
      if (registered === false) throw new Error(`PACKAGE_COMMAND_REGISTRATION_FAILED:${name}`);
    }
    return [];
  }

  async function uninstall(api) {
    const bridge = api || state.api;
    for (const name of MANIFEST.commands) {
      try { if (bridge && typeof bridge.unregisterCommand === 'function') bridge.unregisterCommand(name); } catch {}
    }
    state.proxyList = []; state.proxyReady = false; state.customProxy = null;
    state.api = null;
    return [];
  }

  globalThis[GLOBAL_KEY] = Object.freeze({ manifest: MANIFEST, install, uninstall });
})();