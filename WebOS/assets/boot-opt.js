(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const VERSION=FILE_VERSION;
  const optimizer = globalThis.MUNITOSOptimizer;
  const start = () => {
    if (!optimizer || typeof optimizer.boot !== 'function') return Promise.resolve({ version: VERSION, phase: 'unavailable' });
    return optimizer.boot({ deferred: true, scheduleMaintenance: true });
  };
  const ready = Promise.resolve().then(start).catch(error => Object.freeze({ version: VERSION, phase: 'degraded', error: String(error?.message || error || 'BOOT_OPTIMIZER_FAILED') }));
  const api = Object.freeze({ version: VERSION, ready, snapshot: () => optimizer?.snapshot?.() || { version: VERSION, phase: 'unavailable' }, cleanup: options => optimizer?.cleanup?.(options) });
  Object.defineProperty(globalThis, '__MUNITOSBootOptimizer', { value: api, configurable: true, enumerable: false, writable: false });
})();
