const STORAGE_KEY="display-board-v1";
const DEFAULTS={settings:{orgName:"Display Board",logo:"",slideDuration:8,refreshInterval:5,dark:true,animations:true,fullscreen:false},instagram:[],rss:[]};

const state=loadState();
let data={items:[],lastUpdated:null};
let slideIndex=0,timer=null,refreshTimer=null;

function loadState(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}}catch{return structuredClone(DEFAULTS)}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmtDate(d){if(!d)return "";const x=new Date(d);if(Number.isNaN(x.getTime()))return "";const diff=(Date.now()-x)/1000;if(diff<60)return "gerade eben";if(diff<3600)return `vor ${Math.floor(diff/60)} Min.`;if(diff<86400)return `vor ${Math.floor(diff/3600)} Std.`;return x.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"})}
function stripHtml(s=""){const t=document.createElement("template");t.innerHTML=s;return (t.content.textContent||"").replace(/\s+/g," ").trim()}
function first(...v){return v.find(x=>x && String(x).trim())||""}
function validUrl(u){try{const x=new URL(u);return /^https?:$/.test(x.protocol)}catch{return false}}

function proxyUrl(url){
  // Optional browser-side CORS proxy. Configure in Admin > Technik.
  const proxy=(state.settings.proxyUrl||"").trim();
  if(!proxy)return url;
  return proxy.replace(/\/+$/,"") + "/" + encodeURIComponent(url);
}

async function fetchText(url){
  const r=await fetch(proxyUrl(url),{cache:"no-store"});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function imageFromItem(el){
  const media=el.querySelector("media\\:content, content");
  const thumb=el.querySelector("media\\:thumbnail, thumbnail");
  const enclosure=[...el.querySelectorAll("enclosure")].find(x=>(x.getAttribute("type")||"").startsWith("image/"));
  const desc=el.querySelector("description, summary, content\\:encoded");
  let html=desc?.textContent||"";
  let img="";
  if(media) img=media.getAttribute("url")||media.getAttribute("href")||"";
  if(!img&&thumb) img=thumb.getAttribute("url")||"";
  if(!img&&enclosure) img=enclosure.getAttribute("url")||"";
  if(!img&&html){const m=html.match(/<img[^>]+src=["']([^"']+)["']/i);if(m)img=m[1]}
  return img;
}

function parseRSS(xml,source){
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("Ungültiges XML/RSS");
  const rootTitle=first(doc.querySelector("channel > title")?.textContent,doc.querySelector("feed > title")?.textContent,source.name,source.url);
  const items=[...doc.querySelectorAll("channel > item, feed > entry")].slice(0,3).map(el=>{
    const linkEl=el.querySelector("link[rel='alternate'], link");
    const link=first(linkEl?.getAttribute("href"),el.querySelector("guid")?.textContent);
    const title=first(el.querySelector("title")?.textContent,"Ohne Titel");
    const desc=stripHtml(first(el.querySelector("description")?.textContent,el.querySelector("summary")?.textContent,el.querySelector("content\\:encoded")?.textContent,""));
    const date=first(el.querySelector("pubDate")?.textContent,el.querySelector("published")?.textContent,el.querySelector("updated")?.textContent);
    return {id:`rss:${source.id}:${link||title}`,type:"rss",source:source.name||rootTitle,title:stripHtml(title),text:desc,image:imageFromItem(el),date,link};
  });
  return {items,feedTitle:rootTitle};
}

async function loadRSS(source){
  try{
    if(!validUrl(source.url))throw new Error("Ungültige URL");
    const xml=await fetchText(source.url);
    const parsed=parseRSS(xml,source);
    source.error="";
    source.lastSuccess=new Date().toISOString();
    return parsed.items;
  }catch(e){source.error=e.message;return []}
}

async function loadInstagram(source){
  // Instagram intentionally uses an adapter boundary. Direct browser scraping is blocked
  // by Instagram's authentication/CORS policies in normal browsers.
  source.error="Instagram-Daten benötigen einen offiziellen API-Zugang oder einen eigenen Backend-Proxy.";
  return [];
}

async function refreshData(){
  const old=data.items;
  const results=[];
  for(const s of [...state.rss].sort((a,b)=>a.order-b.order))results.push(...await loadRSS(s));
  for(const s of [...state.instagram].sort((a,b)=>a.order-b.order))results.push(...await loadInstagram(s));
  if(results.length>0){data.items=results;data.lastUpdated=new Date().toISOString();slideIndex=0}
  save();renderDisplay();scheduleRotation();
}

function renderDisplay(){
  const s=state.settings;
  const items=data.items;
  document.getElementById("app").innerHTML=`<div class="screen-shell"><main class="display ${s.fullscreen?"fullscreen":""}">
    <header class="display-header"><div class="brand">${s.logo?`<img class="brand-logo" src="${esc(s.logo)}">`:""}<div class="brand-name">${esc(s.orgName)}</div></div>
    <div><div class="clock" id="clock"></div><div class="updated">${data.lastUpdated?`Aktualisiert ${fmtDate(data.lastUpdated)}`:""}</div></div></header>
    <section class="display-stage" id="stage"></section><div class="progress" id="progress"></div>
  </main></div>`;
  renderSlide();
  updateClock();
}
function renderSlide(){
  const stage=document.getElementById("stage"), items=data.items;
  if(!stage)return;
  if(!items.length){stage.innerHTML=`<div class="empty"><div><h2>Keine Inhalte verfügbar</h2><p>Füge im Admin-Bereich RSS-Feeds hinzu. Fehlerhafte Quellen werden nicht als Inhalte angezeigt.</p></div></div>`;return}
  const x=items[slideIndex%items.length];
  stage.innerHTML=`<article class="slide active ${x.image?"":"no-image"}">
    ${x.image?`<img class="slide-media" src="${esc(x.image)}" onerror="this.closest('.slide').classList.add('no-image');this.remove()">`:""}
    <div class="slide-copy"><div class="source-row"><span class="dot"></span>${esc(x.source||x.type)}</div>
    <div class="slide-title">${esc(x.title||"")}</div>
    ${x.text?`<div class="slide-text">${esc(x.text)}</div>`:""}
    <div class="slide-time">${fmtDate(x.date)}</div></div></article>`;
  restartProgress();
}
function restartProgress(){
  const p=document.getElementById("progress");if(!p)return;
  p.innerHTML=`<i style="--duration:${Number(state.settings.slideDuration)||8}s"></i>`;
}
function scheduleRotation(){
  clearInterval(timer);
  const sec=Math.max(2,Number(state.settings.slideDuration)||8);
  timer=setInterval(()=>{if(data.items.length>1){slideIndex=(slideIndex+1)%data.items.length;renderSlide()}},sec*1000);
}
function updateClock(){const el=document.getElementById("clock");if(el)el.textContent=new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});setTimeout(updateClock,1000)}

