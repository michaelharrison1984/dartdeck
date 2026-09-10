const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const view = $('#view');
const toastEl = $('#toast');

let players = [];
let x01 = null;
let party = null;
let practice = null;

let appSettings = {
  primary_color:'#8ca75b', accent_color:'#b8cf8f', background_color:'#0d0f10',
  panel_color:'#171a1c', text_color:'#f4f6f1', muted_color:'#aeb5ad',
  font:'modern', keep_awake:true, has_custom_favicon:false
};
let deferredInstallPrompt = null;
let wakeLock = null;
let gameplayActive = false;
let serviceWorkerReady = false;
const APP_VERSION = '0.3.0';

const FONT_STACKS = {
  modern:'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  system:'system-ui, -apple-system, "Segoe UI", sans-serif',
  rounded:'"Trebuchet MS", "Arial Rounded MT Bold", Arial, sans-serif',
  condensed:'"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
  classic:'Georgia, "Times New Roman", serif',
  mono:'"Cascadia Code", "SFMono-Regular", Consolas, "Courier New", monospace'
};

function applySettings(settings){
  appSettings={...appSettings,...settings};
  const r=document.documentElement.style;
  r.setProperty('--accent',appSettings.primary_color);
  r.setProperty('--accent-2',appSettings.accent_color);
  r.setProperty('--bg',appSettings.background_color);
  r.setProperty('--panel',appSettings.panel_color);
  r.setProperty('--text',appSettings.text_color);
  r.setProperty('--muted',appSettings.muted_color);
  r.setProperty('--font-family',FONT_STACKS[appSettings.font]||FONT_STACKS.modern);
  const meta=$('meta[name="theme-color"]'); if(meta)meta.setAttribute('content',appSettings.primary_color);
}
async function loadSettings(){
  try{applySettings(await api('/api/settings'));}catch(e){applySettings(appSettings);}
}
function refreshBrandIcon(){
  const stamp=Date.now();
  $$('.brand-icon').forEach(i=>i.src=`/branding/icon-64.png?v=${stamp}`);
  const icon=$('link[rel="icon"]'); if(icon)icon.href=`/branding/icon-64.png?v=${stamp}`;
  const apple=$('link[rel="apple-touch-icon"]'); if(apple)apple.href=`/branding/icon-180.png?v=${stamp}`;
}
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; }
function updateInstallButton(){
  const b=$('#installApp'); if(!b)return;
  b.classList.toggle('hidden', !deferredInstallPrompt || isStandalone());
}
async function installPwa(){
  if(isStandalone()){toast('DartDeck is already installed');return;}
  if(!deferredInstallPrompt){
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(ios?'Use Share → Add to Home Screen':'Install option is not available in this browser yet',3200);return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice.catch(()=>null);
  deferredInstallPrompt=null; updateInstallButton();
  if(view.dataset.page==='settings') settingsView();
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; updateInstallButton(); if(view.dataset.page==='settings') settingsView(); });
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;updateInstallButton();toast('DartDeck installed');});

async function releaseWakeLock(){
  if(wakeLock){ try{await wakeLock.release();}catch(e){} wakeLock=null; }
  $('#wakeBadge')?.classList.add('hidden');
}
async function syncWakeLock(){
  const should=gameplayActive && appSettings.keep_awake && document.visibilityState==='visible';
  if(!should){await releaseWakeLock();return;}
  if(!window.isSecureContext || !('wakeLock' in navigator)){ $('#wakeBadge')?.classList.add('hidden'); return; }
  if(wakeLock)return;
  try{
    wakeLock=await navigator.wakeLock.request('screen');
    $('#wakeBadge')?.classList.remove('hidden');
    wakeLock.addEventListener('release',()=>{wakeLock=null;$('#wakeBadge')?.classList.add('hidden');});
  }catch(e){wakeLock=null;$('#wakeBadge')?.classList.add('hidden');}
}
function setGameplayActive(active){ gameplayActive=!!active; syncWakeLock(); }
document.addEventListener('visibilitychange',()=>syncWakeLock());


const api = async (url, options={}) => {
  const res = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
  if (!res.ok) throw new Error((await res.json().catch(()=>({detail:'Request failed'}))).detail || 'Request failed');
  return res.json();
};

