import type { BigLifeCover } from "@/lib/db/schema"

// Рендер статической "Big Life Covers.dc.html" из строк big_life_covers.
// Дизайн-система и разметка — 1:1 с существующими Big Life .dc.html
// страницами (шапка/футер/шрифты скопированы верстальщиком вручную при
// первой генерации 09.07.2026), здесь только карточки данные-управляемые.

function esc(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function isSoldOut(c: BigLifeCover): boolean {
  return c.soldOut || (c.stockQty !== null && c.stockQty <= 0)
}

function priceBlock(c: BigLifeCover): string {
  if (c.price == null) return ""
  if (c.salePrice != null && c.salePrice < c.price) {
    return `<div style="margin-top:8px; display:flex; align-items:baseline; gap:8px;">
              <span style="font-family:'Bodoni Moda',serif; font-weight:700; font-size:16px; color:#B01A18;">${c.salePrice} ₽</span>
              <span style="font-size:13px; color:#A9A7AF; text-decoration:line-through;">${c.price} ₽</span>
            </div>`
  }
  return `<div style="margin-top:8px;"><span style="font-family:'Bodoni Moda',serif; font-weight:700; font-size:16px; color:#14161F;">${c.price} ₽</span></div>`
}

function cardHtml(c: BigLifeCover): string {
  const imgTag = c.imagePath
    ? `<img src="${esc(c.imagePath)}" alt="" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">`
    : ""
  const soldOut = isSoldOut(c)
  const soldOutOverlay = soldOut
    ? `<div style="position:absolute; inset:0; background:rgba(18,16,22,0.55); display:flex; align-items:center; justify-content:center;">
              <span style="color:#fff; font-size:11.5px; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; border:1px solid rgba(255,255,255,0.55); padding:8px 18px;">Нет в наличии</span>
            </div>`
    : ""
  const sub = c.period ? `BIG Life · ${esc(c.period)}` : `BIG Life · ${esc(c.year)}`
  return `        <div>
          <div style="position:relative; aspect-ratio:3/4; background:#e9e6e0; box-shadow:0 16px 32px -14px rgba(16,14,22,0.3); overflow:hidden;">${imgTag}${soldOutOverlay}</div>
          <div style="margin-top:16px;">
            <div style="font-family:'Bodoni Moda',serif; font-weight:600; font-size:17px; line-height:1.25; color:#14161F;">${esc(c.heading)}</div>
            <div style="font-size:11.5px; letter-spacing:0.06em; color:#8A8892; margin-top:4px; text-transform:uppercase;">${sub}</div>
            ${soldOut ? "" : priceBlock(c)}
          </div>
        </div>
`
}

export function renderCoversPage(rows: BigLifeCover[]): string {
  const covers = rows.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const cardsHtml = covers.map(cardHtml).join("\n")
  const firstYear = covers.length ? covers[covers.length - 1].year : ""

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;0,6..96,700;0,6..96,800;0,6..96,900;1,6..96,400;1,6..96,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Great+Vibes&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; color: #14161F; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  img { display: block; max-width: 100%; }
  a { color: #B01A18; text-decoration: none; }
  a:hover { color: #8C1513; }
  ::selection { background: #B01A18; color: #fff; }
  .r-burger { display: none; }

  @media (max-width: 900px) {
    .r-g4 { grid-template-columns: repeat(2,1fr) !important; gap: 20px !important; }
    .r-foot { grid-template-columns: 1fr 1fr !important; gap: 30px !important; }
    .r-sec { padding-top: 52px !important; padding-bottom: 52px !important; }
  }
  @media (max-width: 620px) {
    .r-util { display: none !important; }
    .r-util-bar { justify-content: center !important; }
    .r-burger { display: flex !important; }
    .r-nav {
      flex-wrap: nowrap !important;
      justify-content: flex-start !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x proximity;
      gap: 22px !important;
      padding: 6px 44vw 14px !important;
      margin: 0 -20px !important;
      width: 100vw !important;
      row-gap: 0 !important;
    }
    .r-nav::-webkit-scrollbar { display: none; }
    .r-nav > * { scroll-snap-align: center; flex: 0 0 auto !important; white-space: nowrap; opacity: 0.5; transform: scale(0.92); transition: transform .2s, opacity .2s; }
    .r-nav > .r-nav-active { opacity: 1 !important; transform: scale(1.16) !important; }
    .r-navtoggle:checked ~ .r-nav {
      position: fixed !important; inset: 0 !important; width: 100vw !important; margin: 0 !important;
      flex-direction: column !important; align-items: center !important; justify-content: flex-start !important;
      overflow-y: auto !important; overflow-x: hidden !important;
      background: #FAF7F2 !important;
      z-index: 200 !important; padding: 112px 24px 60px !important; gap: 28px !important;
      font-size: 20px !important;
    }
    .r-navtoggle:checked ~ .r-nav > * { opacity: 1 !important; transform: none !important; }
    .r-burger { display: none; position: fixed; top: 18px; right: 18px; width: 46px; height: 46px; align-items: center; justify-content: center; cursor: pointer; z-index: 210; background: rgba(20,22,31,0.06); border-radius: 50%; }
    .r-burger span, .r-burger span::before, .r-burger span::after { content: ''; display: block; width: 20px; height: 2px; background: #14161F; position: relative; transition: transform .2s, opacity .2s, background .2s; }
    .r-burger span::before { position: absolute; top: -6px; }
    .r-burger span::after { position: absolute; top: 6px; }
    .r-navtoggle:checked ~ .r-burger { background: rgba(20,22,31,0.08); }
    .r-navtoggle:checked ~ .r-burger span { background: transparent; }
    .r-navtoggle:checked ~ .r-burger span::before { transform: rotate(45deg); top: 0; }
    .r-navtoggle:checked ~ .r-burger span::after { transform: rotate(-45deg); top: 0; }
    .r-g4 { grid-template-columns: repeat(2,1fr) !important; gap: 18px !important; }
    .r-foot { grid-template-columns: 1fr !important; }
    .r-sec { padding-left: 20px !important; padding-right: 20px !important; padding-top: 44px !important; padding-bottom: 44px !important; }
    .r-head-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
<script>
(function(){
  function centerNav(){
    document.querySelectorAll('nav.r-nav').forEach(function(nav){
      var a = nav.querySelector('.r-nav-active');
      if(a){ nav.scrollLeft = a.offsetLeft - (nav.clientWidth/2) + (a.offsetWidth/2); }
    });
  }
  if (document.readyState === 'complete') centerNav();
  else window.addEventListener('load', centerNav);
  window.addEventListener('resize', centerNav);
})();
</script>

<div style="background:#FAF7F2; min-height:100vh; overflow-x:hidden;">

  <!-- ============ UTILITY BAR ============ -->
  <div style="background: #121016; color: #C9C7CE; font-size: 11.5px; letter-spacing: 0.06em;">
    <div class="r-util-bar r-head-pad" style="max-width: 1280px; margin: 0 auto; padding: 9px 32px; display: flex; align-items: center; justify-content: space-between;">
      <span style="text-transform: uppercase; opacity: 0.75;">Москва · Архив обложек</span>
      <div class="r-util" style="display: flex; align-items: center; gap: 20px;">
        <span style="letter-spacing: 0.12em;"><b style="color:#fff;">RU</b> · EN</span>
        <span style="width:1px; height:12px; background:#3a3740;"></span>
        <div style="display:flex; gap:14px; text-transform:uppercase; opacity:0.85;">
          <span>Instagram</span><span>Telegram</span><span>YouTube</span>
        </div>
        <span style="width:1px; height:12px; background:#3a3740;"></span>
        <span style="color:#fff; letter-spacing:0.14em; text-transform:uppercase; font-weight:600;">Подписаться</span>
      </div>
    </div>
  </div>

  <!-- ============ MASTHEAD ============ -->
  <header style="background:#FAF7F2; border-bottom: 1px solid #E3E1DC;">
    <div class="r-head-pad" style="max-width: 1280px; margin: 0 auto; padding: 30px 32px 0; display: flex; flex-direction: column; align-items: center;">
      <a href="Big Life.dc.html" style="display:block;"><img src="assets/logo-biglife.png" alt="BiG life — online magazine" style="height:64px; width:auto; max-width:82vw; display:block;"></a>
      <div style="height:6px;"></div>

      <input type="checkbox" id="navtoggle-covers" class="r-navtoggle" style="display:none;">
      <label for="navtoggle-covers" class="r-burger"><span></span></label>
      <nav class="r-nav" style="display:flex; align-items:center; gap:38px; margin-top:26px; padding-bottom:16px; font-size:13px; letter-spacing:0.16em; text-transform:uppercase; font-weight:500;">
        <a href="Big Life.dc.html" style="color:#57545E; padding-bottom:6px;">Home</a>
        <span class="r-nav-active" style="color:#14161F; padding-bottom:6px; border-bottom:2px solid #B01A18; font-weight:600;">Covers</span>
        <a href="Big Life TV.dc.html" style="color:#57545E; padding-bottom:6px;">Big Life TV</a>
        <a href="Big Life Radio.dc.html" style="color:#57545E; padding-bottom:6px;">Radio</a>
        <a href="Big Life.dc.html" style="color:#57545E; padding-bottom:6px;">People</a>
        <a href="Big Life Blog.dc.html" style="color:#57545E; padding-bottom:6px;">Blog</a>
        <a href="Big Life About.dc.html" style="color:#57545E; padding-bottom:6px;">About</a>
      </nav>
    </div>
  </header>

  <!-- ============ TITLE ============ -->
  <section style="background:#FAF7F2;">
    <div class="r-sec" style="max-width:1280px; margin:0 auto; padding:64px 32px 12px;">
      <div style="font-size:12px; letter-spacing:0.24em; text-transform:uppercase; color:#B01A18; font-weight:600; margin-bottom:14px;">Архив номеров</div>
      <h1 style="font-family:'Bodoni Moda',serif; font-weight:700; font-size:54px; letter-spacing:-0.01em; margin:0 0 16px; color:#14161F;">Обложки</h1>
      <p style="font-size:17px; line-height:1.6; color:#6E6C76; margin:0;">Все обложки BIG Life с ${esc(firstYear)} года — герои номеров, сезоны и специальные выпуски.</p>
    </div>
  </section>

  <!-- ============ GRID ============ -->
  <section style="background:#FAF7F2;">
    <div class="r-sec" style="max-width:1280px; margin:0 auto; padding:12px 32px 40px;">
      <div class="r-g4" style="display:grid; grid-template-columns:repeat(4,1fr); gap:44px 28px;">
${cardsHtml}      </div>
    </div>
  </section>

  <!-- ============ FOOTER ============ -->
  <footer style="background:#121016; color:#B9B7C0;">
    <div class="r-head-pad" style="max-width:1280px; margin:0 auto; padding:64px 32px 40px;">
      <div class="r-foot" style="display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr; gap:40px; padding-bottom:48px; border-bottom:1px solid #26232c;">
        <div>
          <div style="margin-bottom:18px;">
            <img src="assets/logo-biglife-light.png" alt="BiG life" style="height:38px; width:auto; display:block;">
          </div>
          <p style="font-size:14px; line-height:1.6; color:#8A8792; max-width:34ch; margin:0;">Московский журнал о светской жизни, звёздах и стиле. Обложки, интервью и хроника — с 2018 года.</p>
        </div>
        <div>
          <div style="font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#fff; font-weight:600; margin-bottom:16px;">Разделы</div>
          <div style="display:flex; flex-direction:column; gap:11px; font-size:14px;">
            <span>Обложки</span><span>Big Life TV</span><span>Люди</span><span>Журнал</span>
          </div>
        </div>
        <div>
          <div style="font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#fff; font-weight:600; margin-bottom:16px;">Сотрудничество</div>
          <div style="display:flex; flex-direction:column; gap:11px; font-size:14px;">
            <span>Публикация</span><span>ПИАР 5000 ₽</span><span>Реклама</span><span>Подарочные карты</span>
          </div>
        </div>
        <div>
          <div style="font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#fff; font-weight:600; margin-bottom:16px;">Соцсети</div>
          <div style="display:flex; flex-direction:column; gap:11px; font-size:14px;">
            <span>Instagram</span><span>Telegram</span><span>YouTube</span><span>VK</span>
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; padding-top:26px; font-size:12px; letter-spacing:0.04em; color:#6E6C76;">
        <span>© 2026 BIG Life online magazine · ООО «ОС СТУДИО» · Москва</span>
        <span>Политика конфиденциальности · Условия · Дизайн и разработка — <a href="https://company24.pro" target="_blank" rel="noopener" style="color:#8A8792; text-decoration:underline;">company24.pro</a></span>
      </div>
    </div>
  </footer>

</div>
<!--c24-analytics-start-->
<script>
(function(){
try{
var SLUG="biglife",EP="https://company24.pro/api/public/client-pages/track",K="c24_vid";
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
})();
</script>
<!--c24-analytics-end-->
</body>
</html>
`
}
