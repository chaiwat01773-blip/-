import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { BUILTIN_QUESTION_PACKS } from './src/shared/questionPacks.ts';
import {
  DEFAULT_ZOMBIE_PUZZLES,
  ensurePuzzleChoices,
  generateBossPuzzleSequence,
  generateLogicPuzzle,
  isLogicAnswerMatch,
  pickReplacementPuzzle,
} from './src/shared/logicPuzzles.ts';
import type {
  BlookAvatarId,
  GameMode,
  GamePhase,
  GameStateSnapshot,
  LogicPuzzle,
  PlayerPublicState,
  PublicQuestionPayload,
  QuestionPack,
  QuizQuestion,
  TeamId,
  TeamZombieGameEntry,
  ZombieBreachEvent,
  ZombieDefenderPublic,
  ZombieEntityPublic,
  ZombieGameSnapshot,
  ZombieShotEvent,
  ZombieTier,
  ZombieWrongEvent,
} from './src/shared/types.ts';

const TEAM_IDS: TeamId[] = ['A', 'B', 'C', 'D'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_INDEX = path.resolve(__dirname, 'dist', 'index.html');
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && fs.existsSync(DIST_INDEX));

interface ServerPlayer extends PlayerPublicState {
  team: TeamId;
  answerTimestamp: number | null;
}

interface ZombieSimulation {
  teamId?: TeamId;
  hp: number;
  maxHp: number;
  teamScore: number;
  wave: number;
  kills: number;
  paused: boolean;
  gameOver: boolean;
  bossRushActive: boolean;
  lastBossWave: number;
  zombies: ZombieEntityPublic[];
  defenders: Map<string, ZombieDefenderPublic>;
  spawnTimer: number;
  lastTickAt: number;
  puzzleCursor: number;
}

interface RoomState {
  pin: string;
  mode: GameMode;
  hostId: string;
  hostToken: string;
  hostAvatar: BlookAvatarId;
  hostGraceTimer: ReturnType<typeof setTimeout> | null;
  phase: GamePhase;
  packTitle: string;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  questionStartedAt: number;
  questionEndsAt: number;
  timerHandle: ReturnType<typeof setTimeout> | null;
  players: Map<string, ServerPlayer>;
  zombiePackTitle: string;
  zombiePuzzles: LogicPuzzle[];
  zombieAutoFill: boolean;
  zombieSim: ZombieSimulation | null;
  zombieTeamSims: Map<TeamId, ZombieSimulation>;
  zombieInterval: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, { pin: string; role: 'host' | 'player' }>();
let zombieEntitySeq = 0;

function generatePin(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(pin)) return pin;
  }
  return String(Date.now()).slice(-6);
}

function normalizeTeamId(raw: unknown): TeamId {
  return raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D' ? raw : 'A';
}

function pickBalancedDefaultTeam(room: RoomState): TeamId {
  const counts: Record<TeamId, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of room.players.values()) {
    counts[p.team] = (counts[p.team] || 0) + 1;
  }
  let best: TeamId = 'A';
  for (const t of TEAM_IDS) {
    if (counts[t] < counts[best]) best = t;
  }
  return best;
}

function toPublicPlayers(room: RoomState, hideAnswers: boolean): PlayerPublicState[] {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    team: p.team,
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

function buildZombieSnapshotFromSim(sim: ZombieSimulation | null | undefined): ZombieGameSnapshot | null {
  if (!sim) return null;
  return {
    teamId: sim.teamId,
    hp: sim.hp,
    maxHp: sim.maxHp,
    teamScore: sim.teamScore,
    wave: sim.wave,
    kills: sim.kills,
    paused: sim.paused,
    gameOver: sim.gameOver,
    bossRushActive: sim.bossRushActive,
    zombies: sim.zombies.map((z) => ({
      id: z.id,
      puzzle: z.puzzle,
      x: Number(z.x.toFixed(3)),
      z: Number(z.z.toFixed(3)),
      speed: z.speed,
      phaseOffset: z.phaseOffset,
      enraged: z.enraged,
      isBoss: z.isBoss,
      bossStep: z.bossStep,
      bossTotalSteps: z.bossTotalSteps,
    })),
    defenders: Array.from(sim.defenders.values()),
    serverTime: Date.now(),
  };
}

function buildZombieTeamsEntries(room: RoomState): TeamZombieGameEntry[] {
  const entries: TeamZombieGameEntry[] = [];
  for (const teamId of TEAM_IDS) {
    const sim = room.zombieTeamSims.get(teamId);
    if (!sim) continue;
    const snap = buildZombieSnapshotFromSim(sim);
    if (!snap) continue;
    entries.push({
      teamId,
      memberCount: sim.defenders.size,
      snapshot: snap,
    });
  }
  return entries;
}

function buildSnapshot(room: RoomState, forHost: boolean, viewerTeam?: TeamId): GameStateSnapshot {
  const q = room.questions[room.currentQuestionIndex];
  const hideAnswers = room.phase === 'question' && !forHost;
  const showCorrect =
    room.phase === 'reveal' || room.phase === 'podium' || (forHost && room.phase === 'question');

  let zombieState: ZombieGameSnapshot | null = null;
  let zombieTeamsState: TeamZombieGameEntry[] | null = null;

  if (room.phase === 'zombie') {
    if (room.mode === 'zombie_teams') {
      if (forHost) {
        zombieTeamsState = buildZombieTeamsEntries(room);
      } else if (viewerTeam) {
        zombieState = buildZombieSnapshotFromSim(room.zombieTeamSims.get(viewerTeam));
      }
    } else {
      zombieState = buildZombieSnapshotFromSim(room.zombieSim);
    }
  }

  return {
    pin: room.pin,
    mode: room.mode,
    phase: room.phase,
    packTitle: room.packTitle,
    questionCount: room.questions.length,
    currentQuestionIndex: room.currentQuestionIndex,
    question:
      room.phase === 'question' || room.phase === 'reveal' ? buildPublicQuestion(room) : null,
    correctIndex: showCorrect && q ? q.correctIndex : null,
    optionCounts: room.phase === 'reveal' || forHost ? computeOptionCounts(room) : [0, 0, 0, 0],
    players: toPublicPlayers(room, hideAnswers),
    zombiePackTitle: room.zombiePackTitle,
    zombiePuzzleCount: room.zombiePuzzles.length,
    zombiePuzzles: forHost ? room.zombiePuzzles : [],
    zombieAutoFill: room.zombieAutoFill,
    zombieState,
    zombieTeamsState,
  };
}

function clearRoomTimer(room: RoomState) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = null;
  }
  if (room.zombieInterval) {
    clearInterval(room.zombieInterval);
    room.zombieInterval = null;
  }
}

