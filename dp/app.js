const STORAGE_KEY="display-board-v2";
const DEFAULTS={settings:{orgName:"Display Board",logo:"",slideDuration:8,refreshInterval:5,dark:true,animations:true},instagram:[],rss:[]};
const state=loadState();
let data={items:[],lastUpdated:null},slideIndex=0,timer=null,refreshTimer=null;

function loadState(){try{return {...structuredClone(DEFAULTS),...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}}catch{return structuredClone(DEFAULTS)}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmtDate(d){if(!d)return "";const x=new Date(d);if(Number.isNaN(x.getTime()))return "";const diff=(Date.now()-x)/1000;if(diff<60)return"gerade eben";if(diff<3600)return`vor ${Math.floor(diff/60)} Min.`;if(diff<86400)return`vor ${Math.floor(diff/3600)} Std.`;return x.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"})}
function stripHtml(s=""){const t=document.createElement("template");t.innerHTML=s;return(t.content.textContent||"").replace(/\s+/g," ").trim()}
function first(...v){return v.find(x=>x&&String(x).trim())||""}
function validUrl(u){try{const x=new URL(u);return["http:","https:"].includes(x.protocol)}catch{return false}}

function localChildren(el,name){
 const n=name.toLowerCase();
 return [...el.children].filter(x=>(x.localName||x.tagName||"").toLowerCase()===n);
}
function firstChildText(el,names){
 for(const n of names){const x=localChildren(el,n)[0];if(x?.textContent?.trim())return x.textContent.trim()}
 return "";
}
function firstDescendant(el,names){
 const wanted=new Set(names.map(x=>x.toLowerCase()));
 return [...el.getElementsByTagName("*")].find(x=>wanted.has((x.localName||x.tagName||"").toLowerCase()));
}
function descendantText(el,names){return firstDescendant(el,names)?.textContent?.trim()||""}
function absoluteUrl(value,base){
 if(!value)return "";
 try{return new URL(value,base).href}catch{return ""}
}
function imageFromItem(el,baseUrl){
 const candidates=[];
 for(const node of [...el.getElementsByTagName("*")]){
  const n=(node.localName||node.tagName||"").toLowerCase();
  if(n==="content"||n==="thumbnail"){
   const u=node.getAttribute("url")||node.getAttribute("href");if(u)candidates.push(u);
  }
 }
 for(const node of [...el.getElementsByTagName("enclosure")]){
  const type=(node.getAttribute("type")||"").toLowerCase(),u=node.getAttribute("url");
  if(u&&(type.startsWith("image/")||/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)))candidates.push(u);
 }
 const desc=firstDescendant(el,["description","summary","encoded","content"]);
 const html=desc?.textContent||"";
 const m=html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
 if(m)candidates.push(m[1]);
 return candidates.map(x=>absoluteUrl(x,baseUrl)).find(Boolean)||"";
}
function parseRSS(xml,source){
 const doc=new DOMParser().parseFromString(xml,"application/xml");
 if(doc.querySelector("parsererror"))throw new Error("Ungültiges XML/RSS");
 const rootTitle=first(descendantText(doc,["title"]),source.name,source.url);
 const elements=[...doc.getElementsByTagName("*")].filter(el=>{
  const n=(el.localName||el.tagName||"").toLowerCase();return n==="item"||n==="entry";
 });
 const items=elements.slice(0,10).map(el=>{
  const title=first(firstChildText(el,["title"]),descendantText(el,["title"]),"Ohne Titel");
  let link="";
  for(const l of localChildren(el,"link")){link=first(l.getAttribute("href"),l.textContent?.trim());if(link)break}
  if(!link)link=firstChildText(el,["guid","id"]);
  const desc=stripHtml(first(firstChildText(el,["description","summary"]),descendantText(el,["encoded"]),firstChildText(el,["content"]),""));
  const date=first(firstChildText(el,["pubDate","published","updated","date","created"]),descendantText(el,["published","updated"]));
  return{id:`rss:${source.id}:${link||title}`,type:"rss",source:source.name||rootTitle,title:stripHtml(title),text:desc,image:imageFromItem(el,source.url),date,link:absoluteUrl(link,source.url)};
 });
 return{items:items.slice(0,3),feedTitle:rootTitle};
}
async function fetchArticleImage(articleUrl){
 if(!validUrl(articleUrl))return "";
 const candidates=[articleUrl,`https://api.allorigins.win/raw?url=${encodeURIComponent(articleUrl)}`,`https://corsproxy.io/?url=${encodeURIComponent(articleUrl)}`];
 for(const target of candidates){
  try{
   const r=await fetch(target,{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!r.ok)continue;
   const html=await r.text();
   const m=html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
   if(m?.[1])return absoluteUrl(m[1],articleUrl);
  }catch{}
 }
 return "";
}

/*
 * GitHub Pages is static: it cannot act as a server-side CORS proxy.
 * We therefore try the feed directly first and, only if the browser blocks it,
 * use a public RSS-to-browser fallback. No proxy setting is exposed to users.
 * If a provider changes availability, the app simply keeps the last successful data.
 */
const FALLBACKS=[
 u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
 u=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`
];

async function getText(url,signal){
 const direct=await fetch(url,{cache:"no-store",redirect:"follow",signal});
 if(!direct.ok)throw new Error(`HTTP ${direct.status}`);
 return await direct.text();
}
async function getTextWithFallbacks(url){
 let directError=null;
 try{return await getText(url,AbortSignal.timeout(12000))}catch(e){directError=e}
 for(const make of FALLBACKS){
  try{
   const r=await fetch(make(url),{cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(15000)});
   if(!r.ok)continue;
   const text=await r.text();
   if(text&&text.length<10_000_000)return text;
  }catch{}
 }
 throw new Error(directError?.message||"Quelle nicht erreichbar");
}
async function loadRSS(source){
 try{
  if(!validUrl(source.url))throw new Error("Ungültige URL");
  const xml=await getTextWithFallbacks(source.url);
  const parsed=parseRSS(xml,source);
  for(const item of parsed.items)if(!item.image&&item.link)item.image=await fetchArticleImage(item.link);
  source.error="";source.lastSuccess=new Date().toISOString();return parsed.items;
 }catch(e){source.error=`Abruf fehlgeschlagen: ${e.message}`;return[]}
}
async function loadInstagram(source){
 try{
  const handle=source.username.replace(/^@/,"").trim();if(!handle)throw new Error("Benutzername fehlt");
  const endpoint=`https://prexzyapis.com/stalk/igstalk?user=${encodeURIComponent(handle)}`;
  const r=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`API HTTP ${r.status}`);
  const raw=await r.json(),root=raw?.result||raw?.data||raw;
  const posts=Array.isArray(root?.posts)?root.posts:Array.isArray(root?.items)?root.items:Array.isArray(raw?.posts)?raw.posts:[];
  const normalized=posts.slice(0,3).map((p,i)=>{
   const link=first(p.permalink,p.post_url,p.link,p.url),image=first(p.image,p.image_url,p.thumbnail,p.thumbnail_url,p.display_url,p.media_url,p.photo,p.cover),caption=first(p.caption,p.description,p.text,p.title,""),date=first(p.timestamp,p.published_at,p.created_at,p.date);
   return{id:`instagram:${source.id}:${p.id||link||i}`,type:"instagram",source:`@${handle}`,title:caption?caption.slice(0,180):`Neuer Beitrag von @${handle}`,text:caption,image:absoluteUrl(image,link||`https://www.instagram.com/${handle}/`),date,link:absoluteUrl(link,`https://www.instagram.com/${handle}/`)};
  });
  if(!normalized.length)throw new Error("Keine Posts im API-Ergebnis");
  source.error="";source.lastSuccess=new Date().toISOString();return normalized;
 }catch(e){source.error=`Instagram nicht abrufbar: ${e.message}`;return[]}
}
async function refreshData(){
 const results=[];
 for(const s of [...state.rss].sort((a,b)=>a.order-b.order))results.push(...await loadRSS(s));
 for(const s of [...state.instagram].sort((a,b)=>a.order-b.order))results.push(...await loadInstagram(s));
 // Critical: only replace the display if at least one real source returned content.
 if(results.length){data.items=results;data.lastUpdated=new Date().toISOString();slideIndex=0}
 save();renderDisplay();scheduleRotation();
}
function renderDisplay(){
 const s=state.settings;
 document.getElementById("app").innerHTML=`<div class="screen-shell"><main class="display">
 <header class="display-header"><div class="brand">${s.logo?`<img class="brand-logo" src="${esc(s.logo)}">`:""}<div class="brand-name">${esc(s.orgName)}</div></div>
 <div><div class="clock" id="clock"></div><div class="updated">${data.lastUpdated?`Aktualisiert ${fmtDate(data.lastUpdated)}`:""}</div></div></header>
 <section class="display-stage" id="stage"></section><div class="progress" id="progress"></div></main></div>`;
 renderSlide();updateClock();
}
function renderSlide(){
 const stage=document.getElementById("stage"),items=data.items;if(!stage)return;
 if(!items.length){stage.innerHTML=`<div class="empty"><div><h2>Keine Inhalte verfügbar</h2><p>Füge im Admin-Bereich einen RSS-Feed hinzu.</p></div></div>`;return}
 const x=items[slideIndex%items.length];
 stage.innerHTML=`<article class="slide active ${x.image?"":"no-image"}">${x.image?`<img class="slide-media" src="${esc(x.image)}" onerror="this.closest('.slide').classList.add('no-image');this.remove()">`:""}<div class="slide-copy"><div class="source-row"><span class="dot"></span>${esc(x.source||x.type)}</div><div class="slide-title">${esc(x.title||"")}</div>${x.text?`<div class="slide-text">${esc(x.text)}</div>`:""}<div class="slide-time">${fmtDate(x.date)}</div></div></article>`;
 restartProgress();
}
function restartProgress(){const p=document.getElementById("progress");if(p)p.innerHTML=`<i style="--duration:${Number(state.settings.slideDuration)||8}s"></i>`}
function scheduleRotation(){clearInterval(timer);timer=setInterval(()=>{if(data.items.length>1){slideIndex=(slideIndex+1)%data.items.length;renderSlide()}},Math.max(2,Number(state.settings.slideDuration)||8)*1000)}
function updateClock(){const el=document.getElementById("clock");if(el)el.textContent=new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});setTimeout(updateClock,1000)}

