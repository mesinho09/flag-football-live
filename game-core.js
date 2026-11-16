// Server-authoritative Flag Football match rules. No external dependencies.
const EMPTY={ game:20*60*1000, play:30*1000, pass:7*1000 };
const now=()=>Date.now();
const cleanName=(s,fallback)=>typeof s==='string' && s.trim()?s.trim().slice(0,20):fallback;
function initialState(nameA, nameB) {
  return {
    rules: { gameMinutes: 20, playSeconds: 30, passSeconds: 7 },
    teams: [{ name: cleanName(nameA,'BLUE'), color: '#5da7ff', score: 0, timeouts: 2 }, { name: cleanName(nameB,'RED'), color:'#ff697d', score: 0, timeouts: 2 }],
    half: 1, phase: 'ready', possession: 0, firstHalfStarter: null, down: 1, acrossMidfield: false,
    gameMs: EMPTY.game, gameRunning: false, gameTickAt: now(),
    playMs: EMPTY.play, playRunning: false, playTickAt: now(),
    passMs: EMPTY.pass, passRunning: false, passTickAt: now(),
    ballLive: false, tryPoints: 1,
    lastEvent: 'Bereit zum Spielstart', history: [], updatedAt: now()
  };
}
function clockTicks(state, time=now()) {
  let expiredPlay = false;
  for (const x of ['game','play','pass']) {
    if (state[`${x}Running`]) {
      const delta = Math.max(0, time - state[`${x}TickAt`]);
      state[`${x}Ms`] = Math.max(0, state[`${x}Ms`] - delta);
      state[`${x}TickAt`] = time;
      if (state[`${x}Ms`] === 0) {
        state[`${x}Running`] = false;
        if (x === 'play') expiredPlay = true;
      }
    }
  }
  if (expiredPlay && !state.ballLive && state.phase === 'ready') state.lastEvent = 'Play Clock abgelaufen · Schiedsrichter entscheidet';
  if (state.gameMs === 0 && state.phase !== 'final' && state.phase !== 'halftime' && state.phase !== 'conversion') {
    state.playRunning = false;
    state.passRunning = false;
    state.ballLive = false;
    state.lastEvent = 'Halbzeit abgelaufen · Schiedsrichter entscheidet';
  }
  if (state.passMs === 0 && state.ballLive && state.phase !== 'conversion') {
    state.ballLive = false;
    state.passRunning = false;
    state.playMs = state.rules.playSeconds * 1000;
    state.playTickAt = time;
    state.playRunning = true;
    nextDown(state);
    state.lastEvent = '7-Sekunden-Regel: Down verloren';
  }
  if (state.passMs === 0 && state.ballLive && state.phase === 'conversion') {
    state.ballLive = false;
    state.passRunning = false;
    state.lastEvent = 'Passzeit abgelaufen · Conversion gescheitert';
    finishTry(state);
  }
}
function stopAll(state) {
  state.gameRunning = false;
  state.playRunning = false;
  state.passRunning = false;
  state.ballLive = false;
}
function nextDown(s) {
  if (s.down === 4) {
    s.possession = 1 - s.possession;
    s.down = 1;
    s.acrossMidfield = false;
    s.lastEvent = 'Turnover on Downs';
    return true;
  }
  s.down += 1;
  return false;
}
function resetPlay(s, running=true) {
  s.ballLive = false;
  s.passRunning = false;
  s.passMs = s.rules.passSeconds * 1000;
  s.playRunning = running;
  s.playMs = s.rules.playSeconds * 1000;
  s.playTickAt = now();
}
function resetDrive(s, otherTeam=false) {
  if (otherTeam) s.possession = 1 - s.possession;
  s.down = 1;
  s.acrossMidfield = false;
  resetPlay(s, true);
}
function finishTry(s) {
  s.phase = 'ready';
  s.possession = 1 - s.possession;
  s.down = 1;
  s.acrossMidfield = false;
  s.ballLive = false;
  s.gameRunning = false;
  s.playRunning = false;
  s.passRunning = false;
  s.passMs = s.rules.passSeconds*1000;
  s.playMs = s.rules.playSeconds*1000;
}
function applyAction(s, type, data={}) {
  const team = Number(data.team);
  switch(type) {
    case 'clock:toggle':
      if (s.phase === 'final' || s.phase === 'conversion' || s.gameMs === 0) return 'Spieluhr kann jetzt nicht laufen';
      s.gameRunning = !s.gameRunning;
      s.gameTickAt = now();
      s.lastEvent = s.gameRunning ? 'Spieluhr gestartet' : 'Spieluhr pausiert';
      break;
    case 'snap':
      if (s.phase === 'final' || s.phase === 'halftime') return 'Spiel ist gerade unterbrochen';
      if (s.ballLive) return 'Spielzug läuft bereits';
      if (s.gameMs === 0 && s.phase !== 'conversion') return 'Halbzeit abgelaufen';
      if (s.half === 1 && s.firstHalfStarter === null && s.phase !== 'conversion') s.firstHalfStarter = s.possession;
      s.ballLive = true;
      s.playRunning = false;
      s.passMs = s.rules.passSeconds*1000;
      s.passTickAt = now();
      s.passRunning = true;
      if (s.phase !== 'conversion') {
        s.gameRunning = true;
        s.gameTickAt = now();
      }
      s.lastEvent = s.phase === 'conversion' ? 'Conversion-Snap' : 'SNAP · Passuhr läuft';
      break;
    case 'play:end':
      if (s.phase === 'conversion') return 'Conversion mit Erfolg/Misserfolg abschließen';
      if (!s.ballLive) return 'Bitte erst Snap drücken';
      resetPlay(s);
      if (nextDown(s)) s.lastEvent = '4. Down gescheitert · Ballbesitzwechsel';
      else s.lastEvent = `Down beendet · nächster: ${s.down}. Down`;
      break;
    case 'play:midfield':
      if (s.phase === 'conversion') return 'Während einer Conversion nicht möglich';
      if (s.acrossMidfield) return 'Mittellinie bereits überquert';
      s.acrossMidfield = true;
      s.down = 1;
      resetPlay(s);
      s.lastEvent = 'First Down! Jetzt 4 Versuche bis zur Endzone';
      break;
    case 'play:reset':
      if (s.ballLive || s.phase === 'final') return 'Nicht während des Spielzugs';
      s.playMs = s.rules.playSeconds*1000;
      s.playTickAt = now();
      s.playRunning = s.phase === 'ready';
      s.lastEvent = 'Play Clock zurückgesetzt';
      break;
    case 'turnover':
      if (s.phase === 'conversion') return 'Conversion gesondert abschließen';
      resetDrive(s,true);
      s.lastEvent = data.interception ? 'INTERCEPTION · Ballbesitz gewechselt' : 'Ballbesitzwechsel · Start eigene 5 m (Hausregel)';
      break;
    case 'touchdown':
      if (s.phase === 'conversion' || s.phase === 'final') return 'Kein Touchdown möglich';
      s.teams[s.possession].score += 6;
      stopAll(s);
      s.phase = 'conversion';
      s.tryPoints = 1;
      s.lastEvent = `${s.teams[s.possession].name}: TOUCHDOWN +6!`;
      break;
    case 'try:select':
      if (s.phase !== 'conversion' || ![1,2].includes(data.points)) return 'Erst Touchdown erzielen';
      s.tryPoints = data.points;
      s.lastEvent = `${data.points}-Point-Conversion gewählt`;
      break;
    case 'try:success':
      if (s.phase !== 'conversion') return 'Keine laufende Conversion';
      s.teams[s.possession].score += s.tryPoints;
      s.lastEvent = `Conversion erfolgreich (+${s.tryPoints})`;
      finishTry(s);
      break;
    case 'try:fail':
      if (s.phase !== 'conversion') return 'Keine laufende Conversion';
      s.lastEvent = 'Conversion erfolglos';
      finishTry(s);
      break;
    case 'try:defense2':
      if (s.phase !== 'conversion') return 'Keine laufende Conversion';
      s.teams[1-s.possession].score += 2;
      s.lastEvent = 'Defensive Return bei Conversion: +2';
      finishTry(s);
      break;
    case 'timeout':
      if (![0,1].includes(team)) return 'Team ungültig';
      if (s.teams[team].timeouts <= 0) return 'Keine Timeouts mehr';
      if (s.ballLive) return 'Timeout erst nach beendetem Spielzug';
      s.teams[team].timeouts -= 1;
      stopAll(s);
      s.lastEvent = `Timeout ${s.teams[team].name}`;
      break;
    case 'half:next':
      if (s.half !== 1 || s.phase === 'conversion') return 'Halbzeitwechsel nicht möglich';
      s.half = 2;
      s.phase = 'ready';
      s.possession = 1 - (s.firstHalfStarter ?? 0);
      s.down = 1;
      s.acrossMidfield = false;
      s.gameMs = s.rules.gameMinutes*60*1000;
      s.playMs = s.rules.playSeconds*1000;
      s.passMs = s.rules.passSeconds*1000;
      s.teams.forEach(t=>t.timeouts=2);
      stopAll(s);
      s.lastEvent = '2. Halbzeit · neues Angriffsrecht';
      break;
    case 'game:end':
      stopAll(s);
      s.phase = 'final';
      s.lastEvent = 'SPIELENDE';
      break;
    case 'score:adjust':
      if (![0,1].includes(team) || ![-6,-2,-1,1,2,6].includes(data.delta)) return 'Ungültige Punktekorrektur';
      s.teams[team].score = Math.max(0, s.teams[team].score + data.delta);
      s.lastEvent = `Punkte korrigiert: ${s.teams[team].name}`;
      break;
    case 'settings:update': {
      if (s.phase !== 'ready' || s.ballLive || s.gameRunning) return 'Einstellungen nur bei pausiertem Spiel';
      const a=cleanName(data.nameA, s.teams[0].name), b=cleanName(data.nameB, s.teams[1].name);
      s.teams[0].name=a;
      s.teams[1].name=b;
      if ([10,15,20,25,30].includes(data.gameMinutes) && [20,25,30,40].includes(data.playSeconds) && [5,7,10].includes(data.passSeconds)) {
        s.rules={gameMinutes:data.gameMinutes,playSeconds:data.playSeconds,passSeconds:data.passSeconds};
        s.gameMs = data.gameMinutes*60*1000;
        s.playMs = data.playSeconds*1000;
        s.passMs = data.passSeconds*1000;
        s.playRunning=false;
        s.passRunning=false;
      }
      s.lastEvent='Einstellungen aktualisiert';
      break;
    }
    case 'game:reset': {
      const a=s.teams[0].name, b=s.teams[1].name, r=s.rules;
      const next=initialState(a,b);
      next.rules=r;
      next.gameMs=r.gameMinutes*60*1000;
      next.playMs=r.playSeconds*1000;
      next.passMs=r.passSeconds*1000;
      Object.assign(s,next);
      s.lastEvent='Neues Spiel';
      break;
    }
    default: return 'Unbekannte Aktion';
  }
  return null;
}

export { initialState, clockTicks, applyAction };
