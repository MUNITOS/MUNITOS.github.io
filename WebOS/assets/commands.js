(() => {
  'use strict';
  const FILE_VERSION='1.0';
  if (window.MUNITOSCommandsReady === true) return;
  const core = window.MUNITOSCore || window.MUNITOSTerminalCore;
  if (!core || typeof core.registerCommand !== 'function') {
    const status = document.getElementById('screenStatus');
    if (status) {
      status.textContent = 'MUNITOS Core failed to initialize commands.';
    }
    return;
  }
  const services = core.commandServices;
  if (!services) {
    const status = document.getElementById('screenStatus');
    if (status) {
      status.textContent = 'MUNITOS command services are unavailable.';
    }
    return;
  }
  const {
    state,
    Result,
    CMD_STATUS,
    CAPABILITY,
    linuxRegistry,
    linuxRegister,
    linuxRegisterBlocked,
    linuxRegisterSimple,
    linuxCommandExists,
    linuxResolveCommand,
    linuxExecute,
    linuxResultToEntries,
    clearTranscript,
    fs,
    currentUser,
    currentUserRecord,
    snapshotIdentity,
    restoreIdentity,
    pushIdentity,
    popIdentity,
    switchUser,
    enterRoot,
    enterGhost,
    loginAs,
    logoutSession,
    runAsRoot,
    canSudo,
    createJob,
    getJob,
    setJobState,
    terminateJob,
    cancelAllOperations,
    parseInteger,
    getSnapshot,
    makeLine,
    makeSpacer,
    setMode,
    setCwd,
    updatePrompt,
    updateCaret,
    appendTranscript,
    resolveCommand,
    helpLines,
    setActiveFlow,
    clearActiveFlow,
    beginPasswordFlow,
    setVirtualPassword,
    verifyVirtualPassword,
    passwordConfigured,
    requestYesNo,
    getRemotePackageDisplayName,
    normalizeInstallSource,
    resolveInstallMode,
    installPackage,
    removePackage,
    reinstallPackages,
    packageFailLines,
    markPackageStatus,
    refreshStaticRuntimeState,
    refreshDynamicRuntimeState,
    syncLiveEntries,
    persist,
    persistPackageRegistry,
    persistPackageCache,
    normalizePermissions,
    summarizePermissions,
    factoryResetVirtualSystem
  } = services;
const INFO_VALUE_LIMIT = 100;
const truncateInfoValue = value => {
  const text = String(value ?? 'Unknown').replace(/\s+/g, ' ').trim() || 'Unknown';
  const chars = Array.from(text);
  if (chars.length <= INFO_VALUE_LIMIT) return text;
  return `${chars.slice(0, INFO_VALUE_LIMIT - 3).join('')}...`;
};
const currentSystemInfo = () => {
  refreshStaticRuntimeState();
  refreshDynamicRuntimeState();
  return {
    os: truncateInfoValue(state.os),
    kernel: truncateInfoValue(state.kernel),
    uptime: truncateInfoValue(state.uptime),
    packages: truncateInfoValue(state.packages),
    shell: truncateInfoValue(state.shell),
    resolution: truncateInfoValue(state.resolution),
    terminal: truncateInfoValue(state.terminal),
    cpu: truncateInfoValue(state.cpu.display),
    gpu: truncateInfoValue(state.gpu),
    memory: truncateInfoValue(state.memory.display),
    hostname: truncateInfoValue(state.host),
    user: truncateInfoValue(state.user),
    cwd: truncateInfoValue(state.cwd),
    language: truncateInfoValue(state.language),
    started: truncateInfoValue(new Date(state.startedAt).toLocaleString())
  };
};
const addSystemInfoLines = (result, rows) => {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    result.addLine(`${label.padEnd(labelWidth)} : ${value}`);
  }
  return result;
};
const BLOCKED_COMMANDS = Object.freeze({
  bind: 'native readline keymap control is unavailable',
  builtin: 'native Bash builtin dispatch is unavailable',
  caller: 'native Bash call-stack inspection is unavailable',
  compgen: 'programmable completion generation is unavailable',
  complete: 'programmable completion hooks are unavailable',
  compopt: 'programmable completion options are unavailable',
  eval: 'recursive native shell evaluation is unavailable',
  fc: 'native Bash command editing is unavailable',
  mknod: 'native device-node creation is blocked',
  trap: 'native shell signal interception is unavailable',
  ulimit: 'native kernel resource limits are unavailable',
  unshare: 'native Linux namespaces cannot be created',
  wait: 'native child-process synchronization is unavailable'
});
for (
  const [name, reason]
  of Object.entries(BLOCKED_COMMANDS)
) {
  linuxRegisterBlocked(
    name,
    [
      `${name}: ${reason}`,
      'This MUNITOS capability is intentionally unavailable in the virtual browser runtime.'
    ]
  );
}
  linuxRegisterSimple('munitos', {
    description: 'Inspect and optimize the MUNITOS Virtual Kernel and browser runtime.',
    usage: 'munitos [status|boot|probe|worker|optimize|clean|selftest] | munitos <pkgname> [on|off]',
    aliases: ['lkernel'],
    category: 0,
    executor: async ({ args, ctx }) => {
      const r = new Result();
      const command = String(args[0] || 'status').toLowerCase();
      const kernelCommands = new Set(['status','boot','probe','worker','optimize','clean','selftest']);
      const packageApi = services.package || {};
      if (!kernelCommands.has(command)) {
        const packageName = String(args[0] || '').trim();
        if (!packageName || typeof packageApi.getPackageStatus !== 'function') {
          return r.failure('munitos: package manager is unavailable.').addError('Package status API is not initialized.', 'Package manager failure.');
        }
        let status;
        try {
          status = packageApi.getPackageStatus(packageName);
        } catch (error) {
          return r.failure(`munitos: unable to inspect ${packageName}.`).addError(error?.message || 'Unknown package status error.', 'Package status failure.');
        }
        if (!status) return r.failure(`Package ${packageName} was not found.`);
        const action = String(args[1] || '').toLowerCase();
        if (!action) {
          const lines = [
            `Package: ${status.packageName}`,
            `Type: ${status.internal ? 'Internal' : 'External'}`,
            `Status: ${status.status || 'unknown'}`,
            `Enabled: ${status.enabled ? 'yes' : 'no'}`,
            `Sandbox: ${status.internal ? 'not-applicable' : (status.sandbox ? 'required' : 'required')}`,
            `Trusted: ${status.trusted ? 'yes' : 'no'}`,
            `Quarantine: ${status.quarantined ? 'yes' : 'no'}`,
            `Hash: ${status.hashStatus || 'unknown'}`,
            `Approval: ${status.approvalRequired ? (status.approved ? 'required' : 'pending') : 'not-required'}`,
            `Update: ${status.update ? 'yes' : 'no'}`
          ];
          if (!status.internal) lines.push(`Antivirus: ${status.antivirus?.status || 'unknown'} | risk ${status.antivirus?.riskPercentage ?? 'n/a'}%`);
          lines.push(`Version: ${status.version || 'unknown'}`);
          for (const line of lines) r.addLine(line, line.startsWith('Status:') && ['enabled','active'].includes(String(status.status).toLowerCase()) ? 'accent' : 'output');
          return r;
        }
        if (action !== 'on' && action !== 'off') return r.failure(`Usage: munitos ${packageName} [on|off]`);
        if (action === 'off') {
          try {
            const result = await Promise.resolve(packageApi.disablePackage(packageName));
            if (result?.ok === false) return r.failure(result.error || `Package ${packageName} could not be disabled.`);
            return r.addLine(`Package ${packageName} disabled.`, 'accent');
          } catch (error) {
            return r.failure(`Package ${packageName} could not be disabled.`).addError(error?.message || 'Unknown package disable error.', 'Package disable failure.');
          }
        }
        try {
          const plan = await packageApi.preparePackageEnable(packageName, ctx);
          if (!plan?.ok) return r.failure(plan?.error || `Package ${packageName} could not be prepared for activation.`);
          if (plan.internal) {
            const committed = await packageApi.commitPackageEnable(plan, ctx);
            if (committed?.ok === false) return r.failure(committed.error || `Package ${packageName} could not be enabled.`);
            return r.addLine(`Internal package ${packageName} enabled.`, 'accent');
          }
          const av = plan.analysis || {};
          r.addLine(`Antivirus: ${av.status || 'unknown'} | risk ${av.riskPercentage ?? 'n/a'}%`, av.status === 'dangerous' ? 'danger' : av.status === 'suspicious' ? 'muted' : 'accent');
          if (av.summary) r.addLine(`Analysis: ${av.summary}`, 'muted');
          const approved = await requestYesNo(`Enable external package ${packageName}? Type Y or N.`, `Risk ${av.riskPercentage ?? 'n/a'}% (${av.status || 'unknown'}). Approve the current package hash and enable it?`, ctx);
          if (approved !== true) return r.addLine(`Package ${packageName} remains disabled/quarantined.`, 'muted');
          const committed = await packageApi.commitPackageEnable(plan, ctx);
          if (committed?.ok === false) return r.failure(committed.error || `Package ${packageName} could not be enabled.`);
          return r.addLine(`External package ${packageName} enabled after user approval.`, 'accent');
        } catch (error) {
          return r.failure(`Package ${packageName} could not be enabled.`).addError(error?.message || 'Unknown package enable error.', 'Package enable failure.');
        }
      }
      const kernel = services.virtualKernel?.kernel || window.MUNITOSKernel || null;
      if (!kernel) return r.failure('munitos: virtual kernel is unavailable.').addError('Kernel API is not initialized.', 'Kernel startup failure.');
      if (command === 'boot') {
        const snap = kernel.snapshot?.() || {};
        const boot = snap.bootOptimizer || {};
        const actions = Array.isArray(boot.actions) ? boot.actions.slice(-32) : [];
        r.addLine(`MUNITOS ${FILE_VERSION} Boot Trace`, 'accent');
        r.addLine(`Phase: ${boot.phase || 'unknown'} | Started: ${boot.startedAt ? new Date(boot.startedAt).toISOString() : 'unknown'} | Ready: ${boot.readyAt ? new Date(boot.readyAt).toISOString() : 'unknown'}`, 'output');
        const clean = boot.cleanup || {};
        r.addLine(`Cleanup: LS=${clean.localStorage ?? 0} Cookies=${clean.cookies ?? 0} Cache=${clean.caches ?? 0} IDB=${clean.indexedDB ?? 0} SW=${clean.serviceWorkers ?? 0}`, 'output');
        r.addLine(`Migration: persistence=${boot.migration?.persistence || 'none'} VFS=${boot.migration?.vfs || 'none'}`, 'output');
        if (!actions.length) r.addLine('Boot actions: none recorded.', 'muted');
        else for (const item of actions) r.addLine(`${new Date(item.at).toISOString()}  ${item.phase}${item.detail ? ` — ${item.detail}` : ''}`, 'muted');
        return r;
      }
      if (command === 'probe') {
        const caps = await Promise.resolve(kernel.probeCapabilities?.());
        r.addLine(`MUNITOS Virtual Kernel ${FILE_VERSION} — Browser Probe`, 'accent');
        r.addLine(`Phase: ${caps?.phase || 'unknown'} | Score: ${caps?.score ?? 'n/a'} | Profile: ${caps?.profile || 'unknown'}`, 'output');
        for (const [key, value] of Object.entries(caps?.flags || {}).sort((a,b)=>a[0].localeCompare(b[0]))) r.addLine(`${key.padEnd(24)} ${value ? 'available' : 'unavailable'}`, value ? 'output' : 'muted');
        r.addLine(`CPU: ${caps?.hardware?.cpuCount ?? 'n/a'} | Memory: ${caps?.hardware?.memoryGB ?? 'n/a'} GB | Connection: ${caps?.hardware?.connection || 'unknown'}`, 'muted');
        return r;
      }
      if (command === 'worker') {
        const worker = kernel.worker?.status?.() || { status: 'unsupported', supported: false };
        r.addLine('MUNITOS Worker Runtime', 'accent');
        r.addLine(`Status: ${worker.status}`, worker.status === 'ready' ? 'output' : 'danger');
        r.addLine(`Supported: ${worker.supported ? 'yes' : 'no'} | Tasks: ${worker.tasks} | Failures: ${worker.failures} | Pending: ${worker.pending}`, 'muted');
        try {
          const ping = await kernel.worker.ping();
          const after = kernel.worker.status?.() || worker;
          r.addLine(`Ping: ${ping?.uptimeMs ?? 0}ms worker uptime`, 'output');
          r.addLine(`State after ping: ${after.status} | tasks ${after.tasks ?? 0} | failures ${after.failures ?? 0} | pending ${after.pending ?? 0}`, after.status === 'ready' ? 'output' : 'muted');
        } catch (error) {
          r.addLine(`Worker ping failed: ${error?.message || 'unknown error'}`, 'danger');
        }
        return r;
      }
      if (command === 'optimize' || command === 'clean') {
        r.addLine('MUNITOS runtime optimization started...', 'accent');
        const result = await kernel.optimize?.();
        const cleanup = result?.cleanup;
        r.addLine(`Optimizer status: localStorage=${cleanup?.cleanup?.localStorage ?? cleanup?.localStorage ?? 0}, cookies=${cleanup?.cleanup?.cookies ?? cleanup?.cookies ?? 0}, caches=${cleanup?.cleanup?.caches ?? cleanup?.caches ?? 0}, indexedDB=${cleanup?.cleanup?.indexedDB ?? cleanup?.indexedDB ?? 0}`, 'output');
        r.addLine(`Execution profile: ${result?.capabilities?.profile || 'unknown'} | concurrency=${result?.buffer?.batch ?? result?.buffer?.size ?? 'n/a'}`, 'output');
        r.addLine(`Worker: ${result?.worker?.status || 'unknown'}`, 'output');
        r.addLine(`Optimization complete. Version remains ${FILE_VERSION}.`, 'accent');
        return r;
      }
      if (command === 'selftest') {
        r.addLine('MUNITOS kernel self-test', 'accent');
        const snapshot = kernel.snapshot?.() || {};
        const checks = [
          ['kernel-version', snapshot.version === FILE_VERSION],
          ['capability-engine', Boolean(snapshot.capabilities)],
          ['scheduler', Boolean(snapshot.buffer && Number.isFinite(snapshot.buffer.batch ?? snapshot.buffer.size))],
          ['worker-runtime', snapshot.worker?.status === 'ready' || snapshot.worker?.status === 'unsupported'],
          ['boot-optimizer', Boolean(snapshot.bootOptimizer)],
          ['vfs-link', Boolean(services.fs?.stats?.())]
        ];
        for (const [name, ok] of checks) r.addLine(`${ok ? 'PASS' : 'FAIL'} ${name}`, ok ? 'output' : 'danger');
        const failures = checks.filter(([, ok]) => !ok).length;
        r.addLine(`Self-test result: ${failures ? `${failures} failure(s)` : 'all checks passed'}.`, failures ? 'danger' : 'accent');
        return r;
      }
      const snap = kernel.snapshot?.() || {};
      const caps = snap.capabilities || {};
      const worker = snap.worker || {};
      const boot = snap.bootOptimizer || {};
      const buffer = snap.buffer || {};
      r.addLine(`╭─ MUNITOS Virtual Kernel ${FILE_VERSION}`, 'accent');
      r.addLine(`│ Phase      : ${caps.phase || 'unknown'}`, 'output');
      r.addLine(`│ Profile    : ${caps.profile || 'unknown'} (score ${caps.score ?? 'n/a'})`, 'output');
      r.addLine(`│ CPU / RAM  : ${caps.hardware?.cpuCount ?? 'n/a'} / ${caps.hardware?.memoryGB ?? 'n/a'} GB`, 'output');
      r.addLine(`│ Connection : ${caps.hardware?.connection || 'unknown'}`, 'output');
      r.addLine(`│ Scheduler  : ${buffer.batch ?? buffer.size ?? 'n/a'} active (min ${buffer.min ?? 'n/a'}, max ${buffer.max ?? 'n/a'})`, 'output');
      r.addLine(`│ Worker     : ${worker.status || 'unknown'} | tasks ${worker.tasks ?? 0} | failures ${worker.failures ?? 0}`, worker.status === 'ready' ? 'output' : 'muted');
      r.addLine(`│ VFS        : ${services.fs?.stats?.()?.nodes ?? 0} nodes`, 'output');
      r.addLine(`│ Packages   : ${snap.installedCount ?? 0} installed / ${snap.packageCount ?? 0} registry`, 'output');
      r.addLine(`│ Boot clean : ${(boot.cleanup?.localStorage ?? 0)} LS, ${(boot.cleanup?.cookies ?? 0)} cookies, ${(boot.cleanup?.caches ?? 0)} caches, ${(boot.cleanup?.indexedDB ?? 0)} IDB, ${(boot.cleanup?.serviceWorkers ?? 0)} SW`, 'output');
      r.addLine('╰─ Commands: munitos boot | probe | worker | optimize | clean | selftest', 'muted');
      return r;
    }
  });
  linuxRegisterSimple('help', {
    description: 'Show available commands.',
    usage: 'help [command]',
    aliases: ['?'],
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        r.addLine(
  'MUNITOS Available Commands:',
  'accent'
);
for (
  const cmd
  of Array.from(
    linuxRegistry.values()
  )
    .filter(
      c =>
        !c.isAlias &&
        !BLOCKED_COMMANDS[c.name]
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    )
) {
  r.addLine(
    `${cmd.name.padEnd(16)} [${cmd.status}] ${cmd.description}`,
    cmd.status === CMD_STATUS.FULL
      ? 'output'
      : cmd.status === CMD_STATUS.BLOCKED
        ? 'danger'
        : 'muted'
  );
}
r.addLine('', 'muted');
r.addLine(
  'Blocked / Unavailable:',
  'danger'
);
for (
  const name
  of Object.keys(BLOCKED_COMMANDS)
) {
  r.addLine(
    `${name.padEnd(16)} [BLOCKED] ${BLOCKED_COMMANDS[name]}`,
    'danger'
  );
}
return r;
      }
      const target = linuxResolveCommand(args[0]);
      if (!target) return new Result().failure(`No help available for ${args[0]}`).addError(`No help available for ${args[0]}`, 'Command not found.');
      r.addLine(target.name, 'accent');
      r.addLine(`Usage: ${target.usage}`);
      if (target.description) r.addLine(target.description, 'muted');
      if (target.status) r.addLine(`Status: ${target.status}`, 'muted');
      if (target.capability) r.addLine(`Capability: ${target.capability}`, 'muted');
      if (target.aliases.length) r.addLine(`Aliases: ${target.aliases.join(', ')}`, 'muted');
      if (target.examples.length) {
        r.addLine('Examples:', 'accent');
        for (const ex of target.examples) r.addLine(`  ${ex}`, 'muted');
      }
      return r;
    }
  });
  linuxRegisterSimple('shopt', {
  description: 'Manage supported virtual shell options.',
  usage: 'shopt [-spu] [OPTION]...',
  category: 2,
  executor: ({ args }) => {
    const names =
      args.filter(
        value =>
          !value.startsWith('-')
      );
    const printOnly =
      args.includes('-p');
    const set =
      args.includes('-s');
    const unset =
      args.includes('-u');
    const supported = new Set([
      'dotglob',
      'nocaseglob',
      'nullglob',
      'errexit'
    ]);
    if (
      !set &&
      !unset &&
      !printOnly &&
      !names.length
    ) {
      const r = new Result();
      for (const name of supported) {
        r.addLine(
          `${name} ${
            state.shellOptions.get(name) === true
              ? 'on'
              : 'off'
          }`
        );
      }
      return r;
    }
    if (
      printOnly ||
      (!set && !unset)
    ) {
      const r = new Result();
      for (
        const name
        of names.length
          ? names
          : supported
      ) {
        if (!supported.has(name)) {
          return r.failure(
            `shopt: ${name}: invalid shell option name`
          );
        }
        r.addLine(
          `shopt -${
            state.shellOptions.get(name) === true
              ? 's'
              : 'u'
          } ${name}`
        );
      }
      return r;
    }
    if (!names.length) {
      return new Result().failure(
        'shopt: option name required'
      );
    }
    for (const name of names) {
      if (!supported.has(name)) {
        return new Result().failure(
          `shopt: ${name}: invalid shell option name`
        );
      }
      state.shellOptions.set(
        name,
        set && !unset
      );
    }
    return new Result().success();
  }
});
  linuxRegisterSimple('bg', {
    description: 'Resume a stopped virtual job in the background.',
    usage: 'bg [%job]',
    category: 2,
    mutatesJobs: true,
    executor: ({ args }) => {
      const job = getJob(args[0]) || Array.from(state.jobs.values()).at(-1);
      if (!job) return new Result().failure('bg: current: no such job');
      if (job.state === 'RUNNING') return new Result().failure(`bg: job ${job.id} is already running`);
      if (job.state !== 'STOPPED') return new Result().failure(`bg: job ${job.id} is not resumable`);
      setJobState(job, 'RUNNING');
      job.process.background = true;
      return new Result().addLine(`[${job.id}]+  ${job.command}`, 'accent').addChange(`Job ${job.id} resumed in background`);
    }
  });
  linuxRegisterSimple('chage', {
    description: 'Manage virtual password aging information.',
    usage: 'chage [options] user',
    category: 2,
    executor: ({ args }) => {
      const userName = args.at(-1);
      const user = state.users.get(userName);
      if (!user) return new Result().failure(`chage: user '${userName}' does not exist`);
      let changed = false;
      for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '-M' && args[i + 1]) {
          user.maxAge = parseInteger(args[++i]);
          changed = true;
        } else if (args[i] === '-m' && args[i + 1]) {
          user.minAge = parseInteger(args[++i]);
          changed = true;
        } else if (args[i] === '-W' && args[i + 1]) {
          user.warnAge = parseInteger(args[++i]);
          changed = true;
        } else if (args[i] === '-I' && args[i + 1]) {
          user.inactive = parseInteger(args[++i]);
          changed = true;
        } else if (args[i] === '-E' && args[i + 1]) {
          user.expire = parseInteger(args[++i]);
          changed = true;
        }
      }
      if (changed) return new Result().addChange(`Password aging updated for ${userName}`);
      const r = new Result();
      r.addLine(`Last password change\t\t\t\t: ${user.lastChange}`);
      r.addLine(`Password expires\t\t\t\t: ${user.maxAge < 0 ? 'never' : user.lastChange + user.maxAge}`);
      r.addLine(`Password inactive\t\t\t\t: ${user.inactive < 0 ? 'never' : user.lastChange + user.maxAge + user.inactive}`);
      r.addLine(`Account expires\t\t\t\t\t: ${user.expire < 0 ? 'never' : user.expire}`);
      r.addLine(`Minimum number of days between password change\t: ${user.minAge}`);
      r.addLine(`Maximum number of days between password change\t: ${user.maxAge}`);
      r.addLine(`Number of days of warning before password expires\t: ${user.warnAge}`);
      return r;
    }
  });
  linuxRegisterSimple('chattr', {
    description: 'Modify virtual inode attributes.',
    usage: 'chattr [+|-]ATTRIBUTES FILE',
    category: 2,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('chattr: missing operand');
      const path = args.at(-1);
      if (!fs.existsExact(path)) return new Result().failure(`chattr: No such file or directory: ${path}`);
      for (const exp of args.slice(0, -1)) {
        try { fs.setAttributes(path, exp); } catch { return new Result().failure(`chattr: Invalid argument: ${exp}`); }
      }
      return new Result().addChange(`Attributes updated for ${path}`);
    }
  });
  linuxRegisterSimple('chpasswd', {
    description: 'Update virtual user passwords.',
    usage: 'chpasswd [USER:PASSWORD ...]',
    category: 2,
    mutatesUsers: true,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('chpasswd: interactive password input is unavailable through the package bridge').addError('chpasswd: interactive password input unavailable', 'Use chpasswd USER:PASSWORD for the virtual user database.');
      for (const item of args) {
        const i = item.indexOf(':');
        if (i <= 0) return new Result().failure(`chpasswd: invalid line: ${item}`);
        const user = item.slice(0, i);
        const pass = item.slice(i + 1);
        if (!state.users.has(user)) return new Result().failure(`chpasswd: user '${user}' does not exist`);
        state.passwords.set(user, pass);
      }
      return new Result().addChange('Passwords updated');
    }
  });
  linuxRegisterSimple('chroot', {
    description: 'Change the virtual process root.',
    usage: 'chroot NEWROOT [COMMAND [ARG...]]',
    category: 2,
    async executor({ args, api }) {
      if (!args.length) return new Result().failure('Usage: chroot NEWROOT [COMMAND [ARG...]]');
      const root = fs.normalize(args[0]);
      const node = fs.inspect(root);
      if (!node || node.kind !== 'dir') return new Result().failure(`chroot: failed to run command '/bin/bash': No such file or directory`).addError(`chroot: failed to run command '/bin/bash': No such file or directory`, `virtual root '${root}' does not exist`);
      state.variables.set('VIRTUAL_ROOT', root);
      if (args.length === 1) return new Result().addLine(`Virtual root changed to ${root}`, 'accent');
      try {
        return await linuxExecute(args[1], args.slice(2), api);
      } finally {
        state.variables.delete('VIRTUAL_ROOT');
      }
    }
  });
  linuxRegisterSimple('disown', {
    description: 'Detach a virtual job from the current shell.',
    usage: 'disown [%job]',
    category: 2,
    mutatesJobs: true,
    executor: ({ args }) => {
      const job = getJob(args[0]) || Array.from(state.jobs.values()).at(-1);
      if (!job) return new Result().failure('disown: no such job');
      job.detached = true;
      job.process.detached = true;
      job.process.shellOwned = false;
      return new Result().addChange(`Job ${job.id} detached`);
    }
  });
  linuxRegisterSimple('exec', {
    description: 'Execute a command inside the virtual shell context.',
    usage: 'exec COMMAND [ARG...]',
    category: 2,
    async executor({ args, api }) {
      return args.length ? linuxExecute(args[0], args.slice(1), api) : new Result().success('no command specified');
    }
  });
  linuxRegisterSimple('fg', {
    description: 'Move a virtual job to the foreground.',
    usage: 'fg [%job]',
    category: 2,
    mutatesJobs: true,
    executor: ({ args }) => {
      const job = getJob(args[0]) || Array.from(state.jobs.values()).at(-1);
      if (!job) return new Result().failure('fg: current: no such job');
      if (job.state !== 'RUNNING' && job.state !== 'STOPPED') return new Result().failure(`fg: job ${job.id} has already finished`);
      setJobState(job, 'RUNNING');
      job.process.background = false;
      return new Result().addLine(job.command, 'accent');
    }
  });
  linuxRegisterSimple('history', {
    description: 'Display command history.',
    usage: 'history [N]',
    category: 2,
    executor: ({ args }) => {
      const snapshot = getSnapshot();
      const history = Array.isArray(snapshot?.history) ? snapshot.history : state.historyFallback;
      const count = args[0] && /^\d+$/.test(args[0]) ? Number(args[0]) : history.length;
      const slice = history.slice(-count);
      const start = Math.max(1, history.length - slice.length + 1);
      const r = new Result();
      slice.forEach((value, i) => r.addLine(`${String(start + i).padStart(5, ' ')}  ${value}`));
      return r;
    }
  });
