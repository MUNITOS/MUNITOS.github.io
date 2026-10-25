(()=>{'use strict';const FILE_VERSION='1.0';
  const ENABLED=true;const ALLOWED_HOST='munitos.github.io';
  if(ENABLED){
    const host=String(location.hostname||'').trim().toLowerCase().replace(/^www\./,'');
    if(host!==ALLOWED_HOST){
      console.error(`[MUNITOS] Execution stopped: unauthorized host "${location.host}".`);
      try{document.documentElement.innerHTML='';}catch{}
      try{window.stop();}catch{}
      throw new Error(`[MUNITOS] Unauthorized domain. Allowed: ${ALLOWED_HOST}`);
    }
    console.log(`[MUNITOS] Authorized host: ${location.host}`);
    if(window.location.protocol==='file:'){
      try{document.documentElement.innerHTML='<h1 style="color:#c00;font-family:sans-serif;text-align:center;margin-top:2em;">MUNITOS does not support file:// protocol</h1><p style="font-family:sans-serif;text-align:center;">Please serve this application over HTTP/HTTPS.</p>';}catch{}
      try{window.stop();}catch{}
      return;
    }
    try{
      if(window.top!==window.self){
        document.documentElement.innerHTML='<h1 style="font-family:sans-serif;text-align:center;margin-top:3em;">MUNITOS cannot run inside a frame.</h1>';
        try{window.top.location=window.location.href;}catch{}
      }
    }catch{}
  }
})();
['dragover','drop'].forEach(type=>document.addEventListener(type,e=>e.preventDefault()));
document.addEventListener('click',e=>{
  const a=e.target.closest('a[target="_blank"]');
  if(a){
    const rel=(a.getAttribute('rel')||'').split(/\s+/);
    if(!rel.includes('noopener'))rel.push('noopener');
    if(!rel.includes('noreferrer'))rel.push('noreferrer');
    a.setAttribute('rel',rel.join(' ').trim());
  }
},true);
