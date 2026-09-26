(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'nmap',
    version: '1.0.0',
    description: 'Ultra-fast browser network scanner with HTTP probing, text-file discovery and CORS analysis',
    help: 'nmap help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'low',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'read',
      filesystem: 'none'
    }),
    commands: Object.freeze(['nmap']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  
  const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, maxFormsToTest: 200, mainTaskLimit: 384, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, maxFormsToTest: 80, mainTaskLimit: 48, label: 'LOW-POWER (mobile)' })
  });
  const DEFAULT_WORKERS = PROFILES.high.concurrent;
  const MAX_WORKERS = PROFILES.high.maxConcurrent;
  const MIN_WORKERS = 1;
  const LOW_WORKERS = PROFILES.low.concurrent;
  const DEFAULT_TIMEOUT = 1000;
  const LOW_TIMEOUT = 2500;
  const YIELD_EVERY = 24;
  const TOP_PORTS = Object.freeze([
    20,21,22,23,25,53,67,68,69,80,88,110,111,123,135,137,138,139,143,161,162,389,443,445,465,500,514,515,587,636,873,902,989,990,993,995,1080,1194,1433,1521,1723,1883,2049,2375,2376,3000,3128,3306,3389,4000,4443,5000,5001,5432,5433,5900,5985,5986,6379,6443,7001,7002,8000,8001,8002,8003,8008,8009,8080,8081,8082,8083,8084,8085,8086,8087,8088,8089,8090,8180,8280,8443,8444,8484,8585,8686,8787,8880,8888,8889,8999,9000,9001,9002,9003,9004,9005,9006,9007,9008,9009,9010,9090,9091,9092,9200,9300,9418,11211,27017
  ]);
  const TEXT_FILES = Object.freeze([
    'robots.txt','sitemap.xml','sitemap_index.xml','crossdomain.xml','clientaccesspolicy.xml',
    'ReadMe.txt','readme.txt','ReadMe.md','readme.md','README.txt','README.md',
    'LICENSE','LICENSE.txt','license.txt','LICENSE.md','license.md',
    'LICENCE','LICENCE.txt','LICENCE.md',
    'COPYING','COPYING.txt','NOTICE','NOTICE.txt','NOTICE.md',
    'SECURITY','SECURITY.txt','SECURITY.md','security.txt','security.md',
    'CHANGELOG','CHANGELOG.txt','CHANGELOG.md','Changelog.txt','Changelog.md',
    'CONTRIBUTING','CONTRIBUTING.txt','CONTRIBUTING.md',
    'AUTHORS','AUTHORS.txt','AUTHOR','AUTHOR.txt',
    'HISTORY','HISTORY.txt','HISTORY.md',
    'CREDITS','CREDITS.txt','humans.txt','ads.txt','.well-known/security.txt'
  ]);
  const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
  const clampWorkers = value => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return DEFAULT_WORKERS;
    return Math.max(MIN_WORKERS, Math.min(Math.floor(num), MAX_WORKERS));
  };
  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };
  const networkFetch = async (url, options = {}) => {
    const network = getNetworkApi();
    if (!network?.fetch) throw new Error('FreeUserProxy network API is not available.');
    return network.fetch(url, options);
  };
  const generateRandomPath = () => {
    const rand = Math.random().toString(36).slice(2, 12);
    return `nmap-probe-${rand}-${Date.now().toString(36)}`;
  };
  const normalizeUrl = target => {
    let value = String(target || '').trim();
    if (!value) throw new Error('EMPTY_TARGET');
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('UNSUPPORTED_PROTOCOL');
    }
    if (!url.pathname) url.pathname = '/';
    return url.href;
  };
  const fetchCorsText = async (url, timeout) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await networkFetch(url, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: '*/*' }
      });
      const text = await response.text();
      return {
        status: response.status,
        text,
        headers: {
          allowOrigin: response.headers.get('access-control-allow-origin') || '',
          allowCredentials: response.headers.get('access-control-allow-credentials') || '',
          server: response.headers.get('server') || '',
          poweredBy: response.headers.get('x-powered-by') || ''
        }
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const probeNoCors = async (url, timeout) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      await networkFetch(url, {
        method: 'GET',
        signal: controller.signal,
        credentials: 'omit',
        mode: 'no-cors',
        cache: 'no-store',
        redirect: 'follow'
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  const fetchVerifiedFile = async (url, timeout) => {
    const result = await fetchCorsText(url, timeout);
    if (!result) return null;
    if (result.status < 200 || result.status >= 300) return null;
    const text = result.text;
    if (!text || !text.trim()) return null;
    return text;
  };
  const isHtmlErrorPage = text => {
    const value = String(text || '').trim().slice(0, 1200).toLowerCase();
    if (!value) return true;
    if (value.startsWith('<!doctype html') || value.startsWith('<html') || value.includes('<html lang=')) return true;
    if (value.includes('<head>') && value.includes('<body>')) return true;
    return false;
  };
  const verifyFile = (file, text) => {
    const lower = file.toLowerCase();
    if (isHtmlErrorPage(text)) return false;
    if (lower === 'robots.txt') {
      return /(^|\n)\s*user-agent\s*:|(^|\n)\s*sitemap\s*:|(^|\n)\s*disallow\s*:/im.test(text);
    }
    if (lower === 'sitemap.xml' || lower === 'sitemap_index.xml') {
      return /<urlset\b|<sitemapindex\b|<url\b|<sitemap\b/i.test(text);
    }
    if (lower === '.well-known/security.txt' || lower === 'security.txt' || lower === 'security.md' || lower === 'security') {
      return /contact\s*:|expires\s*:|canonical\s*:|policy\s*:/i.test(text) || text.trim().length >= 20;
    }
    return text.trim().length >= 2;
  };
  const discoverTextFiles = async (baseUrl, options) => {
    const timeout = Math.max(1, Number(options.timeout) || DEFAULT_TIMEOUT);
    const results = [];
    for (let i = 0; i < TEXT_FILES.length; i++) {
      const file = TEXT_FILES[i];
      try {
        const url = new URL(file, baseUrl).href;
        const text = await fetchVerifiedFile(url, timeout);
        if (text && verifyFile(file, text)) results.push(url);
      } catch {
      }
      if (i % YIELD_EVERY === 0) await yieldToBrowser();
    }
    return [...new Set(results)];
  };
  const probePort = async (baseUrl, port, timeout) => {
    const u = new URL(baseUrl);
    const portBase = `${u.protocol}//${u.hostname}:${port}`;
    const probeUrl = `${portBase}/${generateRandomPath()}`;
    const corsResult = await fetchCorsText(probeUrl, timeout);
    if (corsResult) {
      return {
        port,
        reachable: true,
        status: corsResult.status,
        cors: corsResult.headers.allowOrigin
          ? (corsResult.headers.allowCredentials === 'true'
              ? `${corsResult.headers.allowOrigin} (credentials)`
              : corsResult.headers.allowOrigin)
          : null,
        server: corsResult.headers.server,
        poweredBy: corsResult.headers.poweredBy,
        readable: true
      };
    }
    const ok1 = await probeNoCors(probeUrl, timeout);
    if (!ok1) return { port, reachable: false };
    const ok2 = await probeNoCors(`${portBase}/${generateRandomPath()}`, timeout);
    if (!ok2) return { port, reachable: false, unstable: true };
    return { port, reachable: true, status: null, cors: null, readable: false };
  };
  const scanPorts = async (baseUrl, ports, options, live) => {
    const openMap = new Map();
    let closedCount = 0;
    let errorCount = 0;
    let nextIndex = 0;
    let completed = 0;
    let lastProgress = 0;
    const timeout = Math.max(1, Number(options.timeout) || DEFAULT_TIMEOUT);
    const concurrency = clampWorkers(options.concurrency);
    const emitProgress = force => {
      const progress = Math.floor((completed / ports.length) * 100);
      if (force || progress >= lastProgress + 5 || progress === 100) {
        lastProgress = progress;
        live(`  Progress: ${progress}% (${completed}/${ports.length})`, 'muted');
      }
    };
    const worker = async () => {
      let iter = 0;
      while (true) {
        const index = nextIndex++;
        if (index >= ports.length) return;
        const port = ports[index];
        try {
          const result = await probePort(baseUrl, port, timeout);
          if (result.reachable) {
            openMap.set(port, result);
          } else {
            closedCount++;
          }
        } catch {
          errorCount++;
        } finally {
          completed++;
          iter++;
          emitProgress(false);
          if (iter % YIELD_EVERY === 0) await yieldToBrowser();
        }
      }
    };
    const workerCount = Math.min(concurrency, ports.length);
    const workers = [];
    for (let i = 0; i < workerCount; i++) workers.push(worker());
    await Promise.all(workers);
    emitProgress(true);
    return {
      openPorts: [...openMap.values()],
      closedCount,
      errorCount
    };
  };
  const analyzePorts = async (baseUrl, ports, options) => {
    const timeout = Math.max(1, Number(options.timeout) || DEFAULT_TIMEOUT);
    const u = new URL(baseUrl);
    const results = [];
    const concurrency = Math.max(1, Math.min(ports.length, clampWorkers(options.concurrency), PROFILES[options.profile === 'low' ? 'low' : 'high'].mainTaskLimit));
    let nextIndex = 0;
    const worker = async () => {
      let iter = 0;
      while (true) {
        const index = nextIndex++;
        if (index >= ports.length) return;
        const item = ports[index];
        const port = item.port;
        const url = `${u.protocol}//${u.hostname}:${port}/`;
        try {
          const result = await fetchCorsText(url, timeout);
          if (result) {
            const corsText = result.headers.allowOrigin
              ? `CORS: ${result.headers.allowOrigin}${result.headers.allowCredentials === 'true' ? ' (credentials)' : ''}`
              : 'CORS: not set';
            results.push({
              port,
              status: `HTTP ${result.status}`,
              cors: corsText,
              server: result.headers.server,
              poweredBy: result.headers.poweredBy
            });
          } else {
            const reachable = await probeNoCors(url, timeout);
            results.push({
              port,
              status: reachable ? 'HTTP (opaque)' : 'unreachable',
              cors: 'CORS: blocked',
              server: '',
              poweredBy: ''
            });
          }
        } catch {
          results.push({
            port,
            status: 'error',
            cors: 'CORS: blocked',
            server: '',
            poweredBy: ''
          });
        } finally {
          iter++;
          if (iter % YIELD_EVERY === 0) await yieldToBrowser();
        }
      }
    };
    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    return results.sort((a, b) => a.port - b.port);
  };
  let PORT_DB_CACHE = null;
  const loadPorts = async () => {
    if (PORT_DB_CACHE !== null) return PORT_DB_CACHE;
    PORT_DB_CACHE = {};
    return PORT_DB_CACHE;
  };
  const getServiceName = (port, db) => {
    if (db && Object.prototype.hasOwnProperty.call(db, port)) {
      const value = db[port];
      if (value !== null && value !== undefined && String(value).trim()) return String(value);
    }
    const fallback = {
      20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns',
      67: 'dhcp', 68: 'dhcp-client', 80: 'http', 110: 'pop3', 111: 'rpcbind', 123: 'ntp',
      135: 'msrpc', 137: 'netbios-ns', 138: 'netbios-dgm', 139: 'netbios-ssn', 143: 'imap',
      161: 'snmp', 389: 'ldap', 443: 'https', 445: 'smb', 465: 'smtps', 587: 'submission',
      636: 'ldaps', 873: 'rsync', 989: 'ftps-data', 990: 'ftps', 993: 'imaps', 995: 'pop3s',
      1433: 'mssql', 1521: 'oracle', 1723: 'pptp', 1883: 'mqtt', 2049: 'nfs',
      2375: 'docker', 2376: 'docker-tls', 3000: 'http-alt', 3306: 'mysql', 3389: 'rdp',
      5432: 'postgresql', 5433: 'postgresql-alt', 5900: 'vnc', 6379: 'redis',
      6443: 'kubernetes', 7001: 'weblogic', 8000: 'http-alt', 8008: 'http-alt',
      8080: 'http-proxy', 8081: 'http-alt', 8443: 'https-alt', 8888: 'http-alt',
      9000: 'http-alt', 9090: 'prometheus', 9200: 'elasticsearch',
      9300: 'elasticsearch-node', 11211: 'memcached', 27017: 'mongodb'
    };
    return fallback[port] || 'unknown';
  };
  const parseScanArgs = (args, defaults) => {
    const options = {
      target: '',
      ports: null,
      topPorts: null,
      excludePorts: [],
      openOnly: false,
      concurrency: defaults.concurrency,
      timeout: defaults.timeout,
      version: false,
      help: false
    };
    if (!args || args.length === 0) {
      options.help = true;
      return options;
    }
    options.target = String(args[0] || '').trim();
    for (let i = 1; i < args.length; i++) {
      const arg = String(args[i] || '');
      if (arg === '--help' || arg === '-h') {
        options.help = true;
      } else if ((arg === '-p' || arg === '--ports') && i + 1 < args.length) {
        const value = String(args[++i] || '').trim();
        if (value.includes('-')) {
          const parts = value.split('-');
          const start = Number(parts[0]);
          const end = Number(parts[1]);
          if (Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start) {
            const list = [];
            for (let port = start; port <= end && port <= 65535; port++) list.push(port);
            options.ports = list;
          }
        } else {
          options.ports = [...new Set(
            value.split(',').map(Number).filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
          )];
        }
      } else if (arg === '--top-ports' && i + 1 < args.length) {
        const value = parseInt(args[++i], 10);
        if (Number.isInteger(value) && value > 0) options.topPorts = value;
      } else if (arg === '--exclude-ports' && i + 1 < args.length) {
        options.excludePorts = [...new Set(
          String(args[++i] || '')
            .split(',')
            .map(Number)
            .filter(port => Number.isInteger(port) && port >= 1 && port <= 65535)
        )];
      } else if (arg === '--open') {
        options.openOnly = true;
      } else if ((arg === '-w' || arg === '--workers' || arg === '--concurrency') && i + 1 < args.length) {
        const value = parseInt(args[++i], 10);
        if (Number.isInteger(value) && value > 0) options.concurrency = clampWorkers(value);
      } else if (arg === '--timeout' && i + 1 < args.length) {
        const value = parseInt(args[++i], 10);
        if (Number.isInteger(value) && value > 0) options.timeout = value;
      } else if (arg === '--version' || arg === '-V') {
        options.version = true;
      }
    }
    return options;
  };
  const extractLowMode = args => {
    const filtered = [];
    let isLow = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i] || '');
      if (a === 'lowscan' || a === '--low' || a === '-L') {
        isLow = true;
      } else {
        filtered.push(a);
      }
    }
    return { isLow, args: filtered };
  };
  const runScanner = async (args, isLow, api) => {
    const defaults = isLow
      ? { concurrency: LOW_WORKERS, timeout: LOW_TIMEOUT }
      : { concurrency: DEFAULT_WORKERS, timeout: DEFAULT_TIMEOUT };
    const options = parseScanArgs(args, defaults);
    if (options.help) return { kind: 'help', isLow };
    if (options.version) {
      return { kind: 'version', text: `nmap version ${MANIFEST.version}` };
    }
    let baseUrl;
    try {
      baseUrl = normalizeUrl(options.target);
    } catch {
      return { kind: 'error', text: 'Invalid target URL.' };
    }
    const live = (text, tone = 'muted') => api.append([api.line(text, tone)]);
    const spacer = () => api.append([api.spacer()]);
    const startedAt = Date.now();
    let selectedPorts;
    if (options.ports !== null) {
      selectedPorts = [...options.ports];
    } else if (options.topPorts !== null) {
      selectedPorts = TOP_PORTS.slice(0, Math.min(options.topPorts, TOP_PORTS.length));
    } else {
      selectedPorts = Array.from({ length: 65535 }, (_, index) => index + 1);
    }
    if (options.excludePorts.length > 0) {
      const excluded = new Set(options.excludePorts);
      selectedPorts = selectedPorts.filter(port => !excluded.has(port));
    }
    if (selectedPorts.length === 0) {
      return { kind: 'warning', text: 'No ports selected for scanning.' };
    }
    const totalPorts = selectedPorts.length;
    const baseUrlObj = new URL(baseUrl);
    const origin = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
    const modeLabel = isLow ? 'LOWSCAN' : 'NMAP';
    live(`[${modeLabel}] Target: ${origin}`, 'accent');
    live(`  Ports: ${totalPorts} | Workers: ${options.concurrency} | Timeout: ${options.timeout}ms`, 'muted');
    spacer();
    const serviceDbPromise = loadPorts();
    await yieldToBrowser();
    live(`[Phase 1/3] Text / documentation discovery (${TEXT_FILES.length} candidates)`, 'accent');
    const phase1Start = Date.now();
    const discoveredFiles = await discoverTextFiles(baseUrl, options);
    const phase1Time = ((Date.now() - phase1Start) / 1000).toFixed(2);
    if (discoveredFiles.length === 0) {
      live(`  No verified files found. (${phase1Time}s)`, 'muted');
    } else {
      live(`  ${discoveredFiles.length} verified file(s) in ${phase1Time}s:`, 'success');
      for (const file of discoveredFiles) live(`    ${file}`, 'success');
    }
    spacer();
    await yieldToBrowser();
    live(`[Phase 2/3] Port scan (${totalPorts} ports, ${options.concurrency} workers)`, 'accent');
    const phase2Start = Date.now();
    const scanResults = await scanPorts(baseUrl, selectedPorts, options, live);
    const serviceDb = await serviceDbPromise;
    const openPorts = scanResults.openPorts.sort((a, b) => a.port - b.port);
    const phase2Time = ((Date.now() - phase2Start) / 1000).toFixed(2);
    if (openPorts.length === 0) {
      live(`  No responsive ports detected. (${phase2Time}s)`, 'warning');
    } else {
      live(`  ${openPorts.length} open port(s) in ${phase2Time}s:`, 'success');
      for (const item of openPorts) {
        const service = getServiceName(item.port, serviceDb);
        live(`    ${item.port}/tcp  open  ${service}`, 'success');
      }
    }
    spacer();
    await yieldToBrowser();
    if (openPorts.length > 0) {
      live(`[Phase 3/3] HTTP & CORS analysis on ${openPorts.length} open port(s)`, 'accent');
      const phase3Start = Date.now();
      const analysis = await analyzePorts(baseUrl, openPorts, options);
      const phase3Time = ((Date.now() - phase3Start) / 1000).toFixed(2);
      for (const result of analysis) {
        const extras = [];
        if (result.server) extras.push(`Server: ${result.server}`);
        if (result.poweredBy) extras.push(`X-Powered-By: ${result.poweredBy}`);
        const tail = extras.length ? ` | ${extras.join(' | ')}` : '';
        live(`  ${result.port}/tcp  ${result.status}  ${result.cors}${tail}`, 'muted');
      }
      live(`  Analysis complete (${phase3Time}s)`, 'muted');
      spacer();
    }
    const totalTime = ((Date.now() - startedAt) / 1000).toFixed(2);
    live('[Summary]', 'accent');
    live(`  Target: ${origin}`, 'muted');
    live(`  Mode: ${isLow ? 'lowscan' : 'full'}`, 'muted');
    live(`  Ports scanned: ${totalPorts}`, 'muted');
    live(`  Open ports: ${openPorts.length}`, openPorts.length > 0 ? 'success' : 'muted');
    live(`  Verified files: ${discoveredFiles.length}`, discoveredFiles.length > 0 ? 'success' : 'muted');
    live(`  Total time: ${totalTime}s`, 'muted');
    return { kind: 'done' };
  };
  const renderHelp = (api, isLow) => [
    api.line(isLow ? 'Nmap - LowScan Mode' : 'Nmap - Network Scanner (Browser Edition)', 'accent'),
    api.spacer(),
    api.line('Usage:', 'accent'),
    api.line('  nmap <target> [options]              full 1-65535 port scan', 'muted'),
    api.line('  nmap lowscan <target> [options]      low-pressure scan (mobile / weak devices)', 'muted'),
    api.spacer(),
    api.line('Options:', 'accent'),
    api.line('  -p, --ports <range>       Scan specific ports (e.g. 80,443,8080 or 1-1000)', 'muted'),
    api.line('  --top-ports <number>      Scan top common ports', 'muted'),
    api.line('  --exclude-ports <ports>   Exclude specific ports', 'muted'),
    api.line('  --open                    Show only open ports', 'muted'),
    api.line('  -w, --workers <number>    Worker pool size (1-' + MAX_WORKERS + ', default ' + (isLow ? LOW_WORKERS : DEFAULT_WORKERS) + ')', 'muted'),
    api.line('  --timeout <ms>            Request timeout (default ' + (isLow ? LOW_TIMEOUT : DEFAULT_TIMEOUT) + 'ms)', 'muted'),
    api.line('  --version                 Show version information', 'muted'),
    api.line('  --help                    Show this help message', 'muted'),
    api.spacer(),
    api.line('Notes:', 'accent'),
    api.line('  - Default mode scans all 65535 TCP ports unless -p or --top-ports is used.', 'muted'),
    api.line('  - lowscan uses a small worker pool + longer timeout, tuned for mobile/low-end devices.', 'muted'),
    api.line('  - The scan yields to the browser between batches; the page stays responsive.', 'muted'),
    api.spacer(),
    api.line('Examples:', 'accent'),
    api.line('  nmap example.com', 'muted'),
    api.line('  nmap example.com --top-ports 100', 'muted'),
    api.line('  nmap example.com -p 80,443 --open', 'muted'),
    api.line('  nmap example.com -p 1-1000 -w 200 --timeout 1000', 'muted'),
    api.line('  nmap lowscan example.com', 'muted'),
    api.line('  nmap lowscan example.com --top-ports 50 -w 32', 'muted')
  ];
  const COMMANDS = Object.freeze({
    nmap: {
      description: 'Ultra-fast browser network scanner (use "nmap lowscan <target>" for mobile-friendly low-pressure mode)',
      usage: 'nmap [lowscan] <target> [options]',
      aliases: ['scan', 'portscan'],
      kind: 'plain',
      run: async ({ args = [], api } = {}) => {
        const extracted = extractLowMode(args);
        if (extracted.args.length === 0) {
          return renderHelp(api, extracted.isLow);
        }
        const probe = parseScanArgs(
          extracted.args,
          extracted.isLow
            ? { concurrency: LOW_WORKERS, timeout: LOW_TIMEOUT }
            : { concurrency: DEFAULT_WORKERS, timeout: DEFAULT_TIMEOUT }
        );
        if (probe.help) return renderHelp(api, extracted.isLow);
        const result = await runScanner(extracted.args, extracted.isLow, api);
        if (result.kind === 'help') return renderHelp(api, result.isLow);
        if (result.kind === 'version') return [api.line(result.text, 'accent')];
        if (result.kind === 'error') return [api.line(result.text, 'danger')];
        if (result.kind === 'warning') return [api.line(result.text, 'warning')];
        return [];
      }
    }
  });
  const install = async api => {
    for (const [name, definition] of Object.entries(COMMANDS)) {
      if (!MANIFEST.commands.includes(name)) {
        throw new Error(`COMMAND_NOT_DECLARED:${name}`);
      }
      const registered = api.registerCommand(name, definition);
      if (registered === false) {
        throw new Error(`PACKAGE_COMMAND_REGISTRATION_FAILED:${name}`);
      }
    }
    return [];
  };
  const uninstall = async api => {
    for (const name of MANIFEST.commands) {
      api.unregisterCommand(name);
    }
    return [];
  };
  window.__munitos_pkg_nmap = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall
  });
})();