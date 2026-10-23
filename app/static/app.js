const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const view = $('#view');
const toastEl = $('#toast');

let players = [];
let x01 = null;
let party = null;
let practice = null;

let appSettings = {
  theme_id:'midnight', primary_color:'#9bc56a', accent_color:'#c4df9a', background_color:'#0d0f10',
  panel_color:'#171a1c', text_color:'#f4f6f1', muted_color:'#aeb5ad',
  font:'modern', keep_awake:true, dartboard_mode:true, has_custom_favicon:false
};
let deferredInstallPrompt = null;
let wakeLock = null;
let gameplayActive = false;
let serviceWorkerReady = false;
const APP_VERSION = '0.8.0 · Local-first Docker';
const IS_NATIVE_MOBILE = false;
const USE_LOCAL_STORE = !!window.DartDeckLocalStore;
const MOBILE_UX = IS_NATIVE_MOBILE || USE_LOCAL_STORE;
const THEME_PRESETS = {
  midnight:{label:'Midnight',bg:'#0d0f10',panel:'#171a1c',text:'#f4f6f1',muted:'#aeb5ad',dark:true},
  carbon:{label:'Carbon',bg:'#111214',panel:'#202226',text:'#f5f5f2',muted:'#aaaeb3',dark:true},
  board:{label:'Board Green',bg:'#0d1713',panel:'#16251e',text:'#f1f5ef',muted:'#a7b6ad',dark:true},
  navy:{label:'Night Blue',bg:'#0d1320',panel:'#182235',text:'#f4f7fb',muted:'#a9b5c8',dark:true},
  light:{label:'Oche Light',bg:'#f3f4ef',panel:'#ffffff',text:'#172019',muted:'#667068',dark:false}
};
const ACCENT_OPTIONS=['#9bc56a','#e05e5e','#f0b85a','#5aa9e6','#8f7ae5','#d66bb1'];
function adjustHex(hex,amount){
  const n=parseInt(String(hex).replace('#',''),16);if(!Number.isFinite(n))return hex;
  const c=[(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v+(amount>=0?(255-v)*amount:v*amount)))));
  return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
}
function accentContrast(hex){
  const n=parseInt(String(hex).replace('#',''),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return ((r*299+g*587+b*114)/1000)>150?'#101411':'#ffffff';
}
function resolveMobileTheme(settings){
  const preset=THEME_PRESETS[settings.theme_id]||THEME_PRESETS.midnight;
  const accent=settings.primary_color||'#9bc56a';
  return {...settings,theme_id:settings.theme_id||'midnight',primary_color:accent,accent_color:adjustHex(accent,preset.dark ? .28 : -.20),background_color:preset.bg,panel_color:preset.panel,text_color:preset.text,muted_color:preset.muted,dartboard_mode:true};
}
const BOT_LEVELS = {
  beginner:{label:'Beginner',avg:30,checkout:.08},
  pub:{label:'Pub player',avg:45,checkout:.13},
  club:{label:'Club player',avg:55,checkout:.19},
  good:{label:'Good club player',avg:65,checkout:.27},
  advanced:{label:'Advanced',avg:75,checkout:.35},
  excellent:{label:'Excellent',avg:85,checkout:.44},
  pro:{label:'Pro',avg:95,checkout:.54}
};
let botTimer=null;

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
  if(MOBILE_UX) appSettings=resolveMobileTheme(appSettings);
  const r=document.documentElement.style;
  r.setProperty('--accent',appSettings.primary_color);
  r.setProperty('--accent-2',appSettings.accent_color);
  r.setProperty('--accent-contrast',accentContrast(appSettings.primary_color));
  r.setProperty('--bg',appSettings.background_color);
  r.setProperty('--panel',appSettings.panel_color);
  r.setProperty('--text',appSettings.text_color);
  r.setProperty('--muted',appSettings.muted_color);
  r.setProperty('--font-family',FONT_STACKS[appSettings.font]||FONT_STACKS.modern);
  const meta=$('meta[name="theme-color"]'); if(meta)meta.setAttribute('content',appSettings.background_color);
  document.body.classList.toggle('dartboard-enabled',MOBILE_UX||!!appSettings.dartboard_mode);
}
async function loadSettings(){
  try{applySettings(await api('/api/settings'));}catch(e){applySettings(appSettings);}
}
function refreshBrandIcon(){
  const stamp=Date.now();
  const base=MOBILE_UX?'/static/icons':'/branding';
  $$('.brand-icon').forEach(i=>i.src=`${base}/icon-64.png?v=${stamp}`);
  const icon=$('link[rel="icon"]'); if(icon)icon.href=`${base}/icon-64.png?v=${stamp}`;
  const apple=$('link[rel="apple-touch-icon"]'); if(apple)apple.href=`${base}/icon-180.png?v=${stamp}`;
}
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; }
function updateInstallButton(){
  const b=$('#installApp'); if(!b)return;
  b.classList.toggle('hidden', !deferredInstallPrompt || isStandalone());
}
async function installPwa(){
  if(IS_NATIVE_MOBILE){toast('DartDeck is installed as a native app');return;}
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
}
async function syncWakeLock(){
  const should=gameplayActive && appSettings.keep_awake && document.visibilityState==='visible';
  if(!should){await releaseWakeLock();return;}
  if(!window.isSecureContext || !('wakeLock' in navigator)) return;
  if(wakeLock)return;
  try{
    wakeLock=await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release',()=>{wakeLock=null;});
  }catch(e){wakeLock=null;}
}
function setGameplayActive(active){ gameplayActive=!!active; document.body.classList.toggle('gameplay-active',gameplayActive);if(MOBILE_UX)document.body.classList.toggle('dartboard-enabled',true);if(!gameplayActive){document.body.classList.remove('x01-gameplay');if(botTimer){clearTimeout(botTimer);botTimer=null;}if(x01)x01.botReveal=null;}syncWakeLock(); }
document.addEventListener('visibilitychange',()=>syncWakeLock());