function admin(){
  document.getElementById("app").innerHTML=`<div class="admin"><div class="admin-inner">
  <div class="admin-top"><div><h1>Display verwalten</h1><div class="muted">Quellen, Darstellung und Vorschau</div></div><button class="btn primary" id="displayBtn">Display öffnen</button></div>
  <div class="tabs"><button class="tab active" data-tab="sources">Quellen</button><button class="tab" data-tab="settings">Einstellungen</button><button class="tab" data-tab="preview">Vorschau</button></div>
  <div id="admin-content"></div></div></div>`;
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderAdminTab(b.dataset.tab)});
  document.getElementById("displayBtn").onclick=()=>{history.pushState({display:true},"","");renderDisplay();scheduleRotation()};
  renderAdminTab("sources");
}
function renderAdminTab(tab){
 const c=document.getElementById("admin-content");
 if(tab==="sources")c.innerHTML=sourcesHTML();
 if(tab==="settings")c.innerHTML=settingsHTML();
 if(tab==="preview"){c.innerHTML=`<div class="panel"><h2>Live-Vorschau</h2><div class="preview-wrap"><div id="previewHost"></div></div></div>`;renderPreview()}
 bindAdmin();
}
function sourcesHTML(){
 const ig=state.instagram.map((s,i)=>`<div class="source-item"><div class="source-info"><div class="source-name">@${esc(s.username)}</div><div class="source-url">${esc(s.url)}</div>${s.error?`<div class="source-error">${esc(s.error)}</div>`:""}</div><div class="actions"><button class="btn" onclick="moveSource('instagram',${i},-1)">↑</button><button class="btn" onclick="moveSource('instagram',${i},1)">↓</button><button class="btn" onclick="removeSource('instagram',${i})">Entfernen</button></div></div>`).join("");
 const rss=state.rss.map((s,i)=>`<div class="source-item"><div class="source-info"><div class="source-name">${esc(s.name)}</div><div class="source-url">${esc(s.url)}</div>${s.error?`<div class="source-error">${esc(s.error)}</div>`:""}</div><div class="actions"><button class="btn" onclick="moveSource('rss',${i},-1)">↑</button><button class="btn" onclick="moveSource('rss',${i},1)">↓</button><button class="btn" onclick="renameRSS(${i})">Name</button><button class="btn" onclick="removeSource('rss',${i})">Entfernen</button></div></div>`).join("");
 return `<div class="panel"><h2>RSS-Feeds</h2><div class="form-row"><input id="rssUrl" class="input" placeholder="https://example.com/feed.xml"><input id="rssName" class="input" placeholder="Feed-Name (optional)"><button id="addRSS" class="btn primary">Hinzufügen</button></div><div class="source-list">${rss||'<div class="muted">Noch keine RSS-Feeds.</div>'}</div></div>
 <div class="panel"><h2>Instagram</h2><div class="form-row"><input id="igUrl" class="input" placeholder="https://www.instagram.com/beispielkonto/"><button id="addIG" class="btn primary">Hinzufügen</button></div><div class="notice">Instagram-Posts werden bewusst nicht erfunden. Für echte Beiträge ist ein offizieller Instagram-API-Zugang oder ein eigener Server-Adapter erforderlich. Die Quelle wird bereits getrennt gespeichert und kann später angebunden werden.</div><div class="source-list">${ig||'<div class="muted">Noch keine Instagram-Profile.</div>'}</div></div>`;
}
function settingsHTML(){
 const s=state.settings;
 return `<div class="panel"><h2>Display-Einstellungen</h2><div class="settings-grid">
 <div class="field"><label>Organisationsname</label><input id="orgName" class="input" value="${esc(s.orgName)}"></div>
 <div class="field"><label>Logo-URL</label><input id="logo" class="input" value="${esc(s.logo)}"></div>
 <div class="field"><label>Anzeigedauer (Sekunden)</label><input id="slideDuration" class="input" type="number" min="2" value="${s.slideDuration}"></div>
 <div class="field"><label>Aktualisierung (Minuten)</label><input id="refreshInterval" class="input" type="number" min="1" value="${s.refreshInterval}"></div>
 <div class="field"><label>Farbschema</label><select id="dark" class="input"><option value="true" ${s.dark?"selected":""}>Dark</option><option value="false" ${!s.dark?"selected":""}>Light</option></select></div>
 <div class="field"><label>Animationen</label><select id="animations" class="input"><option value="true" ${s.animations?"selected":""}>Ein</option><option value="false" ${!s.animations?"selected":""}>Aus</option></select></div>
 <div class="field"><label>CORS-Proxy (optional)</label><input id="proxyUrl" class="input" placeholder="z.B. https://dein-proxy.example/fetch?url=" value="${esc(s.proxyUrl||"")}"></div>
 </div><div class="notice">Ein reiner Browser kann fremde RSS-Feeds nur laden, wenn der Feed CORS erlaubt. Für produktiven Einsatz empfiehlt sich ein eigener kleiner Proxy/Backend-Dienst. Der Proxy muss die Ziel-URL als URL-Pfad akzeptieren.</div><button id="saveSettings" class="btn primary" style="margin-top:14px">Speichern & aktualisieren</button></div>`;
}
function renderPreview(){
 const host=document.getElementById("previewHost");if(!host)return;
 host.innerHTML=`<div class="display" id="previewDisplay"></div>`;
 const old=document.getElementById("app"); // render a minimal preview without replacing admin
 const d=document.getElementById("previewDisplay");
 d.innerHTML=`<header class="display-header"><div class="brand">${state.settings.logo?`<img class="brand-logo" src="${esc(state.settings.logo)}">`:""}<div class="brand-name">${esc(state.settings.orgName)}</div></div><div class="clock">${new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}</div></header><section class="display-stage" id="previewStage"></section>`;
 const st=d.querySelector("#previewStage");
 const x=data.items[0];
 st.innerHTML=x?`<article class="slide active ${x.image?"":"no-image"}">${x.image?`<img class="slide-media" src="${esc(x.image)}">`:""}<div class="slide-copy"><div class="source-row"><span class="dot"></span>${esc(x.source)}</div><div class="slide-title">${esc(x.title)}</div><div class="slide-text">${esc(x.text||"")}</div><div class="slide-time">${fmtDate(x.date)}</div></div></article>`:`<div class="empty"><div><h2>Keine Daten</h2><p>Füge einen Feed hinzu und aktualisiere die Daten.</p></div></div>`;
}
function bindAdmin(){
 const addRSS=document.getElementById("addRSS");if(addRSS)addRSS.onclick=()=>{const url=document.getElementById("rssUrl").value.trim(),name=document.getElementById("rssName").value.trim();if(!validUrl(url))return alert("Bitte eine gültige http/https URL eingeben.");state.rss.push({id:crypto.randomUUID(),url,name:name||url,order:state.rss.length,error:""});save();renderAdminTab("sources");refreshData()};
 const addIG=document.getElementById("addIG");if(addIG)addIG.onclick=()=>{const url=document.getElementById("igUrl").value.trim();if(!validUrl(url)||!url.includes("instagram.com"))return alert("Bitte eine gültige Instagram-Profil-URL eingeben.");const u=new URL(url);const parts=u.pathname.split("/").filter(Boolean);if(!parts[0])return alert("Profilname fehlt.");state.instagram.push({id:crypto.randomUUID(),url,username:parts[0],order:state.instagram.length,error:""});save();renderAdminTab("sources");refreshData()};
 const saveSettings=document.getElementById("saveSettings");if(saveSettings)saveSettings.onclick=()=>{state.settings.orgName=document.getElementById("orgName").value.trim()||"Display Board";state.settings.logo=document.getElementById("logo").value.trim();state.settings.slideDuration=Math.max(2,Number(document.getElementById("slideDuration").value)||8);state.settings.refreshInterval=Math.max(1,Number(document.getElementById("refreshInterval").value)||5);state.settings.dark=document.getElementById("dark").value==="true";state.settings.animations=document.getElementById("animations").value==="true";state.settings.proxyUrl=document.getElementById("proxyUrl").value.trim();save();applyTheme();scheduleRefresh();refreshData();alert("Gespeichert.")};
}
function moveSource(type,i,dir){const a=state[type],j=i+dir;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];a.forEach((x,k)=>x.order=k);save();admin()}
function removeSource(type,i){state[type].splice(i,1);state[type].forEach((x,k)=>x.order=k);save();refreshData();admin()}
function renameRSS(i){const n=prompt("Neuer Feed-Name:",state.rss[i].name);if(n!==null&&n.trim()){state.rss[i].name=n.trim();save();admin();}}
function applyTheme(){document.body.style.background=state.settings.dark?"#09090b":"#f4f4f5"}
function scheduleRefresh(){clearInterval(refreshTimer);refreshTimer=setInterval(refreshData,Math.max(1,Number(state.settings.refreshInterval)||5)*60000)}
window.moveSource=moveSource;window.removeSource=removeSource;window.renameRSS=renameRSS;

window.addEventListener("popstate",()=>{admin()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")admin()});
applyTheme();
if(location.hash==="#admin")admin();else{renderDisplay();refreshData();scheduleRefresh()}
