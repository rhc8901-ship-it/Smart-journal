/* RC Pro runtime diagnostics and graceful recovery UI. */
(function(){'use strict';var KEY='rc_runtime_errors_v1',MAX=18;
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return[]}}
function write(x){try{var a=read();a.push(x);localStorage.setItem(KEY,JSON.stringify(a.slice(-MAX)))}catch(_){}}
function show(x){if(!document.body||document.getElementById('rc-fault-panel'))return;var p=document.createElement('section');p.id='rc-fault-panel';p.setAttribute('role','alert');p.style.cssText='position:fixed;inset:12px;z-index:99999;overflow:auto;background:#111827;color:#f9fafb;border:1px solid #d4a838;border-radius:18px;padding:18px;font:14px/1.5 system-ui;box-shadow:0 18px 50px #000b';
var h=document.createElement('h2');h.textContent='RC Pro detected an app error';h.style.cssText='margin:0 0 8px;color:#e2bb55;font-size:18px';
var d=document.createElement('p');d.textContent='An unexpected error occurred. Your last saved journal data should remain in local storage. Reload the app or copy diagnostics.';
var pre=document.createElement('pre');pre.textContent=String(x.kind+': '+x.message+'\n'+(x.stack||'')).slice(0,1800);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;background:#030712;padding:10px;border-radius:10px;color:#cbd5e1;font-size:11px';
var row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
var c=document.createElement('button'),r=document.createElement('button');c.textContent='Copy diagnostics';r.textContent='Reload app';[c,r].forEach(function(b){b.style.cssText='border:0;border-radius:10px;padding:11px 14px;background:#d4a838;color:#17120a;font-weight:700'});
c.onclick=function(){var t=JSON.stringify(read(),null,2);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){c.textContent='Copied'}).catch(function(){pre.textContent=t});else pre.textContent=t};r.onclick=function(){location.reload()};row.append(c,r);p.append(h,d,pre,row);document.body.appendChild(p)}
function record(k,m,s){var x={at:new Date().toISOString(),kind:k,message:String(m||'Unknown error').slice(0,1400),stack:String(s||'').slice(0,1400)};write(x);show(x)}
window.addEventListener('error',function(e){record('runtime',e.message,e.error&&e.error.stack)});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;record('async',r&&(r.message||r)||'Unhandled async error',r&&r.stack)});
function status(t){if(!document.body)return;var e=document.getElementById('rc-net-status');if(!e){e=document.createElement('div');e.id='rc-net-status';e.style.cssText='position:fixed;top:env(safe-area-inset-top,0px);left:10px;right:10px;z-index:9998;text-align:center;padding:7px;border-radius:9px;background:#6b4f12;color:#fff;font:12px system-ui';document.body.appendChild(e)}e.textContent=t;e.style.display='block';if(navigator.onLine)setTimeout(function(){e.style.display='none'},2800)}
window.addEventListener('offline',function(){status('Offline — saved journal features remain available.')});window.addEventListener('online',function(){status('Internet connection restored.')});
document.addEventListener('DOMContentLoaded',function(){if(!navigator.onLine)status('Offline — saved journal features remain available.')});
window.RCRuntime={errors:read,clear:function(){try{localStorage.removeItem(KEY)}catch(_){}},report:record};})();