linuxRegisterSimple('jobs', {
  description: 'List virtual shell jobs.',
  usage: 'jobs [-l|-p]',
  category: 2,
  executor: ({ args }) => {
    const showPid =
      args.includes('-l') ||
      args.includes('-p');
    const jobs =
      Array.from(
        state.jobs.values()
      ).filter(
        job => !job.detached
      );
    const current =
      jobs
        .filter(
          job =>
            job.state === 'RUNNING' || job.state === 'STOPPED'
        )
        .at(-1)?.id ?? null;
    const previous =
      jobs
        .filter(
          job =>
            job.id !== current &&
            (job.state === 'RUNNING' || job.state === 'STOPPED')
        )
        .at(-1)?.id ?? null;
    const r = new Result();
    for (const job of jobs) {
      const marker =
        job.id === current
          ? '+'
          : job.id === previous
            ? '-'
            : ' ';
      const stateText =
        job.state === 'TERMINATED'
          ? 'Terminated'
          : job.state === 'FAILED'
            ? `Exit ${job.process.exitCode ?? 1}`
            : job.state[0] +
              job.state.slice(1).toLowerCase();
      r.addLine(
        `[${job.id}]${marker}  ${stateText.padEnd(11)}${
          showPid
            ? ` ${job.pid}`
            : ''
        } ${job.command}`
      );
    }
    return r;
  }
});
  linuxRegisterSimple('lsattr', {
    description: 'Display virtual inode attributes.',
    usage: 'lsattr [FILE...]',
    category: 2,
    executor: ({ args }) => {
      const targets = args.length ? args : [state.cwd];
      const r = new Result();
      for (const path of targets) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`lsattr: No such file or directory: ${path}`);
          continue;
        }
        const attrs = Array.from(node.attributes).sort().join('').padEnd(16, '-');
        r.addLine(`${attrs} ${path}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('lsblk', {
    description: 'Display virtual block devices.',
    usage: 'lsblk',
    category: 2,
    executor: () => {
      const r = new Result();
      r.addLine('NAME   MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS');
      for (const d of state.blockDevices) r.addLine(`${d.name.padEnd(6)} ${String(d.major).padStart(3)}:${String(d.minor).padEnd(3)} ${d.removable ? '1' : '0'} ${fs.humanSize(d.size).padStart(6)} ${d.readOnly ? '1' : '0'} ${d.type.padEnd(4)} ${d.mountpoint || ''}`);
      return r;
    }
  });
  linuxRegisterSimple('lscpu', {
    description: 'Display virtual CPU information.',
    usage: 'lscpu',
    category: 2,
    executor: () => {
      const r = new Result();
      r.addLine(`Architecture:                         ${state.cpu.architecture}`);
      r.addLine(`CPU(s):                               ${state.cpu.cpuCount}`);
      r.addLine(`Thread(s) per core:                   ${state.cpu.threadsPerCore}`);
      r.addLine(`Core(s) per socket:                   ${state.cpu.coresPerSocket}`);
      r.addLine(`Socket(s):                            1`);
      r.addLine(`Vendor ID:                            ${state.cpu.vendor}`);
      r.addLine(`Model name:                           ${state.cpu.model}`);
      r.addLine(`CPU MHz min:                          ${state.cpu.minMHz}`);
      r.addLine(`CPU MHz max:                          ${state.cpu.maxMHz}`);
      r.addLine(`Flags:                                ${state.cpu.flags.join(' ')}`);
      return r;
    }
  });
  linuxRegisterSimple('lsmem', {
    description: 'Display virtual memory information.',
    usage: 'lsmem',
    category: 2,
    executor: () => {
      const total = state.memory.totalMB * 1024 * 1024;
      const r = new Result();
      r.addLine('RANGE                                  SIZE  STATE REMOVABLE BLOCK');
      r.addLine(`0x0000000000000000-${(total - 1).toString(16).padStart(16, '0')}  ${fs.humanSize(total).padStart(8)} online       no      1`);
      r.addLine('Memory block size:                     128M');
      r.addLine(`Total online memory:                  ${fs.humanSize(total)}`);
      r.addLine('Total offline memory:                   0B');
      return r;
    }
  });
  linuxRegisterSimple('lsns', {
    description: 'Display virtual Linux namespaces.',
    usage: 'lsns',
    category: 2,
    executor: () => {
      const r = new Result();
      r.addLine('NS TYPE   NPROCS PID USER COMMAND');
      for (const ns of state.namespaces) r.addLine(`${String(ns.id).padStart(11)} ${ns.ns.padEnd(6)} 1 ${String(ns.pid).padEnd(5)} ${currentUser().padEnd(5)} munitos`);
      return r;
    }
  });
  linuxRegisterSimple('lsusb', {
    description: 'Display virtual USB devices.',
    usage: 'lsusb',
    category: 2,
    executor: () => {
      const r = new Result();
      for (const d of state.usbDevices) r.addLine(`Bus ${String(d.bus).padStart(3, '0')} Device ${String(d.device).padStart(3, '0')}: ID ${d.vendorId}:${d.productId} ${d.manufacturer} ${d.product}`);
      return r;
    }
  });
  linuxRegisterSimple('mapfile', {
    description: 'Read values into a virtual shell array.',
    usage: 'mapfile [-t] ARRAY [VALUE ...]',
    category: 2,
    executor: ({ args }) => {
      const trim = args.includes('-t');
      const values = args.filter(v => v !== '-t');
      const name = values.shift();
      if (!name) return new Result().failure('mapfile: array name is required');
      state.variables.set(name, values.map(v => trim ? v : `${v}\n`));
      return new Result().addChange(`Array ${name} set`);
    }
  });
  linuxRegisterSimple('mount', {
    description: 'Manage virtual filesystem mounts.',
    usage: 'mount [SOURCE TARGET]',
    category: 2,
    mutatesMounts: true,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const m of state.mounts.values()) r.addLine(`${m.source} on ${m.target} type ${m.filesystem} (${m.options.join(',')})`);
        return r;
      }
      if (args.length === 1) {
        const target = fs.normalize(args[0]);
        const mount = state.mounts.get(target);
        if (!mount) return r.failure(`mount: ${args[0]} is not mounted`);
        r.addLine(`${mount.source} on ${mount.target} type ${mount.filesystem} (${mount.options.join(',')})`);
        return r;
      }
      const [source, target, filesystem = 'ext4', options = 'rw'] = args;
      const normalized = fs.normalize(target);
      fs.mkdirp(normalized);
      state.mounts.set(normalized, { source, target: normalized, filesystem, options: options.split(',') });
      return r.addChange(`Mounted ${source} on ${normalized}`);
    }
  });
  linuxRegisterSimple('umount', {
    description: 'Unmount virtual filesystems.',
    usage: 'umount TARGET',
    category: 2,
    mutatesMounts: true,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: umount TARGET');
      const target = fs.normalize(args[0]);
      if (!state.mounts.has(target)) return new Result().failure(`umount: ${target}: not mounted.`);
      state.mounts.delete(target);
      return new Result().addChange(`Unmounted ${target}`);
    }
  });
  linuxRegisterSimple('renice', {
    description: 'Change virtual process scheduling priority.',
    usage: 'renice PRIORITY [-p] PID',
    category: 2,
    mutatesJobs: true,
    executor: ({ args }) => {
      const priority = parseInteger(args[0]);
      const pid = parseInteger(args.includes('-p') ? args[args.indexOf('-p') + 1] : args[1]);
      if (priority == null || pid == null) return new Result().failure('renice: invalid priority or process ID');
      const process = state.processes.get(pid);
      if (!process) return new Result().failure(`renice: ${pid}: No such process`);
      process.nice = priority;
      return new Result().addLine(`${priority} (process ID ${pid})`, 'accent');
    }
  });
  linuxRegisterSimple('setfacl', {
    description: 'Manage virtual POSIX ACL entries.',
    usage: 'setfacl -m RULE FILE',
    category: 2,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const i = args.indexOf('-m');
      if (i === -1 || !args[i + 1] || !args[i + 2]) return new Result().failure('Usage: setfacl -m RULE FILE');
      const node = fs.inspect(args[i + 2]);
      if (!node) return new Result().failure(`setfacl: ${args[i + 2]}: No such file or directory`);
      const match = args[i + 1].match(/^(user|group|mask|other):([^:]*):([rwx-]*)$/);
      if (!match) return new Result().failure(`setfacl: invalid ACL entry: ${args[i + 1]}`);
      const [, type, name, perm] = match;
      const targetPath = args[i + 2];
      try { fs.setAcl(targetPath, type === 'user' ? `user:${name}` : type === 'group' ? `group:${name}` : type, perm); } catch { return new Result().failure(`setfacl: cannot set ACL on '${targetPath}'`); }
      return new Result().addChange(`ACL updated for ${args[i + 2]}`);
    }
  });
  linuxRegisterSimple('setpriv', {
    description: 'Modify the virtual security context.',
    usage: 'setpriv [--reuid UID] [--regid GID] [--clear-groups]',
    category: 2,
    mutatesSecurity: true,
    executor: ({ args }) => {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--reuid' && args[i + 1] != null) {
          state.security.euid = parseInteger(args[++i]) ?? state.security.euid;
        } else if (arg === '--regid' && args[i + 1] != null) {
          state.security.egid = parseInteger(args[++i]) ?? state.security.egid;
        } else if (arg === '--clear-groups') {
          state.security.supplementaryGroups = [];
        } else if (arg === '--no-new-privs') {
          state.security.noNewPrivs = true;
        }
      }
      return new Result().addLine(`uid=${state.security.euid} gid=${state.security.egid} groups=${state.security.supplementaryGroups.join(',')}`);
    }
  });
  linuxRegisterSimple('setsid', {
    description: 'Create a virtual session.',
    usage: 'setsid COMMAND [ARG...]',
    category: 2,
    async executor({ args, api }) {
      if (!args.length) return new Result().failure('Usage: setsid COMMAND [ARG...]');
      const pid = state.nextPid++;
      state.sessions.set(pid, { sid: pid, leaderPid: pid, controllingTTY: null });
      return await linuxExecute(args[0], args.slice(1), api);
    }
  });
  linuxRegisterSimple('stty', {
    description: 'Manage virtual terminal attributes.',
    usage: 'stty [-a|size|echo|-echo]',
    category: 2,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        r.addLine(`speed 38400 baud; rows ${state.tty.rows}; columns ${state.tty.columns}; ${state.tty.echo ? 'echo' : '-echo'} ${state.tty.canonical ? 'icanon' : '-icanon'} ${state.tty.signal ? 'isig' : '-isig'} ${state.tty.opost ? 'opost' : '-opost'}`);
        return r;
      }
      if (args.includes('-a')) {
        r.addLine(`speed 38400 baud; rows ${state.tty.rows}; columns ${state.tty.columns}; line = 0;`);
        r.addLine(`${state.tty.echo ? 'echo' : '-echo'} ${state.tty.canonical ? 'icanon' : '-icanon'} ${state.tty.signal ? 'isig' : '-isig'} ${state.tty.opost ? 'opost' : '-opost'}`);
        return r;
      }
      if (args[0] === 'size') {
        r.addLine(`${state.tty.rows} ${state.tty.columns}`);
        return r;
      }
      for (const arg of args) {
        if (arg === 'echo') state.tty.echo = true;
        if (arg === '-echo') state.tty.echo = false;
        if (arg === 'icanon') state.tty.canonical = true;
        if (arg === '-icanon') state.tty.canonical = false;
        if (arg === 'isig') state.tty.signal = true;
        if (arg === '-isig') state.tty.signal = false;
        if (arg === 'opost') state.tty.opost = true;
        if (arg === '-opost') state.tty.opost = false;
      }
      return r;
    }
  });
  linuxRegisterSimple('times', {
    description: 'Display virtual shell CPU times.',
    usage: 'times',
    category: 2,
    executor: () => {
      const r = new Result();
      r.addLine(`${state.clock.user}m00.00 ${state.clock.system}m00.00`);
      r.addLine(`${state.clock.childUser}m00.00 ${state.clock.childSystem}m00.00`);
      return r;
    }
  });
  linuxRegisterSimple('umask', {
    description: 'Display or change the virtual shell file-creation mask.',
    usage: 'umask [-S] [MODE]',
    category: 2,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        r.addLine(state.umask);
        return r;
      }
      if (args[0] === '-S') {
        r.addLine(`u=${state.umask[1] === '7' ? 'rwx' : state.umask[1] === '6' ? 'rw-' : state.umask[1] === '5' ? 'r-x' : state.umask[1] === '4' ? 'r--' : '---'},g=${state.umask[2] === '7' ? 'rwx' : state.umask[2] === '6' ? 'rw-' : state.umask[2] === '5' ? 'r-x' : state.umask[2] === '4' ? 'r--' : '---'},o=${state.umask[3] === '7' ? 'rwx' : state.umask[3] === '6' ? 'rw-' : state.umask[3] === '5' ? 'r-x' : state.umask[3] === '4' ? 'r--' : '---'}`);
        return r;
      }
      if (!/^[0-7]{1,4}$/.test(args[0])) return r.failure(`umask: invalid octal number: ${args[0]}`);
      state.umask = args[0].padStart(4, '0');
      return r.addChange(`umask set to ${state.umask}`);
    }
  });
  linuxRegisterSimple('watch', {
    description: 'Repeatedly execute a MUNITOS command.',
    usage: 'watch [-n SEC] [-c COUNT] COMMAND [ARG...]',
    category: 2,
    async executor({ args, api, ctx }) {
      let interval = 2;
      let count = 1;
      let index = 0;
      if (args[index] === '-n' && args[index + 1]) {
        interval = Number(args[index + 1]);
        index += 2;
      }
      if (args[index] === '-c' && args[index + 1]) {
        count = parseInteger(args[index + 1]) || 1;
        index += 2;
      }
      if (!args[index]) return new Result().failure('Usage: watch [-n SEC] [-c COUNT] COMMAND [ARG...]');
      const r = new Result();
      for (let i = 0; i < count; i++) {
        if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
        if (i > 0) await fs.sleep(interval * 1000, api);
        if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
        r.addLine(`Every ${interval}s: ${args[index]} ${args.slice(index + 1).join(' ')}`, 'accent');
        const result = await linuxExecute(args[index], args.slice(index + 1), api, ctx);
        if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
        if (result instanceof Result) for (const l of result.stdout) r.addLine(l.text, l.cls);
      }
      return r;
    }
  });
  linuxRegisterSimple('alias', {
    description: 'Manage shell aliases.',
    usage: 'alias [NAME[=VALUE] ...]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const [k, v] of Array.from(state.aliases.entries()).sort(([a], [b]) => a.localeCompare(b))) r.addLine(`alias ${k}='${String(v).replaceAll("'", "'\\''")}'`);
        return r;
      }
      for (const item of args) {
        const m = item.match(/^([A-Za-z_][A-Za-z0-9_-]*)=(.*)$/);
        if (!m) {
          if (!state.aliases.has(item)) {
            r.addError(`alias: ${item}: not found`);
            continue;
          }
          r.addLine(`alias ${item}='${state.aliases.get(item)}'`);
          continue;
        }
        state.aliases.set(m[1], m[2].replace(/^['"]|['"]$/g, ''));
        r.addChange(`Alias ${m[1]} set`);
      }
      return r;
    }
  });
  linuxRegisterSimple('apropos', {
    description: 'Search the local command description database.',
    usage: 'apropos KEYWORD',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: apropos KEYWORD');
      const key = args.join(' ').toLowerCase();
      const r = new Result();
      for (const c of Array.from(linuxRegistry.values()).filter(c => !c.isAlias && `${c.name} ${c.description}`.toLowerCase().includes(key))) r.addLine(`${c.name} - ${c.description}`);
      return r;
    }
  });
  linuxRegisterSimple('arch', {
    description: 'Display the virtual architecture.',
    usage: 'arch',
    category: 3,
    executor: () => new Result().addLine(state.cpu.architecture)
  });
  linuxRegisterSimple('basename', {
    description: 'Strip directory and optional suffix from a pathname.',
    usage: 'basename NAME [SUFFIX]',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: basename NAME [SUFFIX]');
      const value = String(args[0]).replace(/\/+$/, '').split('/').filter(Boolean).at(-1) || '/';
      const suffix = args[1] ?? '';
      return new Result().addLine(suffix && value.endsWith(suffix) && value !== suffix ? value.slice(0, -suffix.length) : value);
    }
  });
  linuxRegisterSimple('cat', {
    description: 'Concatenate virtual files.',
    usage: 'cat FILE...',
    aliases: ['readfile'],
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: cat FILE...');
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`cat: ${path}: No such file or directory`);
          continue;
        }
        for (const v of fs.lines(node)) r.addLine(v);
      }
      return r;
    }
  });
  linuxRegisterSimple('cd', {
    description: 'Change the virtual working directory.',
    usage: 'cd [DIRECTORY]',
    category: 3,
    executor: ({ args }) => {
      const target = args[0] === '-' ? state.previousDirectory : (args[0] || currentUserRecord()?.home || '/home/munitos');
      const path = fs.normalize(target);
      const node = fs.inspect(path);
      if (!node || node.kind !== 'dir') return new Result().failure(`bash: cd: ${target}: No such directory`);
      state.previousDirectory = state.cwd;
      state.cwd = path;
      state.variables.set('PWD', path);
      state.variables.set('OLDPWD', state.previousDirectory);
      return new Result().success('directory changed').addChange(`cwd: ${state.cwd}`);
    }
  });
  linuxRegisterSimple('chfn', {
    description: 'Change virtual user information.',
    usage: 'chfn [OPTION] [USER]',
    category: 3,
    mutatesUsers: true,
    executor: ({ args }) => {
      const username = args.at(-1) && state.users.has(args.at(-1)) ? args.at(-1) : currentUser();
      const user = state.users.get(username);
      if (!user) return new Result().failure(`chfn: user '${username}' does not exist`);
      const i = args.findIndex(v => v === '-f' || v === '--full-name');
      if (i !== -1 && args[i + 1]) {
        user.gecos = args[i + 1];
        return new Result().addChange(`Full name updated for ${username}`);
      }
      return new Result().addLine(`Full Name: ${user.gecos}`);
    }
  });
  linuxRegisterSimple('chgrp', {
    description: 'Change virtual group ownership.',
    usage: 'chgrp GROUP FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: chgrp GROUP FILE...');
      const group = state.groups.get(args[0]);
      if (!group) return new Result().failure(`chgrp: invalid group: '${args[0]}'`);
      for (const path of args.slice(1)) {
        const node = fs.inspect(path);
        if (!node) return new Result().failure(`chgrp: cannot access '${path}': No such file or directory`);
        fs.chown(node.path, undefined, group.gid);
      }
      return new Result().addChange(`Group changed for ${args.slice(1).join(', ')}`);
    }
  });
  linuxRegisterSimple('chmod', {
    description: 'Change virtual file permissions.',
    usage: 'chmod MODE FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: chmod MODE FILE...');
      for (const path of args.slice(1)) {
        const node = fs.inspect(path);
        if (!node) return new Result().failure(`chmod: cannot access '${path}': No such file or directory`);
        try {
          fs.chmod(node.path, args[0]);
        } catch {
          return new Result().failure(`chmod: invalid mode: '${args[0]}'`);
        }
      }
      return new Result().addChange(`Permissions changed for ${args.slice(1).join(', ')}`);
    }
  });
  linuxRegisterSimple('chown', {
    description: 'Change virtual file ownership.',
    usage: 'chown OWNER[:GROUP] FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: chown OWNER[:GROUP] FILE...');
      const [ownerName, groupName] = args[0].split(':');
      const owner = state.users.get(ownerName) || Array.from(state.users.values()).find(u => String(u.uid) === ownerName);
      if (!owner) return new Result().failure(`chown: invalid user: '${ownerName}'`);
      const group = groupName ? (state.groups.get(groupName) || Array.from(state.groups.values()).find(g => String(g.gid) === groupName)) : null;
      if (groupName && !group) return new Result().failure(`chown: invalid group: '${groupName}'`);
      for (const path of args.slice(1)) {
        const node = fs.inspect(path);
        if (!node) return new Result().failure(`chown: cannot access '${path}': No such file or directory`);
        fs.chown(node.path, owner.uid, group ? group.gid : undefined);
      }
      return new Result().addChange(`Ownership changed for ${args.slice(1).join(', ')}`);
    }
  });
  linuxRegisterSimple('cksum', {
    description: 'Calculate CRC checksum and byte count.',
    usage: 'cksum FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`cksum: ${path}: No such file or directory`);
          continue;
        }
        const data = fs.content(node);
        r.addLine(`${fs.crc32(data)} ${fs.byteLength(data)} ${path}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('clear', {
    description: 'Clear the MUNITOS transcript.',
    usage: 'clear',
    aliases: ['cls'],
    category: 3,
    executor: () => {
      clearTranscript();
      return new Result();
    }
  });
  linuxRegisterSimple('cmp', {
    description: 'Compare two virtual files byte by byte.',
    usage: 'cmp FILE1 FILE2',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: cmp FILE1 FILE2');
      const a = fs.inspect(args[0]);
      const b = fs.inspect(args[1]);
      if (!a || !b) return new Result().failure('cmp: No such file or directory');
      const aa = fs.bytes(fs.content(a));
      const bb = fs.bytes(fs.content(b));
      for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
        if (aa[i] !== bb[i]) return new Result().addLine(`${args[0]} ${args[1]} differ: byte ${i + 1}`);
      }
      return new Result().success('files identical');
    }
  });
  linuxRegisterSimple('comm', {
    description: 'Compare two sorted virtual files.',
    usage: 'comm FILE1 FILE2',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: comm FILE1 FILE2');
      const a = fs.lines(fs.inspect(args[0])).filter(Boolean);
      const b = fs.lines(fs.inspect(args[1])).filter(Boolean);
      const all = Array.from(new Set([...a, ...b])).sort();
      const r = new Result();
      for (const v of all) r.addLine(a.includes(v) && b.includes(v) ? `\t\t${v}` : a.includes(v) ? v : `\t${v}`);
      return r;
    }
  });
  linuxRegisterSimple('command', {
    description: 'Inspect command resolution.',
    usage: 'command [-v] NAME...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const name of args) {
        const c = linuxResolveCommand(name);
        if (c) r.addLine(`${name}: ${c.capability || 'command'}`);
        else r.addLine(`command: ${name}: not found`, 'danger');
      }
      return r;
    }
  });
  linuxRegisterSimple('continue', {
    description: 'Continue a virtual shell flow.',
    usage: 'continue [N]',
    category: 3,
    executor: ({ args }) => new Result().addLine(`continue: returned control to the current flow${args[0] ? ` at level ${args[0]}` : ''}.`, 'muted')
  });
  linuxRegisterSimple('cp', {
    description: 'Copy virtual files and directories.',
    usage: 'cp [-r] SOURCE... DEST',
    aliases: ['copy'],
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const recursive = args.includes('-r') || args.includes('-R');
      const values = args.filter(v => v !== '-r' && v !== '-R');
      if (values.length < 2) return new Result().failure('Usage: cp [-r] SOURCE... DEST');
      const destNode = fs.inspect(values.at(-1));
      const destination = values.at(-1);
      for (const sourcePath of values.slice(0, -1)) {
        const source = fs.inspect(sourcePath);
        if (!source) return new Result().failure(`cp: cannot stat '${sourcePath}': No such file or directory`);
        if (source.kind === 'dir' && !recursive) return new Result().failure(`cp: -r not specified; omitting directory '${sourcePath}'`);
        fs.copy(source, destNode?.kind === 'dir' ? `${destination}/${source.name}` : destination);
      }
      return new Result().addChange(`Copied to ${destination}`);
    }
  });
  linuxRegisterSimple('cpio', {
    description: 'Create or extract basic virtual cpio archives.',
    usage: 'cpio -o | cpio -i',
    category: 3,
    status: CMD_STATUS.PARTIAL,
    executor: ({ args }) => {
      if (args.includes('-o')) return new Result().addLine('cpio: archive creation through native stream mode is unavailable in the package bridge.', 'muted');
      if (args.includes('-i')) return new Result().addLine('cpio: archive extraction through native stream mode is unavailable in the package bridge.', 'muted');
      return new Result().failure('Usage: cpio -o > ARCHIVE or cpio -i < ARCHIVE');
    }
  });
  linuxRegisterSimple('cut', {
    description: 'Extract selected fields from virtual text.',
    usage: 'cut -d DELIM -f LIST FILE...',
    category: 3,
    executor: ({ args }) => {
      const d = args.includes('-d') ? args[args.indexOf('-d') + 1] : '\t';
      const f = (args.includes('-f') ? args[args.indexOf('-f') + 1] : '1').split(',').map(v => Number(v) - 1);
      const files = args.filter((v, i) => !v.startsWith('-') && v !== d && i !== (args.indexOf('-d') + 1) && i !== (args.indexOf('-f') + 1));
      if (!files.length) return new Result().failure('Usage: cut -d DELIM -f LIST FILE...');
      const r = new Result();
      for (const path of files) for (const v of fs.lines(fs.inspect(path))) r.addLine(f.map(i => v.split(d)[i] ?? '').join(d));
      return r;
    }
  });
  linuxRegisterSimple('date', {
    description: 'Display the virtual system date and time.',
    usage: 'date [+FORMAT]',
    category: 3,
    executor: ({ args }) => {
      const now = new Date();
      if (args[0]?.startsWith('+')) {
        let fmt = args[0].slice(1);
        fmt = fmt.replaceAll('%Y', String(now.getFullYear())).replaceAll('%m', String(now.getMonth() + 1).padStart(2, '0')).replaceAll('%d', String(now.getDate()).padStart(2, '0')).replaceAll('%H', String(now.getHours()).padStart(2, '0')).replaceAll('%M', String(now.getMinutes()).padStart(2, '0')).replaceAll('%S', String(now.getSeconds()).padStart(2, '0')).replaceAll('%s', String(Math.floor(now.getTime() / 1000)));
        return new Result().addLine(fmt);
      }
      return new Result().addLine(now.toString());
    }
  });
  linuxRegisterSimple('dd', {
    description: 'Copy and transform virtual data.',
    usage: 'dd if=FILE of=FILE [bs=N] [count=N]',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const values = {};
      for (const arg of args) {
        const i = arg.indexOf('=');
        if (i > 0) values[arg.slice(0, i)] = arg.slice(i + 1);
      }
      if (!values.if || !values.of) return new Result().failure('dd: missing if= or of= operand');
      const source = values.if === '/dev/zero' ? new Uint8Array((parseInteger(values.bs) || 512) * (parseInteger(values.count) || 1)) : fs.bytes(fs.content(fs.inspect(values.if)));
      const bs = parseInteger(values.bs) || 512;
      const count = parseInteger(values.count) || 1;
      const skip = (parseInteger(values.skip) || 0) * bs;
      const selected = source.slice(skip, skip + bs * count);
      const existing = fs.inspect(values.of);
      fs.create(values.of, selected, { replace: true, mode: existing?.mode || 0o644 });
      const r = new Result();
      r.addLine(`${Math.ceil(selected.length / bs)}+0 records in`);
      r.addLine(`${Math.ceil(selected.length / bs)}+0 records out`);
      r.addLine(`${selected.length} bytes copied`);
      return r;
    }
  });
  linuxRegisterSimple('declare', {
    description: 'Declare or display virtual shell variables.',
    usage: 'declare [NAME[=VALUE] ...]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const [k, v] of Array.from(state.variables.entries()).sort(([a], [b]) => a.localeCompare(b))) r.addLine(`declare ${state.exported.has(k) ? '-x ' : ''}${state.readonly.has(k) ? '-r ' : ''}${k}=${String(v)}`);
        return r;
      }
      for (const item of args.filter(v => !v.startsWith('-'))) {
        const i = item.indexOf('=');
        const key = i > 0 ? item.slice(0, i) : item;
        const value = i > 0 ? item.slice(i + 1) : state.variables.get(key) ?? '';
        if (state.readonly.has(key)) return r.failure(`bash: ${key}: readonly variable`);
        state.variables.set(key, value);
      }
      return r.addChange('Variables updated');
    }
  });
  linuxRegisterSimple('df', {
    description: 'Display virtual filesystem usage.',
    usage: 'df [-h] [PATH]',
    category: 3,
    executor: ({ args }) => {
      const total = 64 * 1024 * 1024;
      const used = fs.size('/') + 8 * 1024 * 1024;
      const free = Math.max(0, total - used);
      const human = args.includes('-h');
      const r = new Result();
      r.addLine('Filesystem     1024-blocks      Used Available Use% Mounted on');
      r.addLine(`virtual-root   ${(human ? '64M' : total).toString().padStart(12)} ${(human ? fs.humanSize(used) : used).toString().padStart(8)} ${(human ? fs.humanSize(free) : free).toString().padStart(9)} ${Math.floor(used / total * 100).toString().padStart(3)}% /`);
      return r;
    }
  });
  linuxRegisterSimple('diff', {
    description: 'Compare two virtual text files.',
    usage: 'diff FILE1 FILE2',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: diff FILE1 FILE2');
      const a = fs.lines(fs.inspect(args[0]));
      const b = fs.lines(fs.inspect(args[1]));
      const r = new Result();
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] === b[i]) continue;
        if (a[i] != null) r.addLine(`< ${a[i]}`);
        if (b[i] != null) r.addLine(`> ${b[i]}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('diff3', {
    description: 'Compare three virtual text files.',
    usage: 'diff3 FILE1 FILE2 FILE3',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 3) return new Result().failure('Usage: diff3 FILE1 FILE2 FILE3');
      const files = args.slice(0, 3).map(fs.inspect);
      if (files.some(v => !v)) return new Result().failure('diff3: No such file or directory');
      const rows = files.map(fs.lines);
      const r = new Result();
      for (let i = 0; i < Math.max(...rows.map(r => r.length)); i++) {
        const vals = rows.map(r => r[i] ?? '');
        if (vals.every(v => v === vals[0])) continue;
        r.addLine(`<<<<<<< ${args[0]}`);
        r.addLine(vals[0]);
        r.addLine('|||||||');
        r.addLine(vals[1]);
        r.addLine('=======');
        r.addLine(vals[2]);
        r.addLine(`>>>>>>> ${args[2]}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('dir', {
    description: 'List virtual directory contents.',
    usage: 'dir [OPTION]... [FILE]...',
    category: 3,
    async executor({ args, api }) {
      return linuxExecute('ls', ['-l', ...args], api);
    }
  });
  linuxRegisterSimple('dirname', {
    description: 'Strip the final component from a pathname.',
    usage: 'dirname NAME',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: dirname NAME');
      const path = String(args[0]).replace(/\/+$/, '') || '/';
      const i = path.lastIndexOf('/');
      return new Result().addLine(i <= 0 ? '/' : path.slice(0, i));
    }
  });
  linuxRegisterSimple('dirs', {
    description: 'Display the virtual directory stack.',
    usage: 'dirs',
    category: 3,
    executor: () => new Result().addLine(state.cwd)
  });
  linuxRegisterSimple('du', {
    description: 'Estimate virtual filesystem usage.',
    usage: 'du [-h] [PATH]',
    category: 3,
    executor: ({ args }) => {
      const targets = args.filter(v => !v.startsWith('-'));
      const human = args.includes('-h');
      const list = targets.length ? targets : [state.cwd];
      const r = new Result();
      for (const path of list) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`du: cannot access '${path}'`);
          continue;
        }
        const size = fs.size(node);
        r.addLine(`${human ? fs.humanSize(size) : Math.ceil(size / 1024)}\t${path}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('echo', {
    description: 'Write arguments to standard output.',
    usage: 'echo [-neE] [ARG ...]',
    category: 3,
    executor: ({ args }) => {
      let newline = true;
      let interpret = false;
      let index = 0;
      while (index < args.length && /^-neE+$/.test(args[index])) {
        if (args[index].includes('n')) newline = false;
        if (args[index].includes('e')) interpret = true;
        if (args[index].includes('E')) interpret = false;
        index++;
      }
      let text = args.slice(index).join(' ');
      if (interpret) text = text.replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\r', '\r').replaceAll('\\\\', '\\');
      return new Result().addLine(text);
    }
  });
  linuxRegisterSimple('enable', {
    description: 'Display package-provided builtin-style commands.',
    usage: 'enable [-a]',
    category: 3,
    executor: ({ args }) => {
      const builtins = Array.from(linuxRegistry.values()).filter(c => !c.isAlias && c.category === 3).map(c => c.name);
      const r = new Result();
      if (args.includes('-a')) {
        for (const name of builtins) r.addLine(`${name} enabled`);
        return r;
      }
      r.addLine(builtins.join(' '));
      return r;
    }
  });
  linuxRegisterSimple('env', {
    description: 'Display the virtual exported environment.',
    usage: 'env [NAME=VALUE ...] [COMMAND]',
    category: 3,
    async executor({ args, api }) {
      const rest = [];
      for (const arg of args) {
        const i = arg.indexOf('=');
        if (i > 0) {
          const key = arg.slice(0, i);
          const value = arg.slice(i + 1);
          state.variables.set(key, value);
          state.exported.add(key);
        } else {
          rest.push(arg);
        }
      }
      if (rest.length) return linuxExecute(rest[0], rest.slice(1), api);
      const r = new Result();
      for (const k of Array.from(state.exported).sort()) r.addLine(`${k}=${state.variables.get(k) ?? ''}`);
      return r;
    }
  });
  linuxRegisterSimple('export', {
    description: 'Export virtual shell variables.',
    usage: 'export NAME[=VALUE] ...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const k of Array.from(state.exported).sort()) r.addLine(`declare -x ${k}="${String(state.variables.get(k) ?? '')}"`);
        return r;
      }
      for (const item of args) {
        const i = item.indexOf('=');
        if (i > 0) {
          const key = item.slice(0, i);
          if (state.readonly.has(key)) return r.failure(`bash: ${key}: readonly variable`);
          state.variables.set(key, item.slice(i + 1));
          state.exported.add(key);
        } else {
          state.exported.add(item);
        }
      }
      return r.addChange('Variables exported');
    }
  });
  linuxRegisterSimple('false', {
    description: 'Return a failure status.',
    usage: 'false',
    category: 3,
    status: CMD_STATUS.FULL,
    executor: () => new Result().failure('false').setDiagnostic('command completed with failure status (exitCode=1)')
  });
  linuxRegisterSimple('file', {
    description: 'Determine virtual file types.',
    usage: 'file FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`file: ${path}: cannot open`);
          continue;
        }
        const type = node.kind === 'dir' ? 'directory' : node.kind === 'symlink' ? `symbolic link to ${node.target}` : node.kind === 'fifo' ? 'fifo' : 'ASCII text';
        r.addLine(`${path}: ${type}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('find', {
    description: 'Search the virtual filesystem hierarchy.',
    usage: 'find [PATH] [FILTER]',
    category: 3,
    executor: ({ args }) => {
      let start = state.cwd;
      let index = 0;
      if (args[0] && !args[0].startsWith('-')) {
        start = args[0];
        index = 1;
      }
      const root = fs.inspect(start);
      if (!root) return new Result().failure(`find: '${start}': No such file or directory`);
      let out = fs.walk(start).map(item => ({ node: item.node, path: item.path }));
      for (; index < args.length; index++) {
        const filter = args[index];
        if (filter === '-name' && args[index + 1]) {
          const pattern = args[++index].replaceAll('.', '\\.').replaceAll('*', '.*').replaceAll('?', '.');
          const re = new RegExp(`^${pattern}$`);
          for (let i = out.length - 1; i >= 0; i--) if (!re.test(out[i].node.name)) out.splice(i, 1);
        } else if (filter === '-type' && args[index + 1]) {
          const type = args[++index];
          const kind = type === 'd' ? 'dir' : type === 'l' ? 'symlink' : type === 'p' ? 'fifo' : 'file';
          for (let i = out.length - 1; i >= 0; i--) if (out[i].node.kind !== kind) out.splice(i, 1);
        } else if (filter === '-maxdepth' && args[index + 1]) {
          const depth = parseInteger(args[++index]) ?? 0;
          for (let i = out.length - 1; i >= 0; i--) if (out[i].path.split('/').filter(Boolean).length > depth) out.splice(i, 1);
        } else if (filter === '-empty') {
          for (let i = out.length - 1; i >= 0; i--) { try { if (!fs.isEmpty(out[i].path)) out.splice(i, 1); } catch { out.splice(i, 1); } }
        }
      }
      const r = new Result();
      for (const v of out) r.addLine(v.path);
      return r;
    }
  });
  linuxRegisterSimple('flock', {
    description: 'Create a virtual cooperative lock.',
    usage: 'flock FILE COMMAND [ARG...]',
    category: 3,
    async executor({ args, api }) {
      if (args.length < 2) return new Result().failure('Usage: flock FILE COMMAND [ARG...]');
      const key = fs.normalize(args[0]);
      const locks = state.variables.get('__FLOCKS') || new Set();
      if (locks.has(key)) return new Result().failure('flock: Resource temporarily unavailable');
      locks.add(key);
      state.variables.set('__FLOCKS', locks);
      try {
        return await linuxExecute(args[1], args.slice(2), api);
      } finally {
        locks.delete(key);
      }
    }
  });
  linuxRegisterSimple('fold', {
    description: 'Wrap text at a specified width.',
    usage: 'fold [-w WIDTH] FILE...',
    category: 3,
    executor: ({ args }) => {
      const wi = args.indexOf('-w');
      const width = wi !== -1 ? parseInteger(args[wi + 1]) || 80 : 80;
      const files = args.filter((v, i) => !v.startsWith('-') && i !== wi + 1);
      const r = new Result();
      for (const path of files) for (const value of fs.lines(fs.inspect(path))) {
        if (!value) {
          r.addLine('');
          continue;
        }
        for (let i = 0; i < value.length; i += width) r.addLine(value.slice(i, i + width));
      }
      return r;
    }
  });
  linuxRegisterSimple('fmt', {
    description: 'Format virtual text.',
    usage: 'fmt FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args.filter(v => !v.startsWith('-'))) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`fmt: ${path}: No such file or directory`);
          continue;
        }
        const words = fs.fromBytes(fs.content(node)).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        let current = '';
        for (const word of words) {
          if (current && current.length + 1 + word.length > 75) {
            r.addLine(current);
            current = word;
          } else {
            current = current ? `${current} ${word}` : word;
          }
        }
        if (current) r.addLine(current);
      }
      return r;
    }
  });
  linuxRegisterSimple('free', {
    description: 'Display virtual memory usage.',
    usage: 'free [-h]',
    category: 3,
    executor: ({ args }) => {
      const total = state.memory.totalMB * 1024 * 1024;
      const used = Math.min(total, fs.size('/') + 128 * 1024 * 1024);
      const free = Math.max(0, total - used);
      const human = args.includes('-h');
      const f = v => human ? fs.humanSize(v) : Math.floor(v / 1024);
      const r = new Result();
      r.addLine('               total        used        free      shared  buff/cache   available');
      r.addLine(`Mem:        ${String(f(total)).padStart(10)} ${String(f(used)).padStart(10)} ${String(f(free)).padStart(10)} ${String(f(8 * 1024 * 1024)).padStart(10)} ${String(f(16 * 1024 * 1024)).padStart(10)} ${String(f(free)).padStart(10)}`);
      r.addLine(`Swap:       ${String(f(4 * 1024 * 1024 * 1024)).padStart(10)} ${String(f(0)).padStart(10)} ${String(f(4 * 1024 * 1024 * 1024)).padStart(10)}`);
      return r;
    }
  });
  linuxRegisterSimple('getconf', {
    description: 'Display virtual POSIX configuration values.',
    usage: 'getconf VARIABLE',
    category: 3,
    executor: ({ args }) => {
      const map = {
        PATH_MAX: 4096,
        NAME_MAX: 255,
        ARG_MAX: 2097152,
        PAGE_SIZE: 4096,
        _NPROCESSORS_ONLN: state.cpu.cpuCount,
        _NPROCESSORS_CONF: state.cpu.cpuCount,
        CLK_TCK: 100,
        LONG_BIT: 64,
        LOGIN_NAME_MAX: 256
      };
      if (!args.length) return new Result().failure('Usage: getconf VARIABLE');
      return map[args[0]] == null ? new Result().failure(`getconf: Unrecognized variable '${args[0]}'`) : new Result().addLine(String(map[args[0]]));
    }
  });
  linuxRegisterSimple('getent', {
    description: 'Query the local virtual NSS-style databases.',
    usage: 'getent DATABASE [KEY]',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: getent DATABASE [KEY]');
      const db = args[0];
      const key = args[1];
      const r = new Result();
      if (db === 'passwd') {
        const rows = key ? [state.users.get(key)].filter(Boolean) : Array.from(state.users.values());
        for (const u of rows) r.addLine(`${u.username}:x:${u.uid}:${u.gid}:${u.gecos}:${u.home}:${u.shell}`);
      } else if (db === 'group') {
        const rows = key ? [state.groups.get(key)].filter(Boolean) : Array.from(state.groups.values());
        for (const g of rows) r.addLine(`${g.name}:x:${g.gid}:${g.members.join(',')}`);
      } else if (db === 'hosts') {
        const hosts = [['127.0.0.1', 'localhost'], ['::1', 'localhost ip6-localhost'], ['127.0.1.1', 'MUNITOS']];
        for (const v of hosts.filter(v => !key || v[1].split(/\s+/).includes(key))) r.addLine(`${v[0]} ${v[1]}`);
      } else if (db === 'services') {
        const services = [['ssh', '22/tcp'], ['http', '80/tcp'], ['https', '443/tcp'], ['domain', '53/udp']];
        for (const v of services.filter(v => !key || v[0] === key)) r.addLine(`${v[0]} ${v[1]}`);
      } else {
        r.addError(`getent: Name Service Switch database '${db}' is not available`);
      }
      return r;
    }
  });
  linuxRegisterSimple('getopt', {
    description: 'Parse simple command-line options.',
    usage: 'getopt OPTSTRING PARAMETERS',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: getopt OPTSTRING PARAMETERS');
      const optString = args[0];
      const params = args.slice(1);
      const out = [];
      for (let i = 0; i < params.length; i++) {
        const arg = params[i];
        if (arg === '--') {
          out.push('--', ...params.slice(i + 1));
          break;
        }
        if (arg.startsWith('--')) {
          out.push(arg);
          continue;
        }
        if (arg.startsWith('-') && arg !== '-') {
          for (let j = 1; j < arg.length; j++) {
            const c = arg[j];
            const p = optString.indexOf(c);
            if (p === -1) return new Result().failure(`getopt: unrecognized option '--${c}'`);
            out.push(`-${c}`);
            if (optString[p + 1] === ':' && params[i + 1] != null) out.push(params[++i]);
          }
          continue;
        }
        out.push('--', arg, ...params.slice(i + 1));
        break;
      }
      return new Result().addLine(out.join(' '));
    }
  });
  linuxRegisterSimple('getopts', {
    description: 'Parse virtual shell positional options.',
    usage: 'getopts OPTSTRING NAME',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: getopts OPTSTRING NAME');
      const optString = args[0];
      const name = args[1];
      const idx = Number(state.variables.get('__GETOPTS_INDEX') || 1);
      const token = state.positional[idx - 1];
      if (!token) {
        state.variables.set(name, '?');
        return new Result();
      }
      const option = token.slice(1, 2);
      if (!token.startsWith('-') || token === '--' || !optString.includes(option)) {
        state.variables.set(name, '?');
        return new Result();
      }
      state.variables.set(name, option);
      state.variables.set('__GETOPTS_INDEX', idx + 1);
      return new Result();
    }
  });
  linuxRegisterSimple('grep', {
    description: 'Search virtual files with regular expressions.',
    usage: 'grep [OPTIONS] PATTERN [FILE...]',
    category: 3,
    executor: ({ args }) => {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) i++;
      const pattern = args[i++];
      if (!pattern) return new Result().failure('Usage: grep [OPTIONS] PATTERN [FILE...]');
      let re;
      try {
        re = new RegExp(pattern, args.includes('-i') ? 'i' : '');
      } catch {
        return new Result().failure(`grep: invalid regular expression: ${pattern}`);
      }
      const files = args.slice(i);
      if (!files.length) return new Result();
      const r = new Result();
      for (const path of files) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`grep: ${path}: No such file or directory`);
          continue;
        }
        fs.lines(node).forEach((v, n) => {
          if (re.test(v)) r.addLine(`${files.length > 1 ? `${path}:` : ''}${args.includes('-n') ? `${n + 1}:` : ''}${v}`);
          re.lastIndex = 0;
        });
      }
      return r;
    }
  });
  linuxRegisterSimple('groups', {
    description: 'Display virtual group memberships.',
    usage: 'groups [USER]',
    category: 3,
    executor: ({ args }) => {
      const username = args[0] || currentUser();
      const groups = Array.from(state.groups.values()).filter(g => g.members.includes(username) || state.users.get(username)?.gid === g.gid).map(g => g.name);
      return new Result().addLine(`${username} : ${groups.join(' ')}`);
    }
  });
  linuxRegisterSimple('gzip', {
    description: 'Compress virtual files with gzip.',
    usage: 'gzip FILE...',
    category: 3,
    mutatesFilesystem: true,
    async executor({ args }) {
      if (!args.length) return new Result().failure('Usage: gzip FILE...');
      if (typeof CompressionStream !== 'function') return new Result().failure('gzip: compression backend unavailable in this browser runtime');
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`gzip: ${path}: No such file or directory`);
          continue;
        }
        const stream = new Blob([fs.bytes(fs.content(node))]).stream().pipeThrough(new CompressionStream('gzip'));
        const data = new Uint8Array(await new Response(stream).arrayBuffer());
        fs.create(path.endsWith('.gz') ? path : `${path}.gz`, data, { replace: true, mode: node.mode, uid: node.uid, gid: node.gid });
        if (!path.endsWith('.gz')) fs.remove(path);
      }
      return r.addChange(`Compressed ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('gunzip', {
    description: 'Decompress virtual gzip files.',
    usage: 'gunzip FILE.gz...',
    category: 3,
    mutatesFilesystem: true,
    async executor({ args }) {
      if (typeof DecompressionStream !== 'function') return new Result().failure('gunzip: decompression backend unavailable in this browser runtime');
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`gunzip: ${path}: No such file or directory`);
          continue;
        }
        try {
          const stream = new Blob([fs.bytes(fs.content(node))]).stream().pipeThrough(new DecompressionStream('gzip'));
          const data = new Uint8Array(await new Response(stream).arrayBuffer());
          fs.create(path.endsWith('.gz') ? path.slice(0, -3) : `${path}.out`, data, { replace: true, mode: node.mode, uid: node.uid, gid: node.gid });
          fs.remove(path);
        } catch {
          r.addError(`gunzip: ${path}: invalid compressed data`);
        }
      }
      return r.addChange(`Decompressed ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('hash', {
    description: 'Inspect the virtual command hash table.',
    usage: 'hash [-r] [NAME...]',
    category: 3,
    executor: ({ args }) => {
      let cache = state.variables.get('__HASH');
      if (!(cache instanceof Map)) cache = new Map();
      if (args.includes('-r')) {
        cache.clear();
        state.variables.set('__HASH', cache);
        return new Result().addChange('Hash table cleared');
      }
      const names = args.filter(v => v !== '-r');
      if (!names.length) {
        const r = new Result();
        for (const [k, v] of cache.entries()) r.addLine(`${k}=${v}`);
        return r;
      }
      for (const name of names) if (linuxCommandExists(name)) cache.set(name, `/usr/bin/${name}`);
      state.variables.set('__HASH', cache);
      return new Result().addChange('Hash table updated');
    }
  });
  linuxRegisterSimple('head', {
    description: 'Display the beginning of virtual files.',
    usage: 'head [-n NUMBER] FILE...',
    category: 3,
    executor: ({ args }) => {
      let count = 10;
      let i = 0;
      if (args[i] === '-n' && args[i + 1]) {
        count = parseInteger(args[++i]) || 10;
        i++;
      }
      const files = args.slice(i);
      const r = new Result();
      for (const path of files) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`head: ${path}: No such file or directory`);
          continue;
        }
        if (files.length > 1) r.addLine(`==> ${path} <==`, 'accent');
        for (const v of fs.lines(node).slice(0, count)) r.addLine(v);
      }
      return r;
    }
  });
  linuxRegisterSimple('hostname', {
    description: 'Display or change the virtual hostname.',
    usage: 'hostname [NAME]',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const node = fs.inspect('/etc/hostname');
      if (!args.length) return new Result().addLine(fs.fromBytes(fs.content(node)).trim());
      if (!/^[A-Za-z0-9.-]+$/.test(args[0])) return new Result().failure('hostname: invalid hostname');
      fs.write(node, `${args[0]}\n`);
      return new Result().addChange(`Hostname changed to ${args[0]}`);
    }
  });
  linuxRegisterSimple('id', {
    description: 'Display virtual user and group identity.',
    usage: 'id [USER]',
    category: 3,
    executor: ({ args }) => {
      const u = state.users.get(args[0] || currentUser()) || Array.from(state.users.values()).find(v => String(v.uid) === String(args[0]));
      if (!u) return new Result().failure(`id: '${args[0]}': no such user`);
      const groups = Array.from(state.groups.values()).filter(g => g.members.includes(u.username) || g.gid === u.gid).map(g => `${g.gid}(${g.name})`).join(' ');
      return new Result().addLine(`uid=${u.uid}(${u.username}) gid=${u.gid}(${Array.from(state.groups.values()).find(g => g.gid === u.gid)?.name || u.username}) groups=${groups}`);
    }
  });
  linuxRegisterSimple('install', {
    description: 'Install a virtual file or directory.',
    usage: 'install SOURCE DEST',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: install SOURCE DEST');
      const source = fs.inspect(args[0]);
      if (!source) return new Result().failure(`install: cannot stat '${args[0]}'`);
      const dest = fs.inspect(args[1]);
      fs.copy(source, dest?.kind === 'dir' ? `${args[1]}/${source.name}` : args[1]);
      return new Result().addChange(`Installed to ${args[1]}`);
    }
  });
  linuxRegisterSimple('join', {
    description: 'Join two sorted virtual files on a field.',
    usage: 'join FILE1 FILE2',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: join FILE1 FILE2');
      const left = fs.lines(fs.inspect(args[0]));
      const right = fs.lines(fs.inspect(args[1]));
      const map = new Map();
      for (const row of right) {
        const p = row.split(/\s+/);
        const key = p.shift();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p.join(' '));
      }
      const r = new Result();
      for (const row of left) {
        const p = row.split(/\s+/);
        const key = p.shift();
        for (const suffix of map.get(key) || []) r.addLine(`${key} ${p.join(' ')} ${suffix}`.trim());
      }
      return r;
    }
  });