function toast(msg, ms=1800) {
  toastEl.textContent = msg; toastEl.classList.remove('hidden');
  setTimeout(()=>toastEl.classList.add('hidden'), ms);
}
function esc(s='') { return String(s).replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function fmt(n,d=1){ return Number(n||0).toFixed(d); }

async function loadPlayers(){ players = await api('/api/players'); }

function home(){
  setGameplayActive(false);
  view.innerHTML = `
    <div class="grid">
      ${homeCard('🎯','Quick Game','301, 501 or 701 for up to four players.','x01-setup')}
      ${homeCard('👥','Party Games','Cricket, Killer, Shanghai and more.','party-menu')}
      ${homeCard('🏋️','Training','Checkouts, doubles and scoring drills.','practice-menu')}
      ${homeCard('📊','Stats','Lifetime averages, 180s and checkout data.','stats')}
    </div>
    <div class="section-title"><h2>Designed for the oche</h2></div>
    <div class="card"><p class="muted">Large touch targets, fast score entry, undo support, checkout routes and installable PWA support. Your players and match history are stored in the Docker volume.</p></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>route(b.dataset.go));
}
function homeCard(e,t,d,go){return `<button class="card click" data-go="${go}" style="text-align:left;color:inherit"><div class="emoji">${e}</div><h2>${t}</h2><p class="muted">${d}</p></button>`}

async function playerManager(){
  setGameplayActive(false);
  await loadPlayers();
  view.innerHTML = `<div class="section-title"><h2>Players</h2><span class="muted">Saved centrally</span></div>
  <div class="card">
    <div class="form-grid"><label>New player<input id="newPlayer" maxlength="40" placeholder="Player name"></label></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="addPlayer">Add player</button></div>
    <div class="player-pills">${players.map(p=>`<span class="pill">${esc(p.name)} <button class="btn danger" data-del="${p.id}" style="padding:2px 7px;margin-left:6px">×</button></span>`).join('') || '<span class="muted">No players yet.</span>'}</div>
  </div>`;
  $('#addPlayer').onclick=async()=>{
    const name=$('#newPlayer').value.trim(); if(!name)return;
    try{await api('/api/players',{method:'POST',body:JSON.stringify({name})}); await playerManager(); toast('Player added');}catch(e){toast(e.message,2500)}
  };
  $$('[data-del]').forEach(b=>b.onclick=async()=>{try{await api('/api/players/'+b.dataset.del,{method:'DELETE'});await playerManager()}catch(e){toast(e.message,2500)}});
}

async function statsView(){
  setGameplayActive(false);
  const rows=await api('/api/stats');
  view.innerHTML=`<div class="section-title"><h2>Player stats</h2><span class="muted">Recorded X01 history</span></div><div class="card table-wrap"><table>
  <thead><tr><th>Player</th><th>Matches</th><th>Legs</th><th>Avg</th><th>Best Avg</th><th>High CO</th><th>High Visit</th><th>180s</th><th>CO%</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${r.matches}</td><td>${r.legs_won}</td><td>${fmt(r.lifetime_average,2)}</td><td>${fmt(r.best_average,2)}</td><td>${r.highest_checkout}</td><td>${r.highest_visit}</td><td>${r.total_180s}</td><td>${r.checkout_attempts?fmt(r.checkouts/r.checkout_attempts*100,0)+'%':'—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No stats recorded yet.</td></tr>'}</tbody></table></div>`;
}

async function settingsView(){
  setGameplayActive(false);
  view.dataset.page='settings';
  await loadSettings();
  const secure=window.isSecureContext;
  const sw=('serviceWorker' in navigator);
  const wake=('wakeLock' in navigator);
  const standalone=isStandalone();
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const installText=standalone?'Installed':deferredInstallPrompt?'Install DartDeck':ios?'Use Share → Add to Home Screen':secure?'Install prompt not currently offered':'HTTPS required for installation';
  view.innerHTML=`
    <div class="section-title"><h2>Settings</h2><span class="muted">Branding, display & PWA</span></div>
    <div class="settings-grid">
      <div class="card">
        <h3>Theme</h3>
        <div class="colour-grid">
          ${colourField('Primary','primaryColor',appSettings.primary_color)}
          ${colourField('Accent','accentColor',appSettings.accent_color)}
          ${colourField('Background','backgroundColor',appSettings.background_color)}
          ${colourField('Panels','panelColor',appSettings.panel_color)}
          ${colourField('Text','textColor',appSettings.text_color)}
          ${colourField('Muted text','mutedColor',appSettings.muted_color)}
        </div>
        <label style="margin-top:12px">Font
          <select id="fontChoice">
            <option value="modern">Modern</option><option value="system">System</option><option value="rounded">Rounded</option>
            <option value="condensed">Condensed</option><option value="classic">Classic serif</option><option value="mono">Monospace</option>
          </select>
        </label>
        <div class="settings-preview" id="themePreview" style="margin-top:12px"><span class="muted">Preview</span><div class="sample-score">501</div><strong>Checkout: T20 → T19 → D12</strong></div>
        <div class="actions"><button class="btn primary" id="saveTheme">Save appearance</button><button class="btn" id="defaultTheme">Default colours</button></div>
      </div>
      <div class="card">
        <h3>App icon / favicon</h3>
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px"><img class="favicon-preview" id="faviconPreview" src="/branding/icon-192.png?v=${Date.now()}" alt="Current app icon"><p class="muted">Upload a square PNG, JPG or WebP. DartDeck creates the favicon and PWA icon sizes automatically.</p></div>
        <label>Choose image<input id="faviconFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="uploadFavicon">Upload icon</button><button class="btn" id="resetFavicon" ${appSettings.has_custom_favicon?'':'disabled'}>Restore DartDeck icon</button></div>
      </div>
      <div class="card">
        <h3>During games</h3>
        <div class="toggle-row"><div><strong>Keep screen awake</strong><div class="muted">Prevents the display sleeping while a match or practice session is active.</div></div><input id="keepAwake" type="checkbox" ${appSettings.keep_awake?'checked':''}></div>
        <p class="muted">Wake Lock requires HTTPS (or localhost) and a supported browser.</p>
        <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="saveGameSettings">Save game settings</button></div>
      </div>
      <div class="card">
        <h3>PWA status</h3>
        ${statusRow(true,`DartDeck v${APP_VERSION}`)}
        ${statusRow(secure,secure?'Secure context: yes':'Secure context: no — use HTTPS')}
        ${statusRow(sw,sw?'Service worker supported':'Service worker not supported')}
        ${statusRow(wake,wake?'Screen Wake Lock supported':'Screen Wake Lock unavailable')}
        ${statusRow(standalone,standalone?'Running as installed app':'Running in browser')}
        <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="installFromSettings" ${(!deferredInstallPrompt||standalone)?'disabled':''}>${esc(installText)}</button></div>
        ${!secure?'<p class="warn"><strong>Important:</strong> Browsing to a LAN IP over plain HTTP normally prevents PWA installation and screen wake lock. Put DartDeck behind HTTPS to enable both.</p>':''}
        ${ios&&!standalone?'<p class="muted">On iPhone/iPad, open Safari, tap Share, then <strong>Add to Home Screen</strong>.</p>':''}
      </div>
    </div>`;
  $('#fontChoice').value=appSettings.font;
  $$('[data-sync]').forEach(t=>{t.onchange=()=>{if(/^#[0-9a-fA-F]{6}$/.test(t.value)){const c=$('#'+t.dataset.sync);c.value=t.value;preview();}else t.value=$('#'+t.dataset.sync).value;};});
  const preview=()=>applySettings({...appSettings,primary_color:$('#primaryColor').value,accent_color:$('#accentColor').value,background_color:$('#backgroundColor').value,panel_color:$('#panelColor').value,text_color:$('#textColor').value,muted_color:$('#mutedColor').value,font:$('#fontChoice').value});
  ['primaryColor','accentColor','backgroundColor','panelColor','textColor','mutedColor','fontChoice'].forEach(id=>$('#'+id).oninput=preview);
  $('#defaultTheme').onclick=()=>{const d={primary_color:'#8ca75b',accent_color:'#b8cf8f',background_color:'#0d0f10',panel_color:'#171a1c',text_color:'#f4f6f1',muted_color:'#aeb5ad',font:'modern'};$('#primaryColor').value=d.primary_color;$('#accentColor').value=d.accent_color;$('#backgroundColor').value=d.background_color;$('#panelColor').value=d.panel_color;$('#textColor').value=d.text_color;$('#mutedColor').value=d.muted_color;$('#fontChoice').value=d.font;preview();};
  $('#saveTheme').onclick=async()=>{await saveSettingsFromForm();toast('Appearance saved');};
  $('#saveGameSettings').onclick=async()=>{await saveSettingsFromForm();toast('Game settings saved');};
  $('#uploadFavicon').onclick=uploadFavicon;
  $('#resetFavicon').onclick=resetFavicon;
  $('#installFromSettings').onclick=installPwa;
}
function colourField(label,id,value){return `<label>${label}<span class="colour-field"><input type="color" id="${id}" value="${value}"><input value="${value}" aria-label="${label} hex colour" data-sync="${id}" maxlength="7"></span></label>`}
function statusRow(ok,text){return `<div class="status-row"><span class="status-dot ${ok?'ok':'bad'}"></span><span>${text}</span></div>`}
async function saveSettingsFromForm(){
  const payload={primary_color:$('#primaryColor').value,accent_color:$('#accentColor').value,background_color:$('#backgroundColor').value,panel_color:$('#panelColor').value,text_color:$('#textColor').value,muted_color:$('#mutedColor').value,font:$('#fontChoice').value,keep_awake:$('#keepAwake').checked};
  appSettings=await api('/api/settings',{method:'PUT',body:JSON.stringify(payload)});applySettings(appSettings);syncWakeLock();
}
async function uploadFavicon(){
  const file=$('#faviconFile').files[0]; if(!file){toast('Choose an image first');return;}
  const fd=new FormData();fd.append('file',file);
  const res=await fetch('/api/settings/favicon',{method:'POST',body:fd});
  if(!res.ok){const e=await res.json().catch(()=>({detail:'Upload failed'}));toast(e.detail||'Upload failed',3000);return;}
  appSettings={...appSettings,...await res.json()};refreshBrandIcon();toast('App icon updated');settingsView();
}
async function resetFavicon(){
  const res=await fetch('/api/settings/favicon',{method:'DELETE'});if(!res.ok){toast('Could not reset icon');return;}
  appSettings={...appSettings,...await res.json()};refreshBrandIcon();toast('Default icon restored');settingsView();
}

async function x01Setup(){
  setGameplayActive(false);
  await loadPlayers();
  if(players.length===0){ view.innerHTML=`<div class="card"><h2>Add a player first</h2><p class="muted">Create at least one saved player before starting a match.</p><button class="btn primary" id="goPlayers">Players</button></div>`; $('#goPlayers').onclick=playerManager; return; }
  const opts=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  view.innerHTML=`<div class="section-title"><h2>New X01 game</h2></div><div class="card">
    <div class="form-grid">
      <label>Starting score<select id="startScore"><option>301</option><option selected>501</option><option>701</option></select></label>
      <label>Players<select id="playerCount"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label>
      <label>In rule<select id="inRule"><option value="straight">Straight in</option><option value="double">Double in</option></select></label>
      <label>Out rule<select id="outRule"><option value="double" selected>Double out</option><option value="straight">Straight out</option><option value="master">Master out</option></select></label>
      <label>Legs<select id="legs"><option value="1">1 leg</option><option value="3" selected>Best of 3</option><option value="5">Best of 5</option><option value="7">Best of 7</option></select></label>
      <label>Entry mode<select id="entryMode"><option value="quick" selected>Quick score</option><option value="darts">Dart by dart</option></select></label>
    </div>
    <div id="playerSelects" class="form-grid" style="margin-top:14px"></div>
    <div class="actions"><button class="btn primary big" id="startX01">Start game</button></div>
  </div>`;
  const renderSelects=()=>{const n=+$('#playerCount').value; $('#playerSelects').innerHTML=Array.from({length:n},(_,i)=>`<label>Player ${i+1}<select class="xplayer">${opts}</select></label>`).join(''); $$('.xplayer').forEach((s,i)=>s.selectedIndex=Math.min(i,players.length-1));};
  renderSelects(); $('#playerCount').onchange=renderSelects;
  $('#inRule').onchange=()=>{ if($('#inRule').value==='double'){ $('#entryMode').value='darts'; $('#entryMode').disabled=true; toast('Double-in uses dart-by-dart entry'); } else $('#entryMode').disabled=false; };
  $('#startX01').onclick=()=>{
    const ids=$$('.xplayer').map(s=>+s.value); if(new Set(ids).size!==ids.length){toast('Choose different players');return;}
    startX01({start:+$('#startScore').value, ids, doubleIn:$('#inRule').value==='double', out:$('#outRule').value, bestOf:+$('#legs').value, mode:$('#entryMode').value});
  };
}

function basePlayer(p,start){return {id:p.id,name:p.name,score:start,legs:0,in:false,totalScored:0,darts:0,first9Points:0,first9Darts:0,highestVisit:0,highestCheckout:0,attempts:0,checkouts:0,c100:0,c140:0,c180:0,visits:[],legStartScored:0,legStartDarts:0};}
function startX01(cfg){
  setGameplayActive(true);
  const selected=cfg.ids.map(id=>players.find(p=>p.id===id));
  x01={...cfg, players:selected.map(p=>basePlayer(p,cfg.start)), turn:0, visit:[], mult:1, quick:'', history:[], finished:false, legNo:1, checkoutPending:null};
  renderX01();
}

function renderX01(){
  const g=x01, active=g.players[g.turn];
  const route=getCheckout(active.score,g.out);
  const checkoutConfirm=g.checkoutPending ? `
    <div class="checkout-confirm" role="status">
      <div class="checkout-confirm-icon">🎯</div>
      <div>
        <strong>Confirm the checkout dart-by-dart</strong>
        <p>You entered <b>${g.checkoutPending.score}</b> to finish <b>${g.checkoutPending.from}</b>. Enter the actual finishing darts below, then tap <b>Confirm checkout</b>. This message will stay here until you finish or return to quick scoring.</p>
      </div>
    </div>` : '';
  view.innerHTML=`
  <div class="section-title"><h2>${g.start} · Leg ${g.legNo}</h2><span class="muted">First to ${Math.floor(g.bestOf/2)+1} legs</span></div>
  <div class="scoreboard">${g.players.map((p,i)=>playerScoreCard(p,i===g.turn,g)).join('')}</div>
  <div class="checkout">${route ? `<strong>Checkout:</strong> ${route.join(' → ')}` : `<strong>${active.score}</strong> remaining · ${setupSuggestion(active.score,g.out)}`}</div>
  <div class="card">
    ${checkoutConfirm}
    <div class="game-status">${esc(active.name)} to throw ${g.doubleIn&&!active.in?'· needs a double to get in':''}</div>
    ${g.mode==='quick'?quickInput():dartInput()}
    <div class="actions">
      <button class="btn" id="switchInput">${g.checkoutPending?'Back to quick score':g.mode==='quick'?'Dart-by-dart':'Quick score'}</button>
      <button class="btn" id="undo">Undo last visit</button>
      <button class="btn danger" id="endGame">End game</button>
    </div>
  </div>`;
  bindX01();
}
function playerScoreCard(p,active,g){
  const avg=p.darts?p.totalScored*3/p.darts:0; const f9=p.first9Darts?p.first9Points*3/p.first9Darts:0;
  return `<div class="player-score ${active?'active':''}"><div class="name">${esc(p.name)} ${active?'●':''}</div><div class="score">${p.score}</div><div class="meta"><span>AVG ${fmt(avg,1)}</span><span>F9 ${fmt(f9,1)}</span></div><div class="meta"><span>Legs ${p.legs}</span><span>High ${p.highestVisit}</span></div></div>`;
}
function quickInput(){
  return `<div class="quick-total" id="quickTotal">${x01.quick||'—'}</div><div class="keypad">${[1,2,3,4,5,6,7,8,9,'C',0,'⌫'].map(k=>`<button data-key="${k}">${k}</button>`).join('')}</div><div class="actions"><button class="btn primary big" id="submitQuick">Submit visit</button></div>`;
}
function dartInput(){
  const labels=x01.visit.map(d=>d.label).join(' ')||'No darts entered';
  return `<div class="visit-darts">${x01.visit.length?x01.visit.map(d=>`<span class="dart-chip">${d.label}</span>`).join(''):`<span class="muted">${labels}</span>`}</div>
  <div class="multis"><button data-m="1" class="${x01.mult===1?'active':''}">Single</button><button data-m="2" class="${x01.mult===2?'active':''}">Double</button><button data-m="3" class="${x01.mult===3?'active':''}">Treble</button><button data-m="0">Miss</button></div>
  <div class="dartboard">${Array.from({length:20},(_,i)=>i+1).map(n=>`<button data-seg="${n}">${n}</button>`).join('')}<button data-seg="25">Bull</button></div>
  <div class="actions"><button class="btn" id="clearDarts">Clear darts</button><button class="btn primary big" id="submitDarts">${x01.checkoutPending?'Confirm checkout':'Submit visit'}</button></div>`;
}
function bindX01(){
  $('#switchInput').onclick=()=>{
    const p=x01.players[x01.turn];
    if(x01.checkoutPending){x01.checkoutPending=null;x01.mode='quick';x01.quick='';x01.visit=[];renderX01();return;}
    if(x01.doubleIn && !p.in && x01.mode==='darts'){toast('Stay in dart-by-dart mode until this player is in');return;}
    x01.mode=x01.mode==='quick'?'darts':'quick'; x01.quick=''; x01.visit=[]; renderX01();
  };
  $('#undo').onclick=undoX01; $('#endGame').onclick=()=>{if(confirm('End this game without saving?')) route('home')};
  if(x01.mode==='quick'){
    $$('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='C')x01.quick='';else if(k==='⌫')x01.quick=x01.quick.slice(0,-1);else if(x01.quick.length<3)x01.quick+=k; $('#quickTotal').textContent=x01.quick||'—';});
    $('#submitQuick').onclick=()=>{
      const n=+x01.quick;
      if(x01.quick===''||n<0||n>180){toast('Enter a score from 0 to 180');return;}
      const p=x01.players[x01.turn];
      if(x01.out!=='straight' && n===p.score){
        x01.checkoutPending={score:n,from:p.score};
        x01.mode='darts';x01.quick='';x01.visit=[];renderX01();return;
      }
      commitVisit({score:n,darts:3,finishDarts:null,labels:[String(n)],dartObjs:null});
    };
  } else {
    $$('[data-m]').forEach(b=>b.onclick=()=>{const m=+b.dataset.m;if(m===0){addDart(0,0);return;}x01.mult=m;renderX01();});
    $$('[data-seg]').forEach(b=>b.onclick=()=>addDart(+b.dataset.seg,x01.mult));
    $('#clearDarts').onclick=()=>{x01.visit=[];renderX01();};
    $('#submitDarts').onclick=()=>{if(!x01.visit.length){toast('Enter at least one dart');return;} const score=x01.visit.reduce((a,d)=>a+d.score,0); x01.checkoutPending=null; commitVisit({score,darts:x01.visit.length,finishDarts:x01.visit.length,labels:x01.visit.map(d=>d.label),dartObjs:[...x01.visit]});};
  }
}
function addDart(seg,m){
  if(x01.visit.length>=3)return;
  let score,label,isDouble=false,isTriple=false;
  if(m===0){score=0;label='Miss';}
  else if(seg===25){ if(m===3){toast('Bull cannot be trebled');return;} score=m===2?50:25; label=m===2?'Bull':'25'; isDouble=m===2; }
  else {score=seg*m;label=m===1?String(seg):m===2?'D'+seg:'T'+seg; isDouble=m===2; isTriple=m===3;}
  x01.visit.push({seg,m,score,label,isDouble,isTriple}); renderX01();
}
function snapshot(){return JSON.stringify({players:x01.players,turn:x01.turn,legNo:x01.legNo});}
function undoX01(){if(!x01.history.length){toast('Nothing to undo');return;}const s=JSON.parse(x01.history.pop());x01.players=s.players;x01.turn=s.turn;x01.legNo=s.legNo;x01.quick='';x01.visit=[];x01.checkoutPending=null;renderX01();}

function commitVisit(v){
  const g=x01, p=g.players[g.turn], before=p.score; g.history.push(snapshot());
  let scored=v.score, effectiveDarts=v.darts, gotIn=!g.doubleIn||p.in, dartObjs=v.dartObjs;
  if(g.doubleIn && !p.in){
    if(!dartObjs){toast('Double-in requires dart-by-dart entry');g.history.pop();return;}
    const idx=dartObjs.findIndex(d=>d.isDouble);
    if(idx<0){scored=0; gotIn=false;} else {scored=dartObjs.slice(idx).reduce((a,d)=>a+d.score,0); gotIn=true; p.in=true;}
  }
  const remaining=before-scored;
  let bust=false, finish=false, checkoutValue=0;
  if(gotIn){
    if(remaining<0) bust=true;
    if(g.out==='double' && remaining===1) bust=true;
    if(remaining===0){
      if(g.out==='straight') finish=true;
      else if(!dartObjs){
        g.history.pop(); g.checkoutPending={score:v.score,from:before}; g.mode='darts'; g.quick=''; g.visit=[]; renderX01(); return;
      }
      else {
        const last=dartObjs[dartObjs.length-1];
        finish = g.out==='double' ? last.isDouble : (last.isDouble||last.isTriple);
        if(!finish) bust=true;
      }
    }
  }
  const wasCheckoutRange = before<=170 && !!getCheckout(before,g.out);
  if(wasCheckoutRange) p.attempts++;
  if(bust){scored=0; p.score=before; toast('Bust');}
  else {p.score=remaining;}
  p.totalScored += scored; p.darts += effectiveDarts;
  const f9room=Math.max(0,9-p.first9Darts), f9d=Math.min(f9room,effectiveDarts); if(f9d>0){const ratio=effectiveDarts?scored/effectiveDarts:0;p.first9Points+=ratio*f9d;p.first9Darts+=f9d;}
  p.highestVisit=Math.max(p.highestVisit,scored); if(scored===180)p.c180++; if(scored>=140)p.c140++; if(scored>=100)p.c100++;
  p.visits.push(scored);
  if(finish){checkoutValue=before;p.checkouts++;p.highestCheckout=Math.max(p.highestCheckout,checkoutValue);p.legs++; toast(`${p.name} wins the leg!`,2400); const needed=Math.floor(g.bestOf/2)+1; if(p.legs>=needed){finishMatch(p);return;} startNextLeg();return;}
  g.turn=(g.turn+1)%g.players.length; g.quick=''; g.visit=[]; g.checkoutPending=null; renderX01();
}
function startNextLeg(){const g=x01;g.legNo++;g.turn=(g.legNo-1)%g.players.length;g.players.forEach(p=>{p.score=g.start;p.in=false;p.first9Points=0;p.first9Darts=0;});g.quick='';g.visit=[];g.checkoutPending=null;renderX01();}
async function finishMatch(winner){
  setGameplayActive(false);
  const g=x01; g.finished=true;
  const payload={game_type:'x01',start_score:g.start,winner_player_id:winner.id,settings_json:JSON.stringify({doubleIn:g.doubleIn,out:g.out,bestOf:g.bestOf}),players:g.players.map((p,i)=>({player_id:p.id,finishing_position:p.id===winner.id?1:2,darts_thrown:p.darts,points_scored:p.totalScored,three_dart_average:p.darts?p.totalScored*3/p.darts:0,first_nine_average:0,highest_visit:p.highestVisit,highest_checkout:p.highestCheckout,checkout_attempts:p.attempts,checkouts:p.checkouts,scores_100_plus:p.c100,scores_140_plus:p.c140,scores_180:p.c180,legs_won:p.legs}))};
  try{await api('/api/matches',{method:'POST',body:JSON.stringify(payload)});}catch(e){toast('Could not save match: '+e.message,3000)}
  view.innerHTML=`<div class="card"><div class="target-big">🏆</div><h2 style="text-align:center">${esc(winner.name)} wins ${winner.legs}–${Math.max(...g.players.filter(p=>p.id!==winner.id).map(p=>p.legs),0)}</h2><div class="table-wrap"><table><thead><tr><th>Player</th><th>Avg</th><th>High Visit</th><th>High CO</th><th>180s</th><th>CO%</th></tr></thead><tbody>${g.players.map(p=>`<tr><td>${esc(p.name)}</td><td>${fmt(p.darts?p.totalScored*3/p.darts:0,1)}</td><td>${p.highestVisit}</td><td>${p.highestCheckout}</td><td>${p.c180}</td><td>${p.attempts?fmt(p.checkouts/p.attempts*100,0)+'%':'—'}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn primary" id="again">Play again</button><button class="btn" id="home">Home</button></div></div>`;
  $('#again').onclick=()=>x01Setup(); $('#home').onclick=home;
}

const dartsForCheckout = (()=>{
  const a=[]; for(let n=1;n<=20;n++){a.push({score:n,label:String(n),kind:'S'});a.push({score:n*2,label:'D'+n,kind:'D'});a.push({score:n*3,label:'T'+n,kind:'T'});} a.push({score:25,label:'25',kind:'S'});a.push({score:50,label:'Bull',kind:'D'});return a;
})();
function finalAllowed(d,out){return out==='straight'||(out==='double'&&d.kind==='D')||(out==='master'&&(d.kind==='D'||d.kind==='T'));}
function rankDart(d){let r=d.score; if(d.label==='T20')r+=100;if(d.label==='T19')r+=80;if(d.label==='T18')r+=60;if(d.label==='Bull')r+=50; if(d.kind==='S')r-=20; return r;}
const dartsByScore = (()=>{
  const m=new Map();
  for(const d of dartsForCheckout){if(!m.has(d.score))m.set(d.score,[]);m.get(d.score).push(d);}
  for(const list of m.values())list.sort((a,b)=>rankDart(b)-rankDart(a));
  return m;
})();
function bestSolution(solutions){
  if(!solutions.length)return null;
  const prefDouble=['D20','D16','D18','D12','D10','D8','D4','Bull'];
  solutions.sort((x,y)=>{
    const fx=prefDouble.indexOf(x[x.length-1].label), fy=prefDouble.indexOf(y[y.length-1].label);
    const ax=(fx<0?99:fx), ay=(fy<0?99:fy); if(ax!==ay)return ax-ay;
    return y.reduce((s,d)=>s+rankDart(d),0)-x.reduce((s,d)=>s+rankDart(d),0);
  });
  return solutions[0];
}
function getCheckout(score,out='double'){
  if(score<=0||score>180)return null;
  const arr=[...dartsForCheckout].sort((a,b)=>rankDart(b)-rankDart(a));
  const solutions=[];
  for(const c of (dartsByScore.get(score)||[])) if(finalAllowed(c,out)) solutions.push([c]);
  for(const a of arr){
    const need=score-a.score;
    for(const b of (dartsByScore.get(need)||[])) if(finalAllowed(b,out)) solutions.push([a,b]);
  }
  for(const a of arr) for(const b of arr){
    const need=score-a.score-b.score;
    if(need<=0) continue;
    for(const c of (dartsByScore.get(need)||[])) if(finalAllowed(c,out)) solutions.push([a,b,c]);
  }
  const best=bestSolution(solutions);
  return best?best.map(d=>d.label):null;
}
function setupSuggestion(score,out){
  if(score<=170)return 'No checkout available';
  const preferred=[40,32,36,24,16,20,12,8];
  const arr=[...dartsForCheckout].sort((a,b)=>rankDart(b)-rankDart(a));
  let best=null;
  for(const leave of preferred){
    const need=score-leave; if(need<0||need>180) continue;
    for(const a of arr) for(const b of arr){
      const cNeed=need-a.score-b.score; const c=(dartsByScore.get(cNeed)||[])[0];
      if(!c) continue;
      const val=rankDart(a)+rankDart(b)+rankDart(c);
      if(!best||val>best.val)best={route:[a.label,b.label,c.label],leave,val};
    }
  }
  return best?`Setup: ${best.route.join(' → ')} · leaves ${best.leave}`:'Build a finish and avoid bogey numbers';
}

function partyMenu(){
  setGameplayActive(false);
  const games=[['🏏','Cricket','Close 15–20 + Bull, with scoring.','cricket'],['👑','Killer','Earn killer status, then take opponents’ lives.','killer'],['🌏','Shanghai','Seven rounds; S+D+T wins instantly.','shanghai'],['✂️','Halve-It','Miss the target and your score is halved.','halveit'],['⏰','Around the Clock','Race from 1 through 20.','around'],['💯','Count-Up','Highest total after the chosen rounds wins.','countup']];
  view.innerHTML=`<div class="section-title"><h2>Party games</h2></div><div class="grid">${games.map(g=>`<button class="card click" data-party="${g[3]}" style="text-align:left;color:inherit"><div class="emoji">${g[0]}</div><h2>${g[1]}</h2><p class="muted">${g[2]}</p></button>`).join('')}</div>`;
  $$('[data-party]').forEach(b=>b.onclick=()=>partySetup(b.dataset.party));
}
async function partySetup(type){
  setGameplayActive(false);
  await loadPlayers(); if(players.length<1){route('players');return;}
  const opts=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  view.innerHTML=`<div class="section-title"><h2>${partyName(type)}</h2></div><div class="card"><div class="form-grid"><label>Players<select id="pc"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label>Rounds / lives<input id="rounds" type="number" min="1" max="20" value="${type==='killer'?3:type==='countup'?8:type==='shanghai'?7:7}"></label></div><div id="ps" class="form-grid" style="margin-top:12px"></div><div class="actions"><button class="btn primary big" id="startParty">Start</button></div></div>`;
  const rs=()=>{$('#ps').innerHTML=Array.from({length:+$('#pc').value},(_,i)=>`<label>Player ${i+1}<select class="pp">${opts}</select></label>`).join('');$$('.pp').forEach((s,i)=>s.selectedIndex=Math.min(i,players.length-1));};rs();$('#pc').onchange=rs;
  $('#startParty').onclick=()=>{const ids=$$('.pp').map(s=>+s.value);if(new Set(ids).size!==ids.length){toast('Choose different players');return;} startParty(type,ids,+$('#rounds').value);};
}
function partyName(t){return ({cricket:'Cricket',killer:'Killer',shanghai:'Shanghai',halveit:'Halve-It',around:'Around the Clock',countup:'Count-Up'})[t]}
function startParty(type,ids,rounds){
  setGameplayActive(true);
  const ps=ids.map(id=>players.find(p=>p.id===id));
  party={type,rounds,turn:0,round:1,players:ps.map((p,i)=>({id:p.id,name:p.name,score:0,target:1,lives:rounds,killer:false,number:i+1,marks:{15:0,16:0,17:0,18:0,19:0,20:0,25:0}})),darts:0,finished:false};
  if(type==='killer'){party.players.forEach((p,i)=>p.number=[1,3,5,7,9,11,13,15,17,19][i]);}
  renderParty();
}
function renderParty(){
  const g=party,p=g.players[g.turn];
  if(g.type==='cricket')return renderCricket();
  const info={killer:`${p.killer?'KILLER · choose opponent':'Hit your own number '+p.number}`,shanghai:`Round ${g.round} · target ${g.round}`,halveit:`Round ${g.round} · ${halveTarget(g.round)}`,around:`Target ${p.target}`,countup:`Round ${g.round} of ${g.rounds}`}[g.type];
  view.innerHTML=`<div class="section-title"><h2>${partyName(g.type)}</h2><span class="muted">${info}</span></div><div class="scoreboard">${g.players.map((x,i)=>`<div class="player-score ${i===g.turn?'active':''}"><div class="name">${esc(x.name)}</div><div class="score">${g.type==='around'?x.target:g.type==='killer'?x.lives:x.score}</div><div class="meta"><span>${g.type==='killer'?(x.killer?'Killer':'Number '+x.number):g.type==='around'?'next target':'score'}</span></div></div>`).join('')}</div><div class="card">${partyControls(g,p)}</div>`;
  bindParty();
}
function partyControls(g,p){
  if(g.type==='countup')return visitNumberControl('Enter visit score (0–180)');
  if(g.type==='around')return `<div class="target-big">${p.target>20?'🏁':p.target}</div><p class="muted" style="text-align:center">How many targets did you hit in sequence this turn?</p><div class="actions">${[0,1,2,3].map(n=>`<button class="btn ${n?'primary':''}" data-around="${n}">${n}</button>`).join('')}</div>`;
  if(g.type==='shanghai')return `<p class="muted" style="text-align:center">Enter the points scored on ${g.round}, then mark which beds you hit.</p>${visitNumberControl('Round score')}<div class="segment-row"><label><input type="checkbox" id="shS"> Single</label><label><input type="checkbox" id="shD"> Double</label><label><input type="checkbox" id="shT"> Treble</label></div>`;
  if(g.type==='halveit')return `<p class="muted" style="text-align:center">Target: <strong>${halveTarget(g.round)}</strong>. Enter points scored on that target only. Zero halves your total.</p>${visitNumberControl('Points on target')}`;
  if(g.type==='killer'){
    if(!p.killer)return `<div class="target-big">${p.number}</div><p class="muted" style="text-align:center">Enter marks on your own number this turn (single=1, double=2, treble=3).</p><div class="actions">${[0,1,2,3].map(n=>`<button class="btn ${n?'primary':''}" data-killermarks="${n}">${n}</button>`).join('')}</div>`;
    const opp=g.players.filter((_,i)=>i!==g.turn && _.lives>0);return `<label>Opponent<select id="opp">${opp.map(o=>`<option value="${o.id}">${esc(o.name)} · ${o.lives} lives</option>`).join('')}</select></label><p class="muted">Marks landed on their number:</p><div class="actions">${[0,1,2,3].map(n=>`<button class="btn ${n?'primary':''}" data-attack="${n}">${n}</button>`).join('')}</div>`;
  }
}
function visitNumberControl(ph){return `<label>${ph}<input id="partyScore" type="number" min="0" max="180" value="0"></label><div class="actions"><button class="btn primary big" id="partySubmit">Submit</button></div>`}
function halveTarget(r){return ['20','16','D7','14','T10','17','Bull'][r-1]||'Bull'}
function bindParty(){
  const g=party,p=g.players[g.turn];
  if($('#partySubmit'))$('#partySubmit').onclick=()=>{const n=+$('#partyScore').value||0;if(g.type==='countup'){p.score+=n;nextPartyTurn();}else if(g.type==='shanghai'){p.score+=n;if($('#shS').checked&&$('#shD').checked&&$('#shT').checked){partyWinner(p,'Shanghai!');return;}nextPartyTurn();}else if(g.type==='halveit'){p.score=n===0?Math.floor(p.score/2):p.score+n;nextPartyTurn();}};
  $$('[data-around]').forEach(b=>b.onclick=()=>{p.target+=+b.dataset.around;if(p.target>20){partyWinner(p);return;}nextPartyTurn(false);});
  $$('[data-killermarks]').forEach(b=>b.onclick=()=>{if(+b.dataset.killermarks>=3){p.killer=true;toast(`${p.name} is now a Killer!`);}nextPartyTurn(false);});
  $$('[data-attack]').forEach(b=>b.onclick=()=>{const opp=g.players.find(x=>x.id===+$('#opp').value);opp.lives=Math.max(0,opp.lives-+b.dataset.attack);const alive=g.players.filter(x=>x.lives>0);if(alive.length===1){partyWinner(alive[0]);return;}nextPartyTurn(false);});
}
function nextPartyTurn(roundBased=true){const g=party;g.turn++;if(g.turn>=g.players.length){g.turn=0;if(roundBased)g.round++;}if(roundBased&&g.round>g.rounds){const max=Math.max(...g.players.map(p=>p.score));partyWinner(g.players.find(p=>p.score===max));return;}renderParty();}
function partyWinner(p,extra=''){setGameplayActive(false);view.innerHTML=`<div class="card"><div class="target-big">🏆</div><h2 style="text-align:center">${esc(p.name)} wins!</h2><p class="muted" style="text-align:center">${extra}</p><div class="actions"><button class="btn primary" id="againP">Play again</button><button class="btn" id="homeP">Home</button></div></div>`;$('#againP').onclick=()=>partySetup(party.type);$('#homeP').onclick=home;}

function renderCricket(){
  const g=party,p=g.players[g.turn], segs=[20,19,18,17,16,15,25];
  view.innerHTML=`<div class="section-title"><h2>Cricket</h2><span class="muted">${esc(p.name)} · dart ${g.darts+1}/3</span></div><div class="card table-wrap"><table><thead><tr><th>Player</th>${segs.map(s=>`<th>${s===25?'Bull':s}</th>`).join('')}<th>Pts</th></tr></thead><tbody>${g.players.map((x,i)=>`<tr><td><strong>${esc(x.name)}${i===g.turn?' ●':''}</strong></td>${segs.map(s=>`<td>${cricketMarks(x.marks[s])}</td>`).join('')}<td>${x.score}</td></tr>`).join('')}</tbody></table></div><div class="card"><p class="muted" style="text-align:center">Tap the bed hit. Double/treble adds 2/3 marks. Extra marks score only while an opponent still has that number open.</p><div class="multis"><button data-cm="1" class="${g.mult===1||!g.mult?'active':''}">Single</button><button data-cm="2">Double</button><button data-cm="3">Treble</button><button data-cmiss="1">Miss</button></div><div class="segment-row">${segs.map(s=>`<button data-cseg="${s}">${s===25?'Bull':s}</button>`).join('')}</div></div>`;
  g.mult=g.mult||1;
  $$('[data-cm]').forEach(b=>b.onclick=()=>{g.mult=+b.dataset.cm;renderCricket();});
  $('[data-cmiss]').onclick=()=>cricketDart(null,0);
  $$('[data-cseg]').forEach(b=>b.onclick=()=>cricketDart(+b.dataset.cseg,g.mult));
}
function cricketMarks(n){return n>=3?'●':n===2?'◉':n===1?'◐':'—'}
function cricketDart(seg,m){
  const g=party,p=g.players[g.turn];
  if(seg){const before=p.marks[seg], after=before+m, extra=Math.max(0,after-3);p.marks[seg]=Math.min(3,after);const opponentOpen=g.players.some((x,i)=>i!==g.turn&&x.marks[seg]<3);if(extra&&opponentOpen)p.score+=extra*(seg===25?25:seg);}
  g.darts++;
  const closed=Object.values(p.marks).every(v=>v>=3); if(closed){const maxOpp=Math.max(...g.players.filter((_,i)=>i!==g.turn).map(x=>x.score));if(p.score>=maxOpp){partyWinner(p);return;}}
  if(g.darts>=3){g.darts=0;g.turn=(g.turn+1)%g.players.length;} renderCricket();
}

function practiceMenu(){
  setGameplayActive(false);
  const modes=[['🎯','Checkout Trainer','Random finishes with route advice.','checkout'],['🔢','121','Finish each target within 9 darts.','121'],['🎯','Bob’s 27','Work through every double.','bobs27'],['⭕','Doubles Around Board','Track hits from D1 to Bull.','doubles'],['🔥','Scoring Trainer','Fixed visits for maximum scoring.','scoring']];
  view.innerHTML=`<div class="section-title"><h2>Training</h2><span class="muted">Focused practice games</span></div><div class="grid">${modes.map(m=>`<button class="card click" data-practice="${m[3]}" style="text-align:left;color:inherit"><div class="emoji">${m[0]}</div><h2>${m[1]}</h2><p class="muted">${m[2]}</p></button>`).join('')}</div>`;
  $$('[data-practice]').forEach(b=>b.onclick=()=>practiceSetup(b.dataset.practice));
}
async function practiceSetup(mode){
  setGameplayActive(false);
  await loadPlayers(); if(!players.length){route('players');return;}
  view.innerHTML=`<div class="section-title"><h2>${practiceName(mode)}</h2></div><div class="card"><div class="form-grid"><label>Player<select id="pracPlayer">${players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div><div class="actions"><button class="btn primary big" id="startPractice">Start</button></div></div>`;
  $('#startPractice').onclick=()=>startPractice(mode,+$('#pracPlayer').value);
}
function practiceName(m){return ({checkout:'Checkout Trainer','121':'121',bobs27:"Bob's 27",doubles:'Doubles Around Board',scoring:'Scoring Trainer'})[m]}
function startPractice(mode,playerId){
  setGameplayActive(true);
  const p=players.find(x=>x.id===playerId);
  practice={mode,player:p,round:1,score:mode==='bobs27'?27:0,target:mode==='121'?121:mode==='checkout'?randomCheckout():mode==='doubles'?1:20,hits:0,attempts:0,visits:0,total:0,targetVisit:1};renderPractice();
}
function randomCheckout(){const choices=[];for(let n=40;n<=170;n++)if(getCheckout(n,'double'))choices.push(n);return choices[Math.floor(Math.random()*choices.length)];}
function renderPractice(){
  const g=practice;
  if(g.mode==='checkout'){
    view.innerHTML=`<div class="section-title"><h2>${practiceName(g.mode)}</h2><span class="muted">Round ${g.round}</span></div><div class="card"><div class="target-big">${g.target}</div><div class="checkout"><strong>Route:</strong> ${(getCheckout(g.target,'double')||['No route']).join(' → ')}</div><p class="muted" style="text-align:center">Did you finish it within 3 darts?</p><div class="actions"><button class="btn primary big" data-pr="hit">Checkout ✓</button><button class="btn big" data-pr="miss">Miss</button></div><p class="game-status">${g.hits} checkouts from ${g.attempts} attempts</p></div>`;
    $$('[data-pr]').forEach(b=>b.onclick=()=>{g.attempts++;if(b.dataset.pr==='hit'){g.hits++;}g.target=randomCheckout();g.round++;renderPractice();});
  } else if(g.mode==='121'){
    const dartsLeft=(4-g.targetVisit)*3;
    const openingRoute=(getCheckout(g.target,'double')||['No opening checkout route']).join(' → ');
    const finalVisit=g.targetVisit===3;
    view.innerHTML=`<div class="section-title"><h2>121</h2><span class="muted">Target attempt ${g.round}</span></div><div class="card"><div class="target-big">${g.target}</div><div class="practice-progress"><strong>Visit ${g.targetVisit} of 3</strong><span>${dartsLeft} darts remaining</span></div><div class="checkout"><strong>${g.targetVisit===1?'Opening route':'Starting target route'}:</strong> ${openingRoute}</div><p class="muted" style="text-align:center">${finalVisit?'Last 3 darts to finish '+g.target+'.':'Throw your next 3 darts. If you finish the target, record the checkout.'}</p><div class="actions"><button class="btn primary big" data-121="hit">Checkout ✓</button><button class="btn big" data-121="miss">${finalVisit?'Failed after 9 darts':'No checkout · next 3 darts'}</button></div><p class="game-status">${g.hits} successful checkouts from ${g.attempts} completed 9-dart attempts</p></div>`;
    $$('[data-121]').forEach(b=>b.onclick=()=>{
      if(b.dataset['121']==='hit'){
        g.hits++;g.attempts++;g.target++;g.round++;g.targetVisit=1;toast(`Checked out ${g.target-1} — next target ${g.target}`,2200);renderPractice();return;
      }
      if(g.targetVisit<3){g.targetVisit++;renderPractice();return;}
      g.attempts++;g.round++;g.targetVisit=1;toast(`${g.target} not finished in 9 darts — try it again`,2400);renderPractice();
    });
  } else if(g.mode==='bobs27'||g.mode==='doubles'){
    const num=g.target, value=num===21?25:num;
    view.innerHTML=`<div class="section-title"><h2>${practiceName(g.mode)}</h2><span class="muted">${g.mode==='bobs27'?'Score '+g.score:`Hits ${g.hits}`}</span></div><div class="card"><div class="target-big">${num===21?'Bull':'D'+num}</div><p class="muted" style="text-align:center">How many of your three darts hit?</p><div class="actions">${[0,1,2,3].map(n=>`<button class="btn ${n?'primary':''}" data-dhits="${n}">${n}</button>`).join('')}</div></div>`;
    $$('[data-dhits]').forEach(b=>b.onclick=()=>{const h=+b.dataset.dhits;g.hits+=h;g.attempts+=3;if(g.mode==='bobs27'){g.score+=h?value*2*h:-(value*2);}g.target++;if(g.target>21){finishPractice();return;}renderPractice();});
  } else if(g.mode==='scoring'){
    view.innerHTML=`<div class="section-title"><h2>Scoring Trainer</h2><span class="muted">Visit ${g.visits+1}/20</span></div><div class="card"><div class="target-big">${g.total}</div><label>Visit score<input id="scoreVisit" type="number" min="0" max="180" value="60"></label><div class="actions"><button class="btn primary big" id="scoreSubmit">Submit</button></div><p class="game-status">Average: ${fmt(g.visits?g.total*3/(g.visits*3):0,1)}</p></div>`;
    $('#scoreSubmit').onclick=()=>{g.total+=Math.max(0,Math.min(180,+$('#scoreVisit').value||0));g.visits++;if(g.visits>=20){finishPractice();return;}renderPractice();};
  }
}
async function finishPractice(){
  setGameplayActive(false);
  const g=practice; let score=0,detail={};
  if(g.mode==='bobs27'){score=g.score;detail={hits:g.hits,darts:g.attempts};}
  if(g.mode==='doubles'){score=g.attempts?g.hits/g.attempts*100:0;detail={hits:g.hits,darts:g.attempts};}
  if(g.mode==='scoring'){score=g.total/20;detail={total:g.total,visits:g.visits};}
  try{await api('/api/practice',{method:'POST',body:JSON.stringify({player_id:g.player.id,mode:g.mode,score,details_json:JSON.stringify(detail)})});}catch(e){}
  view.innerHTML=`<div class="card"><div class="target-big">✓</div><h2 style="text-align:center">Session complete</h2><p style="text-align:center" class="muted">${g.mode==='bobs27'?`Final score: ${g.score}`:g.mode==='doubles'?`Double hit rate: ${fmt(score,1)}%`:`Average visit: ${fmt(score,1)}`}</p><div class="actions"><button class="btn primary" id="pracAgain">Again</button><button class="btn" id="pracHome">Home</button></div></div>`;
  $('#pracAgain').onclick=()=>practiceSetup(g.mode);$('#pracHome').onclick=home;
}

async function route(name){
  view.dataset.page=name;
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    if(name==='home') return home();
    if(name==='players') return await playerManager();
    if(name==='stats') return await statsView();
    if(name==='settings') return await settingsView();
    if(name==='x01-setup') return await x01Setup();
    if(name==='party-menu') return partyMenu();
    if(name==='practice-menu') return practiceMenu();
    return home();
  }catch(err){
    console.error('DartDeck route error', name, err);
    view.innerHTML=`<div class="card"><h2>Could not open ${esc(name)}</h2><p class="muted">${esc(err?.message||'Unexpected error')}</p><button class="btn primary" id="routeHome">Back home</button></div>`;
    $('#routeHome').onclick=()=>route('home');
  }
}
// Delegated navigation survives page re-renders and avoids stale per-button handlers.
document.addEventListener('click', event=>{
  const button=event.target.closest('[data-nav]');
  if(button){ event.preventDefault(); route(button.dataset.nav); }
});
$('#installApp').onclick=installPwa;
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/service-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{serviceWorkerReady=true;if(view.dataset.page==='settings')settingsView();}).catch(()=>{});
}
Promise.all([loadSettings(),loadPlayers()]).finally(()=>{
  updateInstallButton();
  const go=new URLSearchParams(location.search).get('go');
  route(go||'home');
});
