(() => {
  'use strict';
  const DB_NAME='dartdeck-local';
  const DB_VERSION=2;
  const DEFAULT_SETTINGS={theme_id:'midnight',primary_color:'#9bc56a',accent_color:'#c4df9a',background_color:'#0d0f10',panel_color:'#171a1c',text_color:'#f4f6f1',muted_color:'#aeb5ad',font:'modern',keep_awake:true,dartboard_mode:true,has_custom_favicon:false};
  let dbPromise;
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('players'))db.createObjectStore('players',{keyPath:'id',autoIncrement:true});
        if(!db.objectStoreNames.contains('matches'))db.createObjectStore('matches',{keyPath:'id',autoIncrement:true});
        if(!db.objectStoreNames.contains('practice'))db.createObjectStore('practice',{keyPath:'id',autoIncrement:true});
        if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function storeOp(store,mode,fn){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),s=tx.objectStore(store);let req;try{req=fn(s);}catch(e){reject(e);return;}if(req){req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}else{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}});}
  const all=s=>storeOp(s,'readonly',x=>x.getAll());
  const add=(s,v)=>storeOp(s,'readwrite',x=>x.add(v));
  const put=(s,v)=>storeOp(s,'readwrite',x=>x.put(v));
  const del=(s,k)=>storeOp(s,'readwrite',x=>x.delete(k));
  const get=(s,k)=>storeOp(s,'readonly',x=>x.get(k));
  const now=()=>new Date().toISOString();
  const uid=(prefix='rec')=>`${prefix}-${(crypto?.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2))}`;
  const parseBody=o=>{if(!o?.body)return{};if(typeof o.body==='string'){try{return JSON.parse(o.body)}catch(e){return{}}}return o.body||{}};
  const jsonObj=raw=>{try{const v=JSON.parse(raw||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(e){return{}}};
  const round=(n,d=2)=>Number((Number(n)||0).toFixed(d));
  async function players(){return (await all('players')).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));}
  async function matches(){return await all('matches');}
  async function practice(){return await all('practice');}
  async function settings(){const rows=await all('settings'),v={...DEFAULT_SETTINGS};rows.forEach(r=>{if(r.key in v)v[r.key]=r.value});v.has_custom_favicon=false;return v;}
  async function saveSettings(data){for(const [key,value] of Object.entries(data))await put('settings',{key,value});return settings();}
  function matchPlayer(m,id){return (m.players||[]).find(p=>+p.player_id===+id);}
  async function stats(){
    const ps=await players(),ms=(await matches()).filter(m=>m.game_type==='x01');
    return ps.map(p=>{const rows=ms.map(m=>matchPlayer(m,p.id)).filter(Boolean);const darts=rows.reduce((a,x)=>a+(+x.darts_thrown||0),0),points=rows.reduce((a,x)=>a+(+x.points_scored||0),0),attempts=rows.reduce((a,x)=>a+(+x.checkout_attempts||0),0),cos=rows.reduce((a,x)=>a+(+x.checkouts||0),0);return{id:p.id,name:p.name,matches:rows.length,legs_won:rows.reduce((a,x)=>a+(+x.legs_won||0),0),lifetime_average:darts?round(points*3/darts):0,best_average:round(Math.max(0,...rows.map(x=>+x.three_dart_average||0))),highest_checkout:Math.max(0,...rows.map(x=>+x.highest_checkout||0)),highest_visit:Math.max(0,...rows.map(x=>+x.highest_visit||0)),total_180s:rows.reduce((a,x)=>a+(+x.scores_180||0),0),checkouts:cos,checkout_attempts:attempts};});
  }
  function trainingSummary(rows){
    const out={checkout:{sessions:0,hits:0,attempts:0,rate:0},'121':{sessions:0,best_target:0,successes:0,attempts:0,rate:0},bobs27:{sessions:0,best_score:0,best_doubles:[],weak_doubles:[]},doubles:{sessions:0,hits:0,darts:0,rate:0,best_doubles:[],weak_doubles:[],by_double:[]}};
    const bob={},dbl={};for(let i=1;i<=20;i++){bob[String(i)]=[0,0];dbl[String(i)]=[0,0]}bob['25']=[0,0];dbl['25']=[0,0];
    rows.forEach(r=>{const d=jsonObj(r.details_json);if(r.mode==='checkout'){out.checkout.sessions++;out.checkout.hits+=+d.hits||0;out.checkout.attempts+=+d.attempts||0}else if(r.mode==='121'){out['121'].sessions++;out['121'].best_target=Math.max(out['121'].best_target,Math.round(+r.score||0));out['121'].successes+=+d.hits||0;out['121'].attempts+=+d.attempts||0}else if(r.mode==='bobs27'){out.bobs27.sessions++;out.bobs27.best_score=Math.max(out.bobs27.best_score,Math.round(+r.score||0));const td=d.target_darts||{};Object.entries(d.target_hits||{}).forEach(([k,v])=>{if(bob[k]){bob[k][0]+=+v||0;bob[k][1]+=+td[k]||3}})}else if(r.mode==='doubles'){out.doubles.sessions++;out.doubles.hits+=+d.hits||0;out.doubles.darts+=+d.darts||0;const td=d.target_darts||{};Object.entries(d.target_hits||{}).forEach(([k,v])=>{if(dbl[k]){dbl[k][0]+=+v||0;dbl[k][1]+=+td[k]||3}})}});
    out.checkout.rate=out.checkout.attempts?round(out.checkout.hits*100/out.checkout.attempts,1):0;out['121'].rate=out['121'].attempts?round(out['121'].successes*100/out['121'].attempts,1):0;out.doubles.rate=out.doubles.darts?round(out.doubles.hits*100/out.doubles.darts,1):0;
    const convert=obj=>Object.entries(obj).filter(([,v])=>v[1]).map(([k,v])=>({target:k==='25'?'Bull':`D${k}`,hits:v[0],darts:v[1],rate:round(v[0]*100/v[1],1)}));
    const best=a=>[...a].sort((x,y)=>y.rate-x.rate||y.hits-x.hits||x.target.localeCompare(y.target)).slice(0,5),weak=a=>[...a].sort((x,y)=>x.rate-y.rate||x.hits-y.hits||x.target.localeCompare(y.target)).slice(0,5);
    const b=convert(bob),d=convert(dbl);out.bobs27.best_doubles=best(b);out.bobs27.weak_doubles=weak(b);out.doubles.by_double=d.sort((x,y)=>(x.target==='Bull'?25:+x.target.slice(1))-(y.target==='Bull'?25:+y.target.slice(1)));out.doubles.best_doubles=best(d);out.doubles.weak_doubles=weak(d);return out;
  }
  async function profile(id){
    const ps=await players(),p=ps.find(x=>+x.id===+id);if(!p)throw new Error('Player not found');const ms=await matches(),prs=(await practice()).filter(r=>+r.player_id===+id).sort((a,b)=>b.played_at.localeCompare(a.played_at));const xms=ms.filter(m=>m.game_type==='x01'&&matchPlayer(m,id)),rows=xms.map(m=>matchPlayer(m,id));const darts=rows.reduce((a,x)=>a+(+x.darts_thrown||0),0),points=rows.reduce((a,x)=>a+(+x.points_scored||0),0);const x01={matches:rows.length,wins:xms.filter(m=>+m.winner_player_id===+id).length,legs_won:rows.reduce((a,x)=>a+(+x.legs_won||0),0),darts_thrown:darts,points_scored:points,lifetime_average:darts?round(points*3/darts):0,best_average:round(Math.max(0,...rows.map(x=>+x.three_dart_average||0))),highest_checkout:Math.max(0,...rows.map(x=>+x.highest_checkout||0)),highest_visit:Math.max(0,...rows.map(x=>+x.highest_visit||0)),total_180s:rows.reduce((a,x)=>a+(+x.scores_180||0),0),checkouts:rows.reduce((a,x)=>a+(+x.checkouts||0),0),checkout_attempts:rows.reduce((a,x)=>a+(+x.checkout_attempts||0),0)};
    const party={};['cricket','killer','shanghai','halveit'].forEach(type=>{const gm=ms.filter(m=>m.game_type===type&&matchPlayer(m,id)),r=gm.map(m=>matchPlayer(m,id));if(gm.length)party[type]={game_type:type,wins:gm.filter(m=>+m.winner_player_id===+id).length,best_score:Math.max(0,...r.map(x=>+x.points_scored||0)),games:gm.length};});
    const recent=[...ms].filter(m=>matchPlayer(m,id)).sort((a,b)=>b.played_at.localeCompare(a.played_at)).slice(0,10).map(m=>{const r=matchPlayer(m,id),w=ps.find(x=>+x.id===+m.winner_player_id);return{id:m.id,game_type:m.game_type,start_score:m.start_score,winner_player_id:m.winner_player_id,played_at:m.played_at,three_dart_average:+r.three_dart_average||0,highest_checkout:+r.highest_checkout||0,scores_180:+r.scores_180||0,legs_won:+r.legs_won||0,winner_name:w?.name||null}});
    return{player:p,x01,party,training:trainingSummary(prs),recent_matches:recent,recent_practice:prs.slice(0,10).map(r=>({mode:r.mode,score:r.score,played_at:r.played_at,details:jsonObj(r.details_json)}))};
  }
  async function headToHead(aid,bid){
    if(+aid===+bid)throw new Error('Choose two different players');const ps=await players(),a=ps.find(x=>+x.id===+aid),b=ps.find(x=>+x.id===+bid);if(!a||!b)throw new Error('Player not found');const ids=[+aid,+bid].sort((x,y)=>x-y),ms=(await matches()).filter(m=>m.game_type==='x01'&&(m.players||[]).length===2&&m.players.map(x=>+x.player_id).sort((x,y)=>x-y).every((v,i)=>v===ids[i])).sort((x,y)=>y.played_at.localeCompare(x.played_at));
    const mk=p=>({player_id:p.id,name:p.name,wins:0,legs:0,darts:0,points:0,average:0,best_average:0,highest_checkout:0,'180s':0}),sa=mk(a),sb=mk(b),map=new Map([[+a.id,sa],[+b.id,sb]]);ms.forEach(m=>(m.players||[]).forEach(r=>{const s=map.get(+r.player_id);s.legs+=+r.legs_won||0;s.darts+=+r.darts_thrown||0;s.points+=+r.points_scored||0;s.best_average=Math.max(s.best_average,+r.three_dart_average||0);s.highest_checkout=Math.max(s.highest_checkout,+r.highest_checkout||0);s['180s']+=+r.scores_180||0;if(+m.winner_player_id===+r.player_id)s.wins++}));[sa,sb].forEach(s=>{s.average=s.darts?round(s.points*3/s.darts):0;s.best_average=round(s.best_average)});
    const recent=ms.slice(0,8).map(m=>({id:m.id,played_at:m.played_at,start_score:m.start_score,winner_player_id:m.winner_player_id,players:(m.players||[]).map(r=>({player_id:r.player_id,name:ps.find(p=>+p.id===+r.player_id)?.name||'',legs:+r.legs_won||0,average:round(+r.three_dart_average||0,1),highest_checkout:+r.highest_checkout||0,'180s':+r.scores_180||0}))}));let streak={player_id:null,name:null,count:0};if(recent.length&&map.has(+recent[0].winner_player_id)){const wid=+recent[0].winner_player_id;let count=0;for(const m of recent){if(+m.winner_player_id===wid)count++;else break}streak={player_id:wid,name:ps.find(p=>+p.id===wid)?.name||'',count}}return{matches:ms.length,players:[sa,sb],streak,recent};
  }
  async function leaderboards(){const ps=await players(),ms=await matches(),prs=await practice();const name=id=>ps.find(p=>+p.id===+id)?.name||'';const scoreBoard=type=>{const best=new Map();ms.filter(m=>m.game_type===type).forEach(m=>(m.players||[]).forEach(r=>best.set(+r.player_id,Math.max(best.get(+r.player_id)||0,+r.points_scored||0))));return[...best].map(([player_id,value])=>({player_id,name:name(player_id),value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));};const wins=type=>{const c=new Map();ms.filter(m=>m.game_type===type&&m.winner_player_id!=null).forEach(m=>c.set(+m.winner_player_id,(c.get(+m.winner_player_id)||0)+1));return[...c].map(([player_id,value])=>({player_id,name:name(player_id),value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));};const bob=new Map();prs.filter(r=>r.mode==='bobs27').forEach(r=>bob.set(+r.player_id,Math.max(bob.get(+r.player_id)||0,+r.score||0)));return{shanghai:scoreBoard('shanghai'),halveit:scoreBoard('halveit'),bobs27:[...bob].map(([player_id,value])=>({player_id,name:name(player_id),value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)),cricket_wins:wins('cricket'),killer_wins:wins('killer')};}

  async function clearStore(name){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function ensureUids(){
    for(const name of ['players','matches','practice']){
      const rows=await all(name);
      for(const row of rows){if(!row.uid){row.uid=uid(name==='players'?'player':name==='matches'?'match':'practice');await put(name,row);}}
    }
  }
  async function summary(){
    await ensureUids();
    const ps=await players(),ms=await matches(),prs=await practice();
    const x=ms.filter(m=>m.game_type==='x01');
    let total180=0,highestCheckout=0;
    x.forEach(m=>(m.players||[]).forEach(r=>{total180+=+r.scores_180||0;highestCheckout=Math.max(highestCheckout,+r.highest_checkout||0);}));
    return{players:ps.length,matches:ms.length,practice:prs.length,x01_matches:x.length,total_180s:total180,highest_checkout:highestCheckout};
  }
  async function exportData(){
    await ensureUids();
    return{dartdeck_format:'dartdeck-backup',schema_version:1,exported_at:now(),source:{edition:(window.DARTDECK_NATIVE?'android':'web-pwa'),storage:'indexeddb'},data:{players:await all('players'),matches:await all('matches'),practice:await all('practice'),settings:await all('settings')}};
  }
  function dataBlock(payload){return payload?.data&&typeof payload.data==='object'?payload.data:payload||{};}
  async function importData(payload,mode='merge'){
    const data=dataBlock(payload);
    if(!Array.isArray(data.players)||!Array.isArray(data.matches)||!Array.isArray(data.practice))throw new Error('This is not a valid DartDeck backup');
    if(mode==='replace')for(const n of ['matches','practice','players','settings'])await clearStore(n);
    await ensureUids();
    let localPlayers=await players();
    const byUid=new Map(localPlayers.filter(p=>p.uid).map(p=>[p.uid,p]));
    const byName=new Map(localPlayers.map(p=>[String(p.name||'').trim().toLowerCase(),p]));
    const idMap=new Map();
    let playersAdded=0,matchesAdded=0,matchesSkipped=0,practiceAdded=0,practiceSkipped=0;
    for(const raw of data.players){
      const name=String(raw.name||'').trim(); if(!name)continue;
      let p=(raw.uid&&byUid.get(raw.uid))||byName.get(name.toLowerCase());
      if(!p){const rec={name,created_at:raw.created_at||now(),uid:raw.uid||uid('player')};const id=await add('players',rec);p={...rec,id};localPlayers.push(p);byUid.set(p.uid,p);byName.set(name.toLowerCase(),p);playersAdded++;}
      idMap.set(String(raw.id),p.id);
    }
    const existingMatches=new Set((await matches()).map(r=>r.uid).filter(Boolean));
    for(const raw of data.matches){
      const recordUid=raw.uid||`import-match-${raw.id||uid('legacy')}`;
      if(existingMatches.has(recordUid)){matchesSkipped++;continue;}
      const rows=(raw.players||[]).map(r=>({...r,player_id:idMap.get(String(r.player_id))||r.player_id})).filter(r=>localPlayers.some(p=>+p.id===+r.player_id));
      const winner=raw.winner_player_id==null?null:(idMap.get(String(raw.winner_player_id))??null);
      const rec={...raw};delete rec.id;rec.uid=recordUid;rec.players=rows;rec.winner_player_id=winner;rec.played_at=raw.played_at||now();
      await add('matches',rec);existingMatches.add(recordUid);matchesAdded++;
    }
    const existingPractice=new Set((await practice()).map(r=>r.uid).filter(Boolean));
    for(const raw of data.practice){
      const recordUid=raw.uid||`import-practice-${raw.id||uid('legacy')}`;
      if(existingPractice.has(recordUid)){practiceSkipped++;continue;}
      const pid=idMap.get(String(raw.player_id));if(!pid)continue;
      const rec={...raw};delete rec.id;rec.uid=recordUid;rec.player_id=pid;rec.played_at=raw.played_at||now();
      await add('practice',rec);existingPractice.add(recordUid);practiceAdded++;
    }
    if(Array.isArray(data.settings))for(const row of data.settings){if(row&&row.key)await put('settings',{key:row.key,value:row.value});}
    else if(data.settings&&typeof data.settings==='object')for(const [key,value] of Object.entries(data.settings))await put('settings',{key,value});
    return{mode,players_added:playersAdded,matches_added:matchesAdded,matches_skipped:matchesSkipped,practice_added:practiceAdded,practice_skipped:practiceSkipped,summary:await summary()};
  }

  async function request(url,options={}){
    const method=(options.method||'GET').toUpperCase(),u=new URL(url,'https://dartdeck.local'),path=u.pathname,body=parseBody(options);
    if(path==='/api/health')return{status:'ok',storage:'indexeddb'};
    if(path==='/api/settings'&&method==='GET')return settings();if(path==='/api/settings'&&method==='PUT')return saveSettings(body);
    if(path==='/api/players'&&method==='GET')return players();
    if(path==='/api/players'&&method==='POST'){const name=String(body.name||'').trim();if(!name)throw new Error('Name is required');if((await players()).some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new Error('Player already exists');const rec={name,created_at:now(),uid:uid('player')},id=await add('players',rec);return{...rec,id};}
    let m=path.match(/^\/api\/players\/(\d+)$/);if(m&&method==='DELETE'){const id=+m[1],used=(await matches()).some(x=>(x.players||[]).some(p=>+p.player_id===id))||(await practice()).some(x=>+x.player_id===id);if(used)throw new Error('Player has recorded history and cannot be deleted');await del('players',id);return{ok:true};}
    m=path.match(/^\/api\/players\/(\d+)\/profile$/);if(m&&method==='GET')return profile(+m[1]);
    if(path==='/api/matches'&&method==='POST'){const rec={...body,played_at:now(),uid:body.uid||uid('match')};const id=await add('matches',rec);return{id};}
    if(path==='/api/practice'&&method==='POST'){const rec={...body,played_at:now(),uid:body.uid||uid('practice')};const id=await add('practice',rec);return{id};}
    if(path==='/api/stats'&&method==='GET')return stats();
    if(path==='/api/head-to-head'&&method==='GET')return headToHead(+u.searchParams.get('player1'),+u.searchParams.get('player2'));
    m=path.match(/^\/api\/training-analytics\/(\d+)$/);if(m&&method==='GET')return (await profile(+m[1])).training;
    if(path==='/api/leaderboards'&&method==='GET')return leaderboards();
    throw new Error(`Unsupported local API route: ${method} ${path}`);
  }
  window.DartDeckLocalStore={request,openDb,summary,exportData,importData};
})();
