const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const view = $('#view');
const toastEl = $('#toast');

let players = [];
let x01 = null;
let party = null;
let practice = null;

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
  view.innerHTML = `
    <div class="grid">
      ${homeCard('🎯','Quick Game','301, 501 or 701 for up to four players.','x01-setup')}
      ${homeCard('👥','Party Games','Cricket, Killer, Shanghai and more.','party-menu')}
      ${homeCard('🏋️','Solo Practice','Checkouts, doubles and scoring drills.','practice-menu')}
      ${homeCard('📊','Stats','Lifetime averages, 180s and checkout data.','stats')}
    </div>
    <div class="section-title"><h2>Designed for the oche</h2></div>
    <div class="card"><p class="muted">Large touch targets, fast score entry, undo support, checkout routes and installable PWA support. Your players and match history are stored in the Docker volume.</p></div>`;
  $$('[data-go]').forEach(b=>b.onclick=()=>route(b.dataset.go));
}
function homeCard(e,t,d,go){return `<button class="card click" data-go="${go}" style="text-align:left;color:inherit"><div class="emoji">${e}</div><h2>${t}</h2><p class="muted">${d}</p></button>`}

async function playerManager(){
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
  const rows=await api('/api/stats');
  view.innerHTML=`<div class="section-title"><h2>Player stats</h2><span class="muted">Recorded X01 history</span></div><div class="card table-wrap"><table>
  <thead><tr><th>Player</th><th>Matches</th><th>Legs</th><th>Avg</th><th>Best Avg</th><th>High CO</th><th>High Visit</th><th>180s</th><th>CO%</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${r.matches}</td><td>${r.legs_won}</td><td>${fmt(r.lifetime_average,2)}</td><td>${fmt(r.best_average,2)}</td><td>${r.highest_checkout}</td><td>${r.highest_visit}</td><td>${r.total_180s}</td><td>${r.checkout_attempts?fmt(r.checkouts/r.checkout_attempts*100,0)+'%':'—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No stats recorded yet.</td></tr>'}</tbody></table></div>`;
}

async function x01Setup(){
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
  const selected=cfg.ids.map(id=>players.find(p=>p.id===id));
  x01={...cfg, players:selected.map(p=>basePlayer(p,cfg.start)), turn:0, visit:[], mult:1, quick:'', history:[], finished:false, legNo:1};
  renderX01();
}