const api = async (url, options={}) => {
  if(USE_LOCAL_STORE) return window.DartDeckLocalStore.request(url, options);
  if(IS_NATIVE_MOBILE) return window.DartDeckMobileStore.request(url, options);
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

const LAST_GAME_PLAYERS_KEY='dartdeck-last-game-players';
const LAST_TRAINING_PLAYER_KEY='dartdeck-last-training-player';
function storedIds(key){
  try{
    const raw=JSON.parse(localStorage.getItem(key)||'[]');
    const ids=(Array.isArray(raw)?raw:[raw]).map(Number).filter(Number.isFinite);
    const valid=new Set(players.map(p=>p.id));
    return ids.filter((id,i)=>valid.has(id)&&ids.indexOf(id)===i);
  }catch(e){return [];}
}
function rememberGamePlayers(ids){
  try{localStorage.setItem(LAST_GAME_PLAYERS_KEY,JSON.stringify(ids.map(Number)));}catch(e){}
}
function rememberTrainingPlayer(id){
  try{localStorage.setItem(LAST_TRAINING_PLAYER_KEY,JSON.stringify([Number(id)]));}catch(e){}
}
function lastGamePlayerIds(){return storedIds(LAST_GAME_PLAYERS_KEY);}
function lastTrainingPlayerId(){return storedIds(LAST_TRAINING_PLAYER_KEY)[0]||lastGamePlayerIds()[0]||players[0]?.id||null;}
function preferredPlayerIds(count,current=[]){
  const valid=new Set(players.map(p=>p.id));
  const combined=[...current,...lastGamePlayerIds(),...players.map(p=>p.id)].map(Number);
  return combined.filter((id,i)=>valid.has(id)&&combined.indexOf(id)===i).slice(0,count);
}

function home(){
  setGameplayActive(false);
  view.innerHTML = `
    <div class="grid">
      ${homeCard('🎯','Quick Game','301, 501 or 701 for up to four players.','x01-setup')}
      ${homeCard('👥','Party Games','Cricket, Killer, Shanghai and Halve-It.','party-menu')}
      ${homeCard('🏋️','Training Centre','Checkout, doubles, 121 and Bob’s 27 practice.','practice-menu')}
      ${homeCard('📊','Stats','Leaderboards, badges, averages, 180s and checkout data.','stats')}
    </div>
    <div class="section-title"><h2>Designed for the oche</h2></div>
    <div class="card"><p class="muted">Large touch targets, fast score entry, undo support, checkout routes and installable PWA support. Your players, match history and training data are stored locally on this device.</p></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>route(b.dataset.go));
}
function homeCard(e,t,d,go){return `<button class="card click" data-go="${go}" style="text-align:left;color:inherit"><div class="emoji">${e}</div><h2>${t}</h2><p class="muted">${d}</p></button>`}

async function playerManager(){
  setGameplayActive(false);
  await loadPlayers();
  view.innerHTML = `<div class="section-title"><h2>Players</h2><span class="muted">Tap a player to open their dashboard</span></div>
  <div class="card"><div class="form-grid"><label>New player<input id="newPlayer" maxlength="40" placeholder="Player name"></label></div><div class="actions" style="justify-content:flex-start"><button class="btn primary" id="addPlayer">Add player</button></div></div>
  <div class="player-directory">${players.map(p=>`<div class="card player-directory-card" data-player-dashboard="${p.id}" tabindex="0"><div class="player-avatar">${esc(p.name).slice(0,1).toUpperCase()}</div><div class="player-directory-copy"><strong>${esc(p.name)}</strong><div class="muted">Stats, badges, Training Centre & recent games</div></div><button class="btn danger player-delete" data-del="${p.id}" title="Delete player">×</button></div>`).join('') || '<div class="card"><span class="muted">No players yet.</span></div>'}</div>`;
  $('#addPlayer').onclick=async()=>{const name=$('#newPlayer').value.trim();if(!name)return;try{await api('/api/players',{method:'POST',body:JSON.stringify({name})});await playerManager();toast('Player added');}catch(e){toast(e.message,2500)}};
  $$('[data-player-dashboard]').forEach(c=>{c.onclick=e=>{if(e.target.closest('[data-del]'))return;playerDashboard(+c.dataset.playerDashboard)};c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();playerDashboard(+c.dataset.playerDashboard);}};});
  $$('[data-del]').forEach(b=>b.onclick=async e=>{e.stopPropagation();try{await api('/api/players/'+b.dataset.del,{method:'DELETE'});await playerManager()}catch(err){toast(err.message,2500)}});
}
function shortDate(value){try{return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'2-digit'});}catch(e){return value||''}}
function gameLabel(t){return ({x01:'X01',cricket:'Cricket',killer:'Killer',shanghai:'Shanghai',halveit:'Halve-It'})[t]||t;}
function metricCard(icon,label,value,sub=''){return `<div class="card metric-card"><span>${icon}</span><strong>${value}</strong><small>${label}</small>${sub?`<em>${esc(sub)}</em>`:''}</div>`;}
function trainingBars(items=[]){
  if(!items.length)return '<p class="muted">Complete some double-focused training to build these analytics.</p>';
  return `<div class="double-bars">${items.map(x=>`<div class="double-bar-row"><span>${esc(x.target)}</span><div class="double-track"><i style="width:${Math.max(2,Math.min(100,+x.rate||0))}%"></i></div><strong>${fmt(x.rate,0)}%</strong></div>`).join('')}</div>`;
}
async function playerDashboard(playerId){
  setGameplayActive(false);view.dataset.page='player-dashboard';await loadPlayers();
  const [data,rows,boards]=await Promise.all([api(`/api/players/${playerId}/profile`),api('/api/stats'),api('/api/leaderboards')]);
  const awards=buildBadgeAwards(rows,boards).get(+playerId)||[],x=data.x01||{},t=data.training||{},other=players.filter(p=>+p.id!==+playerId);
  const recent=(data.recent_matches||[]).map(r=>{const won=+r.winner_player_id===+playerId;return `<div class="history-row"><span class="result-pill ${won?'win':'loss'}">${won?'W':'L'}</span><div><strong>${gameLabel(r.game_type)}${r.start_score?` ${r.start_score}`:''}</strong><div class="muted">${shortDate(r.played_at)}${r.winner_name?` · winner ${esc(r.winner_name)}`:''}</div></div><div class="history-stat">${r.game_type==='x01'?`${fmt(r.three_dart_average,1)} avg`:r.legs_won?`${r.legs_won} legs`:''}</div></div>`;}).join('')||'<p class="muted">No recorded games yet.</p>';
  const party=data.party||{};
  view.innerHTML=`
    <div class="section-title"><h2>${esc(data.player.name)}</h2><span class="muted">Player dashboard</span></div>
    <div class="profile-hero card"><div class="profile-avatar">${esc(data.player.name).slice(0,1).toUpperCase()}</div><div><h2>${esc(data.player.name)}</h2><p class="muted">${x.matches||0} X01 matches · ${x.wins||0} wins · ${x.legs_won||0} legs won</p><div class="badge-wrap">${awards.length?badgeChips(awards):'<span class="muted">No current honours yet</span>'}</div></div></div>
    <div class="metric-grid">${metricCard('📈','Lifetime avg',fmt(x.lifetime_average,2))}${metricCard('⚡','Best match avg',fmt(x.best_average,2))}${metricCard('💥','180s',x.total_180s||0)}${metricCard('🎯','Highest checkout',x.highest_checkout||0)}${metricCard('🧊','Checkout %',x.checkout_attempts?fmt((x.checkouts/x.checkout_attempts)*100,1)+'%':'—')}${metricCard('🔥','Highest visit',x.highest_visit||0)}</div>
    <div class="dashboard-grid">
      <div class="card"><h3>Other games</h3><div class="mini-stat-list"><div><span>🏏 Cricket wins</span><strong>${party.cricket?.wins||0}</strong></div><div><span>👑 Killer wins</span><strong>${party.killer?.wins||0}</strong></div><div><span>🌏 Shanghai best</span><strong>${party.shanghai?.best_score??'—'}</strong></div><div><span>✂️ Halve-It best</span><strong>${party.halveit?.best_score??'—'}</strong></div><div><span>🎯 Bob's 27 best</span><strong>${t.bobs27?.best_score??'—'}</strong></div></div></div>
      <div class="card"><h3>Head-to-head</h3>${other.length?`<label>Compare with<select id="profileOpponent">${other.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><div class="actions" style="justify-content:flex-start"><button class="btn primary" id="profileCompare">View rivalry</button></div>`:'<p class="muted">Add another player to unlock head-to-head stats.</p>'}</div>
    </div>
    <div class="section-title"><h2>Training Centre analytics</h2><span class="muted">Improves as sessions are recorded</span></div>
    <div class="training-analytics-grid">
      <div class="card"><h3>🎯 Checkout Trainer</h3><div class="training-big">${t.checkout?.attempts?fmt(t.checkout.rate,1)+'%':'—'}</div><p class="muted">${t.checkout?.hits||0} finishes from ${t.checkout?.attempts||0} attempts · ${t.checkout?.sessions||0} sessions</p></div>
      <div class="card"><h3>🔢 121</h3><div class="training-big">${t['121']?.best_target||'—'}</div><p class="muted">Best completed target · ${t['121']?.successes||0} successful levels from ${t['121']?.attempts||0} attempts</p></div>
      <div class="card"><h3>🎯 Doubles Trainer</h3><div class="training-big">${t.doubles?.darts?fmt(t.doubles.rate,1)+'%':'—'}</div><p class="muted">${t.doubles?.hits||0} hits from ${t.doubles?.darts||0} darts · ${t.doubles?.sessions||0} sessions</p><h4>Strongest doubles</h4>${trainingBars(t.doubles?.best_doubles||[])}${t.doubles?.weak_doubles?.length?`<h4 style="margin-top:14px">Needs work</h4>${trainingBars(t.doubles.weak_doubles)}`:''}</div>
      <div class="card"><h3>🎯 Bob's 27</h3><div class="training-big">${t.bobs27?.best_score??'—'}</div><p class="muted">Personal best · ${t.bobs27?.sessions||0} recorded sessions</p></div>
    </div>
    <div class="section-title"><h2>Recent games</h2></div><div class="card history-list">${recent}</div>
    <div class="actions"><button class="btn" id="backPlayers">Back to players</button><button class="btn" id="backStats">Leaderboards</button></div>`;
  $('#backPlayers').onclick=playerManager;$('#backStats').onclick=statsView;if($('#profileCompare'))$('#profileCompare').onclick=()=>showHeadToHead(+playerId,+$('#profileOpponent').value);
}
async function showHeadToHead(p1Id,p2Id){
  setGameplayActive(false);view.dataset.page='head-to-head';const d=await api(`/api/head-to-head?player1=${p1Id}&player2=${p2Id}`),[a,b]=d.players;
  const streak=d.streak?.count?`${d.streak.name} has won the last ${d.streak.count}`:'No current streak';
  const recent=(d.recent||[]).map(r=>{const pa=r.players.find(x=>+x.player_id===+a.player_id)||{},pb=r.players.find(x=>+x.player_id===+b.player_id)||{};return `<div class="h2h-history"><span>${shortDate(r.played_at)}</span><strong>${pa.legs||0}–${pb.legs||0}</strong><span>${fmt(pa.average,1)} / ${fmt(pb.average,1)} avg</span></div>`;}).join('')||'<p class="muted">No two-player X01 matches recorded between these players yet.</p>';
  view.innerHTML=`<div class="section-title"><h2>Head-to-head</h2><span class="muted">X01 rivalry</span></div><div class="h2h-hero card"><div><strong>${esc(a.name)}</strong><div class="h2h-wins">${a.wins}</div><span>wins</span></div><div class="h2h-vs">VS<div>${d.matches} matches</div></div><div><strong>${esc(b.name)}</strong><div class="h2h-wins">${b.wins}</div><span>wins</span></div></div><div class="streak-strip">🔥 ${esc(streak)}</div><div class="h2h-table card"><div></div><strong>${esc(a.name)}</strong><strong>${esc(b.name)}</strong>${h2hRow('Legs won',a.legs,b.legs)}${h2hRow('Rivalry avg',fmt(a.average,2),fmt(b.average,2))}${h2hRow('Best match avg',fmt(a.best_average,2),fmt(b.best_average,2))}${h2hRow('Highest checkout',a.highest_checkout,b.highest_checkout)}${h2hRow('180s',a['180s'],b['180s'])}</div><div class="section-title"><h2>Recent meetings</h2></div><div class="card">${recent}</div><div class="actions"><button class="btn" id="h2hBack">Back to stats</button><button class="btn" id="h2hA">${esc(a.name)} dashboard</button><button class="btn" id="h2hB">${esc(b.name)} dashboard</button></div>`;
  $('#h2hBack').onclick=statsView;$('#h2hA').onclick=()=>playerDashboard(a.player_id);$('#h2hB').onclick=()=>playerDashboard(b.player_id);
}
function h2hRow(label,a,b){return `<span>${label}</span><strong>${a}</strong><strong>${b}</strong>`;}

function leaderboardCard(icon,title,rows,unit){
  const medals=['🥇','🥈','🥉'];
  const visible=(rows||[]).slice(0,5);
  const body=visible.length?visible.map((r,i)=>`<div class="leader-row"><span class="leader-rank">${medals[i]||i+1}</span><strong>${esc(r.name)}</strong><span>${Number(r.value).toLocaleString()} ${unit}</span></div>`).join(''):'<div class="muted">No results yet.</div>';
  return `<div class="card leaderboard-card"><h3>${icon} ${title}</h3>${body}</div>`;
}
function buildBadgeAwards(rows,boards){
  const awards=new Map();
  const add=(id,b)=>{if(!awards.has(+id))awards.set(+id,[]);awards.get(+id).push(b);};
  const awardMax=(eligible,valueFn,badgeFn)=>{
    if(!eligible.length)return;
    const max=Math.max(...eligible.map(valueFn)); if(!(max>0))return;
    eligible.filter(r=>valueFn(r)===max).forEach(r=>add(r.id,badgeFn(max)));
  };
  awardMax(rows,r=>+r.total_180s,v=>({icon:'💥',label:'Maximum Machine',detail:`Most 180s · ${v}`}));
  awardMax(rows,r=>+r.highest_checkout,v=>({icon:'🎯',label:'Checkout King',detail:`Highest checkout · ${v}`}));
  const coEligible=rows.filter(r=>+r.checkout_attempts>=10);
  awardMax(coEligible,r=>Math.round((+r.checkouts/+r.checkout_attempts)*10000)/100,v=>({icon:'🧊',label:'Ice Cold',detail:`Best checkout rate · ${fmt(v,1)}% (10+ attempts)`}));
  const boardBadges={
    shanghai:{icon:'🌏',label:'Shanghai Star',suffix:'pts'},
    halveit:{icon:'✂️',label:'Halve-It Hero',suffix:'pts'},
    bobs27:{icon:'🎯',label:"Bob's 27 Boss",suffix:'pts'},
    cricket_wins:{icon:'🏏',label:'Cricket Captain',suffix:'wins'},
    killer_wins:{icon:'👑',label:'Killer King',suffix:'wins'}
  };
  Object.entries(boardBadges).forEach(([key,b])=>{
    const list=boards[key]||[]; if(!list.length||!(+list[0].value>0))return;
    const top=+list[0].value;
    list.filter(r=>+r.value===top).forEach(r=>add(r.player_id,{icon:b.icon,label:b.label,detail:`${top} ${b.suffix}`}));
  });
  return awards;
}
function badgeChips(items=[]){return items.map(b=>`<span class="award-badge" title="${esc(b.detail)}"><span>${b.icon}</span>${esc(b.label)}</span>`).join('');}

async function statsView(){
  setGameplayActive(false);
  await loadPlayers();
  const [rows,boards]=await Promise.all([api('/api/stats'),api('/api/leaderboards')]);
  const awards=buildBadgeAwards(rows,boards);
  const honours=players.map(p=>({p,b:awards.get(+p.id)||[]})).filter(x=>x.b.length);
  const rivalry=players.length>=2?`<div class="card rivalry-picker"><div><h3>⚔️ Head-to-head</h3><p class="muted">Compare two players using their recorded two-player X01 matches.</p></div><div class="rivalry-controls"><select id="h2hP1">${players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><span>vs</span><select id="h2hP2">${players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn primary" id="openH2H">Compare</button></div></div>`:'';
  view.innerHTML=`
    <div class="section-title"><h2>Head-to-head & honours</h2><span class="muted">Rivalries, current titles and best results</span></div>${rivalry}
    <div class="section-title"><h2>Honours</h2><span class="muted">Current leaders keep the badge until somebody beats them</span></div>
    ${honours.length?`<div class="honours-grid">${honours.map(x=>`<div class="card honour-card"><h3>${esc(x.p.name)}</h3><div class="badge-wrap">${badgeChips(x.b)}</div></div>`).join('')}</div>`:`<div class="card"><p class="muted">Play some recorded games to start earning DartDeck badges.</p></div>`}
    <div class="section-title"><h2>Game leaderboards</h2><span class="muted">Best recorded results</span></div>
    <div class="leaderboard-grid">
      ${leaderboardCard('🌏','Shanghai',boards.shanghai,'pts')}
      ${leaderboardCard('✂️','Halve-It',boards.halveit,'pts')}
      ${leaderboardCard('🎯',"Bob's 27",boards.bobs27,'pts')}
      ${leaderboardCard('🏏','Cricket',boards.cricket_wins,'wins')}
      ${leaderboardCard('👑','Killer',boards.killer_wins,'wins')}
    </div>
    <div class="section-title"><h2>X01 player stats</h2><span class="muted">Recorded X01 history</span></div><div class="card table-wrap"><table>
    <thead><tr><th>Player</th><th>Matches</th><th>Legs</th><th>Avg</th><th>Best Avg</th><th>High CO</th><th>High Visit</th><th>180s</th><th>CO%</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="click-row" data-profile="${r.id}"><td><strong>${esc(r.name)}</strong>${awards.get(+r.id)?.length?`<div class="table-badges">${awards.get(+r.id).map(b=>`<span title="${esc(b.detail)}">${b.icon}</span>`).join('')}</div>`:''}</td><td>${r.matches}</td><td>${r.legs_won}</td><td>${fmt(r.lifetime_average,2)}</td><td>${fmt(r.best_average,2)}</td><td>${r.highest_checkout}</td><td>${r.highest_visit}</td><td>${r.total_180s}</td><td>${r.checkout_attempts?fmt(r.checkouts/r.checkout_attempts*100,0)+'%':'—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No stats recorded yet.</td></tr>'}</tbody></table></div>`;
  if($('#h2hP2')&&players.length>1)$('#h2hP2').value=String(players[1].id);
  $('#openH2H')?.addEventListener('click',()=>{const a=+$('#h2hP1').value,b=+$('#h2hP2').value;if(a===b){toast('Choose two different players');return;}showHeadToHead(a,b);});
  $$('[data-profile]').forEach(r=>r.onclick=()=>playerDashboard(+r.dataset.profile));
}

async function settingsView(){
  if(MOBILE_UX) return mobileSettingsView();
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
        <div class="toggle-row" style="margin-top:10px"><div><strong>Dartboard Mode</strong><div class="muted">Turns active games into a distraction-free scorer with larger controls and an automatic two-pane landscape layout on tablets.</div></div><input id="dartboardMode" type="checkbox" ${appSettings.dartboard_mode?'checked':''}></div>
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

async function mobileSettingsView(){
  setGameplayActive(false);view.dataset.page='settings';await loadSettings();
  const wake=('wakeLock' in navigator),secure=window.isSecureContext,standalone=isStandalone();
  const themeId=appSettings.theme_id||'midnight';
  const localSummary=USE_LOCAL_STORE?await window.DartDeckLocalStore.summary():null;
  const storagePersistent=USE_LOCAL_STORE&&navigator.storage?.persisted?await navigator.storage.persisted().catch(()=>false):false;
  let legacy={available:false};
  if(USE_LOCAL_STORE){try{const r=await fetch('/api/migration/status',{cache:'no-store'});if(r.ok)legacy=await r.json();}catch(e){}}
  const installText=standalone?'Installed':deferredInstallPrompt?'Install DartDeck':secure?'Install prompt not currently offered':'HTTPS required for installation';
  view.innerHTML=`
    <div class="section-title"><h2>Settings</h2><span class="muted">Appearance, gameplay & local data</span></div>
    <div class="settings-grid">
      <div class="card">
        <h3>Theme</h3>
        <p class="muted">Choose a complete DartDeck theme, then personalise it with one accent colour.</p>
        <div class="theme-preset-grid">${Object.entries(THEME_PRESETS).map(([id,t])=>`<button class="theme-preset ${id===themeId?'selected':''}" data-theme="${id}" style="--preview-bg:${t.bg};--preview-panel:${t.panel};--preview-text:${t.text}"><span class="theme-mini"><i></i><b></b><em></em></span><strong>${t.label}</strong></button>`).join('')}</div>
        <h4 class="settings-subhead">Accent colour</h4>
        <div class="accent-picker">${ACCENT_OPTIONS.map(c=>`<button class="accent-swatch ${c.toLowerCase()===String(appSettings.primary_color).toLowerCase()?'selected':''}" data-accent="${c}" style="--swatch:${c}" aria-label="Use ${c}"></button>`).join('')}<label class="custom-accent">Custom<input type="color" id="mobileAccent" value="${appSettings.primary_color}"></label></div>
        <label style="margin-top:14px">Font<select id="fontChoice"><option value="modern">Modern</option><option value="system">System</option><option value="rounded">Rounded</option><option value="condensed">Condensed</option></select></label>
        <div class="settings-preview" id="themePreview" style="margin-top:12px"><span class="muted">Preview</span><div class="sample-score">501</div><strong>Checkout: T20 → T19 → D12</strong></div>
        <div class="actions"><button class="btn primary" id="saveMobileAppearance">Save appearance</button></div>
      </div>
      <div class="card">
        <h3>During games</h3>
        <div class="toggle-row"><div><strong>Keep screen awake</strong><div class="muted">Prevents the display sleeping while a match or training session is active where the browser supports it.</div></div><input id="keepAwake" type="checkbox" ${appSettings.keep_awake?'checked':''}></div>
        <div class="mode-default-note"><span>🎯</span><div><strong>Dartboard View is the default</strong><p>Menus disappear during every game and Training Centre session. Use the in-game End/Exit control to return.</p></div></div>
        <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="saveMobileGameSettings">Save game settings</button></div>
      </div>
      ${USE_LOCAL_STORE?`<div class="card data-card">
        <h3>Data & backup</h3>
        <p class="muted">This device owns its DartDeck history. The Docker server only serves the app and, during migration, exposes your old database read-only.</p>
        <div class="data-summary">
          <div><strong>${localSummary.players}</strong><span>Players</span></div><div><strong>${localSummary.matches}</strong><span>Matches</span></div><div><strong>${localSummary.practice}</strong><span>Training</span></div><div><strong>${localSummary.total_180s}</strong><span>180s</span></div>
        </div>
        <div class="actions data-actions"><button class="btn primary" id="exportBackup">Export backup</button><label class="btn file-btn">Choose backup<input id="backupFile" type="file" accept="application/json,.json,.dartdeck"></label></div>
        <div class="actions data-actions"><button class="btn" id="mergeBackup" disabled>Import & merge</button><button class="btn danger" id="replaceBackup" disabled>Import & replace</button></div>
        <p class="muted small-note">Merge keeps existing history and skips records already imported. Replace clears this device first.</p>
      </div>
      <div class="card migration-card">
        <h3>Existing server history</h3>
        ${legacy.available?`<p>Your old shared database is still available as a <strong>read-only migration source</strong>.</p><div class="data-summary"><div><strong>${legacy.players}</strong><span>Players</span></div><div><strong>${legacy.matches}</strong><span>Matches</span></div><div><strong>${legacy.practice}</strong><span>Training</span></div><div><strong>${legacy.total_180s}</strong><span>180s</span></div></div><div class="actions"><button class="btn primary big" id="migrateLegacy">Copy server history to this device</button><a class="btn" href="/api/migration/database" download>Download original DB</a></div><p class="muted small-note">Safe to run again: previously copied matches and training sessions are skipped. The server database is never modified.</p>`:`<p class="muted">No compatible legacy server database was detected. New games are already being saved locally on this device.</p>`}
      </div>`:''}
      <div class="card">
        <h3>${USE_LOCAL_STORE?'Docker / PWA edition':'Mobile edition'}</h3>
        ${statusRow(true,`DartDeck ${APP_VERSION}`)}
        ${statusRow(true,USE_LOCAL_STORE?'Local device storage active':'Offline local storage active')}
        ${statusRow(wake,wake?'Screen Wake Lock available':'Screen Wake Lock unavailable')}
        ${USE_LOCAL_STORE?statusRow(secure,secure?'Secure context: yes':'Secure context: no — HTTPS recommended'):''}
        ${USE_LOCAL_STORE?statusRow(standalone,standalone?'Running as installed app':'Running in browser'):''}
        ${USE_LOCAL_STORE?statusRow(storagePersistent,storagePersistent?'Persistent storage granted':'Persistent storage not confirmed'):''}
        ${USE_LOCAL_STORE?`<div class="actions"><button class="btn primary" id="installFromSettings" ${(!deferredInstallPrompt||standalone)?'disabled':''}>${esc(installText)}</button><button class="btn" id="protectStorage" ${storagePersistent?'disabled':''}>Protect local data</button></div>`:''}
        <p class="muted">${USE_LOCAL_STORE?'Players, matches, head-to-head stats and Training Centre results now live on this browser/device — not in the Docker database.':'No Docker server, account or internet connection is required.'}</p>
      </div>
    </div>`;
  $('#fontChoice').value=appSettings.font;
  let draftTheme=themeId,draftAccent=appSettings.primary_color;
  const preview=()=>applySettings({...appSettings,theme_id:draftTheme,primary_color:draftAccent,font:$('#fontChoice').value,dartboard_mode:true});
  $$('[data-theme]').forEach(b=>b.onclick=()=>{draftTheme=b.dataset.theme;$$('[data-theme]').forEach(x=>x.classList.toggle('selected',x===b));preview();});
  $$('[data-accent]').forEach(b=>b.onclick=()=>{draftAccent=b.dataset.accent;$('#mobileAccent').value=draftAccent;$$('[data-accent]').forEach(x=>x.classList.toggle('selected',x===b));preview();});
  $('#mobileAccent').oninput=e=>{draftAccent=e.target.value;$$('[data-accent]').forEach(x=>x.classList.toggle('selected',x.dataset.accent.toLowerCase()===draftAccent.toLowerCase()));preview();};
  $('#fontChoice').onchange=preview;
  $('#saveMobileAppearance').onclick=async()=>{appSettings=await api('/api/settings',{method:'PUT',body:JSON.stringify({theme_id:draftTheme,primary_color:draftAccent,font:$('#fontChoice').value,dartboard_mode:true})});applySettings(appSettings);toast('Appearance saved');};
  $('#saveMobileGameSettings').onclick=async()=>{appSettings=await api('/api/settings',{method:'PUT',body:JSON.stringify({keep_awake:$('#keepAwake').checked,dartboard_mode:true})});applySettings(appSettings);syncWakeLock();toast('Game settings saved');};
  if(USE_LOCAL_STORE){
    $('#exportBackup').onclick=exportLocalBackup;
    $('#backupFile').onchange=()=>{const ready=!!$('#backupFile').files[0];$('#mergeBackup').disabled=!ready;$('#replaceBackup').disabled=!ready;};
    $('#mergeBackup').onclick=()=>importLocalBackup('merge');
    $('#replaceBackup').onclick=()=>importLocalBackup('replace');
    $('#migrateLegacy')?.addEventListener('click',migrateLegacyServer);
    $('#installFromSettings')?.addEventListener('click',installPwa);
    $('#protectStorage')?.addEventListener('click',async()=>{if(!navigator.storage?.persist){toast('Persistent storage is not supported by this browser',3200);return;}const ok=await navigator.storage.persist().catch(()=>false);toast(ok?'Persistent storage granted':'Browser did not grant persistent storage',3200);await mobileSettingsView();});
  }
}

async function exportLocalBackup(){
  const payload=await window.DartDeckLocalStore.exportData();
  const stamp=new Date().toISOString().slice(0,10);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dartdeck-backup-${stamp}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported');
}
async function importLocalBackup(mode){
  const file=$('#backupFile')?.files?.[0];if(!file){toast('Choose a DartDeck backup first');return;}
  if(mode==='replace'&&!confirm('Replace all DartDeck data on this device with this backup? This cannot be undone unless you export a backup first.'))return;
  try{const payload=JSON.parse(await file.text());const result=await window.DartDeckLocalStore.importData(payload,mode);await loadPlayers();toast(`${mode==='merge'?'Merged':'Restored'} · ${result.summary.matches} matches · ${result.summary.practice} training sessions`,3500);await mobileSettingsView();}catch(e){toast(e.message||'Could not import backup',4000);}
}
async function migrateLegacyServer(){
  if(!confirm('Copy the existing server history to this device? The old server database will remain unchanged.'))return;
  try{
    const r=await fetch('/api/migration/export',{cache:'no-store'});if(!r.ok){const e=await r.json().catch(()=>({detail:'Migration export failed'}));throw new Error(e.detail||'Migration export failed');}
    const payload=await r.json();const result=await window.DartDeckLocalStore.importData(payload,'merge');await loadPlayers();
    toast(`Migration complete · ${result.players_added} players · ${result.matches_added} matches · ${result.practice_added} training sessions copied`,4500);await mobileSettingsView();
  }catch(e){toast(e.message||'Migration failed',4500);}
}

function colourField(label,id,value){return `<label>${label}<span class="colour-field"><input type="color" id="${id}" value="${value}"><input value="${value}" aria-label="${label} hex colour" data-sync="${id}" maxlength="7"></span></label>`}
function statusRow(ok,text){return `<div class="status-row"><span class="status-dot ${ok?'ok':'bad'}"></span><span>${text}</span></div>`}
async function saveSettingsFromForm(){
  const payload={primary_color:$('#primaryColor').value,accent_color:$('#accentColor').value,background_color:$('#backgroundColor').value,panel_color:$('#panelColor').value,text_color:$('#textColor').value,muted_color:$('#mutedColor').value,font:$('#fontChoice').value,keep_awake:$('#keepAwake').checked,dartboard_mode:$('#dartboardMode').checked};
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
  const maxPlayers=Math.min(4,players.length);
  const remembered=lastGamePlayerIds();
  const initialCount=Math.max(1,Math.min(maxPlayers,remembered.length||Math.min(2,maxPlayers)));
  const playerCountOptions=Array.from({length:maxPlayers},(_,i)=>i+1).map(n=>`<option ${n===initialCount?'selected':''}>${n}</option>`).join('');
  view.innerHTML=`<div class="section-title"><h2>New X01 game</h2></div><div class="card">
    <div class="form-grid">
      <label>Starting score<select id="startScore"><option>301</option><option selected>501</option><option>701</option></select></label>
      <label>Players<select id="playerCount">${playerCountOptions}</select></label>
      <label>In rule<select id="inRule"><option value="straight">Straight in</option><option value="double">Double in</option></select></label>
      <label>Out rule<select id="outRule"><option value="double" selected>Double out</option><option value="straight">Straight out</option><option value="master">Master out</option></select></label>
      <label>Legs<select id="legs"><option value="1">1 leg</option><option value="3" selected>Best of 3</option><option value="5">Best of 5</option><option value="7">Best of 7</option></select></label>
      <label>Entry mode<select id="entryMode"><option value="quick" selected>Quick score</option><option value="darts">Dart by dart</option></select></label>
      <label>DartBot opponent<select id="botLevel"><option value="">None</option>${Object.entries(BOT_LEVELS).map(([k,v])=>`<option value="${k}">${v.label} · ~${v.avg} avg</option>`).join('')}</select></label>
    </div>
    <div id="playerSelects" class="form-grid" style="margin-top:14px"></div>
    <div class="actions"><button class="btn primary big" id="startX01">Start game</button></div>
  </div>`;
  const renderSelects=()=>{
    const n=+$('#playerCount').value;
    const current=$$('.xplayer').map(el=>+el.value).filter(Boolean);
    const selected=preferredPlayerIds(n,current);
    $('#playerSelects').innerHTML=Array.from({length:n},(_,i)=>`<label>Player ${i+1}<select class="xplayer">${opts}</select></label>`).join('');
    $$('.xplayer').forEach((el,i)=>{if(selected[i])el.value=String(selected[i]);});
  };
  renderSelects(); $('#playerCount').onchange=renderSelects;
  $('#botLevel').onchange=()=>{const on=!!$('#botLevel').value;if(on){$('#playerCount').value='1';$('#playerCount').disabled=true;$('#inRule').value='straight';$('#inRule').disabled=true;$('#entryMode').disabled=false;$('#entryMode').value='quick';renderSelects();toast('DartBot matches currently use one human player and straight-in');}else{$('#playerCount').disabled=false;$('#inRule').disabled=false;}};
  $('#inRule').onchange=()=>{ if($('#inRule').value==='double'){ $('#entryMode').value='darts'; $('#entryMode').disabled=true; toast('Double-in uses dart-by-dart entry'); } else $('#entryMode').disabled=false; };
  $('#startX01').onclick=()=>{
    const ids=$$('.xplayer').map(s=>+s.value); if(new Set(ids).size!==ids.length){toast('Choose different players');return;}
    const botLevel=$('#botLevel').value||null;
    if(botLevel&&ids.length!==1){toast('DartBot currently plays one human opponent');return;}
    rememberGamePlayers(ids);
    startX01({start:+$('#startScore').value, ids, doubleIn:$('#inRule').value==='double', out:$('#outRule').value, bestOf:+$('#legs').value, mode:$('#entryMode').value,botLevel});
  };
}

function basePlayer(p,start){return {id:p.id,name:p.name,score:start,legs:0,in:false,totalScored:0,darts:0,first9Points:0,first9Darts:0,highestVisit:0,highestCheckout:0,attempts:0,checkouts:0,c100:0,c140:0,c180:0,visits:[],legStartScored:0,legStartDarts:0,isBot:!!p.isBot,botLevel:p.botLevel||null};}
function startX01(cfg){
  setGameplayActive(true);document.body.classList.add('x01-gameplay');
  const selected=cfg.ids.map(id=>players.find(p=>p.id===id));
  if(cfg.botLevel){const b=BOT_LEVELS[cfg.botLevel];selected.push({id:`bot-${cfg.botLevel}`,name:`DartBot · ${b.label}`,isBot:true,botLevel:cfg.botLevel});}
  x01={...cfg, players:selected.map(p=>basePlayer(p,cfg.start)), turn:0, visit:[], mult:1, quick:'', history:[], finished:false, legNo:1, checkoutPending:null,checkoutFallback:false,botReveal:null};
  renderX01();
}

function renderX01(){
  const g=x01, active=g.players[g.turn];
  const route=getCheckout(active.score,g.out);
  const checkoutRoute=g.checkoutPending ? getCheckout(g.checkoutPending.from,g.out) : null;
  const minCheckoutDarts=checkoutRoute ? checkoutRoute.length : 1;
  const checkoutConfirm=g.checkoutPending ? `
    <div class="checkout-confirm checkout-count" role="status">
      <div class="checkout-confirm-icon">🎯</div>
      <div class="checkout-confirm-body">
        <strong>Number of darts?</strong>
        <p>You entered <b>${g.checkoutPending.score}</b> to finish <b>${g.checkoutPending.from}</b>. How many darts did the checkout take?</p>
        <div class="actions checkout-dart-actions">
          ${[1,2,3].map(n=>`<button class="btn ${n===minCheckoutDarts?'primary':''} big" data-checkout-darts="${n}" ${n<minCheckoutDarts?'disabled':''}>${n} ${n===1?'dart':'darts'}</button>`).join('')}
        </div>
        <p class="muted small-note">DartDeck will use this for your average and checkout stats. You only need dart-by-dart entry if you want to record the exact route.</p>
      </div>
    </div>` : '';
  view.innerHTML=`
  <div class="section-title x01-title"><h2>${g.start} · Leg ${g.legNo}</h2><span class="muted">First to ${Math.floor(g.bestOf/2)+1} legs</span></div>
  <div class="x01-shell">
    <div class="x01-board-pane"><div class="scoreboard">${g.players.map((p,i)=>playerScoreCard(p,i===g.turn,g)).join('')}</div><div class="checkout">${route ? `<strong>Checkout:</strong> ${route.join(' → ')}` : `<strong>${active.score}</strong> remaining · ${setupSuggestion(active.score,g.out)}`}</div></div>
    <div class="card x01-entry-pane">
      ${checkoutConfirm}
      <div class="game-status">${esc(active.name)} to throw ${g.doubleIn&&!active.in?'· needs a double to get in':''}</div>
      ${g.checkoutPending?'':(active.isBot?botTurnMarkup(active,g):(g.mode==='quick'?quickInput():dartInput()))}
      <div class="actions x01-secondary-actions"><button class="btn" id="switchInput">${g.checkoutPending?'Enter dart-by-dart instead':g.mode==='quick'?'Dart-by-dart':'Quick score'}</button><button class="btn" id="undo">Undo last visit</button><button class="btn danger" id="endGame">End game</button></div>
    </div>
  </div>`;
  bindX01();
}
function playerScoreCard(p,active,g){
  const avg=p.darts?p.totalScored*3/p.darts:0; const f9=p.first9Darts?p.first9Points*3/p.first9Darts:0;
  return `<div class="player-score ${active?'active':''}"><div class="name">${esc(p.name)} ${active?'●':''}</div><div class="score">${p.score}</div><div class="meta"><span>AVG ${fmt(avg,1)}</span><span>F9 ${fmt(f9,1)}</span></div><div class="meta"><span>Legs ${p.legs}</span><span>High ${p.highestVisit}</span></div></div>`;
}
function quickInput(){
  return `<div class="quick-total" id="quickTotal">${x01.quick||'—'}</div><div class="keypad">${[1,2,3,4,5,6,7,8,9,'C',0,'⌫'].map(k=>`<button data-key="${k}">${k}</button>`).join('')}</div><div class="actions"><button class="btn big" id="missQuick">Miss</button><button class="btn primary big" id="submitQuick">Submit visit</button></div>`;
}
function dartInput(){
  const labels=x01.visit.map(d=>d.label).join(' ')||'No darts entered';
  return `<div class="visit-darts">${x01.visit.length?x01.visit.map(d=>`<span class="dart-chip">${d.label}</span>`).join(''):`<span class="muted">${labels}</span>`}</div>
  <div class="multis"><button data-m="1" class="${x01.mult===1?'active':''}">Single</button><button data-m="2" class="${x01.mult===2?'active':''}">Double</button><button data-m="3" class="${x01.mult===3?'active':''}">Treble</button><button data-m="0">Miss</button></div>
  <div class="dartboard">${Array.from({length:20},(_,i)=>i+1).map(n=>`<button data-seg="${n}">${n}</button>`).join('')}<button data-seg="25">Bull</button></div>
  <div class="actions"><button class="btn" id="clearDarts">Clear darts</button><button class="btn primary big" id="submitDarts">${x01.checkoutPending?'Confirm checkout':'Submit visit'}</button></div>`;
}
function botTurnMarkup(active,g){
  if(g.botReveal){
    const r=g.botReveal;
    return `<div class="bot-turn bot-reveal"><div class="bot-avatar">🤖</div><span class="eyebrow">DARTBOT VISIT</span><div class="bot-visit-score">${r.score}</div><strong>${r.checkout?`Checkout in ${r.darts} ${r.darts===1?'dart':'darts'}`:`DartBot threw ${r.score}`}</strong>${r.route?.length?`<span>${r.route.join(' → ')}</span>`:`<span>${BOT_LEVELS[active.botLevel]?.label||'Opponent'}</span>`}</div>`;
  }
  return `<div class="bot-turn"><div class="bot-avatar">🤖</div><strong>DartBot is throwing…</strong><span>${BOT_LEVELS[active.botLevel]?.label||'Opponent'} · target avg ${BOT_LEVELS[active.botLevel]?.avg||'—'}</span></div>`;
}

function bindX01(){
  $$('[data-checkout-darts]').forEach(b=>b.onclick=()=>{
    const pending=x01.checkoutPending;
    if(!pending)return;
    const darts=+b.dataset.checkoutDarts;
    x01.checkoutPending=null;
    commitVisit({score:pending.score,darts,finishDarts:darts,labels:[`Checkout ${pending.score} (${darts} ${darts===1?'dart':'darts'})`],dartObjs:null,checkoutConfirmed:true,returnToQuick:true});
  });
  $('#switchInput').onclick=()=>{
    const p=x01.players[x01.turn];
    if(x01.checkoutPending){x01.checkoutPending=null;x01.checkoutFallback=true;x01.mode='darts';x01.quick='';x01.visit=[];renderX01();return;}
    if(x01.doubleIn && !p.in && x01.mode==='darts'){toast('Stay in dart-by-dart mode until this player is in');return;}
    x01.mode=x01.mode==='quick'?'darts':'quick'; x01.quick=''; x01.visit=[]; renderX01();
  };
  $('#undo').onclick=undoX01; $('#endGame').onclick=()=>{if(confirm('End this game without saving?')) route('home')};
  if(x01.players[x01.turn].isBot){scheduleDartBot();return;}
  if(x01.mode==='quick'){
    $$('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='C')x01.quick='';else if(k==='⌫')x01.quick=x01.quick.slice(0,-1);else if(x01.quick.length<3)x01.quick+=k; $('#quickTotal').textContent=x01.quick||'—';});
    $('#missQuick').onclick=()=>{x01.quick='';commitVisit({score:0,darts:3,finishDarts:null,labels:['Miss'],dartObjs:null});};
    $('#submitQuick').onclick=()=>{
      const n=+x01.quick;
      if(x01.quick===''||n<0||n>180){toast('Enter a score from 0 to 180');return;}
      const p=x01.players[x01.turn];
      if(n===p.score){
        const route=getCheckout(p.score,x01.out);
        if(!route){toast(`No valid ${x01.out==='double'?'double-out':x01.out==='master'?'master-out':'checkout'} from ${p.score}`);return;}
        x01.checkoutPending={score:n,from:p.score};
        x01.quick='';x01.visit=[];renderX01();return;
      }
      commitVisit({score:n,darts:3,finishDarts:null,labels:[String(n)],dartObjs:null});
    };
  } else {
    $$('[data-m]').forEach(b=>b.onclick=()=>{const m=+b.dataset.m;if(m===0){addDart(0,0);return;}x01.mult=m;renderX01();});
    $$('[data-seg]').forEach(b=>b.onclick=()=>addDart(+b.dataset.seg,x01.mult));
    $('#clearDarts').onclick=()=>{x01.visit=[];renderX01();};
    $('#submitDarts').onclick=()=>{
      if(!x01.visit.length){toast('Enter at least one dart');return;}
      const score=x01.visit.reduce((a,d)=>a+d.score,0);
      const returnToQuick=!!x01.checkoutPending||!!x01.checkoutFallback;
      x01.checkoutPending=null;x01.checkoutFallback=false;
      commitVisit({score,darts:x01.visit.length,finishDarts:x01.visit.length,labels:x01.visit.map(d=>d.label),dartObjs:[...x01.visit],returnToQuick});
    };
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
function undoX01(){if(botTimer){clearTimeout(botTimer);botTimer=null;}if(!x01.history.length){toast('Nothing to undo');return;}const s=JSON.parse(x01.history.pop());x01.players=s.players;x01.turn=s.turn;x01.legNo=s.legNo;x01.quick='';x01.visit=[];x01.checkoutPending=null;x01.checkoutFallback=false;renderX01();}

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
      if(v.checkoutConfirmed) finish=true;
      else if(g.out==='straight') finish=true;
      else if(!dartObjs){
        if(getCheckout(before,g.out)){
          g.history.pop(); g.checkoutPending={score:v.score,from:before}; g.quick=''; g.visit=[]; renderX01(); return;
        }
        bust=true;
      }
      else {
        const last=dartObjs[dartObjs.length-1];
        finish = g.out==='double' ? last.isDouble : (last.isDouble||last.isTriple);
        if(!finish) bust=true;
      }
    }
  }
  const wasCheckoutRange = !!getCheckout(before,g.out);
  if(wasCheckoutRange) p.attempts++;
  if(bust){scored=0; p.score=before; toast('Bust');}
  else {p.score=remaining;}
  p.totalScored += scored; p.darts += effectiveDarts;
  const f9room=Math.max(0,9-p.first9Darts), f9d=Math.min(f9room,effectiveDarts); if(f9d>0){const ratio=effectiveDarts?scored/effectiveDarts:0;p.first9Points+=ratio*f9d;p.first9Darts+=f9d;}
  p.highestVisit=Math.max(p.highestVisit,scored); if(scored===180)p.c180++; if(scored>=140)p.c140++; if(scored>=100)p.c100++;
  p.visits.push(scored);
  if(finish){checkoutValue=before;p.checkouts++;p.highestCheckout=Math.max(p.highestCheckout,checkoutValue);p.legs++; toast(`${p.name} wins the leg!`,2400); const needed=Math.floor(g.bestOf/2)+1; if(p.legs>=needed){finishMatch(p);return;} startNextLeg();return;}
  g.turn=(g.turn+1)%g.players.length;
  if(v.returnToQuick) g.mode=(g.doubleIn&&!g.players[g.turn].in)?'darts':'quick';
  g.quick=''; g.visit=[]; g.checkoutPending=null; renderX01();
}
function startNextLeg(){const g=x01;g.legNo++;g.turn=(g.legNo-1)%g.players.length;g.players.forEach(p=>{p.score=g.start;p.in=false;p.first9Points=0;p.first9Darts=0;});g.mode=g.doubleIn?'darts':'quick';g.quick='';g.visit=[];g.checkoutPending=null;g.checkoutFallback=false;renderX01();}
async function finishMatch(winner){
  setGameplayActive(false);
  const g=x01; g.finished=true;
  const humans=g.players.filter(p=>!p.isBot);const payload={game_type:'x01',start_score:g.start,winner_player_id:winner.isBot?null:winner.id,settings_json:JSON.stringify({doubleIn:g.doubleIn,out:g.out,bestOf:g.bestOf,botLevel:g.botLevel||null}),players:humans.map(p=>({player_id:p.id,finishing_position:p.id===winner.id?1:2,darts_thrown:p.darts,points_scored:p.totalScored,three_dart_average:p.darts?p.totalScored*3/p.darts:0,first_nine_average:0,highest_visit:p.highestVisit,highest_checkout:p.highestCheckout,checkout_attempts:p.attempts,checkouts:p.checkouts,scores_100_plus:p.c100,scores_140_plus:p.c140,scores_180:p.c180,legs_won:p.legs}))};
  try{await api('/api/matches',{method:'POST',body:JSON.stringify(payload)});}catch(e){toast('Could not save match: '+e.message,3000)}
  const runner=Math.max(...g.players.filter(p=>p.id!==winner.id).map(p=>p.legs),0);
  const wavg=winner.darts?winner.totalScored*3/winner.darts:0;
  view.innerHTML=`<div class="card result-hero result-complete"><div class="result-crown">🏆</div><span class="eyebrow">MATCH COMPLETE</span><h2>${esc(winner.name)} wins ${winner.legs}–${runner}</h2><div class="finish-highlight-grid"><div><strong>${fmt(wavg,1)}</strong><span>Match avg</span></div><div><strong>${winner.highestCheckout||0}</strong><span>High checkout</span></div><div><strong>${winner.c180||0}</strong><span>180s</span></div><div><strong>${winner.highestVisit||0}</strong><span>High visit</span></div></div></div><div class="card table-wrap finish-table"><table><thead><tr><th>Player</th><th>Legs</th><th>Avg</th><th>High Visit</th><th>High CO</th><th>180s</th><th>CO%</th></tr></thead><tbody>${g.players.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${p.legs}</td><td>${fmt(p.darts?p.totalScored*3/p.darts:0,1)}</td><td>${p.highestVisit}</td><td>${p.highestCheckout}</td><td>${p.c180}</td><td>${p.attempts?fmt(p.checkouts/p.attempts*100,0)+'%':'—'}</td></tr>`).join('')}</tbody></table></div><div class="actions finish-actions"><button class="btn primary big" id="rematch">Rematch</button><button class="btn" id="newGame">New game</button>${!winner.isBot?`<button class="btn" id="winnerProfile">${esc(winner.name)} profile</button>`:''}${humans.length===2&&!g.botLevel?`<button class="btn" id="finishH2H">Head-to-head</button>`:''}<button class="btn" id="home">Home</button></div>`;
  $('#rematch').onclick=()=>startX01({start:g.start,ids:g.players.filter(p=>!p.isBot).map(p=>p.id),doubleIn:g.doubleIn,out:g.out,bestOf:g.bestOf,mode:g.doubleIn?'darts':'quick',botLevel:g.botLevel||null});
  $('#newGame').onclick=()=>x01Setup();$('#home').onclick=home;if($('#winnerProfile'))$('#winnerProfile').onclick=()=>playerDashboard(winner.id);if($('#finishH2H'))$('#finishH2H').onclick=()=>showHeadToHead(humans[0].id,humans[1].id);
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
function routeQuality(route){
  const finishPreference={D20:100,D16:90,D8:86,D12:84,D18:82,D10:80,D14:76,D6:68,D4:64,D2:60,D1:56,Bull:70};
  const last=route[route.length-1];
  let q=finishPreference[last.label]||0;
  route.slice(0,-1).forEach((d,i)=>{
    if(d.kind==='T') q+=40+d.score;
    else if(d.kind==='S') q+=15+d.score;
    else if(d.kind==='D') q+=d.score-30; // save doubles for the finishing dart where possible
    if(d.label==='25')q-=50;
    if(d.label==='Bull')q-=40;
    if(i===0&&d.kind==='T')q+=30;
  });
  // On the second dart of a three-dart checkout, favour an easy single adjustment
  // over a mathematically equivalent small treble/double (e.g. 112: T20, 12, D20).
  if(route.length===3&&route[1]?.kind==='S')q+=80;
  if(route.length===2&&route[0]?.kind==='S')q+=80;
  return q;
}
function bestSolution(solutions){
  if(!solutions.length)return null;
  solutions.sort((x,y)=>{
    if(x.length!==y.length)return x.length-y.length; // prefer a finish in fewer darts
    return routeQuality(y)-routeQuality(x);
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


function gaussian(mean,sd){
  let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
let botVisitTotals=null;
function plausibleVisitTotals(){
  if(botVisitTotals)return botVisitTotals;
  const vals=[0,...new Set(dartsForCheckout.map(d=>d.score))],set=new Set();
  for(const a of vals)for(const b of vals)for(const c of vals){const n=a+b+c;if(n<=180)set.add(n);}
  botVisitTotals=[...set].sort((a,b)=>a-b);return botVisitTotals;
}
function nearestPlausibleVisit(desired,max,remaining,out){
  const vals=plausibleVisitTotals().filter(n=>n<=max&&n!==remaining&&!(out==='double'&&remaining-n===1));
  if(!vals.length)return 0;return vals.reduce((best,n)=>Math.abs(n-desired)<Math.abs(best-desired)?n:best,vals[0]);
}
function scheduleDartBot(){
  if(botTimer||!x01||x01.finished||x01.botReveal||!x01.players[x01.turn]?.isBot)return;
  botTimer=setTimeout(()=>{botTimer=null;runDartBotTurn();},850);
}
function revealBotVisit(reveal,commit){
  if(!x01||x01.finished)return;
  x01.botReveal=reveal;renderX01();
  botTimer=setTimeout(()=>{botTimer=null;if(!x01||x01.finished)return;x01.botReveal=null;commit();},1800);
}
function runDartBotTurn(){
  const g=x01;if(!g||g.finished)return;const p=g.players[g.turn];if(!p?.isBot)return;
  const cfg=BOT_LEVELS[p.botLevel]||BOT_LEVELS.club;
  const route=getCheckout(p.score,g.out);
  if(route&&Math.random()<cfg.checkout){
    const score=p.score,darts=route.length;
    revealBotVisit({score,darts,route,checkout:true},()=>commitVisit({score,darts,finishDarts:darts,labels:route,dartObjs:null,checkoutConfirmed:true}));
    return;
  }
  let max=Math.min(180,Math.max(0,p.score-(g.out==='double'?2:1)));
  let desired=Math.round(gaussian(cfg.avg,Math.max(16,34-cfg.avg/5)));
  if(Math.random()<0.08+cfg.avg/800)desired=[100,121,125,140,180][Math.floor(Math.random()*5)];
  const score=nearestPlausibleVisit(desired,max,p.score,g.out);
  revealBotVisit({score,darts:3,route:null,checkout:false},()=>commitVisit({score,darts:3,finishDarts:null,labels:[String(score)],dartObjs:null}));
}

function partyMenu(){
  setGameplayActive(false);
  const games=[
    ['🏏','Cricket','Close 15–20 + Bull and score on numbers you own.','cricket'],
    ['👑','Killer','Become a Killer, then knock lives off your opponents.','killer'],
    ['🌏','Shanghai','Three darts per number — hit S + D + T for an instant win.','shanghai'],
    ['✂️','Halve-It','Score on each target; miss all three and your score is halved.','halveit']
  ];
  view.innerHTML=`<div class="section-title"><h2>Party games</h2><span class="muted">Four games worth keeping score for</span></div><div class="grid">${games.map(g=>`<button class="card click" data-party="${g[3]}" style="text-align:left;color:inherit"><div class="emoji">${g[0]}</div><h2>${g[1]}</h2><p class="muted">${g[2]}</p></button>`).join('')}</div>`;
  $$('[data-party]').forEach(b=>b.onclick=()=>partySetup(b.dataset.party));
}
async function partySetup(type){
  setGameplayActive(false);
  await loadPlayers(); if(players.length<1){route('players');return;}
  const opts=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const minPlayers=(type==='cricket'||type==='killer')?2:1;
  if(players.length<minPlayers){toast(`${partyName(type)} needs at least ${minPlayers} players`);route('players');return;}
  const maxPlayers=Math.min(4,players.length);
  const remembered=lastGamePlayerIds();
  const fallbackPlayers=Math.min(type==='killer'?3:2,maxPlayers);
  const defaultPlayers=remembered.length>=minPlayers?Math.min(remembered.length,maxPlayers):fallbackPlayers;
  const countOptions=Array.from({length:maxPlayers-minPlayers+1},(_,i)=>i+minPlayers).map(n=>`<option ${n===defaultPlayers?'selected':''}>${n}</option>`).join('');
  const extra=type==='killer'?`<label>Starting lives<select id="rounds"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>`:'';
  const setupHelp={
    cricket:'Use 2–4 players. Only 15–20 and Bull count.',
    killer:'Choose each player’s unique number — traditionally this is claimed by throwing one dart with the non-dominant hand.',
    shanghai:'Seven rounds: targets 1 through 7.',
    halveit:'Seven targets: 20, 16, D7, 14, T10, 17, Bull.'
  }[type];
  view.innerHTML=`<div class="section-title"><h2>${partyName(type)}</h2></div><div class="card"><p class="muted">${setupHelp}</p><div class="form-grid"><label>Players<select id="pc">${countOptions}</select></label>${extra}</div><div id="ps" class="form-grid" style="margin-top:12px"></div><div class="actions"><button class="btn primary big" id="startParty">Start</button></div></div>`;
  const numOpts=Array.from({length:20},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  const rs=()=>{
    const n=+$('#pc').value;
    const current=$$('.pp').map(el=>+el.value).filter(Boolean);
    const selected=preferredPlayerIds(n,current);
    $('#ps').innerHTML=Array.from({length:n},(_,i)=>`<label>Player ${i+1}<select class="pp">${opts}</select></label>${type==='killer'?`<label>${i===0?'Killer numbers':'Number'}<select class="knum">${numOpts}</select></label>`:''}`).join('');
    $$('.pp').forEach((el,i)=>{if(selected[i])el.value=String(selected[i]);});
    $$('.knum').forEach((el,i)=>el.value=String(i+1));
  };
  rs(); $('#pc').onchange=rs;
  $('#startParty').onclick=()=>{
    const ids=$$('.pp').map(el=>+el.value);
    if(new Set(ids).size!==ids.length){toast('Choose different players');return;}
    const nums=type==='killer'?$$('.knum').map(el=>+el.value):[];
    if(type==='killer'&&new Set(nums).size!==nums.length){toast('Each Killer player needs a different number');return;}
    const rounds=type==='killer'?+$('#rounds').value:(type==='shanghai'||type==='halveit'?7:0);
    rememberGamePlayers(ids);
    startParty(type,ids,rounds,nums);
  };
}
function partyName(t){return ({cricket:'Cricket',killer:'Killer',shanghai:'Shanghai',halveit:'Halve-It'})[t]}
function startParty(type,ids,rounds,killerNumbers=[]){
  setGameplayActive(true);document.body.classList.remove('x01-gameplay');
  const ps=ids.map(id=>players.find(p=>p.id===id));
  party={type,rounds,turn:0,round:1,darts:0,mult:1,quick:'',visit:[],finished:false,players:ps.map((p,i)=>({id:p.id,name:p.name,score:0,lives:rounds,killer:false,number:killerNumbers[i]||i+1,marks:{15:0,16:0,17:0,18:0,19:0,20:0,25:0}}))};
  renderParty();
}
function renderParty(){
  if(party.type==='cricket')return renderCricket();
  if(party.type==='killer')return renderKiller();
  if(party.type==='shanghai')return renderShanghai();
  if(party.type==='halveit')return renderHalveIt();
}
function partyQuickPad(prefix,value,label='Enter visit score'){
  return `<div class="quick-score-block"><div class="quick-score-label">${label}</div><div class="quick-total" id="${prefix}QuickTotal">${value||'—'}</div><div class="keypad">${[1,2,3,4,5,6,7,8,9,'C',0,'⌫'].map(k=>`<button data-qpad="${prefix}" data-key="${k}">${k}</button>`).join('')}</div><div class="actions"><button class="btn primary big" id="${prefix}QuickSubmit">Submit visit</button></div></div>`;
}
function bindPartyQuickPad(prefix,state,onSubmit){
  $$(`[data-qpad="${prefix}"]`).forEach(b=>b.onclick=()=>{
    const k=b.dataset.key;
    if(k==='C')state.quick=''; else if(k==='⌫')state.quick=state.quick.slice(0,-1); else if(state.quick.length<3)state.quick+=k;
    $(`#${prefix}QuickTotal`).textContent=state.quick||'—';
  });
  $(`#${prefix}QuickSubmit`).onclick=()=>{
    if(state.quick===''){toast('Enter a score from 0 to 180');return;}
    const n=+state.quick;
    if(n<0||n>180){toast('Enter a score from 0 to 180');return;}
    onSubmit(n);
  };
}
function scoreCards(g,metaFn=(x)=>'score'){
  return `<div class="scoreboard">${g.players.map((x,i)=>`<div class="player-score ${i===g.turn?'active':''}"><div class="name">${esc(x.name)} ${i===g.turn?'●':''}</div><div class="score">${x.score}</div><div class="meta"><span>${metaFn(x)}</span></div></div>`).join('')}</div>`;
}
function advanceRoundGame(){
  const g=party; g.quick='';g.visit=[];g.darts=0;g.turn++;
  if(g.turn>=g.players.length){g.turn=0;g.round++;}
  if(g.round>g.rounds){
    const max=Math.max(...g.players.map(p=>p.score));
    partyWinner(g.players.find(p=>p.score===max));return;
  }
  renderParty();
}
async function savePartyMatch(winner){
  const g=party;
  const ordered=[...g.players].sort((a,b)=>{
    if(g.type==='killer')return (b.lives||0)-(a.lives||0);
    return (b.score||0)-(a.score||0);
  });
  const position=new Map(ordered.map((x,i)=>[x.id,i+1]));
  const payload={
    game_type:g.type,
    start_score:null,
    winner_player_id:winner.id,
    settings_json:JSON.stringify({rounds:g.rounds}),
    players:g.players.map(x=>({
      player_id:x.id,
      finishing_position:position.get(x.id)||null,
      points_scored:+x.score||0
    }))
  };
  return api('/api/matches',{method:'POST',body:JSON.stringify(payload)});
}
function finishScoreTable(g){
  if(g.type==='killer')return `<div class="card table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>Lives</th></tr></thead><tbody>${g.players.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.lives>0?'Winner':'Out'}</td><td>${x.lives}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="card table-wrap"><table><thead><tr><th>Player</th><th>Final score</th></tr></thead><tbody>${[...g.players].sort((a,b)=>b.score-a.score).map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.score}</td></tr>`).join('')}</tbody></table></div>`;
}
function partyRecordKey(type){return type==='shanghai'?'shanghai':type==='halveit'?'halveit':null;}
async function partyWinner(p,extra=''){
  const g=party;
  if(g.finished)return;
  g.finished=true;
  setGameplayActive(false);
  try{await savePartyMatch(p);}catch(e){toast('Game finished, but the result could not be saved',2800);}
  let boards={};
  try{boards=await api('/api/leaderboards');}catch(e){}
  const key=partyRecordKey(g.type),record=key?(boards[key]||[])[0]:null;
  const recordHtml=record?`<div class="record-strip"><span>🏆 ${partyName(g.type)} high score</span><strong>${esc(record.name)} · ${Number(record.value).toLocaleString()}</strong></div>`:'';
  const scores=['cricket','shanghai','halveit','killer'].includes(g.type)?finishScoreTable(g):'';
  const winMetric=g.type==='killer'?`${p.lives} ${p.lives===1?'life':'lives'} left`:`${p.score} pts`;
  view.innerHTML=`<div class="card result-hero result-complete"><div class="result-crown">🏆</div><span class="eyebrow">${partyName(g.type).toUpperCase()} COMPLETE</span><h2>${esc(p.name)} wins!</h2><div class="finish-highlight-grid single"><div><strong>${winMetric}</strong><span>Winning result</span></div></div>${extra?`<p class="muted">${extra}</p>`:''}${recordHtml}</div>${scores}<div class="actions finish-actions"><button class="btn primary big" id="againP">Rematch</button><button class="btn" id="newP">New ${partyName(g.type)} game</button><button class="btn" id="partyProfile">${esc(p.name)} profile</button><button class="btn" id="homeP">Home</button></div>`;
  $('#againP').onclick=()=>startParty(g.type,g.players.map(x=>x.id),g.rounds,g.type==='killer'?g.players.map(x=>x.number):[]);$('#newP').onclick=()=>partySetup(g.type);$('#partyProfile').onclick=()=>playerDashboard(p.id);$('#homeP').onclick=home;
}

function partyExitMarkup(){return `<div class="game-exit-row"><button class="btn danger" id="exitPartyGame">Exit game</button></div>`;}
function bindPartyExit(){const b=$('#exitPartyGame');if(b)b.onclick=()=>{if(confirm('End this game without saving?')){party=null;route('home');}};}
function practiceExit(){if(confirm('Exit this training session without saving?')){practice=null;route('home');}}

function renderCricket(){
  const g=party,p=g.players[g.turn],segs=[20,19,18,17,16,15,25];
  g.mult=g.mult||1;
  const rows=segs.map(seg=>{
    const dead=g.players.every(x=>x.marks[seg]>=3);
    return `<tr class="${dead?'cricket-dead':''}"><th>${seg===25?'Bull':seg}</th>${g.players.map(x=>`<td class="cricket-mark">${cricketMarks(x.marks[seg])}</td>`).join('')}</tr>`;
  }).join('');
  view.innerHTML=`<div class="section-title"><h2>Cricket</h2><span class="muted"><strong>${esc(p.name)}</strong> · dart ${g.darts+1}/3</span></div>
  <details class="cricket-rules"><summary>How Cricket works</summary><div>Close 20–15 and Bull with 3 marks. Extra marks score while an opponent still has that target open. Close everything while level or ahead to win.</div></details>
  <div class="card table-wrap cricket-score-card"><table class="cricket-table"><thead><tr><th>Target</th>${g.players.map((x,i)=>`<th>${esc(x.name)}${i===g.turn?' ●':''}<div class="table-score">${x.score} pts</div></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="cricket-legend"><span>╱ 1</span><span>✕ 2</span><span>⊗ closed</span></div></div>
  <div class="card cricket-controls"><div class="multis cricket-mults"><button data-cm="1" class="${g.mult===1?'active':''}">Single</button><button data-cm="2" class="${g.mult===2?'active':''}">Double</button><button data-cm="3" class="${g.mult===3?'active':''}">Treble</button></div><div class="cricket-targets">${[20,19,18,17,16,15].map(seg=>`<button data-cseg="${seg}" ${g.players.every(x=>x.marks[seg]>=3)?'disabled':''}>${seg}</button>`).join('')}<button data-cbull="1" ${g.players.every(x=>x.marks[25]>=3)?'disabled':''}>Outer Bull<br><small>1 mark</small></button><button data-cbull="2" ${g.players.every(x=>x.marks[25]>=3)?'disabled':''}>Bullseye<br><small>2 marks</small></button><button class="miss-button" data-cmiss="1">Miss</button></div></div>${partyExitMarkup()}`;
  $$('[data-cm]').forEach(b=>b.onclick=()=>{g.mult=+b.dataset.cm;renderCricket();});
  $$('[data-cseg]').forEach(b=>b.onclick=()=>cricketDart(+b.dataset.cseg,g.mult));
  $$('[data-cbull]').forEach(b=>b.onclick=()=>cricketDart(25,+b.dataset.cbull));
  $('[data-cmiss]').onclick=()=>cricketDart(null,0);bindPartyExit();
}
function cricketMarks(n){return n>=3?'⊗':n===2?'✕':n===1?'╱':'—'}
function cricketDart(seg,m){
  const g=party,p=g.players[g.turn];
  if(seg){
    const before=p.marks[seg];
    const room=Math.max(0,3-before);
    const used=Math.min(room,m);
    const extra=Math.max(0,m-used);
    p.marks[seg]=Math.min(3,before+m);
    const opponentOpen=g.players.some((x,i)=>i!==g.turn&&x.marks[seg]<3);
    if(extra&&opponentOpen)p.score+=extra*(seg===25?25:seg);
  }
  g.darts++;g.mult=1;
  const closed=Object.values(p.marks).every(v=>v>=3);
  const oppScores=g.players.filter((_,i)=>i!==g.turn).map(x=>x.score);
  if(closed&&p.score>=Math.max(0,...oppScores)){partyWinner(p);return;}
  if(g.darts>=3){g.darts=0;g.turn=(g.turn+1)%g.players.length;}
  renderCricket();
}

function renderKiller(){
  const g=party,p=g.players[g.turn];
  const alive=g.players.filter(x=>x.lives>0);
  if(alive.length===1){partyWinner(alive[0]);return;}
  const cards=g.players.map((x,i)=>`<div class="killer-card ${i===g.turn?'active':''} ${x.lives<=0?'eliminated':''}"><div class="killer-card-top"><strong>${esc(x.name)}</strong><span class="killer-badge ${x.killer?'on':''}">${x.killer?'KILLER':'NOT KILLER'}</span></div><div class="killer-number">D${x.number}</div><div class="killer-lives">${Array.from({length:g.rounds},(_,n)=>`<span class="${n<x.lives?'live':''}">♥</span>`).join('')}</div>${x.lives<=0?'<div class="eliminated-label">OUT</div>':''}</div>`).join('');
  const attackButtons=g.players.filter(x=>x.id!==p.id&&x.lives>0).map(x=>`<button class="btn killer-attack" data-kattack="${x.id}"><strong>D${x.number}</strong><span>${esc(x.name)} · ${x.lives} ${x.lives===1?'life':'lives'}</span></button>`).join('');
  const controls=!p.killer?`<div class="target-focus"><span>Your Killer target</span><strong>D${p.number}</strong></div><p class="muted" style="text-align:center">Hit your own double to become a Killer. Once you qualify, any remaining darts this turn can attack.</p><div class="actions"><button class="btn primary big" id="qualifyKiller">Hit D${p.number} ✓</button><button class="btn big" id="killerMiss">Miss</button></div>`:`<div class="target-focus"><span>You are a</span><strong>👑 KILLER</strong></div><p class="muted" style="text-align:center">Each opponent double you hit removes one life. Tap the opponent you hit, or Miss.</p><div class="killer-attack-grid">${attackButtons}</div><div class="actions"><button class="btn big" id="killerMiss">Miss</button></div>`;
  view.innerHTML=`<div class="section-title"><h2>Killer</h2><span class="muted">${esc(p.name)} · dart ${g.darts+1}/3</span></div><div class="game-help"><strong>This DartDeck version</strong><span>Each player owns one number and starts with ${g.rounds} lives. Hit the <b>double of your own number</b> to become a Killer. Killers remove one life each time they hit an opponent’s double. Last player with lives wins.</span></div><div class="killer-grid">${cards}</div><div class="card">${controls}</div>${partyExitMarkup()}`;
  $('#qualifyKiller')?.addEventListener('click',()=>killerDart('qualify'));
  $('#killerMiss')?.addEventListener('click',()=>killerDart('miss'));
  $$('[data-kattack]').forEach(b=>b.onclick=()=>killerDart('attack',+b.dataset.kattack));bindPartyExit();
}
function killerDart(action,targetId=null){
  const g=party,p=g.players[g.turn];
  if(action==='qualify')p.killer=true;
  if(action==='attack'){
    const target=g.players.find(x=>x.id===targetId);
    if(target&&target.lives>0)target.lives=Math.max(0,target.lives-1);
  }
  g.darts++;
  const alive=g.players.filter(x=>x.lives>0);
  if(alive.length===1){partyWinner(alive[0]);return;}
  if(g.darts>=3){endKillerTurn();return;}
  renderKiller();
}
function endKillerTurn(){
  const g=party;g.darts=0;
  do{g.turn=(g.turn+1)%g.players.length;}while(g.players[g.turn].lives<=0);
  renderKiller();
}

function renderShanghai(){
  const g=party,p=g.players[g.turn],target=g.round;
  const visitText=g.visit.length?g.visit.map(m=>m===0?'Miss':m===1?`S${target}`:m===2?`D${target}`:`T${target}`).join(' · '):'No darts entered';
  view.innerHTML=`<div class="section-title"><h2>Shanghai</h2><span class="muted">${esc(p.name)} · dart ${g.darts+1}/3</span></div><div class="target-focus target-focus-large"><span>ROUND ${g.round} OF 7 · CURRENT TARGET</span><strong>${target}</strong></div>${scoreCards(g,()=>`Round ${g.round}`)}<div class="card"><p class="muted" style="text-align:center">Tap what each dart hit. A Single + Double + Treble of the current number in the same visit is an instant Shanghai win.</p><div class="visit-darts"><span class="${g.visit.length?'':'muted'}">${visitText}</span></div><div class="sdt-grid"><button data-sh="1"><strong>S</strong><span>Single ${target}</span></button><button data-sh="2"><strong>D</strong><span>Double ${target}</span></button><button data-sh="3"><strong>T</strong><span>Treble ${target}</span></button><button class="miss-button" data-sh="0"><strong>×</strong><span>Miss</span></button></div></div>${partyExitMarkup()}`;
  $$('[data-sh]').forEach(b=>b.onclick=()=>shanghaiDart(+b.dataset.sh));bindPartyExit();
}
function shanghaiDart(mult){
  const g=party,p=g.players[g.turn],target=g.round;
  g.visit.push(mult);g.darts++;
  if(mult>0)p.score+=target*mult;
  if([1,2,3].every(m=>g.visit.includes(m))){partyWinner(p,'Shanghai! Single + Double + Treble');return;}
  if(g.darts>=3){g.visit=[];g.darts=0;advanceRoundGame();return;}
  renderShanghai();
}

function halveTarget(r){return ['20','16','D7','14','T10','17','Bull'][r-1]||'Bull'}
function halveHelp(target){
  if(target==='D7')return 'Only Double 7 counts — enter 14, 28 or 42 for the visit.';
  if(target==='T10')return 'Only Treble 10 counts — enter 30, 60 or 90 for the visit.';
  if(target==='Bull')return 'Only Bull counts — outer Bull = 25 and inner Bull = 50.';
  return `Only hits on ${target} count. Singles, doubles and trebles score their normal value.`;
}
function renderHalveIt(){
  const g=party,p=g.players[g.turn],target=halveTarget(g.round);
  view.innerHTML=`<div class="section-title"><h2>Halve-It</h2><span class="muted">Round ${g.round} of 7 · ${esc(p.name)}</span></div><div class="target-focus target-focus-large"><span>CURRENT TARGET</span><strong>${target}</strong></div>${scoreCards(g,()=>`Round ${g.round}`)}<div class="card"><p class="muted" style="text-align:center">${halveHelp(target)} Enter the total from your three darts. Enter <b>0</b> if you missed the target completely — your running score will be halved.</p>${partyQuickPad('halve',g.quick,'Points scored on this target')}</div>${partyExitMarkup()}`;
  bindPartyQuickPad('halve',g,n=>{p.score=n===0?Math.floor(p.score/2):p.score+n;g.quick='';advanceRoundGame();});bindPartyExit();
}

function practiceMenu(){
  setGameplayActive(false);
  const modes=[
    ['🎯','Checkout Trainer','Random finishes with route advice.','checkout'],
    ['🎯','Doubles Trainer','Practise the doubles that matter, with hit-rate analytics.','doubles'],
    ['🔢','121','Keep a running total and finish each target within 9 darts.','121'],
    ['🎯','Bob’s 27','D1 through D20, then Bull — three darts at every double.','bobs27']
  ];
  view.innerHTML=`<div class="training-centre-hero card"><div><span class="eyebrow">PRACTICE WITH PURPOSE</span><h2>Training Centre</h2><p class="muted">Build checkout confidence, expose weak doubles and track improvement over time. Every recorded session feeds your Player Dashboard.</p></div><div class="training-centre-mark">🎯</div></div><div class="grid training-centre-grid">${modes.map(m=>`<button class="card click" data-practice="${m[3]}" style="text-align:left;color:inherit"><div class="emoji">${m[0]}</div><h2>${m[1]}</h2><p class="muted">${m[2]}</p></button>`).join('')}</div>`;
  $$('[data-practice]').forEach(b=>b.onclick=()=>practiceSetup(b.dataset.practice));
}
const DOUBLE_PRESETS={
  all:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25],
  checkout:[20,16,18,12,10,8,4,6,14,2],
  power:[20,16,18,12,10,8]
};
function doubleLabel(n){return +n===25?'Bull':`D${n}`;}
function renderDoubleTargetChoices(){return DOUBLE_PRESETS.all.map(n=>`<label class="double-choice"><input type="checkbox" name="doubleTarget" value="${n}" ${DOUBLE_PRESETS.power.includes(n)?'checked':''}><span>${doubleLabel(n)}</span></label>`).join('');}
async function practiceSetup(mode){
  setGameplayActive(false);await loadPlayers();if(!players.length){route('players');return;}
  const doublesSetup=mode==='doubles'?`<div class="training-options"><h3>Session type</h3><div class="training-mode-grid">
    <label class="training-mode-option"><input type="radio" name="doubleMode" value="all"><span><strong>All Doubles</strong><small>D1 → D20 + Bull</small></span></label>
    <label class="training-mode-option"><input type="radio" name="doubleMode" value="checkout" checked><span><strong>Checkout Doubles</strong><small>D20, D16, D18, D12, D10, D8…</small></span></label>
    <label class="training-mode-option"><input type="radio" name="doubleMode" value="weak"><span><strong>Weakest Doubles</strong><small>Your six lowest recorded hit rates</small></span></label>
    <label class="training-mode-option"><input type="radio" name="doubleMode" value="custom"><span><strong>Custom</strong><small>Choose exactly what to practise</small></span></label>
  </div><div class="form-grid training-pass-row"><label>Passes through targets<select id="doublePasses"><option value="1" selected>1 pass</option><option value="2">2 passes</option><option value="3">3 passes</option></select></label></div><div id="customDoubleWrap" class="custom-double-wrap hidden"><h4>Choose doubles</h4><div class="double-choice-grid">${renderDoubleTargetChoices()}</div></div><div id="weakDoubleHint" class="game-help hidden"><strong>Adaptive session</strong><span>DartDeck will choose your six weakest recorded doubles. If there is not enough history yet, it will start with the common checkout doubles.</span></div></div>`:'';
  view.innerHTML=`<div class="section-title"><h2>${practiceName(mode)}</h2><span class="muted">Training Centre</span></div><div class="card"><div class="form-grid"><label>Player<select id="pracPlayer">${players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div>${doublesSetup}<div id="trainingSnapshot" class="training-snapshot"></div><div class="actions"><button class="btn primary big" id="startPractice">Start</button><button class="btn" id="backTrainingCentre">Training Centre</button></div></div>`;
  const remembered=lastTrainingPlayerId();if(remembered)$('#pracPlayer').value=String(remembered);
  const snapshot=async()=>{const id=+$('#pracPlayer').value,el=$('#trainingSnapshot');el.innerHTML='<span class="muted">Loading training history…</span>';try{const a=await api(`/api/training-analytics/${id}`);if(mode==='checkout')el.innerHTML=`<strong>${a.checkout.attempts?fmt(a.checkout.rate,1)+'%':'No recorded sessions yet'}</strong><span>Checkout success · ${a.checkout.hits} from ${a.checkout.attempts} attempts</span>`;if(mode==='121')el.innerHTML=`<strong>${a['121'].best_target||'No recorded target yet'}</strong><span>Best completed target · ${a['121'].sessions} sessions</span>`;if(mode==='bobs27')el.innerHTML=`<strong>${a.bobs27.best_score||'No recorded score yet'}</strong><span>Personal best</span>`;if(mode==='doubles'){const d=a.doubles||{};el.innerHTML=`<strong>${d.darts?fmt(d.rate,1)+'%':'No Doubles Trainer sessions yet'}</strong><span>${d.darts?`${d.hits} hits from ${d.darts} darts${d.best_doubles?.length?` · strongest ${d.best_doubles[0].target} (${fmt(d.best_doubles[0].rate,0)}%)`:''}`:'Your first session will start building double-by-double feedback.'}</span>`;}}catch(e){el.innerHTML='<span class="muted">No training history available.</span>';}};
  $('#pracPlayer').onchange=snapshot;await snapshot();
  if(mode==='doubles'){
    const syncDoubleOptions=()=>{const selected=document.querySelector('input[name="doubleMode"]:checked')?.value||'checkout';$('#customDoubleWrap').classList.toggle('hidden',selected!=='custom');$('#weakDoubleHint').classList.toggle('hidden',selected!=='weak');};
    $$('input[name="doubleMode"]').forEach(r=>r.onchange=syncDoubleOptions);syncDoubleOptions();
  }
  $('#backTrainingCentre').onclick=practiceMenu;
  $('#startPractice').onclick=async()=>{const id=+$('#pracPlayer').value;rememberTrainingPlayer(id);let options={};if(mode==='doubles'){
      const submode=document.querySelector('input[name="doubleMode"]:checked')?.value||'checkout',passes=+$('#doublePasses').value||1;let targets=[];
      if(submode==='all')targets=[...DOUBLE_PRESETS.all];
      else if(submode==='checkout')targets=[...DOUBLE_PRESETS.checkout];
      else if(submode==='custom')targets=$$('input[name="doubleTarget"]:checked').map(x=>+x.value);
      else {try{const a=await api(`/api/training-analytics/${id}`);targets=(a.doubles?.weak_doubles||[]).slice(0,6).map(x=>x.target==='Bull'?25:+String(x.target).replace('D','')).filter(Boolean);}catch(e){}for(const n of DOUBLE_PRESETS.power){if(targets.length>=6)break;if(!targets.includes(n))targets.push(n);}if(!targets.length)targets=[...DOUBLE_PRESETS.power];}
      if(!targets.length){toast('Choose at least one double',2200);return;}
      options={submode,passes,targets};
    }startPractice(mode,id,options);};
}
function practiceName(m){return ({checkout:'Checkout Trainer',doubles:'Doubles Trainer','121':'121',bobs27:"Bob's 27"})[m]}
function startPractice(mode,playerId,options={}){
  setGameplayActive(true);document.body.classList.remove('x01-gameplay');const p=players.find(x=>x.id===playerId);
  const doubleSequence=mode==='doubles'?Array.from({length:options.passes||1},()=>options.targets||DOUBLE_PRESETS.checkout).flat():[];
  practice={mode,player:p,options,round:1,score:mode==='bobs27'?27:0,target:mode==='121'?121:mode==='checkout'?randomCheckout():1,remaining:mode==='121'?121:0,hits:0,attempts:0,targetVisit:1,quick:'',checkoutPending:false,busted:false,lastTarget:null,targetHits:{},targetDarts:{},doubleSequence,doubleIndex:0};
  renderPractice();
}
function randomCheckout(){const choices=[];for(let n=40;n<=170;n++)if(getCheckout(n,'double'))choices.push(n);return choices[Math.floor(Math.random()*choices.length)];}
function renderPractice(){const g=practice;if(g.mode==='checkout')return renderCheckoutTrainer();if(g.mode==='doubles')return renderDoublesTrainer();if(g.mode==='121')return render121();if(g.mode==='bobs27')return renderBobs27();}
function renderCheckoutTrainer(){
  const g=practice,rate=g.attempts?g.hits*100/g.attempts:0;
  view.innerHTML=`<div class="section-title"><h2>${practiceName(g.mode)}</h2><span class="muted">Round ${g.round}</span></div><div class="card"><div class="target-big">${g.target}</div><div class="checkout"><strong>Route:</strong> ${(getCheckout(g.target,'double')||['No route']).join(' → ')}</div><p class="muted" style="text-align:center">Did you finish it within 3 darts?</p><div class="actions"><button class="btn primary big" data-pr="hit">Checkout ✓</button><button class="btn big" data-pr="miss">Miss</button></div><div class="training-live"><strong>${fmt(rate,1)}%</strong><span>${g.hits} checkouts from ${g.attempts} attempts</span></div><div class="actions"><button class="btn" id="endTraining">End session</button><button class="btn danger" id="exitTraining">Exit</button></div></div>`;
  $$('[data-pr]').forEach(b=>b.onclick=()=>{g.attempts++;if(b.dataset.pr==='hit')g.hits++;g.target=randomCheckout();g.round++;renderPractice();});$('#endTraining').onclick=finishPractice;$('#exitTraining').onclick=practiceExit;
}
function renderDoublesTrainer(){
  const g=practice,target=g.doubleSequence[g.doubleIndex],label=doubleLabel(target),rate=g.attempts?g.hits*100/g.attempts:0,total=g.doubleSequence.length;
  if(target==null){finishPractice();return;}
  const subLabel=({all:'All Doubles',checkout:'Checkout Doubles',weak:'Weakest Doubles',custom:'Custom'})[g.options.submode]||'Doubles';
  view.innerHTML=`<div class="section-title"><h2>Doubles Trainer</h2><span class="muted">${subLabel}</span></div><div class="training-score-grid"><div class="target-focus target-focus-large"><span>CURRENT TARGET · ${g.doubleIndex+1} OF ${total}</span><strong>${label}</strong></div><div class="target-focus"><span>SESSION ACCURACY</span><strong>${g.attempts?fmt(rate,0)+'%':'—'}</strong></div></div><div class="card"><p class="muted" style="text-align:center">Throw three darts at <b>${label}</b>, then record how many hit the double.</p><div class="hit-count-grid">${[0,1,2,3].map(n=>`<button class="${n?'primary':''}" data-doublehit="${n}"><strong>${n}</strong><span>${n===1?'hit':'hits'}</span></button>`).join('')}</div><div class="training-live"><strong>${g.hits} / ${g.attempts}</strong><span>Hits from darts thrown so far</span></div><div class="actions"><button class="btn" id="endTraining">End session</button><button class="btn danger" id="exitTraining">Exit</button></div></div>`;
  $$('[data-doublehit]').forEach(b=>b.onclick=()=>doublesVisit(+b.dataset.doublehit));$('#endTraining').onclick=finishPractice;$('#exitTraining').onclick=practiceExit;
}
function doublesVisit(hits){const g=practice,target=g.doubleSequence[g.doubleIndex],key=String(target);g.targetHits[key]=(g.targetHits[key]||0)+hits;g.targetDarts[key]=(g.targetDarts[key]||0)+3;g.hits+=hits;g.attempts+=3;g.lastTarget=doubleLabel(target);g.doubleIndex++;g.round++;if(g.doubleIndex>=g.doubleSequence.length){finishPractice();return;}renderDoublesTrainer();}
function practiceQuickPad(prefix,value,label='Enter visit score'){return partyQuickPad(prefix,value,label);}
function bindPracticeQuickPad(prefix,state,onSubmit){bindPartyQuickPad(prefix,state,onSubmit);}
function render121(){
  const g=practice,dartsLeft=(4-g.targetVisit)*3,routeNow=g.remaining<=170?(getCheckout(g.remaining,'double')||null):null;
  const pending=g.checkoutPending?`<div class="checkout-confirm"><div class="checkout-confirm-icon">🎯</div><div><strong>Did that visit finish on a double?</strong><p>You entered <b>${g.checkoutPending.score}</b> from ${g.checkoutPending.from}. Quick scoring keeps the tally without making you remember the exact darts.</p><div class="actions" style="justify-content:flex-start"><button class="btn primary" id="p121Yes">Yes — checkout ✓</button><button class="btn" id="p121No">No — bust</button></div></div></div>`:'';
  const entry=g.checkoutPending?'':`<div class="card"><p class="muted" style="text-align:center">Enter the total scored with your next three darts. DartDeck keeps the running total for all three visits.</p>${practiceQuickPad('p121',g.quick,'Visit score')}</div>`;
  view.innerHTML=`<div class="section-title"><h2>121</h2><span class="muted">Attempt ${g.round}</span></div><div class="training-score-grid"><div class="target-focus"><span>ATTEMPT TARGET</span><strong>${g.target}</strong></div><div class="target-focus"><span>REMAINING</span><strong>${g.remaining}</strong></div></div><div class="practice-progress"><strong>Visit ${g.targetVisit} of 3</strong><span>${dartsLeft} darts remaining</span></div>${routeNow?`<div class="checkout"><strong>Checkout:</strong> ${routeNow.join(' → ')}</div>`:`<div class="checkout"><strong>Setup:</strong> ${suggestSetup(g.remaining)}</div>`}${pending}${entry}<div class="training-live"><strong>${g.hits?g.target-1:'—'}</strong><span>Best target this session · ${g.hits} successful levels / ${g.attempts} completed attempts</span></div><div class="actions"><button class="btn" id="endTraining">End session</button><button class="btn danger" id="exitTraining">Exit</button></div>`;
  if(g.checkoutPending){$('#p121Yes').onclick=()=>complete121(true);$('#p121No').onclick=()=>{g.checkoutPending=false;toast('Bust — score restored');advance121Visit();};}else bindPracticeQuickPad('p121',g,n=>submit121Visit(n));$('#endTraining').onclick=finishPractice;$('#exitTraining').onclick=practiceExit;
}
function submit121Visit(n){const g=practice,before=g.remaining;g.quick='';const left=before-n;if(left<0||left===1){toast('Bust — score restored');advance121Visit();return;}if(left===0){g.checkoutPending={from:before,score:n};render121();return;}g.remaining=left;advance121Visit();}
function advance121Visit(){const g=practice;g.checkoutPending=false;g.quick='';if(g.targetVisit<3){g.targetVisit++;render121();return;}g.attempts++;g.round++;g.targetVisit=1;g.remaining=g.target;toast(`${g.target} not finished in 9 darts — try it again`,2400);render121();}
function complete121(success){const g=practice;g.checkoutPending=false;g.quick='';if(!success){advance121Visit();return;}g.hits++;g.attempts++;const done=g.target;g.target++;g.remaining=g.target;g.round++;g.targetVisit=1;toast(`Checked out ${done} — next target ${g.target}`,2200);render121();}
function renderBobs27(){
  const g=practice,targetLabel=g.target===21?'Bull':'D'+g.target,doubleValue=g.target===21?50:g.target*2;
  view.innerHTML=`<div class="section-title"><h2>Bob's 27</h2><span class="muted">Score ${g.score}</span></div><div class="game-help"><strong>D1 → D20 → Bull</strong><span>Three darts at each double. Every hit adds the double’s value; miss all three and that value is subtracted. Reach zero or below and the game ends.</span></div><div class="training-score-grid"><div class="target-focus target-focus-large"><span>CURRENT TARGET · ${g.target} OF 21</span><strong>${targetLabel}</strong></div><div class="target-focus"><span>CURRENT SCORE</span><strong>${g.score}</strong></div></div><div class="card"><p class="muted" style="text-align:center">How many of your three darts hit <b>${targetLabel}</b>? ${targetLabel==='Bull'?'Each inner Bull hit is worth 50.':`Each hit is worth ${doubleValue}.`}</p><div class="hit-count-grid">${[0,1,2,3].map(n=>`<button class="${n?'primary':''}" data-bobhit="${n}"><strong>${n}</strong><span>${n===1?'hit':'hits'}</span></button>`).join('')}</div><div class="actions"><button class="btn" id="endTraining">End session</button><button class="btn danger" id="exitTraining">Exit</button></div></div>`;
  $$('[data-bobhit]').forEach(b=>b.onclick=()=>bob27Visit(+b.dataset.bobhit));$('#endTraining').onclick=finishPractice;$('#exitTraining').onclick=practiceExit;
}
function bob27Visit(hits){const g=practice,targetLabel=g.target===21?'Bull':'D'+g.target,doubleValue=g.target===21?50:g.target*2,key=g.target===21?'25':String(g.target);g.targetHits[key]=hits;g.targetDarts[key]=3;g.hits+=hits;g.attempts+=3;g.lastTarget=targetLabel;g.score+=hits>0?doubleValue*hits:-doubleValue;if(g.score<=0){g.busted=true;finishPractice();return;}if(g.target===21){finishPractice();return;}g.target++;renderBobs27();}
async function finishPractice(){
  setGameplayActive(false);const g=practice;let score=0,detail={};
  if(g.mode==='checkout'){score=g.attempts?g.hits*100/g.attempts:0;detail={hits:g.hits,attempts:g.attempts};}
  if(g.mode==='doubles'){score=g.attempts?g.hits*100/g.attempts:0;detail={hits:g.hits,darts:g.attempts,submode:g.options.submode||'checkout',passes:g.options.passes||1,target_hits:g.targetHits,target_darts:g.targetDarts};}
  if(g.mode==='121'){score=g.hits?g.target-1:0;detail={hits:g.hits,attempts:g.attempts,current_target:g.target};}
  if(g.mode==='bobs27'){score=g.score;detail={hits:g.hits,darts:g.attempts,last_target:g.lastTarget,busted:g.busted,target_hits:g.targetHits,target_darts:g.targetDarts};}
  try{await api('/api/practice',{method:'POST',body:JSON.stringify({player_id:g.player.id,mode:g.mode,score,details_json:JSON.stringify(detail)})});}catch(e){toast('Result could not be saved',2600);}
  let analytics={};try{analytics=await api(`/api/training-analytics/${g.player.id}`);}catch(e){}
  let title='',summary='',metrics='';
  if(g.mode==='checkout'){title='Checkout session complete';summary=`${g.hits} finishes from ${g.attempts} attempts`;metrics=`<div class="finish-highlight-grid"><div><strong>${g.attempts?fmt(g.hits*100/g.attempts,1)+'%':'—'}</strong><span>Session rate</span></div><div><strong>${analytics.checkout?.rate?fmt(analytics.checkout.rate,1)+'%':'—'}</strong><span>All-time rate</span></div></div>`;}
  if(g.mode==='doubles'){const sessionRate=g.attempts?g.hits*100/g.attempts:0,d=analytics.doubles||{};title='Doubles session complete';summary=`${g.hits} hits from ${g.attempts} darts`;metrics=`<div class="finish-highlight-grid"><div><strong>${fmt(sessionRate,1)}%</strong><span>Session accuracy</span></div><div><strong>${d.darts?fmt(d.rate,1)+'%':'—'}</strong><span>All-time accuracy</span></div></div>${d.best_doubles?.length?`<div class="card training-finish-detail"><h3>Strongest doubles</h3>${trainingBars(d.best_doubles)}${d.weak_doubles?.length?`<h3 style="margin-top:16px">Needs work</h3>${trainingBars(d.weak_doubles)}`:''}</div>`:''}`;}
  if(g.mode==='121'){title='121 session complete';summary=g.hits?`Reached and completed ${g.target-1}`:'No level completed this session';metrics=`<div class="finish-highlight-grid"><div><strong>${g.hits?g.target-1:'—'}</strong><span>Session best</span></div><div><strong>${analytics['121']?.best_target||'—'}</strong><span>Personal best</span></div></div>`;}
  if(g.mode==='bobs27'){title=g.busted?'Bob’s 27 — game over':'Bob’s 27 complete';summary=g.busted?`Out at ${g.lastTarget} · final score ${g.score}`:`Made it from D1 through Bull · final score ${g.score}`;metrics=`<div class="finish-highlight-grid"><div><strong>${g.score}</strong><span>Final score</span></div><div><strong>${analytics.bobs27?.best_score||g.score}</strong><span>Personal best</span></div></div>`;}
  view.innerHTML=`<div class="card result-hero result-complete"><div class="result-crown">🎯</div><span class="eyebrow">TRAINING SAVED</span><h2>${title}</h2><p class="muted">${summary}</p>${metrics}</div><div class="actions finish-actions"><button class="btn primary big" id="pracAgain">Again</button><button class="btn" id="pracProfile">Player dashboard</button><button class="btn" id="pracMenu">Training Centre</button><button class="btn" id="pracHome">Home</button></div>`;
  $('#pracAgain').onclick=()=>startPractice(g.mode,g.player.id,g.options||{});$('#pracProfile').onclick=()=>playerDashboard(g.player.id);$('#pracMenu').onclick=practiceMenu;$('#pracHome').onclick=home;
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
if(!IS_NATIVE_MOBILE && 'serviceWorker' in navigator){
  navigator.serviceWorker.register('/service-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{serviceWorkerReady=true;if(view.dataset.page==='settings')settingsView();}).catch(()=>{});
}
Promise.all([loadSettings(),loadPlayers()]).finally(()=>{
  updateInstallButton();
  const go=new URLSearchParams(location.search).get('go');
  route(go||'home');
});
