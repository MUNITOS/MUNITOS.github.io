(() => {
  'use strict';
  const VERSION='1.0';
  const MAX_SOURCE_LENGTH = 750000;
  const MAX_FINDINGS = 48;
  const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      if (value[key] && typeof value[key] === 'object' && !Object.isFrozen(value[key])) freeze(value[key]);
    }
    return value;
  };
  const text = value => String(value ?? '');
  const lower = value => text(value).trim().toLowerCase();
  const extractLiteral = (source, key) => {
    const safe = text(source);
    const escaped = text(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`\\b${escaped}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`, 'm'),
      new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(['"\`])([\\s\\S]*?)\\1`, 'm')
    ];
    for (const pattern of patterns) {
      const match = safe.match(pattern);
      if (match) return text(match[2]);
    }
    return '';
  };
  const extractArray = source => {
    const out = [];
    const re = /['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = re.exec(text(source))) !== null) out.push(match[1]);
    return out;
  };
  const extractManifest = source => {
    const safe = text(source);
    const manifestMatch = safe.match(/\b(?:const|let|var)\s+(?:MANIFEST|manifest)\s*=\s*(?:Object\.freeze\s*\(\s*)?\{([\s\S]*?)\}\s*\)?\s*;/m);
    const block = manifestMatch?.[1] || safe;
    const permissionsMatch = block.match(/\bpermissions\s*:\s*(?:Object\.freeze\s*\(\s*)?\{([\s\S]*?)\}\s*\)?/m);
    const commandsMatch = block.match(/\bcommands\s*:\s*(?:Object\.freeze\s*\(\s*)?\[([\s\S]*?)\]\s*\)?/m);
    const permissions = permissionsMatch?.[1] || '';
    return {
      name: extractLiteral(block, 'name'),
      version: extractLiteral(block, 'version'),
      description: extractLiteral(block, 'description'),
      author: extractLiteral(block, 'author'),
      help: extractLiteral(block, 'help'),
      entry: extractLiteral(block, 'entry'),
      securityLevel: lower(extractLiteral(block, 'securityLevel')) || 'medium',
      storage: lower(extractLiteral(permissions, 'storage')) || 'none',
      cookies: lower(extractLiteral(permissions, 'cookies')) || 'none',
      network: lower(extractLiteral(permissions, 'network')) || 'none',
      filesystem: lower(extractLiteral(permissions, 'filesystem')) || 'none',
      commands: extractArray(commandsMatch?.[1] || ''),
      dependencies: (() => {
        const m = block.match(/\bdependencies\s*:\s*(?:Object\.freeze\s*\(\s*)?\[([\s\S]*?)\]\s*\)?/m);
        return extractArray(m?.[1] || '');
      })()
    };
  };
  const addFinding = (findings, severity, code, message, weight) => {
    if (findings.length >= MAX_FINDINGS) return;
    findings.push({ severity, code, message, weight });
  };
  const scan = async ({ packageName = '', source = '', manifest = null, resolved = '' } = {}) => {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const raw = text(source);
    const packageId = text(packageName).trim() || 'external-package';
    const supplied = manifest && typeof manifest === 'object' ? manifest : {};
    const parsed = extractManifest(raw);
    const meta = {
      name: text(supplied.name || parsed.name).trim(),
      version: text(supplied.version || parsed.version).trim(),
      help: text(supplied.help || parsed.help).trim(),
      entry: text(supplied.entry || parsed.entry).trim(),
      storage: lower(supplied.permissions?.storage || parsed.storage) || 'none',
      cookies: lower(supplied.permissions?.cookies || parsed.cookies) || 'none',
      network: lower(supplied.permissions?.network || parsed.network) || 'none',
      filesystem: lower(supplied.permissions?.filesystem || parsed.filesystem) || 'none',
      commands: Array.isArray(supplied.commands) ? supplied.commands.map(text) : parsed.commands
    };
    const findings = [];
    if (!raw.trim()) addFinding(findings, 'high', 'SOURCE_EMPTY', 'Package source is empty.', 45);
    if (/^\s*(?:<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(raw)) {
      addFinding(findings, 'high', 'HTML_SOURCE', 'Package source appears to be HTML instead of JavaScript.', 40);
    }
    if (raw.length > MAX_SOURCE_LENGTH) {
      addFinding(findings, 'medium', 'SOURCE_SIZE', 'Package source exceeds the antivirus static inspection size threshold.', 12);
    }
    if (!meta.name) addFinding(findings, 'high', 'MANIFEST_NAME', 'Package manifest name is missing.', 24);
    if (meta.name && meta.name !== packageId) {
      addFinding(findings, 'high', 'MANIFEST_IDENTITY', `Manifest name "${meta.name}" does not match package identity "${packageId}".`, 28);
    }
    if (!meta.version) addFinding(findings, 'medium', 'MANIFEST_VERSION', 'Package manifest version is missing.', 10);
    if (!meta.help) addFinding(findings, 'medium', 'MANIFEST_HELP', 'Package manifest help field is missing.', 8);
    if (meta.entry && meta.entry !== 'install') addFinding(findings, 'medium', 'MANIFEST_ENTRY', 'Package manifest entry should be install.', 8);
    if (!Array.isArray(meta.commands) || !meta.commands.includes(packageId)) {
      addFinding(findings, 'medium', 'MANIFEST_COMMAND', 'Package command metadata does not expose the requested package identity.', 8);
    }
    const hardPatterns = [
      [/\beval\s*\(/i, 'DYNAMIC_EVAL', 'eval() usage detected.', 24],
      [/\bnew\s+Function\s*\(/i, 'DYNAMIC_FUNCTION', 'Dynamic Function construction detected.', 24],
      [/\bFunction\s*\(/i, 'FUNCTION_CONSTRUCTOR', 'Function constructor usage detected.', 20],
      [/\bimport\s*\(/i, 'DYNAMIC_IMPORT', 'Dynamic import() usage detected.', 15],
      [/\bimportScripts\s*\(/i, 'IMPORT_SCRIPTS', 'importScripts() usage detected.', 15],
      [/\bdocument\.write\s*\(/i, 'DOCUMENT_WRITE', 'document.write() usage detected.', 12],
      [/\bexecScript\s*\(/i, 'EXEC_SCRIPT', 'execScript() usage detected.', 28],
      [/\bnavigator\.serviceWorker\b/i, 'SERVICE_WORKER', 'Service worker access detected.', 18],
      [/\bnew\s+WebAssembly\./i, 'WEBASSEMBLY_RUNTIME', 'Direct WebAssembly runtime construction detected.', 14]
    ];
    for (const [re, code, message, weight] of hardPatterns) if (re.test(raw)) addFinding(findings, 'high', code, message, weight);
    const directPatterns = [
      [/\bfetch\s*\(/i, 'DIRECT_FETCH', 'Direct fetch() usage detected.', 'network', 9],
      [/\bXMLHttpRequest\b/i, 'XHR', 'Direct XMLHttpRequest usage detected.', 'network', 11],
      [/\bWebSocket\s*\(/i, 'WEBSOCKET', 'Direct WebSocket usage detected.', 'network', 12],
      [/\bnavigator\.sendBeacon\s*\(/i, 'BEACON', 'Navigator beacon network access detected.', 'network', 10],
      [/\bdocument\.cookie\b/i, 'DIRECT_COOKIE', 'Direct document.cookie access detected.', 'cookies', 12],
      [/\blocalStorage\b/i, 'DIRECT_STORAGE', 'Direct localStorage access detected.', 'storage', 10],
      [/\bsessionStorage\b/i, 'DIRECT_SESSION_STORAGE', 'Direct sessionStorage access detected.', 'storage', 10]
    ];
    for (const [re, code, message, permission, weight] of directPatterns) {
      if (!re.test(raw)) continue;
      const granted = meta[permission] !== 'none';
      addFinding(findings, granted ? 'medium' : 'high', code, granted ? `${message} The package declares the corresponding permission.` : message, granted ? Math.max(4, weight - 3) : weight + 7);
    }
    if (/\bindexedDB\b/i.test(raw)) addFinding(findings, 'high', 'INDEXED_DB', 'Direct IndexedDB access detected.', 18);
    if (/\bcaches\.(?:open|match|delete)\s*\(/i.test(raw)) addFinding(findings, 'high', 'CACHE_API', 'Direct Cache API access detected.', 17);
    if (/\bBroadcastChannel\s*\(/i.test(raw)) addFinding(findings, 'medium', 'BROADCAST_CHANNEL', 'BroadcastChannel construction detected.', 8);
    if (/\bSharedWorker\s*\(/i.test(raw)) addFinding(findings, 'medium', 'SHARED_WORKER', 'SharedWorker construction detected.', 8);
    if (/\bnew\s+Worker\s*\(/i.test(raw) || /\bWorker\s*\(/i.test(raw)) addFinding(findings, 'medium', 'WEB_WORKER', 'Web Worker construction detected.', 8);
    const encodedLiteral = /(?:\\x[0-9a-f]{2}|\\u[0-9a-f]{4}){8,}/i.test(raw) || /[A-Za-z0-9+/]{180,}={0,2}/.test(raw);
    const decoderUsage = /\b(?:atob|btoa)\s*\(/i.test(raw);
    if (encodedLiteral && decoderUsage) addFinding(findings, 'medium', 'OBFUSCATION', 'Possible encoded or obfuscated runtime payload detected.', 16);
    if (/\b(?:document|window|globalThis)\.[A-Za-z_$][\w$]*\s*=/i.test(raw)) {
      addFinding(findings, 'high', 'DIRECT_GLOBAL_MUTATION', 'Direct browser-global mutation detected.', 18);
    }
    if (/\b(?:document|window|globalThis)\[['"`]/i.test(raw)) {
      addFinding(findings, 'medium', 'DYNAMIC_GLOBAL_ACCESS', 'Dynamic browser-global property access detected.', 8);
    }
    const safeId = packageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exportCheck = new RegExp(`(?:window|globalThis)\\s*(?:\\[\\s*['"\`]__munitos_pkg_${safeId}['"\`]\\s*\\]|\\.\\s*__munitos_pkg_${safeId})`, 'i');
    if (!exportCheck.test(raw) && !/\bGLOBAL_KEY\b/i.test(raw)) {
      addFinding(findings, 'medium', 'EXPORT_NOT_VISIBLE', 'Expected MUNITOS package export could not be verified statically.', 8);
    }
    const permissionAbuse = [
      ['storage', /\b(?:localStorage|sessionStorage)\b/i, 9],
      ['cookies', /\bdocument\.cookie\b/i, 10],
      ['network', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/i, 10],
      ['filesystem', /\b(?:showOpenFilePicker|showSaveFilePicker|showDirectoryPicker)\b/i, 10]
    ];
    for (const [name, re, weight] of permissionAbuse) {
      if (meta[name] === 'none' && re.test(raw)) {
        addFinding(findings, 'high', `PERMISSION_BYPASS_${name.toUpperCase()}`, `Direct ${name} capability is used while the manifest declares no ${name} permission.`, weight + 8);
      }
    }
    const weighted = findings.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    const highCount = findings.filter(item => item.severity === 'high').length;
    const mediumCount = findings.filter(item => item.severity === 'medium').length;
    const riskPercentage = Math.max(0, Math.min(100, Math.round(Math.min(100, weighted + highCount * 5 + mediumCount * 2))));
    const status = riskPercentage >= 60 || highCount >= 3 ? 'dangerous' : riskPercentage >= 20 || highCount > 0 || mediumCount > 0 ? 'suspicious' : 'safe';
    const analysisMs = Math.max(0, Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt));
    return freeze({
      version: VERSION,
      available: true,
      packageName: packageId,
      resolved: text(resolved).trim(),
      riskPercentage,
      status,
      decision: 'core-review',
      summary: findings.length
        ? `${status} — ${findings.length} finding${findings.length === 1 ? '' : 's'}`
        : 'safe — no static findings detected',
      findings: findings.slice(0, MAX_FINDINGS).map(item => Object.freeze({
        severity: item.severity,
        code: item.code,
        message: item.message
      })),
      metrics: freeze({
        bytes: raw.length,
        findings: findings.length,
        high: highCount,
        medium: mediumCount,
        analysisMs
      })
    });
  };
  const validateResult = result => Boolean(
    result &&
    result.available === true &&
    Number.isFinite(Number(result.riskPercentage)) &&
    ['safe', 'suspicious', 'dangerous'].includes(result.status) &&
    Array.isArray(result.findings)
  );
  const api = Object.freeze({
    version: VERSION,
    scan,
    validateResult
  });
  Object.defineProperty(window, 'MUNITOSAntivirusAPI', {
    value: api,
    writable: false,
    configurable: false,
    enumerable: false
  });
})();