function spawnPositionForIndex(index: number): { x: number; z: number; rotY: number } {
  const angle = (index * 2.39996) % (Math.PI * 2);
  const radius = 2.6 + (index % 4) * 0.85;
  return {
    x: Number((Math.cos(angle) * radius).toFixed(2)),
    z: Number((Math.sin(angle) * radius).toFixed(2)),
    rotY: Number((-angle + Math.PI / 2).toFixed(2)),
  };
}

function layoutDefenderZPositions(sim: ZombieSimulation) {
  const list = Array.from(sim.defenders.values());
  const count = list.length;
  if (count === 0) return;
  if (count === 1) {
    list[0].zPos = 0;
    return;
  }
  const span = Math.min(6.6, (count - 1) * 1.9);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    list[i].zPos = Number((-span / 2 + t * span).toFixed(2));
  }
}

function pickTierForWave(wave: number): ZombieTier {
  const r = Math.random();
  if (wave <= 1) return 'easy';
  if (wave === 2) return r < 0.6 ? 'easy' : 'medium';
  if (r < 0.42) return 'easy';
  if (r < 0.78) return 'medium';
  return 'hard';
}

function pickPuzzleForZombie(room: RoomState, sim: ZombieSimulation): LogicPuzzle {
  const desiredTier = pickTierForWave(sim.wave);

  if (room.zombiePuzzles.length === 0) {
    return generateLogicPuzzle(desiredTier);
  }

  if (room.zombieAutoFill && Math.random() < 0.25) {
    return generateLogicPuzzle(desiredTier);
  }

  const tierMatches = room.zombiePuzzles.filter((p) => p.tier === desiredTier);
  const pool = tierMatches.length > 0 ? tierMatches : room.zombiePuzzles;
  const chosen = pool[sim.puzzleCursor % pool.length];
  sim.puzzleCursor += 1;
  return ensurePuzzleChoices(
    {
      ...chosen,
      acceptedAnswers: [...chosen.acceptedAnswers],
      quickChoices: [...chosen.quickChoices],
    },
    room.zombiePuzzles,
  );
}

function spawnZombieInSim(room: RoomState, sim: ZombieSimulation, startX = 14.5, customZ?: number) {
  const puzzle = pickPuzzleForZombie(room, sim);
  const z = customZ ?? Number(((Math.random() - 0.5) * 6.4).toFixed(2));
  const baseSpeed =
    puzzle.tier === 'easy'
      ? 1.0 + sim.wave * 0.08
      : puzzle.tier === 'medium'
        ? 0.85 + sim.wave * 0.07
        : 0.72 + sim.wave * 0.06;

  sim.zombies.push({
    id: `zmb-${++zombieEntitySeq}`,
    puzzle,
    x: startX,
    z,
    speed: Math.min(2.25, Number(baseSpeed.toFixed(2))),
    phaseOffset: Number((Math.random() * Math.PI * 2).toFixed(2)),
  });
}

function spawnBossInSim(room: RoomState, sim: ZombieSimulation) {
  const bossPuzzles = generateBossPuzzleSequence(room.zombiePuzzles, room.zombieAutoFill);
  sim.lastBossWave = sim.wave;
  sim.zombies.push({
    id: `boss-${++zombieEntitySeq}`,
    puzzle: bossPuzzles[0],
    x: 15.2,
    z: 0,
    speed: 0.42,
    phaseOffset: 0,
    enraged: false,
    isBoss: true,
    bossStep: 0,
    bossTotalSteps: bossPuzzles.length,
    bossPuzzles,
  });
}

