(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'ipscan',
    version: '1.0.0',
    description: 'Adaptive defensive IP OSINT package with High/Low profiles, normalized target URLs, passive exposure intelligence, multi-source consensus, worker-assisted processing, breach analytics, password exposure checks, company intelligence, HTTP header analysis, and historical data lookups.',
    help: 'ipscan help',
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
    commands: Object.freeze(['ipscan', 'lowscan', 'ipscanhelp']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'ipscan';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_ipscan';
  
  const PROFILES = Object.freeze({
    high: Object.freeze({
      concurrent: 384,
      minConcurrent: 192,
      maxConcurrent: 768,
      timeout: 10000,
      probeTimeout: 6000,
      label: 'HIGH-POWER'
    }),
    low: Object.freeze({
      concurrent: 48,
      minConcurrent: 24,
      maxConcurrent: 192,
      timeout: 10000,
      probeTimeout: 8000,
      label: 'LOW-POWER'
    })
  });

  const CONFIG = Object.freeze({
    DEFAULT_PROFILE: 'high',
    MAX_RETRIES_HIGH: 3,
    MAX_RETRIES_LOW: 1,
    CACHE_TTL_MS_HIGH: 120000,
    CACHE_TTL_MS_LOW: 60000,
    CACHE_MAX_ENTRIES: 2000,
    MAX_RECORDS_PER_SECTION: 250,
    MAX_DOMAINS: 300,
    MAX_CERTIFICATES: 250,
    MAX_URLS: 250,
    MAX_PEERS: 250,
    MAX_BGP_EVENTS: 250,
    MAX_TECHNOLOGIES: 100,
    MAX_BREACHES: 100,
    MAX_HEADERS: 100,
    REQUEST_JITTER_MS: 35,
    PROXY_REQUIRED: true,
    ALLOW_DIRECT_FALLBACK: false,
    MAX_REDIRECTS: 5,
    WORKER_COUNT_HIGH: 4,
    WORKER_COUNT_LOW: 2,
    ENABLE_PUBLIC_APIS: true,
    ENABLE_RIPESTAT: true,
    ENABLE_RDAP: true,
    ENABLE_DNS: true,
    ENABLE_GEO: true,
    ENABLE_CT: true,
    ENABLE_REVERSE_IP: true,
    ENABLE_REPUTATION: true,
    ENABLE_THREAT_INTEL: true,
    ENABLE_URLSCAN: true,
    ENABLE_PROXYCHECK: true,
    ENABLE_GREYNOISE: true,
    ENABLE_BGPVIEW: true,
    ENABLE_HACKERTARGET: true,
    ENABLE_HTTP_PROBE: true,
    ENABLE_TLS_PROBE: true,
    ENABLE_PORT_INTELLIGENCE: false,
    ENABLE_BREACH_CHECK: true,
    ENABLE_PASSWORD_CHECK: true,
    ENABLE_COMPANY_INFO: true,
    ENABLE_HEADER_ANALYSIS: true,
    ENABLE_HISTORICAL_WHOIS: true,
    ENABLE_HISTORICAL_DNS: true,
    ENABLE_XPOSEDORNOT: true,
    ENABLE_HIBP: true,
    ENABLE_HIBP_PASSWORDS: true,
    ENABLE_HACKMYIP_BREACH: true,
    ENABLE_SEC_EDGAR: true,
    ENABLE_GLEIF: true,
    ENABLE_OPENCORPORATES: true,
    ENABLE_APIXIES_HEADERS: true,
    ENABLE_KLyMAX_HEADERS: true,
    ENABLE_WHOISFREAKS_DNS: true,
    ENABLE_ROBTEX: true,
    ENABLE_CERTSPOTTER: true,
    ENABLE_ISSUED_LIVE: true,
    ENABLE_SHODAN_INTERNETDB: true,
    ENABLE_THREATFOX: true,
    ENABLE_URLHAUS: true,
    ENABLE_FEODO_TRACKER: true,
    ENABLE_IPAPI_IS: true,
    ENABLE_MYIPSCAN: true,
    ENABLE_WHOISER: true,
    ENABLE_RDAP_ORG: true,
    ENABLE_ABUSEIPDB: true,
    ENABLE_VIRUSTOTAL: true,
    ENABLE_SHODAN: true,
    ENABLE_EMAILREP: true,
    ENABLE_HUNTER: true,
    ENABLE_DEHASHED: true,
    ENABLE_LEAKCHECK: true,
    ENABLE_SNUSBASE: true,
    ENABLE_FIREFOX_MONITOR: true,
    ENABLE_GOOGLE_SAFE_BROWSING: true,
    ENABLE_PHISHTANK: true,
    ENABLE_OPENPHISH: true,
    ENABLE_MALWAREBAZAAR: true,
    ENABLE_ALIENVAULT_OTX: true,
    ENABLE_MISP: true,
    ENABLE_CIRCL: true,
    ENABLE_VT_PASSPIVE_DNS: true,
    ENABLE_RISKIQ: true,
    ENABLE_DOMAINTOOLS: true,
    ENABLE_SECURITYTRAILS: true,
    ENABLE_CENSYS: true,
    ENABLE_BINARYEDGE: true,
    ENABLE_FULLHUNT: true,
    ENABLE_INTELX: true,
    ENABLE_PULSEDIVE: true,
    ENABLE_RECONNG: true,
    ENABLE_SPYONWEB: true,
    ENABLE_SIMILARWEB: true,
    ENABLE_BUILTWITH: true,
    ENABLE_WAPPALYZER: true,
    ENABLE_WHATCMS: true,
    ENABLE_NERDYDATA: true,
    ENABLE_IPINFO: true,
    ENABLE_IPAPI_CO: true,
    ENABLE_IP_API_COM: true,
    ENABLE_FREEIPAPI: true,
    ENABLE_IPWHOIS: true,
    ENABLE_IPBASE: true,
    ENABLE_GEOIPIFY: true,
    ENABLE_IPGEOLOCATION: true,
    ENABLE_IPSTACK: true,
    ENABLE_IP2LOCATION: true,
    ENABLE_MAXMIND: true,
    ENABLE_DB_IP: true,
    ENABLE_IPDATA: true,
    ENABLE_IPLOCATE: true,
    ENABLE_IPAPI_IS: true,
    ENABLE_IPWHOIS_IO: true,
    ENABLE_IPINFO_IO: true,
    ENABLE_IPAPI_CO_FREE: true,
    ENABLE_IP_API_COM_FREE: true,
    ENABLE_FREEIPAPI_COM: true,
    ENABLE_IPWHO_IS: true,
    ENABLE_IPBASE_COM: true,
    ENABLE_GEOIPIFY_COM: true,
    ENABLE_IPGEOLOCATION_IO: true,
    ENABLE_IPSTACK_COM: true,
    ENABLE_IP2LOCATION_COM: true,
    ENABLE_MAXMIND_COM: true,
    ENABLE_DB_IP_COM: true,
    ENABLE_IPDATA_CO: true,
    ENABLE_IPLOCATE_IO: true,
    SOURCE_APP: 'munitos-ipscan',
    OPTIONAL_API_KEYS: Object.freeze({})
  });

  const COMMANDS = Object.freeze({
    ipscan: {
      description: 'High-power public IP OSINT with adaptive provider orchestration.',
      usage: 'ipscan <IPv4|IPv6> | ipscan scan <IPv4|IPv6>',
      aliases: Object.freeze(['iposint', 'ipintel', 'ipinfox']),
      kind: 'async'
    },
    lowscan: {
      description: 'Low-power mobile-friendly IP OSINT profile.',
      usage: 'lowscan <IPv4|IPv6> | ipscan lowscan <IPv4|IPv6>',
      aliases: Object.freeze(['lowipscan', 'ipscanlow', 'low']),
      kind: 'async'
    },
    ipscanhelp: {
      description: 'Show ipscan package help.',
      usage: 'ipscan help',
      aliases: Object.freeze([]),
      kind: 'plain'
    }
  });

  

  const state = {
    api: null,
    installed: false,
    workingProxies: [],
    customProxy: null,
    proxyReady: false,
    proxyIndex: 0
  };

  const getApi = () => {
    if (!state.api) throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    return state.api;
  };

  const line = (text, cls = 'output') => getApi().line(String(text ?? ''), cls);
  const spacer = () => getApi().spacer();

  const getSnapshot = () => {
    try {
      return typeof state.api?.snapshot === 'function' ? state.api.snapshot() : null;
    } catch {
      return null;
    }
  };

  const getMode = () => {
    try {
      return typeof state.api?.getMode === 'function' ? String(state.api.getMode()) : 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const jitter = () => CONFIG.REQUEST_JITTER_MS > 0 ? rand(0, CONFIG.REQUEST_JITTER_MS) : 0;

  const id = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const unique = values => [...new Set((values || []).filter(Boolean))];

  const stringValue = value => {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
  };

  const safeNumber = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeText = value =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, '');

  const selectUserAgent = () => {
    try {
      const fup = globalThis.__FreeUserProxy || null;
      if (fup && typeof fup.getRandomUserAgent === 'function') {
        const ua = fup.getRandomUserAgent();
        if (ua) return ua;
      }
    } catch {}
    return 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
  };

  const getFreeUserProxy = () => {
    try {
      return window.__FreeUserProxy || globalThis.__FreeUserProxy || null;
    } catch {
      return null;
    }
  };

  const getWorkingProxies = () => {
    const fup = getFreeUserProxy();
    if (!fup || typeof fup.getWorkingProxies !== 'function') return [];
    try {
      const list = fup.getWorkingProxies();
      return Array.isArray(list) ? list.filter(x =>
        x &&
        typeof x === 'object' &&
        typeof x.template === 'string' &&
        x.template.includes('{url}')
      ) : [];
    } catch {
      return [];
    }
  };

  const isValidIPv4 = ip => {
    if (typeof ip !== 'string') return false;
    const value = ip.trim();
    const parts = value.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      if (!/^\d{1,3}$/.test(part)) return false;
      if (part.length > 1 && part.startsWith('0')) return false;
      const n = Number(part);
      return n >= 0 && n <= 255;
    });
  };

  const expandIPv6 = ip => {
    if (typeof ip !== 'string') return null;
    let value = ip.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    if (!value || value.includes('%')) return null;

    if (value.includes('.')) {
      const match = /^(.*):(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
      if (!match || !isValidIPv4(match[2])) return null;
      const octets = match[2].split('.').map(Number);
      value = `${match[1]}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }

    const groups = (value.match(/::/g) || []).length;
    if (groups > 1) return null;

    const sides = value.split('::');
    const left = sides[0] ? sides[0].split(':') : [];
    const right = sides[1] ? sides[1].split(':') : [];

    if (left.concat(right).some(x => !/^[0-9a-f]{1,4}$/i.test(x))) return null;

    const total = left.length + right.length;

    if (groups === 0 && total !== 8) return null;
    if (groups === 1 && total >= 8) return null;

    return [...left, ...Array(8 - total).fill('0'), ...right]
      .map(x => x.padStart(4, '0'))
      .join('');
  };

  const isValidIPv6 = ip => Boolean(expandIPv6(ip));

  const getIpVersion = ip => {
    if (isValidIPv4(ip)) return 4;
    if (isValidIPv6(ip)) return 6;
    return null;
  };

  const normalizeIPv6 = ip => {
    const expanded = expandIPv6(ip);
    if (!expanded) return null;

    const groups = [];
    for (let i = 0; i < expanded.length; i += 4) {
      groups.push(expanded.slice(i, i + 4).replace(/^0+/, '') || '0');
    }

    let bestStart = -1;
    let bestLength = 0;
    let start = -1;

    for (let i = 0; i <= groups.length; i++) {
      if (i < groups.length && groups[i] === '0') {
        if (start === -1) start = i;
      } else if (start !== -1) {
        const length = i - start;
        if (length > bestLength && length >= 2) {
          bestStart = start;
          bestLength = length;
        }
        start = -1;
      }
    }

    if (bestStart >= 0) {
      const left = groups.slice(0, bestStart).join(':');
      const right = groups.slice(bestStart + bestLength).join(':');
      if (!left && !right) return '::';
      if (!left) return `::${right}`;
      if (!right) return `${left}::`;
      return `${left}::${right}`;
    }

    return groups.join(':');
  };

  const normalizeTargetIP = ip => {
    const raw = String(ip ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
    const version = getIpVersion(raw);
    if (!version) throw new Error(`INVALID_INPUT: ${raw}`);

    return Object.freeze({
      input: raw,
      ip: version === 4 ? raw : normalizeIPv6(raw),
      version,
      type: classifyIP(raw)
    });
  };

  const classifyIPv4 = ip => {
    const [a, b, c, d] = ip.split('.').map(Number);
    if (a === 0) return 'SPECIAL';
    if (a === 10) return 'PRIVATE';
    if (a === 100 && b >= 64 && b <= 127) return 'CGNAT';
    if (a === 127) return 'LOOPBACK';
    if (a === 169 && b === 254) return 'LINK_LOCAL';
    if (a === 172 && b >= 16 && b <= 31) return 'PRIVATE';
    if (a === 192 && b === 0 && c === 0) return 'SPECIAL';
    if (a === 192 && b === 0 && c === 2) return 'DOCUMENTATION';
    if (a === 192 && b === 0 && (c === 9 || c === 10)) return 'SPECIAL';
    if (a === 192 && b === 168) return 'PRIVATE';
    if (a === 192 && b === 18 && c <= 1) return 'BENCHMARK';
    if (a === 198 && b === 18) return 'BENCHMARK';
    if (a === 198 && b === 51 && c === 100) return 'DOCUMENTATION';
    if (a === 203 && b === 0 && c === 113) return 'DOCUMENTATION';
    if (a >= 224 && a <= 239) return 'MULTICAST';
    if (a >= 240) return 'RESERVED';
    if (a === 255 && b === 255 && c === 255 && d === 255) return 'RESERVED';
    return 'PUBLIC';
  };

  const classifyIPv6 = ip => {
    const e = expandIPv6(ip);
    if (!e) return 'UNKNOWN';
    if (e === '00000000000000000000000000000000') return 'UNSPECIFIED';
    if (e === '00000000000000000000000000000001') return 'LOOPBACK';
    if (e.startsWith('ff')) return 'MULTICAST';
    if (e.startsWith('fc') || e.startsWith('fd')) return 'UNIQUE_LOCAL';
    if (e.startsWith('fe8') || e.startsWith('fe9') || e.startsWith('fea') || e.startsWith('feb')) return 'LINK_LOCAL';
    if (e.startsWith('20010db8')) return 'DOCUMENTATION';
    if (e.startsWith('00000000000000000000ffff')) return 'IPV4_MAPPED';
    if (e.startsWith('2002')) return '6TO4';
    return 'PUBLIC';
  };

  const classifyIP = ip => {
    const version = getIpVersion(String(ip));
    if (version === 4) return classifyIPv4(String(ip));
    if (version === 6) return classifyIPv6(String(ip));
    return 'UNKNOWN';
  };

  const canonicalTargetURL = (ip, version, scheme = 'https') => {
    const host = version === 6 ? `[${ip}]` : ip;
    return `${scheme}://${host}/`;
  };

  const normalizeURL = (value, base = null) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    try {
      let candidate = raw;

      if (candidate === '/') {
        if (base) return new URL('/', base).toString();
        return null;
      }

      if (/^\/(?!\/)/.test(candidate) && base) {
        candidate = new URL(candidate, base).toString();
      } else if (/^\/\//.test(candidate) && base) {
        candidate = `${new URL(base).protocol}${candidate}`;
      } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      }

      const u = new URL(candidate);
      if (!/^https?:$/i.test(u.protocol)) return null;
      if (!u.pathname) u.pathname = '/';
      if (!u.pathname.startsWith('/')) u.pathname = `/${u.pathname}`;
      return u.toString();
    } catch {
      return null;
    }
  };

  const normalizeDomain = input => {
    const raw = String(input ?? '').trim().toLowerCase().replace(/^\*\./, '');
    if (!raw) return null;

    try {
      return new URL(`https://${raw}`).hostname
        .toLowerCase()
        .replace(/\.$/, '');
    } catch {
      return raw
        .replace(/[^a-z0-9.-]/g, '')
        .replace(/\.{2,}/g, '.')
        .replace(/^-+|-+$/g, '') || null;
    }
  };

  const normalizeHeaders = headers => {
    const out = {};
    if (headers && typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        out[String(key).toLowerCase()] = String(value);
      });
    }
    return out;
  };

  const parseJSON = value => {
    if (value && typeof value === 'object') return value;
    try {
      return JSON.parse(String(value ?? ''));
    } catch {
      return null;
    }
  };

  const detectTitle = body => {
    const value = String(body ?? '');
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value);
    return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
  };

  const detectTechnologies = (headers, body) => {
    const output = new Set();
    const h = headers || {};
    const text = String(body || '').toLowerCase();
    const server = String(h.server || '').toLowerCase();
    const powered = String(h['x-powered-by'] || '').toLowerCase();

    if (server.includes('cloudflare') || h['cf-ray']) output.add('Cloudflare');
    if (server.includes('nginx')) output.add('Nginx');
    if (server.includes('apache')) output.add('Apache');
    if (server.includes('iis')) output.add('IIS');
    if (server.includes('caddy')) output.add('Caddy');
    if (server.includes('openresty')) output.add('OpenResty');
    if (powered.includes('php')) output.add('PHP');
    if (powered.includes('asp.net')) output.add('ASP.NET');
    if (powered.includes('express')) output.add('Express');
    if (powered.includes('next')) output.add('Next.js');
    if (text.includes('wp-content') || text.includes('wordpress')) output.add('WordPress');
    if (text.includes('__next')) output.add('Next.js');
    if (text.includes('react')) output.add('React');
    if (text.includes('vue')) output.add('Vue.js');
    if (text.includes('angular')) output.add('Angular');
    if (text.includes('jquery')) output.add('jQuery');
    if (text.includes('bootstrap')) output.add('Bootstrap');
    if (text.includes('tailwind')) output.add('Tailwind CSS');

    return [...output].slice(0, CONFIG.MAX_TECHNOLOGIES);
  };

  const mapHTTPError = status => {
    if (status === 400) return 'INVALID_INPUT';
    if (status === 401) return 'AUTH_REQUIRED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NO_DATA';
    if (status === 408) return 'TIMEOUT';
    if (status === 409) return 'CONFLICT';
    if (status === 413) return 'PAYLOAD_TOO_LARGE';
    if (status === 422) return 'INVALID_INPUT';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'HTTP_ERROR';
    return 'HTTP_ERROR';
  };

  const parseRetryAfter = headers => {
    const value = headers?.['retry-after'];
    if (!value) return null;
    const n = Number(value);
    if (Number.isFinite(n)) return Math.min(n * 1000, 8000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 8000);
  };

  const computeBackoff = (attempt, headers) => {
    const retryAfter = parseRetryAfter(headers);
    if (retryAfter !== null) return retryAfter + jitter();
    return Math.min(400 * (2 ** Math.max(0, attempt - 1)) + jitter(), 8000);
  };

  class Semaphore {
    constructor(max) {
      this.max = Math.max(1, Number(max) || 1);
      this.active = 0;
      this.queue = [];
    }

    async run(task) {
      if (this.active >= this.max) {
        await new Promise(resolve => this.queue.push(resolve));
      }

      this.active++;

      try {
        return await task();
      } finally {
        this.active--;
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }

  class CacheStore {
    constructor(ttl, maxEntries) {
      this.ttl = Math.max(0, Number(ttl) || 0);
      this.maxEntries = Math.max(1, Number(maxEntries) || 1);
      this.data = new Map();
    }

    get(key) {
      const item = this.data.get(key);
      if (!item) return null;

      if (Date.now() - item.createdAt > this.ttl) {
        this.data.delete(key);
        return null;
      }

      this.data.delete(key);
      this.data.set(key, item);

      return item.value;
    }

    set(key, value) {
      if (!this.ttl) return;

      if (this.data.size >= this.maxEntries && !this.data.has(key)) {
        const first = this.data.keys().next().value;
        if (first !== undefined) this.data.delete(first);
      }

      this.data.set(key, {
        createdAt: Date.now(),
        value
      });
    }

    clear() {
      this.data.clear();
    }

    size() {
      return this.data.size;
    }
  }

  class WorkerPool {
    constructor(size) {
      this.size = Math.max(1, Number(size) || 1);
      this.workers = [];
      this.queue = [];
      this.jobs = new Map();
      this.started = false;
    }

    static source() {
      return `
        self.onmessage = async function(event) {
          const data = event.data || {};
          const task = data.task;
          const payload = data.payload || {};
          try {
            if (task === 'dedupe') {
              const values = Array.isArray(payload.values) ? payload.values : [];
              self.postMessage({
                id: data.id,
                ok: true,
                value: [...new Set(values.filter(Boolean).map(String))]
              });
              return;
            }

            if (task === 'consensus') {
              const values = Array.isArray(payload.values) ? payload.values.filter(Boolean).map(String) : [];
              const counts = Object.create(null);

              for (const value of values) {
                counts[value] = (counts[value] || 0) + 1;
              }

              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              if (!sorted.length) {
                self.postMessage({
                  id: data.id,
                  ok: true,
                  value: {
                    value: null,
                    confidence: 'NONE',
                    ratio: 0,
                    conflict: false,
                    count: 0,
                    total: 0
                  }
                });
                return;
              }

              const winner = sorted[0];
              const ratio = winner[1] / values.length;

              self.postMessage({
                id: data.id,
                ok: true,
                value: {
                  value: winner[0],
                  confidence: ratio === 1 && winner[1] >= 3 ? 'HIGH' :
                    ratio >= 0.66 ? 'MEDIUM' :
                    ratio >= 0.5 ? 'LOW' :
                    'NONE',
                  ratio,
                  conflict: sorted.length > 1,
                  count: winner[1],
                  total: values.length
                }
              });
              return;
            }

            if (task === 'score') {
              const payloadValue = payload.value || {};
              let score = 0;

              if (payloadValue.asn) score += 20;
              if (payloadValue.organization) score += 15;
              if (payloadValue.prefix) score += 10;
              if (payloadValue.country) score += 8;
              if (payloadValue.reverse) score += 8;
              if (payloadValue.domainCount > 0) score += Math.min(15, payloadValue.domainCount);
              if (payloadValue.certificateCount > 0) score += Math.min(10, payloadValue.certificateCount);
              if (payloadValue.threatFlag) score += 15;
              if (payloadValue.reputationFlag) score += 10;
              if (payloadValue.breachFlag) score += 15;
              if (payloadValue.passwordFlag) score += 10;
              if (payloadValue.companyFlag) score += 10;

              self.postMessage({
                id: data.id,
                ok: true,
                value: Math.min(100, score)
              });
              return;
            }

            self.postMessage({
              id: data.id,
              ok: false,
              value: null
            });
          } catch(error) {
            self.postMessage({
              id: data.id,
              ok: false,
              error: error && error.message ? error.message : 'WORKER_ERROR'
            });
          }
        };
      `;
    }

    start() {
      if (this.started || typeof Worker === 'undefined') return;
      this.started = true;

      const blob = new Blob([WorkerPool.source()], {
        type: 'application/javascript'
      });

      const url = URL.createObjectURL(blob);

      for (let index = 0; index < this.size; index++) {
        const worker = new Worker(url);

        worker.onmessage = event => {
          const data = event.data || {};
          const job = this.jobs.get(data.id);
          if (!job) return;

          this.jobs.delete(data.id);
          job.resolve(data.ok ? data.value : null);
          this.runNext(worker);
        };

        worker.onerror = () => {
          this.runNext(worker);
        };

        this.workers.push({
          worker,
          busy: false
        });
      }

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    runNext(workerRef) {
      workerRef.busy = false;

      const next = this.queue.shift();
      if (!next) return;

      workerRef.busy = true;
      this.jobs.set(next.id, {
        resolve: next.resolve,
        reject: next.reject
      });

      workerRef.worker.postMessage({
        id: next.id,
        task: next.task,
        payload: next.payload
      });
    }

    exec(task, payload = {}) {
      if (!this.started || !this.workers.length) {
        if (task === 'dedupe') {
          return Promise.resolve([...new Set((payload.values || []).filter(Boolean).map(String))]);
        }

        if (task === 'consensus') {
          const values = (payload.values || []).filter(Boolean).map(String);
          if (!values.length) {
            return Promise.resolve({
              value: null,
              confidence: 'NONE',
              ratio: 0,
              conflict: false,
              count: 0,
              total: 0
            });
          }

          const counts = {};
          for (const value of values) counts[value] = (counts[value] || 0) + 1;
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          const winner = sorted[0];
          const ratio = winner[1] / values.length;

          return Promise.resolve({
            value: winner[0],
            confidence: ratio === 1 && winner[1] >= 3 ? 'HIGH' :
              ratio >= 0.66 ? 'MEDIUM' :
              ratio >= 0.5 ? 'LOW' :
              'NONE',
            ratio,
            conflict: sorted.length > 1,
            count: winner[1],
            total: values.length
          });
        }

        if (task === 'score') {
          let score = 0;
          const v = payload.value || {};

          if (v.asn) score += 20;
          if (v.organization) score += 15;
          if (v.prefix) score += 10;
          if (v.country) score += 8;
          if (v.reverse) score += 8;
          score += Math.min(15, Number(v.domainCount) || 0);
          score += Math.min(10, Number(v.certificateCount) || 0);
          if (v.threatFlag) score += 15;
          if (v.reputationFlag) score += 10;
          if (v.breachFlag) score += 15;
          if (v.passwordFlag) score += 10;
          if (v.companyFlag) score += 10;

          return Promise.resolve(Math.min(100, score));
        }

        return Promise.resolve(null);
      }

      const free = this.workers.find(x => !x.busy);

      if (free) {
        free.busy = true;
        const requestId = id('worker');

        return new Promise((resolve, reject) => {
          this.jobs.set(requestId, {
            resolve,
            reject
          });

          free.worker.postMessage({
            id: requestId,
            task,
            payload
          });
        });
      }

      const requestId = id('worker');

      return new Promise((resolve, reject) => {
        this.queue.push({
          id: requestId,
          task,
          payload,
          resolve,
          reject
        });
      });
    }

    destroy() {
      for (const ref of this.workers) {
        try {
          ref.worker.terminate();
        } catch {}
      }

      this.workers.length = 0;
      this.queue.length = 0;
      this.jobs.clear();
      this.started = false;
    }
  }

  class EvidenceStore {
    constructor() {
      this.records = [];
    }

    add(record) {
      if (!record || typeof record !== 'object') return null;

      const normalized = {
        id: record.id || id('ev'),
        category: record.category || 'other',
        type: record.type || 'observation',
        source: record.source || 'unknown',
        sourceType: record.sourceType || 'public-api',
        observedAt: record.observedAt || new Date().toISOString(),
        requestId: record.requestId || null,
        status: record.status || 'OK',
        rawValue: record.rawValue ?? null,
        normalizedValue: record.normalizedValue ?? null,
        value: record.value ?? null,
        confidence: record.confidence || 'MEDIUM',
        note: record.note || '',
        metadata: record.metadata || {}
      };

      this.records.push(normalized);
      return normalized;
    }

    all() {
      return this.records.slice();
    }

    successful() {
      return this.records.filter(r =>
        r.category !== 'limitation' &&
        r.category !== 'diagnostic' &&
        !['ERROR', 'FAILED', 'UNAVAILABLE', 'NO_DATA'].includes(String(r.status))
      );
    }

    size() {
      return this.records.length;
    }
  }

  const limitation = (source, status, note) => ({
    category: 'limitation',
    type: 'limitation',
    source,
    sourceType: 'diagnostic',
    observedAt: new Date().toISOString(),
    status,
    value: null,
    rawValue: null,
    normalizedValue: null,
    confidence: 'NONE',
    note: String(note || ''),
    metadata: {}
  });

  const prepareProxyList = async forceRefresh => {
    if (!forceRefresh && state.proxyReady && state.workingProxies.length) {
      return state.workingProxies;
    }

    const proxies = getWorkingProxies();

    let merged = Array.isArray(proxies) ? proxies.slice() : [];

    if (state.customProxy && state.customProxy.includes('{url}')) {
      const duplicate = merged.some(p => p.template === state.customProxy);
      if (!duplicate) {
        merged.push({
          name: 'custom',
          template: state.customProxy
        });
      }
    }

    if (!merged.length) {
      throw new Error('NO_WORKING_PROXY');
    }

    state.workingProxies = merged;
    state.proxyReady = true;
    return merged;
  };

  const nextProxy = () => {
    if (!state.workingProxies.length) {
      throw new Error('NO_WORKING_PROXY');
    }

    const proxy = state.workingProxies[state.proxyIndex % state.workingProxies.length];
    state.proxyIndex = (state.proxyIndex + 1) % state.workingProxies.length;

    return proxy;
  };

  const buildProxyURL = (endpoint, proxy) => {
    const url = String(endpoint || '').trim();
    if (!url) throw new Error('INVALID_ENDPOINT');

    if (!proxy) {
      if (CONFIG.PROXY_REQUIRED && !CONFIG.ALLOW_DIRECT_FALLBACK) {
        const error = new Error('PROXY_REQUIRED');
        error.code = 'PROXY_REQUIRED';
        throw error;
      }
      return url;
    }

    if (!proxy.template || !proxy.template.includes('{url}')) {
      const error = new Error('INVALID_PROXY_TEMPLATE');
      error.code = 'INVALID_PROXY_TEMPLATE';
      throw error;
    }

    const output = proxy.template.replace('{url}', encodeURIComponent(url));

    try {
      const parsed = new URL(output);
      if (!/^https?:$/i.test(parsed.protocol)) throw new Error('BAD_PROTOCOL');
      return output;
    } catch {
      const error = new Error('INVALID_PROXY_URL');
      error.code = 'INVALID_PROXY_URL';
      throw error;
    }
  };

  const fetchRequest = async (endpoint, options = {}) => {
    const profile = options.profile === 'low' ? PROFILES.low : PROFILES.high;
    const retries = Math.max(
      0,
      Number(options.retries ?? (options.profile === 'low' ? CONFIG.MAX_RETRIES_LOW : CONFIG.MAX_RETRIES_HIGH))
    );
    const timeout = Math.max(
      1500,
      Number(options.timeout ?? profile.timeout)
    );
    const provider = String(options.provider || 'unknown');
    const responseType = options.responseType || 'auto';
    const method = String(options.method || 'GET').toUpperCase();
    const cache = options.cache;
    const cacheKey = `${method}:${endpoint}`;

    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const requestId = id('req');
    const attempts = [];
    const started = Date.now();
    let final = null;

    const proxies = state.workingProxies.length
      ? state.workingProxies
      : await prepareProxyList();

    const attemptsLimit = Math.min(proxies.length, retries + 1);

    for (let attempt = 1; attempt <= attemptsLimit; attempt++) {
      const proxy = proxies[(state.proxyIndex + attempt - 1) % proxies.length];
      let actualURL = endpoint;

      try {
        actualURL = buildProxyURL(endpoint, proxy);
      } catch (error) {
        final = {
          requestId,
          ok: false,
          status: 0,
          errorType: error.code || 'PROXY_ERROR',
          errorMessage: error.message,
          provider,
          endpoint,
          proxy: proxy?.name || 'none',
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
          headers: {},
          finalURL: null,
          redirected: false,
          data: null
        };

        attempts.push(final);
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const headers = {
          Accept: 'application/json,text/plain,text/html;q=0.9,*/*;q=0.8',
          'User-Agent': selectUserAgent(),
          ...(options.headers || {})
        };

        const response = await fetch(actualURL, {
          method,
          headers,
          signal: controller.signal,
          redirect: CONFIG.MAX_REDIRECTS > 0 ? 'follow' : 'manual'
        });

        clearTimeout(timer);

        const responseHeaders = normalizeHeaders(response.headers);
        let data = null;

        if (response.status !== 204 && response.status !== 205) {
          const text = await response.text();
          const contentType = response.headers.get('content-type') || '';

          if (responseType === 'text') {
            data = text;
          } else if (responseType === 'json') {
            data = parseJSON(text);
          } else {
            data = /json/i.test(contentType) ? parseJSON(text) : text;
          }
        }

        final = {
          requestId,
          ok: response.ok,
          status: response.status,
          errorType: response.ok ? null : mapHTTPError(response.status),
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
          provider,
          endpoint,
          requestedUrl: actualURL,
          proxy: proxy?.name || 'none',
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          headers: responseHeaders,
          finalURL: response.url || actualURL,
          redirected: Boolean(response.redirected),
          data,
          cached: false
        };

        attempts.push(final);

        if (response.ok) break;

        if (response.status === 429 || response.status >= 500) {
          await sleep(computeBackoff(attempt, responseHeaders));
        }
      } catch (error) {
        clearTimeout(timer);

        final = {
          requestId,
          ok: false,
          status: 0,
          errorType: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          errorMessage: error?.message || 'REQUEST_FAILED',
          provider,
          endpoint,
          requestedUrl: actualURL,
          proxy: proxy?.name || 'none',
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          headers: {},
          finalURL: null,
          redirected: false,
          data: null,
          cached: false
        };

        attempts.push(final);

        if (attempt < attemptsLimit) {
          await sleep(computeBackoff(attempt, {}));
        }
      }
    }

    state.proxyIndex = state.workingProxies.length
      ? (state.proxyIndex + 1) % state.workingProxies.length
      : 0;

    const result = {
      ...(final || {
        requestId,
        ok: false,
        status: 0,
        errorType: 'REQUEST_FAILED',
        errorMessage: 'REQUEST_FAILED',
        provider,
        endpoint,
        data: null
      }),
      requestId,
      attempts,
      totalDurationMs: Date.now() - started,
      cached: false
    };

    if (result.ok && cache) {
      cache.set(cacheKey, result);
    }

    return result;
  };

  const executeProvider = async (provider, ctx, store, cache) => {
    if (provider.enabled === false) {
      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        ok: false,
        records: [],
        raw: [],
        health: 'DISABLED'
      };
    }

    try {
      const output = await provider.execute(ctx, cache);

      for (const record of output.records || []) {
        store.add(record);
      }

      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        ok: true,
        records: output.records || [],
        raw: output.raw || [],
        health: classifyProviderHealth(output)
      };
    } catch (error) {
      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        ok: false,
        records: [],
        raw: [],
        health: 'UNAVAILABLE',
        error: String(error?.message || error)
      };
    }
  };

  const classifyProviderHealth = output => {
    const records = Array.isArray(output?.records) ? output.records : [];
    const usable = records.filter(r =>
      r &&
      r.category !== 'limitation' &&
      r.category !== 'diagnostic'
    );

    if (usable.length) return 'SUCCESS';
    if (records.some(r => r?.status === 'RATE_LIMITED')) return 'RATE_LIMITED';
    if (records.some(r => r?.status === 'AUTH_REQUIRED')) return 'AUTH_REQUIRED';
    if (records.some(r => r?.status === 'FORBIDDEN')) return 'FORBIDDEN';
    if (records.some(r => r?.status === 'NO_DATA')) return 'NO_DATA';
    return 'UNAVAILABLE';
  };

  const normalizeGeo = (source, data) => {
    const connection = data?.connection || {};

    const country = stringValue(
      data?.country ||
      data?.country_name ||
      data?.countryName ||
      data?.country_code ||
      data?.countryCode
    );

    const region = stringValue(
      data?.region ||
      data?.regionName ||
      data?.region_name ||
      data?.region_code ||
      data?.regionCode
    );

    const city = stringValue(data?.city);

    const latitude =
      safeNumber(data?.latitude) ??
      safeNumber(data?.lat);

    const longitude =
      safeNumber(data?.longitude) ??
      safeNumber(data?.lon) ??
      safeNumber(data?.lng);

    const timezone =
      typeof data?.timezone === 'string'
        ? data.timezone
        : stringValue(data?.timezone?.id || data?.timeZone);

    const isp = stringValue(
      data?.isp ||
      connection?.isp
    );

    const organization = stringValue(
      data?.org ||
      data?.organization ||
      connection?.org
    );

    const asn = stringValue(
      data?.as ||
      data?.asn ||
      connection?.asn
    );

    const asName = stringValue(
      data?.asname ||
      data?.asnname ||
      connection?.asname
    );

    const proxy = data?.proxy ?? connection?.proxy ?? null;
    const hosting = data?.hosting ?? connection?.hosting ?? null;
    const mobile = data?.mobile ?? connection?.mobile ?? null;

    const reverse = stringValue(
      data?.reverse ||
      data?.hostname
    );

    if (
      !country &&
      !region &&
      !city &&
      !isp &&
      !organization &&
      !asn &&
      latitude === null &&
      longitude === null &&
      !reverse
    ) {
      return null;
    }

    return {
      category: 'geolocation',
      type: 'geo',
      source,
      sourceType: 'public-api',
      observedAt: new Date().toISOString(),
      confidence: 'MEDIUM',
      status: 'OBSERVED',
      value: {
        country,
        region,
        city,
        latitude,
        longitude,
        timezone,
        isp,
        organization,
        asn,
        asName,
        proxy,
        hosting,
        mobile,
        reverse
      },
      rawValue: data,
      normalizedValue: null,
      note: `Normalized geolocation from ${source}`
    };
  };

  const createGeoProvider = (id, name, endpointBuilder, validator = () => true) => ({
    id,
    name,
    category: 'geolocation',
    enabled: CONFIG.ENABLE_GEO,
    async execute(ctx, cache) {
      const result = await fetchRequest(endpointBuilder(ctx), {
        provider: name,
        responseType: 'json',
        profile: ctx.profile,
        timeout: ctx.profileConfig.timeout,
        cache
      });

      if (!result.ok || !result.data) {
        return {
          raw: [result],
          records: []
        };
      }

      if (!validator(result.data)) {
        return {
          raw: [result],
          records: []
        };
      }

      const record = normalizeGeo(name, result.data);

      return {
        raw: [result],
        records: record ? [record] : []
      };
    }
  });

  const ripe = async (endpoint, resource, ctx, cache, params = {}) => {
    const query = new URLSearchParams({
      resource,
      sourceapp: CONFIG.SOURCE_APP,
      ...params
    });

    return fetchRequest(
      `https://stat.ripe.net/data/${endpoint}/data.json?${query.toString()}`,
      {
        provider: `RIPEstat:${endpoint}`,
        responseType: 'json',
        profile: ctx.profile,
        timeout: ctx.profileConfig.timeout,
        cache
      }
    );
  };

  const PROVIDERS = [
    createGeoProvider(
      'geo_ipwhois',
      'ipwho.is',
      ctx => `https://ipwho.is/${encodeURIComponent(ctx.ip)}`,
      data => data?.success !== false
    ),

    createGeoProvider(
      'geo_ipapi',
      'ipapi.co',
      ctx => `https://ipapi.co/${encodeURIComponent(ctx.ip)}/json/`,
      data => !data?.error
    ),

    createGeoProvider(
      'geo_ipapi_com',
      'ip-api.com',
      ctx => `https://ip-api.com/json/${encodeURIComponent(ctx.ip)}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`,
      data => data?.status === 'success'
    ),

    createGeoProvider(
      'geo_freeipapi',
      'freeipapi.com',
      ctx => `https://freeipapi.com/api/json/${encodeURIComponent(ctx.ip)}`,
      data => Boolean(data?.ip || data?.countryCode || data?.country)
    ),

    createGeoProvider(
      'geo_ipinfo',
      'ipinfo.io',
      ctx => `https://ipinfo.io/${encodeURIComponent(ctx.ip)}/json`,
      data => Boolean(data?.ip)
    ),

    createGeoProvider(
      'geo_ipbase',
      'IPBase',
      ctx => `https://api.ipbase.com/v2/info?ip=${encodeURIComponent(ctx.ip)}`
    ),

    createGeoProvider(
      'geo_ipapi_is',
      'ipapi.is',
      ctx => `https://api.ipapi.is/?q=${encodeURIComponent(ctx.ip)}`,
      data => Boolean(data?.ip)
    ),

    createGeoProvider(
      'geo_myipscan',
      'MyIPScan',
      ctx => `https://myipscan.net/api/ip/${encodeURIComponent(ctx.ip)}`,
      data => Boolean(data?.ip)
    ),

    {
      id: 'rdap',
      name: 'RDAP / RIR',
      category: 'registration',
      enabled: CONFIG.ENABLE_RDAP,
      async execute(ctx, cache) {
        const endpoints = [
          ['ARIN', `https://rdap.arin.net/registry/ip/${encodeURIComponent(ctx.ip)}`],
          ['RIPE', `https://rdap.db.ripe.net/ip/${encodeURIComponent(ctx.ip)}`],
          ['APNIC', `https://rdap.apnic.net/ip/${encodeURIComponent(ctx.ip)}`],
          ['AFRINIC', `https://rdap.afrinic.net/rdap/ip/${encodeURIComponent(ctx.ip)}`],
          ['LACNIC', `https://rdap.lacnic.net/rdap/ip/${encodeURIComponent(ctx.ip)}`]
        ];

        const responses = await Promise.all(
          endpoints.map(async ([rir, endpoint]) => ({
            rir,
            result: await fetchRequest(endpoint, {
              provider: `RDAP:${rir}`,
              responseType: 'json',
              profile: ctx.profile,
              timeout: ctx.profileConfig.timeout,
              cache
            })
          }))
        );

        const records = [];

        for (const item of responses) {
          if (!item.result.ok || !item.result.data) continue;

          const data = item.result.data;

          records.push({
            category: 'registration',
            type: 'rdap',
            source: `RDAP:${item.rir}`,
            sourceType: 'authoritative',
            observedAt: item.result.completedAt,
            confidence: 'HIGH',
            status: 'CONFIRMED',
            value: {
              rir: item.rir,
              name: data?.name || null,
              handle: data?.handle || null,
              startAddress: data?.startAddress || null,
              endAddress: data?.endAddress || null,
              ipVersion: data?.ipVersion || null,
              country: data?.country || null,
              status: Array.isArray(data?.status) ? data.status : [],
              entities: Array.isArray(data?.entities)
                ? data.entities.slice(0, CONFIG.MAX_RECORDS_PER_SECTION).map(entity => ({
                    handle: entity?.handle || null,
                    roles: Array.isArray(entity?.roles) ? entity.roles : [],
                    name: Array.isArray(entity?.vcardArray?.[1])
                      ? entity.vcardArray[1].find(x => x?.[0] === 'fn')?.[3] || null
                      : null
                  }))
                : []
            },
            rawValue: data,
            normalizedValue: null,
            note: 'Authoritative RIR RDAP observation.',
            requestId: item.result.requestId
          });
        }

        return {
          raw: responses.map(x => x.result),
          records
        };
      }
    },

    {
      id: 'ripestat_whois',
      name: 'RIPEstat Whois',
      category: 'registration',
      enabled: CONFIG.ENABLE_RIPESTAT,
      async execute(ctx, cache) {
        const result = await ripe('whois', ctx.ip, ctx, cache);

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data?.data || result.data;

        return {
          raw: [result],
          records: [{
            category: 'registration',
            type: 'ripestat_whois',
            source: 'RIPEstat Whois',
            sourceType: 'registry',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: Array.isArray(data?.records) && data.records.length ? 'CONFIRMED' : 'AVAILABLE',
            value: {
              authorities: Array.isArray(data?.authorities) ? data.authorities : [],
              records: Array.isArray(data?.records)
                ? data.records.slice(0, CONFIG.MAX_RECORDS_PER_SECTION)
                : [],
              resource: data?.resource || ctx.ip
            },
            rawValue: data,
            normalizedValue: null,
            note: 'RIPE registry observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'ripestat_network',
      name: 'RIPEstat Network',
      category: 'network',
      enabled: CONFIG.ENABLE_RIPESTAT,
      async execute(ctx, cache) {
        const result = await ripe('network-info', ctx.ip, ctx, cache);

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data?.data || result.data;

        return {
          raw: [result],
          records: [{
            category: 'network',
            type: 'ripestat_network',
            source: 'RIPEstat Network',
            sourceType: 'routing',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: data?.prefix || Array.isArray(data?.asns) && data.asns.length
              ? 'ANNOUNCED'
              : 'AVAILABLE',
            value: {
              prefix: data?.prefix || null,
              asns: Array.isArray(data?.asns)
                ? data.asns.slice(0, CONFIG.MAX_PEERS)
                : [],
              announced: Boolean(data?.prefix || Array.isArray(data?.asns) && data.asns.length)
            },
            rawValue: data,
            normalizedValue: null,
            note: 'Current RIPEstat routing observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'ripestat_prefix',
      name: 'RIPEstat Prefix',
      category: 'network',
      enabled: CONFIG.ENABLE_RIPESTAT,
      async execute(ctx, cache) {
        const networkResult = await ripe('network-info', ctx.ip, ctx, cache);

        if (!networkResult.ok || !networkResult.data) {
          return {
            raw: [networkResult],
            records: []
          };
        }

        const network = networkResult.data?.data || networkResult.data;
        const prefix = network?.prefix;

        if (!prefix) {
          return {
            raw: [networkResult],
            records: []
          };
        }

        const result = await ripe(
          'prefix-overview',
          prefix,
          ctx,
          cache,
          {
            max_related: '100',
            min_peers_seeing: '1'
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [networkResult, result],
            records: []
          };
        }

        const data = result.data?.data || result.data;

        return {
          raw: [networkResult, result],
          records: [{
            category: 'network',
            type: 'prefix_overview',
            source: 'RIPEstat Prefix Overview',
            sourceType: 'routing',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: data?.announced === true ? 'ANNOUNCED' : 'AVAILABLE',
            value: {
              prefix: data?.resource || prefix,
              announced: Boolean(data?.announced),
              holders: Array.isArray(data?.asns)
                ? data.asns.slice(0, CONFIG.MAX_PEERS).map(x => ({
                    asn: x?.asn ?? null,
                    holder: x?.holder ?? null
                  }))
                : [],
              relatedPrefixes: Array.isArray(data?.related_prefixes)
                ? data.related_prefixes.slice(0, CONFIG.MAX_RECORDS_PER_SECTION)
                : []
            },
            rawValue: data,
            normalizedValue: null,
            note: 'Current prefix relationship observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'ripestat_looking_glass',
      name: 'RIPEstat Looking Glass',
      category: 'routing',
      enabled: CONFIG.ENABLE_RIPESTAT,
      async execute(ctx, cache) {
        const result = await ripe(
          'looking-glass',
          ctx.ip,
          ctx,
          cache,
          {
            look_back_limit: '86400'
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const rr = result.data?.data?.rrcs || result.data?.rrcs || {};
        const records = [];

        for (const [rrc, value] of Object.entries(rr)) {
          const entries = Array.isArray(value?.entries)
            ? value.entries
            : Array.isArray(value?.peers)
              ? value.peers
              : [];

          for (const entry of entries.slice(0, CONFIG.MAX_PEERS)) {
            records.push({
              category: 'routing',
              type: 'looking_glass',
              source: 'RIPEstat Looking Glass',
              sourceType: 'routing-observation',
              observedAt: result.completedAt,
              confidence: 'HIGH',
              status: 'OBSERVED',
              value: {
                rrc,
                prefix: entry?.prefix || null,
                origin: entry?.asn_origin ?? entry?.origin ?? null,
                peer: entry?.peer ?? null,
                asPath: entry?.as_path ?? entry?.asPath ?? null
              },
              rawValue: entry,
              normalizedValue: null,
              note: 'Observed route path.',
              requestId: result.requestId
            });
          }
        }

        return {
          raw: [result],
          records
        };
      }
    },

    {
      id: 'ripestat_bgplay',
      name: 'RIPEstat BGPlay',
      category: 'history',
      enabled: CONFIG.ENABLE_RIPESTAT,
      async execute(ctx, cache) {
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 86400000);

        const result = await ripe(
          'bgplay',
          ctx.ip,
          ctx,
          cache,
          {
            starttime: start.toISOString(),
            endtime: end.toISOString()
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data?.data || result.data;
        const events = Array.isArray(data?.events)
          ? data.events.slice(0, CONFIG.MAX_BGP_EVENTS)
          : [];

        return {
          raw: [result],
          records: events.length
            ? [{
                category: 'history',
                type: 'bgplay',
                source: 'RIPEstat BGPlay',
                sourceType: 'historical-routing',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'AVAILABLE',
                value: {
                  windowStart: start.toISOString(),
                  windowEnd: end.toISOString(),
                  events: events.map(event => ({
                    timestamp: event?.timestamp || event?.time || null,
                    type: event?.type || null,
                    prefix: event?.target || event?.attrs?.prefix || null,
                    origin: event?.attrs?.origin || event?.origin || null,
                    path: event?.attrs?.as_path || event?.attrs?.asPath || event?.as_path || null
                  }))
                },
                rawValue: data,
                normalizedValue: null,
                note: 'Historical BGP observations.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'bgpview',
      name: 'BGPView',
      category: 'network',
      enabled: CONFIG.ENABLE_BGPVIEW,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://api.bgpview.io/ip/${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'BGPView',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const prefixes = Array.isArray(result.data?.data?.prefixes)
          ? result.data.data.prefixes.slice(0, CONFIG.MAX_RECORDS_PER_SECTION)
          : [];

        return {
          raw: [result],
          records: prefixes.map(prefix => ({
            category: 'network',
            type: 'bgp',
            source: 'BGPView',
            sourceType: 'public-routing-api',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: 'CURRENT',
            value: {
              prefix: prefix?.prefix || null,
              asn: prefix?.asn?.asn ?? null,
              asName: prefix?.asn?.name || null,
              country: prefix?.country_code || null
            },
            rawValue: prefix,
            normalizedValue: null,
            note: 'Current BGP prefix observation.',
            requestId: result.requestId
          }))
        };
      }
    },

    {
      id: 'dns_google_ptr',
      name: 'Google Public DNS',
      category: 'dns',
      enabled: CONFIG.ENABLE_DNS,
      async execute(ctx, cache) {
        const reverseName = ctx.version === 4
          ? `${ctx.ip.split('.').reverse().join('.')}.in-addr.arpa`
          : expandIPv6(ctx.ip)?.split('').reverse().join('.') + '.ip6.arpa';

        if (!reverseName) return { raw: [], records: [] };

        const result = await fetchRequest(
          `https://dns.google/resolve?name=${encodeURIComponent(reverseName)}&type=PTR`,
          {
            provider: 'Google Public DNS PTR',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const answers = Array.isArray(result.data?.Answer)
          ? result.data.Answer
          : [];

        return {
          raw: [result],
          records: answers.slice(0, CONFIG.MAX_RECORDS_PER_SECTION).map(answer => ({
            category: 'dns',
            type: 'ptr',
            source: 'Google Public DNS',
            sourceType: 'public-dns',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: 'CONFIRMED',
            value: {
              name: reverseName,
              value: String(answer?.data || '').replace(/\.$/, '')
            },
            rawValue: answer?.data || null,
            normalizedValue: normalizeDomain(answer?.data),
            note: 'PTR record observed.',
            requestId: result.requestId
          }))
        };
      }
    },

    {
      id: 'dns_cloudflare',
      name: 'Cloudflare DNS',
      category: 'dns',
      enabled: CONFIG.ENABLE_DNS,
      async execute(ctx, cache) {
        const reverseName = ctx.version === 4
          ? `${ctx.ip.split('.').reverse().join('.')}.in-addr.arpa`
          : expandIPv6(ctx.ip)?.split('').reverse().join('.') + '.ip6.arpa';

        if (!reverseName) return { raw: [], records: [] };

        const result = await fetchRequest(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(reverseName)}&type=PTR`,
          {
            provider: 'Cloudflare DNS PTR',
            responseType: 'json',
            headers: {
              Accept: 'application/dns-json'
            },
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const answers = Array.isArray(result.data?.Answer)
          ? result.data.Answer
          : [];

        return {
          raw: [result],
          records: answers.slice(0, CONFIG.MAX_RECORDS_PER_SECTION).map(answer => ({
            category: 'dns',
            type: 'ptr',
            source: 'Cloudflare DNS',
            sourceType: 'public-dns',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: 'CONFIRMED',
            value: {
              name: reverseName,
              value: String(answer?.data || '').replace(/\.$/, '')
            },
            rawValue: answer?.data || null,
            normalizedValue: normalizeDomain(answer?.data),
            note: 'PTR record independently observed.',
            requestId: result.requestId
          }))
        };
      }
    },

    {
      id: 'crtsh',
      name: 'crt.sh',
      category: 'certificate',
      enabled: CONFIG.ENABLE_CT,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://crt.sh/?q=${encodeURIComponent(ctx.ip)}&output=json`,
          {
            provider: 'crt.sh',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok) {
          return {
            raw: [result],
            records: []
          };
        }

        const entries = Array.isArray(result.data)
          ? result.data.slice(0, CONFIG.MAX_CERTIFICATES)
          : [];

        return {
          raw: [result],
          records: entries.map(entry => ({
            category: 'certificate',
            type: 'ct',
            source: 'crt.sh',
            sourceType: 'certificate-transparency',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: 'OBSERVED',
            value: {
              issuer: entry?.issuer_name || null,
              subject: entry?.subject_dn || null,
              san: String(entry?.name_value || '')
                .split(/\r?\n/)
                .map(normalizeDomain)
                .filter(Boolean)
                .slice(0, 100),
              notBefore: entry?.not_before || null,
              notAfter: entry?.not_after || null,
              serialNumber: entry?.serial_number || null
            },
            rawValue: entry,
            normalizedValue: null,
            note: 'Certificate Transparency association.',
            requestId: result.requestId
          }))
        };
      }
    },

    {
      id: 'hackertarget_reverse_ip',
      name: 'HackerTarget Reverse IP',
      category: 'domains',
      enabled: CONFIG.ENABLE_REVERSE_IP,
      async execute(ctx, cache) {
        if (ctx.version !== 4) return { raw: [], records: [] };

        const result = await fetchRequest(
          `https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'HackerTarget Reverse IP',
            responseType: 'text',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok) return { raw: [result], records: [] };

        const domains = unique(
          String(result.data || '')
            .split(/\r?\n/)
            .map(normalizeDomain)
            .filter(Boolean)
        ).slice(0, CONFIG.MAX_DOMAINS);

        return {
          raw: [result],
          records: domains.length
            ? [{
                category: 'domains',
                type: 'reverse_ip',
                source: 'HackerTarget Reverse IP',
                sourceType: 'public-dataset',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'FOUND',
                value: {
                  domains
                },
                rawValue: null,
                normalizedValue: domains,
                note: 'Passive reverse-IP domain associations.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hackertarget_geo',
      name: 'HackerTarget GeoIP',
      category: 'geolocation',
      enabled: CONFIG.ENABLE_HACKERTARGET,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://api.hackertarget.com/geoip/?q=${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'HackerTarget GeoIP',
            responseType: 'text',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok) return { raw: [result], records: [] };

        const parsed = {};

        for (const textLine of String(result.data || '').split(/\r?\n/)) {
          const index = textLine.indexOf(':');
          if (index <= 0) continue;

          const key = textLine
            .slice(0, index)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');

          const value = textLine.slice(index + 1).trim();

          if (key && value) parsed[key] = value;
        }

        return {
          raw: [result],
          records: Object.keys(parsed).length
            ? [{
                category: 'geolocation',
                type: 'geo_hackertarget',
                source: 'HackerTarget GeoIP',
                sourceType: 'public-api',
                observedAt: result.completedAt,
                confidence: 'LOW',
                status: 'OBSERVED',
                value: parsed,
                rawValue: null,
                normalizedValue: null,
                note: 'Independent geolocation reference.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hackertarget_as',
      name: 'HackerTarget AS',
      category: 'network',
      enabled: CONFIG.ENABLE_HACKERTARGET,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://api.hackertarget.com/aslookup/?q=${encodeURIComponent(ctx.ip)}&output=json&details=true`,
          {
            provider: 'HackerTarget AS',
            responseType: 'auto',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok) return { raw: [result], records: [] };

        const data = typeof result.data === 'string'
          ? parseJSON(result.data) || {}
          : result.data || {};

        return {
          raw: [result],
          records: data && typeof data === 'object'
            ? [{
                category: 'network',
                type: 'aslookup',
                source: 'HackerTarget AS',
                sourceType: 'public-api',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: data?.asn || data?.asn_name || data?.organization ? 'FOUND' : 'AVAILABLE',
                value: {
                  asn: data?.asn || null,
                  asnName: data?.asn_name || null,
                  range: data?.asn_range || null,
                  organization: data?.organization || null,
                  description: data?.description || null
                },
                rawValue: null,
                normalizedValue: null,
                note: 'Independent ASN lookup.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hackertarget_whois',
      name: 'HackerTarget WHOIS',
      category: 'registration',
      enabled: CONFIG.ENABLE_HACKERTARGET,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://api.hackertarget.com/whois/?q=${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'HackerTarget WHOIS',
            responseType: 'text',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const text = String(result.data).trim();

        if (!text) return { raw: [result], records: [] };

        return {
          raw: [result],
          records: [{
            category: 'registration',
            type: 'whois',
            source: 'HackerTarget WHOIS',
            sourceType: 'public-api',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: 'AVAILABLE',
            value: {
              text: text.slice(0, 12000)
            },
            rawValue: null,
            normalizedValue: null,
            note: 'Public WHOIS response.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'otx',
      name: 'AlienVault OTX',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_THREAT_INTEL,
      async execute(ctx, cache) {
        const family = ctx.version === 4 ? 'IPv4' : 'IPv6';

        const result = await fetchRequest(
          `https://otx.alienvault.com/api/v1/indicators/${family}/${encodeURIComponent(ctx.ip)}/general`,
          {
            provider: 'AlienVault OTX',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const pulseCount = safeNumber(data?.pulse_info?.count) || 0;

        return {
          raw: [result],
          records: [{
            category: 'threat_intel',
            type: 'otx',
            source: 'AlienVault OTX',
            sourceType: 'public-threat-intel',
            observedAt: result.completedAt,
            confidence: pulseCount > 0 ? 'HIGH' : 'LOW',
            status: pulseCount > 0 ? 'FLAGGED' : 'OBSERVED',
            value: {
              pulseCount,
              reputation: data?.reputation ?? null,
              country: data?.country_name || null,
              asn: data?.asn || null,
              domain: data?.domain || null,
              hostname: data?.hostname || null
            },
            rawValue: null,
            normalizedValue: null,
            note: 'Public threat-intelligence observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'greynoise',
      name: 'GreyNoise Community',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_GREYNOISE,
      async execute(ctx, cache) {
        if (ctx.version !== 4) return { raw: [], records: [] };

        const result = await fetchRequest(
          `https://api.greynoise.io/v3/community/${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'GreyNoise Community',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data;

        return {
          raw: [result],
          records: [{
            category: 'threat_intel',
            type: 'greynoise',
            source: 'GreyNoise Community',
            sourceType: 'public-threat-intel',
            observedAt: result.completedAt,
            confidence: data?.classification ? 'HIGH' : 'MEDIUM',
            status: data?.noise === true
              ? 'NOISY'
              : data?.riot === true
                ? 'RIOT'
                : 'OBSERVED',
            value: {
              classification: data?.classification || null,
              noise: data?.noise ?? null,
              riot: data?.riot ?? null,
              name: data?.name || null,
              lastSeen: data?.last_seen || null,
              link: normalizeURL(data?.link)
            },
            rawValue: null,
            normalizedValue: null,
            note: 'GreyNoise Community IP observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'proxycheck',
      name: 'ProxyCheck.io',
      category: 'reputation',
      enabled: CONFIG.ENABLE_PROXYCHECK,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://proxycheck.io/v2/${encodeURIComponent(ctx.ip)}?vpn=1&risk=1&asn=1&node=1`,
          {
            provider: 'ProxyCheck.io',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const ipData = data?.[ctx.ip] || data?.data || {};
        const risk = safeNumber(ipData?.risk);

        return {
          raw: [result],
          records: [{
            category: 'reputation',
            type: 'proxycheck',
            source: 'ProxyCheck.io',
            sourceType: 'public-reputation-api',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: data?.status === 'ok' ? 'OBSERVED' : 'AVAILABLE',
            value: {
              proxy: ipData?.proxy ?? null,
              vpn: ipData?.vpn ?? null,
              risk,
              type: ipData?.type || null,
              provider: ipData?.provider || null,
              organization: ipData?.organisation || ipData?.organization || null,
              asn: ipData?.asn || null,
              hostname: ipData?.hostname || null
            },
            rawValue: null,
            normalizedValue: null,
            note: 'Public proxy/VPN reputation observation.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'dnsbl',
      name: 'Public DNSBL',
      category: 'reputation',
      enabled: CONFIG.ENABLE_REPUTATION,
      async execute(ctx, cache) {
        if (ctx.version !== 4) return { raw: [], records: [] };

        const reverse = ctx.ip.split('.').reverse().join('.');

        const zones = [
          ['Spamhaus ZEN', `${reverse}.zen.spamhaus.org`],
          ['Barracuda Central', `${reverse}.b.barracudacentral.org`],
          ['SpamCop', `${reverse}.bl.spamcop.net`],
          ['UCEPROTECT', `${reverse}.dnsbl-1.uceprotect.net`]
        ];

        const results = await Promise.all(
          zones.map(async ([name, zone]) => ({
            name,
            result: await fetchRequest(
              `https://dns.google/resolve?name=${encodeURIComponent(zone)}&type=A`,
              {
                provider: `DNSBL:${name}`,
                responseType: 'json',
                profile: ctx.profile,
                timeout: ctx.profileConfig.probeTimeout,
                cache
              }
            )
          }))
        );

        const records = [];

        for (const item of results) {
          if (!item.result.ok || !item.result.data) continue;

          const answer = Array.isArray(item.result.data?.Answer)
            ? item.result.data.Answer
            : [];

          const status = answer.length
            ? 'LISTED'
            : item.result.data?.Status === 3
              ? 'NOT_LISTED'
              : 'NO_DECISION';

          records.push({
            category: 'reputation',
            type: 'dnsbl',
            source: item.name,
            sourceType: 'public-dnsbl',
            observedAt: item.result.completedAt,
            confidence: status === 'LISTED'
              ? 'HIGH'
              : status === 'NOT_LISTED'
                ? 'MEDIUM'
                : 'LOW',
            status,
            value: {
              status,
              evidence: answer.map(x => x?.data).filter(Boolean)
            },
            rawValue: null,
            normalizedValue: status,
            note: `Public DNSBL cross-check from ${item.name}.`,
            requestId: item.result.requestId
          });
        }

        return {
          raw: results.map(x => x.result),
          records
        };
      }
    },

    {
      id: 'urlscan',
      name: 'URLScan',
      category: 'exposure',
      enabled: CONFIG.ENABLE_URLSCAN,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`ip:${ctx.ip}`)}&size=100`,
          {
            provider: 'URLScan',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const results = Array.isArray(result.data?.results)
          ? result.data.results.slice(0, CONFIG.MAX_URLS)
          : [];

        const urls = unique(
          results
            .map(x => normalizeURL(x?.page?.url))
            .filter(Boolean)
        ).slice(0, CONFIG.MAX_URLS);

        const domains = unique(
          results
            .map(x => normalizeDomain(x?.page?.domain || x?.task?.domain))
            .filter(Boolean)
        ).slice(0, CONFIG.MAX_DOMAINS);

        return {
          raw: [result],
          records: urls.length || domains.length
            ? [{
                category: 'exposure',
                type: 'urlscan',
                source: 'URLScan',
                sourceType: 'public-web-observation',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'FOUND',
                value: {
                  count: results.length,
                  urls,
                  domains
                },
                rawValue: null,
                normalizedValue: {
                  urls,
                  domains
                },
                note: 'Public historical URL associations.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'http_probe',
      name: 'HTTP/HTTPS Probe',
      category: 'services',
      enabled: CONFIG.ENABLE_HTTP_PROBE,
      async execute(ctx, cache) {
        const targets = [
          ['https', 443, canonicalTargetURL(ctx.ip, ctx.version, 'https')],
          ['http', 80, canonicalTargetURL(ctx.ip, ctx.version, 'http')]
        ];

        const outputs = await Promise.all(
          targets.map(async ([scheme, port, url]) => ({
            scheme,
            port,
            url,
            result: await fetchRequest(url, {
              provider: `HTTP:${scheme}`,
              responseType: 'text',
              profile: ctx.profile,
              timeout: ctx.profileConfig.probeTimeout,
              cache
            })
          }))
        );

        const records = [];

        for (const item of outputs) {
          if (!item.result.ok) continue;

          const body = String(item.result.data || '');
          const headers = item.result.headers || {};

          records.push({
            category: 'services',
            type: 'http',
            source: `active-${item.scheme}`,
            sourceType: 'active-web-observation',
            observedAt: item.result.completedAt,
            confidence: 'HIGH',
            status: 'REACHABLE',
            value: {
              scheme: item.scheme,
              port: item.port,
              targetURL: item.url,
              finalURL: normalizeURL(item.result.finalURL || item.url, item.url),
              statusCode: item.result.status,
              redirected: item.result.redirected,
              server: headers.server || null,
              contentType: headers['content-type'] || null,
              title: detectTitle(body),
              technologies: detectTechnologies(headers, body),
              headers: normalizeHeaders(item.result.headers || {})
            },
            rawValue: CONFIG.ENABLE_HTTP_PROBE
              ? {
                  headers
                }
              : null,
            normalizedValue: null,
            note: 'Active public web observation.',
            requestId: item.result.requestId
          });
        }

        return {
          raw: outputs.map(x => x.result),
          records
        };
      }
    },

    {
      id: 'tls_probe',
      name: 'TLS Probe',
      category: 'tls',
      enabled: CONFIG.ENABLE_TLS_PROBE,
      async execute(ctx, cache) {
        const url = canonicalTargetURL(ctx.ip, ctx.version, 'https');

        const result = await fetchRequest(url, {
          provider: 'TLS Endpoint',
          responseType: 'text',
          profile: ctx.profile,
          timeout: ctx.profileConfig.probeTimeout,
          cache
        });

        if (!result.ok) {
          return {
            raw: [result],
            records: []
          };
        }

        return {
          raw: [result],
          records: [{
            category: 'tls',
            type: 'tls_endpoint',
            source: 'HTTPS Fetch',
            sourceType: 'active-web-observation',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: 'HTTPS_REACHABLE',
            value: {
              targetURL: url,
              finalURL: normalizeURL(result.finalURL || url, url),
              hsts: Boolean(result.headers?.['strict-transport-security']),
              server: result.headers?.server || null
            },
            rawValue: null,
            normalizedValue: null,
            note: 'HTTPS endpoint responded.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'xposedornot',
      name: 'XposedOrNot',
      category: 'breach',
      enabled: CONFIG.ENABLE_XPOSEDORNOT,
      async execute(ctx, cache) {
        const email = ctx.email || ctx.ip;
        const result = await fetchRequest(
          `https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`,
          {
            provider: 'XposedOrNot',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const breaches = Array.isArray(data?.breaches)
          ? data.breaches.flat().filter(Boolean).slice(0, CONFIG.MAX_BREACHES)
          : [];

        return {
          raw: [result],
          records: breaches.length
            ? [{
                category: 'breach',
                type: 'xposedornot',
                source: 'XposedOrNot',
                sourceType: 'public-breach-api',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'BREACHED',
                value: {
                  email,
                  breaches,
                  breachCount: breaches.length,
                  status: data?.status || 'success'
                },
                rawValue: data,
                normalizedValue: breaches,
                note: 'Email breach exposure detected.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hibp_email',
      name: 'HaveIBeenPwned Email',
      category: 'breach',
      enabled: CONFIG.ENABLE_HIBP,
      async execute(ctx, cache) {
        const email = ctx.email || ctx.ip;
        const result = await fetchRequest(
          `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
          {
            provider: 'HaveIBeenPwned Email',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            headers: {
              'User-Agent': 'MUNITOS-IPScan'
            }
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const breaches = Array.isArray(result.data)
          ? result.data.slice(0, CONFIG.MAX_BREACHES)
          : [];

        return {
          raw: [result],
          records: breaches.length
            ? [{
                category: 'breach',
                type: 'hibp_email',
                source: 'HaveIBeenPwned',
                sourceType: 'public-breach-api',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'BREACHED',
                value: {
                  email,
                  breaches: breaches.map(b => ({
                    name: b?.Name || null,
                    title: b?.Title || null,
                    domain: b?.Domain || null,
                    breachDate: b?.BreachDate || null,
                    addedDate: b?.AddedDate || null,
                    pwnCount: b?.PwnCount ?? null,
                    dataClasses: Array.isArray(b?.DataClasses) ? b.DataClasses : [],
                    description: b?.Description || null,
                    isVerified: b?.IsVerified ?? null,
                    isFabricated: b?.IsFabricated ?? null,
                    isSensitive: b?.IsSensitive ?? null,
                    isRetired: b?.IsRetired ?? null,
                    isSpamList: b?.IsSpamList ?? null,
                    logoPath: b?.LogoPath || null
                  }))
                },
                rawValue: result.data,
                normalizedValue: breaches.map(b => b?.Name),
                note: 'Email breach exposure from HIBP.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hackmyip_breach',
      name: 'HackMyIP Breach',
      category: 'breach',
      enabled: CONFIG.ENABLE_HACKMYIP_BREACH,
      async execute(ctx, cache) {
        const email = ctx.email || ctx.ip;
        const result = await fetchRequest(
          `https://hackmyip.com/api/breach?email=${encodeURIComponent(email)}`,
          {
            provider: 'HackMyIP Breach',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const breachCount = safeNumber(data?.breachCount) || safeNumber(data?.count) || 0;

        return {
          raw: [result],
          records: breachCount > 0
            ? [{
                category: 'breach',
                type: 'hackmyip',
                source: 'HackMyIP Breach',
                sourceType: 'public-breach-api',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'BREACHED',
                value: {
                  email,
                  breachCount,
                  breaches: Array.isArray(data?.breaches) ? data.breaches.slice(0, CONFIG.MAX_BREACHES) : [],
                  riskLevel: data?.riskLevel || data?.risk || null,
                  details: data?.details || null
                },
                rawValue: data,
                normalizedValue: breachCount,
                note: 'Email breach exposure from HackMyIP.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'hibp_passwords',
      name: 'HIBP Pwned Passwords',
      category: 'password',
      enabled: CONFIG.ENABLE_HIBP_PASSWORDS,
      async execute(ctx, cache) {
        const password = ctx.password || ctx.ip;
        const sha1 = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
        const hash = Array.from(new Uint8Array(sha1)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);

        const result = await fetchRequest(
          `https://api.pwnedpasswords.com/range/${prefix}`,
          {
            provider: 'HIBP Pwned Passwords',
            responseType: 'text',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            headers: {
              'Add-Padding': 'true'
            }
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const text = String(result.data || '');
        const lines = text.split(/\r?\n/);
        let count = 0;
        let found = false;

        for (const line of lines) {
          const parts = line.split(':');
          if (parts.length === 2 && parts[0].trim() === suffix) {
            count = safeNumber(parts[1].trim()) || 0;
            found = count > 0;
            break;
          }
        }

        return {
          raw: [result],
          records: [{
            category: 'password',
            type: 'hibp_passwords',
            source: 'HIBP Pwned Passwords',
            sourceType: 'public-password-api',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: found ? 'PWNED' : 'NOT_PWNED',
            value: {
              pwned: found,
              count: count,
              prefix: prefix,
              hashAlgorithm: 'SHA-1'
            },
            rawValue: null,
            normalizedValue: count,
            note: found
              ? `Password found in ${count.toLocaleString()} breaches.`
              : 'Password not found in any known breach.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'sec_edgar',
      name: 'SEC EDGAR',
      category: 'company',
      enabled: CONFIG.ENABLE_SEC_EDGAR,
      async execute(ctx, cache) {
        const query = ctx.company || ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=2020-01-01&enddt=${new Date().toISOString().split('T')[0]}&forms=10-K,10-Q,8-K`,
          {
            provider: 'SEC EDGAR',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            headers: {
              'User-Agent': 'MUNITOS-IPScan contact@munitos.local'
            }
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const hits = Array.isArray(result.data?.hits?.hits)
          ? result.data.hits.hits.slice(0, 50)
          : [];

        return {
          raw: [result],
          records: hits.length
            ? [{
                category: 'company',
                type: 'sec_edgar',
                source: 'SEC EDGAR',
                sourceType: 'public-company-api',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'FOUND',
                value: {
                  query,
                  filings: hits.map(hit => ({
                    companyName: hit?._source?.display_names?.[0] || null,
                    cik: hit?._source?.cik || null,
                    formType: hit?._source?.file_type || null,
                    filingDate: hit?._source?.file_date || null,
                    accessionNumber: hit?._id || null,
                    fileUrl: hit?._id ? `https://www.sec.gov/Archives/edgar/data/${hit._source?.cik}/${hit._id.replace(/-/g, '')}` : null
                  }))
                },
                rawValue: result.data,
                normalizedValue: hits.length,
                note: 'SEC EDGAR company filings.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'gleif_lei',
      name: 'GLEIF LEI Lookup',
      category: 'company',
      enabled: CONFIG.ENABLE_GLEIF,
      async execute(ctx, cache) {
        const query = ctx.company || ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(query)}`,
          {
            provider: 'GLEIF LEI Lookup',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const records = Array.isArray(result.data?.data)
          ? result.data.data.slice(0, 50)
          : [];

        return {
          raw: [result],
          records: records.length
            ? [{
                category: 'company',
                type: 'gleif_lei',
                source: 'GLEIF LEI Lookup',
                sourceType: 'public-company-api',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'FOUND',
                value: {
                  query,
                  entities: records.map(record => ({
                    lei: record?.id || null,
                    legalName: record?.attributes?.entity?.legalName?.name || null,
                    legalAddress: record?.attributes?.entity?.legalAddress || null,
                    headquartersAddress: record?.attributes?.entity?.headquartersAddress || null,
                    registrationStatus: record?.attributes?.registration?.status || null,
                    registrationDate: record?.attributes?.registration?.initialRegistrationDate || null,
                    lastUpdateDate: record?.attributes?.registration?.lastUpdateDate || null,
                    managingLou: record?.attributes?.registration?.managingLou || null,
                    corroborationLevel: record?.attributes?.registration?.corroborationLevel || null,
                    entityStatus: record?.attributes?.entity?.status || null,
                    legalForm: record?.attributes?.entity?.legalForm?.id || null
                  }))
                },
                rawValue: result.data,
                normalizedValue: records.length,
                note: 'GLEIF LEI company records.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'opencorporates',
      name: 'OpenCorporates',
      category: 'company',
      enabled: CONFIG.ENABLE_OPENCORPORATES,
      async execute(ctx, cache) {
        const query = ctx.company || ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}`,
          {
            provider: 'OpenCorporates',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const companies = Array.isArray(result.data?.results?.companies)
          ? result.data.results.companies.slice(0, 50)
          : [];

        return {
          raw: [result],
          records: companies.length
            ? [{
                category: 'company',
                type: 'opencorporates',
                source: 'OpenCorporates',
                sourceType: 'public-company-api',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'FOUND',
                value: {
                  query,
                  companies: companies.map(item => ({
                    name: item?.company?.name || null,
                    jurisdiction: item?.company?.jurisdiction_code || null,
                    companyNumber: item?.company?.company_number || null,
                    incorporationDate: item?.company?.incorporation_date || null,
                    dissolutionDate: item?.company?.dissolution_date || null,
                    companyType: item?.company?.company_type || null,
                    currentStatus: item?.company?.current_status || null,
                    registeredAddress: item?.company?.registered_address_in_full || null,
                    registryUrl: item?.company?.registry_url || null,
                    opencorporatesUrl: item?.company?.opencorporates_url || null
                  }))
                },
                rawValue: result.data,
                normalizedValue: companies.length,
                note: 'OpenCorporates company records.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'apixies_headers',
      name: 'Apixies Security Headers',
      category: 'headers',
      enabled: CONFIG.ENABLE_APIXIES_HEADERS,
      async execute(ctx, cache) {
        const url = canonicalTargetURL(ctx.ip, ctx.version, 'https');
        const result = await fetchRequest(
          `https://apixies.io/api/v1/inspect-headers?url=${encodeURIComponent(url)}`,
          {
            provider: 'Apixies Security Headers',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const headers = data?.headers || {};

        return {
          raw: [result],
          records: [{
            category: 'headers',
            type: 'security_headers',
            source: 'Apixies Security Headers',
            sourceType: 'public-header-api',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: 'ANALYZED',
            value: {
              url,
              grade: data?.grade || null,
              score: data?.score ?? null,
              headers: {
                hsts: headers?.['strict-transport-security'] || null,
                csp: headers?.['content-security-policy'] || null,
                xFrameOptions: headers?.['x-frame-options'] || null,
                xContentTypeOptions: headers?.['x-content-type-options'] || null,
                referrerPolicy: headers?.['referrer-policy'] || null,
                permissionsPolicy: headers?.['permissions-policy'] || null,
                coop: headers?.['cross-origin-opener-policy'] || null,
                corp: headers?.['cross-origin-resource-policy'] || null,
                coep: headers?.['cross-origin-embedder-policy'] || null
              },
              missingHeaders: Array.isArray(data?.missing) ? data.missing.slice(0, CONFIG.MAX_HEADERS) : [],
              presentHeaders: Array.isArray(data?.present) ? data.present.slice(0, CONFIG.MAX_HEADERS) : [],
              rawHeaders: normalizeHeaders(headers)
            },
            rawValue: data,
            normalizedValue: data?.grade || null,
            note: 'HTTP security header analysis.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'klymax_headers',
      name: 'Klymax HTTP Headers Analyzer',
      category: 'headers',
      enabled: CONFIG.ENABLE_KLYMAX_HEADERS,
      async execute(ctx, cache) {
        const url = canonicalTargetURL(ctx.ip, ctx.version, 'https');
        const result = await fetchRequest(
          `https://http-headers.api.klymax402.com/api/analyze`,
          {
            provider: 'Klymax HTTP Headers Analyzer',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};

        return {
          raw: [result],
          records: [{
            category: 'headers',
            type: 'security_headers',
            source: 'Klymax HTTP Headers Analyzer',
            sourceType: 'public-header-api',
            observedAt: result.completedAt,
            confidence: 'HIGH',
            status: 'ANALYZED',
            value: {
              url,
              securityScore: data?.score ?? data?.securityScore ?? null,
              grade: data?.grade || null,
              headers: normalizeHeaders(data?.headers || {}),
              issues: Array.isArray(data?.issues) ? data.issues.slice(0, CONFIG.MAX_HEADERS) : [],
              recommendations: Array.isArray(data?.recommendations) ? data.recommendations.slice(0, CONFIG.MAX_HEADERS) : []
            },
            rawValue: data,
            normalizedValue: data?.score ?? null,
            note: 'HTTP security header analysis via Klymax.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'whoisfreaks_historical_dns',
      name: 'WhoisFreaks Historical DNS',
      category: 'historical',
      enabled: CONFIG.ENABLE_WHOISFREAKS_DNS,
      async execute(ctx, cache) {
        const domain = ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://api.whoisfreaks.com/v2.0/dns/historical?domain=${encodeURIComponent(domain)}&type=all&apiKey=free`,
          {
            provider: 'WhoisFreaks Historical DNS',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const recordsList = Array.isArray(data?.records)
          ? data.records.slice(0, CONFIG.MAX_RECORDS_PER_SECTION)
          : [];

        return {
          raw: [result],
          records: recordsList.length
            ? [{
                category: 'historical',
                type: 'historical_dns',
                source: 'WhoisFreaks Historical DNS',
                sourceType: 'public-historical-api',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'AVAILABLE',
                value: {
                  domain,
                  records: recordsList.map(record => ({
                    type: record?.type || null,
                    value: record?.value || null,
                    firstSeen: record?.firstSeen || null,
                    lastSeen: record?.lastSeen || null,
                    ttl: record?.ttl ?? null,
                    priority: record?.priority ?? null
                  }))
                },
                rawValue: data,
                normalizedValue: recordsList.length,
                note: 'Historical DNS records.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'robtex_historical_dns',
      name: 'Robtex Historical DNS',
      category: 'historical',
      enabled: CONFIG.ENABLE_ROBTEX,
      async execute(ctx, cache) {
        const domain = ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://freeapi.robtex.com/ipquery/${encodeURIComponent(domain)}`,
          {
            provider: 'Robtex Historical DNS',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};

        return {
          raw: [result],
          records: [{
            category: 'historical',
            type: 'historical_dns',
            source: 'Robtex Historical DNS',
            sourceType: 'public-historical-api',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: 'AVAILABLE',
            value: {
              domain,
              asn: data?.asn ?? null,
              asName: data?.asname || null,
              country: data?.country || null,
              routes: Array.isArray(data?.routes) ? data.routes.slice(0, 50) : [],
              history: Array.isArray(data?.history) ? data.history.slice(0, CONFIG.MAX_RECORDS_PER_SECTION) : []
            },
            rawValue: data,
            normalizedValue: data?.asn ?? null,
            note: 'Historical DNS and routing data from Robtex.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'certspotter',
      name: 'CertSpotter',
      category: 'certificate',
      enabled: CONFIG.ENABLE_CERTSPOTTER,
      async execute(ctx, cache) {
        const domain = ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`,
          {
            provider: 'CertSpotter',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const certs = Array.isArray(result.data)
          ? result.data.slice(0, CONFIG.MAX_CERTIFICATES)
          : [];

        return {
          raw: [result],
          records: certs.length
            ? [{
                category: 'certificate',
                type: 'ct_certspotter',
                source: 'CertSpotter',
                sourceType: 'certificate-transparency',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'OBSERVED',
                value: {
                  domain,
                  certificates: certs.map(cert => ({
                    id: cert?.id || null,
                    notBefore: cert?.not_before || null,
                    notAfter: cert?.not_after || null,
                    issuer: cert?.issuer?.name || null,
                    dnsNames: Array.isArray(cert?.dns_names) ? cert.dns_names.slice(0, 100) : [],
                    serialNumber: cert?.serial_number || null,
                    revoked: cert?.revoked ?? null
                  }))
                },
                rawValue: result.data,
                normalizedValue: certs.length,
                note: 'Certificate Transparency data from CertSpotter.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'issued_live',
      name: 'Issued.live',
      category: 'certificate',
      enabled: CONFIG.ENABLE_ISSUED_LIVE,
      async execute(ctx, cache) {
        const domain = ctx.domain || ctx.ip;
        const result = await fetchRequest(
          `https://api.issued.live/v1/certificates?domain=${encodeURIComponent(domain)}`,
          {
            provider: 'Issued.live',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const certs = Array.isArray(result.data?.certificates)
          ? result.data.certificates.slice(0, CONFIG.MAX_CERTIFICATES)
          : [];

        return {
          raw: [result],
          records: certs.length
            ? [{
                category: 'certificate',
                type: 'ct_issued_live',
                source: 'Issued.live',
                sourceType: 'certificate-transparency',
                observedAt: result.completedAt,
                confidence: 'MEDIUM',
                status: 'OBSERVED',
                value: {
                  domain,
                  certificates: certs.map(cert => ({
                    issuer: cert?.issuer || null,
                    subject: cert?.subject || null,
                    notBefore: cert?.notBefore || null,
                    notAfter: cert?.notAfter || null,
                    serialNumber: cert?.serialNumber || null,
                    dnsNames: Array.isArray(cert?.dnsNames) ? cert.dnsNames.slice(0, 100) : []
                  }))
                },
                rawValue: result.data,
                normalizedValue: certs.length,
                note: 'Certificate Transparency data from Issued.live.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'shodan_internetdb',
      name: 'Shodan InternetDB',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_SHODAN_INTERNETDB,
      async execute(ctx, cache) {
        if (ctx.version !== 4) return { raw: [], records: [] };

        const result = await fetchRequest(
          `https://internetdb.shodan.io/${encodeURIComponent(ctx.ip)}`,
          {
            provider: 'Shodan InternetDB',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};

        return {
          raw: [result],
          records: [{
            category: 'threat_intel',
            type: 'shodan_internetdb',
            source: 'Shodan InternetDB',
            sourceType: 'public-threat-intel',
            observedAt: result.completedAt,
            confidence: 'MEDIUM',
            status: 'OBSERVED',
            value: {
              ip: data?.ip || ctx.ip,
              hostnames: Array.isArray(data?.hostnames) ? data.hostnames.slice(0, 50) : [],
              ports: Array.isArray(data?.ports) ? data.ports.slice(0, 100) : [],
              vulns: Array.isArray(data?.vulns) ? data.vulns.slice(0, 100) : [],
              tags: Array.isArray(data?.tags) ? data.tags.slice(0, 50) : [],
              cpes: Array.isArray(data?.cpes) ? data.cpes.slice(0, 50) : []
            },
            rawValue: data,
            normalizedValue: data?.ports?.length || 0,
            note: 'Shodan InternetDB host intelligence.',
            requestId: result.requestId
          }]
        };
      }
    },

    {
      id: 'threatfox',
      name: 'ThreatFox',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_THREATFOX,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://threatfox-api.abuse.ch/api/v1/`,
          {
            provider: 'ThreatFox',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: 'search_ioc',
              search_term: ctx.ip
            })
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const iocs = Array.isArray(data?.data) ? data.data.slice(0, CONFIG.MAX_RECORDS_PER_SECTION) : [];

        return {
          raw: [result],
          records: iocs.length
            ? [{
                category: 'threat_intel',
                type: 'threatfox',
                source: 'ThreatFox',
                sourceType: 'public-threat-intel',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'FLAGGED',
                value: {
                  ip: ctx.ip,
                  iocs: iocs.map(ioc => ({
                    id: ioc?.id || null,
                    ioc: ioc?.ioc || null,
                    threatType: ioc?.threat_type || null,
                    malware: ioc?.malware || null,
                    malwareAlias: ioc?.malware_alias || null,
                    firstSeen: ioc?.first_seen || null,
                    lastSeen: ioc?.last_seen || null,
                    confidence: ioc?.confidence_level ?? null,
                    reporter: ioc?.reporter || null
                  }))
                },
                rawValue: data,
                normalizedValue: iocs.length,
                note: 'ThreatFox IOC matches.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'urlhaus',
      name: 'URLhaus',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_URLHAUS,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://urlhaus-api.abuse.ch/v1/host/`,
          {
            provider: 'URLhaus',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `host=${encodeURIComponent(ctx.ip)}`
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const data = result.data || {};
        const urls = Array.isArray(data?.urls) ? data.urls.slice(0, CONFIG.MAX_URLS) : [];

        return {
          raw: [result],
          records: urls.length
            ? [{
                category: 'threat_intel',
                type: 'urlhaus',
                source: 'URLhaus',
                sourceType: 'public-threat-intel',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'FLAGGED',
                value: {
                  host: ctx.ip,
                  urlCount: urls.length,
                  urls: urls.map(u => ({
                    id: u?.id || null,
                    url: u?.url || null,
                    urlStatus: u?.url_status || null,
                    threat: u?.threat || null,
                    tags: Array.isArray(u?.tags) ? u.tags : [],
                    dateAdded: u?.date_added || null,
                    reporter: u?.reporter || null
                  }))
                },
                rawValue: data,
                normalizedValue: urls.length,
                note: 'URLhaus malicious URL associations.',
                requestId: result.requestId
              }]
            : []
        };
      }
    },

    {
      id: 'feodo_tracker',
      name: 'Feodo Tracker',
      category: 'threat_intel',
      enabled: CONFIG.ENABLE_FEODO_TRACKER,
      async execute(ctx, cache) {
        const result = await fetchRequest(
          `https://feodotracker.abuse.ch/downloads/ipblocklist.json`,
          {
            provider: 'Feodo Tracker',
            responseType: 'json',
            profile: ctx.profile,
            timeout: ctx.profileConfig.timeout,
            cache
          }
        );

        if (!result.ok || !result.data) {
          return {
            raw: [result],
            records: []
          };
        }

        const list = Array.isArray(result.data) ? result.data : [];
        const matches = list.filter(item => item?.ip_address === ctx.ip).slice(0, 10);

        return {
          raw: [result],
          records: matches.length
            ? [{
                category: 'threat_intel',
                type: 'feodo_tracker',
                source: 'Feodo Tracker',
                sourceType: 'public-threat-intel',
                observedAt: result.completedAt,
                confidence: 'HIGH',
                status: 'FLAGGED',
                value: {
                  ip: ctx.ip,
                  matches: matches.map(m => ({
                    ipAddress: m?.ip_address || null,
                    port: m?.port ?? null,
                    status: m?.status || null,
                    hostname: m?.hostname || null,
                    asNumber: m?.as_number ?? null,
                    asName: m?.as_name || null,
                    country: m?.country || null,
                    firstSeen: m?.first_seen || null,
                    lastOnline: m?.last_online || null,
                    malware: m?.malware || null
                  }))
                },
                rawValue: matches,
                normalizedValue: matches.length,
                note: 'Feodo Tracker botnet C2 matches.',
                requestId: result.requestId
              }]
            : []
        };
      }
    }
  ];

  const buildProviderQueues = (profile, ctx) => {
    const enabled = PROVIDERS.filter(provider => provider.enabled !== false);

    if (profile === 'low') {
      const order = [
        'rdap',
        'ripestat_network',
        'dns_google_ptr',
        'dns_cloudflare',
        'geo_ipapi',
        'geo_ip_api_com',
        'bgpview',
        'hackertarget_reverse_ip',
        'otx',
        'greynoise',
        'proxycheck',
        'urlscan',
        'crtsh',
        'http_probe',
        'tls_probe',
        'xposedornot',
        'hibp_email',
        'hackmyip_breach',
        'hibp_passwords',
        'sec_edgar',
        'gleif_lei',
        'opencorporates',
        'apixies_headers',
        'klymax_headers',
        'whoisfreaks_historical_dns',
        'robtex_historical_dns',
        'certspotter',
        'issued_live',
        'shodan_internetdb',
        'threatfox',
        'urlhaus',
        'feodo_tracker',
        'geo_ipapi_is',
        'geo_myipscan'
      ];

      const index = new Map(order.map((value, position) => [value, position]));

      return enabled
        .slice()
        .sort((a, b) => (index.get(a.id) ?? 999) - (index.get(b.id) ?? 999));
    }

    return enabled.slice();
  };

  const runProviders = async (ctx, cache, store) => {
    const profile = ctx.profileConfig;
    const workers = new Semaphore(
      Math.max(
        profile.minConcurrent,
        Math.min(profile.concurrent, profile.maxConcurrent)
      )
    );

    const providers = buildProviderQueues(ctx.profile, ctx);
    const results = new Array(providers.length);

    let pointer = 0;

    const workerCount = Math.min(
      providers.length,
      ctx.profile === 'low'
        ? 8
        : 24
    );

    const worker = async () => {
      while (true) {
        const index = pointer++;

        if (index >= providers.length) return;

        const provider = providers[index];

        const result = await workers.run(() =>
          executeProvider(provider, ctx, store, cache)
        );

        results[index] = result;
      }
    };

    await Promise.all(
      Array.from(
        { length: workerCount },
        () => worker()
      )
    );

    return results.filter(Boolean);
  };

  const buildRegistration = records => {
    const rdapRecords = records.filter(r =>
      r.category === 'registration' &&
      r.type === 'rdap'
    );

    const preferred =
      rdapRecords.find(r => r.value?.name && r.value?.startAddress) ||
      rdapRecords[0];

    if (!preferred) return null;

    const value = preferred.value || {};

    const organization = Array.isArray(value.entities)
      ? value.entities.find(entity => entity?.name)?.name || null
      : null;

    return {
      registry: value.rir || preferred.source.replace(/^RDAP:/, ''),
      name: value.name || null,
      handle: value.handle || null,
      organization: organization || value.name || null,
      country: value.country || null,
      startAddress: value.startAddress || null,
      endAddress: value.endAddress || null,
      status: Array.isArray(value.status) ? value.status : [],
      source: preferred.source
    };
  };

  const buildNetwork = records => {
    const candidates = records.filter(r =>
      ['ripestat_network', 'prefix_overview', 'bgp', 'aslookup'].includes(r.type)
    );

    const geo = records.find(r =>
      r.category === 'geolocation' &&
      r.type === 'geo'
    );

    const prefixes = unique(
      candidates
        .map(r => r.value?.prefix)
        .filter(Boolean)
    );

    const asns = unique(
      candidates.flatMap(record => {
        if (Array.isArray(record.value?.asns)) {
          return record.value.asns.map(x =>
            typeof x === 'object' ? x?.asn : x
          );
        }

        return [record.value?.asn];
      })
      .filter(Boolean)
      .map(String)
    );

    const asNames = unique(
      candidates
        .flatMap(record => [
          record.value?.asName,
          record.value?.asnName
        ])
        .filter(Boolean)
    );

    const organizations = unique(
      [
        ...candidates.map(record => record.value?.organization),
        geo?.value?.organization,
        ...asNames
      ].filter(Boolean)
    );

    return {
      announced: Boolean(
        candidates.some(record =>
          record.value?.announced === true ||
          record.value?.prefix
        )
      ),
      asn: asns[0] || geo?.value?.asn || null,
      asns,
      prefix: prefixes[0] || null,
      prefixes,
      organization: organizations[0] || null,
      organizations,
      isp: geo?.value?.isp || null,
      country: geo?.value?.country || null,
      reverse: geo?.value?.reverse || null
    };
  };

  const buildRouting = records => {
    const lookups = records.filter(
      record => record.type === 'looking_glass'
    );

    const origins = unique(
      lookups
        .map(record => record.value?.origin)
        .filter(Boolean)
        .map(String)
    );

    const peers = unique(
      lookups
        .map(record => record.value?.peer)
        .filter(Boolean)
        .map(String)
    );

    const prefixes = unique(
      lookups
        .map(record => record.value?.prefix)
        .filter(Boolean)
    );

    return {
      state: origins.length || prefixes.length
        ? 'ROUTED'
        : 'UNKNOWN',
      prefix: prefixes[0] || null,
      origins,
      peerCount: peers.length,
      peers: peers.slice(0, CONFIG.MAX_PEERS),
      validation: origins.length ? 'OBSERVED' : 'UNKNOWN'
    };
  };

  const buildDNS = records => {
    const ptr = unique(
      records
        .filter(r => r.category === 'dns' && r.type === 'ptr')
        .map(r => normalizeDomain(r.normalizedValue || r.value?.value))
        .filter(Boolean)
    );

    return {
      ptr
    };
  };

  const buildCertificates = records => records
    .filter(r =>
      r.category === 'certificate' &&
      r.type === 'ct'
    )
    .map(r => r.value || {})
    .slice(0, CONFIG.MAX_CERTIFICATES);

  const buildDomains = (dns, certificates, records) => {
    const values = [
      ...dns.ptr,
      ...certificates.flatMap(c => Array.isArray(c.san) ? c.san : []),
      ...records
        .filter(r => r.type === 'reverse_ip')
        .flatMap(r => r.value?.domains || []),
      ...records
        .filter(r => r.type === 'urlscan')
        .flatMap(r => r.value?.domains || [])
    ];

    return unique(
      values
        .map(normalizeDomain)
        .filter(Boolean)
    ).slice(0, CONFIG.MAX_DOMAINS);
  };

  const buildURLs = records => unique(
    records
      .filter(r => r.type === 'urlscan')
      .flatMap(r => r.value?.urls || [])
      .map(v => normalizeURL(v))
      .filter(Boolean)
  ).slice(0, CONFIG.MAX_URLS);

  const buildGeo = async (records, workerPool) => {
    const sources = records
      .filter(r => r.category === 'geolocation')
      .map(r => r.value || {});

    const country = await workerPool.exec(
      'consensus',
      {
        values: sources.map(x => x.country)
      }
    );

    const region = await workerPool.exec(
      'consensus',
      {
        values: sources.map(x => x.region)
      }
    );

    const city = await workerPool.exec(
      'consensus',
      {
        values: sources.map(x => x.city)
      }
    );

    const coordinateValues = sources.filter(
      x =>
        x.latitude !== null &&
        x.latitude !== undefined &&
        x.longitude !== null &&
        x.longitude !== undefined
    );

    const latitude = coordinateValues.length
      ? coordinateValues.reduce((sum, value) => sum + Number(value.latitude), 0) / coordinateValues.length
      : null;

    const longitude = coordinateValues.length
      ? coordinateValues.reduce((sum, value) => sum + Number(value.longitude), 0) / coordinateValues.length
      : null;

    return {
      providers: sources,
      consensus: {
        country: country?.value || null,
        region: region?.value || null,
        city: city?.value || null,
        latitude,
        longitude,
        confidence: country?.confidence || 'NONE',
        conflict: Boolean(
          country?.conflict ||
          region?.conflict ||
          city?.conflict
        ),
        status: country?.value && !country?.conflict
          ? 'CONSENSUS'
          : country?.value
            ? 'PARTIAL_CONSENSUS'
            : 'UNKNOWN'
      }
    };
  };

  const buildThreat = records => records
    .filter(r => r.category === 'threat_intel')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildReputation = records => records
    .filter(r => r.category === 'reputation')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildServices = records => {
    const recordsList = records.filter(
      r => r.category === 'services' && r.type === 'http'
    );

    return {
      http: recordsList.some(r => r.value?.scheme === 'http')
        ? 'REACHABLE'
        : 'NOT_OBSERVED',
      https: recordsList.some(r => r.value?.scheme === 'https')
        ? 'REACHABLE'
        : 'NOT_OBSERVED',
      endpoints: recordsList.map(r => ({
        scheme: r.value?.scheme || null,
        port: r.value?.port || null,
        targetURL: r.value?.targetURL || null,
        finalURL: r.value?.finalURL || null,
        statusCode: r.value?.statusCode ?? null,
        title: r.value?.title || null,
        server: r.value?.server || null,
        technologies: r.value?.technologies || []
      }))
    };
  };

  const buildExposure = (records, domains, urls) => {
    const exposure = records.filter(
      r => r.category === 'exposure'
    );

    return {
      discoveredDomains: domains.length,
      discoveredURLs: urls.length,
      urlscan: exposure.map(r => ({
        source: r.source,
        count: r.value?.count || 0
      })),
      credentialExposure: 'NOT_QUERIED'
    };
  };

  const buildHistory = records => {
    const history = records.filter(
      r => r.category === 'history' &&
      r.type === 'bgplay'
    );

    const events = history.flatMap(r => r.value?.events || []);

    const sorted = events
      .filter(event => event?.timestamp)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.timestamp) -
          new Date(b.timestamp)
      );

    return {
      status: sorted.length ? 'AVAILABLE' : 'UNAVAILABLE',
      eventCount: sorted.length,
      firstSeen: sorted[0]?.timestamp || null,
      lastSeen: sorted.at(-1)?.timestamp || null,
      transitions: sorted
        .slice(0, 50)
        .map(event => ({
          timestamp: event.timestamp || null,
          origin: event.origin || null,
          prefix: event.prefix || null,
          type: event.type || null
        }))
    };
  };

  const buildBreaches = records => records
    .filter(r => r.category === 'breach')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildPasswords = records => records
    .filter(r => r.category === 'password')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildCompanyInfo = records => records
    .filter(r => r.category === 'company')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildHeaderAnalysis = records => records
    .filter(r => r.category === 'headers')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildHistorical = records => records
    .filter(r => r.category === 'historical')
    .map(r => ({
      source: r.source,
      status: r.status,
      confidence: r.confidence,
      value: r.value
    }));

  const buildDiagnostics = providers => {
    const output = {
      total: providers.length,
      success: 0,
      rateLimited: 0,
      unavailable: 0,
      empty: 0,
      disabled: 0
    };

    for (const provider of providers) {
      if (provider.health === 'SUCCESS') output.success++;
      else if (provider.health === 'RATE_LIMITED') output.rateLimited++;
      else if (provider.health === 'DISABLED') output.disabled++;
      else if (provider.health === 'NO_DATA') output.empty++;
      else output.unavailable++;
    }

    return output;
  };

  const buildFindings = (canonical, score) => {
    const findings = [];

    if (canonical.network.asn || canonical.network.prefix) {
      findings.push({
        name: 'Network identity',
        status: 'CONFIRMED'
      });
    }

    if (canonical.registration?.organization) {
      findings.push({
        name: 'Registration',
        status: 'CONFIRMED'
      });
    }

    if (canonical.dns.ptr.length) {
      findings.push({
        name: 'Reverse DNS',
        status: 'CONFIRMED'
      });
    }

    if (canonical.domains.length) {
      findings.push({
        name: 'Domain associations',
        status: 'OBSERVED'
      });
    }

    if (canonical.certificates.length) {
      findings.push({
        name: 'Certificate associations',
        status: 'OBSERVED'
      });
    }

    if (
      canonical.services.https === 'REACHABLE' ||
      canonical.services.http === 'REACHABLE'
    ) {
      findings.push({
        name: 'Public web service',
        status: 'CONFIRMED'
      });
    }

    if (
      canonical.threat.some(
        x => ['FLAGGED', 'NOISY'].includes(x.status)
      )
    ) {
      findings.push({
        name: 'Threat/reputation signal',
        status: 'FLAGGED'
      });
    }

    if (canonical.breaches.length) {
      findings.push({
        name: 'Email breach exposure',
        status: 'FLAGGED'
      });
    }

    if (canonical.passwords.some(p => p.status === 'PWNED')) {
      findings.push({
        name: 'Password breach exposure',
        status: 'FLAGGED'
      });
    }

    if (canonical.companyInfo.length) {
      findings.push({
        name: 'Company intelligence',
        status: 'OBSERVED'
      });
    }

    if (canonical.headerAnalysis.length) {
      findings.push({
        name: 'Security header analysis',
        status: 'ANALYZED'
      });
    }

    if (canonical.historical.length) {
      findings.push({
        name: 'Historical data',
        status: 'AVAILABLE'
      });
    }

    findings.push({
      name: 'Attribution to a person',
      status: 'NOT_ESTABLISHED'
    });

    findings.push({
      name: 'OSINT confidence score',
      status: String(score)
    });

    return findings;
  };

  const buildCrossValidation = canonical => {
    const checks = [];

    const registrationOrg = normalizeText(
      canonical.registration?.organization
    );

    const networkOrg = normalizeText(
      canonical.network.organization
    );

    checks.push({
      name: 'Registration ↔ Network',
      status:
        registrationOrg && networkOrg
          ? registrationOrg === networkOrg
            ? 'CONSISTENT'
            : 'CONFLICT'
          : 'UNKNOWN'
    });

    checks.push({
      name: 'Geolocation',
      status: canonical.geolocation.consensus.status
    });

    checks.push({
      name: 'Routing',
      status: canonical.routing.validation
    });

    const listed = canonical.reputation.filter(
      item => item.status === 'LISTED'
    ).length;

    checks.push({
      name: 'Reputation',
      status: listed ? 'FLAGGED' : 'NOT_FLAGGED'
    });

    if (canonical.breaches.length) {
      checks.push({
        name: 'Breach Exposure',
        status: 'FLAGGED'
      });
    }

    if (canonical.passwords.some(p => p.status === 'PWNED')) {
      checks.push({
        name: 'Password Exposure',
        status: 'FLAGGED'
      });
    }

    return checks;
  };

  const buildCanonical = async (
    ctx,
    store,
    providers,
    workerPool,
    proxyCount
  ) => {
    const records = store.successful();

    const registration = buildRegistration(records);
    const network = buildNetwork(records);
    const routing = buildRouting(records);
    const dns = buildDNS(records);
    const certificates = buildCertificates(records);
    const domains = buildDomains(
      dns,
      certificates,
      records
    );
    const urls = buildURLs(records);
    const geolocation = await buildGeo(records, workerPool);
    const threat = buildThreat(records);
    const reputation = buildReputation(records);
    const services = buildServices(records);
    const exposure = buildExposure(
      records,
      domains,
      urls
    );
    const history = buildHistory(records);
    const breaches = buildBreaches(records);
    const passwords = buildPasswords(records);
    const companyInfo = buildCompanyInfo(records);
    const headerAnalysis = buildHeaderAnalysis(records);
    const historical = buildHistorical(records);
    const diagnostics = buildDiagnostics(providers);

    const score = await workerPool.exec(
      'score',
      {
        value: {
          asn: network.asn,
          organization: network.organization,
          prefix: network.prefix,
          country: geolocation.consensus.country,
          reverse:
            dns.ptr[0] ||
            network.reverse,
          domainCount: domains.length,
          certificateCount: certificates.length,
          threatFlag: threat.some(
            item =>
              item.status === 'FLAGGED' ||
              item.status === 'NOISY'
          ),
          reputationFlag: reputation.some(
            item => item.status === 'LISTED'
          ),
          breachFlag: breaches.length > 0,
          passwordFlag: passwords.some(p => p.status === 'PWNED'),
          companyFlag: companyInfo.length > 0
        }
      }
    );

    const canonical = {
      target: {
        ip: ctx.ip,
        version: ctx.version,
        type: ctx.type,
        normalizedURL: canonicalTargetURL(
          ctx.ip,
          ctx.version,
          'https'
        ),
        httpURL: canonicalTargetURL(
          ctx.ip,
          ctx.version,
          'http'
        )
      },
      profile: {
        name: ctx.profile,
        label: ctx.profileConfig.label,
        concurrent: ctx.profileConfig.concurrent,
        timeout: ctx.profileConfig.timeout,
        probeTimeout: ctx.profileConfig.probeTimeout
      },
      proxy: {
        required: CONFIG.PROXY_REQUIRED,
        pool: proxyCount,
        status: proxyCount > 0 ? 'READY' : 'DEGRADED'
      },
      registration,
      network,
      routing,
      dns,
      certificates,
      domains,
      urls,
      geolocation,
      threat,
      reputation,
      services,
      exposure,
      history,
      breaches,
      passwords,
      companyInfo,
      headerAnalysis,
      historical,
      diagnostics,
      evidenceCount: records.length,
      sourceObservations: unique(
        records.map(r => r.source)
      ).length,
      confidenceScore: Number(score) || 0
    };

    canonical.crossValidation =
      buildCrossValidation(canonical);

    canonical.findings =
      buildFindings(
        canonical,
        canonical.confidenceScore
      );

    return canonical;
  };

  const fmtDate = value => {
    if (!value) return 'UNKNOWN';

    try {
      return new Date(value)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16);
    } catch {
      return 'UNKNOWN';
    }
  };

  const treeNode = (
    label,
    value = null,
    children = [],
    cls = 'output'
  ) => ({
    label,
    value,
    children,
    cls
  });

  const renderTree = (
    nodes,
    prefix = ''
  ) => {
    const output = [];

    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1;
      const branch = last ? '└── ' : '├── ';
      const next = prefix + (
        last
          ? '    '
          : '│   '
      );

      const text =
        node.value === null ||
        node.value === undefined ||
        node.value === ''
          ? node.label
          : `${node.label}: ${node.value}`;

      output.push(
        line(
          prefix + branch + text,
          node.cls || 'output'
        )
      );

      if (
        Array.isArray(node.children) &&
        node.children.length
      ) {
        output.push(
          ...renderTree(
            node.children,
            next
          )
        );
      }
    });

    return output;
  };

  const reportTree = (
    canonical,
    verbose = false
  ) => {
    const nodes = [
      treeNode(
        'Target',
        null,
        [
          treeNode(
            'IP',
            canonical.target.ip,
            [],
            'cyan-light'
          ),
          treeNode(
            'Version',
            canonical.target.version === 4
              ? 'IPv4'
              : 'IPv6',
            [],
            'cyan-light'
          ),
          treeNode(
            'Type',
            canonical.target.type,
            [],
            'cyan-light'
          ),
          treeNode(
            'Normalized URL',
            canonical.target.normalizedURL,
            [],
            'success'
          ),
          treeNode(
            'HTTP URL',
            canonical.target.httpURL
          )
        ]
      ),

      treeNode(
        'Profile',
        null,
        [
          treeNode(
            'Mode',
            canonical.profile.label
          ),
          treeNode(
            'Concurrency',
            canonical.profile.concurrent
          ),
          treeNode(
            'Timeout',
            `${canonical.profile.timeout}ms`
          ),
          treeNode(
            'Probe Timeout',
            `${canonical.profile.probeTimeout}ms`
          )
        ]
      ),

      treeNode(
        'Proxy',
        null,
        [
          treeNode(
            'Required',
            canonical.proxy.required
              ? 'YES'
              : 'NO'
          ),
          treeNode(
            'Pool',
            canonical.proxy.pool
          ),
          treeNode(
            'Status',
            canonical.proxy.status
          )
        ]
      ),

      treeNode(
        'Confidence',
        canonical.confidenceScore,
        [],
        canonical.confidenceScore >= 70
          ? 'success'
          : canonical.confidenceScore >= 40
            ? 'accent'
            : 'muted'
      ),

      treeNode(
        'Network Identity',
        null,
        [
          treeNode(
            'Announced',
            canonical.network.announced
              ? 'YES'
              : 'UNKNOWN'
          ),
          treeNode(
            'ASN',
            canonical.network.asn || 'UNKNOWN'
          ),
          treeNode(
            'Prefix',
            canonical.network.prefix || 'UNKNOWN'
          ),
          treeNode(
            'Organization',
            canonical.network.organization || 'UNKNOWN'
          ),
          treeNode(
            'ISP',
            canonical.network.isp || 'UNKNOWN'
          ),
          treeNode(
            'Reverse',
            canonical.network.reverse || 'UNKNOWN'
          ),
          treeNode(
            'Country',
            canonical.network.country || 'UNKNOWN'
          )
        ]
      ),

      treeNode(
        'Registration',
        null,
        [
          treeNode(
            'Registry',
            canonical.registration?.registry || 'UNKNOWN'
          ),
          treeNode(
            'Range',
            canonical.registration?.startAddress &&
            canonical.registration?.endAddress
              ? `${canonical.registration.startAddress} - ${canonical.registration.endAddress}`
              : 'UNKNOWN'
          ),
          treeNode(
            'Organization',
            canonical.registration?.organization || 'UNKNOWN'
          ),
          treeNode(
            'Country',
            canonical.registration?.country || 'UNKNOWN'
          )
        ]
      ),

      treeNode(
        'Routing',
        null,
        [
          treeNode(
            'State',
            canonical.routing.state
          ),
          treeNode(
            'Prefix',
            canonical.routing.prefix || 'UNKNOWN'
          ),
          treeNode(
            'Origins',
            canonical.routing.origins.join(', ') || 'UNKNOWN'
          ),
          treeNode(
            'Peers',
            canonical.routing.peerCount
          )
        ]
      ),

      treeNode(
        'DNS',
        null,
        [
          treeNode(
            'PTR',
            canonical.dns.ptr.join(', ') || 'None'
          ),
          treeNode(
            'Domains',
            canonical.domains.length
              ? canonical.domains.join(', ')
              : 'None'
          )
        ]
      ),

      treeNode(
        'Certificates',
        null,
        [
          treeNode(
            'CT Entries',
            canonical.certificates.length
          )
        ]
      ),

      treeNode(
        'Geolocation',
        null,
        [
          treeNode(
            'Country',
            canonical.geolocation.consensus.country || 'UNKNOWN'
          ),
          treeNode(
            'Region',
            canonical.geolocation.consensus.region || 'UNKNOWN'
          ),
          treeNode(
            'City',
            canonical.geolocation.consensus.city || 'UNKNOWN'
          ),
          treeNode(
            'Coordinates',
            canonical.geolocation.consensus.latitude !== null &&
            canonical.geolocation.consensus.longitude !== null
              ? `${canonical.geolocation.consensus.latitude}, ${canonical.geolocation.consensus.longitude}`
              : 'UNKNOWN'
          ),
          treeNode(
            'Confidence',
            canonical.geolocation.consensus.confidence
          ),
          treeNode(
            'Consensus',
            canonical.geolocation.consensus.status
          )
        ]
      ),

      treeNode(
        'Threat Intelligence',
        null,
        canonical.threat.map(item =>
          treeNode(
            item.source,
            item.status,
            [],
            item.status === 'FLAGGED' ||
            item.status === 'NOISY'
              ? 'danger'
              : 'output'
          )
        )
      ),

      treeNode(
        'Reputation',
        null,
        canonical.reputation.map(item =>
          treeNode(
            item.source,
            item.status,
            [],
            item.status === 'LISTED'
              ? 'danger'
              : 'output'
          )
        )
      ),

      treeNode(
        'Breach Exposure',
        null,
        canonical.breaches.length
          ? canonical.breaches.map(item =>
              treeNode(
                item.source,
                item.status,
                [],
                'danger'
              )
            )
          : [treeNode('Status', 'NO_BREACHES_FOUND')]
      ),

      treeNode(
        'Password Exposure',
        null,
        canonical.passwords.length
          ? canonical.passwords.map(item =>
              treeNode(
                item.source,
                item.status,
                [],
                item.status === 'PWNED'
                  ? 'danger'
                  : 'success'
              )
            )
          : [treeNode('Status', 'NOT_CHECKED')]
      ),

      treeNode(
        'Company Intelligence',
        null,
        canonical.companyInfo.length
          ? canonical.companyInfo.map(item =>
              treeNode(
                item.source,
                item.status
              )
            )
          : [treeNode('Status', 'NO_DATA')]
      ),

      treeNode(
        'Header Analysis',
        null,
        canonical.headerAnalysis.length
          ? canonical.headerAnalysis.map(item =>
              treeNode(
                item.source,
                item.status
              )
            )
          : [treeNode('Status', 'NOT_ANALYZED')]
      ),

      treeNode(
        'Historical Data',
        null,
        canonical.historical.length
          ? canonical.historical.map(item =>
              treeNode(
                item.source,
                item.status
              )
            )
          : [treeNode('Status', 'NO_HISTORICAL_DATA')]
      ),

      treeNode(
        'Public Web',
        null,
        [
          treeNode(
            'HTTP',
            canonical.services.http
          ),
          treeNode(
            'HTTPS',
            canonical.services.https
          ),
          treeNode(
            'Endpoints',
            canonical.services.endpoints.length
          )
        ]
      ),

      treeNode(
        'Web Technology',
        null,
        unique(
          canonical.services.endpoints.flatMap(
            endpoint => endpoint.technologies || []
          )
        ).map(technology =>
          treeNode(
            technology
          )
        )
      ),

      treeNode(
        'Passive Exposure',
        null,
        [
          treeNode(
            'Domains',
            canonical.exposure.discoveredDomains
          ),
          treeNode(
            'URLs',
            canonical.exposure.discoveredURLs
          ),
          treeNode(
            'Credential Retrieval',
            'DISABLED'
          )
        ]
      ),

      treeNode(
        'IP History',
        null,
        [
          treeNode(
            'Status',
            canonical.history.status
          ),
          treeNode(
            'Events',
            canonical.history.eventCount
          ),
          treeNode(
            'First Seen',
            fmtDate(canonical.history.firstSeen)
          ),
          treeNode(
            'Last Seen',
            fmtDate(canonical.history.lastSeen)
          )
        ]
      ),

      treeNode(
        'Cross Validation',
        null,
        canonical.crossValidation.map(check =>
          treeNode(
            check.name,
            check.status,
            [],
            check.status === 'CONFLICT' ||
            check.status === 'FLAGGED'
              ? 'danger'
              : 'output'
          )
        )
      ),

      treeNode(
        'Findings',
        null,
        canonical.findings.map(item =>
          treeNode(
            item.name,
            item.status,
            [],
            item.status === 'CONFIRMED' ||
            item.status === 'OBSERVED' ||
            item.status === 'ANALYZED' ||
            item.status === 'AVAILABLE'
              ? 'success'
              : item.status === 'FLAGGED'
                ? 'danger'
                : 'muted'
          )
        )
      )
    ];

    if (verbose) {
      nodes.push(
        treeNode(
          'Diagnostics',
          null,
          [
            treeNode(
              'Providers',
              canonical.diagnostics.total
            ),
            treeNode(
              'Successful',
              canonical.diagnostics.success
            ),
            treeNode(
              'Rate Limited',
              canonical.diagnostics.rateLimited
            ),
            treeNode(
              'Empty',
              canonical.diagnostics.empty
            ),
            treeNode(
              'Unavailable',
              canonical.diagnostics.unavailable
            )
          ]
        )
      );

      nodes.push(
        treeNode(
          'Provider Details',
          null,
          unique(
            PROVIDERS
              .filter(provider => provider.enabled !== false)
              .map(provider => provider.name)
          ).map(name =>
            treeNode(name)
          )
        )
      );

      nodes.push(
        treeNode(
          'Routing Peers',
          null,
          canonical.routing.peers
            .slice(0, CONFIG.MAX_PEERS)
            .map(peer => treeNode(peer))
        )
      );

      nodes.push(
        treeNode(
          'URL Associations',
          null,
          canonical.urls
            .slice(0, CONFIG.MAX_URLS)
            .map(url =>
              treeNode(
                'URL',
                url
              )
            )
        )
      );

      nodes.push(
        treeNode(
          'History Transitions',
          null,
          canonical.history.transitions.map(item =>
            treeNode(
              fmtDate(item.timestamp),
              null,
              [
                treeNode(
                  'Origin',
                  item.origin || 'UNKNOWN'
                ),
                treeNode(
                  'Prefix',
                  item.prefix || 'UNKNOWN'
                ),
                treeNode(
                  'Type',
                  item.type || 'UNKNOWN'
                )
              ]
            )
          )
        )
      );

      if (canonical.breaches.length) {
        nodes.push(
          treeNode(
            'Breach Details',
            null,
            canonical.breaches.map(breach =>
              treeNode(
                breach.source,
                breach.status,
                [],
                'danger'
              )
            )
          )
        );
      }

      if (canonical.companyInfo.length) {
        nodes.push(
          treeNode(
            'Company Details',
            null,
            canonical.companyInfo.map(company =>
              treeNode(
                company.source,
                company.status
              )
            )
          )
        );
      }

      if (canonical.headerAnalysis.length) {
        nodes.push(
          treeNode(
            'Header Details',
            null,
            canonical.headerAnalysis.map(header =>
              treeNode(
                header.source,
                header.status
              )
            )
          )
        );
      }

      if (canonical.historical.length) {
        nodes.push(
          treeNode(
            'Historical Details',
            null,
            canonical.historical.map(hist =>
              treeNode(
                hist.source,
                hist.status
              )
            )
          )
        );
      }
    }

    return nodes;
  };

  const renderReport = (
    canonical,
    verbose = false
  ) => [
    line(
      'IP OSINT',
      'accent'
    ),
    line(
      `Target: ${canonical.target.ip}`,
      'cyan-light'
    ),
    line(
      `Profile: ${canonical.profile.label}`,
      'purple'
    ),
    line(
      `URL: ${canonical.target.normalizedURL}`,
      'success'
    ),
    line(
      `Evidence: ${canonical.evidenceCount}`,
      'muted'
    ),
    line(
      `Providers: ${canonical.diagnostics.total}`,
      'muted'
    ),
    spacer(),
    ...renderTree(
      reportTree(
        canonical,
        verbose
      )
    )
  ];

  const help = () => [
    line(
      `Package: ${MANIFEST.name}`,
      'accent'
    ),
    line(
      `Version: ${MANIFEST.version}`
    ),
    line(
      'Default profile: HIGH-POWER',
      'success'
    ),
    spacer(),
    line(
      'ipscan <IPv4|IPv6>',
      'user'
    ),
    line(
      'ipscan scan <IPv4|IPv6>',
      'user'
    ),
    line(
      'ipscan lowscan <IPv4|IPv6>',
      'user'
    ),
    line(
      'lowscan <IPv4|IPv6>',
      'user'
    ),
    line(
      'ipscan providers',
      'user'
    ),
    line(
      'ipscan proxy',
      'user'
    ),
    line(
      'ipscan selftest',
      'user'
    ),
    line(
      'ipscan info',
      'user'
    ),
    line(
      'ipscan email <email>',
      'user'
    ),
    line(
      'ipscan password <password>',
      'user'
    ),
    line(
      'ipscan company <name>',
      'user'
    ),
    line(
      'ipscan headers <url>',
      'user'
    ),
    spacer(),
    line(
      'HIGH: 384 concurrency / 192 minimum / 768 maximum',
      'dim'
    ),
    line(
      'LOW: 48 concurrency / 24 minimum / 192 maximum',
      'dim'
    ),
    line(
      'Output hides provider failures unless --verbose is used.',
      'muted'
    ),
    line(
      'NEW: Breach, password, company, header & historical data support.',
      'success'
    )
  ];

  const providersInfo = () => [
    line(
      'IPScan Provider Registry',
      'accent'
    ),
    ...PROVIDERS.map(provider =>
      line(
        `[${provider.enabled === false ? 'OFF' : 'ON '}] ${provider.id} :: ${provider.name} :: ${provider.category}`,
        provider.enabled === false
          ? 'muted'
          : 'output'
      )
    ),
    line(
      `Total: ${PROVIDERS.filter(provider => provider.enabled !== false).length}`,
      'success'
    )
  ];

  const proxyInfo = () => [
    line(
      'Proxy',
      'accent'
    ),
    line(
      `Required: ${CONFIG.PROXY_REQUIRED ? 'YES' : 'NO'}`
    ),
    line(
      `Pool: ${state.workingProxies.length}`
    ),
    line(
      `Status: ${state.workingProxies.length ? 'READY' : 'DEGRADED'}`
    )
  ];

  const info = () => [
    line(
      'IPScan Information',
      'accent'
    ),
    line(
      `Name: ${MANIFEST.name}`
    ),
    line(
      `Version: ${MANIFEST.version}`
    ),
    line(
      `Mode: ${getMode()}`
    ),
    line(
      `Providers: ${PROVIDERS.filter(provider => provider.enabled !== false).length}`
    ),
    line(
      `Proxy Pool: ${state.workingProxies.length}`
    ),
    line(
      `Categories: ${unique(PROVIDERS.map(p => p.category)).join(', ')}`
    )
  ];

  const selftest = () => {
    const checks = [];
    let passed = true;

    const check = (
      name,
      condition
    ) => {
      if (!condition) passed = false;

      checks.push(
        line(
          `[${condition ? 'PASS' : 'FAIL'}] ${name}`,
          condition
            ? 'success'
            : 'danger'
        )
      );
    };

    check(
      'Package bridge',
      Boolean(state.api)
    );

    check(
      'Manifest',
      MANIFEST.name === PKG
    );

    check(
      'IPv4 validation',
      isValidIPv4('8.8.8.8')
    );

    check(
      'IPv6 validation',
      isValidIPv6('2001:4860:4860::8888')
    );

    check(
      'URL normalization',
      normalizeURL('https://example.com')
        === 'https://example.com/'
    );

    check(
      'IPv6 URL normalization',
      canonicalTargetURL(
        '2001:4860:4860::8888',
        6,
        'https'
      ) === 'https://[2001:4860:4860::8888]/'
    );

    check(
      'Provider registry',
      PROVIDERS.length > 0
    );

    check(
      'Worker availability',
      typeof Worker !== 'undefined'
    );

    const freeUserProxy = getFreeUserProxy();
    check(
      'Proxy integration',
      Boolean(
        freeUserProxy &&
        typeof freeUserProxy.getWorkingProxies === 'function' &&
        typeof freeUserProxy.rescan === 'function'
      )
    );

    check(
      'Breach providers',
      PROVIDERS.some(p => p.category === 'breach')
    );

    check(
      'Password providers',
      PROVIDERS.some(p => p.category === 'password')
    );

    check(
      'Company providers',
      PROVIDERS.some(p => p.category === 'company')
    );

    check(
      'Header providers',
      PROVIDERS.some(p => p.category === 'headers')
    );

    check(
      'Historical providers',
      PROVIDERS.some(p => p.category === 'historical')
    );

    checks.push(
      line(
        `Result: ${passed ? 'PASS' : 'DEGRADED'}`,
        passed
          ? 'success'
          : 'accent'
      )
    );

    return checks;
  };

  const parseArguments = rawArgs => {
    const values = Array.isArray(rawArgs)
      ? rawArgs
          .map(value => String(value ?? '').trim())
          .filter(Boolean)
      : [];

    const verbose =
      values.includes('--verbose') ||
      values.includes('--debug') ||
      values.includes('-v');

    return {
      values: values.filter(
        value =>
          !['--verbose', '--debug', '-v'].includes(value)
      ),
      verbose
    };
  };

  const runScan = async (
    target,
    profileName,
    verbose,
    extra = {}
  ) => {
    const profile =
      profileName === 'low'
        ? PROFILES.low
        : PROFILES.high;

    const normalized = normalizeTargetIP(target);

    await prepareProxyList(false);

    const cache = new CacheStore(
      profileName === 'low'
        ? CONFIG.CACHE_TTL_MS_LOW
        : CONFIG.CACHE_TTL_MS_HIGH,
      CONFIG.CACHE_MAX_ENTRIES
    );

    const workerPool = new WorkerPool(
      profileName === 'low'
        ? CONFIG.WORKER_COUNT_LOW
        : CONFIG.WORKER_COUNT_HIGH
    );

    workerPool.start();

    const ctx = Object.freeze({
      ip: normalized.ip,
      version: normalized.version,
      type: normalized.type,
      profile: profileName,
      profileConfig: profile,
      email: extra.email || null,
      password: extra.password || null,
      company: extra.company || null,
      domain: extra.domain || null
    });

    const store = new EvidenceStore();

    try {
      const providerResults = await runProviders(
        ctx,
        cache,
        store
      );

      const canonical = await buildCanonical(
        ctx,
        store,
        providerResults,
        workerPool,
        state.workingProxies.length
      );

      return {
        canonical,
        providers: providerResults
      };
    } finally {
      workerPool.destroy();
    }
  };

  const runEmailScan = async (email, verbose) => {
    const parts = email.split('@');
    const domain = parts.length === 2 ? parts[1] : email;

    return runScan(domain, 'high', verbose, { email, domain });
  };

  const runPasswordScan = async (password, verbose) => {
    return runScan('0.0.0.0', 'high', verbose, { password });
  };

  const runCompanyScan = async (company, verbose) => {
    return runScan('0.0.0.0', 'high', verbose, { company });
  };

  const runHeadersScan = async (url, verbose) => {
    const domain = normalizeDomain(url);
    return runScan(domain || url, 'high', verbose, { domain });
  };

  const runMainCommand = async ({
    args = []
  } = {}) => {
    const parsed = parseArguments(args);
    const values = parsed.values;
    const verbose = parsed.verbose;

    const first = String(
      values[0] || ''
    ).toLowerCase();

    if (
      !first ||
      ['help', '--help', '-h'].includes(first)
    ) {
      return help();
    }

    if (first === 'providers') {
      return providersInfo();
    }

    if (first === 'proxy') {
      return proxyInfo();
    }

    if (first === 'info') {
      return info();
    }

    if (first === 'selftest') {
      return selftest();
    }

    if (first === 'email') {
      const email = values[1];
      if (!email) {
        return [line('Usage: ipscan email <email>', 'danger')];
      }
      try {
        const result = await runEmailScan(email, verbose);
        return renderReport(result.canonical, verbose);
      } catch (error) {
        return [line(`ipscan email: ${error?.message || 'analysis failed'}`, 'danger')];
      }
    }

    if (first === 'password') {
      const password = values[1];
      if (!password) {
        return [line('Usage: ipscan password <password>', 'danger')];
      }
      try {
        const result = await runPasswordScan(password, verbose);
        return renderReport(result.canonical, verbose);
      } catch (error) {
        return [line(`ipscan password: ${error?.message || 'analysis failed'}`, 'danger')];
      }
    }

    if (first === 'company') {
      const company = values.slice(1).join(' ');
      if (!company) {
        return [line('Usage: ipscan company <name>', 'danger')];
      }
      try {
        const result = await runCompanyScan(company, verbose);
        return renderReport(result.canonical, verbose);
      } catch (error) {
        return [line(`ipscan company: ${error?.message || 'analysis failed'}`, 'danger')];
      }
    }

    if (first === 'headers') {
      const url = values[1];
      if (!url) {
        return [line('Usage: ipscan headers <url>', 'danger')];
      }
      try {
        const result = await runHeadersScan(url, verbose);
        return renderReport(result.canonical, verbose);
      } catch (error) {
        return [line(`ipscan headers: ${error?.message || 'analysis failed'}`, 'danger')];
      }
    }

    if (
      first === 'lowscan' ||
      first === 'low' ||
      first === 'lowipscan' ||
      first === 'ipscanlow'
    ) {
      const target = values[1];

      if (!target) {
        return [
          line(
            'Usage: ipscan lowscan <IPv4|IPv6>',
            'danger'
          )
        ];
      }

      try {
        const result = await runScan(
          target,
          'low',
          verbose
        );

        return renderReport(
          result.canonical,
          verbose
        );
      } catch (error) {
        return [
          line(
            `ipscan: ${error?.message || 'analysis failed'}`,
            'danger'
          )
        ];
      }
    }

    if (
      first === 'scan'
    ) {
      const target = values[1];

      if (!target) {
        return [
          line(
            'Usage: ipscan scan <IPv4|IPv6>',
            'danger'
          )
        ];
      }

      try {
        const result = await runScan(
          target,
          'high',
          verbose
        );

        return renderReport(
          result.canonical,
          verbose
        );
      } catch (error) {
        return [
          line(
            `ipscan: ${error?.message || 'analysis failed'}`,
            'danger'
          )
        ];
      }
    }

    const target = values[0];

    try {
      const result = await runScan(
        target,
        'high',
        verbose
      );

      return renderReport(
        result.canonical,
        verbose
      );
    } catch (error) {
      return [
        line(
          `ipscan: ${error?.message || 'analysis failed'}`,
          'danger'
        )
      ];
    }
  };

  const runLowCommand = async ({
    args = []
  } = {}) => {
    const parsed = parseArguments(args);
    const target = parsed.values[0];

    if (!target) {
      return [
        line(
          'Usage: lowscan <IPv4|IPv6>',
          'danger'
        )
      ];
    }

    try {
      const result = await runScan(
        target,
        'low',
        parsed.verbose
      );

      return renderReport(
        result.canonical,
        parsed.verbose
      );
    } catch (error) {
      return [
        line(
          `lowscan: ${error?.message || 'analysis failed'}`,
          'danger'
        )
      ];
    }
  };

  const runHelpCommand = () => help();

  const COMMAND_DEFINITIONS = Object.freeze({
    ipscan: Object.freeze({
      ...COMMANDS.ipscan,
      run: runMainCommand
    }),
    lowscan: Object.freeze({
      ...COMMANDS.lowscan,
      run: runLowCommand
    }),
    ipscanhelp: Object.freeze({
      ...COMMANDS.ipscanhelp,
      run: runHelpCommand
    })
  });

  const validateBridge = api => {
    if (!api || typeof api !== 'object') {
      throw new Error(
        'PACKAGE_BRIDGE_UNAVAILABLE'
      );
    }

    for (const method of [
      'registerCommand',
      'unregisterCommand',
      'line',
      'spacer'
    ]) {
      if (
        typeof api[method] !== 'function'
      ) {
        throw new Error(
          `PACKAGE_BRIDGE_${method.toUpperCase()}_UNAVAILABLE`
        );
      }
    }
  };

  const install = async api => {
    validateBridge(api);

    state.api = api;

    const snapshot = getSnapshot();

    const installedAlready =
      Array.isArray(snapshot?.installed) &&
      snapshot.installed.includes(PKG);

    const commandsAlready =
      Array.isArray(snapshot?.commands) &&
      COMMANDS.ipscan &&
      snapshot.commands.some(
        command =>
          COMMANDS.ipscan &&
          command === 'ipscan'
      );

    if (
      installedAlready &&
      commandsAlready
    ) {
      state.installed = true;
      return [];
    }

    try {
      for (
        const [name, definition]
        of Object.entries(
          COMMAND_DEFINITIONS
        )
      ) {
        if (
          !MANIFEST.commands.includes(name)
        ) {
          throw new Error(
            `COMMAND_NOT_DECLARED:${name}`
          );
        }

        const registered =
          api.registerCommand(
            name,
            definition
          );

        if (
          registered === false
        ) {
          throw new Error(
            `PACKAGE_COMMAND_REGISTRATION_FAILED:${name}`
          );
        }
      }

      state.installed = true;
      return [];
    } catch (error) {
      for (
        const name
        of MANIFEST.commands
      ) {
        try {
          api.unregisterCommand(name);
        } catch {}
      }

      state.installed = false;
      state.api = null;

      throw new Error(
        error?.message ||
        'PACKAGE_INSTALL_FAILED'
      );
    }
  };

  const uninstall = async api => {
    const bridge =
      api || state.api;

    if (
      bridge &&
      typeof bridge.unregisterCommand === 'function'
    ) {
      for (
        const name
        of MANIFEST.commands
      ) {
        try {
          bridge.unregisterCommand(name);
        } catch {}
      }
    }

    state.installed = false;
    state.api = null;
    state.workingProxies = [];
    state.proxyReady = false;
    state.proxyIndex = 0;

    return [];
  };

  globalThis[GLOBAL_KEY] = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall
  });
})();