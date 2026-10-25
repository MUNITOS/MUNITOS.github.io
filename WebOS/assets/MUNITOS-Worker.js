(() => {
  'use strict';
  const VERSION='1.0';
  const MAX_INPUT_BYTES = 4 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
  const MAX_BATCH = 32;
  const now = () => { try { return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now(); } catch { return Date.now(); } };
  const encoder = new TextEncoder();
  const cancelled = new Set();
  const stats = { startedAt: Date.now(), tasks: 0, failures: 0, bytesIn: 0, bytesOut: 0 };
  const sizeOf = value => {
    try {
      if (typeof value === 'string') return encoder.encode(value).byteLength;
      return encoder.encode(JSON.stringify(value ?? null)).byteLength;
    } catch { return Infinity; }
  };
  const assertSize = (value, max = MAX_INPUT_BYTES) => {
    const bytes = sizeOf(value);
    if (bytes > max) throw new Error('WORKER_PAYLOAD_LIMIT');
    stats.bytesIn += Number.isFinite(bytes) ? bytes : 0;
    return bytes;
  };
  const hashText = async text => {
    const raw = String(text ?? '');
    if (!self.crypto?.subtle) throw new Error('CRYPTO_UNAVAILABLE');
    const digest = await self.crypto.subtle.digest('SHA-256', encoder.encode(raw));
    const hash = Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
    return { hash, bytes: encoder.encode(raw).byteLength };
  };
  const runBenchmark = payload => {
    let iterations = Math.floor(Number(payload?.iterations) || 2000000);
    iterations = Math.max(100000, Math.min(20000000, iterations));
    const start = now();
    let checksum = 0;
    for (let i = 0; i < iterations; i++) {
      if ((i & 8191) === 0 && cancelled.has(payload?.taskId)) throw new Error('WORKER_CANCELLED');
      checksum = (checksum + (((i * 17) ^ (i >>> 3)) & 0xffff)) % 1000003;
    }
    const elapsed = Math.max(0.01, now() - start);
    return { iterations, elapsed, opsPerSecond: Math.round(iterations / elapsed * 1000), checksum };
  };
  const sourceMetrics = async source => {
    const text = String(source ?? '');
    const lineCount = text ? text.split(/\r?\n/).length : 0;
    const bytes = encoder.encode(text).byteLength;
    let hash = null;
    try { hash = (await hashText(text)).hash; } catch {}
    return Object.freeze({ bytes, chars: text.length, lines: lineCount, hash, hasDynamicEval: /\beval\s*\(|new\s+Function\s*\(/.test(text), hasNetwork: /\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(text), hasWorker: /\bnew\s+Worker\s*\(|SharedWorker/.test(text) });
  };
  const runTask = async (type, payload = {}, taskId = '') => {
    assertSize(payload);
    const t = String(type || '').trim();
    if (t === 'ping') return { version: VERSION, now: Date.now(), uptimeMs: Date.now() - stats.startedAt, worker: true };
    if (t === 'stats') return { ...stats, uptimeMs: Date.now() - stats.startedAt };
    if (t === 'hash') return hashText(typeof payload === 'string' ? payload : payload.text);
    if (t === 'json-roundtrip') {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload?.value ?? null);
      const value = JSON.parse(text);
      return { value, bytes: encoder.encode(text).byteLength };
    }
    if (t === 'serialize') {
      const text = JSON.stringify(payload?.value ?? null);
      if (encoder.encode(text).byteLength > MAX_OUTPUT_BYTES) throw new Error('WORKER_RESULT_LIMIT');
      return { text, bytes: encoder.encode(text).byteLength };
    }
    if (t === 'parse') {
      const text = String(payload?.text ?? '');
      if (encoder.encode(text).byteLength > MAX_OUTPUT_BYTES) throw new Error('WORKER_PAYLOAD_LIMIT');
      return { value: JSON.parse(text), bytes: encoder.encode(text).byteLength };
    }
    if (t === 'bench') return runBenchmark({ ...payload, taskId });
    if (t === 'source-metrics') return sourceMetrics(typeof payload === 'string' ? payload : payload?.source);
    if (t === 'byte-count') return { bytes: sizeOf(typeof payload === 'string' ? payload : payload?.value) };
    if (t === 'batch') {
      const items = Array.isArray(payload?.items) ? payload.items.slice(0, MAX_BATCH) : [];
      const out = [];
      for (let i = 0; i < items.length; i++) {
        if (cancelled.has(taskId)) throw new Error('WORKER_CANCELLED');
        out.push(await runTask(items[i]?.type, items[i]?.payload, taskId));
      }
      return out;
    }
    throw new Error('UNKNOWN_WORKER_TASK');
  };
  const post = (port, message) => {
    try {
      const bytes = sizeOf(message);
      if (bytes > MAX_OUTPUT_BYTES) throw new Error('WORKER_RESULT_LIMIT');
      stats.bytesOut += Number.isFinite(bytes) ? bytes : 0;
      port.postMessage(message);
    } catch (error) {
      port.postMessage({ id: message?.id, ok: false, error: String(error?.message || error || 'WORKER_POST_FAILED') });
    }
  };
  self.addEventListener('message', event => {
    const message = event?.data || {};
    const id = String(message.id || '');
    if (message.type === 'cancel') {
      if (id) cancelled.add(id);
      return;
    }
    if (message.type !== 'task' || !id) return;
    stats.tasks++;
    Promise.resolve()
      .then(() => runTask(message.task || message.kind, message.payload || {}, id))
      .then(result => { cancelled.delete(id); post(self, { id, ok: true, result }); })
      .catch(error => { stats.failures++; cancelled.delete(id); post(self, { id, ok: false, error: String(error?.message || error || 'WORKER_TASK_FAILED') }); });
  });
})();
