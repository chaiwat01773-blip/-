import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { BUILTIN_QUESTION_PACKS } from './src/shared/questionPacks.ts';
import type {
  BlookAvatarId,
  GamePhase,
  GameStateSnapshot,
  PlayerPublicState,
  PublicQuestionPayload,
  QuestionPack,
  QuizQuestion,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_INDEX = path.resolve(__dirname, 'dist', 'index.html');
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && fs.existsSync(DIST_INDEX));

interface ServerPlayer extends PlayerPublicState {
  answerTimestamp: number | null;
}

interface RoomState {
  pin: string;
  hostId: string;
  phase: GamePhase;
  packTitle: string;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  questionStartedAt: number;
  questionEndsAt: number;
  timerHandle: ReturnType<typeof setTimeout> | null;
  players: Map<string, ServerPlayer>;
}

const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, { pin: string; role: 'host' | 'player' }>();

function generatePin(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(pin)) return pin;
  }
  return String(Date.now()).slice(-6);
}

function toPublicPlayers(room: RoomState, hideAnswers: boolean): PlayerPublicState[] {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    streak: p.streak,
    lastPointsEarned: p.lastPointsEarned,
    answeredCurrent: p.answeredCurrent,
    selectedOption: hideAnswers ? null : p.selectedOption,
    x: p.x,
    z: p.z,
    rotY: p.rotY,
    vy: p.vy,
  }));
}

function buildPublicQuestion(room: RoomState): PublicQuestionPayload | null {
  const q = room.questions[room.currentQuestionIndex];
  if (!q) return null;
  return {
    index: room.currentQuestionIndex,
    total: room.questions.length,
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    timeLimitSec: q.timeLimitSec,
    endsAt: room.questionEndsAt,
  };
}

function computeOptionCounts(room: RoomState): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const p of room.players.values()) {
    if (p.selectedOption !== null && p.selectedOption >= 0 && p.selectedOption <= 3) {
      counts[p.selectedOption]++;
    }
  }
  return counts;
}

function buildSnapshot(room: RoomState, forHost: boolean): GameStateSnapshot {
  const q = room.questions[room.currentQuestionIndex];
  const hideAnswers = room.phase === 'question' && !forHost;
  const showCorrect = room.phase === 'reveal' || room.phase === 'podium' || (forHost && room.phase === 'question');

  return {
    pin: room.pin,
    phase: room.phase,
    packTitle: room.packTitle,
    questionCount: room.questions.length,
    currentQuestionIndex: room.currentQuestionIndex,
    question: room.phase === 'question' || room.phase === 'reveal' ? buildPublicQuestion(room) : null,
    correctIndex: showCorrect && q ? q.correctIndex : null,
    optionCounts: room.phase === 'reveal' || forHost ? computeOptionCounts(room) : [0, 0, 0, 0],
    players: toPublicPlayers(room, hideAnswers),
  };
}

function clearRoomTimer(room: RoomState) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = null;
  }
}