linuxRegisterSimple('kill', {
  description: 'Terminate virtual processes.',
  usage: 'kill [-SIGNAL] PID...',
  aliases: ['terminate', 'killproc', 'send-signal'],
  category: 3,
  mutatesJobs: true,
  executor: ({ args }) => {
    const pids =
      args
        .filter(
          value =>
            !value.startsWith('-')
        )
        .map(Number)
        .filter(Number.isInteger);
    if (!pids.length) {
      return new Result().failure(
        'Usage: kill [-SIGNAL] PID...'
      );
    }
    for (const pid of pids) {
      const process =
        state.processes.get(pid);
      if (!process) {
        return new Result().failure(
          `bash: kill: (${pid}) - No such process`
        );
      }
      const job =
        Array.from(
          state.jobs.values()
        ).find(
          item => item.pid === pid
        );
      if (job) {
        terminateJob(
          job,
          143,
          'TERMINATED'
        );
      } else {
        process.state = 'EXIT';
        process.exitCode = 143;
      }
    }
    return new Result().addChange(
      `Killed ${pids.length} process(es)`
    );
  }
});
linuxRegisterSimple('killall', {
  description: 'Stop all virtual jobs, operations and active flows.',
  usage: 'killall [NAME]',
  aliases: ['cancel', 'stop', 'terminate-all', 'stop-all', 'cancel-all'],
  category: 3,
  mutatesJobs: true,
  executor: ({ args }) => {
    const result =
      cancelAllOperations(
        args.join(' ') || 'killall'
      );
    return new Result()
      .addLine(
        'All virtual operations stopped.',
        'accent'
      )
      .addLine(
        `Operations cancelled: ${result.operations}`,
        'muted'
      )
      .addLine(
        `Jobs terminated: ${result.jobs}`,
        'muted'
      )
      .addChange(
        'Execution generation advanced; stale asynchronous output is suppressed.'
      );
  }
});
  linuxRegisterSimple('less', {
    description: 'Display a virtual file.',
    usage: 'less FILE',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: less FILE');
      const node = fs.inspect(args[0]);
      if (!node) return new Result().failure(`less: ${args[0]}: No such file or directory`);
      const r = new Result();
      for (const v of fs.lines(node)) r.addLine(v);
      r.addLine('(END)', 'muted');
      return r;
    }
  });
  linuxRegisterSimple('link', {
    description: 'Create a virtual hard link.',
    usage: 'link FILE LINK_NAME',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: link FILE LINK_NAME');
      const source = fs.inspect(args[0]);
      if (!source) return new Result().failure(`link: '${args[0]}': No such file or directory`);
      try { fs.link(args[0], args[1], false); } catch (error) { return new Result().failure(`link: '${args[1]}': ${error?.message === 'EEXIST' ? 'File exists' : 'operation failed'}`); }
      return new Result().addChange(`Link created: ${args[1]}`);
    }
  });
  linuxRegisterSimple('ln', {
    description: 'Create virtual hard or symbolic links.',
    usage: 'ln [-s] TARGET LINK_NAME',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const symbolic = args.includes('-s');
      const values = args.filter(v => v !== '-s');
      if (values.length < 2) return new Result().failure('Usage: ln [-s] TARGET LINK_NAME');
      const target = values[0];
      const link = values[1];
      const existing = fs.inspect(link);
      if (existing) return new Result().failure(`ln: failed to create link '${link}': File exists`);
      try { fs.link(target, link, symbolic); } catch (error) { return new Result().failure(`ln: failed to create link '${link}': ${error?.message || 'operation failed'}`); }
      return new Result().addChange(`Link created: ${link}`);
    }
  });
  linuxRegisterSimple('local', {
    description: 'Declare a virtual local variable.',
    usage: 'local NAME[=VALUE]',
    category: 3,
    async executor({ args, api }) {
      return linuxExecute('declare', args, api);
    }
  });
  linuxRegisterSimple('locale', {
    description: 'Display virtual locale settings.',
    usage: 'locale [-a]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (args.includes('-a')) {
        r.addLine('C');
        r.addLine('C.UTF-8');
        r.addLine('en_US.UTF-8');
        return r;
      }
      r.addLine('LANG=en_US.UTF-8');
      r.addLine('LC_CTYPE="en_US.UTF-8"');
      r.addLine('LC_MESSAGES="en_US.UTF-8"');
      return r;
    }
  });
  linuxRegisterSimple('ls', {
    description: 'List virtual filesystem contents.',
    usage: 'ls [OPTION]... [FILE]...',
    aliases: ['dirlist'],
    category: 3,
    executor: ({ args }) => {
      const long = args.includes('-l');
      const all = args.includes('-a');
      const human = args.includes('-h');
      const paths = args.filter(v => !v.startsWith('-')).length ? args.filter(v => !v.startsWith('-')) : [state.cwd];
      const r = new Result();
      for (const path of paths) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`ls: cannot access '${path}': No such file or directory`);
          continue;
        }
        if (node.kind !== 'dir') {
          r.addLine(path);
          continue;
        }
        const entries = fs.list(node).filter(n => all || !n.name.startsWith('.'));
        if (entries.length === 0 && !all) {
          const hidden = fs.list(node).filter(n => n.name.startsWith('.'));
          if (hidden.length > 0) r.setDiagnostic('directory contains only hidden entries; use ls -a');
          else r.setDiagnostic('directory is empty');
          continue;
        }
        if (long) {
          for (const e of entries) r.addLine(`${fs.modeString(e)} ${e.uid} ${e.gid} ${(human ? fs.humanSize(e.size) : e.size).toString().padStart(8)} ${new Date(e.modifiedAt).toString()} ${e.kind === 'symlink' ? `${e.name} -> ${e.target}` : e.name}`);
        } else {
          for (const e of entries) r.addLine(e.kind === 'symlink' ? `${e.name} -> ${e.target}` : e.name);
        }
      }
      return r;
    }
  });
  linuxRegisterSimple('md5sum', {
    description: 'Calculate MD5 hashes for virtual files.',
    usage: 'md5sum FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addLine(`md5sum: ${path}: No such file or directory`, 'danger');
          continue;
        }
        r.addLine(`${fs.md5(fs.content(node))}  ${path}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('mkdir', {
    description: 'Create virtual directories.',
    aliases: ['makedir'],
    usage: 'mkdir [-p] DIRECTORY...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const parents = args.includes('-p');
      for (const path of args.filter(v => !v.startsWith('-'))) {
        try {
          parents ? fs.mkdirp(path) : fs.mkdir(path);
        } catch (error) {
          return new Result().failure(`mkdir: cannot create directory '${path}'`).addError(`mkdir: cannot create directory '${path}'`, String(error?.message || error));
        }
      }
      return new Result().addChange(`Created ${args.filter(v => !v.startsWith('-')).join(', ')}`);
    }
  });
  linuxRegisterSimple('mkfifo', {
    description: 'Create virtual FIFO nodes.',
    usage: 'mkfifo NAME...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      for (const path of args) {
        try { fs.mkfifo(path); } catch { return new Result().failure(`mkfifo: cannot create '${path}'`); }
      }
      return new Result().addChange(`Created FIFO(s): ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('mktemp', {
    description: 'Create a temporary virtual file or directory.',
    usage: 'mktemp [-d] [TEMPLATE]',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const directory = args.includes('-d');
      const template = args.find(v => !v.startsWith('-')) || 'tmp.XXXXXX';
      const random = Math.random().toString(36).slice(2, 8);
      const name = template.includes('XXXXXX') ? template.replace('XXXXXX', random) : `${template}${random}`;
      const path = fs.normalize(name);
      directory ? fs.mkdirp(path) : fs.create(path, '', { replace: true, mode: 0o600 });
      return new Result().addLine(path);
    }
  });
  linuxRegisterSimple('more', {
    description: 'Display a virtual file.',
    usage: 'more FILE',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: more FILE');
      const node = fs.inspect(args[0]);
      if (!node) return new Result().failure(`more: ${args[0]}: No such file or directory`);
      const r = new Result();
      for (const v of fs.lines(node)) r.addLine(v);
      return r;
    }
  });
  linuxRegisterSimple('mountpoint', {
    description: 'Test whether a virtual path is a mount point.',
    usage: 'mountpoint PATH',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: mountpoint PATH');
      const p = fs.normalize(args[0]);
      return state.mounts.has(p) ? new Result().addLine(`${p} is a mountpoint`, 'success') : new Result().failure(`${p} is not a mountpoint`);
    }
  });
  linuxRegisterSimple('mv', {
    description: 'Move or rename virtual files.',
    usage: 'mv SOURCE DEST',
    aliases: ['move'],
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: mv SOURCE DEST');
      const source = fs.inspect(args[0]);
      if (!source) return new Result().failure(`mv: cannot stat '${args[0]}'`);
      const dest = fs.inspect(args[1]);
      fs.copy(source, dest?.kind === 'dir' ? `${args[1]}/${source.name}` : args[1]);
      fs.remove(args[0], { recursive: true });
      return new Result().addChange(`Moved ${args[0]} to ${args[1]}`);
    }
  });
  linuxRegisterSimple('nice', {
    description: 'Start a virtual process with a nice value.',
    usage: 'nice [-n ADJUSTMENT] COMMAND [ARG...]',
    category: 3,
    async executor({ args, api }) {
      let adjustment = 10;
      let index = 0;
      if (args[0] === '-n' && args[1]) {
        adjustment = parseInteger(args[1]) ?? 10;
        index = 2;
      }
      if (!args[index]) return new Result().addLine(`nice: ${adjustment}`);
      const job = createJob(args[index], { nice: adjustment });
      const result = await linuxExecute(args[index], args.slice(index + 1), api);
      job.process.state = 'EXIT';
      job.state = 'DONE';
      return result;
    }
  });
  linuxRegisterSimple('nl', {
    description: 'Number lines in virtual text.',
    usage: 'nl FILE...',
    category: 3,
    executor: ({ args }) => {
      const files = args.filter(v => !v.startsWith('-'));
      let n = 1;
      const r = new Result();
      for (const path of files) for (const v of fs.lines(fs.inspect(path))) r.addLine(`${String(n++).padStart(6)}\t${v}`);
      return r;
    }
  });
  linuxRegisterSimple('nohup', {
    description: 'Run a virtual command detached from hangups.',
    usage: 'nohup COMMAND [ARG...]',
    category: 3,
    async executor({ args, api }) {
      if (!args.length) return new Result().failure('Usage: nohup COMMAND [ARG...]');
      const p = state.nextPid++;
      state.processes.set(p, { pid: p, command: args[0], state: 'RUNNING', nice: 0, uid: state.security.euid, sid: p, pgid: p, startedAt: Date.now(), shellOwned: false, background: true, detached: true, noHangup: true, exitCode: null });
      return linuxExecute(args[0], args.slice(1), api);
    }
  });
  linuxRegisterSimple('nproc', {
    description: 'Display the number of virtual processors.',
    usage: 'nproc',
    category: 3,
    executor: () => new Result().addLine(String(state.cpu.cpuCount))
  });
  linuxRegisterSimple('od', {
    description: 'Dump virtual file data.',
    usage: 'od [-An] [-tx1] FILE',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: od FILE');
      const node = fs.inspect(args.at(-1));
      if (!node) return new Result().failure(`od: ${args.at(-1)}: No such file or directory`);
      const bytes = fs.bytes(fs.content(node));
      const hex = args.some(v => v.includes('x'));
      const r = new Result();
      for (let i = 0; i < bytes.length; i += 16) r.addLine(`${i.toString(8).padStart(7, '0')} ${Array.from(bytes.slice(i, i + 16)).map(v => hex ? v.toString(16).padStart(2, '0') : v.toString(8).padStart(3, '0')).join(' ')}`);
      return r;
    }
  });
  linuxRegisterSimple('paste', {
    description: 'Merge lines from virtual files.',
    usage: 'paste FILE1 FILE2',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: paste FILE1 FILE2');
      const data = args.map(v => fs.lines(fs.inspect(v)));
      const max = Math.max(...data.map(v => v.length));
      const r = new Result();
      for (let i = 0; i < max; i++) r.addLine(data.map(v => v[i] ?? '').join('\t'));
      return r;
    }
  });
  linuxRegisterSimple('pathchk', {
    description: 'Validate virtual pathnames.',
    usage: 'pathchk NAME...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) if (path.length > 4096) r.addError(`pathchk: ${path}: name too long`);
      return r;
    }
  });
  linuxRegisterSimple('pidof', {
    description: 'Display virtual PIDs by command name.',
    usage: 'pidof PROGRAM',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: pidof PROGRAM');
      const pids = Array.from(state.processes.values()).filter(p => p.command.split(/\s+/)[0] === args[0] && p.state !== 'EXIT').map(p => p.pid);
      return pids.length ? new Result().addLine(pids.join(' ')) : new Result();
    }
  });
  linuxRegisterSimple('popd', {
    description: 'Restore the previous virtual directory.',
    usage: 'popd',
    category: 3,
    executor: () => {
      const current = state.cwd;
      state.cwd = state.previousDirectory;
      state.previousDirectory = current;
      state.variables.set('PWD', state.cwd);
      return new Result().addLine(state.cwd);
    }
  });
  linuxRegisterSimple('pr', {
    description: 'Format virtual files for paginated output.',
    usage: 'pr FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args.filter(v => !v.startsWith('-'))) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`pr: ${path}: No such file or directory`);
          continue;
        }
        r.addLine(`Page 1 of ${path}`, 'accent');
        for (const v of fs.lines(node)) r.addLine(v);
        r.addLine('', 'output');
      }
      return r;
    }
  });
  linuxRegisterSimple('printf', {
    description: 'Format and print virtual shell output.',
    usage: 'printf FORMAT [ARG...]',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result();
      let i = 1;
      const out = args[0].replace(/%[sdifcx%]/g, m => {
        if (m === '%%') return '%';
        const v = args[i++] ?? '';
        return m === '%d' || m === '%i' ? String(parseInteger(v) || 0) : m === '%f' ? String(Number(v) || 0) : m === '%c' ? String(v).charAt(0) : m === '%x' ? (Number(v) || 0).toString(16) : String(v);
      }).replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\r', '\r').replaceAll('\\\\', '\\');
      const r = new Result();
      for (const v of out.split('\n')) r.addLine(v);
      return r;
    }
  });
  linuxRegisterSimple('pushd', {
    description: 'Push the current directory and change directory.',
    usage: 'pushd DIRECTORY',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: pushd DIRECTORY');
      const path = fs.normalize(args[0]);
      const node = fs.inspect(path);
      if (!node || node.kind !== 'dir') return new Result().failure(`pushd: ${args[0]}: No such directory`);
      state.previousDirectory = state.cwd;
      state.cwd = path;
      state.variables.set('PWD', path);
      state.variables.set('OLDPWD', state.previousDirectory);
      return new Result().addLine(state.cwd);
    }
  });
  linuxRegisterSimple('pwd', {
    description: 'Display the virtual working directory.',
    usage: 'pwd',
    aliases: ['cwd'],
    category: 3,
    executor: () => new Result().addLine(state.cwd, 'path')
  });
  linuxRegisterSimple('read', {
    description: 'Read interactive virtual shell input.',
    usage: 'read [-r] NAME',
    category: 3,
    executor: ({ args }) => {
      const name = args.find(v => v !== '-r');
      if (!name) return new Result().failure('read: variable name is required');
      return new Result().addLine(`read: use interactive shell input for ${name}`, 'muted');
    }
  });
  linuxRegisterSimple('readarray', {
    description: 'Store values in a virtual shell array.',
    usage: 'readarray [-t] NAME [VALUE...]',
    category: 3,
    executor: ({ args }) => {
      const trim = args.includes('-t');
      const values = args.filter(v => v !== '-t');
      const name = values.shift();
      if (!name) return new Result().failure('Usage: readarray [-t] NAME [VALUE...]');
      state.variables.set(name, values.map(v => trim ? v : `${v}\n`));
      return new Result().addChange(`Array ${name} set`);
    }
  });
  linuxRegisterSimple('readonly', {
    description: 'Mark virtual variables read-only.',
    usage: 'readonly NAME[=VALUE] ...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const name of Array.from(state.readonly).sort()) r.addLine(`declare -r ${name}="${state.variables.get(name) ?? ''}"`);
        return r;
      }
      for (const item of args) {
        const i = item.indexOf('=');
        const name = i > 0 ? item.slice(0, i) : item;
        if (i > 0) state.variables.set(name, item.slice(i + 1));
        state.readonly.add(name);
      }
      return r.addChange('Variables marked read-only');
    }
  });
  linuxRegisterSimple('realpath', {
    description: 'Resolve a virtual pathname.',
    usage: 'realpath PATH...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) r.addLine(fs.normalize(path), 'path');
      return r;
    }
  });
  linuxRegisterSimple('reset', {
    description: 'Reset virtual terminal attributes.',
    usage: 'reset',
    category: 3,
    executor: () => {
      state.tty = { echo: true, canonical: true, signal: true, columns: 80, rows: 24, opost: true };
      return new Result().addLine('Terminal reset.').addChange('Terminal attributes reset');
    }
  });
  linuxRegisterSimple('rev', {
    description: 'Reverse virtual text lines.',
    usage: 'rev FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) for (const v of fs.lines(fs.inspect(path))) r.addLine(Array.from(v).reverse().join(''));
      return r;
    }
  });
