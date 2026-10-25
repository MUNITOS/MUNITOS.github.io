(() => {
  'use strict';
  const FILE_VERSION='1.0';
  const createVFS = (state) => {
    const resolvePath = (inputPath, cwd = state.cwd) => {
      const raw = String(inputPath ?? '').trim();
      const base = raw.startsWith('/') ? [] : String(cwd).split('/').filter(Boolean);
      for (const seg of raw.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') {
          if (base.length) base.pop();
          continue;
        }
        base.push(seg);
      }
      return `/${base.join('/')}`;
    };
    const PKG = 'munitos-core';
    const VERSION=FILE_VERSION;
    const VFS_KEY='munitos:vfs:v1';
    const VFS_SCHEMA=1;
    const VFS_DB_NAME='munitos-vfs-v1';
    const VFS_DB_STORE='snapshots';
    const VFS_DB_VERSION=1;
    const REQUIRED_PATHS = [
      '/', '/bin', '/boot', '/dev', '/dev/pts', '/dev/shm', '/dev/mqueue', '/etc', '/etc/apt', '/etc/apt/sources.list.d',
      '/etc/network', '/etc/systemd', '/etc/systemd/system', '/etc/apt/trusted.gpg.d', '/etc/environment.d', '/etc/default', '/etc/dpkg', '/etc/logrotate.d', '/etc/cron.d', '/etc/X11', '/home', '/home/munitos', '/home/ghost', '/home/munitos/Desktop', '/home/munitos/Documents',
      '/home/munitos/Downloads', '/home/munitos/Music', '/home/munitos/Pictures', '/home/munitos/Public', '/home/munitos/Templates', '/home/munitos/Videos',
      '/home/munitos/.config', '/home/munitos/.local', '/home/munitos/.local/bin', '/home/munitos/.cache', '/media', '/mnt', '/mnt/browser', '/opt', '/proc', '/proc/browser', '/proc/munitos', '/root',
      '/run', '/run/lock', '/proc/self', '/run/systemd', '/run/systemd/system', '/run/user', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/usr/bin',
      '/usr/sbin', '/usr/local', '/usr/local/bin', '/usr/local/sbin', '/usr/include', '/usr/lib', '/usr/lib/systemd', '/usr/lib/systemd/system',
      '/usr/share', '/usr/share/applications', '/usr/share/doc', '/usr/share/doc/munitos', '/usr/share/icons', '/usr/share/man',
      '/usr/share/man/man1', '/usr/share/man/man5', '/usr/share/man/man8', '/var', '/var/cache', '/var/cache/apt', '/var/cache/apt/archives',
      '/var/log/apt', '/var/lib', '/var/lib/apt', '/var/lib/apt/lists', '/var/lib/dpkg', '/var/lib/dpkg/info', '/var/lib/dpkg/updates', '/var/lib/systemd', '/var/log', '/var/spool',
      '/var/spool/cron', '/var/spool/cron/crontabs', '/var/tmp', '/opt/munitos'
    ];
    const DEFAULT_FILE_CONTENTS = {
      '/ReadMe.txt': [
        'MUNITOS', '=========', 'A Web-first Linux-style terminal and virtual operating system environment, rebuilt for browser-native execution and designed to challenge modern WebOS architectures on speed, portability and isolation.', '',
        `Release      : ${VERSION}`, 'Distribution : MUNITOS GNU/Linux Rolling', 'Base         : Debian-style virtual userspace',
        'Architecture : x86_64', 'Shell        : /bin/bash', 'Terminal     : xterm-256color', '',
        'Persistent virtual filesystem, users, packages, processes, mounts, jobs and permissions.', '',
        'Root         : /', 'Home         : /home/munitos', 'Config       : /etc', 'Programs     : /usr/bin and /bin',
        'Logs         : /var/log', 'Temporary    : /tmp and /var/tmp', '',
        'Native kernel operations are isolated from the browser and represented by the MUNITOS virtual system layer.', '',
        'Project      : MUNITOS', 'Channel      : https://t.me/MUNITOS', ''
      ].join('\n'),
      '/etc/hostname': 'munitos\n',
      '/etc/hosts': '127.0.0.1\tlocalhost\n127.0.1.1\tmunitos\n::1\tlocalhost ip6-localhost ip6-loopback\n',
      '/etc/issue': 'MUNITOS GNU/Linux Rolling \n \l\n',
      '/etc/debian_version': 'testing/unstable\n',
      '/etc/os-release': 'PRETTY_NAME="MUNITOS GNU/Linux Rolling"\nNAME="MUNITOS"\nID=munitos\nID_LIKE=debian\nVERSION_ID="rolling"\nVERSION_CODENAME=rolling\nHOME_URL="https://t.me/MUNITOS"\n',
      '/etc/lsb-release': 'DISTRIB_ID=MUNITOS\nDISTRIB_RELEASE=rolling\nDISTRIB_CODENAME=rolling\nDISTRIB_DESCRIPTION="MUNITOS GNU/Linux Rolling"\n',
      '/etc/motd': 'Welcome to MUNITOS GNU/Linux Rolling.\n',
      '/etc/shells': '/bin/sh\n/bin/bash\n/bin/rbash\n',
      '/etc/environment': 'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n',
      '/etc/profile': 'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nexport LANG="C.UTF-8"\n',
      '/etc/bash.bashrc': '# System-wide Bash configuration for MUNITOS\n',
      '/etc/fstab': '# MUNITOS virtual filesystem table\n/dev/vda1 / ext4 rw,relatime 0 1\n/dev/vda2 none swap sw 0 0\n',
      '/etc/resolv.conf': 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n',
      '/etc/hosts.allow': 'ALL: 127.0.0.1\n',
      '/etc/nsswitch.conf': 'passwd: files\ngroup: files\nshadow: files\nhosts: files dns\nnetworks: files\nservices: files\n',
      '/etc/group': 'root:x:0:\nmunitos:x:1000:munitos\nsudo:x:27:munitos\nusers:x:100:munitos\n',
      '/etc/gshadow': 'root:::\nmunitos:::\nsudo::munitos\nusers::munitos\n',
      '/etc/subuid': 'munitos:100000:65536\n',
      '/etc/subgid': 'munitos:100000:65536\n',
      '/etc/login.defs': 'MAIL_DIR /var/mail\nPASS_MAX_DAYS 99999\nPASS_MIN_DAYS 0\nPASS_WARN_AGE 7\nUID_MIN 1000\nGID_MIN 1000\n',
      '/etc/securetty': 'console\ntty1\ntty2\ntty3\ntty4\ntty5\ntty6\n',
      '/etc/apt/sources.list': 'deb [trusted=yes] file:/var/lib/munitos/packages ./\n',
      '/etc/apt/apt.conf': 'Acquire::Retries "3";\nAPT::Install-Recommends "1";\n',
      '/etc/apt/preferences': '# MUNITOS virtual APT preferences\n',
      '/etc/apt/trusted.gpg.d/munitos-archive-keyring.gpg': 'VIRTUAL-KEYRING\n',
      '/etc/network/interfaces': 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n',
      '/etc/systemd/system/munitos.target': '[Unit]\nDescription=MUNITOS virtual default target\nRequires=basic.target\nAfter=basic.target\n',
      '/etc/systemd/system/getty@.service': '[Unit]\nDescription=Virtual Getty\n[Service]\nExecStart=/sbin/agetty --noclear %I $TERM\n',
      '/etc/sysctl.conf': 'net.ipv4.ip_forward=0\nnet.ipv6.conf.all.forwarding=0\n',
      '/etc/timezone': 'UTC\n',
      '/etc/locale.gen': 'C.UTF-8 UTF-8\nen_US.UTF-8 UTF-8\n',
      '/etc/default/keyboard': 'XKBMODEL="pc105"\nXKBLAYOUT="us"\nXKBVARIANT=""\nXKBOPTIONS=""\n',
      '/etc/packages.conf': `PKG_NAME=${PKG}\nVERSION=${VERSION}\nAUTHOR=MUNITOS\nARCH=x86_64\nFORMAT=virtual-package-db\n`,
      '/etc/localStorage.txt': (()=>{try{return Object.entries(globalThis.localStorage || {}).map(([k,v])=>`${k}=${v}`).join('\n') || 'empty\n'}catch{return 'unavailable\n'}})(),
      '/etc/cookies.txt': (()=>{try{return document.cookie || 'empty\n'}catch{return 'unavailable\n'}})(),
      '/etc/sw.txt': (()=>{try{const sw=navigator?.serviceWorker;return sw ? `serviceWorker supported\ncontroller: ${sw.controller ? 'yes' : 'no'}\n` : 'serviceWorker not supported\n'}catch{return 'unavailable\n'}})(),
      '/etc/sysinfo.conf': `hostname=munitos\narch=${state.cpu.architecture}\ncpu=${state.cpu.cpuCount}\nmemory=${state.memory.totalMB}MB\nshell=/bin/bash\nterminal=xterm-256color\n`,
      '/etc/environment.d/10-munitos.conf': 'LANG=C.UTF-8\nLC_ALL=C.UTF-8\n',
      '/etc/issue.net': 'MUNITOS GNU/Linux Rolling\n',
      '/etc/dpkg/dpkg.cfg': 'no-debsig\nlog /var/log/dpkg.log\n',
      '/etc/dpkg/status': `Package: munitos-core\nStatus: install ok installed\nVersion: ${VERSION}\nArchitecture: all\nDescription: MUNITOS virtual operating system core\n`,
      '/etc/logrotate.conf': 'weekly\nrotate 4\ncreate\ninclude /etc/logrotate.d\n',
      '/etc/cron.d/README': 'Virtual cron configuration directory.\n',
      '/home/munitos/.bashrc': 'export PATH="$HOME/.local/bin:$PATH"\nalias ll="ls -la"\nalias la="ls -A"\nalias l="ls -CF"\n[ -f "$HOME/.profile" ] && . "$HOME/.profile"\n',
      '/home/munitos/.profile': 'export LANG=C.UTF-8\nexport EDITOR=vi\nexport VISUAL=vi\n',
      '/home/munitos/.bash_logout': 'clear 2>/dev/null || true\n',
      '/home/munitos/.inputrc': 'set completion-ignore-case on\nset show-all-if-ambiguous on\n',
      '/home/munitos/.selected_editor': 'SELECTED_EDITOR="/usr/bin/vim.basic"\n',
      '/home/munitos/.gitconfig': '[user]\n\tname = MUNITOS User\n\temail = munitos@munitos.local\n[core]\n\tautocrlf = input\n',
      '/home/munitos/.config/munitos.conf': '[terminal]\ntype=xterm-256color\n[filesystem]\npersistence=localStorage+indexedDB\ncache=munitos-package-runtime-v1\n',
      '/home/munitos/Desktop/README.txt': 'Desktop directory for the virtual MUNITOS user.\n',
      '/home/munitos/Documents/README.txt': 'Documents directory for the virtual MUNITOS user.\n',
      '/home/munitos/Downloads/README.txt': 'Downloads directory for the virtual MUNITOS user.\n',
      '/home/munitos/Music/README.txt': 'Music directory for the virtual MUNITOS user.\n',
      '/home/munitos/Pictures/README.txt': 'Pictures directory for the virtual MUNITOS user.\n',
      '/home/munitos/Public/README.txt': 'Public directory for the virtual MUNITOS user.\n',
      '/home/munitos/Templates/README.txt': 'Templates directory for the virtual MUNITOS user.\n',
      '/home/munitos/Videos/README.txt': 'Videos directory for the virtual MUNITOS user.\n',
      '/home/munitos/.local/bin/munitos-info': '#!/bin/bash\nprintf "%s\n" "MUNITOS GNU/Linux Rolling"\n',
      '/home/munitos/.local/bin/update-system': '#!/bin/bash\nprintf "%s\n" "Virtual update routine"\n',
      '/usr/bin/env': '#!/bin/sh\nexec "$@"\n',
      '/usr/bin/which': '#!/bin/sh\nprintf "%s\n" "$1"\n',
      '/usr/bin/true': '#!/bin/sh\nexit 0\n',
      '/usr/bin/false': '#!/bin/sh\nexit 1\n',
      '/usr/bin/clear': '#!/bin/sh\nprintf \"\\033c\"\n',
      '/usr/bin/hostname': '#!/bin/sh\nprintf "%s\n" "munitos"\n',
      '/usr/bin/id': '#!/bin/sh\nprintf "%s\n" "uid=1000(munitos) gid=1000(munitos) groups=1000(munitos),27(sudo),100(users)"\n',
      '/usr/bin/python3': '#!/bin/sh\nexit 0\n',
      '/usr/bin/whoami': '#!/bin/sh\nprintf "%s\n" "munitos"\n',
      '/usr/bin/basename': '#!/bin/sh\nprintf "%s\n" "${1##*/}"\n',
      '/usr/bin/dirname': '#!/bin/sh\nprintf "%s\n" "${1%/*}"\n',
      '/usr/bin/printf': '#!/bin/sh\nprintf "$@"\n',
      '/usr/bin/sha256sum': '#!/bin/sh\nprintf "%s  %s\n" "virtual-sha256" "$1"\n',
      '/usr/bin/md5sum': '#!/bin/sh\nprintf "%s  %s\n" "virtual-md5" "$1"\n',
      '/usr/bin/awk': '#!/bin/sh\nexit 0\n',
      '/usr/bin/sed': '#!/bin/sh\nexit 0\n',
      '/usr/bin/grep': '#!/bin/sh\nexit 0\n',
      '/usr/bin/sort': '#!/bin/sh\nexit 0\n',
      '/usr/bin/head': '#!/bin/sh\nexit 0\n',
      '/usr/bin/tail': '#!/bin/sh\nexit 0\n',
      '/usr/bin/wc': '#!/bin/sh\nexit 0\n',
      '/usr/bin/cut': '#!/bin/sh\nexit 0\n',
      '/usr/bin/xargs': '#!/bin/sh\nexec "$@"\n',
      '/usr/sbin/agetty': '#!/bin/sh\nexit 0\n',
      '/usr/sbin/service': '#!/bin/sh\nprintf "%s\n" "Virtual service manager"\n',
      '/usr/sbin/update-initramfs': '#!/bin/sh\nprintf "%s\n" "Virtual initramfs update"\n',
      '/usr/sbin/sshd': '#!/bin/sh\nexit 0\n',
      '/usr/local/bin/munitos-banner': '#!/bin/bash\nprintf "%s\n" "MUNITOS GNU/Linux Rolling"\n',
      '/usr/local/bin/system-info': '#!/bin/bash\nprintf "%s\n" "MUNITOS system information"\n',
      '/usr/local/sbin/vfs-check': '#!/bin/bash\nprintf "%s\n" "Virtual filesystem integrity check"\n',
      '/usr/share/doc/munitos/README.Debian': 'MUNITOS virtual package and filesystem notes.\n',
      '/usr/share/doc/munitos/changelog': 'munitos (3.2.0) virtual rolling; urgency=medium\n\n  * Expanded the initial userspace filesystem image.\n\n -- MUNITOS <munitos@munitos.local>  Mon, 07 Sep 2026 00:00:00 +0000\n',
      '/usr/share/doc/munitos/copyright': 'Copyright: MUNITOS project\nLicense: project distribution terms\n',
      '/usr/share/doc/munitos/NEWS': 'MUNITOS virtual userspace image initialized.\n',
      '/usr/share/applications/munitos-terminal.desktop': '[Desktop Entry]\nName=MUNITOS Terminal\nComment=MUNITOS virtual terminal\nTerminal=true\nType=Application\nCategories=System;TerminalEmulator;\n',
      '/usr/share/man/man1/bash.1': '.TH BASH 1\n.SH NAME\nbash \- virtual shell entry point\n',
      '/usr/share/man/man1/ls.1': '.TH LS 1\n.SH NAME\nls \- list directory contents\n',
      '/usr/share/man/man1/cat.1': '.TH CAT 1\n.SH NAME\ncat \- concatenate and display files\n',
      '/usr/share/man/man1/apt.1': '.TH APT 1\n.SH NAME\napt \- virtual package manager interface\n',
      '/usr/share/man/man5/fstab.5': '.TH FSTAB 5\n.SH NAME\nfstab \- virtual filesystem table\n',
      '/usr/share/man/man5/passwd.5': '.TH PASSWD 5\n.SH NAME\npasswd \- virtual user account database\n',
      '/usr/share/man/man8/mount.8': '.TH MOUNT 8\n.SH NAME\nmount \- manage virtual filesystem mounts\n',
      '/usr/share/man/man8/ldconfig.8': '.TH LDCONFIG 8\n.SH NAME\nldconfig \- virtual dynamic linker cache manager\n',
      '/var/log/syslog': 'MUNITOS initialized\nvirtual kernel session started\nfilesystem mounted: /\n',
      '/var/log/auth.log': 'MUNITOS authentication subsystem initialized\n',
      '/var/log/dpkg.log': '2026-09-07 00:00:00 startup archives install munitos-core\n',
      '/var/log/apt/history.log': `Start-Date: 2026-09-07 00:00:00\nCommandline: apt install munitos-core\nInstall: munitos-core:all (${VERSION})\nEnd-Date: 2026-09-07 00:00:00\n`,
      '/var/log/apt/term.log': 'MUNITOS virtual APT session\n',
      '/var/log/kern.log': 'MUNITOS virtual kernel log\n',
      '/var/log/daemon.log': 'MUNITOS virtual daemon log\n',
      '/var/log/boot.log': '[ OK ] Started MUNITOS virtual boot sequence.\n',
      '/var/log/cron.log': 'MUNITOS virtual cron service initialized\n',
      '/var/lib/dpkg/status': `Package: munitos-core\nStatus: install ok installed\nVersion: ${VERSION}\nArchitecture: all\n\n`,
      '/var/lib/dpkg/available': `Package: munitos-core\nVersion: ${VERSION}\nArchitecture: all\n`,
      '/var/lib/dpkg/updates/README': 'Virtual dpkg update queue.\n',
      '/var/lib/apt/extended_states': 'Auto-Installed: false\n',
      '/var/lib/apt/lists/README': 'Virtual package index directory.\n',
      '/var/cache/apt/pkgcache.bin': 'VIRTUAL-APT-CACHE\n',
      '/var/cache/apt/srcpkgcache.bin': 'VIRTUAL-SRC-CACHE\n',
      '/var/cache/apt/archives/README': 'Downloaded virtual packages are represented here.\n',
      '/var/spool/cron/crontabs/README': 'Virtual user cron spool.\n',
      '/var/tmp/README': 'Temporary files survive until explicitly removed in the virtual filesystem.\n',
      '/boot/README': 'Virtual boot directory.\n',
      '/boot/config-6.12.x-munitos-amd64': 'CONFIG_VIRTUAL_MUNITOS=y\nCONFIG_VIRTUAL_FS=y\nCONFIG_VIRTUAL_NET=y\n',
      '/boot/System.map-6.12.x-munitos-amd64': 'Virtual kernel symbol table\n',
      '/boot/vmlinuz-6.12.x-munitos-amd64': 'VIRTUAL-KERNEL-IMAGE\n',
      '/boot/initrd.img-6.12.x-munitos-amd64': 'VIRTUAL-INITRAMFS\n',
      '/usr/include/munitos.h': `#ifndef MUNITOS_H\n#define MUNITOS_H\n#define MUNITOS_VERSION "${VERSION}"\n#endif\n`,
      '/usr/include/stdio.h': 'VIRTUAL-STDLIB-HEADER\n',
      '/usr/lib/os-release': 'MUNITOS GNU/Linux Rolling\n',
      '/usr/lib/systemd/system/munitos-log.service': '[Unit]\nDescription=MUNITOS virtual logging service\n[Service]\nType=oneshot\nExecStart=/usr/bin/true\n',
      '/usr/lib/systemd/system/munitos-security.service': '[Unit]\nDescription=MUNITOS security subsystem\n[Service]\nType=oneshot\nExecStart=/usr/bin/true\n',
      '/opt/munitos/README.txt': 'MUNITOS optional software prefix.\n',
      '/srv/README.txt': 'Virtual service data root.\n',
      '/proc/version': 'Linux version 6.12.x-munitos-amd64 (MUNITOS Virtual Kernel) #1 SMP PREEMPT_DYNAMIC\n',
      '/proc/cmdline': 'BOOT_IMAGE=/vmlinuz-6.12.x-munitos-amd64 root=/dev/vda1 ro quiet\n',
      '/proc/filesystems': 'nodev\tsysfs\nnodev\tproc\nnodev\ttmpfs\next4\n',
      '/proc/uptime': '0.00 0.00\n',
      '/proc/loadavg': '0.00 0.00 0.00 1/1 2000\n',
      '/proc/meminfo': `MemTotal:       ${state.memory.totalMB * 1024} kB\nMemFree:        ${Math.floor(state.memory.totalMB * 768)} kB\nBuffers:        65536 kB\nCached:         131072 kB\n`,
      '/proc/cpuinfo': `processor\t: 0\nvendor_id\t: MUNITOS\nmodel name\t: ${state.cpu.model}\n`,
      '/proc/self/status': 'Name:  munitos\nState:  R (running)\nUid:  1000\t1000\t1000\t1000\nGid:  1000\t1000\t1000\t1000\n',
      '/sys/README': 'Virtual sysfs root.\n',
      '/dev/README': 'Virtual device filesystem. Native device nodes are isolated.\n',
      '/run/README': 'Virtual runtime state.\n',
      '/tmp/README': 'Temporary virtual workspace.\n',
      '/mnt/browser/README.txt': 'Browser-backed filesystem adapter. Import or export real browser File/Directory handles through the VFS browser API.\n',
      '/proc/browser/capabilities.json': '{}\n',
      '/proc/browser/storage.json': '{}\n'
    };
    const DEFAULT_SYMLINKS = Object.freeze({
      '/bin/sh': '/bin/bash',
      '/bin/rbash': '/bin/bash',
      '/bin/dash': '/bin/sh',
      '/usr/bin/sh': '/bin/sh',
      '/usr/bin/bash': '/bin/bash',
      '/usr/bin/rbash': '/bin/rbash',
      '/usr/share/doc/current': '/usr/share/doc/munitos',
      '/usr/share/man/current': '/usr/share/man'
    });
    const DEFAULT_FIFOS = Object.freeze(['/dev/log', '/run/systemd/notify']);
    const DEFAULT_EXECUTABLES = new Set([
      '/home/munitos/.local/bin/munitos-info', '/home/munitos/.local/bin/update-system', '/usr/bin/env', '/usr/bin/which', '/usr/bin/true',
      '/usr/bin/false', '/usr/bin/clear', '/usr/bin/hostname', '/usr/bin/id', '/usr/bin/python3', '/usr/bin/whoami', '/usr/bin/basename',
      '/usr/bin/dirname', '/usr/bin/printf', '/usr/bin/sha256sum', '/usr/bin/md5sum', '/usr/bin/awk', '/usr/bin/sed', '/usr/bin/grep',
      '/usr/bin/sort', '/usr/bin/head', '/usr/bin/tail', '/usr/bin/wc', '/usr/bin/cut', '/usr/bin/xargs', '/usr/sbin/agetty',
      '/usr/sbin/service', '/usr/sbin/update-initramfs', '/usr/sbin/sshd', '/usr/local/bin/munitos-banner', '/usr/local/bin/system-info',
      '/usr/local/sbin/vfs-check', '/bin/bash'
    ]);
    const virtualFileRegistry = new Map();
  const registerVirtualFile = (
    path,
    content = '',
    options = {}
  ) => {
    const key =
      String(path ?? '').trim();
    if (!key) return false;
    virtualFileRegistry.set(
      key,
      Object.freeze({
        path: key,
        content,
        mode: options.mode
      })
    );
    return true;
  };
  for (
    const [path, content]
    of Object.entries(DEFAULT_FILE_CONTENTS)
  ) {
    registerVirtualFile(
      path,
      content,
      {
        mode:
          DEFAULT_EXECUTABLES.has(path)
            ? 0o755
            : 0o644
      }
    );
  }
  const DEFAULT_VIRTUAL_FILES =
    Object.freeze(
      Array.from(
        virtualFileRegistry.values()
      )
    );
  const REQUIRED_FILES =
    Object.freeze(
      DEFAULT_VIRTUAL_FILES.map(
        file => file.path
      )
    );
    const now = () => Date.now();
    const rootNode = { kind: 'dir', name: '', parent: null, mode: 0o755, uid: 0, gid: 0, size: 0, createdAt: now(), modifiedAt: now(), accessedAt: now(), attributes: new Set(), acl: new Map(), children: new Map() };
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const byteLength = value => value instanceof Uint8Array ? value.length : encoder.encode(String(value ?? '')).length;
    const toBytes = value => value instanceof Uint8Array ? new Uint8Array(value) : value instanceof ArrayBuffer ? new Uint8Array(value.slice(0)) : encoder.encode(String(value ?? ''));
    const fromBytes = value => {
      try {
        return decoder.decode(toBytes(value));
      } catch {
        return '';
      }
    };
    const bytesToHex = bytes => Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');
    const normalizePath = path => {
      const input = String(path ?? '').trim();
      if (!input) return state.cwd;
      const absolute = input.startsWith('/') ? input : `${state.cwd}/${input}`;
      const parts = [];
      for (const piece of absolute.split('/')) {
        if (!piece || piece === '.') continue;
        if (piece === '..') parts.length && parts.pop();
        else parts.push(piece);
      }
      return `/${parts.join('/')}`;
    };
    const splitParent = path => {
      const normalized = normalizePath(path);
      if (normalized === '/') return { parentPath: '/', name: '' };
      const index = normalized.lastIndexOf('/');
      return { parentPath: index <= 0 ? '/' : normalized.slice(0, index), name: normalized.slice(index + 1) };
    };
    const makeDir = (name, parent = null, mode = 0o755, uid = 1000, gid = 1000) => ({ kind: 'dir', name, parent, mode, uid, gid, size: 0, createdAt: Date.now(), modifiedAt: Date.now(), accessedAt: Date.now(), attributes: new Set(), acl: new Map(), children: new Map() });
    const makeFile = (name, parent = null, data = '', mode = 0o644, uid = 1000, gid = 1000) => ({ kind: 'file', name, parent, mode, uid, gid, data: new Uint8Array(toBytes(data)), size: byteLength(data), createdAt: Date.now(), modifiedAt: Date.now(), accessedAt: Date.now(), attributes: new Set(), acl: new Map() });
    const makeSymlink = (name, parent, target) => ({ kind: 'symlink', name, parent, target, mode: 0o777, uid: 1000, gid: 1000, size: byteLength(target), createdAt: Date.now(), modifiedAt: Date.now(), accessedAt: Date.now(), attributes: new Set(), acl: new Map() });
    const makeFifo = (name, parent) => ({ kind: 'fifo', name, parent, mode: 0o644, uid: 1000, gid: 1000, size: 0, createdAt: Date.now(), modifiedAt: Date.now(), accessedAt: Date.now(), attributes: new Set(), acl: new Map(), queue: [] });
    const createSerializedNode = node => {
      const obj = { kind: node.kind, name: String(node.name ?? ''), mode: Number(node.mode) || 0, uid: Number(node.uid) || 0, gid: Number(node.gid) || 0, size: Number(node.size) || 0, createdAt: Number(node.createdAt) || Date.now(), modifiedAt: Number(node.modifiedAt) || Date.now(), accessedAt: Number(node.accessedAt) || Date.now(), attributes: Array.from(node.attributes || []), acl: Object.fromEntries((node.acl || new Map()).entries()) };
      if (node.kind === 'file') obj.data = Array.from(toBytes(node.data));
      if (node.browserMeta) obj.browserMeta = { ...node.browserMeta };
      if (node.kind === 'symlink') obj.target = String(node.target ?? '');
      if (node.kind === 'dir') obj.children = {};
      if (node.kind === 'fifo') obj.queue = Array.isArray(node.queue) ? node.queue.map(value => String(value ?? '')) : [];
      return obj;
    };
    const serializeNode = node => {
      const root = createSerializedNode(node);
      const stack = [{ node, output: root }];
      while (stack.length) {
        const { node: current, output } = stack.pop();
        if (current.kind !== 'dir' || !(current.children instanceof Map)) continue;
        for (const [key, child] of current.children.entries()) {
          const safeKey = String(key);
          const childOutput = createSerializedNode(child);
          output.children[safeKey] = childOutput;
          stack.push({ node: child, output: childOutput });
        }
      }
      return root;
    };
    const createDeserializedNode = (obj, parent = null) => {
      if (!obj || !['dir', 'file', 'symlink', 'fifo'].includes(obj.kind)) return null;
      const now = Date.now();
      const node = { kind: obj.kind, name: String(obj.name ?? ''), parent, mode: Number.isFinite(Number(obj.mode)) ? Number(obj.mode) : 0o644, uid: Number.isFinite(Number(obj.uid)) ? Number(obj.uid) : 1000, gid: Number.isFinite(Number(obj.gid)) ? Number(obj.gid) : 1000, size: Number.isFinite(Number(obj.size)) ? Number(obj.size) : 0, createdAt: Number(obj.createdAt) || now, modifiedAt: Number(obj.modifiedAt) || now, accessedAt: Number(obj.accessedAt) || now, attributes: new Set(Array.isArray(obj.attributes) ? obj.attributes.map(String) : []), acl: new Map(Object.entries(obj.acl && typeof obj.acl === 'object' ? obj.acl : {})) };
      if (obj.kind === 'file') node.data = new Uint8Array(Array.isArray(obj.data) ? obj.data.map(value => Number(value) & 255) : []);
      if (obj.browserMeta && typeof obj.browserMeta === 'object') node.browserMeta = { ...obj.browserMeta };
      if (obj.kind === 'symlink') node.target = String(obj.target ?? '');
      if (obj.kind === 'fifo') node.queue = Array.isArray(obj.queue) ? obj.queue.map(value => String(value ?? '')) : [];
      if (obj.kind === 'dir') node.children = new Map();
      return node;
    };
    const deserializeNode = (obj, parent = null) => {
      const root = createDeserializedNode(obj, parent);
      if (!root) return null;
      let count = 1;
      const stack = [{ source: obj, output: root }];
      while (stack.length) {
        const { source, output } = stack.pop();
        if (output.kind !== 'dir') continue;
        const children = source.children && typeof source.children === 'object' && !Array.isArray(source.children) ? source.children : {};
        for (const [key, value] of Object.entries(children)) {
          if (++count > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
          const child = createDeserializedNode(value, output);
          if (child && key && child.name === key) {
            output.children.set(key, child);
            stack.push({ source: value, output: child });
          }
        }
      }
      return root;
    };
    const VFS_MAX_FILE_BYTES = 8 * 1024 * 1024;
    const VFS_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    const VFS_MAX_NODES = 100000;
    const persistence = {
      localLoaded: false,
      idbHydrating: false,
      idbHydrated: false,
      writeTimer: null,
      ready: Promise.resolve(false),
      batchDepth: 0,
      dirty: false,
      flushing: false,
      flushScheduled: false,
      localWrites: 0,
      idbWrites: 0,
      lastSnapshotBytes: 0,
      revision: 0,
      nodeEstimate: 1,
      optimizer: globalThis.MUNITOSOptimizer || null
    };
    const replaceRoot = loaded => {
      if (!loaded || loaded.kind !== 'dir') return false;
      rootNode.children = loaded.children;
      rootNode.mode = loaded.mode;
      rootNode.uid = loaded.uid;
      rootNode.gid = loaded.gid;
      rootNode.size = loaded.size;
      rootNode.createdAt = loaded.createdAt;
      rootNode.modifiedAt = loaded.modifiedAt;
      rootNode.accessedAt = loaded.accessedAt;
      rootNode.attributes = loaded.attributes;
      rootNode.acl = loaded.acl;
      for (const child of rootNode.children.values()) child.parent = rootNode;
      let count = 1;
      const stack = [rootNode];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (node !== rootNode) count++;
        if (node.kind === 'dir' && node.children instanceof Map) for (const child of node.children.values()) stack.push(child);
      }
      persistence.nodeEstimate = count;
      return true;
    };
    const estimateCurrentBytes = () => {
      try { return Math.max(0, recursiveSize(rootNode)); } catch { return Number(rootNode.size) || 0; }
    };
    const validateBudget = () => {
      if (persistence.nodeEstimate > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
      const bytes = estimateCurrentBytes();
      if (bytes > VFS_MAX_TOTAL_BYTES) throw new Error('VFS_STORAGE_LIMIT');
      return { nodes: persistence.nodeEstimate, bytes };
    };
    const serializeSnapshot = async () => {
      const budget = validateBudget();
      const snapshot = { schema: VFS_SCHEMA, root: serializeNode(rootNode), savedAt: Date.now(), version: VERSION, budget };
      const raw = persistence.optimizer?.serialize
        ? await persistence.optimizer.serialize(snapshot, { workerThreshold: 49152, forceWorker: true, timeout: 15000 })
        : JSON.stringify(snapshot);
      persistence.lastSnapshotBytes = raw.length;
      return raw;
    };
    const openVfsDb = () => new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const request = indexedDB.open(VFS_DB_NAME, VFS_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(VFS_DB_STORE)) db.createObjectStore(VFS_DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('VFS_IDB_OPEN_FAILED'));
      } catch (error) { reject(error); }
    });
    const saveIdbSnapshot = data => openVfsDb().then(db => {
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(VFS_DB_STORE, 'readwrite');
          tx.objectStore(VFS_DB_STORE).put(data, 'current');
          tx.oncomplete = () => { db.close(); persistence.idbWrites++; resolve(true); };
          tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
        } catch { db.close(); resolve(false); }
      });
    }).catch(() => false);
    const readIdbSnapshot = () => openVfsDb().then(db => {
      if (!db) return null;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(VFS_DB_STORE, 'readonly');
          const request = tx.objectStore(VFS_DB_STORE).get('current');
          request.onsuccess = () => { db.close(); resolve(request.result || null); };
          request.onerror = () => { db.close(); resolve(null); };
        } catch { db.close(); resolve(null); }
      });
    }).catch(() => null);
    const flushPersistence = async () => {
      if (persistence.flushing || !persistence.dirty || persistence.idbHydrating) return false;
      persistence.flushing = true;
      persistence.flushScheduled = false;
      const revision = persistence.revision;
      try {
        const pressure = persistence.optimizer?.memoryPressure?.() || 'unknown';
        if (pressure === 'critical') {
          persistence.writeTimer = setTimeout(() => { void flushPersistence(); }, 750);
          persistence.flushScheduled = true;
          return false;
        }
        const payload = await serializeSnapshot();
        let localSaved = false;
        try {
          if (window.localStorage) {
            window.localStorage.setItem(VFS_KEY, payload);
            persistence.localWrites++;
            localSaved = true;
          }
        } catch {}
        let idbSaved = false;
        if (persistence.idbHydrated || !persistence.localLoaded) {
          idbSaved = await saveIdbSnapshot(payload);
        }
        const saved = localSaved || idbSaved;
        const stale = saved && revision !== persistence.revision;
        persistence.dirty = saved ? stale : true;
        if (stale && !persistence.idbHydrating) schedulePersistence(160);
        return saved;
      } catch {
        return false;
      } finally {
        persistence.flushing = false;
      }
    };
    const schedulePersistence = (delay = 160) => {
      persistence.dirty = true;
      if (persistence.batchDepth > 0 || persistence.flushScheduled) return true;
      persistence.flushScheduled = true;
      if (persistence.optimizer?.schedule) {
        persistence.writeTimer = persistence.optimizer.schedule(() => { void flushPersistence(); }, { delay });
      } else {
        persistence.writeTimer = setTimeout(() => { void flushPersistence(); }, delay);
      }
      return true;
    };
    const persistVFS = (options = {}) => {
      const immediate = options === true || options?.immediate === true;
      persistence.revision++;
      persistence.dirty = true;
      if (persistence.batchDepth > 0) return true;
      if (immediate) {
        if (persistence.flushing) {
          schedulePersistence(0);
          return true;
        }
        void flushPersistence();
        return true;
      }
      return schedulePersistence(Number(options?.delay) || 160);
    };
    const beginBatch = () => { persistence.batchDepth++; return persistence.batchDepth; };
    const endBatch = async ({ flush = true } = {}) => {
      persistence.batchDepth = Math.max(0, persistence.batchDepth - 1);
      if (persistence.batchDepth === 0 && flush && persistence.dirty) await flushPersistence();
      return persistence.batchDepth;
    };
    const loadVFS = () => {
      try {
        if (!window.localStorage) return false;
        const raw = window.localStorage.getItem(VFS_KEY);
        if (!raw || raw.length > VFS_MAX_TOTAL_BYTES * 2) return false;
        const data = JSON.parse(raw);
        if (!data?.root || Number(data.schema) !== VFS_SCHEMA) return false;
        const loaded = deserializeNode(data.root);
        if (!replaceRoot(loaded)) return false;
        validateBudget();
        persistence.localLoaded = true;
        return true;
      } catch { return false; }
    };
    const hydrateFromIndexedDB = async () => {
      persistence.idbHydrating = true;
      try {
        if (!persistence.localLoaded) {
          const raw = await readIdbSnapshot();
          if (raw) {
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (data?.root && Number(data.schema) === VFS_SCHEMA) {
              const loaded = deserializeNode(data.root);
              if (replaceRoot(loaded)) {
                try {
                  validateBudget();
                  repairVFS();
                  persistence.localLoaded = true;
                } catch {
                  persistence.localLoaded = false;
                }
                if (!persistence.localLoaded) {
                  rootNode.children.clear();
                  persistence.nodeEstimate = 1;
                } else {
                  persistence.dirty = true;
                }
              }
            }
          }
        }
      } catch {}
      persistence.idbHydrating = false;
      persistence.idbHydrated = true;
      if (persistence.dirty) schedulePersistence(250);
      return persistence.idbHydrated;
    };
    const browserCapabilities = () => {
      const nav = typeof navigator !== 'undefined' ? navigator : {};
      const storage = nav.storage || null;
      return Object.freeze({
        fileSystemAccess: typeof window.showOpenFilePicker === 'function' || typeof window.showDirectoryPicker === 'function' || typeof window.showSaveFilePicker === 'function',
        openFilePicker: typeof window.showOpenFilePicker === 'function',
        directoryPicker: typeof window.showDirectoryPicker === 'function',
        saveFilePicker: typeof window.showSaveFilePicker === 'function',
        opfs: Boolean(storage && typeof storage.getDirectory === 'function'),
        indexedDB: 'indexedDB' in window,
        cacheStorage: 'caches' in window,
        streams: typeof ReadableStream === 'function' && typeof WritableStream === 'function',
        blob: typeof Blob === 'function',
        file: typeof File === 'function',
        origin: window.location?.origin || '',
        crossOriginIsolated: Boolean(window.crossOriginIsolated),
        secureContext: Boolean(window.isSecureContext)
      });
    };
    const updateBrowserRuntimeFiles = () => {
      const caps = browserCapabilities();
      const capText = JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), ...caps }, null, 2) + '\n';
      try { createFile('/proc/browser/capabilities.json', capText, { replace: true, mode: 0o444 }); } catch {}
      const storageText = JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), indexedDB: caps.indexedDB, cacheStorage: caps.cacheStorage, opfs: caps.opfs, secureContext: caps.secureContext, origin: caps.origin }, null, 2) + '\n';
      try { createFile('/proc/browser/storage.json', storageText, { replace: true, mode: 0o444 }); } catch {}
      return caps;
    };
    const ensureBrowserRoots = () => {
      try { recursiveDirectory('/mnt/browser'); } catch {}
      try { recursiveDirectory('/proc/browser'); } catch {}
      try { updateBrowserRuntimeFiles(); } catch {}
    };
    const refreshRuntimeFiles = () => {
      const nowMs = Date.now();
      const uptimeSeconds = Math.max(0, (nowMs - Number(state.bootAt || nowMs)) / 1000);
      const cpuCount = Math.max(1, Number(state.cpu?.cpuCount) || Number(navigator.hardwareConcurrency) || 4);
      const memoryTotal = Math.max(1, Number(state.memory?.totalMB) || 4096);
      const processCount = Math.max(0, Number(state.processes?.size) || 0);
      const kernelVersion = String(window.MUNITOSKernel?.version || VERSION);
      const dynamic = [
        ['/proc/munitos/boot.json', JSON.stringify(window.__MUNITOSBootOptimizer?.snapshot?.() || { version: VERSION, phase: 'unavailable' }, null, 2) + '\n'],
        ['/proc/version', `MUNITOS Virtual Kernel ${kernelVersion} (browser-isolated, adaptive)\n`],
        ['/proc/cmdline', `MUNITOS_KERNEL_VERSION=${kernelVersion} root=/ rw virtualized=browser\n`],
        ['/proc/uptime', `${uptimeSeconds.toFixed(2)} ${Math.max(0, uptimeSeconds * 0.01).toFixed(2)}\n`],
        ['/proc/loadavg', `${Math.min(9.99, processCount / cpuCount).toFixed(2)} ${Math.min(9.99, processCount / cpuCount).toFixed(2)} ${Math.min(9.99, processCount / cpuCount).toFixed(2)} 1/${Math.max(1, processCount + 1)} ${Number(state.nextPid) || 2000}\n`],
        ['/proc/meminfo', `MemTotal:       ${memoryTotal * 1024} kB\nMemFree:        ${Math.floor(memoryTotal * 768)} kB\nBuffers:        65536 kB\nCached:         131072 kB\n`],
        ['/proc/cpuinfo', `processor\t: 0\nvendor_id\t: MUNITOS\nmodel name\t: ${String(state.cpu?.model || 'MUNITOS Virtual Processor')}\ncpu cores\t: ${cpuCount}\n`],
        ['/etc/sysinfo.conf', `hostname=munitos\narch=${String(state.cpu?.architecture || 'x86_64')}\ncpu=${cpuCount}\nmemory=${memoryTotal}MB\nkernel=${kernelVersion}\nshell=/bin/bash\nterminal=xterm-256color\n`],
        ['/etc/localStorage.txt', (()=>{try{return Object.entries(localStorage).map(([k,v])=>`${k}=${v}`).join('\n')+'\n'}catch{return 'unavailable\n'}})()],
        ['/etc/cookies.txt', (()=>{try{return `${document.cookie || 'empty'}\n`}catch{return 'unavailable\n'}})()],
        ['/etc/sw.txt', (()=>{try{const sw=navigator?.serviceWorker;return sw ? `serviceWorker supported\ncontroller: ${sw.controller ? 'yes' : 'no'}\n` : 'serviceWorker not supported\n';}catch{return 'unavailable\n';}})()]
      ];
      for (const [path, content] of dynamic) {
        try { createFile(path, content, { replace: true, mode: 0o444 }); } catch {}
      }
      try { updateBrowserRuntimeFiles(); } catch {}
      try { createFile('/proc/munitos/worker.json', JSON.stringify(window.MUNITOSKernel?.worker?.status?.() || { status: 'unknown' }, null, 2) + '\n', { replace: true, mode: 0o444 }); } catch {}
      return Object.freeze({ kernelVersion, uptimeSeconds, cpuCount, memoryTotal, processCount });
    };
    const fileName = value => {
      const raw = String(value || '').split(/[\\/]/).pop().trim();
      return raw.replace(/[^a-zA-Z0-9._ -]/g, '_') || `file-${Date.now()}`;
    };
    const importBlob = async (path, blob, options = {}) => {
      if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('EINVAL');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      recursiveDirectory(splitParent(toPublicPath(path)).parentPath);
      write(toPublicPath(path), bytes, { create: true, replace: true, mode: options.mode ?? 0o644 });
      const node = internalNodeNoFollow(toPublicPath(path));
      if (node) { node.browserMeta = { name: fileName(options.name || node.name), type: String(blob.type || 'application/octet-stream'), size: bytes.byteLength, lastModified: Number(options.lastModified || 0) }; }
      persistVFS();
      return snapshot(node, toPublicPath(path), false, false);
    };
    const importFiles = async (files, destination = '/mnt/browser') => {
      const list = Array.from(files || []);
      const out = [];
      for (const file of list) {
        const name = fileName(file.name);
        out.push(await importBlob(normalizePath(`${destination}/${name}`), file, { name: file.name, lastModified: file.lastModified }));
      }
      return Object.freeze(out);
    };
    const pickFiles = async (options = {}) => {
      if (typeof window.showOpenFilePicker === 'function') {
        const handles = await window.showOpenFilePicker({ multiple: options.multiple !== false, types: options.types });
        const out = [];
        for (const handle of handles) { const file = await handle.getFile(); out.push(...await importFiles([file], options.destination || '/mnt/browser')); }
        return Object.freeze(out);
      }
      const files = await new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = options.multiple !== false; input.accept = options.accept || '';
        input.onchange = () => resolve(Array.from(input.files || []));
        input.onerror = () => reject(new Error('EIO'));
        input.click();
      });
      return importFiles(files, options.destination || '/mnt/browser');
    };
    const importDirectoryHandle = async (handle, destination = '/mnt/browser') => {
      if (!handle || typeof handle.entries !== 'function') throw new Error('EINVAL');
      const imported = [];
      const visit = async (dirHandle, base) => {
        for await (const [name, entry] of dirHandle.entries()) {
          const clean = fileName(name);
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            imported.push(await importBlob(normalizePath(`${base}/${clean}`), file, { name: file.name, lastModified: file.lastModified }));
          } else if (entry.kind === 'directory') {
            const next = normalizePath(`${base}/${clean}`);
            recursiveDirectory(next);
            await visit(entry, next);
          }
        }
      };
      recursiveDirectory(destination);
      await visit(handle, toPublicPath(destination));
      persistVFS();
      return Object.freeze(imported);
    };
    const pickDirectory = async (options = {}) => {
      if (typeof window.showDirectoryPicker === 'function') {
        const handle = await window.showDirectoryPicker({ mode: options.mode || 'read' });
        return importDirectoryHandle(handle, options.destination || '/mnt/browser');
      }
      throw new Error('BROWSER_DIRECTORY_PICKER_UNAVAILABLE');
    };
    const exportBlob = (path, options = {}) => {
      const bytes = readBytes(path);
      if (!bytes) throw new Error('ENOENT');
      return new Blob([bytes], { type: options.type || 'application/octet-stream' });
    };
    const saveFile = async (path, options = {}) => {
      const blob = exportBlob(path, options);
      if (typeof window.showSaveFilePicker !== 'function') return blob;
      const suggestedName = options.suggestedName || fileName(path);
      const handle = await window.showSaveFilePicker({ suggestedName, types: options.types });
      const writable = await handle.createWritable();
      try { await writable.write(blob); } finally { await writable.close(); }
      return Object.freeze({ saved: true, name: suggestedName });
    };
    const opfsRoot = async () => {
      const storage = navigator.storage;
      if (!storage || typeof storage.getDirectory !== 'function') throw new Error('OPFS_UNAVAILABLE');
      return storage.getDirectory();
    };
    const opfs = Object.freeze({
      available: () => Boolean(navigator.storage && typeof navigator.storage.getDirectory === 'function'),
      write: async (path, data) => {
        const root = await opfsRoot(); const clean = String(path || '').replace(/^\/+/, '');
        const pieces = clean.split('/').filter(Boolean); if (!pieces.length) throw new Error('EINVAL');
        let dir = root;
        for (const piece of pieces.slice(0, -1)) dir = await dir.getDirectoryHandle(piece, { create: true });
        const handle = await dir.getFileHandle(pieces.at(-1), { create: true });
        const writable = await handle.createWritable();
        try { await writable.write(data instanceof Blob ? data : new Blob([toBytes(data)])); } finally { await writable.close(); }
        return true;
      },
      read: async path => {
        const root = await opfsRoot(); const clean = String(path || '').replace(/^\/+/, '');
        const pieces = clean.split('/').filter(Boolean); let dir = root;
        for (const piece of pieces.slice(0, -1)) dir = await dir.getDirectoryHandle(piece);
        const handle = await dir.getFileHandle(pieces.at(-1)); return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      },
      list: async (path = '') => {
        const root = await opfsRoot(); const pieces = String(path || '').replace(/^\/+/, '').split('/').filter(Boolean); let dir = root;
        for (const piece of pieces) dir = await dir.getDirectoryHandle(piece);
        const out = []; for await (const [name, entry] of dir.entries()) out.push({ name, kind: entry.kind });
        return Object.freeze(out);
      }
    });
    const browser = Object.freeze({ capabilities: browserCapabilities, updateRuntimeFiles: updateBrowserRuntimeFiles, importBlob, importFiles, pickFiles, importDirectoryHandle, pickDirectory, exportBlob, saveFile, opfs });
    const checkIntegrity = () => {
      const issues = [];
      for (const path of REQUIRED_PATHS) if (!readNodeNoFollow(path)) issues.push(`missing directory: ${path}`);
      for (const path of REQUIRED_FILES) if (!readNodeNoFollow(path)) issues.push(`missing file: ${path}`);
      const seen = new Set();
      const stack = [{ node: rootNode, path: '', expectedParent: null, expectedName: '' }];
      while (stack.length) {
        const current = stack.pop();
        const node = current.node;
        const path = current.path;
        if (!node) {
          issues.push(`missing node: ${path || '/'}`);
          continue;
        }
        if (seen.has(node)) {
          issues.push(`cycle detected: ${path || '/'}`);
          continue;
        }
        seen.add(node);
        if (!['dir', 'file', 'symlink', 'fifo'].includes(node.kind)) {
          issues.push(`invalid node kind: ${path || '/'}`);
          continue;
        }
        if (current.expectedParent && node.parent !== current.expectedParent) issues.push(`broken parent pointer: ${path || '/'}`);
        if (current.expectedParent && node.name !== current.expectedName) issues.push(`broken child name: ${path || '/'}`);
        if (node.kind === 'dir') {
          if (!(node.children instanceof Map)) issues.push(`invalid children map: ${path || '/'}`);
          else {
            for (const [name, child] of node.children) {
              const childPath = path ? `${path}/${name}` : `/${name}`;
              stack.push({ node: child, path: childPath, expectedParent: node, expectedName: name });
            }
          }
        }
        if (node.kind === 'file' && !(node.data instanceof Uint8Array)) issues.push(`invalid file data: ${path || '/'}`);
        if (node.kind === 'fifo' && !Array.isArray(node.queue)) issues.push(`invalid fifo queue: ${path || '/'}`);
        if (node.kind === 'symlink' && typeof node.target !== 'string') issues.push(`invalid symlink target: ${path || '/'}`);
      }
      return Array.from(new Set(issues));
    };
  const repairVFS = () => {
    for (const path of REQUIRED_PATHS) {
      if (!readNode(path)) {
        recursiveDirectory(path);
      }
    }
    for (const file of DEFAULT_VIRTUAL_FILES) {
      if (!readNode(file.path)) {
        createFile(
          file.path,
          file.content,
          {
            replace: false,
            mode: file.mode ?? 0o644
          }
        );
      }
    }
    ensureDefaultSpecialNodes();
    const stack = [];
    const seen = new Set();
    for (const child of rootNode.children.values()) stack.push([child, rootNode]);
    while (stack.length) {
      const [node, parent] = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      node.parent = parent;
      if (node.kind === 'dir' && node.children instanceof Map) {
        for (const child of node.children.values()) stack.push([child, node]);
      }
    }
    persistVFS();
  };
    const defaultFileContent = path => DEFAULT_FILE_CONTENTS[path] ?? null;
    const ensureDefaultRuntimeDevices = () => {
      if (!Array.isArray(state.blockDevices) || !state.blockDevices.length) {
        state.blockDevices = [
          { name: 'vda', major: 252, minor: 0, removable: false, size: 64 * 1024 * 1024, readOnly: false, type: 'disk', mountpoint: null },
          { name: 'vda1', major: 252, minor: 1, removable: false, size: 60 * 1024 * 1024, readOnly: false, type: 'part', mountpoint: '/' },
          { name: 'vda2', major: 252, minor: 2, removable: false, size: 4 * 1024 * 1024, readOnly: false, type: 'part', mountpoint: '[SWAP]' }
        ];
      }
      if (!Array.isArray(state.usbDevices) || !state.usbDevices.length) {
        state.usbDevices = [
          { bus: 1, device: 1, vendorId: '1d6b', productId: '0002', manufacturer: 'Linux Foundation', product: '2.0 root hub' },
          { bus: 1, device: 2, vendorId: '0bda', productId: '8153', manufacturer: 'MUNITOS', product: 'Virtual USB Network Adapter' }
        ];
      }
      if (!Array.isArray(state.namespaces) || !state.namespaces.length) {
        state.namespaces = [
          { ns: 'mnt', id: '4026531841', pid: 2000 },
          { ns: 'pid', id: '4026531836', pid: 2000 },
          { ns: 'user', id: '4026531837', pid: 2000 },
          { ns: 'uts', id: '4026531838', pid: 2000 },
          { ns: 'ipc', id: '4026531839', pid: 2000 }
        ];
      }
      if (!(state.mounts instanceof Map)) state.mounts = new Map();
      if (!state.mounts.has('/')) state.mounts.set('/', { source: '/dev/vda1', target: '/', filesystem: 'ext4', options: ['rw', 'relatime'] });
    };
    const ensureDefaultSpecialNodes = () => {
      for (const [linkPath, target] of Object.entries(DEFAULT_SYMLINKS)) {
        if (readNodeNoFollow(linkPath)) continue;
        const { parent, name } = ensureParent(linkPath);
        if (!parent || parent.kind !== 'dir') continue;
        parent.children.set(name, makeSymlink(name, parent, target));
        persistence.nodeEstimate++;
      }
      for (const fifoPath of DEFAULT_FIFOS) {
        if (readNodeNoFollow(fifoPath)) continue;
        const { parent, name } = ensureParent(fifoPath);
        if (!parent || parent.kind !== 'dir') continue;
        parent.children.set(name, makeFifo(name, parent));
        persistence.nodeEstimate++;
      }
    };
    const nodePath = node => {
      if (!node || node === rootNode) return '/';
      const parts = [];
      const seen = new Set();
      let current = node;
      while (current && current !== rootNode) {
        if (seen.has(current)) return '/';
        seen.add(current);
        if (current.name) parts.push(current.name);
        current = current.parent;
      }
      return current === rootNode ? `/${parts.reverse().join('/')}` || '/' : '/';
    };
    const readNode = (path, { followSymlinks = true, _depth = 0 } = {}) => {
      const normalized = normalizePath(path);
      if (normalized === '/') return rootNode;
      if (_depth > 40) throw new Error('ELOOP');
      const parts = normalized.split('/').filter(Boolean);
      let current = rootNode;
      for (let index = 0; index < parts.length; index++) {
        if (current.kind !== 'dir') return null;
        const child = current.children.get(parts[index]);
        if (!child) return null;
        current = child;
        if (followSymlinks && current.kind === 'symlink') {
          const target = String(current.target || '');
          const base = nodePath(current.parent);
          const targetPath = target.startsWith('/') ? normalizePath(target) : normalizePath(`${base}/${target}`);
          const resolved = readNode(targetPath, { followSymlinks: true, _depth: _depth + 1 });
          if (!resolved) return null;
          current = resolved;
        }
      }
      return current;
    };
    const readNodeNoFollow = path => readNode(path, { followSymlinks: false });
    const ensureParent = path => {
      const { parentPath, name } = splitParent(path);
      return { parent: readNode(parentPath), name, parentPath };
    };
    const createFile = (path, data = '', options = {}) => {
      const { parent, name } = ensureParent(path);
      if (!parent || parent.kind !== 'dir' || !name) throw new Error('ENOENT');
      const inputBytes = byteLength(data);
      if (inputBytes > VFS_MAX_FILE_BYTES) throw new Error('EFBIG');
      const existing = parent.children.get(name);
      if (existing?.kind === 'dir') throw new Error('EISDIR');
      const replacing = Boolean(existing);
      if (replacing && options.replace !== true) throw new Error('EEXIST');
      if (!replacing && persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
      const node = makeFile(name, parent, data, options.mode ?? 0o644, options.uid ?? 1000, options.gid ?? 1000);
      node.parent = parent;
      parent.children.set(name, node);
      if (!replacing) persistence.nodeEstimate++;
      persistVFS();
      return node;
    };
    const createDirectory = (path, options = {}) => {
      const normalized = normalizePath(path);
      const existing = readNodeNoFollow(normalized);
      if (existing) {
        if (options.existOk && existing.kind === 'dir') return existing;
        throw new Error('EEXIST');
      }
      const { parent, name } = ensureParent(normalized);
      if (!parent || parent.kind !== 'dir') throw new Error('ENOENT');
      if (persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
      const node = makeDir(name, parent, options.mode ?? 0o755, options.uid ?? 1000, options.gid ?? 1000);
      parent.children.set(name, node);
      persistence.nodeEstimate++;
      persistVFS();
      return node;
    };
    const recursiveDirectory = path => {
      const normalized = normalizePath(path);
      if (normalized === '/') return rootNode;
      let current = rootNode;
      let changed = false;
      for (const piece of normalized.split('/').filter(Boolean)) {
        let child = current.children.get(piece);
        if (!child) {
          if (persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
          child = makeDir(piece, current);
          current.children.set(piece, child);
          persistence.nodeEstimate++;
          changed = true;
        }
        if (child.kind !== 'dir') throw new Error('ENOTDIR');
        current = child;
      }
      if (changed) persistVFS();
      return current;
    };
    const removeNode = (path, { recursive = false } = {}) => {
      const node = readNodeNoFollow(path);
      if (!node || node === rootNode) throw new Error('ENOENT');
      if (node.kind === 'dir' && node.children.size && !recursive) throw new Error('ENOTEMPTY');
      let removedCount = 0;
      const stack = [node];
      const seen = new Set();
      while (stack.length) {
        const current = stack.pop();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        removedCount++;
        if (current.kind === 'dir' && current.children instanceof Map) for (const child of current.children.values()) stack.push(child);
      }
      node.parent.children.delete(node.name);
      persistence.nodeEstimate = Math.max(1, persistence.nodeEstimate - removedCount);
      persistVFS();
      return node;
    };
    const followNode = node => {
      if (!node) return null;
      if (node.kind !== 'symlink') return node;
      const target = String(node.target || '');
      const targetPath = target.startsWith('/') ? target : normalizePath(`${nodePath(node.parent)}/${target}`);
      return readNode(targetPath);
    };
    const contentOf = node => {
      const target = followNode(node);
      if (!target) throw new Error('ENOENT');
      if (target.kind === 'dir') throw new Error('EISDIR');
      if (target.kind === 'fifo') return target.queue.join('\n');
      return target.data instanceof Uint8Array ? new Uint8Array(target.data) : String(target.data ?? '');
    };
    const writeContent = (node, value) => {
      const target = followNode(node);
      if (!target) throw new Error('ENOENT');
      if (target.kind === 'dir') throw new Error('EISDIR');
      if (target.kind === 'fifo') {
        target.queue.push(String(value ?? ''));
        target.accessedAt = Date.now();
        persistVFS();
        return target;
      }
      const valueBytes = byteLength(value);
      if (valueBytes > VFS_MAX_FILE_BYTES) throw new Error('EFBIG');
      target.data = new Uint8Array(toBytes(value));
      target.size = valueBytes;
      target.modifiedAt = Date.now();
      persistVFS();
      return target;
    };
    const listDirectory = node => {
      if (!node || node.kind !== 'dir') throw new Error('ENOTDIR');
      return Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    };
    const textLines = node => fromBytes(contentOf(node)).replace(/\r\n/g, '\n').split('\n');
    const recursiveSize = node => {
      if (!node) return 0;
      if (node.kind !== 'dir') return Number(node.size) || 0;
      let total = 0;
      const stack = [node];
      const seen = new Set();
      while (stack.length) {
        const current = stack.pop();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        if (current.kind === 'dir') {
          if (current.children instanceof Map) for (const child of current.children.values()) stack.push(child);
        } else total += Number(current.size) || 0;
      }
      return total;
    };
    const modeString = node => {
      if (!node) return '??????????';
      const prefix = node.kind === 'dir' ? 'd' : node.kind === 'symlink' ? 'l' : node.kind === 'fifo' ? 'p' : '-';
      const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
      const chars = ['r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'];
      return prefix + bits.map((bit, i) => (node.mode & bit ? chars[i] : '-')).join('');
    };
    const parseMode = (value, base = 0o644) => {
      const text = String(value ?? '').trim();
      if (/^[0-7]{3,4}$/.test(text)) return parseInt(text, 8);
      let mode = base;
      for (const expression of text.split(',')) {
        const match = expression.match(/^([ugoa]*)([+=-])([rwxXst]*)$/);
        if (!match) throw new Error('EINVAL');
        const who = match[1] || 'a';
        const operator = match[2];
        const symbols = match[3];
        let selected = 0;
        for (const symbol of symbols) {
          if (symbol === 'r') selected |= (who.includes('u') || who.includes('a') ? 0o400 : 0) | (who.includes('g') || who.includes('a') ? 0o040 : 0) | (who.includes('o') || who.includes('a') ? 0o004 : 0);
          if (symbol === 'w') selected |= (who.includes('u') || who.includes('a') ? 0o200 : 0) | (who.includes('g') || who.includes('a') ? 0o020 : 0) | (who.includes('o') || who.includes('a') ? 0o002 : 0);
          if (symbol === 'x' || (symbol === 'X' && (base & 0o111))) selected |= (who.includes('u') || who.includes('a') ? 0o100 : 0) | (who.includes('g') || who.includes('a') ? 0o010 : 0) | (who.includes('o') || who.includes('a') ? 0o001 : 0);
        }
        const mask = (who.includes('u') || who.includes('a') ? 0o700 : 0) | (who.includes('g') || who.includes('a') ? 0o070 : 0) | (who.includes('o') || who.includes('a') ? 0o007 : 0);
        if (operator === '+') mode |= selected;
        else if (operator === '-') mode &= ~selected;
        else mode = (mode & ~mask) | selected;
      }
      return mode;
    };
    const humanSize = bytes => {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n}B`;
      if (n < 1048576) return `${(n / 1024).toFixed(1)}K`;
      if (n < 1073741824) return `${(n / 1048576).toFixed(1)}M`;
      return `${(n / 1073741824).toFixed(1)}G`;
    };
    const parseDuration = value => {
      const m = String(value ?? '').match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
      if (!m) return NaN;
      const unit = (m[2] || 's').toLowerCase();
      return Number(m[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]);
    };
    const sleep = (ms, api) => new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        api?.getSignal?.()?.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('CANCELLED'));
      };
      const timer = setTimeout(finish, Math.max(0, Math.min(ms, 86400000)));
      api?.getSignal?.()?.addEventListener('abort', abort, { once: true });
    });
    const md5 = input => {
      const bytes = toBytes(input);
      const bitLength = bytes.length * 8;
      const totalLength = (((bytes.length + 8) >> 6) + 1) * 64;
      const padded = new Uint8Array(totalLength);
      padded.set(bytes);
      padded[bytes.length] = 0x80;
      const view = new DataView(padded.buffer);
      view.setUint32(padded.length - 8, bitLength >>> 0, true);
      view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true);
      let a0 = 0x67452301;
      let b0 = 0xefcdab89;
      let c0 = 0x98badcfe;
      let d0 = 0x10325476;
      const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
      const k = [0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391];
      const rol = (v, n) => (v << n) | (v >>> (32 - n));
      const add = (x, y) => (x + y) | 0;
      for (let o = 0; o < padded.length; o += 64) {
        const m = new Array(16);
        for (let i = 0; i < 16; i++) m[i] = view.getUint32(o + i * 4, true);
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let i = 0; i < 64; i++) {
          let f;
          let g;
          if (i < 16) {
            f = (b & c) | (~b & d);
            g = i;
          } else if (i < 32) {
            f = (d & b) | (~d & c);
            g = (5 * i + 1) % 16;
          } else if (i < 48) {
            f = b ^ c ^ d;
            g = (3 * i + 5) % 16;
          } else {
            f = c ^ (b | ~d);
            g = (7 * i) % 16;
          }
          const temp = d;
          d = c;
          c = b;
          b = add(b, rol(add(add(a, f), add(k[i], m[g])), s[i]));
          a = temp;
        }
        a0 = add(a0, a);
        b0 = add(b0, b);
        c0 = add(c0, c);
        d0 = add(d0, d);
      }
      const out = new Uint8Array(16);
      const outView = new DataView(out.buffer);
      outView.setUint32(0, a0 >>> 0, true);
      outView.setUint32(4, b0 >>> 0, true);
      outView.setUint32(8, c0 >>> 0, true);
      outView.setUint32(12, d0 >>> 0, true);
      return bytesToHex(out);
    };
    const crc32 = bytes => {
      let crc = 0xffffffff;
      for (const byte of toBytes(bytes)) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
      return String((crc ^ 0xffffffff) >>> 0);
    };
    const replaceSpecialNode = (destination, node) => {
      const { parent, name } = ensureParent(destination);
      if (!parent || parent.kind !== 'dir' || !name) throw new Error('ENOENT');
      const existing = parent.children.get(name);
      if (existing?.kind === 'dir') throw new Error('EISDIR');
      if (!existing && persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
      node.name = name;
      node.parent = parent;
      parent.children.set(name, node);
      if (!existing) persistence.nodeEstimate++;
      persistVFS();
      return node;
    };
    const copyTree = (source, targetPath) => {
      if (!source || !['dir', 'file', 'symlink', 'fifo'].includes(source.kind)) throw new Error('EINVAL');
      const destination = normalizePath(targetPath);
      const sourcePath = normalizePath(nodePath(source));
      if (destination === sourcePath || (source.kind === 'dir' && destination.startsWith(`${sourcePath}/`))) throw new Error('EINVAL');
      if (source.kind === 'file') return createFile(destination, source.data instanceof Uint8Array ? new Uint8Array(source.data) : source.data, { replace: true, mode: source.mode, uid: source.uid, gid: source.gid });
      if (source.kind === 'fifo') {
        const node = makeFifo('', null);
        node.mode = source.mode;
        node.uid = source.uid;
        node.gid = source.gid;
        node.queue = Array.isArray(source.queue) ? source.queue.map(item => new Uint8Array(toBytes(item))) : [];
        return replaceSpecialNode(destination, node);
      }
      if (source.kind === 'symlink') {
        const node = makeSymlink('', null, source.target);
        node.mode = source.mode;
        node.uid = source.uid;
        node.gid = source.gid;
        return replaceSpecialNode(destination, node);
      }
      const existing = readNodeNoFollow(destination);
      if (existing && existing.kind !== 'dir') throw new Error('ENOTDIR');
      const dir = existing || recursiveDirectory(destination);
      dir.mode = source.mode;
      dir.uid = source.uid;
      dir.gid = source.gid;
      const children = Array.from(source.children.values());
      for (const child of children) copyTree(child, normalizePath(`${destination}/${child.name}`));
      persistVFS();
      return dir;
    };
    const writeOctal = (buffer, offset, length, value) => {
      const text = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, '0') + '\0';
      for (let i = 0; i < length; i++) buffer[offset + i] = i < text.length ? text.charCodeAt(i) : 0;
    };
    const readOctal = (buffer, offset, length) => {
      const text = fromBytes(buffer.slice(offset, offset + length)).replace(/\0.*$/, '').trim();
      return parseInt(text || '0', 8);
    };
    const tarHeader = record => {
      const h = new Uint8Array(512);
      h.set(toBytes(record.name.slice(0, 100).padEnd(100, '\0')), 0);
      writeOctal(h, 100, 8, record.mode);
      writeOctal(h, 108, 8, record.uid);
      writeOctal(h, 116, 8, record.gid);
      writeOctal(h, 124, 12, record.size);
      writeOctal(h, 136, 12, Math.floor(Date.now() / 1000));
      h.fill(32, 148, 156);
      h[156] = (record.type || '0').charCodeAt(0);
      if (record.linkname) h.set(toBytes(record.linkname.slice(0, 100).padEnd(100, '\0')), 157);
      h.set(toBytes('ustar'.padEnd(6, '\0')), 257);
      let sum = 0;
      for (const byte of h) sum += byte;
      writeOctal(h, 148, 8, sum);
      return h;
    };
    const collectTar = (node, path, records) => {
      const stack = [{ node, path }];
      while (stack.length) {
        const current = stack.pop();
        const item = current.node;
        const currentPath = current.path;
        if (item.kind === 'dir') {
          records.push({ name: currentPath.endsWith('/') ? currentPath : `${currentPath}/`, mode: item.mode, uid: item.uid, gid: item.gid, size: 0, type: '5', data: new Uint8Array() });
          const children = Array.from(item.children.values()).reverse();
          for (const child of children) stack.push({ node: child, path: currentPath === '/' ? `/${child.name}` : `${currentPath}/${child.name}` });
          continue;
        }
        if (item.kind === 'symlink') {
          records.push({ name: currentPath, mode: item.mode, uid: item.uid, gid: item.gid, size: 0, type: '2', linkname: item.target, data: new Uint8Array() });
          continue;
        }
        if (item.kind === 'fifo') {
          records.push({ name: currentPath, mode: item.mode, uid: item.uid, gid: item.gid, size: 0, type: '6', linkname: '', data: new Uint8Array() });
          continue;
        }
        const data = toBytes(contentOf(item));
        records.push({ name: currentPath, mode: item.mode, uid: item.uid, gid: item.gid, size: data.length, type: '0', linkname: '', data });
      }
    };
    const buildTar = records => {
      const chunks = [];
      for (const record of records) {
        chunks.push(tarHeader(record));
        const data = toBytes(record.data);
        if (data.length) {
          chunks.push(data);
          const pad = (512 - data.length % 512) % 512;
          if (pad) chunks.push(new Uint8Array(pad));
        }
      }
      chunks.push(new Uint8Array(1024));
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    };
    const parseTar = bytes => {
      const data = toBytes(bytes);
      const records = [];
      let offset = 0;
      while (offset + 512 <= data.length) {
        const h = data.slice(offset, offset + 512);
        if (h.every(byte => byte === 0)) break;
        const name = fromBytes(h.slice(0, 100)).replace(/\0.*$/, '');
        const prefix = fromBytes(h.slice(345, 500)).replace(/\0.*$/, '');
        const size = readOctal(h, 124, 12);
        if (!Number.isFinite(size) || size < 0 || !Number.isSafeInteger(size)) throw new Error('EBADMSG');
        const dataStart = offset + 512;
        const paddedSize = Math.ceil(size / 512) * 512;
        if (dataStart > data.length || size > data.length - dataStart || paddedSize > data.length - dataStart) throw new Error('EBADMSG');
        const type = String.fromCharCode(h[156] || 48);
        const linkname = fromBytes(h.slice(157, 257)).replace(/\0.*$/, '');
        const fullName = prefix ? `${prefix}/${name}` : name;
        const body = data.slice(dataStart, dataStart + size);
        records.push({ name: fullName, size, type, linkname, data: body });
        offset = dataStart + paddedSize;
      }
      return records;
    };
  const toPublicPath = input => typeof input === 'string' ? normalizePath(input) : normalizePath(input?.path || '/');
  const internalNode = (input, follow = true) => {
    if (!input) return null;
    if (typeof input === 'object' && input.kind && input.path) return readNode(input.path, { followSymlinks: follow });
    return readNode(String(input), { followSymlinks: follow });
  };
  const internalNodeNoFollow = input => {
    if (!input) return null;
    if (typeof input === 'object' && input.kind && input.path) return readNodeNoFollow(input.path);
    return readNodeNoFollow(String(input));
  };
  const snapshot = (node, path = null, follow = false, includeChildren = true) => {
    const resolved = follow && node?.kind === 'symlink' ? followNode(node) : node;
    if (!resolved) return null;
    const resolvedPath = path || nodePath(resolved);
    const result = Object.freeze({
      path: resolvedPath,
      kind: resolved.kind,
      name: String(resolved.name ?? ''),
      target: resolved.kind === 'symlink' ? String(resolved.target || '') : undefined,
      mode: Number(resolved.mode) || 0,
      uid: Number(resolved.uid) || 0,
      gid: Number(resolved.gid) || 0,
      size: Number(resolved.size) || 0,
      createdAt: Number(resolved.createdAt) || 0,
      modifiedAt: Number(resolved.modifiedAt) || 0,
      accessedAt: Number(resolved.accessedAt) || 0,
      browserMeta: resolved.browserMeta ? Object.freeze({ ...resolved.browserMeta }) : undefined,
      attributes: Object.freeze(Array.from(resolved.attributes || [])),
      children: includeChildren && resolved.kind === 'dir' ? Object.freeze(Array.from(resolved.children.values()).map(child => snapshot(child, nodePath(child), false, false))) : undefined
    });
    return result;
  };
  const inspect = (path, options = {}) => {
    const follow = options.follow !== false;
    const node = follow ? readNode(path) : readNodeNoFollow(path);
    return snapshot(node, normalizePath(typeof path === 'string' ? path : path?.path || '/'), false, true);
  };
  const list = input => {
    const node = internalNode(input);
    return node?.kind === 'dir' ? Object.freeze(Array.from(node.children.values()).map(child => snapshot(child, nodePath(child), false, false))) : Object.freeze([]);
  };
  const readBytes = input => {
    const node = internalNode(input);
    return node ? new Uint8Array(toBytes(contentOf(node))) : null;
  };
  const write = (path, data = '', options = {}) => {
    const node = internalNodeNoFollow(path);
    if (!node) {
      if (options.create !== false) return snapshot(createFile(toPublicPath(path), data, { replace: options.replace !== false, mode: options.mode, uid: options.uid, gid: options.gid }), toPublicPath(path), false, false);
      throw new Error('ENOENT');
    }
    writeContent(node, data);
    persistVFS();
    return snapshot(node, nodePath(node), false, false);
  };
  const append = (path, data = '') => {
    const existing = internalNodeNoFollow(path);
    if (!existing) return snapshot(createFile(toPublicPath(path), data, { replace: false }), toPublicPath(path), false, false);
    if (existing.kind !== 'file') throw new Error('EISDIR');
    return write(path, `${fromBytes(contentOf(existing))}${fromBytes(toBytes(data))}`);
  };
  const mkdir = (path, options = {}) => snapshot(createDirectory(toPublicPath(path), options), toPublicPath(path), false, false);
  const mkdirp = path => snapshot(recursiveDirectory(toPublicPath(path)), toPublicPath(path), false, false);
  const remove = (path, options = {}) => removeNode(toPublicPath(path), options);
  const exists = path => Boolean(readNode(toPublicPath(path)));
  const existsExact = path => Boolean(readNodeNoFollow(toPublicPath(path)));
  const stat = path => inspect(path, { follow: false });
  const chmod = (path, mode) => {
    const node = internalNodeNoFollow(path);
    if (!node) throw new Error('ENOENT');
    node.mode = parseMode(mode, node.mode);
    node.modifiedAt = Date.now();
    persistVFS();
    return snapshot(node, nodePath(node), false, false);
  };
  const chown = (path, uid = undefined, gid = undefined) => {
    const node = internalNodeNoFollow(path);
    if (!node) throw new Error('ENOENT');
    const normalizeId = value => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('EINVAL');
      return parsed;
    };
    if (uid !== undefined && uid !== null) node.uid = normalizeId(uid);
    if (gid !== undefined && gid !== null) node.gid = normalizeId(gid);
    node.modifiedAt = Date.now();
    persistVFS();
    return snapshot(node, nodePath(node), false, false);
  };
  const overwrite = (path, data) => write(path, data, { create: false });
  const copy = (source, destination) => {
    const sourceNode = internalNodeNoFollow(source);
    if (!sourceNode) throw new Error('ENOENT');
    const sourcePath = normalizePath(nodePath(sourceNode));
    const dest = toPublicPath(destination);
    const targetNode = internalNodeNoFollow(dest);
    const target = targetNode?.kind === 'dir' ? normalizePath(`${dest}/${sourceNode.name}`) : dest;
    if (target === sourcePath || (sourceNode.kind === 'dir' && target.startsWith(`${sourcePath}/`))) throw new Error('EINVAL');
    return snapshot(copyTree(sourceNode, target), target, false, false);
  };
  const move = (source, destination) => {
    const copied = copy(source, destination);
    remove(source, { recursive: true });
    return copied;
  };
  const link = (source, destination, symbolic = false) => {
    const sourceNode = symbolic ? null : internalNodeNoFollow(source);
    if (!symbolic && !sourceNode) throw new Error('ENOENT');
    const targetPath = toPublicPath(destination);
    if (existsExact(targetPath)) throw new Error('EEXIST');
    const { parent, name } = ensureParent(targetPath);
    if (!parent || parent.kind !== 'dir' || !name) throw new Error('ENOENT');
    if (persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
    const rawTarget = typeof source === 'string' ? source : source?.path;
    if (symbolic) {
      const target = String(rawTarget ?? '').trim();
      if (!target) throw new Error('EINVAL');
      const node = makeSymlink(name, parent, target);
      parent.children.set(name, node);
      persistence.nodeEstimate++;
      persistVFS();
      return snapshot(node, targetPath, false, false);
    }
    const node = cloneLinkNode(sourceNode, name, parent);
    parent.children.set(name, node);
    persistence.nodeEstimate++;
    persistVFS();
    return snapshot(node, targetPath, false, false);
  };
  const cloneLinkNode = (source, name, parent) => {
    const nowValue = Date.now();
    if (source.kind === 'file') return { ...makeFile(name, parent, source.data instanceof Uint8Array ? new Uint8Array(source.data) : source.data, source.mode, source.uid, source.gid), createdAt: nowValue, modifiedAt: nowValue, accessedAt: nowValue };
    if (source.kind === 'fifo') return { ...makeFifo(name, parent), mode: source.mode, uid: source.uid, gid: source.gid, queue: Array.isArray(source.queue) ? source.queue.map(value => String(value ?? '')) : [] };
    if (source.kind === 'symlink') return makeSymlink(name, parent, source.target);
    throw new Error('EPERM');
  };
  const mkfifo = path => {
    const target = toPublicPath(path);
    if (existsExact(target)) throw new Error('EEXIST');
    const { parent, name } = ensureParent(target);
    if (!parent || parent.kind !== 'dir' || !name) throw new Error('ENOENT');
    if (persistence.nodeEstimate + 1 > VFS_MAX_NODES) throw new Error('VFS_NODE_LIMIT');
    const node = makeFifo(name, parent);
    parent.children.set(name, node);
    persistence.nodeEstimate++;
    persistVFS();
    return snapshot(node, target, false);
  };
  const getAttributes = input => {
    const node = internalNodeNoFollow(input);
    return node ? Object.freeze(Array.from(node.attributes || []).sort()) : Object.freeze([]);
  };
  const setAttributes = (path, expression) => {
    const node = internalNodeNoFollow(path);
    if (!node) throw new Error('ENOENT');
    const value = String(expression ?? '');
    const match = value.match(/^([+-])([a-zA-Z]+)$/);
    if (!match) throw new Error('EINVAL');
    const attrs = node.attributes instanceof Set ? node.attributes : new Set(node.attributes || []);
    for (const ch of match[2]) match[1] === '+' ? attrs.add(ch) : attrs.delete(ch);
    node.attributes = attrs;
    node.modifiedAt = Date.now();
    persistVFS();
    return snapshot(node, nodePath(node), false, false);
  };
  const getAcl = input => {
    const node = internalNodeNoFollow(input);
    if (!node) return Object.freeze([]);
    return Object.freeze(Array.from(node.acl instanceof Map ? node.acl.entries() : Object.entries(node.acl || {})).map(([key, value]) => Object.freeze({ key, value })));
  };
  const setAcl = (path, key, permission) => {
    const node = internalNodeNoFollow(path);
    if (!node) throw new Error('ENOENT');
    const acl = node.acl instanceof Map ? node.acl : new Map(Object.entries(node.acl || {}));
    acl.set(String(key), String(permission));
    node.acl = acl;
    node.modifiedAt = Date.now();
    persistVFS();
    return snapshot(node, nodePath(node), false, false);
  };
  const isEmpty = input => {
    const node = internalNodeNoFollow(input);
    if (!node) throw new Error('ENOENT');
    return node.kind === 'dir' ? node.children.size === 0 : recursiveSize(node) === 0;
  };
  const touch = (paths, options = {}) => {
    const items = Array.isArray(paths) ? paths : [paths];
    for (const path of items) {
      const target = toPublicPath(path);
      const node = internalNodeNoFollow(target);
      if (!node) {
        if (options.create === false) throw new Error('ENOENT');
        createFile(target, '', { replace: false });
      } else {
        const time = Date.now();
        node.accessedAt = time;
        node.modifiedAt = time;
      }
    }
    persistVFS();
    return Object.freeze(items.map(path => snapshot(internalNodeNoFollow(path), toPublicPath(path), false, false)));
  };
  const walk = start => {
    const root = internalNode(start);
    if (!root) return Object.freeze([]);
    const out = [];
    const visit = (node, path) => {
      out.push({ node: snapshot(node, path, false, false), path });
      if (node.kind === 'dir') for (const child of node.children.values()) visit(child, path === '/' ? `/${child.name}` : `${path}/${child.name}`);
    };
    visit(root, toPublicPath(start));
    return Object.freeze(out.map(item => Object.freeze(item)));
  };
  const nodeCount = () => {
    let count = 0;
    const visit = node => { count += 1; if (node.kind === 'dir') for (const child of node.children.values()) visit(child); };
    visit(rootNode);
    return count;
  };
  const systemStats = () => { const nodes = nodeCount(); const bytes = recursiveSize(rootNode); const optimizerState = persistence.optimizer?.snapshot?.() || null; return Object.freeze({ available: true, nodes, bytes, schema: VFS_SCHEMA, key: VFS_KEY, version: VERSION, limits: Object.freeze({ maxNodes: VFS_MAX_NODES, maxFileBytes: VFS_MAX_FILE_BYTES, maxTotalBytes: VFS_MAX_TOTAL_BYTES }), persistence: Object.freeze({ localStorage: true, indexedDB: 'indexedDB' in window, hydrated: persistence.idbHydrated, dirty: persistence.dirty, batching: persistence.batchDepth, localWrites: persistence.localWrites, idbWrites: persistence.idbWrites, lastSnapshotBytes: persistence.lastSnapshotBytes }), optimizer: optimizerState, browser: browserCapabilities() }); };
  const createArchive = inputs => {
    const records = [];
    for (const input of inputs || []) {
      const node = internalNodeNoFollow(input);
      if (!node) throw new Error('ENOENT');
      collectTar(node, toPublicPath(typeof input === 'string' ? input : input.path), records);
    }
    return buildTar(records);
  };
  const listArchive = input => {
    if (input instanceof Uint8Array || input instanceof ArrayBuffer) return parseTar(input);
    const bytes = readBytes(input);
    return parseTar(bytes || new Uint8Array());
  };
  const extractArchive = (input, options = {}) => {
    const records = listArchive(input);
    const base = normalizePath(options.destination || '/');
    if (!readNodeNoFollow(base) || readNodeNoFollow(base).kind !== 'dir') recursiveDirectory(base);
    const resolveArchiveMember = name => {
      const raw = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!raw) throw new Error('EINVAL');
      const pieces = raw.split('/').filter(Boolean);
      if (pieces.some(piece => piece === '..')) throw new Error('EINVAL');
      const path = normalizePath(`${base}/${pieces.join('/')}`);
      if (path !== base && !path.startsWith(`${base}/`)) throw new Error('EINVAL');
      return path;
    };
    for (const rec of records) {
      const path = resolveArchiveMember(rec.name);
      if (rec.type === '5') {
        recursiveDirectory(path);
      } else {
        const parent = splitParent(path).parentPath;
        recursiveDirectory(parent);
        if (rec.type === '2') {
          replaceSpecialNode(path, makeSymlink('', null, String(rec.linkname || '')));
        } else if (rec.type === '6') {
          replaceSpecialNode(path, makeFifo('', null));
        } else if (rec.type === '1') {
          const target = normalizePath(`${base}/${String(rec.linkname || '')}`);
          const linked = readNodeNoFollow(target);
          if (!linked || linked.kind !== 'file') throw new Error('ENOENT');
          createFile(path, linked.data, { replace: true, mode: linked.mode, uid: linked.uid, gid: linked.gid });
        } else if (rec.type === '0' || rec.type === '\0') {
          createFile(path, rec.data, { replace: true });
        } else {
          throw new Error(`EOPNOTSUPP:${rec.type}`);
        }
      }
    }
    persistVFS();
    return records.length;
  };
  let lifecyclePhase = 'created';
  const lifecycleListeners = new Map();
  const lifecycleEmit = (event, payload = {}) => {
    const handlers = lifecycleListeners.get(event) || [];
    for (const handler of handlers) {
      try { handler({ event, phase: lifecyclePhase, ...payload }); } catch {}
    }
  };
  const lifecycleSet = phase => {
    lifecyclePhase = phase;
    lifecycleEmit(phase);
    return phase;
  };
  const lifecycle = Object.freeze({
    state: () => lifecyclePhase,
    ready: () => lifecyclePhase === 'ready',
    on: (event, handler) => {
      if (typeof handler !== 'function') throw new TypeError('handler must be a function');
      const handlers = lifecycleListeners.get(event) || new Set();
      handlers.add(handler);
      lifecycleListeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
    start: () => {
      if (lifecyclePhase === 'ready' || lifecyclePhase === 'starting') return lifecyclePhase;
      if (lifecyclePhase === 'destroyed') throw new Error('VFS_DESTROYED');
      lifecycleSet('starting');
      initializeFS();
      lifecycleSet('ready');
      return lifecyclePhase;
    },
    stop: () => {
      if (lifecyclePhase === 'stopped' || lifecyclePhase === 'destroyed') return lifecyclePhase;
      persistVFS({ immediate: true });
      lifecycleSet('stopped');
      return lifecyclePhase;
    },
    reset: () => {
      if (lifecyclePhase === 'destroyed') throw new Error('VFS_DESTROYED');
      lifecycleSet('starting');
      reset();
      initializeFS();
      lifecycleSet('ready');
      lifecycleEmit('reset');
      return lifecyclePhase;
    },
    destroy: () => {
      if (lifecyclePhase === 'destroyed') return lifecyclePhase;
      lifecycleSet('destroyed');
      lifecycleListeners.clear();
      return lifecyclePhase;
    }
  });
  const initializeFS = () => {
    ensureDefaultRuntimeDevices();
    if (rootNode.children.size) {
      beginBatch();
      try {
        repairVFS();
        ensureBrowserRoots();
        refreshRuntimeFiles();
      } finally {
        void endBatch({ flush: false });
      }
      if (!persistence.localLoaded) persistence.ready = hydrateFromIndexedDB();
      return;
    }
    if (!loadVFS()) {
      beginBatch();
      try {
        REQUIRED_PATHS.forEach(recursiveDirectory);
        for (const file of DEFAULT_VIRTUAL_FILES) createFile(file.path, file.content, { mode: file.mode ?? 0o644 });
        ensureDefaultSpecialNodes();
        ensureBrowserRoots();
        refreshRuntimeFiles();
        persistence.dirty = true;
      } finally {
        void endBatch({ flush: false });
      }
      persistence.ready = hydrateFromIndexedDB();
      schedulePersistence(300);
      return;
    }
    beginBatch();
    try {
      repairVFS();
      ensureBrowserRoots();
      refreshRuntimeFiles();
    } finally {
      void endBatch({ flush: false });
    }
    persistence.ready = hydrateFromIndexedDB();
  };
    const reset = () => {
      persistence.dirty = false;
      if (persistence.writeTimer) { try { typeof persistence.writeTimer === 'function' ? persistence.writeTimer() : clearTimeout(persistence.writeTimer); } catch {} persistence.writeTimer = null; }
      try { window.localStorage?.removeItem(VFS_KEY); } catch {}
      try { openVfsDb().then(db => { if (!db) return; const tx = db.transaction(VFS_DB_STORE, 'readwrite'); tx.objectStore(VFS_DB_STORE).delete('current'); tx.oncomplete = tx.onerror = tx.onabort = () => db.close(); }).catch(() => {}); } catch {}
      rootNode.children.clear();
      rootNode.size = 0;
      rootNode.modifiedAt = now();
      if (state.mounts instanceof Map) state.mounts.clear();
      if (Array.isArray(state.blockDevices)) state.blockDevices.length = 0;
      if (Array.isArray(state.usbDevices)) state.usbDevices.length = 0;
      if (Array.isArray(state.namespaces)) state.namespaces.length = 0;
      return true;
    };
    return Object.freeze({
      api: Object.freeze({
        version: VERSION,
        schema: VFS_SCHEMA,
        initialize: lifecycle.start,
        reset,
        persist: persistVFS,
        resolve: resolvePath,
        normalize: normalizePath,
        inspect,
        stat,
        exists,
        existsExact,
        read: readBytes,
        write,
        append,
        create: (path, data = '', options = {}) => snapshot(createFile(toPublicPath(path), data, { replace: options.replace === true, mode: options.mode, uid: options.uid, gid: options.gid }), toPublicPath(path)),
        mkdir,
        mkdirp,
        remove,
        copy,
        move,
        chmod,
        chown,
        overwrite,
        link,
        mkfifo,
        getAttributes,
        setAttributes,
        getAcl,
        setAcl,
        isEmpty,
        touch,
        list,
        walk,
        content: input => { const node = internalNode(input); return node ? contentOf(node) : null; },
        text: input => { const node = internalNode(input); return node ? fromBytes(contentOf(node)) : null; },
        lines: input => { const node = internalNode(input); return node ? textLines(node) : []; },
        size: input => { const node = internalNode(input); return node ? recursiveSize(node) : 0; },
        modeString: input => { const node = internalNodeNoFollow(input); return node ? modeString(node) : ''; },
        parseMode,
        humanSize,
        parseDuration,
        sleep,
        md5,
        crc32,
        bytes: toBytes,
        fromBytes,
        byteLength,
        archive: Object.freeze({ create: createArchive, list: listArchive, extract: extractArchive }),
        integrity: checkIntegrity,
        stats: systemStats,
        registerVirtualFile,
        browser,
        runtime: Object.freeze({ refreshFiles: refreshRuntimeFiles }),
        ready: () => persistence.ready,
        lifecycle
      }),
      initialize: lifecycle.start,
      reset,
      integrity: checkIntegrity,
      stats: systemStats,
      lifecycle,
      VFS_KEY,
      VFS_SCHEMA,
      ready: () => persistence.ready,
      browser,
      runtime: Object.freeze({ refreshFiles: refreshRuntimeFiles })
    });
  };
  const installVFS = state => { const vfs = createVFS(state); vfs.lifecycle.start(); return vfs; };
  window.MUNITOSVFS = Object.freeze({ create: createVFS, install: installVFS });
})();
