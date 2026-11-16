/* FLAG LIVE iPhone client. Server owns the game state; clients cannot edit without referee access. */
const $=id=>document.getElementById(id);
const socket=io({ reconnection: true });
let currentRoom=null, currentPin=null, role='viewer', state=null, receivedAt=0, toastTimer=null, showingPin=false;
const ordinal=n=>['','1ST','2ND','3RD','4TH'][n]||`${n}TH`;
const two=n=>String(n).padStart(2,'0');
const seconds=ms=>Math.max(0,Math.ceil(ms/1000));
function gameFmt(ms){const s=seconds(ms);return `${two(Math.floor(s/60))}:${two(s%60)}`;}
function passFmt(ms){return (Math.max(0,Math.ceil(ms/100)/10)).toFixed(1).padStart(4,'0');}
function showToast(message,error=false){const el=$('toast');el.textContent=message;el.classList.remove('hidden');el.classList.toggle('error',error);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3300);}
function connected(){ $('connection').classList.toggle('connected',socket.connected);$('connection').innerHTML=socket.connected?'<i></i> VERBUNDEN':'<i></i> OFFLINE'; }
function setSession(code,pin,access){ currentRoom=code;currentPin=pin||null;role=access;sessionStorage.setItem('flag_live_session',JSON.stringify({code,pin:pin||null}));$('welcome').classList.add('hidden');$('match').classList.remove('hidden');$('refPanel').classList.toggle('hidden',role!=='ref');$('viewerPanel').classList.toggle('hidden',role==='ref');$('roleLabel').textContent=role==='ref'?'SPIELLEITUNG':'ZUSCHAUER';$('roomCode').textContent=code;$('pinValue').textContent=pin||'******';$('pinValue').classList.add('hidden');showingPin=false;$('pinBtn').textContent='PIN anzeigen';const u=new URL(location.href);u.searchParams.set('code',code);history.replaceState({},'',u);window.scrollTo({top:0,behavior:'smooth'}); }
function join(code,pin=null,restore=false){
  if(!socket.connected){showToast('Keine Verbindung zum Server',true);return;}
  socket.emit('room:join',{code,pin},res=>{
    if(!res?.ok){if(restore){sessionStorage.removeItem('flag_live_session');return;}showToast(res?.error||'Beitritt fehlgeschlagen',true);return;}
    setSession(res.code,pin,res.role);applySnapshot(res.state);
    if(!restore)showToast(res.role==='ref'?'Als Schiedsrichter verbunden':'Du siehst das Match jetzt live');
  });
}
function create(){if(!socket.connected){showToast('Bitte Internetverbindung prüfen',true);return;}$('createBtn').disabled=true;
  socket.emit('room:create',{nameA:$('nameA').value,nameB:$('nameB').value},res=>{
    $('createBtn').disabled=false;
    if(!res?.ok){showToast(res?.error||'Spiel konnte nicht erstellt werden',true);return;}
    setSession(res.code,res.pin,'ref');applySnapshot(res.state);showToast(`Match erstellt · Spielcode ${res.code}`);
  });
}
function act(type,data={}){
  if(role!=='ref'){showToast('Nur die Spielleitung darf das ändern',true);return;}
  if(!socket.connected){showToast('Keine Verbindung. Aktion nicht übertragen.',true);return;}
  socket.emit('ref:action',{type,data},res=>{if(!res?.ok)showToast(res?.error||'Aktion fehlgeschlagen',true);});
}
function applySnapshot(next){if(!next)return;state=next;receivedAt=performance.now();renderState();}
function currentMs(kind){if(!state)return 0;let amount=state[`${kind}Ms`];if(state[`${kind}Running`])amount-=performance.now()-receivedAt;return Math.max(0,amount);}
function renderClock(){if(!state)return;const g=currentMs('game'),p=currentMs('play'),pass=currentMs('pass');$('gameTime').textContent=gameFmt(g);$('playTime').textContent=String(seconds(p)).padStart(2,'0');$('passTime').textContent=passFmt(pass);$('passTime').classList.toggle('urgent',state.passRunning&&pass<=3000);$('playTime').classList.toggle('urgent',state.playRunning&&p<=5000);$('playProgress').style.width=`${Math.max(0,Math.min(100,100*p/(state.rules.playSeconds*1000)))}%`;$('passProgress').style.width=`${Math.max(0,Math.min(100,100*pass/(state.rules.passSeconds*1000)))}%`;}
function renderState(){if(!state)return;
  $('teamNameA').textContent=state.teams[0].name;$('teamNameB').textContent=state.teams[1].name;
  $('scoreA').textContent=state.teams[0].score;$('scoreB').textContent=state.teams[1].score;
  $('toA').textContent='● '.repeat(state.teams[0].timeouts).trim()||'–';$('toB').textContent='● '.repeat(state.teams[1].timeouts).trim()||'–';
  $('ballA').classList.toggle('active',state.possession===0);$('ballB').classList.toggle('active',state.possession===1);
  $('period').textContent=state.half===1?'1. HALBZEIT':'2. HALBZEIT';
  $('downText').textContent=state.phase==='conversion'?'TRY':`${ordinal(state.down)} DOWN`;
  $('targetText').textContent=state.phase==='conversion'?`${state.tryPoints} PUNKT(E)`:state.acrossMidfield?'ENDZONE':'MITTELLINIE';
  $('possessionText').textContent=state.teams[state.possession].name;
  $('matchStatus').textContent=state.phase==='final'?'FINAL':state.phase==='conversion'?'EXTRAPUNKT':state.ballLive?'BALL LIVE':state.gameRunning?'SPIEL LÄUFT':state.gameMs===0?'ZEIT ABGELAUFEN':'BEREIT';
  $('lastEvent').textContent=state.lastEvent;$('viewerCount').textContent=state.viewers;
  $('clockToggle').textContent=state.gameRunning?'Ⅱ Spieluhr pausieren':'▶ Spieluhr starten';
  $('timeoutA').textContent=`Timeout ${state.teams[0].name} (${state.teams[0].timeouts})`;
  $('timeoutB').textContent=`Timeout ${state.teams[1].name} (${state.teams[1].timeouts})`;
  $('corrNameA').textContent=state.teams[0].name;$('corrNameB').textContent=state.teams[1].name;
  $('conversionBox').classList.toggle('hidden',state.phase!=='conversion');
  $('choose1').classList.toggle('selected',state.tryPoints===1);$('choose2').classList.toggle('selected',state.tryPoints===2);
  $('halfBtn').disabled=state.half===2||state.phase==='conversion';
  for(const el of document.querySelectorAll('[data-action]')){
    const action=el.dataset.action;
    if(action==='snap')el.disabled=state.ballLive||state.phase==='final'||(state.gameMs<=0&&state.phase!=='conversion');
    else if(action==='clock:toggle')el.disabled=state.phase==='conversion'||state.phase==='final'||state.gameMs<=0;
    else if(action==='play:end')el.disabled=!state.ballLive||state.phase==='conversion';
    else if(action==='play:midfield')el.disabled=state.acrossMidfield||state.phase==='conversion'||state.phase==='final';
    else if(action==='touchdown')el.disabled=state.phase==='conversion'||state.phase==='final';
    else if(action==='try:select'||action==='try:success'||action==='try:fail'||action==='try:defense2')el.disabled=state.phase!=='conversion';
    else if(action==='timeout')el.disabled=state.ballLive||state.teams[Number(el.dataset.team)].timeouts===0;
    else if(action==='half:next')el.disabled=state.half===2||state.phase==='conversion';
  }
  renderClock();
}
$('createBtn').addEventListener('click',create);
$('joinBtn').addEventListener('click',()=>join($('joinCode').value.toUpperCase().trim(),$('joinPin').value.trim()||null));
$('joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click();});
$('joinPin').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click();});
for(const el of document.querySelectorAll('[data-action]'))el.addEventListener('click',()=>{
  const type=el.dataset.action;
  if(type==='game:reset'&&!confirm('Wirklich alle Punkte, Timeouts und Uhren zurücksetzen?'))return;
  if(type==='game:end'&&!confirm('Spiel wirklich beenden?'))return;
  if(type==='half:next'&&!confirm('2. Halbzeit beginnen?'))return;
  if(type==='interception')return act('turnover',{interception:true});
  if(type==='score:adjust')return act(type,{team:Number(el.dataset.team),delta:Number(el.dataset.delta)});
  if(type==='timeout')return act(type,{team:Number(el.dataset.team)});
  if(type==='try:select')return act(type,{points:Number(el.dataset.points)});
  act(type);
});
$('pinBtn').addEventListener('click',()=>{showingPin=!showingPin;$('pinValue').classList.toggle('hidden',!showingPin);$('pinBtn').textContent=showingPin?'PIN verbergen':'PIN anzeigen';});
$('shareBtn').addEventListener('click',async()=>{
  if(!currentRoom)return;
  const url=new URL(location.href);url.searchParams.set('code',currentRoom);
  const share={title:'FLAG LIVE',text:`Spielcode: ${currentRoom} · Live-Scoreboard`,url:url.toString()};
  try{if(navigator.share){await navigator.share(share);return;}if(navigator.clipboard){await navigator.clipboard.writeText(url.toString());showToast('Einladungslink kopiert');return;}showToast(`Spielcode: ${currentRoom}`);}catch(e){if(e.name!=='AbortError')showToast('Link konnte nicht geteilt werden',true);}
});
$('leaveBtn').addEventListener('click',()=>{sessionStorage.removeItem('flag_live_session');const url=new URL(location.href);url.searchParams.delete('code');location.href=url.toString();});
$('settingsBtn').addEventListener('click',()=>{if(!state)return;$('settingA').value=state.teams[0].name;$('settingB').value=state.teams[1].name;$('gameMinutes').value=state.rules.gameMinutes;$('playSeconds').value=state.rules.playSeconds;$('passSeconds').value=state.rules.passSeconds;$('settingsDialog').showModal();});
$('cancelSettings').addEventListener('click',()=>$('settingsDialog').close());
$('settingsForm').addEventListener('submit',e=>{e.preventDefault();act('settings:update',{nameA:$('settingA').value,nameB:$('settingB').value,gameMinutes:Number($('gameMinutes').value),playSeconds:Number($('playSeconds').value),passSeconds:Number($('passSeconds').value)});$('settingsDialog').close();});
socket.on('connect',()=>{connected();if(currentRoom){join(currentRoom,currentPin,true);return;}const raw=sessionStorage.getItem('flag_live_session');if(raw){try{const session=JSON.parse(raw);join(session.code,session.pin,true);}catch{sessionStorage.removeItem('flag_live_session');}}});
socket.on('disconnect',connected);
socket.on('room:state',next=>{if(next.roomCode===currentRoom)applySnapshot(next);});
const query=new URLSearchParams(location.search).get('code');if(query)$('joinCode').value=query.toUpperCase();
setInterval(renderClock,100);
connected();
