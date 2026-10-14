/**
 * Retry JS / CSS chunk downloads patiently on bad connections.
 *
 * "ChunkLoadError: Failed to load chunk /_next/static/chunks/….js" was the
 * most common "Something went wrong" on phones using mobile data. The chunk
 * file was never missing — the same URL answers 200 from the server — the
 * DOWNLOAD failed: a dropped radio link, a carrier that breaks HTTP/3, a
 * request that died in transit on a slow connection.
 *
 * Turbopack's runtime retries a failed chunk exactly once, 200-600 ms later,
 * and then rejects for good: the rejected load is cached, so neither React's
 * "Try again" nor the next navigation can recover — only a full page reload.
 * On a phone that has just lost signal, 600 ms is not long enough.
 *
 * This runs before the app starts. Whenever the runtime adds a
 * `/_next/static/` <script> or stylesheet <link> to the page, the file is
 * first downloaded with `fetch()` — up to 5 tries over ~20 s, waiting for the
 * connection to come back if the phone is offline — and only then is the
 * element actually inserted. The browser then reads the file from its HTTP
 * cache (chunks are `immutable` for a year), so the real <script> load can't
 * fail on the network. If every try fails, the element is inserted anyway and
 * the runtime's own error handling (and the auto-reload in
 * `lib/error-recovery.ts`) takes over exactly as before.
 *
 * Stylesheets React manages itself (`data-precedence`) are left alone: React
 * positions those relative to each other, and one that is not in the DOM yet
 * would break that ordering.
 *
 * No syntax newer than ES5 and no dependencies: it is inlined near the top
 * of <body>, before any chunk is requested by the runtime.
 */
export const CHUNK_RETRY_SCRIPT = `(function(){
if(typeof window==='undefined'||!window.fetch||!Node.prototype)return;
var DELAYS=[0,800,2000,4500,8000];
function isChunk(el){
  if(!el||el.__rtRetry||!el.tagName)return null;
  if(el.tagName==='LINK'&&el.hasAttribute('data-precedence'))return null;
  var u=el.tagName==='SCRIPT'?el.src:(el.tagName==='LINK'&&/stylesheet/i.test(el.rel)?el.href:null);
  if(!u)return null;
  try{var p=new URL(u,location.href);if(p.origin!==location.origin||p.pathname.indexOf('/_next/static/')!==0)return null;return p.href;}catch(e){return null;}
}
function waitOnline(ms){
  return new Promise(function(res){
    if(navigator.onLine!==false)return res();
    var t=setTimeout(done,ms);function done(){clearTimeout(t);window.removeEventListener('online',done);res();}
    window.addEventListener('online',done);
  });
}
function load(url,i){
  return new Promise(function(r){setTimeout(r,DELAYS[i]);})
  .then(function(){return waitOnline(15000);})
  .then(function(){return fetch(url,{credentials:'same-origin'});})
  .then(function(res){if(!res.ok&&res.status>=500)throw 0;return res.ok;})
  .catch(function(){return i+1<DELAYS.length?load(url,i+1):false;});
}
function wrap(orig){
  return function(node){
    var url=isChunk(node),self=this,args=arguments;
    if(!url)return orig.apply(this,args);
    node.__rtRetry=1;
    load(url,0).then(function(){orig.apply(self,args);});
    return node;
  };
}
Node.prototype.appendChild=wrap(Node.prototype.appendChild);
})();`.replace(/\n\s*/g, "");
