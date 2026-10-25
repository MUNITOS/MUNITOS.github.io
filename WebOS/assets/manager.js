(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const VERSION=FILE_VERSION;
  const readyAt = Date.now();
  const runtime = { operations: 0, lastOperation: '', lastError: '', initializedAt: readyAt };
  const getKernel = () => globalThis.MUNITOSVK || null;
  const requireKernel = () => {
    const kernel = getKernel();
    if (!kernel || typeof kernel.installPackage !== 'function') throw new Error('MUNITOS_VIRTUAL_KERNEL_UNAVAILABLE');
    return kernel;
  };
  const captureError = error => { runtime.lastError = String(error?.message || error || 'UNKNOWN_ERROR'); return error; };
  const call = (name, ...args) => {
    const kernel = requireKernel();
    const fn = kernel?.[name];
    if (typeof fn !== 'function') throw new Error(`PACKAGE_MANAGER_API_MISSING:${name}`);
    runtime.operations++;
    runtime.lastOperation = name;
    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') return result.catch(error => { throw captureError(error); });
      return result;
    } catch (error) { throw captureError(error); }
  };
  const sha256 = async source => {
    const text = String(source ?? '');
    if (globalThis.crypto?.subtle && typeof globalThis.TextEncoder === 'function') {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const worker = globalThis.MUNITOSKernel?.worker;
    if (worker && typeof worker.request === 'function') {
      const result = await worker.request('hash', { text }, 9000);
      const hash = String(result?.hash || '').toLowerCase();
      if (/^[a-f0-9]{64}$/.test(hash)) return hash;
    }
    throw new Error('PACKAGE_HASH_UNAVAILABLE');
  };
  const hashSource = async source => {
    const text = String(source ?? '');
    if (!text) throw new Error('PACKAGE_HASH_EMPTY');
    return sha256(text);
  };
  const antivirusAvailable = () => Boolean(globalThis.MUNITOSAntivirusAPI && typeof globalThis.MUNITOSAntivirusAPI.scan === 'function');
  const analyzeExternalPackage = async ({ packageName, source, manifest, resolved } = {}) => {
    const api = globalThis.MUNITOSAntivirusAPI;
    if (!api || typeof api.scan !== 'function') throw new Error('ANTIVIRUS_API_UNAVAILABLE');
    const timeout = 20000;
    try {
      const result = await Promise.race([
        Promise.resolve(api.scan({ packageName, source, manifest, resolved })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ANTIVIRUS_API_TIMEOUT')), timeout))
      ]);
      if (typeof api.validateResult === 'function' && !api.validateResult(result)) throw new Error('ANTIVIRUS_API_INVALID_RESPONSE');
      return result;
    } catch (error) {
      throw captureError(error);
    }
  };
  const api = {
    version: VERSION,
    fileVersion: FILE_VERSION,
    installPackage: (...args) => call('installPackage', ...args),
    install: (...args) => call('installPackage', ...args),
    removePackage: (...args) => call('removePackage', ...args),
    remove: (...args) => call('removePackage', ...args),
    reinstallPackages: (...args) => call('reinstallPackages', ...args),
    reinstall: (...args) => call('reinstallPackages', ...args),
    restorePackageState: (...args) => call('restorePackageState', ...args),
    persistPackageRegistry: (...args) => call('persistPackageRegistry', ...args),
    persistPackageCache: (...args) => call('persistPackageCache', ...args),
    persistPackageState: (...args) => call('persistPackageState', ...args),
    loadPackageCatalog: (...args) => call('loadPackageCatalog', ...args),
    getPackageCatalogEntry: (...args) => call('getPackageCatalogEntry', ...args),
    resolveLazyPackageForCommand: (...args) => call('resolveLazyPackageForCommand', ...args),
    ensurePackageLoaded: (...args) => call('ensurePackageLoaded', ...args),
    quarantinePackage: (...args) => call('quarantinePackage', ...args),
    getRemotePackageDisplayName: (...args) => call('getRemotePackageDisplayName', ...args),
    normalizeInstallSource: (...args) => call('normalizeInstallSource', ...args),
    resolveInstallMode: (...args) => call('resolveInstallMode', ...args),
    normalizePermissions: (...args) => call('normalizePermissions', ...args),
    summarizePermissions: (...args) => call('summarizePermissions', ...args),
    packageFailLines: (...args) => call('packageFailLines', ...args),
    markPackageStatus: (...args) => call('markPackageStatus', ...args),
    getPackageStatus: (...args) => call('getPackageStatus', ...args),
    getPackageInventory: (...args) => call('getPackageInventory', ...args),
    preparePackageEnable: (...args) => call('preparePackageEnable', ...args),
    commitPackageEnable: (...args) => call('commitPackageEnable', ...args),
    disablePackage: (...args) => call('disablePackage', ...args),
    refreshPackageHashes: (...args) => call('refreshPackageHashes', ...args),
    isPackageLifecycleOutputBlocked: (...args) => call('isPackageLifecycleOutputBlocked', ...args),
    reset: (...args) => call('reset', ...args),
    hashSource,
    analyzeExternalPackage,
    validateAntivirusResult: result => Boolean(globalThis.MUNITOSAntivirusAPI?.validateResult?.(result)),
    antivirusAvailable,
    getState: () => {
      const state = getKernel()?.state?.();
      return state || null;
    },
    health: () => Object.freeze({ version: VERSION, kernelAvailable: Boolean(getKernel()), antivirusAvailable: antivirusAvailable(), operations: runtime.operations, lastOperation: runtime.lastOperation, lastError: runtime.lastError, initializedAt: runtime.initializedAt }),
    snapshot: () => Object.freeze({ health: api.health(), packages: api.getPackageInventory?.() || [] })
  };
  const manager = Object.freeze(api);
  Object.defineProperty(globalThis, 'MUNITOSManager', { value: manager, writable: false, configurable: false, enumerable: false });
})();
