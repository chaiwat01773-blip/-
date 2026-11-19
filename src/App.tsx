import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  type BlookAvatarId,
  type GameMode,
  type GameStateSnapshot,
  type LogicPuzzle,
  type QuizQuestion,
  type ZombieBreachEvent,
  type ZombieGameSnapshot,
  type ZombieShotEvent,
  type ZombieWrongEvent,
} from './shared/types.ts';
import { BUILTIN_QUESTION_PACKS } from './shared/questionPacks.ts';
import { soundEngine } from './audio/soundEngine.ts';
import type { ArenaScene, CameraPreset } from './three/ArenaScene.ts';
import { ThreeArenaCanvas } from './components/ThreeArenaCanvas.tsx';
import { HomeOverlay } from './components/HomeOverlay.tsx';
import { HostLobbyOverlay } from './components/HostLobbyOverlay.tsx';
import { PlayerLobbyOverlay } from './components/PlayerLobbyOverlay.tsx';
import { GameHudOverlay } from './components/GameHudOverlay.tsx';
import { ZombieGameView } from './components/ZombieGameView.tsx';

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<ArenaScene | null>(null);

  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<'host' | 'player' | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('arena');
  const [zombieAvatar, setZombieAvatar] = useState<BlookAvatarId | null>(null);
  const [hostAvatar, setHostAvatar] = useState<BlookAvatarId>('robot');
  const [mpZombieState, setMpZombieState] = useState<ZombieGameSnapshot | null>(null);
  const [mpZombieShot, setMpZombieShot] = useState<ZombieShotEvent | null>(null);
  const [mpZombieWrong, setMpZombieWrong] = useState<ZombieWrongEvent | null>(null);
  const [mpZombieBreach, setMpZombieBreach] = useState<ZombieBreachEvent | null>(null);

  const prevPhaseRef = useRef<string | null>(null);
  const prevPlayerCountRef = useRef<number>(0);

  const { initialPin, hasQrPin } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('pin') || '';
    const valid = /^\d{6}$/.test(p);
    return { initialPin: valid ? p : '', hasQrPin: valid };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3800);
  }, []);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      try {
        const saved = sessionStorage.getItem('blooklobby_host');
        if (saved) {
          const parsed = JSON.parse(saved) as { pin?: string; hostToken?: string };
          if (parsed.pin && parsed.hostToken) {
            socket.emit('reclaim_host', { pin: parsed.pin, hostToken: parsed.hostToken });
          }
        }
      } catch {
        // ignore storage errors
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on(
      'room_created',
      (payload: { pin: string; hostToken?: string; snapshot: GameStateSnapshot }) => {
        if (payload.hostToken) {
          try {
            sessionStorage.setItem(
              'blooklobby_host',
              JSON.stringify({ pin: payload.pin, hostToken: payload.hostToken }),
            );
          } catch {
            // ignore
          }
        }
        setRole('host');
        setPlayerId(null);
        setJoinError(null);
        setSnapshot(payload.snapshot);
        setMpZombieState(payload.snapshot.zombieState);
        setCameraPreset('arena');
        soundEngine.playJoin();
      },
    );

    socket.on('host_reclaim_failed', () => {
      try {
        sessionStorage.removeItem('blooklobby_host');
      } catch {
        // ignore
      }
    });

    socket.on(
      'join_success',
      (payload: { pin: string; playerId: string; snapshot: GameStateSnapshot }) => {
        window.history.replaceState({}, document.title, window.location.pathname);
        setRole('player');
        setPlayerId(payload.playerId);
        setJoinError(null);
        setSnapshot(payload.snapshot);
        setMpZombieState(payload.snapshot.zombieState);
        setCameraPreset('follow');
        soundEngine.playJoin();
      },
    );

    socket.on('join_error', (payload: { message: string }) => {
      setJoinError(payload.message);
      soundEngine.playWrong();
    });

    socket.on('game_state', (nextState: GameStateSnapshot) => {
      setSnapshot(nextState);
      if (nextState.phase === 'zombie') {
        setMpZombieState(nextState.zombieState);
      } else {
        setMpZombieState(null);
        setMpZombieShot(null);
        setMpZombieWrong(null);
        setMpZombieBreach(null);
      }
    });

    socket.on('zombie_state', (zSnap: ZombieGameSnapshot) => {
      setMpZombieState(zSnap);
    });

    socket.on('zombie_shot', (shot: ZombieShotEvent) => {
      setMpZombieShot(shot);
    });

    socket.on('zombie_wrong', (wrong: ZombieWrongEvent) => {
      setMpZombieWrong(wrong);
    });

    socket.on('zombie_breach', (breach: ZombieBreachEvent) => {
      setMpZombieBreach(breach);
    });

    socket.on(
      'player_moved',
      (payload: { id: string; x: number; z: number; rotY: number; vy: number }) => {
        sceneRef.current?.applyRemoteMove(payload);
      },
    );

    socket.on('room_closed', (payload: { message: string }) => {
      try {
        sessionStorage.removeItem('blooklobby_host');
      } catch {
        // ignore
      }
      setRole(null);
      setPlayerId(null);
      setSnapshot(null);
      setMpZombieState(null);
      showToast(payload.message);
    });

    socket.on('kicked', (payload: { message: string }) => {
      setRole(null);
      setPlayerId(null);
      setSnapshot(null);
      setMpZombieState(null);
      showToast(payload.message);
      soundEngine.playWrong();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [showToast]);

  // Sound cues on phase & player count changes
  useEffect(() => {
    if (!snapshot) {
      prevPhaseRef.current = null;
      prevPlayerCountRef.current = 0;
      return;
    }

    if (snapshot.phase === 'lobby' && snapshot.players.length > prevPlayerCountRef.current) {
      soundEngine.playJoin();
    }
    prevPlayerCountRef.current = snapshot.players.length;

    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = snapshot.phase;

    if (snapshot.phase === 'reveal' && prevPhase === 'question') {
      if (role === 'player' && playerId) {
        const me = snapshot.players.find((p) => p.id === playerId);
        if (me && me.lastPointsEarned > 0) {
          soundEngine.playCorrect();
        } else {
          soundEngine.playWrong();
        }
      } else {
        soundEngine.playCorrect();
      }
    } else if (snapshot.phase === 'podium' && prevPhase !== 'podium') {
      soundEngine.playPodiumFanfare();
    }
  }, [snapshot, role, playerId]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleCreateRoom = useCallback(
    (packId: string, mode: GameMode, chosenAvatar: BlookAvatarId) => {
      soundEngine.playClick();
      setHostAvatar(chosenAvatar);
      const pack = BUILTIN_QUESTION_PACKS.find((p) => p.id === packId) || BUILTIN_QUESTION_PACKS[0];
      socketRef.current?.emit('create_room', { pack, mode, hostAvatar: chosenAvatar });
    },
    [],
  );

  const handleJoinRoom = useCallback(
    (pin: string, name: string, avatar: BlookAvatarId) => {
      soundEngine.playClick();
      setJoinError(null);
      socketRef.current?.emit('join_room', { pin, name, avatar });
    },
    [],
  );

  const handleLeaveOrClose = useCallback(() => {
    soundEngine.playClick();
    try {
      sessionStorage.removeItem('blooklobby_host');
    } catch {
      // ignore
    }
    socketRef.current?.emit('leave_room');
    setRole(null);
    setPlayerId(null);
    setSnapshot(null);
    setMpZombieState(null);
    setCameraPreset('arena');
  }, []);

  const handleKickPlayer = useCallback(
    (targetId: string) => {
      if (!snapshot) return;
      soundEngine.playClick();
      socketRef.current?.emit('kick_player', { pin: snapshot.pin, playerId: targetId });
    },
    [snapshot],
  );

  const handleChangeMode = useCallback(
    (mode: GameMode) => {
      if (!snapshot) return;
      soundEngine.playClick();
      socketRef.current?.emit('set_game_mode', { pin: snapshot.pin, mode });
    },
    [snapshot],
  );

  const handleChangeHostAvatar = useCallback(
    (avatar: BlookAvatarId) => {
      soundEngine.playClick();
      setHostAvatar(avatar);
      if (!snapshot) return;
      socketRef.current?.emit('set_host_avatar', { pin: snapshot.pin, avatar });
    },
    [snapshot],
  );

  const handleUpdatePack = useCallback(
    (title: string, questions: QuizQuestion[]) => {
      if (!snapshot) return;
      soundEngine.playClick();
      socketRef.current?.emit('update_pack', { pin: snapshot.pin, title, questions });
      showToast('อัปเดตชุดคำถามเรียบร้อยแล้ว!');
    },
    [snapshot, showToast],
  );

  const handleUpdateZombiePuzzles = useCallback(
    (title: string, puzzles: LogicPuzzle[], autoFill: boolean) => {
      if (!snapshot) return;
      soundEngine.playClick();
      socketRef.current?.emit('update_zombie_puzzles', {
        pin: snapshot.pin,
        title,
        puzzles,
        autoFill,
      });
      showToast('อัปเดตโจทย์ซอมบี้เรียบร้อยแล้ว!');
    },
    [snapshot, showToast],
  );

  const handleStartGame = useCallback(() => {
    if (!snapshot) return;
    soundEngine.playClick();
    socketRef.current?.emit('start_game', { pin: snapshot.pin });
  }, [snapshot]);

  const handleLocalMove = useCallback((x: number, z: number, rotY: number, vy: number) => {
    socketRef.current?.emit('player_move', { x, z, rotY, vy });
  }, []);

  const handleSubmitAnswer = useCallback(
    (optionIndex: 0 | 1 | 2 | 3) => {
      if (role !== 'player' || snapshot?.phase !== 'question') return;
      const me = snapshot.players.find((p) => p.id === playerId);
      if (me?.answeredCurrent) return;
      soundEngine.playLockAnswer();
      sceneRef.current?.moveLocalPlayerToPad(optionIndex);
      socketRef.current?.emit('submit_answer', { optionIndex });
    },
    [role, snapshot, playerId],
  );

  const handleRevealAnswer = useCallback(() => {
    if (!snapshot) return;
    soundEngine.playClick();
    socketRef.current?.emit('reveal_answer', { pin: snapshot.pin });
  }, [snapshot]);

  const handleNextQuestion = useCallback(() => {
    if (!snapshot) return;
    soundEngine.playClick();
    socketRef.current?.emit('next_question', { pin: snapshot.pin });
  }, [snapshot]);

  const handleRestartLobby = useCallback(() => {
    if (!snapshot) return;
    soundEngine.playClick();
    socketRef.current?.emit('restart_lobby', { pin: snapshot.pin });
  }, [snapshot]);

  const handleMpZombieShoot = useCallback(
    (targetZombieId: string | null, answer: string, explosive: boolean) => {
      socketRef.current?.emit('zombie_shoot', { targetZombieId, answer, explosive });
    },
    [],
  );

  const handleMpZombiePause = useCallback(
    (paused: boolean) => {
      if (!snapshot) return;
      socketRef.current?.emit('zombie_pause', { pin: snapshot.pin, paused });
    },
    [snapshot],
  );

  const handleMpZombieRestart = useCallback(() => {
    if (!snapshot) return;
    soundEngine.playClick();
    socketRef.current?.emit('zombie_restart', { pin: snapshot.pin });
  }, [snapshot]);

  const inRoom = Boolean(snapshot && role);
  const inSoloZombie = !inRoom && zombieAvatar !== null;
  const inMpZombie = Boolean(inRoom && snapshot?.phase === 'zombie' && role);

  if (inMpZombie && snapshot && role) {
    const localDefenderId = role === 'host' ? 'host' : playerId || 'local';
    const me = snapshot.players.find((p) => p.id === playerId);
    const localAvatar: BlookAvatarId = role === 'host' ? hostAvatar : me?.avatar || 'fox';

    return (
      <ZombieGameView
        avatarId={localAvatar}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={handleLeaveOrClose}
        multiplayer={{
          pin: snapshot.pin,
          role,
          localDefenderId,
          zombieState: mpZombieState || snapshot.zombieState,
          lastShot: mpZombieShot,
          lastWrong: mpZombieWrong,
          lastBreach: mpZombieBreach,
          onShoot: handleMpZombieShoot,
          onPauseToggle: handleMpZombiePause,
          onRestart: handleMpZombieRestart,
          onBackToLobby: handleRestartLobby,
        }}
      />
    );
  }

  if (inSoloZombie && zombieAvatar) {
    return (
      <ZombieGameView
        avatarId={zombieAvatar}
        muted={muted}
        onToggleMute={handleToggleMute}
        onExit={() => setZombieAvatar(null)}
      />
    );
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden select-none">
      {/* Persistent Full-Bleed Three.js 3D Arena Canvas */}
      <ThreeArenaCanvas
        inRoom={inRoom}
        localPlayerId={playerId}
        phase={snapshot?.phase || 'lobby'}
        correctIndex={snapshot?.correctIndex ?? null}
        players={snapshot?.players || []}
        cameraPreset={cameraPreset}
        sceneRefOut={sceneRef}
        onLocalMove={handleLocalMove}
        onPadSelect={handleSubmitAnswer}
      />

      {/* Non-blocking Toast Banner */}
      {toastMsg && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl border border-amber-400/50 text-amber-100 text-xs sm:text-sm font-bold shadow-xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.96)' }}
        >
          {toastMsg}
        </div>
      )}

      {/* Game Shell State Views */}
      {!inRoom && (
        <HomeOverlay
          connected={connected}
          initialPin={initialPin}
          hasQrPin={hasQrPin}
          joinError={joinError}
          muted={muted}
          onToggleMute={handleToggleMute}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartZombieMode={(av) => {
            soundEngine.playClick();
            setZombieAvatar(av);
          }}
        />
      )}

      {inRoom && snapshot?.phase === 'lobby' && role === 'host' && (
        <HostLobbyOverlay
          snapshot={snapshot}
          hostAvatar={hostAvatar}
          muted={muted}
          onToggleMute={handleToggleMute}
          onChangeMode={handleChangeMode}
          onChangeHostAvatar={handleChangeHostAvatar}
          onStartGame={handleStartGame}
          onCloseRoom={handleLeaveOrClose}
          onKickPlayer={handleKickPlayer}
          onUpdatePack={handleUpdatePack}
          onUpdateZombiePuzzles={handleUpdateZombiePuzzles}
        />
      )}

      {inRoom && snapshot?.phase === 'lobby' && role === 'player' && playerId && (
        <PlayerLobbyOverlay
          snapshot={snapshot}
          playerId={playerId}
          muted={muted}
          onToggleMute={handleToggleMute}
          onLeaveRoom={handleLeaveOrClose}
        />
      )}

      {inRoom && snapshot && snapshot.phase !== 'lobby' && role && (
        <GameHudOverlay
          snapshot={snapshot}
          role={role}
          playerId={playerId}
          muted={muted}
          cameraPreset={cameraPreset}
          onChangeCamera={setCameraPreset}
          onToggleMute={handleToggleMute}
          onSubmitAnswer={handleSubmitAnswer}
          onRevealAnswer={handleRevealAnswer}
          onNextQuestion={handleNextQuestion}
          onRestartLobby={handleRestartLobby}
          onLeaveToHome={handleLeaveOrClose}
        />
      )}
    </div>
  );
}