function renderX01(){
  const g=x01, active=g.players[g.turn];
  const route=getCheckout(active.score,g.out);
  view.innerHTML=`
  <div class="section-title"><h2>${g.start} · Leg ${g.legNo}</h2><span class="muted">First to ${Math.floor(g.bestOf/2)+1} legs</span></div>
  <div class="scoreboard">${g.players.map((p,i)=>playerScoreCard(p,i===g.turn,g)).join('')}</div>
  <div class="checkout">${route ? `<strong>Checkout:</strong> ${route.join(' → ')}` : `<strong>${active.score}</strong> remaining · ${setupSuggestion(active.score,g.out)}`}</div>
  <div class="card">
    <div class="game-status">${esc(active.name)} to throw ${g.doubleIn&&!active.in?'· needs a double to get in':''}</div>
    ${g.mode==='quick'?quickInput():dartInput()}
    <div class="actions">
      <button class="btn" id="switchInput">${g.mode==='quick'?'Dart-by-dart':'Quick score'}</button>
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
  <div class="actions"><button class="btn" id="clearDarts">Clear darts</button><button class="btn primary big" id="submitDarts">Submit visit</button></div>`;
}
function bindX01(){
  $('#switchInput').onclick=()=>{
    const p=x01.players[x01.turn];
    if(x01.doubleIn && !p.in && x01.mode==='darts'){toast('Stay in dart-by-dart mode until this player is in');return;}
    x01.mode=x01.mode==='quick'?'darts':'quick'; x01.quick=''; x01.visit=[]; renderX01();
  };
  $('#undo').onclick=undoX01; $('#endGame').onclick=()=>{if(confirm('End this game without saving?')) route('home')};
  if(x01.mode==='quick'){
    $$('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='C')x01.quick='';else if(k==='⌫')x01.quick=x01.quick.slice(0,-1);else if(x01.quick.length<3)x01.quick+=k; $('#quickTotal').textContent=x01.quick||'—';});
    $('#submitQuick').onclick=()=>{const n=+x01.quick;if(x01.quick===''||n<0||n>180){toast('Enter a score from 0 to 180');return;} commitVisit({score:n,darts:3,finishDarts:null,labels:[String(n)],dartObjs:null});};
  } else {
    $$('[data-m]').forEach(b=>b.onclick=()=>{const m=+b.dataset.m;if(m===0){addDart(0,0);return;}x01.mult=m;renderX01();});
    $$('[data-seg]').forEach(b=>b.onclick=()=>addDart(+b.dataset.seg,x01.mult));
    $('#clearDarts').onclick=()=>{x01.visit=[];renderX01();};
    $('#submitDarts').onclick=()=>{if(!x01.visit.length){toast('Enter at least one dart');return;} const score=x01.visit.reduce((a,d)=>a+d.score,0); commitVisit({score,darts:x01.visit.length,finishDarts:x01.visit.length,labels:x01.visit.map(d=>d.label),dartObjs:[...x01.visit]});};
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
function undoX01(){if(!x01.history.length){toast('Nothing to undo');return;}const s=JSON.parse(x01.history.pop());x01.players=s.players;x01.turn=s.turn;x01.legNo=s.legNo;x01.quick='';x01.visit=[];renderX01();}

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
        g.history.pop(); g.mode='darts'; g.quick=''; g.visit=[];
        toast('Enter the finishing visit dart-by-dart so the out can be validated',2800); renderX01(); return;
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
  g.turn=(g.turn+1)%g.players.length; g.quick=''; g.visit=[]; renderX01();
}
function startNextLeg(){const g=x01;g.legNo++;g.turn=(g.legNo-1)%g.players.length;g.players.forEach(p=>{p.score=g.start;p.in=false;p.first9Points=0;p.first9Darts=0;});g.quick='';g.visit=[];renderX01();}
async function finishMatch(winner){
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
  const games=[['🏏','Cricket','Close 15–20 + Bull, with scoring.','cricket'],['👑','Killer','Earn killer status, then take opponents’ lives.','killer'],['🌏','Shanghai','Seven rounds; S+D+T wins instantly.','shanghai'],['✂️','Halve-It','Miss the target and your score is halved.','halveit'],['⏰','Around the Clock','Race from 1 through 20.','around'],['💯','Count-Up','Highest total after the chosen rounds wins.','countup']];
  view.innerHTML=`<div class="section-title"><h2>Party games</h2></div><div class="grid">${games.map(g=>`<button class="card click" data-party="${g[3]}" style="text-align:left;color:inherit"><div class="emoji">${g[0]}</div><h2>${g[1]}</h2><p class="muted">${g[2]}</p></button>`).join('')}</div>`;
  $$('[data-party]').forEach(b=>b.onclick=()=>partySetup(b.dataset.party));
}
async function partySetup(type){
  await loadPlayers(); if(players.length<1){route('players');return;}
  const opts=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  view.innerHTML=`<div class="section-title"><h2>${partyName(type)}</h2></div><div class="card"><div class="form-grid"><label>Players<select id="pc"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label>Rounds / lives<input id="rounds" type="number" min="1" max="20" value="${type==='killer'?3:type==='countup'?8:type==='shanghai'?7:7}"></label></div><div id="ps" class="form-grid" style="margin-top:12px"></div><div class="actions"><button class="btn primary big" id="startParty">Start</button></div></div>`;
  const rs=()=>{$('#ps').innerHTML=Array.from({length:+$('#pc').value},(_,i)=>`<label>Player ${i+1}<select class="pp">${opts}</select></label>`).join('');$$('.pp').forEach((s,i)=>s.selectedIndex=Math.min(i,players.length-1));};rs();$('#pc').onchange=rs;
  $('#startParty').onclick=()=>{const ids=$$('.pp').map(s=>+s.value);if(new Set(ids).size!==ids.length){toast('Choose different players');return;} startParty(type,ids,+$('#rounds').value);};
}
function partyName(t){return ({cricket:'Cricket',killer:'Killer',shanghai:'Shanghai',halveit:'Halve-It',around:'Around the Clock',countup:'Count-Up'})[t]}
function startParty(type,ids,rounds){
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
function partyWinner(p,extra=''){view.innerHTML=`<div class="card"><div class="target-big">🏆</div><h2 style="text-align:center">${esc(p.name)} wins!</h2><p class="muted" style="text-align:center">${extra}</p><div class="actions"><button class="btn primary" id="againP">Play again</button><button class="btn" id="homeP">Home</button></div></div>`;$('#againP').onclick=()=>partySetup(party.type);$('#homeP').onclick=home;}

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
  const modes=[['🎯','Checkout Trainer','Random finishes with route advice.','checkout'],['🔢','121','Climb through checkouts from 121.','121'],['🎯','Bob’s 27','Work through every double.','bobs27'],['⭕','Doubles Around Board','Track hits from D1 to Bull.','doubles'],['🔥','Scoring Trainer','Fixed visits for maximum scoring.','scoring'],['👤','Solo X01','Play 301/501/701 against yourself.','solox01']];
  view.innerHTML=`<div class="section-title"><h2>Solo practice</h2></div><div class="grid">${modes.map(m=>`<button class="card click" data-practice="${m[3]}" style="text-align:left;color:inherit"><div class="emoji">${m[0]}</div><h2>${m[1]}</h2><p class="muted">${m[2]}</p></button>`).join('')}</div>`;
  $$('[data-practice]').forEach(b=>b.onclick=()=>practiceSetup(b.dataset.practice));
}
async function practiceSetup(mode){
  await loadPlayers(); if(!players.length){route('players');return;}
  view.innerHTML=`<div class="section-title"><h2>${practiceName(mode)}</h2></div><div class="card"><div class="form-grid"><label>Player<select id="pracPlayer">${players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>${mode==='solox01'?'<label>Starting score<select id="pracStart"><option>301</option><option selected>501</option><option>701</option></select></label>':''}</div><div class="actions"><button class="btn primary big" id="startPractice">Start</button></div></div>`;
  $('#startPractice').onclick=()=>{if(mode==='solox01'){const id=+$('#pracPlayer').value;startX01({start:+$('#pracStart').value,ids:[id],doubleIn:false,out:'double',bestOf:1,mode:'darts'});return;} startPractice(mode,+$('#pracPlayer').value);};
}
function practiceName(m){return ({checkout:'Checkout Trainer','121':'121',bobs27:"Bob's 27",doubles:'Doubles Around Board',scoring:'Scoring Trainer',solox01:'Solo X01'})[m]}
function startPractice(mode,playerId){
  const p=players.find(x=>x.id===playerId);
  practice={mode,player:p,round:1,score:mode==='bobs27'?27:0,target:mode==='121'?121:mode==='checkout'?randomCheckout():mode==='doubles'?1:20,hits:0,attempts:0,visits:0,total:0};renderPractice();
}
function randomCheckout(){const choices=[];for(let n=40;n<=170;n++)if(getCheckout(n,'double'))choices.push(n);return choices[Math.floor(Math.random()*choices.length)];}
function renderPractice(){
  const g=practice;
  if(g.mode==='checkout'||g.mode==='121'){
    view.innerHTML=`<div class="section-title"><h2>${practiceName(g.mode)}</h2><span class="muted">Round ${g.round}</span></div><div class="card"><div class="target-big">${g.target}</div><div class="checkout"><strong>Route:</strong> ${(getCheckout(g.target,'double')||['No route']).join(' → ')}</div><p class="muted" style="text-align:center">Did you finish it within 3 darts?</p><div class="actions"><button class="btn primary big" data-pr="hit">Checkout ✓</button><button class="btn big" data-pr="miss">Miss</button></div><p class="game-status">${g.hits} checkouts from ${g.attempts} attempts</p></div>`;
    $$('[data-pr]').forEach(b=>b.onclick=()=>{g.attempts++;if(b.dataset.pr==='hit'){g.hits++;g.target=g.mode==='121'?g.target+1:randomCheckout();}else if(g.mode==='checkout')g.target=randomCheckout();g.round++;renderPractice();});
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
  const g=practice; let score=0,detail={};
  if(g.mode==='bobs27'){score=g.score;detail={hits:g.hits,darts:g.attempts};}
  if(g.mode==='doubles'){score=g.attempts?g.hits/g.attempts*100:0;detail={hits:g.hits,darts:g.attempts};}
  if(g.mode==='scoring'){score=g.total/20;detail={total:g.total,visits:g.visits};}
  try{await api('/api/practice',{method:'POST',body:JSON.stringify({player_id:g.player.id,mode:g.mode,score,details_json:JSON.stringify(detail)})});}catch(e){}
  view.innerHTML=`<div class="card"><div class="target-big">✓</div><h2 style="text-align:center">Session complete</h2><p style="text-align:center" class="muted">${g.mode==='bobs27'?`Final score: ${g.score}`:g.mode==='doubles'?`Double hit rate: ${fmt(score,1)}%`:`Average visit: ${fmt(score,1)}`}</p><div class="actions"><button class="btn primary" id="pracAgain">Again</button><button class="btn" id="pracHome">Home</button></div></div>`;
  $('#pracAgain').onclick=()=>practiceSetup(g.mode);$('#pracHome').onclick=home;
}

function route(name){
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='home')home(); else if(name==='players')playerManager(); else if(name==='stats')statsView(); else if(name==='x01-setup')x01Setup(); else if(name==='party-menu')partyMenu(); else if(name==='practice-menu')practiceMenu();
}
$$('[data-nav]').forEach(b=>b.onclick=()=>route(b.dataset.nav));
if('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
loadPlayers().finally(home);