function spawnPositionForIndex(index: number): { x: number; z: number; rotY: number } {
  const angle = (index * 2.39996) % (Math.PI * 2); // golden angle spiral around center
  const radius = 2.6 + (index % 4) * 0.85;
  return {
    x: Number((Math.cos(angle) * radius).toFixed(2)),
    z: Number((Math.sin(angle) * radius).toFixed(2)),
    rotY: Number((-angle + Math.PI / 2).toFixed(2)),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  function broadcastState(room: RoomState) {
    io.to(room.hostId).emit('game_state', buildSnapshot(room, true));
    for (const playerId of room.players.keys()) {
      io.to(playerId).emit('game_state', buildSnapshot(room, false));
    }
  }

  function executeReveal(room: RoomState) {
    if (room.phase !== 'question') return;
    clearRoomTimer(room);
    room.phase = 'reveal';

    const q = room.questions[room.currentQuestionIndex];
    const durationMs = Math.max(1000, room.questionEndsAt - room.questionStartedAt);

    if (q) {
      for (const p of room.players.values()) {
        if (p.selectedOption === q.correctIndex) {
          const elapsedMs = p.answerTimestamp
            ? Math.max(0, p.answerTimestamp - room.questionStartedAt)
            : durationMs;
          const speedRatio = Math.max(0, 1 - elapsedMs / durationMs);
          p.streak += 1;
          const streakBonus = Math.min(400, (p.streak - 1) * 100);
          const earned = Math.round(500 + speedRatio * 500 + streakBonus);
          p.score += earned;
          p.lastPointsEarned = earned;
        } else {
          p.streak = 0;
          p.lastPointsEarned = 0;
        }
      }
    }

    broadcastState(room);
  }

  function startQuestionAtIndex(room: RoomState, idx: number) {
    clearRoomTimer(room);
    if (idx >= room.questions.length) {
      room.phase = 'podium';
      broadcastState(room);
      return;
    }

    room.currentQuestionIndex = idx;
    room.phase = 'question';
    const q = room.questions[idx];
    const now = Date.now();
    room.questionStartedAt = now;
    room.questionEndsAt = now + q.timeLimitSec * 1000;

    let spawnIdx = 0;
    for (const p of room.players.values()) {
      p.answeredCurrent = false;
      p.selectedOption = null;
      p.lastPointsEarned = 0;
      p.answerTimestamp = null;
      const pos = spawnPositionForIndex(spawnIdx++);
      p.x = pos.x;
      p.z = pos.z;
      p.rotY = pos.rotY;
      p.vy = 0;
    }

    broadcastState(room);

    room.timerHandle = setTimeout(() => {
      executeReveal(room);
    }, q.timeLimitSec * 1000 + 200);
  }

  io.on('connection', (socket) => {
    socket.on('create_room', (payload?: { pack?: QuestionPack }) => {
      // Leave any prior room cleanly
      cleanupSocket(socket.id);

      const pin = generatePin();
      const defaultPack = BUILTIN_QUESTION_PACKS[0];
      const chosenPack =
        payload?.pack && Array.isArray(payload.pack.questions) && payload.pack.questions.length > 0
          ? payload.pack
          : defaultPack;

      const room: RoomState = {
        pin,
        hostId: socket.id,
        phase: 'lobby',
        packTitle: chosenPack.title,
        questions: chosenPack.questions,
        currentQuestionIndex: 0,
        questionStartedAt: 0,
        questionEndsAt: 0,
        timerHandle: null,
        players: new Map(),
      };

      rooms.set(pin, room);
      socketToRoom.set(socket.id, { pin, role: 'host' });
      socket.join(pin);

      socket.emit('room_created', {
        pin,
        snapshot: buildSnapshot(room, true),
      });
    });

    socket.on('update_pack', (payload: { pin: string; title: string; questions: QuizQuestion[] }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'host') return;
      const room = rooms.get(mapping.pin);
      if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;

      if (!Array.isArray(payload?.questions) || payload.questions.length === 0) return;

      room.packTitle = (payload.title || 'ชุดคำถามกำหนดเอง').trim().slice(0, 60);
      room.questions = payload.questions.slice(0, 50).map((q, i) => ({
        id: q.id || `custom-${i}`,
        prompt: String(q.prompt || '').trim().slice(0, 220),
        options: [
          String(q.options?.[0] ?? 'A').trim().slice(0, 100),
          String(q.options?.[1] ?? 'B').trim().slice(0, 100),
          String(q.options?.[2] ?? 'C').trim().slice(0, 100),
          String(q.options?.[3] ?? 'D').trim().slice(0, 100),
        ],
        correctIndex: ([0, 1, 2, 3].includes(Number(q.correctIndex)) ? Number(q.correctIndex) : 0) as
          | 0
          | 1
          | 2
          | 3,
        timeLimitSec:
          Number.isFinite(Number(q.timeLimitSec)) && Number(q.timeLimitSec) >= 5 && Number(q.timeLimitSec) <= 60
            ? Math.round(Number(q.timeLimitSec))
            : 18,
      }));

      broadcastState(room);
    });

    socket.on(
      'join_room',
      (payload: { pin: string; name: string; avatar: BlookAvatarId }) => {
        const pin = String(payload?.pin || '').trim();
        const name = String(payload?.name || '').trim().slice(0, 20);
        const avatar = (payload?.avatar || 'fox') as BlookAvatarId;

        if (!/^\d{6}$/.test(pin)) {
          return socket.emit('join_error', { message: 'กรุณากรอกรหัส Game PIN ตัวเลข 6 หลัก' });
        }

        const room = rooms.get(pin);
        if (!room) {
          return socket.emit('join_error', { message: `ไม่พบห้องเกม PIN ${pin} กรุณาตรวจสอบรหัสอีกครั้ง` });
        }

        if (!name) {
          return socket.emit('join_error', { message: 'กรุณาใส่ชื่อเล่นของคุณ' });
        }

        if (room.phase !== 'lobby') {
          return socket.emit('join_error', { message: 'เกมในห้องนี้เริ่มไปแล้ว รอรอบถัดไปนะ!' });
        }

        const duplicate = Array.from(room.players.values()).some(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          return socket.emit('join_error', { message: `มีผู้เล่นชื่อ "${name}" อยู่ในห้องแล้ว` });
        }

        cleanupSocket(socket.id);

        const spawn = spawnPositionForIndex(room.players.size);
        const player: ServerPlayer = {
          id: socket.id,
          name,
          avatar,
          score: 0,
          streak: 0,
          lastPointsEarned: 0,
          answeredCurrent: false,
          selectedOption: null,
          answerTimestamp: null,
          x: spawn.x,
          z: spawn.z,
          rotY: spawn.rotY,
          vy: 0,
        };

        room.players.set(socket.id, player);
        socketToRoom.set(socket.id, { pin, role: 'player' });
        socket.join(pin);

        socket.emit('join_success', {
          pin,
          playerId: socket.id,
          snapshot: buildSnapshot(room, false),
        });

        broadcastState(room);
      },
    );

    socket.on('kick_player', ({ pin, playerId }: { pin: string; playerId: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;

      const target = room.players.get(playerId);
      if (!target) return;

      room.players.delete(playerId);
      socketToRoom.delete(playerId);

      const targetSocket = io.sockets.sockets.get(playerId);
      if (targetSocket) {
        targetSocket.leave(pin);
        targetSocket.emit('kicked', { message: 'คุณถูกเชิญออกจากห้องโดยผู้จัดกิจกรรม (Host)' });
      }

      broadcastState(room);
    });

    socket.on('start_game', ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;
      if (room.questions.length === 0) return;

      for (const p of room.players.values()) {
        p.score = 0;
        p.streak = 0;
        p.lastPointsEarned = 0;
      }

      startQuestionAtIndex(room, 0);
    });

    socket.on('reveal_answer', ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;
      executeReveal(room);
    });

    socket.on('next_question', ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;
      if (room.phase !== 'reveal') return;
      startQuestionAtIndex(room, room.currentQuestionIndex + 1);
    });

    socket.on('restart_lobby', ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;
      clearRoomTimer(room);
      room.phase = 'lobby';
      room.currentQuestionIndex = 0;
      let idx = 0;
      for (const p of room.players.values()) {
        p.score = 0;
        p.streak = 0;
        p.lastPointsEarned = 0;
        p.answeredCurrent = false;
        p.selectedOption = null;
        p.answerTimestamp = null;
        const pos = spawnPositionForIndex(idx++);
        p.x = pos.x;
        p.z = pos.z;
        p.rotY = pos.rotY;
      }
      broadcastState(room);
    });

    socket.on('player_move', (payload: { x: number; z: number; rotY: number; vy: number }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'player') return;
      const room = rooms.get(mapping.pin);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;

      const x = Math.max(-13.5, Math.min(13.5, Number(payload.x) || 0));
      const z = Math.max(-13.5, Math.min(13.5, Number(payload.z) || 0));
      const rotY = Number(payload.rotY) || 0;
      const vy = Math.max(-10, Math.min(15, Number(payload.vy) || 0));

      player.x = x;
      player.z = z;
      player.rotY = rotY;
      player.vy = vy;

      socket.to(room.pin).emit('player_moved', {
        id: socket.id,
        x,
        z,
        rotY,
        vy,
      });
    });

    socket.on('submit_answer', ({ optionIndex }: { optionIndex: number }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'player') return;
      const room = rooms.get(mapping.pin);
      if (!room || room.phase !== 'question') return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const opt = Number(optionIndex);
      if (![0, 1, 2, 3].includes(opt)) return;

      // Allow changing answer before timer expires if desired, or lock first answer:
      // Locking first answer prevents accidental double-pad triggers while running,
      // OR updating timestamp on change. Let's lock on explicit choose or pad stand:
      if (player.answeredCurrent) return;

      player.answeredCurrent = true;
      player.selectedOption = opt;
      player.answerTimestamp = Date.now();

      broadcastState(room);

      // Auto-reveal if every player in the room has answered
      const totalPlayers = room.players.size;
      if (totalPlayers > 0) {
        const answeredCount = Array.from(room.players.values()).filter((p) => p.answeredCurrent).length;
        if (answeredCount >= totalPlayers) {
          setTimeout(() => {
            if (room.phase === 'question') {
              executeReveal(room);
            }
          }, 450);
        }
      }
    });

    socket.on('leave_room', () => {
      cleanupSocket(socket.id);
    });

    socket.on('disconnect', () => {
      cleanupSocket(socket.id);
    });
  });

  function cleanupSocket(socketId: string) {
    const mapping = socketToRoom.get(socketId);
    if (!mapping) return;
    socketToRoom.delete(socketId);

    const room = rooms.get(mapping.pin);
    if (!room) return;

    if (mapping.role === 'host') {
      clearRoomTimer(room);
      io.to(room.pin).emit('room_closed', {
        message: 'ผู้สร้างห้อง (Host) ได้ปิดห้องเกมแล้ว',
      });
      for (const pId of room.players.keys()) {
        socketToRoom.delete(pId);
        const s = io.sockets.sockets.get(pId);
        s?.leave(room.pin);
      }
      rooms.delete(room.pin);
    } else {
      room.players.delete(socketId);
      const s = io.sockets.sockets.get(socketId);
      s?.leave(room.pin);
      broadcastState(room);
    }
  }

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BlookLobby 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
