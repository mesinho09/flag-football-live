import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initialState, clockTicks, applyAction } from './game-core.js';

const app = express();
app.disable('x-powered-by');
const server = createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 12000 });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size }));
const rooms = new Map();
const MAX_ROOMS = 100;
const IDLE_MS = 12 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const now = () => Date.now();
const clone = obj => structuredClone(obj);
function makeCode() {
  for (let t=0; t<50; t++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not generate room code');
}
function hash(pin) { return createHash('sha256').update(String(pin)).digest(); }
function matchPin(pin, expected) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return false;
  return timingSafeEqual(hash(pin), expected);
}
function publicState(room) {
  const s = room.state;
  return { ...s, roomCode: room.code, viewers: io.sockets.adapter.rooms.get(room.code)?.size || 0, history: undefined };
}
function publish(room) { room.state.updatedAt=now(); io.to(room.code).emit('room:state', publicState(room)); }
function ackError(callback, error) { if (typeof callback === 'function') callback({ ok: false, error }); }


const attempts = new Map();
function allowAttempt(socket) {
  const ip = socket.handshake.address || 'unknown';
  const value = attempts.get(ip) || { n: 0, since: now() };
  if (now()-value.since > 60000) { value.n=0; value.since=now(); }
  value.n++;
  attempts.set(ip,value);
  return value.n <= 40;
}
function enterRoom(socket, room, role) {
  if (socket.data.room) socket.leave(socket.data.room);
  socket.join(room.code);
  socket.data.room = room.code;
  socket.data.role = role;
  room.lastUsed=now();
}

io.on('connection', socket=>{
  socket.on('room:create',(data={}, callback)=>{
    if (!allowAttempt(socket)) return ackError(callback,'Zu viele Anfragen. Später erneut versuchen.');
    if (rooms.size >= MAX_ROOMS) return ackError(callback,'Server ausgelastet');
    const code = makeCode();
    const pin = String(randomInt(100000,1000000));
    const room={ code, pinHash:hash(pin), state:initialState(data.nameA,data.nameB), undo:[], lastUsed:now() };
    rooms.set(code,room);
    enterRoom(socket,room,'ref');
    if (typeof callback==='function') callback({ok:true,code,pin,role:'ref',state:publicState(room)});
    publish(room);
  });
  socket.on('room:join',(data={},callback)=>{
    if (!allowAttempt(socket)) return ackError(callback,'Zu viele Anfragen. Später erneut versuchen.');
    const code=String(data.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    const room=rooms.get(code);
    if (!room) return ackError(callback,'Spielcode nicht gefunden');
    const role=data.pin ? (matchPin(String(data.pin),room.pinHash) ? 'ref':null) : 'viewer';
    if (!role) return ackError(callback,'Schiedsrichter-PIN ist falsch');
    enterRoom(socket,room,role);
    if (typeof callback==='function') callback({ok:true,code,role,state:publicState(room)});
    publish(room);
  });
  socket.on('ref:action',(action={},callback)=>{
    const room=rooms.get(socket.data.room);
    if (!room || socket.data.role!=='ref') return ackError(callback,'Nur der Schiedsrichter darf Änderungen vornehmen');
    if (!action || typeof action.type!=='string') return ackError(callback,'Ungültige Aktion');
    clockTicks(room.state);
    if (action.type==='undo') {
      if (!room.undo.length) return ackError(callback,'Nichts zum Rückgängig machen');
      room.state=room.undo.pop();
      stopAll(room.state);
      room.state.lastEvent='Letzte Aktion rückgängig · Uhren pausiert';
      publish(room);
      if (typeof callback==='function') callback({ok:true});
      return;
    }
    const previous=clone(room.state);
    const error=applyAction(room.state,action.type,action.data||{});
    if (error) return ackError(callback,error);
    if (action.type==='game:reset') room.undo=[];
    else { room.undo.push(previous); if (room.undo.length>20) room.undo.shift(); }
    room.lastUsed=now();
    publish(room);
    if (typeof callback==='function') callback({ok:true});
  });
  socket.on('disconnect',()=>{
    const room=rooms.get(socket.data.room);
    if (room) { room.lastUsed=now(); setTimeout(()=>publish(room), 0); }
  });
});

setInterval(()=>{
  for (const room of rooms.values()) {
    const s=room.state;
    if (s.gameRunning || s.playRunning || s.passRunning || s.ballLive) {
      clockTicks(s);
      publish(room);
    }
    if (now() - room.lastUsed > IDLE_MS && !(io.sockets.adapter.rooms.get(room.code)?.size)) rooms.delete(room.code);
  }
}, 250).unref();

setInterval(()=>{
  for (const [ip,a] of attempts) if (now()-a.since>120000) attempts.delete(ip);
},60000).unref();

const PORT=Number(process.env.PORT||3000);
server.listen(PORT,'0.0.0.0',()=>console.log(`FLAG LIVE listening on ${PORT}`));
export { app, server, io, rooms };
