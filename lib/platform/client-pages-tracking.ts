// Встраивание аналитики в клиентские страницы витрины.
//
// Страницы отдаются статикой nginx на другом поддомене (newsite.company24.pro),
// поэтому трекинг — самодостаточный инлайн-скрипт, который мы дописываем в HTML
// при публикации. Он шлёт короткие тики на публичный collector основного
// приложения (company24.pro). Content-Type text/plain — «простой» CORS-запрос
// без preflight; на unload — navigator.sendBeacon.
//
// Идемпотентно: блок между маркерами вырезается перед повторной вставкой, так
// что редактирование/перепубликация не плодят дубли скрипта.

const MARKER_START = "<!--c24-analytics-start-->"
const MARKER_END = "<!--c24-analytics-end-->"

// Абсолютный URL collector'а (страницы живут на другом поддомене).
const COLLECTOR_URL =
  (process.env.CLIENT_PAGES_TRACK_URL || "https://company24.pro/api/public/client-pages/track")

// Собирает инлайн-скрипт с зашитым slug. slug валидируется до вызова
// (^[a-z0-9-]+$), поэтому безопасен для вставки в строковый литерал.
function buildSnippet(slug: string): string {
  const script = `(function(){
try{
var SLUG=${JSON.stringify(slug)},EP=${JSON.stringify(COLLECTOR_URL)},K="c24_vid";
var vid=localStorage.getItem(K);
if(!vid){vid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now().toString(16)+Math.random().toString(16).slice(2));localStorage.setItem(K,vid);}
var p=new URLSearchParams(location.search);
var recipient=p.get("to")||p.get("c")||null;
var path=location.pathname;
var scr=window.screen?(screen.width+"x"+screen.height):null;
var ref=document.referrer||null;
var maxS=0;
function upd(){var d=document.documentElement,b=document.body;var sh=Math.max(d.scrollHeight,b?b.scrollHeight:0);var able=sh-d.clientHeight;var y=window.scrollY||d.scrollTop||0;var pct=able>0?Math.min(100,Math.round(y/able*100)):100;if(pct>maxS)maxS=pct;}
window.addEventListener("scroll",upd,{passive:true});setTimeout(upd,600);
var last=Date.now();
function send(sec,beacon){
var body=JSON.stringify({slug:SLUG,path:path,visitorId:vid,recipient:recipient,source:ref?"ref":"direct",referrer:ref,screen:scr,addSeconds:sec,scrollPct:maxS});
try{
if(beacon&&navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([body],{type:"text/plain"}));}
else{fetch(EP,{method:"POST",body:body,headers:{"Content-Type":"text/plain"},keepalive:true,mode:"cors"}).catch(function(){});}
}catch(e){}
}
send(0,false);
setInterval(function(){if(document.visibilityState!=="visible")return;var s=Math.round((Date.now()-last)/1000);last=Date.now();send(s,false);},10000);
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){var s=Math.round((Date.now()-last)/1000);last=Date.now();send(s,true);}});
window.addEventListener("pagehide",function(){var s=Math.round((Date.now()-last)/1000);send(s,true);});
}catch(e){}
})();`
  return `${MARKER_START}\n<script>\n${script}\n</script>\n${MARKER_END}`
}

// Вырезает ранее вставленный блок аналитики (между маркерами), если он есть.
export function stripTracking(html: string): string {
  const s = html.indexOf(MARKER_START)
  if (s === -1) return html
  const e = html.indexOf(MARKER_END, s)
  if (e === -1) return html
  const before = html.slice(0, s)
  const after = html.slice(e + MARKER_END.length)
  // подчищаем возможный лишний перевод строки
  return (before + after).replace(/\n{3,}/g, "\n\n")
}

// Возвращает HTML с встроенной аналитикой (идемпотентно). Вставляем перед
// последним </body>; если его нет — дописываем в конец.
export function injectTracking(html: string, slug: string): string {
  const clean = stripTracking(html)
  const snippet = buildSnippet(slug)
  const idx = clean.toLowerCase().lastIndexOf("</body>")
  if (idx === -1) return `${clean}\n${snippet}\n`
  return `${clean.slice(0, idx)}${snippet}\n${clean.slice(idx)}`
}

export function hasTracking(html: string): boolean {
  return html.includes(MARKER_START)
}