function admin(){
 document.getElementById("app").innerHTML=`<div class="admin"><div class="admin-inner"><div class="admin-top"><div><h1>Display verwalten</h1><div class="muted">Quellen, Darstellung und Vorschau</div></div><button class="btn primary" id="displayBtn">Display öffnen</button></div>
 <div class="tabs"><button class="tab active" data-tab="sources">Quellen</button><button class="tab" data-tab="settings">Einstellungen</button><button class="tab" data-tab="preview">Vorschau</button></div><div id="admin-content"></div></div></div>`;
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderAdminTab(b.dataset.tab)});
 document.getElementById("displayBtn").onclick=()=>{history.pushState({display:true},"","");renderDisplay();scheduleRotation()};renderAdminTab("sources");
}
function sourcesHTML(){
 const ig=state.instagram.map((s,i)=>`<div class="source-item"><div class="source-info"><div class="source-name">@${esc(s.username)}</div><div class="source-url">${esc(s.url)}</div>${s.error?`<div class="source-error">${esc(s.error)}</div>`:""}</div><div class="actions"><button class="btn" onclick="moveSource('instagram',${i},-1)">↑</button><button class="btn" onclick="moveSource('instagram',${i},1)">↓</button><button class="btn" onclick="removeSource('instagram',${i})">Entfernen</button></div></div>`).join("");
 const rss=state.rss.map((s,i)=>`<div class="source-item"><div class="source-info"><div class="source-name">${esc(s.name)}</div><div class="source-url">${esc(s.url)}</div>${s.error?`<div class="source-error">${esc(s.error)}</div>`:s.lastSuccess?`<div class="source-ok">✓ Letzter erfolgreicher Abruf: ${fmtDate(s.lastSuccess)}</div>`:""}</div><div class="actions"><button class="btn" onclick="moveSource('rss',${i},-1)">↑</button><button class="btn" onclick="moveSource('rss',${i},1)">↓</button><button class="btn" onclick="renameRSS(${i})">Name</button><button class="btn" onclick="removeSource('rss',${i})">Entfernen</button></div></div>`).join("");
 return `<div class="panel"><h2>RSS-Feeds</h2><div class="form-row"><input id="rssUrl" class="input" placeholder="https://example.com/feed.xml"><input id="rssName" class="input" placeholder="Feed-Name (optional)"><button id="addRSS" class="btn primary">Hinzufügen</button></div><div class="notice">Die App versucht den Feed zuerst direkt. Wenn der Browser wegen CORS blockiert, wird automatisch ein Fallback verwendet. Du musst keinen Proxy konfigurieren.</div><div class="source-list">${rss||'<div class="muted">Noch keine RSS-Feeds.</div>'}</div></div>
 <div class="panel"><h2>Instagram</h2><div class="form-row"><input id="igUrl" class="input" placeholder="https://www.instagram.com/beispielkonto/"><button id="addIG" class="btn primary">Hinzufügen</button></div><div class="notice">Instagram-Posts werden nicht erfunden. Für echte Posts ist ein offizieller API-/Backend-Zugriff erforderlich.</div><div class="source-list">${ig||'<div class="muted">Noch keine Instagram-Profile.</div>'}</div></div>`;
}
function settingsHTML(){const s=state.settings;return `<div class="panel"><h2>Display-Einstellungen</h2><div class="settings-grid"><div class="field"><label>Organisationsname</label><input id="orgName" class="input" value="${esc(s.orgName)}"></div><div class="field"><label>Logo-URL</label><input id="logo" class="input" value="${esc(s.logo)}"></div><div class="field"><label>Anzeigedauer (Sekunden)</label><input id="slideDuration" class="input" type="number" min="2" value="${s.slideDuration}"></div><div class="field"><label>Aktualisierung (Minuten)</label><input id="refreshInterval" class="input" type="number" min="1" value="${s.refreshInterval}"></div><div class="field"><label>Farbschema</label><select id="dark" class="input"><option value="true" ${s.dark?"selected":""}>Dark</option><option value="false" ${!s.dark?"selected":""}>Light</option></select></div><div class="field"><label>Animationen</label><select id="animations" class="input"><option value="true" ${s.animations?"selected":""}>Ein</option><option value="false" ${!s.animations?"selected":""}>Aus</option></select></div></div><button id="saveSettings" class="btn primary" style="margin-top:14px">Speichern & aktualisieren</button></div>`}
function renderPreview(){const host=document.getElementById("admin-content");host.innerHTML=`<div class="panel"><h2>Live-Vorschau</h2><div class="preview-wrap"><div class="display"><header class="display-header"><div class="brand"><div class="brand-name">${esc(state.settings.orgName)}</div></div></header><section class="display-stage">${data.items[0]?`<article class="slide active ${data.items[0].image?"":"no-image"}">${data.items[0].image?`<img class="slide-media" src="${esc(data.items[0].image)}">`:""}<div class="slide-copy"><div class="source-row"><span class="dot"></span>${esc(data.items[0].source)}</div><div class="slide-title">${esc(data.items[0].title)}</div><div class="slide-text">${esc(data.items[0].text||"")}</div></div></article>`:`<div class="empty"><div><h2>Keine Daten</h2></div></div>`}</section></div></div></div>`}
function renderAdminTab(tab){if(tab==="sources")document.getElementById("admin-content").innerHTML=sourcesHTML();else if(tab==="settings")document.getElementById("admin-content").innerHTML=settingsHTML();else renderPreview();bindAdmin()}
function bindAdmin(){
 const addRSS=document.getElementById("addRSS");if(addRSS)addRSS.onclick=()=>{const url=document.getElementById("rssUrl").value.trim(),name=document.getElementById("rssName").value.trim();if(!validUrl(url))return alert("Bitte eine gültige http/https URL eingeben.");state.rss.push({id:crypto.randomUUID(),url,name:name||url,order:state.rss.length,error:""});save();renderAdminTab("sources");refreshData()};
 const addIG=document.getElementById("addIG");if(addIG)addIG.onclick=()=>{const url=document.getElementById("igUrl").value.trim();if(!validUrl(url)||!url.includes("instagram.com"))return alert("Bitte eine gültige Instagram-Profil-URL eingeben.");const u=new URL(url),p=u.pathname.split("/").filter(Boolean);if(!p[0])return alert("Profilname fehlt.");state.instagram.push({id:crypto.randomUUID(),url,username:p[0],order:state.instagram.length,error:""});save();renderAdminTab("sources");refreshData()};
 const saveSettings=document.getElementById("saveSettings");if(saveSettings)saveSettings.onclick=()=>{state.settings.orgName=document.getElementById("orgName").value.trim()||"Display Board";state.settings.logo=document.getElementById("logo").value.trim();state.settings.slideDuration=Math.max(2,Number(document.getElementById("slideDuration").value)||8);state.settings.refreshInterval=Math.max(1,Number(document.getElementById("refreshInterval").value)||5);state.settings.dark=document.getElementById("dark").value==="true";state.settings.animations=document.getElementById("animations").value==="true";save();scheduleRefresh();refreshData();alert("Gespeichert.")};
}
function moveSource(type,i,dir){const a=state[type],j=i+dir;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];a.forEach((x,k)=>x.order=k);save();admin()}
function removeSource(type,i){state[type].splice(i,1);state[type].forEach((x,k)=>x.order=k);save();refreshData();admin()}
function renameRSS(i){const n=prompt("Neuer Feed-Name:",state.rss[i].name);if(n!==null&&n.trim()){state.rss[i].name=n.trim();save();admin()}}
function scheduleRefresh(){clearInterval(refreshTimer);refreshTimer=setInterval(refreshData,Math.max(1,Number(state.settings.refreshInterval)||5)*60000)}
window.moveSource=moveSource;window.removeSource=removeSource;window.renameRSS=renameRSS;
window.addEventListener("popstate",admin);document.addEventListener("keydown",e=>{if(e.key==="Escape")admin()});
if(location.hash==="#admin")admin();else{renderDisplay();refreshData();scheduleRefresh()}