function sanitizeZombiePuzzles(rawPuzzles: LogicPuzzle[]): LogicPuzzle[] {
  return rawPuzzles
    .slice(0, 60)
    .map((p, i): LogicPuzzle | null => {
      const prompt = String(p.prompt || '').trim().slice(0, 140);
      const displayAnswer = String(p.displayAnswer || '').trim().slice(0, 60);
      if (!prompt || !displayAnswer) return null;

      const tier: ZombieTier =
        p.tier === 'easy' || p.tier === 'medium' || p.tier === 'hard' ? p.tier : 'medium';

      const acceptedSet = new Set<string>([displayAnswer]);
      if (Array.isArray(p.acceptedAnswers)) {
        p.acceptedAnswers.forEach((a) => {
          const clean = String(a || '').trim().slice(0, 60);
          if (clean) acceptedSet.add(clean);
        });
      }

      const quickChoices: string[] = [];
      if (Array.isArray(p.quickChoices)) {
        p.quickChoices.forEach((c) => {
          const clean = String(c || '').trim().slice(0, 40);
          if (clean && !quickChoices.includes(clean)) quickChoices.push(clean);
        });
      }
      if (quickChoices.length > 0 && !quickChoices.includes(displayAnswer)) {
        quickChoices.unshift(displayAnswer);
      }

      return {
        id: String(p.id || `z-custom-${Date.now()}-${i}`),
        tier,
        prompt,
        displayAnswer,
        acceptedAnswers: Array.from(acceptedSet),
        quickChoices: quickChoices.slice(0, 4),
      };
    })
    .filter((item): item is LogicPuzzle => item !== null);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/app-info', (_req, res) => {
    res.json({ appUrl: process.env.APP_URL || '' });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  function broadcastState(room: RoomState) {
    io.to(room.hostId).emit('game_state', buildSnapshot(room, true));
    for (const [playerId, player] of room.players.entries()) {
      io.to(playerId).emit('game_state', buildSnapshot(room, false, player.team));
    }
  }

  function emitToZombieAudience(room: RoomState, teamId: TeamId | undefined, event: string, data: unknown) {
    if (!teamId || room.mode !== 'zombie_teams') {
      io.to(room.pin).emit(event, data);
      return;
    }
    io.to(room.hostId).emit(event, data);
    for (const [playerId, player] of room.players.entries()) {
      if (player.team === teamId) {
        io.to(playerId).emit(event, data);
      }
    }
  }

  function broadcastZombieState(room: RoomState) {
    if (room.mode === 'zombie_teams') {
      const entries = buildZombieTeamsEntries(room);
      io.to(room.hostId).emit('zombie_teams_state', entries);
      for (const [playerId, player] of room.players.entries()) {
        const snap = buildZombieSnapshotFromSim(room.zombieTeamSims.get(player.team));
        if (snap) {
          io.to(playerId).emit('zombie_state', snap);
        }
      }
      return;
    }

    const zSnap = buildZombieSnapshotFromSim(room.zombieSim);
    if (!zSnap) return;
    io.to(room.pin).emit('zombie_state', zSnap);
  }

  function stepSingleZombieSim(room: RoomState, sim: ZombieSimulation): boolean {
    const now = Date.now();
    const dt = Math.min(0.2, Math.max(0.02, (now - sim.lastTickAt) / 1000));
    sim.lastTickAt = now;

    if (sim.paused || sim.gameOver) return false;

    // 1. Check Boss Wave trigger (every 3 waves: Wave 3, 6, 9...)
    const hasBossAlive = sim.zombies.some((z) => z.isBoss);
    if (
      !sim.bossRushActive &&
      sim.wave >= 3 &&
      sim.wave % 3 === 0 &&
      sim.lastBossWave < sim.wave &&
      !hasBossAlive
    ) {
      spawnBossInSim(room, sim);
    }

    // 2. Regular zombie spawn progression
    if (!sim.bossRushActive) {
      sim.spawnTimer -= dt;
      const maxActive = Math.min(
        7,
        2 + Math.floor(sim.wave * 0.7) + Math.floor(Math.max(0, sim.defenders.size - 1) * 0.4),
      );
      if (sim.spawnTimer <= 0 && sim.zombies.length < maxActive) {
        spawnZombieInSim(room, sim, 14.5);
        sim.spawnTimer = Math.max(1.8, 3.6 - sim.wave * 0.25);
      }
    }

    // 3. Advance zombies & check barricade breach
    for (let i = sim.zombies.length - 1; i >= 0; i--) {
      const z = sim.zombies[i];
      if (z.isBoss) {
        const accel = z.enraged ? 0.24 : 0.16;
        z.speed = Math.min(4.8, Number((z.speed + accel * dt).toFixed(3)));
        if (z.x <= -4.2) {
          z.speed = Math.max(z.speed, 6.4);
        }
      }
      z.x -= z.speed * dt;

      if (z.x <= -8.1) {
        if (z.isBoss) {
          const nearDeadHp = sim.hp > 6 ? 5 : 1;
          const dmg = Math.max(1, sim.hp - nearDeadHp);
          sim.hp = nearDeadHp;
          sim.bossRushActive = true;
          for (const d of sim.defenders.values()) {
            d.streak = 0;
          }
          sim.zombies.splice(i, 1);

          for (const rem of sim.zombies) {
            rem.enraged = true;
            rem.speed = Math.max(rem.speed, Number((6.6 + Math.random() * 1.4).toFixed(2)));
          }
          let extraIdx = 0;
          while (sim.zombies.length < 3) {
            const puzzle = pickPuzzleForZombie(room, sim);
            sim.zombies.push({
              id: `zmb-rush-${++zombieEntitySeq}`,
              puzzle,
              x: 2.5 + extraIdx * 2.2,
              z: (extraIdx - 1) * 2.1,
              speed: 7.4 + extraIdx * 0.4,
              phaseOffset: extraIdx,
              enraged: true,
            });
            extraIdx++;
          }

          const bossBreach: ZombieBreachEvent = {
            teamId: sim.teamId,
            zombieId: z.id,
            x: -8.1,
            z: z.z,
            damage: dmg,
            hpRemaining: sim.hp,
            isBoss: true,
            stampedeTriggered: true,
          };
          emitToZombieAudience(room, sim.teamId, 'zombie_breach', bossBreach);
          continue;
        }

        const dmg = sim.bossRushActive
          ? Math.max(sim.hp, 20)
          : z.puzzle.tier === 'hard'
            ? 30
            : z.puzzle.tier === 'medium'
              ? 20
              : 15;
        sim.hp = Math.max(0, sim.hp - dmg);
        for (const d of sim.defenders.values()) {
          d.streak = 0;
        }
        sim.zombies.splice(i, 1);

        const breachEvent: ZombieBreachEvent = {
          teamId: sim.teamId,
          zombieId: z.id,
          x: -8.1,
          z: z.z,
          damage: dmg,
          hpRemaining: sim.hp,
        };
        emitToZombieAudience(room, sim.teamId, 'zombie_breach', breachEvent);

        if (sim.hp <= 0) {
          sim.gameOver = true;
        }
      }
    }

    return true;
  }

  function tickZombieRoom(room: RoomState) {
    if (room.phase !== 'zombie') return;
    if (room.mode === 'zombie_teams') {
      let anyUpdated = false;
      for (const sim of room.zombieTeamSims.values()) {
        if (stepSingleZombieSim(room, sim)) {
          anyUpdated = true;
        }
      }
      if (anyUpdated) {
        broadcastZombieState(room);
      }
      return;
    }

    const sim = room.zombieSim;
    if (!sim) return;
    if (stepSingleZombieSim(room, sim)) {
      broadcastZombieState(room);
    }
  }

  function createSimForDefenders(
    room: RoomState,
    defenders: Map<string, ZombieDefenderPublic>,
    teamId?: TeamId,
  ): ZombieSimulation {
    const sim: ZombieSimulation = {
      teamId,
      hp: 100,
      maxHp: 100,
      teamScore: 0,
      wave: 1,
      kills: 0,
      paused: false,
      gameOver: false,
      bossRushActive: false,
      lastBossWave: 0,
      zombies: [],
      defenders,
      spawnTimer: 1.0,
      lastTickAt: Date.now(),
      puzzleCursor: 0,
    };

    layoutDefenderZPositions(sim);
    spawnZombieInSim(room, sim, 10.8, -1.6);
    spawnZombieInSim(room, sim, 14.0, 1.8);
    return sim;
  }

  function startZombieGame(room: RoomState) {
    clearRoomTimer(room);
    room.mode = 'zombie';
    room.phase = 'zombie';
    room.zombieTeamSims.clear();

    const defenders = new Map<string, ZombieDefenderPublic>();
    defenders.set('host', {
      id: 'host',
      name: 'ผู้สร้างห้อง (Host)',
      avatar: room.hostAvatar,
      isHost: true,
      score: 0,
      kills: 0,
      streak: 0,
      bestStreak: 0,
      explosiveAmmo: 1,
      zPos: 0,
    });

    for (const p of room.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.lastPointsEarned = 0;
      defenders.set(p.id, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: false,
        score: 0,
        kills: 0,
        streak: 0,
        bestStreak: 0,
        explosiveAmmo: 1,
        zPos: 0,
      });
    }

    room.zombieSim = createSimForDefenders(room, defenders);
    broadcastState(room);

    room.zombieInterval = setInterval(() => {
      tickZombieRoom(room);
    }, 100);
  }

  function startZombieTeamsGame(room: RoomState) {
    clearRoomTimer(room);
    room.mode = 'zombie_teams';
    room.phase = 'zombie';
    room.zombieSim = null;
    room.zombieTeamSims.clear();

    const teamGroups = new Map<TeamId, Map<string, ZombieDefenderPublic>>();
    for (const p of room.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.lastPointsEarned = 0;
      const t = p.team || 'A';
      let map = teamGroups.get(t);
      if (!map) {
        map = new Map<string, ZombieDefenderPublic>();
        teamGroups.set(t, map);
      }
      map.set(p.id, {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: false,
        score: 0,
        kills: 0,
        streak: 0,
        bestStreak: 0,
        explosiveAmmo: 1,
        zPos: 0,
      });
    }

    // Ensure at least Team A arena exists if host starts before players join
    if (teamGroups.size === 0) {
      teamGroups.set('A', new Map());
    }

    for (const t of TEAM_IDS) {
      const defenders = teamGroups.get(t);
      if (!defenders) continue;
      room.zombieTeamSims.set(t, createSimForDefenders(room, defenders, t));
    }

    broadcastState(room);

    room.zombieInterval = setInterval(() => {
      tickZombieRoom(room);
    }, 100);
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
    socket.on(
      'create_room',
      (payload?: { mode?: GameMode; pack?: QuestionPack; hostAvatar?: BlookAvatarId }) => {
        cleanupSocket(socket.id, true);

        const pin = generatePin();
        const hostToken = crypto.randomUUID();
        const defaultPack = BUILTIN_QUESTION_PACKS[0];
        const chosenPack =
          payload?.pack && Array.isArray(payload.pack.questions) && payload.pack.questions.length > 0
            ? payload.pack
            : defaultPack;
        const mode: GameMode =
          payload?.mode === 'zombie_teams'
            ? 'zombie_teams'
            : payload?.mode === 'zombie'
              ? 'zombie'
              : 'quiz';
        const hostAvatar: BlookAvatarId = payload?.hostAvatar || 'robot';

        const room: RoomState = {
          pin,
          mode,
          hostId: socket.id,
          hostToken,
          hostAvatar,
          hostGraceTimer: null,
          phase: 'lobby',
          packTitle: chosenPack.title,
          questions: chosenPack.questions,
          currentQuestionIndex: 0,
          questionStartedAt: 0,
          questionEndsAt: 0,
          timerHandle: null,
          players: new Map(),
          zombiePackTitle: 'ตรรกศาสตร์พื้นฐาน (Easy - Hard)',
          zombiePuzzles: DEFAULT_ZOMBIE_PUZZLES.map((p) => ({
            ...p,
            acceptedAnswers: [...p.acceptedAnswers],
            quickChoices: [...p.quickChoices],
          })),
          zombieAutoFill: true,
          zombieSim: null,
          zombieTeamSims: new Map(),
          zombieInterval: null,
        };

        rooms.set(pin, room);
        socketToRoom.set(socket.id, { pin, role: 'host' });
        socket.join(pin);

        socket.emit('room_created', {
          pin,
          hostToken,
          snapshot: buildSnapshot(room, true),
        });
      },
    );

    socket.on('reclaim_host', (payload: { pin: string; hostToken: string }) => {
      const pin = String(payload?.pin || '').trim();
      const token = String(payload?.hostToken || '').trim();
      const room = rooms.get(pin);
      if (!room || !token || room.hostToken !== token) {
        socket.emit('host_reclaim_failed');
        return;
      }

      if (room.hostGraceTimer) {
        clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = null;
      }

      socketToRoom.delete(room.hostId);
      room.hostId = socket.id;
      socketToRoom.set(socket.id, { pin, role: 'host' });
      socket.join(pin);

      socket.emit('room_created', {
        pin,
        hostToken: room.hostToken,
        snapshot: buildSnapshot(room, true),
      });
    });

    socket.on('set_game_mode', (payload: { pin: string; mode: GameMode }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'host') return;
      const room = rooms.get(mapping.pin);
      if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;

      room.mode =
        payload?.mode === 'zombie_teams'
          ? 'zombie_teams'
          : payload?.mode === 'zombie'
            ? 'zombie'
            : 'quiz';
      broadcastState(room);
    });

    socket.on('set_host_avatar', (payload: { pin: string; avatar: BlookAvatarId }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'host') return;
      const room = rooms.get(mapping.pin);
      if (!room || room.hostId !== socket.id) return;
      room.hostAvatar = payload?.avatar || 'robot';
      if (room.zombieSim) {
        const hostDef = room.zombieSim.defenders.get('host');
        if (hostDef) hostDef.avatar = room.hostAvatar;
      }
      broadcastState(room);
    });

    socket.on(
      'update_pack',
      (payload: { pin: string; title: string; questions: QuizQuestion[] }) => {
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
          correctIndex: ([0, 1, 2, 3].includes(Number(q.correctIndex))
            ? Number(q.correctIndex)
            : 0) as 0 | 1 | 2 | 3,
          timeLimitSec:
            Number.isFinite(Number(q.timeLimitSec)) &&
            Number(q.timeLimitSec) >= 5 &&
            Number(q.timeLimitSec) <= 60
              ? Math.round(Number(q.timeLimitSec))
              : 18,
        }));

        broadcastState(room);
      },
    );

    socket.on(
      'update_zombie_puzzles',
      (payload: { pin: string; title: string; puzzles: LogicPuzzle[]; autoFill: boolean }) => {
        const mapping = socketToRoom.get(socket.id);
        if (!mapping || mapping.role !== 'host') return;
        const room = rooms.get(mapping.pin);
        if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;

        if (!Array.isArray(payload?.puzzles)) return;
        const sanitized = sanitizeZombiePuzzles(payload.puzzles);
        if (sanitized.length === 0 && !payload.autoFill) return;

        room.zombiePackTitle = (payload.title || 'ชุดโจทย์ซอมบี้กำหนดเอง').trim().slice(0, 60);
        room.zombiePuzzles = sanitized;
        room.zombieAutoFill = Boolean(payload.autoFill);

        broadcastState(room);
      },
    );

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
          return socket.emit('join_error', {
            message: `ไม่พบห้องเกม PIN ${pin} กรุณาตรวจสอบรหัสอีกครั้ง`,
          });
        }

        if (!name) {
          return socket.emit('join_error', { message: 'กรุณาใส่ชื่อเล่นของคุณ' });
        }

        if (room.phase === 'podium') {
          return socket.emit('join_error', {
            message: 'เกมในห้องนี้จบลงแล้ว รอ Host กดเริ่มรอบใหม่นะ!',
          });
        }

        const duplicate = Array.from(room.players.values()).some(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          return socket.emit('join_error', { message: `มีผู้เล่นชื่อ "${name}" อยู่ในห้องแล้ว` });
        }

        cleanupSocket(socket.id, true);

        const spawn = spawnPositionForIndex(room.players.size);
        const defaultTeam = pickBalancedDefaultTeam(room);
        const player: ServerPlayer = {
          id: socket.id,
          name,
          avatar,
          team: defaultTeam,
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

        // If joining mid-game during Zombie modes, spawn defender on barricade immediately
        if (room.phase === 'zombie') {
          if (room.mode === 'zombie_teams') {
            let teamSim = room.zombieTeamSims.get(defaultTeam);
            if (!teamSim) {
              teamSim = createSimForDefenders(room, new Map(), defaultTeam);
              room.zombieTeamSims.set(defaultTeam, teamSim);
            }
            teamSim.defenders.set(socket.id, {
              id: socket.id,
              name,
              avatar,
              isHost: false,
              score: 0,
              kills: 0,
              streak: 0,
              bestStreak: 0,
              explosiveAmmo: 1,
              zPos: 0,
            });
            layoutDefenderZPositions(teamSim);
          } else if (room.zombieSim) {
            room.zombieSim.defenders.set(socket.id, {
              id: socket.id,
              name,
              avatar,
              isHost: false,
              score: 0,
              kills: 0,
              streak: 0,
              bestStreak: 0,
              explosiveAmmo: 1,
              zPos: 0,
            });
            layoutDefenderZPositions(room.zombieSim);
          }
        }

        socket.emit('join_success', {
          pin,
          playerId: socket.id,
          snapshot: buildSnapshot(room, false, player.team),
        });

        broadcastState(room);
      },
    );

    socket.on('select_team', (payload: { team: TeamId }) => {
      const mapping = socketToRoom.get(socket.id);
      if (!mapping || mapping.role !== 'player') return;
      const room = rooms.get(mapping.pin);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;

      const nextTeam = normalizeTeamId(payload?.team);
      if (player.team === nextTeam) return;
      const prevTeam = player.team;
      player.team = nextTeam;

      // Also support mid-game team move if room is in zombie_teams phase
      if (room.phase === 'zombie' && room.mode === 'zombie_teams') {
        const oldSim = room.zombieTeamSims.get(prevTeam);
        if (oldSim) {
          oldSim.defenders.delete(socket.id);
          layoutDefenderZPositions(oldSim);
        }
        let nextSim = room.zombieTeamSims.get(nextTeam);
        if (!nextSim) {
          nextSim = createSimForDefenders(room, new Map(), nextTeam);
          room.zombieTeamSims.set(nextTeam, nextSim);
        }
        nextSim.defenders.set(socket.id, {
          id: socket.id,
          name: player.name,
          avatar: player.avatar,
          isHost: false,
          score: 0,
          kills: 0,
          streak: 0,
          bestStreak: 0,
          explosiveAmmo: 1,
          zPos: 0,
        });
        layoutDefenderZPositions(nextSim);
        broadcastZombieState(room);
      }

      broadcastState(room);
    });

    socket.on('kick_player', ({ pin, playerId }: { pin: string; playerId: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;

      const target = room.players.get(playerId);
      if (!target) return;

      room.players.delete(playerId);
      socketToRoom.delete(playerId);
      if (room.zombieSim) {
        room.zombieSim.defenders.delete(playerId);
        layoutDefenderZPositions(room.zombieSim);
      }
      for (const sim of room.zombieTeamSims.values()) {
        if (sim.defenders.delete(playerId)) {
          layoutDefenderZPositions(sim);
        }
      }

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

      if (room.mode === 'zombie_teams') {
        startZombieTeamsGame(room);
        return;
      }

      if (room.mode === 'zombie') {
        startZombieGame(room);
        return;
      }

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
      room.zombieSim = null;
      room.zombieTeamSims.clear();
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

    // Multiplayer Zombie Defense Controls
    socket.on('zombie_pause', ({ pin, paused }: { pin: string; paused: boolean }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id || room.phase !== 'zombie') return;
      if (room.mode === 'zombie_teams') {
        for (const sim of room.zombieTeamSims.values()) {
          if (!sim.gameOver) {
            sim.paused = Boolean(paused);
            sim.lastTickAt = Date.now();
          }
        }
        broadcastZombieState(room);
        return;
      }
      if (!room.zombieSim || room.zombieSim.gameOver) return;
      room.zombieSim.paused = Boolean(paused);
      room.zombieSim.lastTickAt = Date.now();
      broadcastZombieState(room);
    });

    socket.on('zombie_restart', ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || room.hostId !== socket.id) return;
      if (room.mode === 'zombie_teams') {
        startZombieTeamsGame(room);
        return;
      }
      if (room.mode !== 'zombie') return;
      startZombieGame(room);
    });

    socket.on(
      'zombie_shoot',
      (payload: { targetZombieId?: string; answer?: string; explosive?: boolean }) => {
        const mapping = socketToRoom.get(socket.id);
        if (!mapping) return;
        const room = rooms.get(mapping.pin);
        if (!room || room.phase !== 'zombie') return;

        let sim: ZombieSimulation | undefined | null = null;
        let defenderId = socket.id;

        if (room.mode === 'zombie_teams') {
          if (mapping.role !== 'player') return;
          const player = room.players.get(socket.id);
          if (!player) return;
          sim = room.zombieTeamSims.get(player.team);
        } else {
          sim = room.zombieSim;
          defenderId = mapping.role === 'host' && room.hostId === socket.id ? 'host' : socket.id;
        }

        if (!sim || sim.paused || sim.gameOver) return;

        const defender = sim.defenders.get(defenderId);
        if (!defender) return;

        const rawAnswer = String(payload?.answer || '');
        const wantsExplosive = Boolean(payload?.explosive);

        const liveSorted = [...sim.zombies].sort((a, b) => a.x - b.x);
        if (liveSorted.length === 0) return;

        let target: ZombieEntityPublic | undefined = payload?.targetZombieId
          ? sim.zombies.find((z) => z.id === payload.targetZombieId)
          : undefined;
        if (!target) {
          target = liveSorted[0];
        }

        const isDirectBomb = wantsExplosive && !rawAnswer.trim();
        if (isDirectBomb && defender.explosiveAmmo <= 0) return;

        const isCorrect = isDirectBomb || isLogicAnswerMatch(rawAnswer, target.puzzle);

        if (!isCorrect) {
          defender.streak = 0;
          target.speed = Math.min(
            target.isBoss ? 4.8 : 3.9,
            Number((target.speed * (target.isBoss ? 1.28 : 1.42) + 0.35).toFixed(2)),
          );
          target.enraged = true;
          const swapped = pickReplacementPuzzle(
            target.puzzle,
            room.zombiePuzzles,
            room.zombieAutoFill,
          );
          target.puzzle = swapped;
          if (target.isBoss && target.bossPuzzles && target.bossStep !== undefined) {
            target.bossPuzzles[target.bossStep] = swapped;
          }

          const wrongEvent: ZombieWrongEvent = {
            teamId: sim.teamId,
            shooterId: defender.id,
            shooterName: defender.name,
            zombieId: target.id,
            newSpeed: target.speed,
            newPrompt: target.puzzle.prompt,
          };
          emitToZombieAudience(room, sim.teamId, 'zombie_wrong', wrongEvent);
          broadcastZombieState(room);
          return;
        }

        const useBomb = wantsExplosive && defender.explosiveAmmo > 0;
        if (useBomb) {
          defender.explosiveAmmo -= 1;
        }

        // Boss multi-question handling (5 questions)
        if (target.isBoss) {
          const totalSteps = target.bossTotalSteps || 5;
          const stepAdvance = useBomb ? 2 : 1;
          const nextStep = (target.bossStep ?? 0) + stepAdvance;
          const prevPrompt = target.puzzle.prompt;

          const extraKilled = useBomb
            ? sim.zombies.filter(
                (z) => !z.isBoss && Math.hypot(z.x - target!.x, z.z - target!.z) <= 7.5,
              )
            : [];
          const extraIds = extraKilled.map((v) => v.id);

          if (nextStep < totalSteps) {
            if (extraIds.length > 0) {
              const exSet = new Set(extraIds);
              sim.zombies = sim.zombies.filter((z) => !exSet.has(z.id));
            }
            target.bossStep = nextStep;
            target.puzzle =
              target.bossPuzzles?.[nextStep] ||
              pickReplacementPuzzle(target.puzzle, room.zombiePuzzles, room.zombieAutoFill);
            target.x = Math.min(13.8, target.x + 0.85);
            target.speed = Math.max(0.45, Number((target.speed - 0.14).toFixed(2)));

            const hitEarned = 180 + extraKilled.length * 140;
            defender.score += hitEarned;
            defender.kills += extraKilled.length;
            sim.teamScore += hitEarned;
            sim.kills += extraKilled.length;

            let streakBonusAmmo = false;
            if (!useBomb) {
              defender.streak += 1;
              defender.bestStreak = Math.max(defender.bestStreak, defender.streak);
              if (defender.streak > 0 && defender.streak % 5 === 0) {
                defender.explosiveAmmo += 1;
                streakBonusAmmo = true;
              }
            }
            sim.wave = 1 + Math.floor(sim.kills / 4);

            const shotEvent: ZombieShotEvent = {
              teamId: sim.teamId,
              shooterId: defender.id,
              shooterName: defender.name,
              shooterZ: defender.zPos,
              targetZombieId: target.id,
              targetX: target.x,
              targetZ: target.z,
              explosive: useBomb,
              killedIds: extraIds,
              pointsEarned: hitEarned,
              streakBonusAmmo,
              answerPrompt: prevPrompt,
              bossHitOnly: true,
              newBossStep: nextStep,
            };
            emitToZombieAudience(room, sim.teamId, 'zombie_shot', shotEvent);
            broadcastZombieState(room);
            return;
          }

          // Final Boss question solved -> Boss defeated!
          const allVictims = [target, ...extraKilled];
          const allIds = new Set(allVictims.map((v) => v.id));
          sim.zombies = sim.zombies.filter((z) => !allIds.has(z.id));

          const bossEarned = 1200 + extraKilled.length * 140;
          defender.score += bossEarned;
          defender.kills += allVictims.length;
          sim.teamScore += bossEarned;
          sim.kills += allVictims.length;
          defender.explosiveAmmo += 1;
          sim.wave = 1 + Math.floor(sim.kills / 4);

          const shotEvent: ZombieShotEvent = {
            teamId: sim.teamId,
            shooterId: defender.id,
            shooterName: defender.name,
            shooterZ: defender.zPos,
            targetZombieId: target.id,
            targetX: target.x,
            targetZ: target.z,
            explosive: useBomb,
            killedIds: Array.from(allIds),
            pointsEarned: bossEarned,
            streakBonusAmmo: true,
            answerPrompt: prevPrompt,
            bossDefeated: true,
          };
          emitToZombieAudience(room, sim.teamId, 'zombie_shot', shotEvent);
          broadcastZombieState(room);
          return;
        }

        const victims = useBomb
          ? sim.zombies.filter(
              (z) => !z.isBoss && Math.hypot(z.x - target!.x, z.z - target!.z) <= 7.5,
            )
          : [target];

        const victimIds = new Set(victims.map((v) => v.id));
        sim.zombies = sim.zombies.filter((z) => !victimIds.has(z.id));

        let totalEarned = 0;
        for (const v of victims) {
          const pts = v.puzzle.tier === 'easy' ? 100 : v.puzzle.tier === 'medium' ? 220 : 400;
          totalEarned += pts;
        }

        defender.score += totalEarned;
        defender.kills += victims.length;
        sim.teamScore += totalEarned;
        sim.kills += victims.length;

        let streakBonusAmmo = false;
        if (!useBomb) {
          defender.streak += 1;
          defender.bestStreak = Math.max(defender.bestStreak, defender.streak);
          if (defender.streak > 0 && defender.streak % 5 === 0) {
            defender.explosiveAmmo += 1;
            streakBonusAmmo = true;
          }
        }

        sim.wave = 1 + Math.floor(sim.kills / 4);

        const shotEvent: ZombieShotEvent = {
          teamId: sim.teamId,
          shooterId: defender.id,
          shooterName: defender.name,
          shooterZ: defender.zPos,
          targetZombieId: target.id,
          targetX: target.x,
          targetZ: target.z,
          explosive: useBomb,
          killedIds: Array.from(victimIds),
          pointsEarned: totalEarned,
          streakBonusAmmo,
          answerPrompt: target.puzzle.prompt,
        };

        emitToZombieAudience(room, sim.teamId, 'zombie_shot', shotEvent);
        broadcastZombieState(room);
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
      if (player.answeredCurrent) return;

      player.answeredCurrent = true;
      player.selectedOption = opt;
      player.answerTimestamp = Date.now();

      broadcastState(room);

      const totalPlayers = room.players.size;
      if (totalPlayers > 0) {
        const answeredCount = Array.from(room.players.values()).filter(
          (p) => p.answeredCurrent,
        ).length;
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
      cleanupSocket(socket.id, true);
    });

    socket.on('disconnect', () => {
      cleanupSocket(socket.id, false);
    });
  });

  function closeRoom(room: RoomState) {
    clearRoomTimer(room);
    if (room.hostGraceTimer) {
      clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = null;
    }
    io.to(room.pin).emit('room_closed', {
      message: 'ผู้สร้างห้อง (Host) ได้ปิดห้องเกมแล้ว',
    });
    for (const pId of room.players.keys()) {
      socketToRoom.delete(pId);
      const s = io.sockets.sockets.get(pId);
      s?.leave(room.pin);
    }
    rooms.delete(room.pin);
  }

  function cleanupSocket(socketId: string, explicitLeave: boolean) {
    const mapping = socketToRoom.get(socketId);
    if (!mapping) return;
    socketToRoom.delete(socketId);

    const room = rooms.get(mapping.pin);
    if (!room) return;

    if (mapping.role === 'host') {
      if (room.hostId !== socketId) return;
      if (explicitLeave) {
        closeRoom(room);
      } else {
        if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = setTimeout(() => {
          const current = rooms.get(mapping.pin);
          if (current && current.hostId === socketId) {
            closeRoom(current);
          }
        }, 5 * 60 * 1000);
      }
    } else {
      room.players.delete(socketId);
      let zombieUpdated = false;
      if (room.zombieSim) {
        room.zombieSim.defenders.delete(socketId);
        layoutDefenderZPositions(room.zombieSim);
        zombieUpdated = true;
      }
      for (const sim of room.zombieTeamSims.values()) {
        if (sim.defenders.delete(socketId)) {
          layoutDefenderZPositions(sim);
          zombieUpdated = true;
        }
      }
      if (zombieUpdated) {
        broadcastZombieState(room);
      }
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
    console.log(`เกมตอบปัญหาคณิตศาสตร์ server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
