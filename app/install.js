(()=>{
'use strict';

const MUNITOS_INSTALL_FILE_MANIFEST=globalThis.MUNITOSManifest.files['install.js'];
const GLOBAL_KEY='__MUNITOS_INSTALL_WIZARD__';
const COMPLETED_STORAGE_KEY=MUNITOS_INSTALL_FILE_MANIFEST.keys.storage[0];
const STATE_STORAGE_KEY=MUNITOS_INSTALL_FILE_MANIFEST.keys.storage[1];
const COMPLETED_COOKIE=MUNITOS_INSTALL_FILE_MANIFEST.keys.cookies[0];
const STATE_COOKIE=MUNITOS_INSTALL_FILE_MANIFEST.keys.cookies[1];
const MIN_INSTALL_DURATION=5000;
const CLEANUP_RETRIES=3;
const CLEANUP_RETRY_DELAY=180;
const PACKAGE_RETRIES=3;
const OFFICIAL_LINKS=Object.freeze(['https://munitos.github.io','https://t.me/MUNITOS']);
const APP_NAME='MUNITOS';

const state={
    step:'terms',
    acceptedTerms:false,
    cleaned:false,
    catalog:[],
    selected:new Set(),
    required:new Set(),
    installing:false,
    finished:false,
    failed:false,
    error:'',
    installResults:[],
    log:[],
    cleanupDiagnostics:[],
    cleanupBusy:false,
    appApi:null,
    root:null,
    shadow:null,
    ui:{},
    reloadPending:false,
    installStartedAt:0
};

if(window[GLOBAL_KEY])return;

window[GLOBAL_KEY]=Object.freeze({
    version:MUNITOS_INSTALL_FILE_MANIFEST.version,
    kernelAware:true
});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const safeText=value=>String(value??'').trim();

const escapeHtml=value=>safeText(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");

const getScriptBase=()=>{
    try{
        const script=document.currentScript||
            Array.from(document.scripts).find(
                item=>/(?:^|\/)install\.js(?:[?#]|$)/i.test(item.src)
            );
        if(script?.src)return new URL('./',script.src);
    }catch{}
    try{
        return new URL('./',window.location.href);
    }catch{
        return window.location;
    }
};

const SCRIPT_BASE=getScriptBase();

const getStorage=()=>{
    try{
        return window.localStorage;
    }catch{
        return null;
    }
};

const getSessionStorage=()=>{
    try{
        return window.sessionStorage;
    }catch{
        return null;
    }
};

const getCookie=name=>{
    try{
        const prefix=`${encodeURIComponent(name)}=`;
        const row=document.cookie
            .split(';')
            .map(v=>v.trim())
            .find(v=>v.startsWith(prefix));
        return row?decodeURIComponent(row.slice(prefix.length)):'';
    }catch{
        return'';
    }
};

const setCookie=(name,value,days=3650)=>{
    try{
        const expires=new Date(Date.now()+days*86400000).toUTCString();
        document.cookie=
            `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    }catch{}
};

const deleteCookie=(name,path='/')=>{
    try{
        document.cookie=
            `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
    }catch{}
};

const hasCompletedFlag=()=>{
    const s=getStorage();
    let a=false;
    try{
        a=s?.getItem(COMPLETED_STORAGE_KEY)==='1';
    }catch{}
    return a||getCookie(COMPLETED_COOKIE)==='1';
};

const setCompletedFlag=()=>{
    const s=getStorage();
    try{
        s?.setItem(COMPLETED_STORAGE_KEY,'1');
        s?.removeItem(STATE_STORAGE_KEY);
    }catch{}
    setCookie(COMPLETED_COOKIE,'1');
    deleteCookie(STATE_COOKIE);
};

const clearCompletedFlag=()=>{
    const s=getStorage();
    try{
        s?.removeItem(COMPLETED_STORAGE_KEY);
        s?.removeItem(STATE_STORAGE_KEY);
    }catch{}
    deleteCookie(COMPLETED_COOKIE);
    deleteCookie(STATE_COOKIE);
};

const saveWizardState=()=>{
    const payload={
        step:state.step,
        acceptedTerms:state.acceptedTerms,
        cleaned:state.cleaned,
        selected:Array.from(state.selected),
        timestamp:Date.now()
    };

    const s=getStorage();

    try{
        s?.setItem(STATE_STORAGE_KEY,JSON.stringify(payload));
    }catch{}

    try{
        setCookie(STATE_COOKIE,JSON.stringify(payload),1);
    }catch{}
};

const clearWizardState=()=>{
    const s=getStorage();
    try{
        s?.removeItem(STATE_STORAGE_KEY);
    }catch{}
    deleteCookie(STATE_COOKIE);
};

const resetWizardToStart=(errorMessage='')=>{
    state.step='terms';
    state.acceptedTerms=false;
    state.cleaned=false;
    state.selected.clear();
    state.required.clear();
    state.installing=false;
    state.finished=false;
    state.failed=Boolean(errorMessage);
    state.error=safeText(errorMessage);
    state.installResults=[];
    state.log=[];
    state.cleanupDiagnostics=[];
    state.cleanupBusy=false;
    state.installStartedAt=0;
    state.reloadPending=false;

    clearWizardState();
    saveWizardState();
    render();
};

const getApi=()=>{
    const candidates=[
        window.MUNITOSTerminalUI,
        window.MUNITOSCore,
        window.MUNITOSTerminalCore
    ];

    for(const api of candidates){
        if(
            api&&
            typeof api==='object'&&
            api.package&&
            typeof api.package.install==='function'&&
            typeof api.package.registry==='function'
        ){
            return api;
        }
    }

    return null;
};

const waitForApi=async timeout=>{
    const effectiveTimeout=Math.max(
        Number(timeout)||0,
        Number(window.MUNITOSKernel?.config?.packageTimeoutMs)||30000
    );

    const start=Date.now();

    while(Date.now()-start<effectiveTimeout){
        const api=getApi();

        if(
            api?.package&&
            typeof api.package.install==='function'&&
            typeof api.package.registry==='function'
        ){
            state.appApi=api;
            return api;
        }

        await sleep(100);
    }

    throw new Error('MUNITOS package manager was not available.');
};

const getRegistry=()=>{
    try{
        const list=state.appApi?.package?.registry?.();
        return Array.isArray(list)?list:[];
    }catch{
        return[];
    }
};

const getSnapshot=()=>{
    try{
        return state.appApi?.snapshot?.()||null;
    }catch{
        return null;
    }
};

const getInstalledPackages=()=>{
    const snapshot=getSnapshot();

    if(Array.isArray(snapshot?.installed)){
        return new Set(
            snapshot.installed
                .map(safeText)
                .filter(Boolean)
        );
    }

    const result=new Set();

    for(const record of getRegistry()){
        const key=safeText(record?.key||record?.name);
        const status=safeText(record?.status).toLowerCase();

        if(
            key&&
            ['installed','enabled','verified'].includes(status)
        ){
            result.add(key);
        }
    }

    return result;
};

const normalizePermissions=input=>{
    const p=input&&typeof input==='object'?input:{};

    return{
        storage:safeText(p.storage)||'none',
        cookies:safeText(p.cookies)||'none',
        network:safeText(p.network)||'none',
        filesystem:safeText(p.filesystem)||'none'
    };
};

const normalizePackage=(item,fallback='')=>{
    if(!item)return null;

    if(typeof item==='string'){
        const name=safeText(item);

        return name?{
            name,
            version:'unknown',
            description:'',
            author:'unknown',
            official:false,
            default:false,
            securityLevel:'medium',
            permissions:normalizePermissions({}),
            commands:[],
            dependencies:[],
            entry:'install',
            source:'internal'
        }:null;
    }

    if(typeof item!=='object')return null;

    const name=safeText(
        item.name||
        item.package||
        item.id||
        item.key||
        fallback
    );

    if(!name)return null;

    const dependencies=Array.isArray(item.dependencies)
        ?item.dependencies
            .map(v=>
                typeof v==='string'
                    ?safeText(v)
                    :safeText(v?.name||v?.package||v?.id||v?.key)
            )
            .filter(Boolean)
        :[];

    const commands=Array.isArray(item.commands)
        ?item.commands
            .map(v=>
                typeof v==='string'
                    ?safeText(v)
                    :safeText(v?.name||v?.command||v?.id)
            )
            .filter(Boolean)
        :[];

    return{
        name,
        version:safeText(item.version)||'unknown',
        description:safeText(item.description),
        author:safeText(item.author)||'unknown',
        official:item.official===true,
        default:item.default===true,
        securityLevel:safeText(item.securityLevel)||'medium',
        permissions:normalizePermissions(item.permissions),
        commands,
        dependencies,
        entry:safeText(item.entry)||'install',
        source:safeText(item.source)||'internal'
    };
};

const normalizeCatalog=raw=>{
    if(Array.isArray(raw)){
        return raw
            .map(v=>normalizePackage(v))
            .filter(Boolean);
    }

    if(!raw||typeof raw!=='object')return[];

    if(Array.isArray(raw.packages)){
        return raw.packages
            .map(v=>normalizePackage(v))
            .filter(Boolean);
    }

    if(Array.isArray(raw.items)){
        return raw.items
            .map(v=>normalizePackage(v))
            .filter(Boolean);
    }

    if(Array.isArray(raw.entries)){
        return raw.entries
            .map(v=>normalizePackage(v))
            .filter(Boolean);
    }

    if(
        raw.packages&&
        typeof raw.packages==='object'&&
        !Array.isArray(raw.packages)
    ){
        return Object
            .entries(raw.packages)
            .map(([k,v])=>normalizePackage(v,k))
            .filter(Boolean);
    }

    if(
        raw.registry&&
        typeof raw.registry==='object'&&
        !Array.isArray(raw.registry)
    ){
        return Object
            .entries(raw.registry)
            .map(([k,v])=>normalizePackage(v,k))
            .filter(Boolean);
    }

    return Object
        .entries(raw)
        .map(([k,v])=>normalizePackage(v,k))
        .filter(Boolean);
};

let pkgJsLoadPromise=null;

const loadPkgJs=()=>{
    if(
        window.MUNITOSPackageCatalog&&
        typeof window.MUNITOSPackageCatalog==='object'
    ){
        return Promise.resolve(window.MUNITOSPackageCatalog);
    }

    if(pkgJsLoadPromise)return pkgJsLoadPromise;

    pkgJsLoadPromise=(async()=>{
        const url=new URL('./pkg.js',SCRIPT_BASE);

        await new Promise((resolve,reject)=>{
            const script=document.createElement('script');
            const cacheVersion=
                Number(window.MUNITOSKernel?.config?.packageCacheVersion)||1;

            script.src=
                `${url.toString()}${url.search?'&':'?'}v=${cacheVersion}`;

            script.async=false;
            script.onload=resolve;
            script.onerror=()=>{
                reject(
                    new Error(
                        `Unable to load pkg.js from ${url.toString()}`
                    )
                );
            };

            (document.head||document.documentElement).appendChild(script);
        });

        if(
            !window.MUNITOSPackageCatalog||
            typeof window.MUNITOSPackageCatalog!=='object'
        ){
            throw new Error(
                'pkg.js did not expose a valid MUNITOSPackageCatalog object.'
            );
        }

        return window.MUNITOSPackageCatalog;
    })();

    return pkgJsLoadPromise.catch(error=>{
        pkgJsLoadPromise=null;
        throw error;
    });
};

const getPackageByName=name=>
    state.catalog.find(
        pkg=>safeText(pkg.name)===safeText(name)
    )||null;

const getPackageVersion=name=>{
    const key=safeText(name).toLowerCase();

    try{
        const registry=state.appApi?.package?.registry?.();

        const record=Array.isArray(registry)
            ?registry.find(
                item=>
                    safeText(item?.key||item?.name)
                        .toLowerCase()===key
            )
            :null;

        const value=record?.manifest?.version||record?.version;

        if(value)return String(value);
    }catch{}

    return 'self-manifest';
};

const dependencyClosure=names=>{
    const result=[];
    const visiting=new Set();
    const visited=new Set();

    const visit=name=>{
        const key=safeText(name);

        if(!key||visited.has(key))return;

        if(visiting.has(key)){
            throw new Error(
                `Dependency cycle detected at ${key}.`
            );
        }

        const pkg=getPackageByName(key);

        if(!pkg){
            throw new Error(
                `Package dependency "${key}" is missing from pkg.js.`
            );
        }

        visiting.add(key);

        for(const dep of pkg.dependencies||[]){
            visit(dep);
        }

        visiting.delete(key);
        visited.add(key);
        result.push(key);
    };

    for(const name of names){
        visit(name);
    }

    return result;
};

const hasExistingInstallation=()=>{
    if(hasCompletedFlag())return false;

    for(const name of getInstalledPackages()){
        if(name)return true;
    }

    for(const record of getRegistry()){
        const key=safeText(record?.key||record?.name);
        const status=safeText(record?.status).toLowerCase();

        if(
            key&&
            
            [
                'installed',
                'enabled',
                'verified',
                'corrupted',
                'tampered',
                'blocked'
            ].includes(status)
        ){
            return true;
        }
    }

    return false;
};

const getCookieNames=()=>{
    try{
        return document.cookie
            .split(';')
            .map(v=>v.trim())
            .filter(Boolean)
            .map(v=>{
                const i=v.indexOf('=');
                return i>0?v.slice(0,i):v;
            })
            .filter(Boolean);
    }catch{
        return[];
    }
};

const getCookieDomainCandidates=()=>{
    const host=safeText(location.hostname).toLowerCase();

    if(
        !host||
        host==='localhost'||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||
        host.includes(':')
    ){
        return[];
    }

    const labels=host.split('.').filter(Boolean);
    const domains=[];

    for(
        let i=0;
        i<Math.max(0,labels.length-1);
        i++
    ){
        const candidate=labels.slice(i).join('.');

        if(candidate&&candidate!==host){
            domains.push(candidate);
        }
    }

    return Array.from(new Set(domains));
};

const getCookiePathCandidates=()=>{
    const result=new Set(['/']);

    let path=safeText(location.pathname)||'/';

    if(!path.startsWith('/')){
        path='/'+path;
    }

    while(path&&path!=='/'){
        result.add(path);

        const trimmed=
            path.replace(/\/[^/]*$/,'')||'/';

        path=trimmed;
    }

    return Array.from(result);
};

const deleteCookieVariant=async(name,path,domain='')=>{
    let attempted=0;

    try{
        document.cookie=
            `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=${path}; SameSite=Lax${domain?`; Domain=${domain}`:''}`;
        attempted++;
    }catch{}

    try{
        document.cookie=
            `${encodeURIComponent(name)}=; Max-Age=0; path=${path}${domain?`; Domain=${domain}`:''}`;
        attempted++;
    }catch{}

    return attempted>0;
};

const deleteAllCookies=async()=>{
    const errors=[];
    let deleted=0;
    const seen=new Set(getCookieNames());

    try{
        if(
            'cookieStore'in window&&
            typeof window.cookieStore?.getAll==='function'
        ){
            const cookies=await window.cookieStore.getAll();

            for(const cookie of cookies){
                const name=safeText(cookie?.name);

                if(!name)continue;

                try{
                    await window.cookieStore.delete({
                        name,
                        domain:cookie.domain,
                        path:cookie.path||'/',
                        partitioned:cookie.partitioned===true
                    });

                    deleted++;
                    seen.add(name);
                }catch{
                    try{
                        await window.cookieStore.delete(name);
                        deleted++;
                        seen.add(name);
                    }catch(error){
                        errors.push(
                            `cookieStore:${error?.message||'delete failed'}`
                        );
                    }
                }
            }
        }
    }catch(error){
        errors.push(
            `cookieStore:${error?.message||'enumeration failed'}`
        );
    }

    const names=Array.from(
        new Set([...seen,...getCookieNames()])
    );

    const paths=getCookiePathCandidates();

    const domains=[
        '',
        ...getCookieDomainCandidates()
            .map(v=>v.startsWith('.')?v:`.${v}`),
        ...getCookieDomainCandidates()
    ];

    for(const name of names){
        for(const path of paths){
            for(const domain of domains){
                if(
                    await deleteCookieVariant(
                        name,
                        path,
                        domain
                    )
                ){
                    deleted++;
                }
            }
        }
    }

    return{
        deleted,
        errors,
        remaining:getCookieNames()
    };
};

const clearStorageArea=(storage,label)=>{
    if(!storage){
        return{
            supported:false,
            cleared:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let before=0;
    let keys=[];

    try{
        before=storage.length||0;

        for(let i=0;i<before;i++){
            const key=storage.key(i);

            if(key!=null){
                keys.push(key);
            }
        }
    }catch(error){
        errors.push(
            `${label}:enumeration:${error?.message||'failed'}`
        );
    }

    try{
        storage.clear();
    }catch(error){
        errors.push(
            `${label}:clear:${error?.message||'failed'}`
        );
    }

    for(const key of keys){
        try{
            storage.removeItem(key);
        }catch(error){
            errors.push(
                `${label}:remove:${String(key)}:${error?.message||'failed'}`
            );
        }
    }

    let remaining=null;

    try{
        remaining=storage.length||0;
    }catch(error){
        errors.push(
            `${label}:verify:${error?.message||'failed'}`
        );
    }

    return{
        supported:true,
        cleared:before,
        remaining,
        errors
    };
};

const deleteIndexedDBDatabases=async()=>{
    if(typeof window.indexedDB?.databases!=='function'){
        return{
            supported:false,
            deleted:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let databases=[];

    try{
        databases=await window.indexedDB.databases();
    }catch(error){
        return{
            supported:true,
            deleted:0,
            remaining:null,
            errors:[
                `IndexedDB:enumeration:${error?.message||'failed'}`
            ]
        };
    }

    let deleted=0;

    for(const db of databases){
        const name=safeText(db?.name);

        if(!name)continue;

        const ok=await new Promise(resolve=>{
            let done=false;

            const finish=value=>{
                if(done)return;
                done=true;
                resolve(Boolean(value));
            };

            try{
                const req=window.indexedDB.deleteDatabase(name);

                req.onsuccess=()=>finish(true);

                req.onerror=()=>finish(false);

                req.onblocked=()=>{
                    setTimeout(
                        ()=>finish(false),
                        1200
                    );
                };

                setTimeout(
                    ()=>finish(false),
                    2200
                );
            }catch{
                finish(false);
            }
        });

        if(ok){
            deleted++;
        }else{
            errors.push(
                `IndexedDB:${name}:delete failed`
            );
        }
    }

    let remaining=null;

    try{
        remaining=(
            await window.indexedDB.databases()
        ).filter(
            v=>safeText(v?.name)
        ).length;
    }catch(error){
        errors.push(
            `IndexedDB:verify:${error?.message||'failed'}`
        );
    }

    return{
        supported:true,
        deleted,
        remaining,
        errors
    };
};

const deleteCaches=async()=>{
    if(
        !('caches'in window)||
        typeof window.caches.keys!=='function'
    ){
        return{
            supported:false,
            deleted:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let names=[];

    try{
        names=await window.caches.keys();
    }catch(error){
        return{
            supported:true,
            deleted:0,
            remaining:null,
            errors:[
                `Cache Storage:enumeration:${error?.message||'failed'}`
            ]
        };
    }

    let deleted=0;

    await Promise.all(
        names.map(async name=>{
            try{
                if(await window.caches.delete(name)){
                    deleted++;
                }
            }catch(error){
                errors.push(
                    `Cache Storage:${name}:${error?.message||'delete failed'}`
                );
            }
        })
    );

    let remaining=null;

    try{
        remaining=(await window.caches.keys()).length;
    }catch(error){
        errors.push(
            `Cache Storage:verify:${error?.message||'failed'}`
        );
    }

    return{
        supported:true,
        deleted,
        remaining,
        errors
    };
};

const unregisterServiceWorkers=async()=>{
    if(!navigator.serviceWorker?.getRegistrations){
        return{
            supported:false,
            unregistered:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let registrations=[];

    try{
        registrations=await navigator.serviceWorker.getRegistrations();
    }catch(error){
        return{
            supported:true,
            unregistered:0,
            remaining:null,
            errors:[
                `Service Workers:enumeration:${error?.message||'failed'}`
            ]
        };
    }

    let unregistered=0;

    for(const registration of registrations){
        try{
            if(await registration.unregister()){
                unregistered++;
            }
        }catch(error){
            errors.push(
                `Service Workers:${error?.message||'unregister failed'}`
            );
        }
    }

    let remaining=null;

    try{
        remaining=(
            await navigator.serviceWorker.getRegistrations()
        ).length;
    }catch(error){
        errors.push(
            `Service Workers:verify:${error?.message||'failed'}`
        );
    }

    return{
        supported:true,
        unregistered,
        remaining,
        errors
    };
};

const clearOriginPrivateFileSystem=async()=>{
    if(!navigator.storage?.getDirectory){
        return{
            supported:false,
            removed:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let removed=0;

    const walk=async dir=>{
        for await(const [name,handle] of dir.entries()){
            try{
                if(handle.kind==='directory'){
                    await walk(handle);
                }

                await dir.removeEntry(
                    name,
                    {
                        recursive:handle.kind==='directory'
                    }
                );

                removed++;
            }catch(error){
                errors.push(
                    `OPFS:${name}:${error?.message||'remove failed'}`
                );
            }
        }
    };

    try{
        const root=await navigator.storage.getDirectory();

        await walk(root);

        let remaining=0;

        for await(const _ of root.entries()){
            remaining++;
        }

        return{
            supported:true,
            removed,
            remaining,
            errors
        };
    }catch(error){
        return{
            supported:true,
            removed,
            remaining:null,
            errors:[
                `OPFS:${error?.message||'cleanup failed'}`,
                ...errors
            ]
        };
    }
};

const clearStorageBuckets=async()=>{
    if(
        !navigator.storageBuckets?.keys||
        !navigator.storageBuckets?.delete
    ){
        return{
            supported:false,
            deleted:0,
            remaining:null,
            errors:[]
        };
    }

    const errors=[];
    let names=[];

    try{
        names=await navigator.storageBuckets.keys();
    }catch(error){
        return{
            supported:true,
            deleted:0,
            remaining:null,
            errors:[
                `Storage Buckets:enumeration:${error?.message||'failed'}`
            ]
        };
    }

    let deleted=0;

    for(const name of names){
        try{
            if(await navigator.storageBuckets.delete(name)){
                deleted++;
            }
        }catch(error){
            errors.push(
                `Storage Buckets:${name}:${error?.message||'delete failed'}`
            );
        }
    }

    let remaining=null;

    try{
        remaining=(
            await navigator.storageBuckets.keys()
        ).length;
    }catch(error){
        errors.push(
            `Storage Buckets:verify:${error?.message||'failed'}`
        );
    }

    return{
        supported:true,
        deleted,
        remaining,
        errors
    };
};

const resetMUNITOSRuntime=async()=>{
    const api=getApi();

    if(!api){
        return{
            available:false,
            reset:false,
            detail:
                'MUNITOS Core was not ready; browser-origin cleanup will continue.'
        };
    }

    let reset=false;
    const errors=[];

    try{
        if(typeof api.cancelAllOperations==='function'){
            api.cancelAllOperations('installer-cleanup');
        }
    }catch(error){
        errors.push(
            `Core operations:${error?.message||'cancel failed'}`
        );
    }

    try{
        if(typeof api.factoryResetVirtualSystem==='function'){
            reset=
                api.factoryResetVirtualSystem()===true;
        }
    }catch(error){
        errors.push(
            `Core factory reset:${error?.message||'reset failed'}`
        );
    }

    try{
        const runtime=api.runtime||{};
        runtime.cancelAllOperations?.(
            'installer-cleanup'
        );
    }catch{}

    return{
        available:true,
        reset,
        detail:
            reset
                ?'MUNITOS virtual runtime and package state reset.'
                :'Virtual runtime reset API unavailable.',
        errors
    };
};

const runCleanupTask=async(name,task,verify)=>{
    let last=null;

    for(
        let attempt=1;
        attempt<=CLEANUP_RETRIES;
        attempt++
    ){
        try{
            const result=await task();
            last=result;

            const verification=await verify(result);
            const passed=
                verification===true||
                verification===undefined;

            if(passed){
                return{
                    status:'ok',
                    attempt,
                    result
                };
            }
        }catch(error){
            last={
                errors:[
                    error?.message||String(error)
                ]
            };
        }

        if(attempt<CLEANUP_RETRIES){
            await sleep(
                CLEANUP_RETRY_DELAY*attempt
            );
        }
    }

    return{
        status:'error',
        attempt:CLEANUP_RETRIES,
        result:last
    };
};

const verifyStorageArea=storage=>{
    try{
        return(storage?.length||0)===0;
    }catch{
        return false;
    }
};

const cleanInstallationData=async()=>{
    state.cleanupBusy=true;
    state.cleanupDiagnostics=[];

    const diagnostics=state.cleanupDiagnostics;

    try{
        const runtime=await resetMUNITOSRuntime();

        diagnostics.push({
            name:'MUNITOS runtime',
            status:
                runtime.reset
                    ?'ok'
                    :runtime.available
                        ?'partial'
                        :'skipped',
            detail:runtime.detail,
            errors:runtime.errors||[]
        });

        const tasks=[
            [
                'localStorage',
                ()=>clearStorageArea(
                    getStorage(),
                    'localStorage'
                ),
                result=>
                    result.supported
                        ?verifyStorageArea(getStorage())
                        :true
            ],
            [
                'sessionStorage',
                ()=>clearStorageArea(
                    getSessionStorage(),
                    'sessionStorage'
                ),
                result=>
                    result.supported
                        ?verifyStorageArea(getSessionStorage())
                        :true
            ],
            [
                'Service Workers',
                unregisterServiceWorkers,
                result=>
                    result.supported
                        ?result.remaining===0
                        :true
            ],
            [
                'Cache Storage',
                deleteCaches,
                result=>
                    result.supported
                        ?result.remaining===0
                        :true
            ],
            [
                'IndexedDB',
                deleteIndexedDBDatabases,
                result=>
                    result.supported
                        ?result.remaining===0
                        :true
            ],
            [
                'OPFS',
                clearOriginPrivateFileSystem,
                result=>
                    result.supported
                        ?result.remaining===0
                        :true
            ],
            [
                'Storage Buckets',
                clearStorageBuckets,
                result=>
                    result.supported
                        ?result.remaining===0
                        :true
            ],
            [
                'Cookies',
                deleteAllCookies,
                result=>result.remaining.length===0
            ]
        ];

        let hardFailure=false;

        for(const [name,task,verify] of tasks){
            const outcome=
                await runCleanupTask(
                    name,
                    task,
                    verify
                );

            const result=outcome.result||{};

            diagnostics.push({
                name,
                status:outcome.status,
                attempt:outcome.attempt,
                detail:result,
                errors:result.errors||[]
            });

            if(
                outcome.status==='error'&&
                !(result?.supported===false)
            ){
                hardFailure=true;
            }
        }

        await deleteCaches();
        await unregisterServiceWorkers();
        await deleteAllCookies();

        const finalCookies=getCookieNames();

        const finalCaches=
            typeof window.caches?.keys==='function'
                ?await window.caches.keys().catch(()=>[])
                :[];

        if(finalCookies.length){
            diagnostics.push({
                name:'Cookie verification',
                status:'partial',
                detail:{
                    remaining:finalCookies
                }
            });
        }

        if(finalCaches.length){
            diagnostics.push({
                name:'Cache verification',
                status:'error',
                detail:{
                    remaining:finalCaches
                }
            });
        }

        if(finalCaches.length){
            hardFailure=true;
        }

        state.selected.clear();
        state.required.clear();
        state.acceptedTerms=false;
        state.cleaned=true;
        state.error='';
        state.failed=false;
        state.installResults=[];
        state.log=[];

        clearWizardState();

        if(hardFailure){
            throw new Error(
                diagnostics
                    .filter(item=>item.status==='error')
                    .map(
                        item=>
                            `${item.name}: cleanup did not complete after ${CLEANUP_RETRIES} attempts.`
                    )
                    .join('\n')||
                'Cleanup could not be verified.'
            );
        }
    }finally{
        state.cleanupBusy=false;
    }
};

const getPackageStatus=pkg=>{
    const installed=
        getInstalledPackages().has(pkg.name);

    const record=getRegistry().find(
        item=>
            safeText(item?.key||item?.name)===pkg.name
    );

    const status=
        safeText(record?.status).toLowerCase();

    return{
        installed,
        record,
        status:
            status||
            (installed?'installed':'available'),
        enabled:
            [
                'installed',
                'enabled',
                'verified'
            ].includes(status)||installed
    };
};

const htmlToText=value=>{
    if(typeof value==='string')return value;

    try{
        const holder=document.createElement('div');
        holder.innerHTML=safeText(value?.html);
        return holder.textContent||'';
    }catch{
        return'';
    }
};

const packageInstall=async pkg=>{
    if(!state.appApi){
        throw new Error(
            'MUNITOS package manager is unavailable.'
        );
    }

    const name=safeText(pkg?.name);

    if(!name){
        throw new Error(
            'Package name is empty.'
        );
    }

    let lastError=null;

    for(
        let attempt=1;
        attempt<=PACKAGE_RETRIES;
        attempt++
    ){
        try{
            const result=
                await state.appApi.package.install(
                    name,
                    {
                        force:attempt>1,
                        silent:true,
                        toolKey:'pkg',
                        installMode:'internal'
                    },
                    null
                );

            const output=
                Array.isArray(result)
                    ?result
                        .map(htmlToText)
                        .filter(Boolean)
                        .join('\n')
                    :htmlToText(result);

            if(
                result?.ok===false||
                /failed to install|install.*failed|corrupted|quarantined|hash.*changed/i.test(output)
            ){
                throw new Error(
                    output||
                    `Package ${name} failed to install.`
                );
            }

            for(let i=0;i<20;i++){
                await sleep(120);

                const verify=getPackageStatus(pkg);

                if(verify.enabled){
                    return verify;
                }
            }

            const final=getPackageStatus(pkg);

            throw new Error(
                `Package ${name} was not registered as enabled. Final status: ${final.status||'unknown'}.`
            );
        }catch(error){
            lastError=error;

            if(attempt<PACKAGE_RETRIES){
                await sleep(
                    350*attempt
                );
            }
        }
    }

    throw lastError||
        new Error(
            `Package ${name} failed to install.`
        );
};

const screenshotNotice=message=>{
    const el=state.root?.querySelector(
        '[data-screenshot-result]'
    );

    if(!el)return;

    el.className='ki-notice ki-error';
    el.textContent='';

    const title=document.createElement('div');
    title.className='ki-notice-title';
    title.textContent='Screenshot';

    const body=document.createElement('div');
    body.className='ki-notice-text';
    body.textContent=message;

    el.append(title,body);

    setTimeout(()=>{
        try{
            render();
        }catch{}
    },2500);
};

const takeScreenshot=async()=>{
    try{
        if(!navigator.mediaDevices?.getDisplayMedia){
            throw new Error(
                'Screen capture is not supported by this browser.'
            );
        }

        const stream=
            await navigator.mediaDevices.getDisplayMedia({
                video:{
                    frameRate:1,
                    cursor:'never'
                },
                audio:false
            });

        const track=
            stream.getVideoTracks()[0];

        if(!track){
            throw new Error(
                'No screen capture track was created.'
            );
        }

        let canvas=null;

        const ImageCaptureCtor = window["ImageCapture"];
        if(typeof ImageCaptureCtor==='function'){
            const bitmap=
                await new ImageCaptureCtor(track).grabFrame();

            canvas=document.createElement('canvas');

            canvas.width=bitmap.width;
            canvas.height=bitmap.height;

            const ctx=
                canvas.getContext('2d');

            if(!ctx){
                throw new Error(
                    'Canvas context is unavailable.'
                );
            }

            ctx.drawImage(
                bitmap,
                0,
                0
            );

            bitmap.close?.();
        }else{
            const video=
                document.createElement('video');

            video.muted=true;
            video.playsInline=true;
            video.srcObject=stream;

            await video.play();

            await new Promise(
                resolve=>
                    requestAnimationFrame(
                        ()=>requestAnimationFrame(resolve)
                    )
            );

            canvas=
                document.createElement('canvas');

            canvas.width=
                video.videoWidth||1920;

            canvas.height=
                video.videoHeight||1080;

            const ctx=
                canvas.getContext('2d');

            if(!ctx){
                throw new Error(
                    'Canvas context is unavailable.'
                );
            }

            ctx.drawImage(
                video,
                0,
                0,
                canvas.width,
                canvas.height
            );

            video.pause();
            video.srcObject=null;
        }

        stream
            .getTracks()
            .forEach(t=>t.stop());

        const blob=
            await new Promise(
                resolve=>
                    canvas.toBlob(
                        resolve,
                        'image/png'
                    )
            );

        if(!blob){
            throw new Error(
                'Unable to create PNG image.'
            );
        }

        const url=
            URL.createObjectURL(blob);

        const a=
            document.createElement('a');

        a.href=url;

        a.download=
            `MUNITOS-Screenshot-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        setTimeout(
            ()=>URL.revokeObjectURL(url),
            3000
        );
    }catch(error){
        const message=
            error?.name==='NotAllowedError'
                ?'Screen capture permission was cancelled.'
                :error?.message||'Screenshot failed.';

        screenshotNotice(message);
    }
};

const createShell=()=>{
    const old=
        document.getElementById(
            'munitos-install-wizard-host'
        );

    old?.remove();

    const host=document.createElement('div');

    host.id='munitos-install-wizard-host';
    host.setAttribute(
        'aria-label',
        'MUNITOS Installer'
    );

    document.documentElement.appendChild(host);

    let shadow;

    try{
        shadow=
            host.attachShadow({
                mode:'open'
            });
    }catch{
        shadow=
            host.attachShadow({
                mode:'closed'
            });
    }

    state.shadow=shadow;

    const style=
        document.createElement('style');

    style.textContent=getStyles();

    shadow.appendChild(style);

    const root=
        document.createElement('div');

    root.className='ki-root';

    shadow.appendChild(root);

    state.root=root;
};

const getStyles=()=>`
:host{
    all:initial;
}

.ki-root,
.ki-root *{
    box-sizing:border-box;
}

.ki-root{
    --ki-primary:#6d5df5;
    --ki-primary-deep:#5146d8;
    --ki-secondary:#4f46e5;
    --ki-secondary-violet:#7c4dff;
    --ki-violet:#8b5cf6;
    --ki-violet-soft:#a78bfa;
    --ki-primary-soft:#c4b5fd;
    --ki-primary-bg:#211d3d;
    --ki-primary-bg-strong:#2b2450;
    --ki-primary-border:#4438a8;
    --ki-primary-glow:rgba(109,93,245,.34);

    --ki-warning:#f4c95d;
    --ki-warning-bg:#382f18;
    --ki-warning-border:#6e5a26;

    --ki-success:#73d583;
    --ki-success-deep:#4c9658;

    --ki-surface-0:#121212;
    --ki-surface-1:#1e1e1e;
    --ki-surface-2:#242424;
    --ki-surface-3:#2a2a2a;
    --ki-surface-4:#303030;

    --ki-border:#3a3a3a;
    --ki-border-light:#444;
    --ki-border-strong:#555;

    --ki-text:#e0e0e0;
    --ki-text-soft:#cccccc;
    --ki-text-muted:#aaaaaa;
    --ki-text-dim:#999;

    position:fixed;
    inset:0;
    width:100vw;
    height:100vh;
    height:100dvh;
    z-index:2147483645;
    overflow:hidden;
    background:var(--ki-surface-0);
    color:var(--ki-text);
    font:14px/1.45 Arial,Helvetica,sans-serif;
}

.ki-page{
    width:100%;
    height:100%;
    min-height:0;
    display:flex;
    flex-direction:column;
    overflow:hidden;
}

.ki-header{
    min-height:112px;
    height:112px;
    display:flex;
    align-items:center;
    justify-content:center;
    flex:none;
    position:relative;
    overflow:hidden;
    background:
        linear-gradient(
            135deg,
            #4b3cc4 0%,
            var(--ki-primary) 34%,
            var(--ki-secondary) 68%,
            var(--ki-secondary-violet) 100%
        );
    border-bottom:1px solid var(--ki-primary-border);
    box-shadow:
        0 8px 28px rgba(0,0,0,.26),
        0 0 32px var(--ki-primary-glow);
}

.ki-header:before{
    content:"";
    position:absolute;
    inset:0;
    background:
        radial-gradient(
            circle at 20% 25%,
            rgba(255,255,255,.16),
            transparent 28%
        ),
        radial-gradient(
            circle at 82% 70%,
            rgba(255,255,255,.12),
            transparent 26%
        ),
        linear-gradient(
            180deg,
            rgba(255,255,255,.07),
            rgba(0,0,0,.30)
        );
    pointer-events:none;
}

.ki-header:after{
    content:"";
    position:absolute;
    left:0;
    right:0;
    bottom:0;
    height:1px;
    background:
        linear-gradient(
            90deg,
            transparent,
            rgba(196,181,253,.72),
            transparent
        );
    pointer-events:none;
}

.ki-brand{
    position:relative;
    z-index:1;
    text-align:center;
    padding:8px 14px;
}

.ki-logo{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:205px;
    min-height:68px;
    padding:10px 22px;
    border:3px solid #fff;
    color:#fff;
    font-size:38px;
    font-weight:800;
    letter-spacing:3px;
    line-height:1;
    text-shadow:
        0 2px 12px rgba(0,0,0,.22);
    box-shadow:
        0 0 20px rgba(255,255,255,.10),
        inset 0 0 20px rgba(255,255,255,.05);
}

.ki-byline{
    margin-top:7px;
    color:#ddd7ff;
    font-size:10px;
    font-weight:700;
    letter-spacing:2px;
    text-transform:uppercase;
}

.ki-body{
    width:min(1280px,100%);
    margin:0 auto;
    display:flex;
    flex-direction:column;
    flex:1;
    min-height:0;
    overflow:hidden;
    padding:16px 18px 10px;
}

.ki-title{
    margin:0 0 10px;
    font-size:22px;
    font-weight:800;
    line-height:1.25;
    flex:none;
    color:#ffffff;
}

.ki-panel{
    display:flex;
    flex-direction:column;
    min-height:0;
    flex:1;
    overflow:hidden;
    background:var(--ki-surface-1);
    border:1px solid var(--ki-border);
    box-shadow:
        0 4px 14px rgba(0,0,0,.5),
        0 0 0 1px rgba(109,93,245,.03);
}

.ki-content{
    min-height:0;
    flex:1;
    padding:18px;
    overflow:auto;
    overscroll-behavior:contain;
    scrollbar-gutter:stable;
}

.ki-footer{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:10px 16px;
    border-top:1px solid var(--ki-border);
    background:var(--ki-surface-3);
    flex:none;
    min-height:64px;
}

.ki-footer-left,
.ki-footer-right{
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
}

.ki-footer-right{
    margin-left:auto;
}

.ki-button,
.ki-screenshot{
    min-height:40px;
    padding:8px 16px;
    border:1px solid var(--ki-border-strong);
    border-radius:4px;
    background:
        linear-gradient(
            #3a3a3a,
            #2a2a2a
        );
    color:var(--ki-text);
    font-weight:700;
    cursor:pointer;
    box-shadow:
        inset 0 1px rgba(255,255,255,.1),
        0 1px 0 rgba(0,0,0,.22);
    transition:
        background .15s ease,
        border-color .15s ease,
        box-shadow .15s ease,
        transform .08s ease;
}

.ki-button:hover:not(:disabled),
.ki-screenshot:hover{
    background:
        linear-gradient(
            #4a4a4a,
            #363636
        );
    border-color:#666;
}

.ki-button:active:not(:disabled),
.ki-screenshot:active{
    transform:translateY(1px);
}

.ki-button:disabled{
    opacity:.45;
    cursor:not-allowed;
}

.ki-primary{
    border-color:var(--ki-primary-deep);
    background:
        linear-gradient(
            135deg,
            #8175ff 0%,
            var(--ki-primary) 48%,
            var(--ki-primary-deep) 100%
        );
    color:#fff;
    box-shadow:
        inset 0 1px rgba(255,255,255,.18),
        0 5px 16px rgba(81,70,216,.18);
}

.ki-primary:hover:not(:disabled){
    background:
        linear-gradient(
            135deg,
            #978eff 0%,
            #7668ff 46%,
            #5c50df 100%
        );
    border-color:#6357e7;
    box-shadow:
        inset 0 1px rgba(255,255,255,.20),
        0 7px 20px rgba(81,70,216,.26);
}

.ki-danger{
    color:var(--ki-warning);
}

.ki-wide{
    min-width:170px;
}

.ki-copy{
    max-width:1160px;
}

.ki-copy p{
    margin:0 0 12px;
    font-size:14px;
}

.ki-copy .ki-lead{
    font-size:17px;
    font-weight:800;
}

.ki-notice,
.ki-agreement,
.ki-confirm{
    border:1px solid #444;
    background:var(--ki-surface-3);
    padding:13px 15px;
    margin:0 0 12px;
}

.ki-warning{
    background:var(--ki-warning-bg);
    border-color:var(--ki-warning-border);
}

.ki-error{
    background:#332b18;
    border-color:#665326;
}

.ki-notice-title,
.ki-agreement-title,
.ki-confirm-title{
    font-weight:800;
    margin-bottom:6px;
    color:#ffffff;
}

.ki-notice-text{
    line-height:1.55;
    color:var(--ki-text-soft);
}

.ki-links{
    display:grid;
    gap:6px;
}

.ki-links a{
    color:var(--ki-violet-soft);
    overflow-wrap:anywhere;
}

.ki-links a:hover{
    color:#c4b5fd;
}

.ki-agreement-list,
.ki-confirm-list{
    margin:0;
    padding-left:20px;
    color:var(--ki-text-soft);
}

.ki-agreement-list li,
.ki-confirm-list li{
    margin-bottom:5px;
}

.ki-checkbox-row{
    display:flex;
    align-items:flex-start;
    gap:9px;
    margin-top:15px;
}

.ki-checkbox-row input{
    width:18px;
    height:18px;
    margin-top:2px;
    flex:none;
    accent-color:var(--ki-primary);
}

.ki-checkbox-row label{
    font-weight:700;
    cursor:pointer;
    color:var(--ki-text);
}

.ki-clean-box{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:15px;
    padding:15px;
    border:1px solid #444;
    background:var(--ki-surface-3);
}

.ki-clean-copy{
    min-width:0;
}

.ki-clean-copy strong{
    display:block;
    font-size:15px;
    margin-bottom:3px;
    color:#ffffff;
}

.ki-clean-copy span{
    display:block;
    color:var(--ki-text-muted);
}

.ki-section-title{
    font-size:17px;
    font-weight:800;
    margin-bottom:5px;
    color:#ffffff;
}

.ki-section-subtitle{
    color:var(--ki-text-muted);
    margin-bottom:11px;
}

.ki-package-list{
    width:100%;
    height:clamp(220px,48dvh,560px);
    max-height:100%;
    min-height:220px;
    overflow:auto;
    overscroll-behavior:contain;
    border:1px solid #444;
    background:var(--ki-surface-1);
    scrollbar-gutter:stable;
}

.ki-package-header,
.ki-package-row{
    display:grid;
    grid-template-columns:
        34px
        minmax(190px,1.1fr)
        105px
        105px
        minmax(250px,2fr);
    align-items:center;
    gap:9px;
}

.ki-package-header{
    position:sticky;
    top:0;
    z-index:2;
    min-height:38px;
    background:var(--ki-surface-3);
    border-bottom:1px solid var(--ki-border-strong);
    font-size:11px;
    font-weight:800;
    padding:0 9px;
    box-shadow:
        0 1px 2px rgba(0,0,0,.3);
    color:var(--ki-text-soft);
}

.ki-package-row{
    min-height:62px;
    padding:8px 9px;
    border-bottom:1px solid #333;
    background:var(--ki-surface-1);
    cursor:pointer;
    user-select:none;
    transition:
        background .12s ease,
        box-shadow .12s ease;
    color:var(--ki-text);
}

.ki-package-row:nth-child(even){
    background:var(--ki-surface-2);
}

.ki-package-row:last-child{
    border-bottom:0;
}

.ki-package-row.ki-core{
    background:var(--ki-primary-bg);
    cursor:default;
}

.ki-package-row:not(.ki-core):hover{
    background:#2c2c2c;
}

.ki-package-row.ki-selected{
    background:var(--ki-primary-bg-strong)!important;
    box-shadow:
        inset 3px 0 var(--ki-primary),
        inset 0 0 24px rgba(109,93,245,.08);
}

.ki-package-row.ki-selected:hover{
    background:#352c5f!important;
}

.ki-package-checkbox{
    width:17px;
    height:17px;
    margin:0;
    cursor:pointer;
    accent-color:var(--ki-primary);
}

.ki-package-name{
    font-weight:800;
    overflow-wrap:anywhere;
    word-break:break-word;
    color:#ffffff;
}

.ki-package-name small{
    display:block;
    color:var(--ki-text-muted);
    font-size:10px;
    font-weight:400;
    margin-top:2px;
    line-height:1.3;
}

.ki-package-version,
.ki-package-level,
.ki-package-description{
    font-size:11px;
    overflow-wrap:anywhere;
    word-break:break-word;
    color:var(--ki-text-soft);
}

.ki-package-status{
    font-size:10px;
    color:var(--ki-text-muted);
    margin-top:2px;
}

.ki-badge{
    display:inline-block;
    padding:2px 5px;
    margin-left:4px;
    border:1px solid #a99bff;
    background:#30284e;
    color:#c4b5fd;
    font-size:9px;
    font-weight:800;
    vertical-align:2px;
}

.ki-summary{
    width:100%;
    border-collapse:collapse;
    margin-top:13px;
}

.ki-summary td{
    padding:8px 10px;
    border:1px solid #444;
    font-size:12px;
    color:var(--ki-text);
}

.ki-summary td:first-child{
    width:210px;
    background:var(--ki-surface-3);
    font-weight:700;
    color:var(--ki-text-soft);
}

.ki-progress{
    margin-top:13px;
    border:1px solid #444;
    box-shadow:
        0 0 0 1px rgba(109,93,245,.03);
}

.ki-progress-track{
    height:22px;
    background:var(--ki-surface-3);
    border-bottom:1px solid var(--ki-border-strong);
    overflow:hidden;
}

.ki-progress-bar{
    height:100%;
    width:0;
    background:
        linear-gradient(
            90deg,
            var(--ki-secondary-violet),
            var(--ki-primary),
            var(--ki-secondary)
        );
    box-shadow:
        0 0 16px rgba(109,93,245,.26);
    transition:width .2s ease;
}

.ki-progress-meta{
    display:flex;
    justify-content:space-between;
    gap:10px;
    padding:6px 9px;
    font-size:11px;
    color:var(--ki-text-muted);
}

.ki-terminal-log{
    margin-top:12px;
    padding:11px;
    border:1px solid #444;
    background:#11171c;
    color:#e6edf3;
    min-height:140px;
    max-height:270px;
    overflow:auto;
    font:11px/1.6 Consolas,Monaco,monospace;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
}

.ki-log-line{
    display:block;
}

.ki-log-ok{
    color:var(--ki-success);
}

.ki-log-error{
    color:#f4c95d;
}

.ki-log-accent{
    color:var(--ki-violet-soft);
}

.ki-log-muted{
    color:#aab2b9;
}

.ki-finish-icon{
    width:62px;
    height:62px;
    border:3px solid var(--ki-success-deep);
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    color:var(--ki-success-deep);
    font-size:29px;
    font-weight:800;
    margin-bottom:13px;
}

.ki-finish-title{
    font-size:23px;
    font-weight:800;
    margin-bottom:9px;
    color:#ffffff;
}

.ki-finish-text{
    font-size:14px;
    line-height:1.6;
    color:var(--ki-text-soft);
}

.ki-error-box{
    padding:11px 13px;
    margin-top:11px;
    border:1px solid #665326;
    background:#332b18;
    color:#f4c95d;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
}

.ki-empty{
    padding:28px 18px;
    text-align:center;
    color:var(--ki-text-muted);
}

.ki-hidden{
    display:none!important;
}

.ki-loader{
    display:inline-block;
    width:14px;
    height:14px;
    margin-right:7px;
    border:2px solid #555;
    border-top-color:var(--ki-violet-soft);
    border-right-color:var(--ki-secondary);
    border-radius:50%;
    vertical-align:-3px;
    animation:ki-spin .75s linear infinite;
}

.ki-keyboard-hint{
    margin-top:7px;
    color:var(--ki-text-dim);
    font-size:10px;
}

.ki-screenshot-result{
    min-height:0;
}

.ki-screenshot-result:empty{
    display:none;
}

@keyframes ki-spin{
    to{
        transform:rotate(360deg);
    }
}

@media(max-width:900px){
    .ki-header{
        min-height:92px;
        height:92px;
    }

    .ki-logo{
        min-width:158px;
        min-height:54px;
        font-size:29px;
        padding:8px 14px;
    }

    .ki-byline{
        font-size:9px;
    }

    .ki-body{
        padding:9px 10px 7px;
    }

    .ki-title{
        font-size:19px;
        margin-bottom:8px;
    }

    .ki-content{
        padding:13px;
    }

    .ki-package-header{
        display:none;
    }

    .ki-package-row{
        grid-template-columns:
            26px
            minmax(140px,1fr);
        align-items:start;
        gap:7px;
    }

    .ki-package-version,
    .ki-package-level,
    .ki-package-description{
        grid-column:2;
    }

    .ki-package-version:before{
        content:"Version: ";
        font-weight:800;
        color:var(--ki-text-soft);
    }

    .ki-package-level:before{
        content:"Policy: ";
        font-weight:800;
        color:var(--ki-text-soft);
    }

    .ki-package-description{
        line-height:1.45;
    }

    .ki-clean-box{
        flex-direction:column;
        align-items:stretch;
    }

    .ki-footer{
        min-height:60px;
        flex-direction:column;
        align-items:stretch;
        padding:8px 10px;
    }

    .ki-footer-left,
    .ki-footer-right{
        width:100%;
        margin:0;
    }

    .ki-footer-left .ki-screenshot,
    .ki-footer-right .ki-button{
        flex:1;
    }

    .ki-package-list{
        height:clamp(220px,43dvh,500px);
    }
}

@media(max-width:560px){
    .ki-header{
        min-height:78px;
        height:78px;
    }

    .ki-body{
        padding:6px 7px 5px;
    }

    .ki-content{
        padding:10px;
    }

    .ki-title{
        font-size:17px;
        margin-bottom:6px;
    }

    .ki-copy p{
        font-size:13px;
    }

    .ki-copy .ki-lead{
        font-size:15px;
    }

    .ki-footer{
        padding:7px;
    }

    .ki-logo{
        min-width:132px;
        min-height:45px;
        padding:7px 12px;
        font-size:22px;
        letter-spacing:2px;
    }

    .ki-byline{
        font-size:8px;
        letter-spacing:1.4px;
        margin-top:5px;
    }

    .ki-package-list{
        height:clamp(210px,39dvh,420px);
        min-height:210px;
    }

    .ki-package-row{
        min-height:72px;
    }

    .ki-summary td{
        padding:7px 8px;
        font-size:11px;
    }

    .ki-summary td:first-child{
        width:135px;
    }

    .ki-terminal-log{
        max-height:220px;
        font-size:10px;
    }

    .ki-button,
    .ki-screenshot{
        min-height:38px;
        padding:7px 12px;
        font-size:12px;
    }
}

@media(max-height:520px) and (orientation:landscape){
    .ki-header{
        min-height:64px;
        height:64px;
    }

    .ki-logo{
        min-height:39px;
        font-size:20px;
        padding:5px 12px;
    }

    .ki-byline{
        display:none;
    }

    .ki-body{
        padding:5px 8px;
    }

    .ki-content{
        padding:9px;
    }

    .ki-title{
        font-size:16px;
        margin-bottom:5px;
    }

    .ki-package-list{
        height:42dvh;
        min-height:170px;
    }

    .ki-footer{
        min-height:48px;
        padding:5px 8px;
        flex-direction:row;
    }

    .ki-footer-left,
    .ki-footer-right{
        width:auto;
    }
}

@media(prefers-reduced-motion:reduce){
    .ki-loader,
    .ki-progress-bar,
    .ki-package-row{
        animation:none;
        transition:none;
    }
}
`;

const captureScrollState=()=>{
    const result={
        content:0,
        packageList:0,
        terminal:0,
        step:state.step
    };

    try{
        const content=
            state.root?.querySelector('.ki-content');

        const packageList=
            state.root?.querySelector('.ki-package-list');

        const terminal=
            state.root?.querySelector('.ki-terminal-log');

        result.content=content?.scrollTop||0;
        result.packageList=packageList?.scrollTop||0;
        result.terminal=terminal?.scrollTop||0;
    }catch{}

    return result;
};

const restoreScrollState=data=>{
    if(!data)return;

    requestAnimationFrame(()=>{
        try{
            const content=
                state.root?.querySelector('.ki-content');

            const packageList=
                state.root?.querySelector('.ki-package-list');

            const terminal=
                state.root?.querySelector('.ki-terminal-log');

            if(data.step===state.step){
                if(content){
                    content.scrollTop=data.content;
                }

                if(packageList){
                    packageList.scrollTop=data.packageList;
                }

                if(terminal){
                    terminal.scrollTop=
                        terminal.scrollHeight;
                }
            }
        }catch{}
    });
};

const render=()=>{
    if(!state.root)return;

    const scrollState=captureScrollState();

    state.root.innerHTML='';

    const page=
        document.createElement('div');

    page.className='ki-page';

    const header=
        document.createElement('header');

    header.className='ki-header';

    header.innerHTML=
        '<div class="ki-brand">' +
            '<div class="ki-logo">MUNITOS</div>' +
            '<div class="ki-byline">MUNITOS INSTALLER</div>' +
        '</div>';

    const body=
        document.createElement('main');

    body.className='ki-body';

    const title=
        document.createElement('h1');

    title.className='ki-title';
    title.textContent=getStepTitle();

    const panel=
        document.createElement('section');

    panel.className='ki-panel';

    const content=
        document.createElement('div');

    content.className='ki-content';

    renderContent(content);

    const footer=
        document.createElement('footer');

    footer.className='ki-footer';

    const left=
        document.createElement('div');

    left.className='ki-footer-left';

    const right=
        document.createElement('div');

    right.className='ki-footer-right';

    renderFooter(
        left,
        right
    );

    footer.append(
        left,
        right
    );

    panel.append(content);

    body.append(
        title,
        panel,
        footer
    );

    page.append(
        header,
        body
    );

    state.root.append(page);

    attachEvents();
    restoreScrollState(scrollState);
};

const getStepTitle=()=>({
    terms:'Installation agreement',
    clean:'Clean installation',
    packages:'Software selection',
    confirm:'Installation confirmation',
    installing:'Installing MUNITOS',
    done:'Installation complete',
    error:'Installation failed'
}[state.step]||'MUNITOS Installer');

const renderContent=container=>{
    switch(state.step){
        case'terms':
            renderTerms(container);
            break;
        case'clean':
            renderClean(container);
            break;
        case'packages':
            renderPackages(container);
            break;
        case'confirm':
            renderConfirm(container);
            break;
        case'installing':
            renderInstalling(container);
            break;
        case'done':
            renderDone(container);
            break;
        case'error':
            renderError(container);
            break;
        default:
            container.textContent='';
    }
};

const renderTerms=container=>{
    container.innerHTML=
        `<div class="ki-copy">
            <p class="ki-lead">
                Before continuing, review and accept the complete MUNITOS installation agreement.
            </p>

            <p>
                This installer uses the local <strong>pkg.js</strong> package catalog and the active MUNITOS package manager. Optional packages are entirely user-selectable.
            </p>

            <div class="ki-notice">
                <div class="ki-notice-title">
                    Browser storage and runtime disclosure
                </div>

                <div class="ki-notice-text">
                    By continuing, you acknowledge that MUNITOS may use browser-side capabilities required by the application, including cookies, localStorage, sessionStorage, Cache Storage, IndexedDB, Service Workers, and related same-origin state. Cleanup or uninstall may remove accessible data for this origin.
                </div>
            </div>

            <div class="ki-notice">
                <div class="ki-notice-title">
                    Official MUNITOS channels
                </div>

                <div class="ki-links">
                    ${OFFICIAL_LINKS.map(
                        url=>
                            `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`
                    ).join('')}
                </div>
            </div>

            <div class="ki-agreement">
                <div class="ki-agreement-title">
                    Installation agreement
                </div>

                <ul class="ki-agreement-list">
                    <li>I have read and accepted the MUNITOS installation agreement.</li>
                    <li>I understand that installation may change persistent browser-side application state.</li>
                    <li>I understand that cookies, localStorage, sessionStorage, Cache Storage, IndexedDB, Service Workers, and related same-origin state may be used.</li>
                    <li>I understand that package installation is performed through the active MUNITOS package manager.</li>
                    <li>I understand that cleanup may permanently remove accessible browser-side application data for this origin.</li>
                </ul>
            </div>

            <div class="ki-checkbox-row">
                <input id="ki-terms" type="checkbox" ${state.acceptedTerms?'checked':''}>

                <label for="ki-terms">
                    I have read, understood, and accepted the complete agreement and storage disclosure.
                </label>
            </div>

            <div class="ki-keyboard-hint">
                Acceptance is required before continuing.
            </div>
        </div>`;
};

const renderClean=container=>{
    const installed=
        Array.from(
            getInstalledPackages()
        ).filter(
            name=>Boolean(name)
        );

    const registry=
        getRegistry().filter(record=>{
            const key=
                safeText(
                    record?.key||
                    record?.name
                );

            return Boolean(key);
        });

    const diagnostics=
        state.cleanupDiagnostics.length
            ?`<div class="ki-notice">
                <div class="ki-notice-title">
                    Automatic cleanup diagnostics
                </div>

                <div class="ki-notice-text">
                    ${state.cleanupDiagnostics.map(
                        item=>
                            `${escapeHtml(item.name)}: ${escapeHtml(item.status)}`
                    ).join(' • ')}
                </div>
            </div>`
            :'';

    container.innerHTML=
        `<div class="ki-copy">
            <p class="ki-lead">
                Existing MUNITOS package installation data was detected.
            </p>

            <p>
                Existing package state triggers the clean step. Core services are part of the running system and are not treated as installable packages.
            </p>

            <div class="ki-notice ki-warning">
                <div class="ki-notice-title">
                    Clean installation required
                </div>

                <div class="ki-notice-text">
                    MUNITOS will automatically cancel active runtime operations, reset its virtual system, remove accessible origin data, retry failed cleanup tasks, and verify the result.
                </div>
            </div>

            ${diagnostics}

            <div class="ki-clean-box">
                <div class="ki-clean-copy">
                    <strong>
                        ${installed.length} installed package state(s)
                    </strong>

                    <span>
                        ${registry.length} registry record(s) detected.
                    </span>
                </div>

                <button
                    type="button"
                    class="ki-button ki-danger ki-wide"
                    data-action="clean"
                    ${state.cleanupBusy?'disabled':''}
                >
                    ${state.cleanupBusy?'Cleaning...':'Clean'}
                </button>
            </div>
        </div>`;
};

const renderPackages=container=>{
    if(!state.catalog.length){
        container.innerHTML=
            '<div class="ki-empty">No packages were found in pkg.js.</div>';
        return;
    }

        const rows=
        state.catalog.map(pkg=>{
            const selected=
                state.selected.has(pkg.name);
            const info=
                getPackageStatus(pkg);

            const commandCount=
                Array.isArray(pkg.commands)
                    ?pkg.commands.length
                    :0;

            return`
                <div
                    class="ki-package-row ${selected?'ki-selected':''}"
                    data-package-row="${escapeHtml(pkg.name)}"
                    data-selected="${selected?'true':'false'}"
                    role="option"
                    aria-selected="${selected?'true':'false'}"
                >
                    <div>
                        <input
                            class="ki-package-checkbox"
                            type="checkbox"
                            data-package-toggle="${escapeHtml(pkg.name)}"
                            ${selected?'checked':''}
                            aria-label="Select ${escapeHtml(pkg.name)}"
                        >
                    </div>

                    <div class="ki-package-name">
                        ${escapeHtml(pkg.name)}

                        <small>
                            ${
                                commandCount
                                    ?`${commandCount} routing command(s)`
                                    :'Commands load from the package manifest'
                            }
                        </small>

                        <div class="ki-package-status">
                            Status: ${escapeHtml(info.status||'available')}
                        </div>
                    </div>

                    <div class="ki-package-version">
                        Self-managed
                    </div>

                    <div class="ki-package-level">
                        Package manifest
                    </div>

                    <div class="ki-package-description">
                        ${escapeHtml(pkg.description||'No package description.')}
                    </div>
                </div>
            `;
        }).join('');

    container.innerHTML=
        `<div class="ki-section-title">
            Choose optional software
        </div>

        <div class="ki-section-subtitle">
            Click anywhere on a package row to select it. You may continue with zero optional packages.
        </div>

        <div
            class="ki-package-list"
            role="listbox"
            aria-label="MUNITOS package list"
            tabindex="0"
        >
            <div class="ki-package-header">
                <div></div>
                <div>Package</div>
                <div>Version</div>
                <div>Policy</div>
                <div>Description</div>
            </div>

            ${rows}
        </div>

        <table class="ki-summary">
            <tr>
                <td>Selected optional packages</td>
                <td data-selected-count>
                    ${state.selected.size}
                </td>
            </tr>

            <tr>
                <td>Catalog entries</td>
                <td>
                    ${state.catalog.length}
                </td>
            </tr>
        </table>`;
};

const renderConfirm=container=>{
    const names=
        Array.from(
            state.required
        );

    const visible=
        names.filter(
            Boolean
        );

    const list=
        visible.length
            ?visible.map(name=>{
                const pkg=
                    getPackageByName(name);

                return`
                    <li>
                        <strong>${escapeHtml(name)}</strong>
                        ${pkg?' — self-managed manifest':''}
                    </li>
                `;
            }).join('')
            :'<li>No optional package selected.</li>';

    container.innerHTML=
        `<div class="ki-copy">
            <p class="ki-lead">
                Ready to install MUNITOS.
            </p>

            <p>
                Review the selected optional packages. Choosing none is valid and will not block installation.
            </p>

            <div class="ki-confirm">
                <div class="ki-confirm-title">
                    Optional packages
                </div>

                <ul class="ki-confirm-list">
                    ${list}
                </ul>
            </div>

            <table class="ki-summary">
                <tr>
                    <td>Total optional operations</td>
                    <td>${visible.length}</td>
                </tr>

                <tr>
                    <td>User selected</td>
                    <td>${state.selected.size}</td>
                </tr>

                <tr>
                    <td>Dependency resolution</td>
                    <td>Enabled</td>
                </tr>

                <tr>
                    <td>Installation manager</td>
                    <td>Active MUNITOS package manager</td>
                </tr>
            </table>

            <div class="ki-notice">
                <div class="ki-notice-title">
                    Final confirmation
                </div>

                <div class="ki-notice-text">
                    Click Install to begin. Optional package selection is not mandatory.
                </div>
            </div>
        </div>`;
};

const renderInstalling=container=>{
    const total=state.required.size;

    const completed=
        state.installResults.filter(
            item=>item.status==='success'
        ).length;

    const packageProgress=
        total
            ?Math.round(
                completed/total*100
            )
            :0;

    const elapsed=
        Math.max(
            0,
            Date.now()-
            (state.installStartedAt||Date.now())
        );

    const timeProgress=
        Math.min(
            100,
            Math.round(
                elapsed/MIN_INSTALL_DURATION*100
            )
        );

    const progress=
        Math.max(
            packageProgress,
            timeProgress
        );

    const log=
        state.log.length
            ?state.log.map(
                item=>
                    `<span class="ki-log-line ki-log-${escapeHtml(item.type||'muted')}">${escapeHtml(item.text)}</span>`
            ).join('')
            :'<span class="ki-log-line ki-log-muted">Preparing your personal MUNITOS system...</span>';

    container.innerHTML=
        `<div class="ki-copy">
            <p class="ki-lead">
                Building your personal MUNITOS system...
            </p>

            <p>
                The installer is executing the selected package operations and preparing the runtime. Minimum installation time: ${MIN_INSTALL_DURATION/1000} seconds.
            </p>

            <div class="ki-progress">
                <div class="ki-progress-track">
                    <div
                        class="ki-progress-bar"
                        style="width:${progress}%"
                    ></div>
                </div>

                <div class="ki-progress-meta">
                    <span>
                        ${completed}/${total} package operations
                    </span>

                    <span>
                        ${progress}%
                    </span>
                </div>
            </div>

            <div class="ki-terminal-log">
                ${log}
            </div>
        </div>`;
};

const renderDone=container=>{
    const ok=
        state.installResults.filter(
            item=>item.status==='success'
        ).length;

    container.innerHTML=
        `<div class="ki-copy">
            <div class="ki-finish-icon">
                ✓
            </div>

            <div class="ki-finish-title">
                MUNITOS installation completed.
            </div>

            <div class="ki-finish-text">
                The selected package installation has completed successfully. Your installation is ready. Click <strong>Finish</strong> below to close the installer and refresh MUNITOS.
            </div>

            <table class="ki-summary">
                <tr>
                    <td>Successful optional operations</td>
                    <td>${ok}</td>
                </tr>

                <tr>
                    <td>Installation state</td>
                    <td>COMPLETED</td>
                </tr>

                <tr>
                    <td>System</td>
                    <td>MUNITOS</td>
                </tr>
            </table>
        </div>`;
};

const renderError=container=>{
    container.innerHTML=
        `<div class="ki-copy">
            <p class="ki-lead">
                Installation could not be completed.
            </p>

            <p>
                The installer state has been reset so the next attempt starts from the first stage.
            </p>

            ${
                state.error
                    ?`<div class="ki-error-box">${escapeHtml(state.error)}</div>`
                    :''
            }

            <div class="ki-notice ki-error">
                <div class="ki-notice-title">
                    Retry
                </div>

                <div class="ki-notice-text">
                    Use Restart to return to the first step, or Back to return to the previous available screen.
                </div>
            </div>
        </div>`;
};

const renderFooter=(left,right)=>{
    const screenshot=
        document.createElement('button');

    screenshot.type='button';
    screenshot.className='ki-screenshot';
    screenshot.dataset.action='screenshot';
    screenshot.textContent='Screenshot';

    left.appendChild(screenshot);

    if(state.step==='terms'){
        const btn=
            document.createElement('button');

        btn.className='ki-button ki-primary';
        btn.dataset.action='continue-terms';
        btn.disabled=!state.acceptedTerms;
        btn.textContent='Continue';

        right.appendChild(btn);
        return;
    }

    if(state.step==='clean'){
        const back=
            document.createElement('button');

        back.className='ki-button';
        back.dataset.action='back';
        back.textContent='Back';

        const clean=
            document.createElement('button');

        clean.className='ki-button ki-danger';
        clean.dataset.action='clean';
        clean.textContent='Clean';

        right.append(
            back,
            clean
        );

        return;
    }

    if(state.step==='packages'){
        const back=
            document.createElement('button');

        back.className='ki-button';
        back.dataset.action='back';
        back.textContent='Back';

        const next=
            document.createElement('button');

        next.className='ki-button ki-primary';
        next.dataset.action='continue-packages';
        next.textContent='Continue';

        right.append(
            back,
            next
        );

        return;
    }

    if(state.step==='confirm'){
        const back=
            document.createElement('button');

        back.className='ki-button';
        back.dataset.action='back';
        back.textContent='Back';

        const install=
            document.createElement('button');

        install.className='ki-button ki-primary';
        install.dataset.action='install';
        install.textContent='Install';

        right.append(
            back,
            install
        );

        return;
    }

    if(state.step==='installing'){
        const btn=
            document.createElement('button');

        btn.className='ki-button';
        btn.disabled=true;
        btn.innerHTML=
            '<span class="ki-loader"></span>Installing';

        right.appendChild(btn);

        return;
    }

    if(state.step==='done'){
        const btn=
            document.createElement('button');

        btn.className='ki-button ki-primary ki-wide';
        btn.dataset.action='finish';
        btn.textContent='Finish';

        right.appendChild(btn);

        return;
    }

    if(state.step==='error'){
        const restart=
            document.createElement('button');

        restart.className='ki-button';
        restart.dataset.action='restart';
        restart.textContent='Restart';

        right.appendChild(restart);
    }
};

const updatePackageSelectionUI=()=>{
    if(!state.root)return;

    const count=
        state.root.querySelector(
            '[data-selected-count]'
        );

    if(count){
        count.textContent=
            String(state.selected.size);
    }

    state.root
        .querySelectorAll('[data-package-row]')
        .forEach(row=>{
            const name=
                safeText(
                    row.getAttribute(
                        'data-package-row'
                    )
                );

            const selected=
                state.selected.has(name);

            row.classList.toggle(
                'ki-selected',
                selected
            );

            row.setAttribute(
                'data-selected',
                selected?'true':'false'
            );

            row.setAttribute(
                'aria-selected',
                selected?'true':'false'
            );

            const input=
                row.querySelector(
                    '[data-package-toggle]'
                );

            if(
                input&&
                !input.disabled
            ){
                input.checked=selected;
            }
        });
};

const setPackageSelected=(name,selected)=>{
    const key=safeText(name);

    if(!key){
        return false;
    }

    if(selected){
        state.selected.add(key);
    }else{
        state.selected.delete(key);
    }

    saveWizardState();
    updatePackageSelectionUI();

    return true;
};

const togglePackageSelected=name=>{
    const key=safeText(name);

    if(!key){
        return false;
    }

    return setPackageSelected(
        key,
        !state.selected.has(key)
    );
};

const attachEvents=()=>{
    if(!state.root)return;

    const terms=
        state.root.querySelector(
            '#ki-terms'
        );

    terms?.addEventListener(
        'change',
        ()=>{
            state.acceptedTerms=
                terms.checked===true;

            saveWizardState();

            const continueButton=
                state.root.querySelector(
                    '[data-action="continue-terms"]'
                );

            if(continueButton){
                continueButton.disabled=
                    !state.acceptedTerms;
            }
        }
    );

    const packageList=
        state.root.querySelector(
            '.ki-package-list'
        );

    if(packageList){
        packageList.addEventListener(
            'click',
            event=>{
                const target=event.target;

                const input=
                    target instanceof Element
                        ?target.closest(
                            '[data-package-toggle]'
                        )
                        :null;

                if(input){
                    const name=
                        safeText(
                            input.getAttribute(
                                'data-package-toggle'
                            )
                        );

                    if(input.disabled)return;

                    setPackageSelected(
                        name,
                        input.checked
                    );

                    event.stopPropagation();
                    return;
                }

                const row=
                    target instanceof Element
                        ?target.closest(
                            '[data-package-row]'
                        )
                        :null;

                if(
                    !row||
                    !packageList.contains(row)
                ){
                    return;
                }

                const name=
                    safeText(
                        row.getAttribute(
                            'data-package-row'
                        )
                    );

                if(!name){
                    return;
                }

                togglePackageSelected(name);
            }
        );

        packageList.addEventListener(
            'keydown',
            event=>{
                if(
                    event.key!=='Enter'&&
                    event.key!==' '
                ){
                    return;
                }

                const target=event.target;

                const row=
                    target instanceof Element
                        ?target.closest(
                            '[data-package-row]'
                        )
                        :null;

                if(
                    !row||
                    !packageList.contains(row)
                ){
                    return;
                }

                const name=
                    safeText(
                        row.getAttribute(
                            'data-package-row'
                        )
                    );

                if(!name){
                    return;
                }

                event.preventDefault();

                togglePackageSelected(name);
            }
        );
    }

    state.root
        .querySelectorAll('[data-action]')
        .forEach(button=>{
            button.addEventListener(
                'click',
                ()=>{
                    void handleAction(
                        button.getAttribute(
                            'data-action'
                        )
                    );
                }
            );
        });
};

const continueFromTerms=()=>{
    if(!state.acceptedTerms)return;

    if(
        hasExistingInstallation()&&
        !state.cleaned
    ){
        state.step='clean';
        saveWizardState();
        render();
        return;
    }

    state.step='packages';
    saveWizardState();
    render();
};

const prepareConfirmation=()=>{
    try{
        const requested=
            Array.from(
                state.selected
            ).filter(
                Boolean
            );

        const resolved=
            requested.length
                ?dependencyClosure(requested)
                :[];

        state.required=
            new Set(
                resolved.filter(
                    Boolean
                )
            );

        state.error='';
        state.step='confirm';

        saveWizardState();
        render();
    }catch(error){
        state.error=
            error?.message||
            'Dependency resolution failed.';

        state.step='error';
        state.failed=true;

        render();
    }
};

const goBack=()=>{
    if(state.installing)return;

    switch(state.step){
        case'clean':
            state.step='terms';
            break;

        case'packages':
            state.step='terms';
            break;

        case'confirm':
            state.step='packages';
            break;

        case'error':
            resetWizardToStart();
            return;

        default:
            return;
    }

    saveWizardState();
    render();
};

const handleClean=async()=>{
    if(state.cleanupBusy)return;

    state.cleanupBusy=true;

    const button=
        state.root?.querySelector(
            '[data-action="clean"]'
        );

    if(button){
        button.disabled=true;
        button.textContent='Cleaning...';
    }

    try{
        await cleanInstallationData();
        await sleep(250);
        window.location.reload();
    }catch(error){
        state.cleanupBusy=false;
        state.error=
            error?.message||
            'Clean operation failed.';
        state.step='error';
        state.failed=true;
        render();
    }
};

const addLog=(text,type='muted')=>{
    state.log.push({
        text:safeText(text),
        type
    });

    if(state.log.length>100){
        state.log.splice(
            0,
            state.log.length-100
        );
    }

    render();
};

const startInstallation=async()=>{
    if(state.installing)return;

    state.installing=true;
    state.failed=false;
    state.error='';
    state.installResults=[];
    state.log=[];
    state.installStartedAt=Date.now();
    state.step='installing';

    render();

    try{
        await waitForApi(15000);

        const ordered=
            state.required.size
                ?dependencyClosure(
                    Array.from(state.required)
                ).filter(
                    Boolean
                )
                :[];

        addLog(
            'MUNITOS installation engine initialized.',
            'accent'
        );

        addLog(
            `Optional package queue: ${ordered.length} package(s).`,
            'muted'
        );

        if(!ordered.length){
            addLog(
                'No optional packages selected. Continuing with the MUNITOS system core.',
                'accent'
            );
        }

        for(
            let i=0;
            i<ordered.length;
            i++
        ){
            const pkg=
                getPackageByName(
                    ordered[i]
                );

            if(!pkg){
                throw new Error(
                    `Package ${ordered[i]} is missing from pkg.js.`
                );
            }

            addLog(
                `[${i+1}/${ordered.length}] Installing ${pkg.name} from its self-managed package manifest...`,
                'accent'
            );

            try{
                await packageInstall(pkg);

                const installedVersion=
                    getPackageVersion(pkg.name);

                state.installResults.push({
                    package:pkg.name,
                    version:installedVersion,
                    status:'success'
                });

                addLog(
                    `✓ ${pkg.name} ${installedVersion} installed successfully.`,
                    'ok'
                );
            }catch(error){
                state.installResults.push({
                    package:pkg.name,
                    version:getPackageVersion(
                        pkg.name
                    ),
                    status:'failed',
                    error:
                        error?.message||
                        'Unknown error'
                });

                addLog(
                    `✗ ${pkg.name} installation failed.`,
                    'error'
                );

                throw error;
            }

            render();
        }

        while(
            Date.now()-state.installStartedAt<
            MIN_INSTALL_DURATION
        ){
            const elapsed=
                Date.now()-state.installStartedAt;

            const remaining=
                Math.max(
                    0,
                    MIN_INSTALL_DURATION-elapsed
                );

            const seconds=
                Math.ceil(
                    remaining/1000
                );

            addLog(
                `Building your personal MUNITOS system... ${seconds}s remaining.`,
                'muted'
            );

            render();

            await sleep(
                Math.min(
                    1000,
                    Math.max(
                        100,
                        remaining
                    )
                )
            );
        }

        addLog(
            'Finalizing MUNITOS runtime configuration.',
            'accent'
        );

        await sleep(250);

        setCompletedFlag();

        state.installing=false;
        state.finished=true;
        state.failed=false;
        state.step='done';

        render();
    }catch(error){
        state.installing=false;
        state.finished=false;
        state.failed=true;
        state.error=
            error?.message||
            'Installation failed unexpectedly.';
        state.step='error';

        clearWizardState();
        render();
    }
};

const finishAndClose=()=>{
    if(state.reloadPending)return;

    state.reloadPending=true;

    setCompletedFlag();

    state.finished=true;
    state.installing=false;

    try{
        document
            .getElementById('termInput')
            ?.focus({
                preventScroll:true
            });
    }catch{}

    const root=state.root;

    state.root=null;

    root?.remove();

    setTimeout(()=>{
        try{
            window.location.reload();
        }catch{
            try{
                location.reload();
            }catch{}
        }
    },50);
};

const handleAction=async action=>{
    switch(action){
        case'continue-terms':
            continueFromTerms();
            break;

        case'clean':
            await handleClean();
            break;

        case'continue-packages':
            prepareConfirmation();
            break;

        case'back':
            goBack();
            break;

        case'install':
            await startInstallation();
            break;

        case'finish':
            finishAndClose();
            break;

        case'restart':
            resetWizardToStart();
            break;

        case'screenshot':
            await takeScreenshot();
            break;
    }
};

const bootstrap=async()=>{
    let force=false;

    try{
        force=
            new URLSearchParams(
                location.search
            ).get('munitos-install')==='force';
    }catch{}

    if(
        !force&&
        hasCompletedFlag()
    ){
        return;
    }

    clearWizardState();

    state.step='terms';
    state.acceptedTerms=false;
    state.cleaned=false;
    state.selected.clear();
    state.required.clear();
    state.installing=false;
    state.finished=false;
    state.failed=false;
    state.error='';
    state.installResults=[];
    state.log=[];
    state.cleanupDiagnostics=[];
    state.cleanupBusy=false;
    state.installStartedAt=0;
    state.reloadPending=false;

    createShell();
    render();

    try{
        const catalogRoot=
            await loadPkgJs();

        state.catalog=
            normalizeCatalog(
                catalogRoot
            );

        if(!state.catalog.length){
            throw new Error(
                'pkg.js contains no package entries.'
            );
        }

        state.selected=
            new Set(
                Array.from(
                    state.selected
                ).filter(
                    name=>
                        getPackageByName(name)
                )
            );

        render();
    }catch(error){
        state.error=
            error?.message||
            'Unable to initialize MUNITOS installer.';

        state.step='error';
        state.failed=true;

        render();
    }
};

if(document.readyState==='loading'){
    document.addEventListener(
        'DOMContentLoaded',
        ()=>{
            void bootstrap();
        },
        {
            once:true
        }
    );
}else{
    void bootstrap();
}

})();