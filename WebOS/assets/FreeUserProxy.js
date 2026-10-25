(function(){
'use strict';
const FILE_VERSION='1.0';
const VERSION=FILE_VERSION;
const TEST_URL='https://munitos.github.io/';
const DIRECT_TIMEOUT=30000;
const PROXY_TIMEOUT=60000;
const PROXY_TEST_TIMEOUT=20000;
const PAGE_LOAD_TIMEOUT=60000;
const STORAGE_KEY='munitos-free-user-proxy-custom:v1';
const REQUEST_MAX_PROXY_ATTEMPTS=16;
const MAX_CONCURRENT_PROXY_REQUESTS=2;
const PROXY_HEDGE_DELAY=120;
const nativeFetch=typeof globalThis.fetch==='function'?globalThis.fetch.bind(globalThis):null;
const proxySubscribers=new Set();
const SYSTEM_PROXIES=Object.freeze([
{name:'kalilightstudio-https',template:'https://proxy.kalilightstudio.workers.dev/?url={url}'},
{name:'cyberguardians-https',template:'https://lively-cake-b917.cyberguardiansunion.workers.dev/?url={url}'},
{name:'atlascodeals-https',template:'https://dark-mode-2e10.atlascodeals-e5c.workers.dev/?url={url}'},
{name:'mwqarjlalyh-https',template:'https://lively-wildflower-4981.mwqarjlalyh.workers.dev/?url={url}'},
{name:'sayzenteam-https',template:'https://steep-term-48e2.sayzenteam.workers.dev/?url={url}'},
{name:'mobinteam0-https',template:'https://cool-silence-44cd.mobinteam0.workers.dev/?url={url}'},
{name:'m0o1b2i3n4-https',template:'https://morning-credit-f81e.m0o1b2i3n4.workers.dev/?url={url}'}
]);
const systemEntries=SYSTEM_PROXIES.map((proxy,index)=>Object.freeze({id:`system-${index+1}`,type:'System',name:proxy.name,template:proxy.template}));
let customProxies=[];
let disabledSystemIds=new Set();
let proxyStatus=new Map();
let workingProxies=[];
let initialized=false;
let scanning=false;
let scanGeneration=0;
let scanPromise=null;
let scanReady=Promise.resolve([]);
let proxyRevision=0;
function safeArray(value){return Array.isArray(value)?value:[];}
function safeObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function clone(value){if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(clone);const out={};for(const key of Object.keys(value))out[key]=clone(value[key]);return out;}
function safeText(value,fallback=''){const text=String(value??'').trim();return text||fallback;}
function isReplaySafeMethod(method){return ['GET','HEAD','OPTIONS'].includes(safeText(method,'GET').toUpperCase());}
function normalizeId(value){return safeText(value).replace(/[^a-zA-Z0-9._:-]/g,'-').slice(0,120);}
function normalizeTargetUrl(input){try{const candidate=input&&typeof input==='object'&&typeof input.url==='string'?input.url:input;const url=new URL(candidate,globalThis.location?.href);if(!/^https?:$/i.test(url.protocol))throw new Error('UNSUPPORTED_PROTOCOL');url.username='';url.password='';return url.href;}catch(error){const e=createError('Invalid HTTP(S) target URL.','INVALID_URL',{cause:error});throw e;}}
function isPrivateHostname(hostname){
 const raw=safeText(hostname).toLowerCase().replace(/\.$/,'');
 const host=raw.startsWith('[')&&raw.endsWith(']')?raw.slice(1,-1):raw;
 if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example')||host==='home.arpa'||host.endsWith('.home.arpa'))return true;
 const isSpecialIPv4=address=>{
  const parts=String(address||'').split('.');
  if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255))return false;
  const[a,b,c,d]=parts.map(Number);
  return a===0||a===10||a===127||a>=224||
   (a===169&&b===254)||
   (a===172&&b>=16&&b<=31)||
   (a===192&&b===168)||
   (a===100&&b>=64&&b<=127)||
   (a===192&&b===0&&(c===0||c===2))||
   (a===192&&b===88&&c===99)||
   (a===198&&(b===18||b===19))||
   (a===198&&b===51&&c===100)||
   (a===203&&b===0&&c===113)||
   (a===255&&b===255&&c===255&&d===255);
 };
 if(isSpecialIPv4(host))return true;
 if(!host.includes(':'))return false;
 if(host.includes('%'))return true;
 let address=host;
 if(address.includes('.')){
  const lastColon=address.lastIndexOf(':');
  if(lastColon<0||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address.slice(lastColon+1)))return true;
  const ipv4=address.slice(lastColon+1).split('.').map(Number);
  if(ipv4.some(part=>part>255))return true;
  const tail=`${((ipv4[0]<<8)|ipv4[1]).toString(16)}:${((ipv4[2]<<8)|ipv4[3]).toString(16)}`;
  address=address.slice(0,lastColon+1)+tail;
 }
 const halves=address.split('::');
 if(halves.length>2)return true;
 const parseHalf=value=>value?value.split(':').map(word=>/^[0-9a-f]{1,4}$/.test(word)?parseInt(word,16):NaN):[];
 let left=parseHalf(halves[0]),right=parseHalf(halves[1]||'');
 if([...left,...right].some(word=>!Number.isFinite(word)))return true;
 let words;
 if(halves.length===2){const missing=8-left.length-right.length;if(missing<1)return true;words=[...left,...Array(missing).fill(0),...right];}
 else{words=left;if(words.length!==8)return true;}
 if(words.length!==8)return true;
 const allZero=words.every(word=>word===0);
 if(allZero||(words.slice(0,7).every(word=>word===0)&&words[7]===1))return true;
 const ipv4Mapped=words.slice(0,5).every(word=>word===0)&&words[5]===0xffff;
 const ipv4Compatible=words.slice(0,6).every(word=>word===0);
 if(ipv4Mapped||ipv4Compatible){
  const tail=[words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');
  return isSpecialIPv4(tail)||tail==='0.0.0.0';
 }
 const first=words[0];
 if((first&0xfe00)===0xfc00||(first&0xffc0)===0xfe80||(first&0xff00)===0xff00)return true;
 if((first&0xe000)!==0x2000)return true;
 if(words[0]===0x2001&&words[1]===0x0db8)return true;
 if(words[0]===0x2001&&words[1]===0x0010)return true;
 return false;
}
function isSafeProxyTarget(targetUrl){const url=new URL(targetUrl);return !isPrivateHostname(url.hostname);}
function isValidTemplate(template){return typeof template==='string'&&template.trim().length>0&&template.includes('{url}');}
function isAllowedTemplate(template){if(!isValidTemplate(template))return false;try{const url=new URL(String(template).replace('{url}','https://example.com/'));return url.protocol==='https:'&&url.hostname.endsWith('.workers.dev')&&String(url.search).includes('url=');}catch{return false;}}
function createError(message,code='NETWORK_ERROR',extra={}){const error=new Error(safeText(message,code));error.name='FreeUserProxyError';error.code=safeText(code,'NETWORK_ERROR');for(const key of Object.keys(extra||{})){const value=extra[key];error[key]=(key==='cause'||key==='response')?value:clone(value);}return error;}
function describeError(error){const details=safeObject(error?.details);return Object.freeze({code:safeText(error?.code,'NETWORK_ERROR'),message:safeText(error?.message,'Network request failed.'),name:safeText(error?.name,'Error'),timedOut:Boolean(details.timedOut||error?.code==='TIMEOUT'),targetUrl:safeText(details.targetUrl,error?.targetUrl),proxyId:safeText(details.proxyId,error?.proxyId),proxyName:safeText(details.proxyName,error?.proxyName),elapsedMs:Number.isFinite(Number(details.elapsedMs))?Number(details.elapsedMs):null,attempts:Array.isArray(error?.attempts)?clone(error.attempts):[],cause:error?.cause?{code:safeText(error.cause.code),message:safeText(error.cause.message)}:null});}
function normalizeCustomProxy(item){const obj=safeObject(item);const template=safeText(obj.template);if(!isAllowedTemplate(template))return null;return{id:normalizeId(obj.id)||`user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,type:'User',name:safeText(obj.name,'custom'),template,enabled:obj.enabled!==false};}
function persistStore(){try{globalThis.localStorage?.setItem(STORAGE_KEY,JSON.stringify({custom:customProxies.map(item=>({...item})),disabledSystemIds:Array.from(disabledSystemIds)}));return true;}catch{return false;}}
function loadStore(){try{const raw=globalThis.localStorage?.getItem(STORAGE_KEY);if(!raw)return;const parsed=JSON.parse(raw);if(Array.isArray(parsed)){customProxies=parsed.map(normalizeCustomProxy).filter(Boolean);persistStore();return;}customProxies=safeArray(parsed?.custom).map(normalizeCustomProxy).filter(Boolean);disabledSystemIds=new Set(safeArray(parsed?.disabledSystemIds).map(normalizeId).filter(Boolean));}catch{customProxies=[];disabledSystemIds=new Set();}}
function allEntries(){return[...systemEntries.map(item=>({...item,enabled:!disabledSystemIds.has(item.id)})),...customProxies.map(item=>({...item}))];}
function statusFor(id){return proxyStatus.get(id)||{state:'idle',ok:false,status:null,statusText:'',latencyMs:null,errorCode:null,errorMessage:null,errorDetails:null,lastCheckedAt:null,successCount:0,failureCount:0};}
function stateSnapshot(){const entries=allEntries();const enabled=entries.filter(item=>item.enabled);return Object.freeze({version:VERSION,initialized,scanning,workingProxies:workingProxies.length,totalProxies:entries.length,systemProxies:systemEntries.length,userProxies:customProxies.length,enabledProxies:enabled.length,onlineProxies:entries.filter(item=>statusFor(item.id).state==='online').length,failedProxies:entries.filter(item=>statusFor(item.id).state==='failed').length,disabledSystemProxies:disabledSystemIds.size,revision:proxyRevision});}
function emit(reason,detail={}){proxyRevision++;const payload={reason:safeText(reason,'changed'),revision:proxyRevision,state:stateSnapshot(),...detail};try{globalThis.dispatchEvent?.(new CustomEvent('munitos-free-user-proxy-change',{detail:payload}));}catch{}for(const handler of proxySubscribers){try{handler(payload);}catch{}}return payload;}
function subscribe(handler){if(typeof handler!=='function')return()=>{};proxySubscribers.add(handler);return()=>proxySubscribers.delete(handler);}
function updateStatus(id,patch,emitChange=true){const next={...statusFor(id),...clone(patch)};proxyStatus.set(id,next);if(emitChange)emit('proxy-status',{proxyId:id,proxyStatus:clone(next)});return next;}
function rebuildWorkingPool(){workingProxies=allEntries().filter(item=>item.enabled&&statusFor(item.id).state==='online').map(item=>({...item,status:clone(statusFor(item.id))}));}
function getEntry(id){const key=safeText(id);return allEntries().find(item=>item.id===key||item.template===key||item.name===key)||null;}
function buildProxyUrl(proxy,targetUrl){if(!proxy||!isValidTemplate(proxy.template))throw createError('Invalid proxy template.','INVALID_PROXY_TEMPLATE');return String(proxy.template).replace(/\{url\}/g,encodeURIComponent(targetUrl));}
function createRequestContext(externalSignal,timeoutMs){if(typeof AbortController!=='function')return{signal:externalSignal||undefined,timedOut:false,cleanup(){}};const controller=new AbortController();let timedOut=false;let timer=null;let onAbort=null;if(externalSignal){if(externalSignal.aborted)controller.abort(externalSignal.reason);else{onAbort=()=>controller.abort(externalSignal.reason);externalSignal.addEventListener('abort',onAbort,{once:true});}}const ms=Math.max(0,Number(timeoutMs)||0);if(ms&&!controller.signal.aborted)timer=setTimeout(()=>{timedOut=true;controller.abort();},ms);return{signal:controller.signal,get timedOut(){return timedOut;},abort(reason){try{controller.abort(reason);}catch{}},cleanup(){if(timer)clearTimeout(timer);if(externalSignal&&onAbort){try{externalSignal.removeEventListener('abort',onAbort);}catch{}}}};}
function classifyFailure(error,context){if(context?.timedOut)return{code:'TIMEOUT',message:'Network request timed out.'};if(error?.name==='AbortError')return{code:'ABORTED',message:'Network request was aborted.'};return{code:safeText(error?.code,'NETWORK_ERROR'),message:safeText(error?.message,'Network request failed.')};}
function probeDisposition(proxy){const current=allEntries().find(entry=>entry.id===proxy?.id&&entry.template===proxy?.template);if(!current)return{state:'removed',ok:false,errorCode:'PROXY_REMOVED',errorMessage:'Proxy was removed while its test was running.',lastCheckedAt:Date.now()};if(!current.enabled)return{state:'disabled',ok:false,errorCode:'DISABLED',errorMessage:'Proxy was disabled while its test was running.',lastCheckedAt:Date.now()};return null;}
async function probeProxy(proxy,testUrl=TEST_URL,timeoutMs=PROXY_TEST_TIMEOUT){if(!proxy)return{state:'failed',ok:false,errorCode:'PROXY_NOT_FOUND',errorMessage:'Proxy was not found.',lastCheckedAt:Date.now()};const initialDisposition=probeDisposition(proxy);if(initialDisposition)return initialDisposition;if(!nativeFetch)return{state:'failed',ok:false,errorCode:'FETCH_UNAVAILABLE',errorMessage:'Browser fetch API is unavailable.',lastCheckedAt:Date.now()};updateStatus(proxy.id,{state:'testing',ok:false,errorCode:null,errorMessage:null,lastCheckedAt:Date.now()});const started=globalThis.performance?.now?.()??Date.now();const ctx=createRequestContext(null,timeoutMs);try{const response=await nativeFetch(buildProxyUrl(proxy,testUrl),{method:'GET',cache:'no-store',credentials:'omit',redirect:'follow',signal:ctx.signal,headers:{Accept:'*/*'}});const disposition=probeDisposition(proxy);if(disposition)return disposition;const elapsed=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started));const ok=Number(response?.status||0)>0&&Number(response.status)<500;const prev=statusFor(proxy.id);const result={state:ok?'online':'failed',ok,status:Number(response?.status)||null,statusText:safeText(response?.statusText),latencyMs:elapsed,lastCheckedAt:Date.now(),errorCode:ok?null:`HTTP_${Number(response?.status)||0}`,errorMessage:ok?null:`Proxy returned HTTP ${Number(response?.status)||0}.`,errorDetails:ok?null:{stage:'proxy-test',status:Number(response?.status)||0},successCount:Number(prev.successCount||0)+(ok?1:0),failureCount:Number(prev.failureCount||0)+(ok?0:1)};updateStatus(proxy.id,result,false);rebuildWorkingPool();emit('proxy-tested',{proxyId:proxy.id,proxy:{...proxy},proxyStatus:clone(statusFor(proxy.id)),result:clone(result)});return clone(result);}catch(error){const disposition=probeDisposition(proxy);if(disposition)return disposition;const failure=classifyFailure(error,ctx);const elapsed=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started));const prev=statusFor(proxy.id);const result={state:'failed',ok:false,status:null,statusText:'',latencyMs:elapsed,lastCheckedAt:Date.now(),errorCode:failure.code,errorMessage:failure.message,errorDetails:{stage:'proxy-test',code:failure.code,message:failure.message,elapsedMs:elapsed},successCount:Number(prev.successCount||0),failureCount:Number(prev.failureCount||0)+1};updateStatus(proxy.id,result,false);rebuildWorkingPool();emit('proxy-tested',{proxyId:proxy.id,proxy:{...proxy},proxyStatus:clone(result)});return clone(result);}finally{ctx.cleanup();}}
async function scanEnabledProxies(generation=scanGeneration){const entries=allEntries();const enabled=entries.filter(item=>item.enabled);for(const item of entries.filter(item=>!item.enabled))updateStatus(item.id,{state:'disabled',ok:false,errorCode:'DISABLED',errorMessage:'Proxy is disabled from BIOS.',lastCheckedAt:null},false);if(generation!==scanGeneration)return workingProxies.slice();scanning=true;initialized=false;emit('scan-started',{count:enabled.length});if(!enabled.length){workingProxies=[];initialized=true;scanning=false;emit('scan-complete',{count:0,working:0});return[];}const results=await Promise.all(enabled.map(proxy=>probeProxy(proxy)));if(generation!==scanGeneration)return workingProxies.slice();rebuildWorkingPool();initialized=true;scanning=false;emit('scan-complete',{count:enabled.length,working:workingProxies.length});return workingProxies.slice();}
let scanReadyResolver=null;function refreshProxies(reason='manual-refresh'){if(scanPromise&&scanning)return scanPromise;const generation=++scanGeneration;scanReady=new Promise(resolve=>{scanReadyResolver=resolve;});let promise;promise=scanEnabledProxies(generation).then(result=>{if(generation===scanGeneration)scanReadyResolver?.(workingProxies.slice());return result;}).catch(error=>{if(generation===scanGeneration){initialized=true;scanning=false;}scanReadyResolver?.(workingProxies.slice());emit('scan-failed',{error:describeError(error)});return workingProxies.slice();}).finally(()=>{if(scanPromise===promise)scanPromise=null;if(generation===scanGeneration)scanReadyResolver=null;});scanPromise=promise;emit(`${reason}-started`);return promise;}
async function ensureReady(){if(!initialized&&!scanning)void refreshProxies('initial-scan');if(scanning)await scanReady;return workingProxies.slice();}
function markRuntimeSuccess(proxy,elapsedMs){const prev=statusFor(proxy.id);updateStatus(proxy.id,{state:'online',ok:true,latencyMs:elapsedMs,lastCheckedAt:Date.now(),errorCode:null,errorMessage:null,successCount:Number(prev.successCount||0)+1},false);rebuildWorkingPool();}
function markRuntimeFailure(proxy,error,targetUrl,elapsedMs){const details=describeError(error);const prev=statusFor(proxy.id);updateStatus(proxy.id,{state:'failed',ok:false,latencyMs:elapsedMs,lastCheckedAt:Date.now(),errorCode:details.code,errorMessage:details.message,errorDetails:{...details,targetUrl,proxyId:proxy.id,proxyName:proxy.name},successCount:Number(prev.successCount||0),failureCount:Number(prev.failureCount||0)+1},false);rebuildWorkingPool();emit('runtime-proxy-failed',{proxyId:proxy.id,proxyStatus:clone(statusFor(proxy.id))});}
function prepareRequestOptions(options,externalSignal){const request={...options};delete request.timeout;delete request.proxyTimeout;delete request.retries;delete request.forceProxy;request.credentials='omit';request.signal=externalSignal;const method=safeText(request.method,'GET').toUpperCase();if(method==='GET'||method==='HEAD')delete request.body;request.method=method;return request;}
async function directRequest(targetUrl,options){const timeout=Number(options.timeout)>0?Number(options.timeout):DIRECT_TIMEOUT;const ctx=createRequestContext(options.signal,timeout);const started=globalThis.performance?.now?.()??Date.now();try{const response=await nativeFetch(targetUrl,prepareRequestOptions(options,ctx.signal));return{response,elapsedMs:Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started))};}catch(rawError){const failure=classifyFailure(rawError,ctx);const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started));const error=createError(failure.message,failure.code,{targetUrl,details:{targetUrl,elapsedMs,timedOut:failure.code==='TIMEOUT',stage:'direct'},cause:rawError});throw error;}finally{ctx.cleanup();}}
async function proxyRequestAll(targetUrl,options,pool){
 const limited=pool.slice(0,REQUEST_MAX_PROXY_ATTEMPTS);
 if(!limited.length)throw createError('FreeUserProxy has no working proxy endpoints.','NO_WORKING_PROXY',{targetUrl});
 const method=safeText(options.method,'GET').toUpperCase();
 const safeMethod=isReplaySafeMethod(method);
 const ordered=limited.slice().sort((a,b)=>Number(a.status?.latencyMs??a.latencyMs??Infinity)-Number(b.status?.latencyMs??b.latencyMs??Infinity));
 const started=globalThis.performance?.now?.()??Date.now();
 const attempts=[];
 const makeAttempt=async proxy=>{
  const ctx=createRequestContext(options.signal,Math.max(1000,Number(options.proxyTimeout)||PROXY_TIMEOUT));
  const proxyStarted=globalThis.performance?.now?.()??Date.now();
  try{
   const response=await nativeFetch(buildProxyUrl(proxy,targetUrl),prepareRequestOptions(options,ctx.signal));
   const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-proxyStarted));
   if(Number(response?.status||0)>0){
    markRuntimeSuccess(proxy,elapsedMs);
    emit('request-complete',{targetUrl,proxyId:proxy.id,status:Number(response.status)||null,ok:Boolean(response.ok),latencyMs:elapsedMs,via:'proxy',method});
    return{proxy,response,elapsedMs,ok:true};
   }
   const error=createError('Proxy returned an invalid response.','HTTP_PROXY_ERROR',{targetUrl,proxyId:proxy.id,proxyName:proxy.name,details:{targetUrl,proxyId:proxy.id,proxyName:proxy.name,elapsedMs,stage:'proxy',status:0}});
   markRuntimeFailure(proxy,error,targetUrl,elapsedMs);
   attempts.push({proxyId:proxy.id,proxyName:proxy.name,code:error.code,message:error.message,elapsedMs});
   return{proxy,error,elapsedMs,ok:false};
  }catch(rawError){
   const failure=classifyFailure(rawError,ctx);
   const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-proxyStarted));
   const error=createError(failure.message,failure.code,{targetUrl,proxyId:proxy.id,proxyName:proxy.name,details:{targetUrl,proxyId:proxy.id,proxyName:proxy.name,elapsedMs,timedOut:failure.code==='TIMEOUT',stage:'proxy'},cause:rawError});
   if(!options.signal?.aborted&&failure.code!=='ABORTED')markRuntimeFailure(proxy,error,targetUrl,elapsedMs);
   attempts.push({proxyId:proxy.id,proxyName:proxy.name,code:error.code,message:error.message,elapsedMs});
   return{proxy,error,elapsedMs,ok:false};
  }finally{ctx.cleanup();}
 };
 if(!safeMethod){
  const chosen=ordered[0];
  const result=await makeAttempt(chosen);
  if(result.ok)return result.response;
  if(options.signal?.aborted||result.error?.code==='ABORTED'){
   const aborted=createError('Network request was aborted.','ABORTED',{targetUrl,attempts,details:{targetUrl,attempts,stage:'single-proxy-non-replay-safe',method,timedOut:false}});
   aborted.attempts=attempts;
   throw aborted;
  }
  const error=createError('The non-replay-safe request failed through its selected proxy; it was not retried to avoid duplicate side effects.','PROXY_REQUEST_FAILED',{targetUrl,attempts,details:{targetUrl,attempts,stage:'single-proxy-non-replay-safe',method}});
  error.attempts=attempts;
  throw error;
 }
 const contexts=new Map();
 const failures=[];
 let nextIndex=0;
 let active=0;
 let winner=null;
 let settled=false;
 let hedgeTimer=null;
 let settleOutcome;
 const outcome=new Promise((resolve,reject)=>{settleOutcome={resolve,reject};});
 const timeoutMs=Math.max(1000,Number(options.proxyTimeout)||PROXY_TIMEOUT);
 const clearHedge=()=>{if(hedgeTimer!==null){clearTimeout(hedgeTimer);hedgeTimer=null;}};
 const rejectAborted=()=>{
  if(settled)return;
  settled=true;
  clearHedge();
  settleOutcome.reject(createError('Network request was aborted.','ABORTED',{targetUrl,attempts:failures.map(item=>({proxyId:item.proxy?.id||null,proxyName:item.proxy?.name||null,code:item.error?.code||'ABORTED',message:item.error?.message||'Network request was aborted.',elapsedMs:item.elapsedMs||0})),details:{targetUrl,stage:'proxy-pool',timedOut:false}}));
 };
 const finishFailures=()=>{
  if(settled||active!==0||nextIndex<ordered.length)return;
  settled=true;
  clearHedge();
  if(options.signal?.aborted){settleOutcome.reject(createError('Network request was aborted.','ABORTED',{targetUrl,attempts:failures.map(item=>({proxyId:item.proxy?.id||null,proxyName:item.proxy?.name||null,code:item.error?.code||'ABORTED',message:item.error?.message||'Network request was aborted.',elapsedMs:item.elapsedMs||0})),details:{targetUrl,stage:'proxy-pool',timedOut:false}}));return;}
  const attempts=[];
  for(const result of failures){
   const error=result.error||createError('Proxy request failed.','NETWORK_ERROR',{targetUrl,proxyId:result.proxy?.id,proxyName:result.proxy?.name});
   if(error.code!=='ABORTED')markRuntimeFailure(result.proxy,error,targetUrl,result.elapsedMs||0);
   attempts.push({proxyId:result.proxy?.id||null,proxyName:result.proxy?.name||null,code:error.code||'NETWORK_ERROR',message:error.message||'Proxy request failed.',elapsedMs:result.elapsedMs||0});
  }
  const aggregate=createError('All enabled FreeUserProxy endpoints failed.','PROXY_POOL_FAILED',{targetUrl,attempts,details:{targetUrl,attempts,stage:'proxy-pool'}});
  aggregate.attempts=attempts;
  settleOutcome.reject(aggregate);
 };
 const launchProxy=proxy=>{
  if(settled||winner||options.signal?.aborted)return;
  active++;
  const ctx=createRequestContext(options.signal,timeoutMs);
  contexts.set(proxy.id,ctx);
  const proxyStarted=globalThis.performance?.now?.()??Date.now();
  Promise.resolve().then(()=>nativeFetch(buildProxyUrl(proxy,targetUrl),prepareRequestOptions(options,ctx.signal)))
   .then(response=>{
    const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-proxyStarted));
    if(Number(response?.status||0)>0)return{proxy,response,elapsedMs,ok:true};
    return{proxy,elapsedMs,ok:false,error:createError('Proxy returned an invalid response.','HTTP_PROXY_ERROR',{targetUrl,proxyId:proxy.id,proxyName:proxy.name,details:{targetUrl,proxyId:proxy.id,proxyName:proxy.name,elapsedMs,stage:'proxy',status:0}})};
   })
   .catch(rawError=>{
    const failure=classifyFailure(rawError,ctx);
    const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-proxyStarted));
    return{proxy,elapsedMs,ok:false,error:createError(failure.message,failure.code,{targetUrl,proxyId:proxy.id,proxyName:proxy.name,details:{targetUrl,proxyId:proxy.id,proxyName:proxy.name,elapsedMs,timedOut:failure.code==='TIMEOUT',stage:'proxy'},cause:rawError})};
   })
   .then(result=>{
    active=Math.max(0,active-1);
    if(settled||winner)return;
    if(options.signal?.aborted){if(active===0)rejectAborted();return;}
    if(result.ok){
     winner=result;
     settled=true;
     clearHedge();
     for(const [id,otherContext] of contexts)if(id!==result.proxy.id)otherContext.abort();
     markRuntimeSuccess(result.proxy,result.elapsedMs);
     emit('request-complete',{targetUrl,proxyId:result.proxy.id,status:Number(result.response?.status)||null,ok:Boolean(result.response?.ok),latencyMs:result.elapsedMs,via:'proxy',method});
     settleOutcome.resolve(result.response);
     return;
    }
    failures.push(result);
    clearHedge();
    launchMore();
   })
   .catch(error=>{
    if(!settled){settled=true;clearHedge();settleOutcome.reject(error);}
   })
   .finally(()=>ctx.cleanup());
 };
 const launchMore=()=>{
  if(settled||winner)return;
  if(options.signal?.aborted){if(active===0)rejectAborted();return;}
  while(active<MAX_CONCURRENT_PROXY_REQUESTS&&nextIndex<ordered.length){const proxy=ordered[nextIndex++];launchProxy(proxy);}
  finishFailures();
 };
 // Optimistic first attempt: quick healthy proxies serve the request alone.
 // If it fails, fail over immediately; if it remains slow, hedge after a short grace period.
 const first=ordered[nextIndex++];
 launchProxy(first);
 if(ordered.length>1){hedgeTimer=setTimeout(()=>{hedgeTimer=null;launchMore();},PROXY_HEDGE_DELAY);}
 if(options.signal){
  const onAbort=()=>{clearHedge();for(const context of contexts.values())context.abort();if(active===0)rejectAborted();};
  if(options.signal.aborted)onAbort();else options.signal.addEventListener('abort',onAbort,{once:true});
  outcome.finally(()=>{try{options.signal.removeEventListener('abort',onAbort);}catch{}}).catch(()=>{});
 }
 return outcome;
}
async function request(input,options={}){
 options=safeObject(options);
 if(!nativeFetch)throw createError('Browser fetch API is unavailable.','FETCH_UNAVAILABLE');
 const targetUrl=normalizeTargetUrl(input);
 const target=new URL(targetUrl);
 if(options.signal?.aborted)throw createError('Network request was aborted.','ABORTED',{targetUrl});
 const requestOptions={...options};
 const sameOrigin=target.origin===globalThis.location?.origin;
 const forceProxy=options.forceProxy===true;
 const method=safeText(requestOptions.method,'GET').toUpperCase();
 const replaySafe=isReplaySafeMethod(method);
 delete requestOptions.forceProxy;
 try{
  if(!forceProxy){
   const directResult=await directRequest(targetUrl,requestOptions);
   emit('direct-success',{targetUrl,status:Number(directResult.response?.status)||null,ok:Boolean(directResult.response?.ok),latencyMs:directResult.elapsedMs});
   return directResult.response;
  }
  if(sameOrigin)throw createError('Proxy is not used for same-origin requests.','PROXY_FALLBACK_BLOCKED',{targetUrl});
  if(!isSafeProxyTarget(targetUrl))throw createError('Proxy fallback is blocked for private or local targets.','PROXY_FALLBACK_BLOCKED',{targetUrl});
  const pool=await ensureReady();
  if(!pool.length)throw createError('FreeUserProxy has no working proxy endpoints.','NO_WORKING_PROXY',{targetUrl});
  const response=await proxyRequestAll(targetUrl,requestOptions,pool);
  emit('proxy-success',{targetUrl,proxyCount:pool.length,status:Number(response?.status)||null,ok:Boolean(response?.ok)});
  return response;
 }catch(directError){
  if(forceProxy||directError.code==='ABORTED'||sameOrigin||!isSafeProxyTarget(targetUrl)){
   if(!forceProxy&&!sameOrigin&&!isSafeProxyTarget(targetUrl))directError.code='PROXY_FALLBACK_BLOCKED';
   throw directError;
  }
  if(!replaySafe){
   throw createError('Direct request failed; automatic proxy fallback is disabled for non-replay-safe methods. Pass forceProxy:true to send the request through one proxy without replaying it.','NON_IDEMPOTENT_FALLBACK_BLOCKED',{targetUrl,method,cause:directError,details:{targetUrl,method,stage:'non-idempotent-fallback-blocked'}});
  }
  const pool=await ensureReady();
  if(!pool.length){directError.code='DIRECT_FAILED_NO_PROXY';directError.details={...(directError.details||{}),targetUrl,stage:'direct-no-proxy'};throw directError;}
  const response=await proxyRequestAll(targetUrl,requestOptions,pool);
  emit('direct-fallback-used',{targetUrl,proxyCount:pool.length,status:Number(response?.status)||null,ok:Boolean(response?.ok)});
  return response;
 }
}
async function testProxyById(id){const proxy=getEntry(id);if(!proxy)throw createError('Proxy was not found.','PROXY_NOT_FOUND',{proxyId:safeText(id)});if(!proxy.enabled){const result={state:'disabled',ok:false,errorCode:'DISABLED',errorMessage:'Proxy is disabled from BIOS.',lastCheckedAt:Date.now()};updateStatus(proxy.id,result,false);return result;}return probeProxy(proxy);}
function toggleProxy(id,enabled=null){const proxy=getEntry(id);if(!proxy)throw createError('Proxy was not found.','PROXY_NOT_FOUND');const nextEnabled=enabled===null?!proxy.enabled:Boolean(enabled);if(proxy.type==='System'){if(nextEnabled)disabledSystemIds.delete(proxy.id);else disabledSystemIds.add(proxy.id);}else{const item=customProxies.find(entry=>entry.id===proxy.id);if(!item)throw createError('User proxy was not found.','PROXY_NOT_FOUND');item.enabled=nextEnabled;}persistStore();updateStatus(proxy.id,nextEnabled?{state:'idle',ok:false,errorCode:null,errorMessage:null}:{state:'disabled',ok:false,errorCode:'DISABLED',errorMessage:'Proxy is disabled from BIOS.'},false);rebuildWorkingPool();emit('proxy-toggle',{proxyId:proxy.id,enabled:nextEnabled,proxy:{...proxy,enabled:nextEnabled}});if(nextEnabled)void testProxyById(proxy.id).catch(()=>{});return{...proxy,enabled:nextEnabled,status:clone(statusFor(proxy.id))};}
async function addCustomProxy(name,template){if(!isAllowedTemplate(template))throw createError('Proxy template must be an HTTPS workers.dev endpoint containing {url}.','INVALID_PROXY_TEMPLATE');const item=normalizeCustomProxy({name,template,enabled:true});if(!item)throw createError('Proxy template is invalid.','INVALID_PROXY_TEMPLATE');if(allEntries().some(entry=>entry.template===item.template))throw createError('A proxy with this template already exists.','DUPLICATE_PROXY');customProxies.push(item);persistStore();updateStatus(item.id,statusFor(item.id),false);emit('custom-proxy-added',{proxy:{...item}});void testProxyById(item.id).catch(()=>{});return{...item,status:clone(statusFor(item.id))};}
async function removeCustomProxy(idOrTemplate){const index=customProxies.findIndex(item=>item.id===idOrTemplate||item.template===idOrTemplate||item.name===idOrTemplate);if(index<0)return false;const[removed]=customProxies.splice(index,1);proxyStatus.delete(removed.id);rebuildWorkingPool();persistStore();emit('custom-proxy-removed',{proxyId:removed.id});return true;}
function listProxies(){return allEntries().map(item=>({...item,status:clone(statusFor(item.id))}));}
function waitForPageLoaded(){if(document.readyState==='complete')return Promise.resolve();return new Promise(resolve=>{const timer=setTimeout(resolve,PAGE_LOAD_TIMEOUT);window.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});});}
function isSameOrigin(input){try{return new URL(normalizeTargetUrl(input)).origin===globalThis.location?.origin;}catch{return false;}}
function connectionInfo(){const c=globalThis.navigator?.connection||globalThis.navigator?.mozConnection||globalThis.navigator?.webkitConnection||null;return Object.freeze({online:globalThis.navigator?.onLine!==false,effectiveType:c?.effectiveType||null,downlink:Number.isFinite(Number(c?.downlink))?Number(c.downlink):null,rtt:Number.isFinite(Number(c?.rtt))?Number(c.rtt):null,saveData:Boolean(c?.saveData)});}
async function direct(input,options={}){options=safeObject(options);if(!nativeFetch)throw createError('Browser fetch API is unavailable.','FETCH_UNAVAILABLE');const targetUrl=normalizeTargetUrl(input);const result=await directRequest(targetUrl,{...options,credentials:'omit'});return result.response;}
async function text(input,options={}){return(await request(input,options)).text();}
async function json(input,options={}){return(await request(input,options)).json();}
async function headers(input,options={}){return(await request(input,{...options,method:'HEAD'})).headers;}
async function fetchOk(input,options={}){const response=await request(input,options);if(!response.ok)throw createError(`HTTP_${response.status}`,'HTTP_ERROR',{targetUrl:normalizeTargetUrl(input),status:Number(response.status)||0,statusText:safeText(response.statusText),response});return response;}
async function checkSite(input,options={}){options=safeObject(options);const targetUrl=normalizeTargetUrl(input);const started=globalThis.performance?.now?.()??Date.now();try{const response=await direct(targetUrl,{method:options.method||'GET',headers:{Accept:'*/*',...(options.headers||{})},redirect:options.redirect||'follow',cache:options.cache||'no-store',signal:options.signal,timeout:options.timeout});return{url:targetUrl,direct:true,needsProxy:false,ok:true,status:Number(response.status)||0,statusText:safeText(response.statusText),latencyMs:Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started)),response};}catch(error){const elapsedMs=Math.max(0,Math.round((globalThis.performance?.now?.()??Date.now())-started));if(options.noProxyFallback||(isSameOrigin(targetUrl)&&options.forceProxy!==true))return{url:targetUrl,direct:true,needsProxy:false,ok:false,status:0,statusText:'',latencyMs:elapsedMs,error};return{url:targetUrl,direct:false,needsProxy:true,ok:false,status:0,statusText:'',latencyMs:elapsedMs,error};}}
async function siteStatus(input,options={}){
 options=safeObject(options);
 const targetUrl=normalizeTargetUrl(input);
 const method=safeText(options.method,'GET').toUpperCase();
 const forceProxy=options.forceProxy===true;
 if(forceProxy){
  try{
   const response=await request(targetUrl,{...options,forceProxy:true});
   return{url:targetUrl,direct:false,needsProxy:true,ok:Boolean(response?.ok),status:Number(response?.status)||0,statusText:safeText(response?.statusText),latencyMs:0,proxyOk:true,proxyStatus:Number(response?.status)||0,proxyStatusText:safeText(response?.statusText),response};
  }catch(error){return{url:targetUrl,direct:false,needsProxy:true,ok:false,status:0,statusText:'',latencyMs:0,proxyOk:false,proxyError:error,error};}
 }
 if(!isReplaySafeMethod(method)){
  const error=createError('siteStatus does not automatically retry non-replay-safe methods. Use forceProxy:true to send such a request once through a proxy.','NON_IDEMPOTENT_FALLBACK_BLOCKED',{targetUrl,method});
  return{url:targetUrl,direct:false,needsProxy:false,ok:false,status:0,statusText:'',latencyMs:0,error};
 }
 const first=await checkSite(targetUrl,options);
 if(!first.needsProxy)return first;
 try{
  const response=await request(first.url,{...options,forceProxy:true,proxyTimeout:Number(options.proxyTimeout)>0?Number(options.proxyTimeout):PROXY_TIMEOUT});
  return{...first,direct:false,needsProxy:true,proxyOk:true,proxyStatus:Number(response.status)||0,proxyStatusText:safeText(response.statusText),response};
 }catch(error){return{...first,direct:false,needsProxy:true,proxyOk:false,proxyError:error};}
}
const networkApi=Object.freeze({ready:async()=>{await ensureReady();return FreeUserProxy;},request,fetch:request,direct,text,json,headers,fetchOk,checkSite,siteStatus,isSameOrigin,connection:connectionInfo,state:stateSnapshot,refresh:()=>refreshProxies('manual-refresh'),subscribe,describeError,getWorkingProxies:()=>workingProxies.map(clone),resolve:async input=>{const targetUrl=normalizeTargetUrl(input);return{targetUrl,direct:isSameOrigin(targetUrl),proxyPool:(await ensureReady()).map(clone)};}});
const managementApi=Object.freeze({list:listProxies,add:addCustomProxy,remove:removeCustomProxy,toggle:toggleProxy,enable:id=>toggleProxy(id,true),disable:id=>toggleProxy(id,false),test:testProxyById,retry:testProxyById,refresh:()=>refreshProxies('manual-refresh'),subscribe,state:stateSnapshot});
// Keep the historical management path for BIOS/older integrations while exposing direct function helpers for packages.
const api=Object.freeze({proxy:networkApi,management:managementApi});
const FreeUserProxy=Object.assign(function FreeUserProxy(input,options={}){return request(input,options);},{version:VERSION,api,network:networkApi,management:managementApi,request,fetch:request,direct,text,json,headers,fetchOk,checkSite,siteStatus,isSameOrigin,connection:connectionInfo,state:stateSnapshot,refresh:()=>refreshProxies('manual-refresh'),getWorkingProxies:()=>workingProxies.map(clone),describeError,resolve:networkApi.resolve,subscribe});
Object.defineProperties(FreeUserProxy,{revision:{get(){return proxyRevision;}},ready:{get(){return networkApi.ready();}},pageLoadReady:{get(){return waitForPageLoaded();}}});
loadStore();
for(const item of systemEntries){if(!item.enabled)proxyStatus.set(item.id,{...statusFor(item.id),state:'disabled',ok:false,errorCode:'DISABLED',errorMessage:'Proxy is disabled from BIOS.'});}
for(const item of customProxies)proxyStatus.set(item.id,statusFor(item.id));
rebuildWorkingPool();
try{globalThis.__FreeUserProxy=FreeUserProxy;}catch{}
try{globalThis.dispatchEvent?.(new CustomEvent('munitos-free-user-proxy-ready',{detail:{version:VERSION,api,network:networkApi,management:managementApi}}));}catch{}
if(document.readyState==='complete')void refreshProxies('initial-scan');else window.addEventListener('load',()=>void refreshProxies('initial-scan'),{once:true});
})();