linuxRegisterSimple('rm', {
  description: 'Remove virtual files and directories.',
  usage: 'rm [-fivIrRdv] FILE... | rm -rf /',
  aliases: ['remove'],
  category: 3,
  mutatesFilesystem: true,
  async executor({ args, ctx }) {
    if (!args.length) {
      return new Result().failure(
        'rm: missing operand'
      );
    }
    let recursive = false;
    let force = false;
    let interactive = false;
    let interactiveOnce = false;
    let verbose = false;
    let dirOnly = false;
    let preserveRoot = false;
    let interactiveMode = '';
    const paths = [];
    let endOfOptions = false;
    for (const arg of args) {
      if (endOfOptions) {
        paths.push(arg);
        continue;
      }
      if (arg === '--') {
        endOfOptions = true;
        continue;
      }
      if (
        arg.startsWith('-') &&
        arg !== '-'
      ) {
        if (arg.startsWith('--')) {
          if (arg === '--help') {
            return new Result()
              .addLine(
                'Usage: rm [OPTION]... FILE...',
                'accent'
              )
              .addLine(
                '  -f, --force        ignore nonexistent files and arguments'
              )
              .addLine(
                '  -i                 prompt before every removal'
              )
              .addLine(
                '  -I                 prompt once before removing many files'
              )
              .addLine(
                '  -r, -R, --recursive remove directories recursively'
              )
              .addLine(
                '  -d, --dir          remove empty directories'
              )
              .addLine(
                '  -v, --verbose      explain what is being done'
              )
              .addLine(
                '      --preserve-root protect /'
              )
              .addLine(
                '      --no-preserve-root allow rm -rf / to factory-reset the virtual system'
              );
          }
          if (arg === '--version') {
            return new Result().addLine(
              `rm (MUNITOS virtual core) ${FILE_VERSION}`
            );
          }
          if (arg === '--recursive') {
            recursive = true;
          } else if (arg === '--force') {
            force = true;
          } else if (
            arg === '--interactive'
          ) {
            interactive = true;
          } else if (
            arg.startsWith(
              '--interactive='
            )
          ) {
            interactive = true;
            interactiveMode =
              arg.slice(14);
          } else if (
            arg === '--verbose'
          ) {
            verbose = true;
          } else if (arg === '--dir') {
            dirOnly = true;
          } else if (
            arg === '--preserve-root'
          ) {
            preserveRoot = true;
          } else if (
            arg === '--no-preserve-root'
          ) {
            preserveRoot = false;
          } else {
            return new Result().failure(
              `rm: unrecognized option '${arg}'`
            );
          }
        } else {
          for (
            const flag
            of arg.slice(1)
          ) {
            if (
              flag === 'r' ||
              flag === 'R'
            ) {
              recursive = true;
            } else if (flag === 'f') {
              force = true;
            } else if (flag === 'i') {
              interactive = true;
            } else if (flag === 'I') {
              interactiveOnce = true;
            } else if (flag === 'v') {
              verbose = true;
            } else if (flag === 'd') {
              dirOnly = true;
            } else {
              return new Result().failure(
                `rm: invalid option -- '${flag}'`
              );
            }
          }
        }
        continue;
      }
      paths.push(arg);
    }
    if (!paths.length) {
      return new Result().failure(
        'rm: missing operand'
      );
    }
    const rootRequested =
      paths.some(
        path =>
          fs.normalize(path) === '/'
      );
    if (
      rootRequested &&
      recursive &&
      !force
    ) {
      return new Result().failure(
        "rm: it is dangerous to operate recursively on '/' without -f"
      );
    }
    if (
      rootRequested &&
      recursive &&
      force &&
      !preserveRoot
    ) {
      factoryResetVirtualSystem();
      return new Result()
        .addLine(
          'Factory reset complete.',
          'accent'
        )
        .addLine(
          'The virtual filesystem, jobs, sessions and shell state were restored to factory defaults.',
          'muted'
        )
        .addChange(
          'Virtual system factory reset'
        );
    }
    if (
      rootRequested &&
      recursive &&
      force &&
      preserveRoot
    ) {
      return new Result().failure(
        "rm: it is dangerous to operate recursively on '/': preserve-root is enabled"
      );
    }
    if (
      interactiveMode &&
      ![
        'always',
        'once',
        'never'
      ].includes(
        interactiveMode
      )
    ) {
      return new Result().failure(
        `rm: invalid argument for --interactive: '${interactiveMode}'`
      );
    }
    if (
      interactive &&
      force &&
      interactiveMode !== 'always'
    ) {
      interactive = false;
    }
    if (interactiveOnce) {
      const approved =
        await requestYesNo(
          'Proceed with removal?',
          `About to remove ${paths.length} virtual path(s). Confirm with Y or N.`,
          ctx
        );
      if (!approved) {
        return new Result().failure(
          'rm: operation cancelled'
        );
      }
    }
    const removed = [];
    for (const path of paths) {
      const node =
        fs.inspect(path);
      if (!node) {
        if (!force) {
          return new Result().failure(
            `rm: cannot remove '${path}': No such file or directory`
          );
        }
        continue;
      }
      if (node.path === '/') {
        return new Result().failure(
          "rm: cannot remove '/'"
        );
      }
      if (
        node.kind === 'dir' &&
        !fs.isEmpty(path) &&
        !recursive
      ) {
        return new Result().failure(
          `rm: cannot remove '${path}': Is a directory`
        );
      }
      if (
        dirOnly &&
        node.kind !== 'dir'
      ) {
        return new Result().failure(
          `rm: cannot remove '${path}': Not a directory`
        );
      }
      if (interactive) {
        const approved =
          await requestYesNo(
            `Remove '${path}'?`,
            'Confirm removal with Y or N.',
            ctx
          );
        if (!approved) {
          if (!force) {
            return new Result().failure(
              `rm: not removing '${path}'`
            );
          }
          continue;
        }
      }
      try {
        fs.remove(
          path,
          { recursive }
        );
        removed.push(path);
      } catch (error) {
        if (!force) {
          return new Result()
            .failure(
              `rm: cannot remove '${path}'`
            )
            .addError(
              `rm: cannot remove '${path}'`,
              String(
                error?.message ||
                error
              )
            );
        }
      }
    }
    const r = new Result();
    if (verbose) {
      for (const path of removed) {
        r.addLine(
          `removed '${path}'`,
          'muted'
        );
      }
    }
    if (removed.length) {
      r.addChange(
        `Removed ${removed.join(', ')}`
      );
    }
    return r;
  }
});
  linuxRegisterSimple('rmdir', {
    description: 'Remove empty virtual directories.',
    usage: 'rmdir DIRECTORY...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      for (const path of args) {
        try {
          fs.remove(path);
        } catch {
          return new Result().failure(`rmdir: failed to remove '${path}'`);
        }
      }
      return new Result().addChange(`Removed ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('run-parts', {
    description: 'Run simple virtual scripts in a directory.',
    usage: 'run-parts DIRECTORY',
    category: 3,
    async executor({ args, api, ctx }) {
      if (!args.length) return new Result().failure('Usage: run-parts DIRECTORY');
      const dir = fs.inspect(args[0]);
      if (!dir || dir.kind !== 'dir') return new Result().failure(`run-parts: failed to open directory ${args[0]}`);
      const r = new Result();
      for (const script of fs.list(dir).filter(n => n.kind === 'file')) for (const cmd of fs.fromBytes(fs.content(script)).split('\n').map(v => v.trim()).filter(v => v && !v.startsWith('#'))) {
        const tokens = cmd.match(/"[^"]*"|'[^']*'|\S+/g) || [];
        const normalized = tokens.map(v => v.replace(/^['"]|['"]$/g, ''));
        const result = await linuxExecute(normalized[0], normalized.slice(1), api, ctx);
        if (result instanceof Result) for (const l of result.stdout) r.addLine(l.text, l.cls);
      }
      return r;
    }
  });
  linuxRegisterSimple('sed', {
    description: 'Edit virtual text streams.',
    usage: 'sed SCRIPT FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: sed SCRIPT FILE...');
      const script = args[0];
      const subst = script.match(/^s\/(.*)\/(.*)\/([gi]*)$/);
      const del = script.match(/^\/(.*)\/d$/);
      const r = new Result();
      for (const path of args.slice(1)) {
        let lines = fs.lines(fs.inspect(path));
        if (subst) {
          const [, a, b, f] = subst;
          const re = new RegExp(a, f);
          lines = lines.map(v => v.replace(re, b));
        } else if (del) {
          const re = new RegExp(del[1]);
          lines = lines.filter(v => !re.test(v));
        }
        const node = fs.inspect(path);
        if (node) fs.write(node, lines.join('\n') + '\n');
        for (const v of lines) r.addLine(v);
      }
      return r.addChange('File(s) modified');
    }
  });
  linuxRegisterSimple('seq', {
    description: 'Print a numeric sequence.',
    usage: 'seq [FIRST] [INCREMENT] LAST',
    category: 3,
    executor: ({ args }) => {
      let first = 1;
      let step = 1;
      let last = 1;
      if (args.length === 1) last = Number(args[0]);
      else if (args.length === 2) {
        first = Number(args[0]);
        last = Number(args[1]);
      } else {
        first = Number(args[0]);
        step = Number(args[1]);
        last = Number(args[2]);
      }
      if (!Number.isFinite(first) || !Number.isFinite(step) || !Number.isFinite(last) || step === 0) return new Result().failure('seq: invalid numeric argument');
      const r = new Result();
      if (step > 0) for (let v = first; v <= last; v += step) r.addLine(String(v));
      else for (let v = first; v >= last; v += step) r.addLine(String(v));
      return r;
    }
  });
  linuxRegisterSimple('set', {
    description: 'Display or update virtual shell state.',
    usage: 'set [-e|-u|-x] [NAME=VALUE]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      if (!args.length) {
        for (const [k, v] of Array.from(state.variables.entries()).sort(([a], [b]) => a.localeCompare(b))) r.addLine(`${k}=${Array.isArray(v) ? v.join(' ') : v}`);
        return r;
      }
      for (const arg of args.filter(v => v !== '--')) {
        if (/^[-+][euxfx]$/.test(arg)) {
          state.shellOptions.set(arg.slice(1), arg[0] === '-');
        } else {
          const i = arg.indexOf('=');
          if (i > 0) state.variables.set(arg.slice(0, i), arg.slice(i + 1));
        }
      }
      return r.addChange('Shell state updated');
    }
  });
  linuxRegisterSimple('shift', {
    description: 'Shift virtual positional parameters.',
    usage: 'shift [N]',
    category: 3,
    executor: ({ args }) => {
      const n = args[0] == null ? 1 : parseInteger(args[0]);
      if (n == null || n < 0) return new Result().failure('shift: numeric argument required');
      state.positional = state.positional.slice(n);
      return new Result().addChange(`Shifted ${n} position(s)`);
    }
  });
  linuxRegisterSimple('shred', {
    description: 'Overwrite and remove virtual file data.',
    usage: 'shred [-u] FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const remove = args.includes('-u');
      for (const path of args.filter(v => !v.startsWith('-'))) {
        const node = fs.inspect(path);
        if (!node || node.kind !== 'file') return new Result().failure(`shred: ${path}: No such file`);
        fs.write(node, new Uint8Array(node.size));
        if (remove) fs.remove(path);
      }
      return new Result().addChange(`Shredded ${args.filter(v => !v.startsWith('-')).join(', ')}`);
    }
  });
  linuxRegisterSimple('shuf', {
    description: 'Randomize virtual text lines.',
    usage: 'shuf FILE',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: shuf FILE');
      const values = fs.lines(fs.inspect(args[0]));
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      const r = new Result();
      for (const v of values) r.addLine(v);
      return r;
    }
  });
  linuxRegisterSimple('sleep', {
    description: 'Wait for virtual time.',
    usage: 'sleep NUMBER[SUFFIX] [NUMBER[SUFFIX]...]',
    category: 3,
    async executor({ args, api, ctx }) {
      if (!args.length) return new Result().failure('Usage: fs.sleep NUMBER[SUFFIX] [NUMBER[SUFFIX]...]');
      let duration = 0;
      for (const value of args) {
        const parsed = fs.parseDuration(value);
        if (!Number.isFinite(parsed)) return new Result().failure(`sleep: invalid time interval '${value}'`);
        duration += parsed;
      }
      await fs.sleep(duration, api);
      if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
      return new Result().success('sleep completed');
    }
  });
  linuxRegisterSimple('sort', {
    description: 'Sort virtual text.',
    usage: 'sort [OPTIONS] FILE...',
    category: 3,
    executor: ({ args }) => {
      const numeric = args.includes('-n');
      const reverse = args.includes('-r');
      const unique = args.includes('-u');
      const values = args.filter(v => !v.startsWith('-')).flatMap(path => fs.lines(fs.inspect(path)));
      values.sort(numeric ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b, 'en'));
      if (reverse) values.reverse();
      const r = new Result();
      for (const v of unique ? Array.from(new Set(values)) : values) r.addLine(v);
      return r;
    }
  });
  linuxRegisterSimple('source', {
    description: 'Execute simple commands from a virtual file.',
    usage: 'source FILE',
    category: 3,
    async executor({ args, api, ctx }) {
      if (!args.length) return new Result().failure('Usage: source FILE');
      if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
      const node = fs.inspect(args[0]);
      if (!node) return new Result().failure(`source: ${args[0]}: No such file or directory`);
      const r = new Result();
      for (const cmd of fs.fromBytes(fs.content(node)).split('\n').map(v => v.trim()).filter(v => v && !v.startsWith('#'))) {
        if (ctx?.isActive?.() === false) return new Result({ status: 'cancelled', exitCode: 130 });
        const tokens = cmd.match(/"[^"]*"|'[^']*'|\S+/g) || [];
        const normalized = tokens.map(v => v.replace(/^['"]|['"]$/g, ''));
        const result = await linuxExecute(normalized[0], normalized.slice(1), api);
        if (result instanceof Result) for (const l of result.stdout) r.addLine(l.text, l.cls);
      }
      return r;
    }
  });
  linuxRegisterSimple('split', {
    description: 'Split virtual files into pieces.',
    usage: 'split [-l LINES] FILE PREFIX',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      let lineCount = 1000;
      let index = 0;
      if (args[0] === '-l') {
        lineCount = parseInteger(args[1]) || 1000;
        index = 2;
      }
      const file = args[index];
      const prefix = args[index + 1];
      if (!file || !prefix) return new Result().failure('Usage: split [-l LINES] FILE PREFIX');
      const lines = fs.lines(fs.inspect(file));
      let part = 0;
      for (let i = 0; i < lines.length; i += lineCount) fs.create(`${fs.normalize(prefix)}${String(part++).padStart(2, '0')}`, lines.slice(i, i + lineCount).join('\n') + '\n', { replace: true });
      return new Result().addChange(`Split into ${part} piece(s)`);
    }
  });
  linuxRegisterSimple('stat', {
    description: 'Display virtual file metadata.',
    usage: 'stat FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) {
        const node = fs.inspect(path);
        if (!node) {
          r.addLine(`stat: cannot statx '${path}': No such file or directory`, 'danger');
          continue;
        }
        const type = node.kind === 'dir' ? 'directory' : node.kind === 'symlink' ? 'symbolic link' : node.kind === 'fifo' ? 'fifo' : 'regular file';
        r.addLine(`  File: ${path}\n  Size: ${node.size}\tType: ${type}\n  Access: (${(node.mode & 0o7777).toString(8).padStart(4, '0')}/${fs.modeString(node).slice(1)})\tUid: (${node.uid})\tGid: (${node.gid})\n  Modify: ${new Date(node.modifiedAt).toString()}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('strings', {
    description: 'Extract printable strings from virtual data.',
    usage: 'strings FILE...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const path of args) {
        const bytes = fs.bytes(fs.content(fs.inspect(path)));
        let current = '';
        for (const b of bytes) {
          if (b >= 32 && b <= 126) current += String.fromCharCode(b);
          else {
            if (current.length >= 4) r.addLine(current);
            current = '';
          }
        }
        if (current.length >= 4) r.addLine(current);
      }
      return r;
    }
  });
  linuxRegisterSimple('tail', {
    description: 'Display the end of virtual files.',
    usage: 'tail [-n NUMBER] FILE...',
    category: 3,
    executor: ({ args }) => {
      let count = 10;
      let index = 0;
      if (args[0] === '-n') {
        count = parseInteger(args[1]) || 10;
        index = 2;
      }
      const files = args.slice(index);
      const r = new Result();
      for (const path of files) {
        const node = fs.inspect(path);
        if (!node) {
          r.addError(`tail: ${path}: No such file or directory`);
          continue;
        }
        if (files.length > 1) r.addLine(`==> ${path} <==`, 'accent');
        for (const v of fs.lines(node).slice(-count)) r.addLine(v);
      }
      return r;
    }
  });
  linuxRegisterSimple('tar', {
    description: 'Create, list or extract basic virtual tar archives.',
    usage: 'tar -cf ARCHIVE FILE... | tar -xf ARCHIVE | tar -tf ARCHIVE',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      const create = args.includes('-c');
      const extract = args.includes('-x');
      const list = args.includes('-t');
      const fi = args.indexOf('-f');
      const archive = fi !== -1 ? args[fi + 1] : null;
      if (!archive) return new Result().failure('Usage: tar -cf ARCHIVE FILE... | tar -xf ARCHIVE | tar -tf ARCHIVE');
      if (create) {
        const inputs = args.slice(fi + 2).filter(v => !v.startsWith('-'));
        try { fs.create(archive, fs.archive.create(inputs), { replace: true }); } catch { return new Result().failure('tar: archive creation failed'); }
        return new Result().addChange(`Archive created: ${archive}`);
      }
      if (list) {
        try {
          const records = fs.archive.list(archive);
          const r = new Result();
          for (const rec of records) r.addLine(rec.name);
          return r;
        } catch { return new Result().failure(`tar: ${archive}: invalid tar archive`); }
      }
      if (extract) {
        try { const count = fs.archive.extract(archive); return new Result().addChange(`Extracted ${count} member(s)`); } catch { return new Result().failure(`tar: ${archive}: invalid tar archive`); }
      }
      return new Result().failure('tar: unsupported mode');
    }
  });
  linuxRegisterSimple('tee', {
    description: 'Write values to a virtual file and echo them.',
    usage: 'tee FILE [VALUE ...]',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: tee FILE [VALUE ...]');
      const text = args.slice(1).join(' ');
      fs.create(args[0], text ? `${text}\n` : '', { replace: true });
      const r = new Result();
      for (const v of text.split('\n').filter(Boolean)) r.addLine(v);
      return r;
    }
  });
  linuxRegisterSimple('test', {
    description: 'Evaluate simple virtual shell conditions.',
    usage: 'test EXPRESSION',
    category: 3,
    executor: ({ args }) => {
      if (!args.length) return new Result();
      let result = false;
      if (args.length === 2 && args[0] === '-e') result = Boolean(fs.inspect(args[1]));
      else if (args.length === 2 && args[0] === '-d') result = fs.inspect(args[1])?.kind === 'dir';
      else if (args.length === 2 && args[0] === '-f') result = fs.inspect(args[1])?.kind === 'file';
      else if (args.length === 3 && ['=', '==', '!='].includes(args[1])) result = args[1] === '!=' ? args[0] !== args[2] : args[0] === args[2];
      else if (args.length === 3 && ['-eq', '-ne', '-lt', '-le', '-gt', '-ge'].includes(args[1])) {
        const a = Number(args[0]);
        const b = Number(args[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          if (args[1] === '-eq') result = a === b;
          if (args[1] === '-ne') result = a !== b;
          if (args[1] === '-lt') result = a < b;
          if (args[1] === '-le') result = a <= b;
          if (args[1] === '-gt') result = a > b;
          if (args[1] === '-ge') result = a >= b;
        }
      }
      state.variables.set('__TEST_STATUS', result ? '0' : '1');
      return result ? new Result().success('test passed').setDiagnostic('exitCode=0') : new Result().failure('test failed').setDiagnostic('exitCode=1');
    }
  });
  linuxRegisterSimple('time', {
    description: 'Measure virtual command execution time.',
    usage: 'time COMMAND [ARG...]',
    category: 3,
    async executor({ args, api, ctx }) {
      if (!args.length) return new Result().failure('Usage: time COMMAND [ARG...]');
      const start = performance.now();
      const result = await linuxExecute(args[0], args.slice(1), api, ctx);
      const r = result instanceof Result ? result : new Result();
      r.addLine(`real\t0m${((performance.now() - start) / 1000).toFixed(3)}s`, 'muted');
      r.addLine('user\t0m0.000s', 'muted');
      r.addLine('sys\t0m0.000s', 'muted');
      return r;
    }
  });
  linuxRegisterSimple('timeout', {
    description: 'Run a virtual command with a timeout.',
    usage: 'timeout DURATION COMMAND [ARG...]',
    category: 3,
    async executor({ args, api, ctx }) {
      if (args.length < 2) return new Result().failure('Usage: timeout DURATION COMMAND [ARG...]');
      const duration = fs.parseDuration(args[0]);
      if (!Number.isFinite(duration)) return new Result().failure(`timeout: invalid time interval '${args[0]}'`);
      let timer = 0;
      let signalCleanup = null;
      const commandPromise = Promise.resolve().then(() => linuxExecute(args[1], args.slice(2), api, ctx)).then(output => ({ timedOut: false, output }));
      const timeoutPromise = new Promise(resolve => {
        const finish = () => resolve({ timedOut: true, output: new Result().failure(`timeout: ${args[1]}: command timed out`) });
        if (ctx?.registerTimer) timer = ctx.registerTimer(finish, duration);
        else timer = setTimeout(finish, duration);
      });
      const cancelPromise = new Promise(resolve => {
        const signal = ctx?.getSignal?.();
        if (!signal) return;
        const cancel = () => resolve({ timedOut: false, cancelled: true, output: new Result({ status: 'cancelled', exitCode: 130 }) });
        if (signal.aborted) cancel();
        else {
          signal.addEventListener('abort', cancel, { once: true });
          signalCleanup = () => signal.removeEventListener('abort', cancel);
        }
      });
      const result = await Promise.race([commandPromise, timeoutPromise, cancelPromise]);
      if (timer && !ctx?.registerTimer) clearTimeout(timer);
      signalCleanup?.();
      return result.output;
    }
  });
  linuxRegisterSimple('touch', {
    description: 'Create virtual files or update timestamps.',
    usage: 'touch FILE...',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      for (const path of args) {
        const node = fs.inspect(path);
        try { fs.touch(path); } catch { return new Result().failure(`touch: cannot touch '${path}'`); }
      }
      return new Result().addChange(`Touched ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('tr', {
    description: 'Translate selected characters.',
    usage: 'tr SET1 SET2 [TEXT]',
    category: 3,
    executor: ({ args }) => {
      if (args.length < 2) return new Result().failure('Usage: tr SET1 SET2 [TEXT]');
      const a = args[0];
      const b = args[1];
      const text = args.slice(2).join(' ');
      const map = new Map();
      for (let i = 0; i < a.length; i++) map.set(a[i], b[Math.min(i, b.length - 1)] ?? '');
      return new Result().addLine(Array.from(text).map(ch => map.get(ch) ?? ch).join(''));
    }
  });
  linuxRegisterSimple('true', {
    description: 'Return a success status.',
    usage: 'true',
    category: 3,
    status: CMD_STATUS.FULL,
    executor: () => new Result().success('true').setDiagnostic('command completed successfully (exitCode=0)')
  });
  linuxRegisterSimple('tty', {
    description: 'Display the virtual terminal device.',
    usage: 'tty',
    category: 3,
    executor: () => new Result().addLine('/dev/pts/0')
  });
  linuxRegisterSimple('type', {
    description: 'Describe virtual command resolution.',
    usage: 'type NAME...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const name of args) {
        const c = linuxResolveCommand(name);
        if (c) r.addLine(`${name} is ${c.capability} (${c.status || 'FULL'})`);
        else r.addLine(`${name}: not found`, 'danger');
      }
      return r;
    }
  });
  linuxRegisterSimple('unalias', {
    description: 'Remove virtual shell aliases.',
    usage: 'unalias NAME...',
    category: 3,
    executor: ({ args }) => {
      for (const name of args) state.aliases.delete(name);
      return new Result().addChange(`Removed alias(es): ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('neofetch', {
    description: 'Display a one-time snapshot of the virtual MUNITOS system.',
    usage: 'neofetch',
    category: 3,
    executor: () => {
      const info = currentSystemInfo();
      const r = new Result();
      r.addLine('MUNITOS', 'accent');
      r.addLine('────────────────────────────────');
      return addSystemInfoLines(r, [
        ['OS', info.os],
        ['Kernel', info.kernel],
        ['Uptime', info.uptime],
        ['Packages', info.packages],
        ['Shell', info.shell],
        ['Resolution', info.resolution],
        ['CPU', info.cpu],
        ['GPU', info.gpu],
        ['Memory', info.memory],
        ['Hostname', info.hostname],
        ['User', info.user],
        ['Working Directory', info.cwd]
      ]);
    }
  });
  linuxRegisterSimple('sysinfo', {
    description: 'Display a one-time detailed virtual MUNITOS system snapshot.',
    usage: 'sysinfo',
    category: 3,
    executor: () => {
      const info = currentSystemInfo();
      const r = new Result();
      r.addLine('MUNITOS System Information', 'accent');
      r.addLine('────────────────────────────────');
      return addSystemInfoLines(r, [
        ['OS', info.os],
        ['Kernel', info.kernel],
        ['Uptime', info.uptime],
        ['Packages', info.packages],
        ['Shell', info.shell],
        ['Resolution', info.resolution],
        ['Terminal', info.terminal],
        ['CPU', info.cpu],
        ['GPU', info.gpu],
        ['Memory', info.memory],
        ['Hostname', info.hostname],
        ['User', info.user],
        ['Working Directory', info.cwd],
        ['Language', info.language],
        ['Started', info.started]
      ]);
    }
  });
  linuxRegisterSimple('uname', {
    description: 'Display virtual MUNITOS system information.',
    usage: 'uname [-a|-s|-r|-m|-n|-o]',
    category: 3,
    executor: ({ args }) => {
      const values = {
        s: 'Linux',
        n: 'MUNITOS',
        r: '6.12.x-munitos-amd64',
        v: '#1 SMP PREEMPT_DYNAMIC MUNITOS',
        m: state.cpu.architecture,
        o: 'GNU/Linux'
      };
      if (args.includes('-a')) return new Result().addLine(Object.values(values).join(' '));
      if (!args.length) return new Result().addLine(values.s);
      const flags = [];
      for (const arg of args) if (/^-([snrvmo]+)$/.test(arg)) for (const f of arg.slice(1)) if (!flags.includes(f)) flags.push(f);
      return new Result().addLine(flags.map(f => values[f]).join(' '));
    }
  });
  linuxRegisterSimple('uniq', {
    description: 'Filter adjacent duplicate lines.',
    usage: 'uniq [-c] FILE...',
    category: 3,
    executor: ({ args }) => {
      const count = args.includes('-c');
      const r = new Result();
      for (const path of args.filter(v => !v.startsWith('-'))) {
        const lines = fs.lines(fs.inspect(path));
        for (let i = 0; i < lines.length;) {
          let j = i + 1;
          while (j < lines.length && lines[j] === lines[i]) j++;
          r.addLine(count ? `${String(j - i).padStart(7)} ${lines[i]}` : lines[i]);
          i = j;
        }
      }
      return r;
    }
  });
  linuxRegisterSimple('unlink', {
    description: 'Remove one virtual directory entry.',
    usage: 'unlink NAME',
    category: 3,
    mutatesFilesystem: true,
    executor: ({ args }) => {
      if (!args.length) return new Result().failure('Usage: unlink NAME');
      const node = fs.inspect(args[0]);
      if (!node || node.kind === 'dir') return new Result().failure(`unlink: cannot unlink '${args[0]}'`);
      fs.remove(args[0]);
      return new Result().addChange(`Unlinked ${args[0]}`);
    }
  });
  linuxRegisterSimple('unset', {
    description: 'Remove virtual shell variables.',
    usage: 'unset NAME...',
    category: 3,
    executor: ({ args }) => {
      for (const name of args) {
        if (state.readonly.has(name)) return new Result().failure(`bash: unset: ${name}: cannot unset: readonly variable`);
        state.variables.delete(name);
        state.exported.delete(name);
      }
      return new Result().addChange(`Unset ${args.join(', ')}`);
    }
  });
  linuxRegisterSimple('uptime', {
    description: 'Display virtual system uptime.',
    usage: 'uptime',
    category: 3,
    executor: () => {
      const seconds = Math.floor((Date.now() - state.bootAt) / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor(seconds % 86400 / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      return new Result().addLine(` ${new Date().toTimeString().slice(0, 5)} up ${days ? `${days} day${days === 1 ? '' : 's'}, ` : ''}${hours}:${String(minutes).padStart(2, '0')},  1 user,  load average: 0.00, 0.00, 0.00`);
    }
  });
  linuxRegisterSimple('users', {
    description: 'Display users in the virtual login database.',
    usage: 'users',
    category: 3,
    executor: () => new Result().addLine(Array.from(state.users.keys()).join(' '))
  });
  linuxRegisterSimple('vdir', {
    description: 'Long-format virtual directory listing.',
    usage: 'vdir [FILE]...',
    category: 3,
    async executor({ args, api }) {
      return linuxExecute('ls', ['-l', ...args], api);
    }
  });
  linuxRegisterSimple('wc', {
    description: 'Count lines, words, characters and bytes.',
    usage: 'wc [-lwmc] FILE...',
    category: 3,
    executor: ({ args }) => {
      const lines = args.includes('-l');
      const words = args.includes('-w');
      const bytes = args.includes('-c');
      const chars = args.includes('-m');
      const files = args.filter(v => !v.startsWith('-'));
      if (!files.length) return new Result().failure('Usage: wc [-lwmc] FILE...');
      const r = new Result();
      for (const path of files) {
        const node = fs.inspect(path);
        if (!node) {
          r.addLine(`wc: ${path}: No such file or directory`, 'danger');
          continue;
        }
        const text = fs.fromBytes(fs.content(node));
        const lc = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
        const wc = text.trim() ? text.trim().split(/\s+/).length : 0;
        const bc = fs.byteLength(fs.content(node));
        const cc = Array.from(text).length;
        const fields = [];
        if (lines || (!words && !bytes && !chars)) fields.push(String(lc).padStart(7));
        if (words || (!lines && !bytes && !chars)) fields.push(String(wc).padStart(7));
        if (bytes || (!lines && !words && !chars)) fields.push(String(bc).padStart(7));
        if (chars) fields.push(String(cc).padStart(7));
        r.addLine(`${fields.join(' ')} ${path}`);
      }
      return r;
    }
  });
  linuxRegisterSimple('whereis', {
    description: 'Locate virtual commands and manual entries.',
    usage: 'whereis NAME...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const name of args) r.addLine(linuxResolveCommand(name) ? `${name}: /usr/bin/${name} /usr/share/man/man1/${name}.1.gz` : `${name}:`);
      return r;
    }
  });
  linuxRegisterSimple('which', {
    description: 'Locate virtual commands in PATH.',
    usage: 'which NAME...',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      for (const name of args) {
        if (state.aliases.has(name)) {
          r.addLine(`${name}: aliased to ${state.aliases.get(name)}`);
          continue;
        }
        const c = linuxResolveCommand(name);
        if (c) r.addLine(`/usr/bin/${name} (${c.capability})`);
        else r.addLine(`which: no ${name} in (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)`, 'danger');
      }
      return r;
    }
  });
  linuxRegisterSimple('who', {
    description: 'Display virtual logged-in sessions.',
    usage: 'who',
    category: 3,
    executor: () => new Result().addLine(`munitos     pts/0        ${new Date().toLocaleString()} (virtual-session)`)
  });
  linuxRegisterSimple('whoami', {
    description: 'Display the current virtual username.',
    usage: 'whoami',
    aliases: ['who-am-i'],
    category: 3,
    executor: () => new Result().addLine(currentUser())
  });
  linuxRegisterSimple('xargs', {
    description: 'Construct and execute virtual command lines.',
    usage: 'xargs COMMAND [ARG...]',
    category: 3,
    async executor({ args, api }) {
      if (!args.length) return new Result().failure('Usage: xargs COMMAND [ARG...]');
      const input = state.variables.get('__XARGS_INPUT');
      const values = Array.isArray(input) ? input : String(input ?? '').split(/\s+/).filter(Boolean);
      if (!values.length) return linuxExecute(args[0], args.slice(1), api);
      const r = new Result();
      for (const value of values) {
        const result = await linuxExecute(args[0], [...args.slice(1), value], api);
        if (result instanceof Result) for (const l of result.stdout) r.addLine(l.text, l.cls);
      }
      return r;
    }
  });
  linuxRegisterSimple('zcat', {
    description: 'Decompress and print virtual gzip data.',
    usage: 'zcat FILE.gz...',
    category: 3,
    async executor({ args }) {
      if (typeof DecompressionStream !== 'function') return new Result().failure('zcat: decompression backend unavailable in this browser runtime');
      const r = new Result();
      for (const path of args) {
        try {
          const node = fs.inspect(path);
          const stream = new Blob([fs.bytes(fs.content(node))]).stream().pipeThrough(new DecompressionStream('gzip'));
          const data = new Uint8Array(await new Response(stream).arrayBuffer());
          for (const v of fs.fromBytes(data).split('\n')) r.addLine(v);
        } catch {
          r.addError(`zcat: ${path}: invalid compressed data`);
        }
      }
      return r;
    }
  });
  linuxRegisterSimple('zgrep', {
    description: 'Search decompressed virtual gzip files.',
    usage: 'zgrep PATTERN FILE.gz...',
    category: 3,
    async executor({ args }) {
      if (args.length < 2) return new Result().failure('Usage: zgrep PATTERN FILE.gz...');
      if (typeof DecompressionStream !== 'function') return new Result().failure('zgrep: decompression backend unavailable in this browser runtime');
      const re = new RegExp(args[0]);
      const r = new Result();
      for (const path of args.slice(1)) {
        try {
          const node = fs.inspect(path);
          const stream = new Blob([fs.bytes(fs.content(node))]).stream().pipeThrough(new DecompressionStream('gzip'));
          const data = new Uint8Array(await new Response(stream).arrayBuffer());
          fs.fromBytes(data).split('\n').forEach((v, i) => {
            if (re.test(v)) r.addLine(`${path}:${i + 1}:${v}`);
            re.lastIndex = 0;
          });
        } catch {
          r.addError(`zgrep: ${path}: invalid compressed data`);
        }
      }
      return r;
    }
  });
  linuxRegisterSimple('zless', {
    description: 'Display decompressed virtual gzip content.',
    usage: 'zless FILE.gz...',
    category: 3,
    async executor({ args, api }) {
      const result = await linuxExecute('zcat', args, api);
      if (result instanceof Result) {
        result.addLine('(END)', 'muted');
        return result;
      }
      const r = new Result();
      for (const l of result.stdout) r.addLine(l.text, l.cls);
      r.addLine('(END)', 'muted');
      return r;
    }
  });
  linuxRegisterSimple('zmore', {
    description: 'Display decompressed virtual gzip content.',
    usage: 'zmore FILE.gz...',
    category: 3,
    async executor({ args, api }) {
      return linuxExecute('zless', args, api);
    }
  });
  linuxRegisterSimple('localStorage', {
    description: 'View or edit real browser localStorage.',
    usage: 'localStorage [KEY [VALUE] | --delete KEY]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      let storage;
      try { storage = globalThis.localStorage; } catch { return r.failure('localStorage unavailable in this browser context'); }
      if (!storage) return r.failure('localStorage is not supported');
      try {
        if (!args.length) {
          for (const [k, v] of Object.entries(storage)) r.addLine(`${k}=${v}`);
          if (!r.stdout.length) r.addLine('(empty)', 'muted');
          return r;
        }
        const key = args[0];
        if (args.includes('--delete')) {
          storage.removeItem(key);
          r.addChange(`Deleted localStorage key: ${key}`);
        } else {
          const value = args.slice(1).join(' ');
          if (value) {
            storage.setItem(key, value);
            r.addChange(`Set ${key}=${value}`);
          } else {
            r.addLine(`${key}=${storage.getItem(key) ?? ''}`);
          }
        }
        const node = fs.inspect('/etc/localStorage.txt');
        if (node) fs.write(node, Object.entries(storage).map(([k, v]) => `${k}=${v}`).join('\n') || 'empty\n');
      } catch { return r.failure('localStorage operation failed'); }
      return r;
    }
  });
  linuxRegisterSimple('cookies', {
    description: 'View or edit browser cookies.',
    usage: 'cookies [KEY [VALUE] | --delete KEY]',
    category: 3,
    executor: ({ args }) => {
      const r = new Result();
      let cookie = '';
      try { cookie = String(document.cookie || ''); } catch { return r.failure('cookies unavailable in this browser context'); }
      if (!args.length) {
        r.addLine(cookie || '(no cookies)');
        return r;
      }
      const key = args[0];
      try {
        if (args.includes('--delete')) {
          document.cookie = `${encodeURIComponent(key)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          r.addChange(`Deleted cookie: ${key}`);
        } else {
          const value = args.slice(1).join(' ');
          if (value) {
            document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
            r.addChange(`Set ${key}=${value}`);
          } else {
            const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(`${encodeURIComponent(key)}=`));
            r.addLine(match ? decodeURIComponent(match.slice(encodeURIComponent(key).length + 1)) : '');
          }
        }
        const node = fs.inspect('/etc/cookies.txt');
        if (node) fs.write(node, document.cookie || 'empty\n');
      } catch { return r.failure('cookie operation failed'); }
      return r;
    }
  });
  linuxRegisterSimple('sw', {
    description: 'Show Service Worker status.',
    usage: 'sw',
    category: 3,
    executor: () => {
      const r = new Result();
      if (!('serviceWorker' in navigator)) return r.failure('Service Worker not supported');
      const sw = navigator.serviceWorker;
      r.addLine('Service Worker API: supported');
      r.addLine(`Controller: ${sw.controller ? 'yes' : 'no'}`);
      r.addLine(`Registration: ${sw.getRegistration ? 'available' : 'unavailable'}`);
      return r;
    }
  });
  const getAptPackageRegistry = () => {
    try {
      const registry = core?.package?.registry?.();
      return Array.isArray(registry) ? registry : [];
    } catch {
      return [];
    }
  };
  const getAptPackageRecord = name => {
    const key = String(name ?? '').trim().toLowerCase();
    if (!key) return null;
    const records = getAptPackageRegistry();
    const installedKey = state.installedPackages.has(key);
    const record = records.find(item => {
      const candidates = [
        item?.key,
        item?.name,
        item?.manifest?.name
      ]
        .map(value => String(value ?? '').trim().toLowerCase())
        .filter(Boolean);
      return candidates.includes(key);
    });
    if (!record && !installedKey) return null;
    const manifest = record?.manifest && typeof record.manifest === 'object'
      ? record.manifest
      : {};
    const statusValue = String(
      record?.status ??
      (installedKey ? 'installed' : 'unknown')
    ).toLowerCase();
    const installed =
      installedKey ||
      ['installed', 'enabled', 'verified'].includes(statusValue);
    const files = Array.isArray(record?.files)
      ? record.files.filter(value => typeof value === 'string' && value.trim())
      : Array.isArray(manifest?.files)
        ? manifest.files.filter(value => typeof value === 'string' && value.trim())
        : [];
    return {
      name: String(
        manifest.name ??
        record?.name ??
        record?.key ??
        key
      ).trim() || key,
      version: String(
        manifest.version ??
        record?.version ??
        'unknown'
      ).trim() || 'unknown',
      architecture: String(
        manifest.architecture ??
        record?.architecture ??
        'amd64'
      ).trim() || 'amd64',
      section: String(
        manifest.section ??
        record?.section ??
        'misc'
      ).trim() || 'misc',
      priority: String(
        manifest.priority ??
        record?.priority ??
        'optional'
      ).trim() || 'optional',
      description: String(
        manifest.description ??
        record?.description ??
        `${key} package`
      ).trim(),
      status: installed ? 'ii' : 'rc',
      state: statusValue,
      files: Array.from(new Set(files))
    };
  };
  const getAptPackageNames = () => {
    const names = new Set();
    for (const record of getAptPackageRegistry()) {
      const name = String(
        record?.manifest?.name ??
        record?.name ??
        record?.key ??
        ''
      ).trim();
      if (name) names.add(name);
    }
    for (const name of state.installedPackages) {
      const key = String(name ?? '').trim();
      if (key) names.add(key);
    }
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: 'base',
        numeric: true
      })
    );
  };
  const dpkgGlobToRegExp = pattern => {
    const source = String(pattern ?? '*');
    const escaped = source.replace(
      /[.+^${}()|[\]\\]/g,
      '\\$&'
    );
    return new RegExp(
      `^${escaped
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
      'i'
    );
  };
  const dpkgMatches = patterns => {
    const activePatterns = Array.isArray(patterns) && patterns.length
      ? patterns
      : ['*'];
    return getAptPackageNames().filter(name =>
      activePatterns.some(pattern =>
        dpkgGlobToRegExp(pattern).test(name)
      )
    );
  };
  const renderDpkgStatus = record => [
    `Package: ${record.name}`,
    `Status: ${
      record.status === 'ii'
        ? 'install ok installed'
        : 'deinstall ok config-files'
    }`,
    `Priority: ${record.priority}`,
    `Section: ${record.section}`,
    `Architecture: ${record.architecture}`,
    `Version: ${record.version}`,
    `Description: ${record.description}`
  ];
  const dpkgUnsupported = action =>
    new Result()
      .failure(
        `dpkg: ${action}: operation is not available in the MUNITOS virtual environment`
      )
      .addError(
        `dpkg: ${action}: unsupported package operation`,
        'This MUNITOS implementation exposes package inspection and query operations through the Core APT package registry. Native .deb installation, extraction and maintainer-script execution are unavailable.'
      );
  const executeDpkg = ({ args }) => {
    const argv = Array.isArray(args)
      ? args.map(value => String(value))
      : [];
    if (!argv.length) {
      return new Result()
        .addLine(
          'Debian package management system (MUNITOS)',
          'accent'
        )
        .addLine(
          'Use "dpkg --help" for supported actions.'
        );
    }
    if (
      argv.includes('--version') ||
      argv.includes('-?version')
    ) {
      return new Result().addLine(
        'Debian dpkg package management program (MUNITOS package registry)',
        'accent'
      );
    }
    if (
      argv.includes('--help') ||
      argv.includes('-?')
    ) {
      return new Result()
        .addLine(
          'Usage: dpkg [option...] action',
          'accent'
        )
        .addLine(
          '  -l, --list [<pattern>...]          List packages.'
        )
        .addLine(
          '  -s, --status <package>...          Report package status.'
        )
        .addLine(
          '  -L, --listfiles <package>...       List package files.'
        )
        .addLine(
          '  -S, --search <pattern>...          Find package owning a path.'
        )
        .addLine(
          '  -p, --print-avail <package>...     Display package information.'
        )
        .addLine(
          '  -C, --audit                         Check package state.'
        )
        .addLine(
          '      --print-architecture            Print architecture.'
        )
        .addLine(
          '      --print-foreign-architectures   Print foreign architectures.'
        )
        .addLine(
          'Package data is read from the MUNITOS Core APT registry.',
          'muted'
        );
    }
    if (argv.includes('--print-architecture')) {
      return new Result().addLine('amd64');
    }
    if (argv.includes('--print-foreign-architectures')) {
      return new Result();
    }
    if (
      argv.includes('-C') ||
      argv.includes('--audit')
    ) {
      const records = getAptPackageRegistry();
      const broken = records.filter(record => {
        const status = String(
          record?.status ?? ''
        ).toLowerCase();
        return [
          'corrupted',
          'broken',
          'half-installed',
          'quarantined'
        ].includes(status);
      });
      if (!broken.length) {
        return new Result()
          .addLine(
            'The following packages have unmet dependencies:',
            'muted'
          )
          .addLine('none');
      }
      const result = new Result()
        .addLine(
          'The following packages have unmet dependencies:',
          'danger'
        );
      for (const record of broken) {
        result.addLine(
          String(
            record?.manifest?.name ??
            record?.name ??
            record?.key ??
            'unknown'
          )
        );
      }
      return result;
    }
    const listFlagIndex = argv.findIndex(value =>
      value === '-l' ||
      value === '--list' ||
      (/^-[^-]+$/.test(value) && value.includes('l'))
    );
    if (listFlagIndex !== -1) {
      const patterns = argv
        .slice(listFlagIndex + 1)
        .filter(value => !value.startsWith('-'));
      const names = dpkgMatches(patterns);
      const result = new Result();
      result.addLine(
        'Desired=Unknown/Install/Remove/Purge/Hold',
        'muted'
      );
      result.addLine(
        '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend',
        'muted'
      );
      result.addLine(
        '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)',
        'muted'
      );
      result.addLine(
        '||/ Name                           Version              Architecture Description',
        'accent'
      );
      for (const name of names) {
        const record = getAptPackageRecord(name);
        if (!record) continue;
        result.addLine(
          `${record.status}  ` +
          `${record.name.padEnd(30)} ` +
          `${record.version.padEnd(20)} ` +
          `${record.architecture.padEnd(14)} ` +
          `${record.description}`
        );
      }
      return result;
    }
    const statusIndex = argv.findIndex(value =>
      value === '-s' ||
      value === '--status'
    );
    if (statusIndex !== -1) {
      const names = argv
        .slice(statusIndex + 1)
        .filter(value => !value.startsWith('-'));
      if (!names.length) {
        return new Result().failure(
          'dpkg: --status needs at least one package name argument'
        );
      }
      const result = new Result();
      for (const name of names) {
        const record = getAptPackageRecord(name);
        if (!record) {
          return result.failure(
            `dpkg-query: package '${name}' is not installed`
          );
        }
        for (const line of renderDpkgStatus(record)) {
          result.addLine(line);
        }
        result.addLine('');
      }
      return result;
    }
    const listFilesIndex = argv.findIndex(value =>
      value === '-L' ||
      value === '--listfiles'
    );
    if (listFilesIndex !== -1) {
      const names = argv
        .slice(listFilesIndex + 1)
        .filter(value => !value.startsWith('-'));
      if (!names.length) {
        return new Result().failure(
          'dpkg: --listfiles needs a package name'
        );
      }
      const result = new Result();
      for (const name of names) {
        const record = getAptPackageRecord(name);
        if (!record) {
          return result.failure(
            `dpkg-query: package '${name}' is not installed`
          );
        }
        const existingFiles = record.files.filter(path =>
          Boolean(fs.inspect(path))
        );
        const files =
          existingFiles.length > 0
            ? existingFiles
            : record.files;
        if (!files.length) {
          result.addLine(
            `dpkg-query: no file list available for package '${record.name}'`,
            'muted'
          );
          continue;
        }
        for (const path of files) {
          result.addLine(path);
        }
      }
      return result;
    }
    const printAvailableIndex = argv.findIndex(value =>
      value === '-p' ||
      value === '--print-avail'
    );
    if (printAvailableIndex !== -1) {
      const names = argv
        .slice(printAvailableIndex + 1)
        .filter(value => !value.startsWith('-'));
      const targets = names.length
        ? names
        : dpkgMatches(['*']);
      const result = new Result();
      for (const name of targets) {
        const record = getAptPackageRecord(name);
        if (!record) continue;
        for (const line of renderDpkgStatus(record)) {
          result.addLine(line);
        }
        result.addLine('');
      }
      return result;
    }
    const searchIndex = argv.findIndex(value =>
      value === '-S' ||
      value === '--search'
    );
    if (searchIndex !== -1) {
      const patterns = argv
        .slice(searchIndex + 1)
        .filter(value => !value.startsWith('-'));
      if (!patterns.length) {
        return new Result().failure(
          'dpkg-query: --search needs a filename pattern'
        );
      }
      const result = new Result();
      for (const name of getAptPackageNames()) {
        const record = getAptPackageRecord(name);
        if (!record) continue;
        for (const path of record.files) {
          for (const pattern of patterns) {
            const matcher = dpkgGlobToRegExp(
              pattern.includes('/')
                ? pattern
                : `*${pattern}*`
            );
            if (
              matcher.test(path) ||
              path.endsWith(`/${pattern}`)
            ) {
              result.addLine(
                `${record.name}: ${path}`
              );
              break;
            }
          }
        }
      }
      return result;
    }
    const unsupported = argv.find(value =>
      [
        '-i',
        '--install',
        '-r',
        '--remove',
        '-P',
        '--purge',
        '--unpack',
        '--configure',
        '--pending',
        '--set-selections',
        '--update-avail',
        '--merge-avail',
        '--clear-avail'
      ].includes(value)
    );
    if (unsupported) {
      return dpkgUnsupported(unsupported);
    }
    return new Result()
      .failure(
        `dpkg: unknown or unsupported option '${argv[0]}'`
      )
      .addError(
        `dpkg: unsupported action '${argv[0]}'`,
        'Use "dpkg --help" to see the package inspection actions implemented by MUNITOS.'
      );
  };
  linuxRegisterSimple('dpkg', {
    description: 'Query the package database managed by the MUNITOS Core APT package manager.',
    usage: 'dpkg [options] [actions]',
    category: 2,
    capability: CAPABILITY.VIRTUAL,
    executor: executorArgs => executeDpkg(executorArgs)
  });
  linuxRegisterSimple('dpkg-query', {
    description: 'Query package information from the MUNITOS Core APT registry.',
    usage: 'dpkg-query [options] [package...]',
    category: 2,
    capability: CAPABILITY.VIRTUAL,
    aliases: ['dpkgquery'],
    executor: executorArgs => executeDpkg(executorArgs)
  });
  const registerLinuxBridgeCommands = () => {
    for (const [name, command] of linuxRegistry.entries()) {
      if (command.isAlias || name === 'help') {
        continue;
      }
      const ok = core.registerCommand(name, {
        description: command.description,
        usage: command.usage,
        aliases: command.aliases || [],
        bridge: true,
        run: async ({ args, ctx }) => {
          const result = await linuxExecute(name, args, null, ctx);
          return linuxResultToEntries(result);
        }
      });
      if (ok === false) {
        const existing = state.commands.get(name);
        if (!existing || existing.source !== 'core') {
          throw new Error(`CORE_COMMAND_REGISTRATION_FAILED:${name}`);
        }
      }
    }
  };
  const registerCoreCommands = () => {
    registerCommand('help', {
      description: 'Show available commands.',
      usage: 'help [command]',
      aliases: ['?'],
      run: ({ args }) => {
        if (!args.length) {
          return helpLines();
        }
        if (String(args[0] || '').toLowerCase() === 'munitoslinux') {
          const integrityIssues = fs.integrity();
          const vfsStats = fs.stats();
          return [
            makeLine('MUNITOS System Core', 'accent'),
            makeLine(
              'Unified Linux virtual OS subsystem — built into core.js.',
              'muted'
            ),
            makeLine(
              `Virtual filesystem: ${vfsStats.available ? 'enabled' : 'unavailable'}`,
              'output'
            ),
            makeLine(
              `Linux commands: ${Array.from(linuxRegistry.values()).filter(command => !command.isAlias).length}`,
              'output'
            ),
            makeLine(`VFS nodes: ${vfsStats.nodes}`, 'output'),
            makeLine(
              `Integrity issues: ${integrityIssues.length}`,
              integrityIssues.length ? 'danger' : 'output'
            ),
            makeLine(
              'Use `help` to view the complete unified command registry.',
              'muted'
            )
          ];
        }
        const target = resolveCommand(args[0]);
        if (!target) {
          return [
            makeLine(`No help available for ${args[0]}`, 'danger')
          ];
        }
        const lines = [
          makeLine(target.name, 'accent'),
          makeLine(target.usage || target.name)
        ];
        if (target.description) {
          lines.push(makeLine(target.description, 'muted'));
        }
        if (target.capability) {
          lines.push(
            makeLine(`Capability: ${target.capability}`, 'dim')
          );
        }
        if (target.aliases?.length) {
          lines.push(
            makeLine(`Aliases: ${target.aliases.join(', ')}`, 'dim')
          );
        }
        return lines;
      }
    });
    const makePackageCommandRunner = toolKey => async ({ args, ctx }) => {
      const packageApi = services.package || {};
      const requireRoot = action =>
        state.mode === 'root'
          ? null
          : [
              makeLine(
                `${toolKey} ${action} requires root. Run with sudo or su.`,
                'danger'
              )
            ];
      const runUpdateCommand = async () => {
        const now = new Date();
        let reindexed = 0;
        let repaired = 0;
        let skippedCorrupted = 0;
        let hashUpdated = 0;
        let externalQuarantined = 0;
        let hashUnavailable = 0;
        for (const [key, record] of state.pkgRegistry.entries()) {
          const next = {
            ...(record || {}),
            key
          };
          let changed = false;
          if (!next.manifest && next.metadata) {
            next.manifest = next.metadata;
            changed = true;
          }
          if (!next.status) {
            next.status = state.installedPackages.has(key)
              ? 'enabled'
              : 'known';
            changed = true;
          }
          if (next.status === 'corrupted') {
            skippedCorrupted++;
          }
          if (changed) {
            repaired++;
          }
          state.pkgRegistry.set(key, next);
          reindexed++;
        }
        let hashReport = { internalUpdated: 0, externalQuarantined: 0, unavailable: 0 };
        if (typeof packageApi.refreshPackageHashes === 'function') {
          try {
            hashReport = await packageApi.refreshPackageHashes(ctx) || hashReport;
            hashUpdated = Number(hashReport.internalUpdated) || 0;
            externalQuarantined = Number(hashReport.externalQuarantined) || 0;
            hashUnavailable = Number(hashReport.unavailable) || 0;
          } catch {
            hashUnavailable = reindexed;
          }
        }
        refreshStaticRuntimeState();
        refreshDynamicRuntimeState();
        syncLiveEntries();
        persistPackageRegistry();
        persistPackageCache();
        persist();
        return [
          makeLine(`${toolKey}: updating package lists...`, 'accent'),
          makeLine('Hit:1 local registry'),
          makeLine('Hit:2 local cache'),
          makeLine(
            `Reindexed: ${reindexed} record${reindexed === 1 ? '' : 's'}`
          ),
          makeLine(
            `Repaired: ${repaired} record${repaired === 1 ? '' : 's'}`
          ),
          makeLine(`Hash check: ${reindexed} package${reindexed === 1 ? '' : 's'} checked.`, 'muted'),
          hashUpdated ? makeLine(`${hashUpdated} internal package${hashUpdated === 1 ? '' : 's'} automatically updated.`, 'accent') : makeSpacer(),
          externalQuarantined ? makeLine(`${externalQuarantined} external package${externalQuarantined === 1 ? '' : 's'} quarantined because content/hash changed.`, 'danger') : makeSpacer(),
          hashUnavailable ? makeLine(`${hashUnavailable} package hash check${hashUnavailable === 1 ? '' : 's'} unavailable.`, 'muted') : makeSpacer(),
          skippedCorrupted
            ? makeLine(
                `Skipped: ${skippedCorrupted} corrupted package${skippedCorrupted === 1 ? '' : 's'}`,
                'danger'
              )
            : makeSpacer(),
          makeLine('Reading package lists... Done'),
          makeLine(`Last update: ${now.toLocaleString()}`, 'dim')
        ];
      };
      if (!args.length) {
        return [
          makeLine(
            `Usage: ${toolKey} <update|install|remove|reinstall|list|inspect|policy> [target]`,
            'danger'
          ),
          makeLine(
            `Use ${toolKey} update to refresh package lists.`,
            'muted'
          )
        ];
      }
      const sub = String(args[0] || '').toLowerCase();
      const target = args.slice(1).join(' ').trim();
      switch (sub) {
        case 'update': {
          const gate = requireRoot('update');
          return gate || runUpdateCommand();
        }
        case 'install': {
          const gate = requireRoot('install');
          if (gate) {
            return gate;
          }
          if (!target) {
            return [
              makeLine(
                `${toolKey} install: missing package name or URL`,
                'danger'
              )
            ];
          }
          let mode;
          try {
            mode = resolveInstallMode({
              toolKey,
              target,
              normalized: normalizeInstallSource(target)
            });
          } catch (error) {
            return packageFailLines(
              toolKey,
              getRemotePackageDisplayName(target),
              'source',
              error,
              {
                sourceType: 'invalid',
                installMode: 'invalid',
                transport: 'none'
              }
            );
          }
          if (mode === 'invalid') {
            return [
              makeLine(
                `E: ${toolKey} install: unsupported package source.`,
                'danger'
              ),
              makeLine(
                'APT supports exactly two install modes:',
                'muted'
              ),
              makeLine(
                '1. Internal: apt install <package>',
                'output'
              ),
              makeLine(
                '2. External HTTPS: apt install https://...',
                'output'
              )
            ];
          }
          return installPackage(
            target,
            {
              toolKey,
              installMode: mode
            },
            ctx
          );
        }
        case 'remove': {
          const gate = requireRoot('remove');
          return gate || (
            !target
              ? [
                  makeLine(
                    `${toolKey} remove: missing package name`,
                    'danger'
                  )
                ]
              : removePackage(target)
          );
        }
        case 'reinstall': {
          const gate = requireRoot('reinstall');
          return gate || reinstallPackages(ctx);
        }
        case 'list': {
          const inventory = typeof packageApi.getPackageInventory === 'function'
            ? packageApi.getPackageInventory()
            : Array.from(state.pkgRegistry.values());
          if (!inventory.length) return [makeLine('No package registry entries.', 'muted')];
          return inventory.map(pkg => {
            const external = !pkg.internal;
            const status = pkg.status || 'unknown';
            const cls = ['enabled','active'].includes(status) ? 'accent' : ['quarantined','corrupted','hash-changed'].includes(status) ? 'danger' : 'output';
            return makeLine(
              `${pkg.packageName || pkg.key}  [${pkg.internal ? 'internal' : 'external'}|${status}]  sandbox=${external ? 'yes' : 'no'}  hash=${pkg.hashStatus || 'unknown'}  ${pkg.version || pkg.manifest?.version || 'unknown'}`,
              cls
            );
          });
        }
        case 'inspect': {
          if (!target) return [makeLine(`${toolKey} inspect: missing package name`, 'danger')];
          const packageApi = services.package || {};
          const status = typeof packageApi.getPackageStatus === 'function' ? packageApi.getPackageStatus(target) : null;
          if (!status) return [makeLine(`No record for ${target}`, 'danger')];
          const lines = [
            makeLine(`Package: ${status.packageName}`, 'accent'),
            makeLine(`Type: ${status.internal ? 'Internal' : 'External'}`),
            makeLine(`Version: ${status.version || 'unknown'}`),
            makeLine(`Status: ${status.status || 'unknown'}`, ['enabled','active'].includes(status.status) ? 'accent' : ['quarantined','corrupted','hash-changed'].includes(status.status) ? 'danger' : 'output'),
            makeLine(`Enabled: ${status.enabled ? 'yes' : 'no'}`),
            makeLine(`Sandbox: ${status.internal ? 'not-applicable' : 'required'}`),
            makeLine(`Trusted: ${status.trusted ? 'yes' : 'no'}`),
            makeLine(`Quarantined: ${status.quarantined ? 'yes' : 'no'}`),
            makeLine(`Hash: ${status.hashCurrent ? status.hashCurrent : 'none'} (${status.hashStatus || 'unknown'})`, 'dim'),
            makeLine(`Trusted Hash: ${status.hashTrusted || 'none'}`, 'dim'),
            makeLine(`Approval: ${status.approvalRequired ? (status.approved ? 'approved' : 'required') : 'not-required'}`),
            makeLine(`Update: ${status.update ? 'yes' : 'no'}`),
            makeLine(`Install Mode: ${status.installMode || 'unknown'}`, 'dim'),
            makeLine(`Source Type: ${status.sourceKind || 'unknown'}`, 'dim'),
            makeLine(`Transport: ${status.transport || 'unknown'}`, 'dim'),
            makeLine(`Resolved: ${status.resolved || '(none)'}`, 'dim')
          ];
          if (!status.internal) lines.push(makeLine(`Antivirus: ${status.antivirus?.status || 'unknown'} | risk ${status.antivirus?.riskPercentage ?? 'n/a'}%`, 'output'));
          return lines;
        }
        case 'policy':
          return [
            makeLine('Package execution policy:', 'accent'),
            makeLine('Core/system commands have the highest execution priority.'),
            makeLine('Trusted internal MUNITOS packages execute without Antivirus or Sandbox limits.'),
            makeLine('External HTTPS packages always run in the external sandbox and require user approval before activation.'),
            makeLine('External package content/hash changes invalidate trust and quarantine the package.'),
            makeLine('Internal package hash changes are recorded as automatic updates without disabling execution.'),
            makeLine('The existing MUNITOS Y/N confirmation loop is used for external activation.')
          ];
        default:
          return [
            makeLine(
              `${toolKey}: unknown subcommand ${sub}`,
              'danger'
            )
          ];
      }
    };
    registerCommand('pkg', {
      description: 'Package console.',
      usage:
        'pkg <update|install|remove|reinstall|list|inspect|policy> [target]',
      run: makePackageCommandRunner('pkg')
    });
    registerCommand('apt', {
      description: 'APT-style package console.',
      usage:
        'apt <update|install|remove|reinstall|list|inspect|policy> [target]',
      run: makePackageCommandRunner('apt')
    });
    const R = (name, usage, description, run, aliases = []) => registerCommand(name, { description, usage, run, aliases });
    const authLine = (text, cls = 'output') => makeLine(text, cls);
    const beginSetPasswordFlow = (target, ctx) => {
      const flow = {
        step: 'new-password',
        _operationId: ctx?.operation?.id || null,
        next: async input => {
          const value = String(input ?? '');
          if (!setVirtualPassword(target, value)) return [authLine(`passwd: unable to update password for ${target}.`, 'danger')];
          clearActiveFlow();
          if (ctx?.operation) { ctx.operation.flowSession = null; ctx.operation.setStatus('RUNNING'); }
          return [authLine(value ? `passwd: password updated for ${target}.` : `passwd: password removed for ${target}.`, 'accent')];
        },
        cancel: async () => {
          clearActiveFlow();
          if (ctx?.operation) { ctx.operation.flowSession = null; ctx.operation.setStatus('RUNNING'); }
          return [authLine('passwd: cancelled.', 'muted')];
        },
        resume: () => [authLine('Enter the new password.', 'muted')],
        status: () => ({ active: true, finalized: false, step: 'new-password' })
      };
      if (ctx?.operation) {
        ctx.operation.flowSession = flow;
        ctx.operation.setStatus('WAITING');
        setActiveFlow(flow, ctx.operation);
      } else {
        setActiveFlow(flow, null);
      }
      (ctx?.append || appendTranscript)([authLine(`New password for ${target}:`, 'accent')]);
      return [];
    };
    R('sudo', 'sudo <command> [args...]', 'Run a command with temporary virtual root privileges.', async ({ args, ctx }) => {
      if (!state.session.authenticated) return [authLine('sudo: you are not logged in.', 'danger')];
      if (state.mode === 'ghost') return [authLine('sudo: Ghost mode cannot acquire root privileges.', 'danger')];
      if (!args.length) return [authLine('sudo: a command is required', 'danger')];
      const user = currentUser();
      if (!canSudo(user)) return [authLine(`sudo: ${user} is not in the sudoers file.`, 'danger')];
      const run = () => runAsRoot(() => core.runCommand(args.join(' '), ctx));
      if (state.mode === 'root') return run();
      if (!passwordConfigured(user)) return run();
      beginPasswordFlow({ title: `[sudo] password for ${user}:`, username: user, ctx, onSuccess: async () => run() });
      return [];
    });
    R('su', 'su [-l|-] [USER]', 'Switch to another virtual user with a restorable parent shell.', ({ args, ctx }) => {
      if (!state.session.authenticated) return [authLine('su: you are not logged in.', 'danger')];
      let loginShell = false;
      const values = args.filter(arg => {
        if (arg === '-' || arg === '-l' || arg === '--login') { loginShell = true; return false; }
        return true;
      });
      const target = String(values[0] || 'root').trim();
      if (target === 'ghost') {
        if (state.mode !== 'user') return [authLine('su: only a logged-in user can enter Ghost mode.', 'danger')];
        if (!enterGhost({ stack: true, resetHome: true })) return [authLine('su: cannot enter Ghost mode.', 'danger')];
        return [authLine('Switched to ghost.', 'accent')];
      }
      if (!state.users.has(target)) return [authLine(`su: user '${target}' does not exist`, 'danger')];
      if (target === currentUser()) return [authLine(`su: already running as ${target}.`, 'muted')];
      if (state.mode === 'ghost') return [authLine('su: Ghost mode cannot become root or another user.', 'danger')];
      const complete = () => {
        if (!pushIdentity()) return [authLine('su: unable to save parent shell state.', 'danger')];
        const changed = target === 'root'
          ? enterRoot({ resetHome: loginShell })
          : switchUser(target, { mode: 'user', resetHome: loginShell });
        if (!changed) {
          popIdentity();
          return [authLine(`su: cannot switch to '${target}'.`, 'danger')];
        }
        return [authLine(`Switched to ${target}.`, 'accent')];
      };
      if (currentUser() === 'root' || !passwordConfigured(target)) return complete();
      beginPasswordFlow({ title: `Password for ${target}:`, username: target, ctx, onSuccess: async () => complete() });
      return [];
    });
    R('login', 'login [user]', 'Authenticate a virtual user and create the one active login session.', ({ args, ctx }) => {
      if (state.session.authenticated) return [authLine(`login: already logged in as ${currentUser()}. Logout first.`, 'muted')];
      const target = String(args[0] || 'munitos').trim();
      if (!['munitos', 'root'].includes(target) || !state.users.has(target)) return [authLine(`login: ${target}: user not found`, 'danger')];
      const complete = () => {
        if (state.session.authenticated) return [authLine(`login: a session is already active for ${currentUser()}.`, 'danger')];
        if (!loginAs(target, { resetHome: true })) return [authLine(`login: ${target}: unable to create session`, 'danger')];
        state.sessions.set(state.session.tty, { tty: state.session.tty, username: target, loginAt: state.session.loginAt, pid: 2000, idle: 0, host: 'virtual' });
        return [authLine(`Last login: ${new Date(state.session.loginAt).toString()}`, 'muted'), authLine(`Welcome to MUNITOS, ${target}.`, 'accent')];
      };
      if (!passwordConfigured(target)) return complete();
      beginPasswordFlow({ title: `MUNITOS login: ${target}`, username: target, ctx, onSuccess: async () => complete() });
      return [];
    }, ['signin', 'auth']);
    R('logout', 'logout', 'Terminate the current virtual login session.', () => {
      if (!state.session.authenticated) return [authLine('logout: no active login session.', 'muted')];
      const previous = currentUser();
      logoutSession();
      return [authLine(`logout: ${previous}`, 'accent'), authLine('Session terminated. Use "login [USERNAME]" to authenticate.', 'muted')];
    }, ['signout', 'logoff']);
    R('passwd', 'passwd [USER]', 'Set or remove a virtual account password.', ({ args, ctx }) => {
      if (!state.session.authenticated) return [authLine('passwd: you are not logged in.', 'danger')];
      const target = String(args[0] || currentUser()).trim();
      const actor = currentUser();
      if (target === 'ghost' || !state.users.has(target)) return [authLine(`passwd: user '${target}' does not exist`, 'danger')];
      if (state.mode !== 'root' && target !== actor) return [authLine('passwd: permission denied', 'danger')];
      if (state.mode === 'root') return beginSetPasswordFlow(target, ctx);
      if (!passwordConfigured(actor)) return [authLine(`passwd: password for ${actor} is not set.`, 'muted')];
      beginPasswordFlow({
        title: `Current password for ${actor}:`,
        username: actor,
        ctx,
        onSuccess: async () => beginSetPasswordFlow(actor, ctx)
      });
      return [];
    }, ['password', 'chpass']);
    R('ghost', 'ghost', 'Enter or leave the isolated Ghost user mode.', () => {
      if (!state.session.authenticated) return [authLine('ghost: you are not logged in.', 'danger')];
      if (state.mode === 'ghost') {
        if (!popIdentity()) return [authLine('ghost: no parent user session is available.', 'danger')];
        return [authLine('Exited Ghost mode. Returned to previous user shell.', 'accent')];
      }
      if (state.mode !== 'user') return [authLine('ghost: only a logged-in user can enter Ghost mode.', 'danger')];
      if (!enterGhost({ stack: true, resetHome: true })) return [authLine('ghost: cannot enter Ghost mode from the current context.', 'danger')];
      return [authLine('Ghost mode enabled. Root transitions are blocked.', 'accent')];
    }, ['sandbox']);
    R('exit', 'exit', 'Exit the current elevated or Ghost shell and restore the parent shell when available.', () => {
      if (!state.session.authenticated) return [authLine('You are not logged in.', 'danger'), authLine('Use "login "user" or "login" to start a virtual session.', 'muted')];
      if (state.mode === 'ghost') {
        if (!popIdentity()) return [authLine('exit: no parent user shell is available.', 'muted')];
        return [authLine('Exited Ghost mode. Returned to previous user shell.', 'accent')];
      }
      if (state.identityStack.length) {
        if (!popIdentity()) return [authLine('exit: unable to restore the previous shell.', 'danger')];
        return [authLine('Returned to previous shell.', 'accent')];
      }
      if (state.mode === 'root') {
        logoutSession();
        return [authLine('Exited root login shell. Session terminated.', 'accent'), authLine('Use "login "user" or "login" to authenticate again.', 'muted')];
      }
      return [authLine('exit: no elevated or Ghost shell is active.', 'muted')];
    });
  };
  const registerCommand = core.registerCommand.bind(core);
  registerLinuxBridgeCommands();
  registerCoreCommands();
  window.MUNITOSCommandsReady = true;
  window.dispatchEvent(new Event('MUNITOSCommandsReady'));
})();
