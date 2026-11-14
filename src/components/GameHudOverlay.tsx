import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FastForward,
  Flame,
  Home,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ANSWER_PADS,
  BLOOK_AVATARS,
  type GameStateSnapshot,
} from '../shared/types.ts';
import type { CameraPreset } from '../three/ArenaScene.ts';
import { soundEngine } from '../audio/soundEngine.ts';

interface GameHudOverlayProps {
  snapshot: GameStateSnapshot;
  role: 'host' | 'player';
  playerId: string | null;
  muted: boolean;
  cameraPreset: CameraPreset;
  onChangeCamera: (preset: CameraPreset) => void;
  onToggleMute: () => void;
  onSubmitAnswer: (optionIndex: 0 | 1 | 2 | 3) => void;
  onRevealAnswer: () => void;
  onNextQuestion: () => void;
  onRestartLobby: () => void;
  onLeaveToHome: () => void;
}

export function GameHudOverlay({
  snapshot,
  role,
  playerId,
  muted,
  cameraPreset,
  onChangeCamera,
  onToggleMute,
  onSubmitAnswer,
  onRevealAnswer,
  onNextQuestion,
  onRestartLobby,
  onLeaveToHome,
}: GameHudOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const me = playerId ? snapshot.players.find((p) => p.id === playerId) : undefined;
  const q = snapshot.question;
  const answeredCount = snapshot.players.filter((p) => p.answeredCurrent).length;
  const sortedPlayers = [...snapshot.players].sort((a, b) => b.score - a.score);

  // Live countdown timer synced to server endsAt
  useEffect(() => {
    if (snapshot.phase !== 'question' || !q) {
      setSecondsLeft(0);
      return;
    }
    let lastBeep = -1;
    const update = () => {
      const rem = Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem > 0 && rem <= 5 && rem !== lastBeep) {
        lastBeep = rem;
        soundEngine.playTick(rem <= 3);
      }
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [snapshot.phase, q]);

  // Keyboard shortcuts: 1-4 for answers, H to toggle dock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
      if (role === 'player' && snapshot.phase === 'question' && !me?.answeredCurrent) {
        if (e.key === '1') onSubmitAnswer(0);
        else if (e.key === '2') onSubmitAnswer(1);
        else if (e.key === '3') onSubmitAnswer(2);
        else if (e.key === '4') onSubmitAnswer(3);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, snapshot.phase, me?.answeredCurrent, onSubmitAnswer]);

  const handleDownloadCsv = () => {
    const header = 'Rank,Name,Avatar,Score,Streak\n';
    const rows = sortedPlayers
      .map((p, idx) => `${idx + 1},"${p.name.replace(/"/g, '""')}",${p.avatar},${p.score},${p.streak}`)
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blooklobby-${snapshot.pin}-scores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (snapshot.phase === 'podium') {
    return (
      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
        <header className="pointer-events-auto max-w-4xl w-full mx-auto flex items-center justify-between gap-3">
          <div
            className="rounded-2xl border border-amber-400/50 px-5 py-3 flex items-center gap-3 shadow-xl"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-black text-white leading-tight">
                สรุปผลแชมป์ BlookLobby 3D
              </h2>
              <p className="text-xs text-slate-300">
                ห้อง PIN {snapshot.pin} · {snapshot.packTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลดผลคะแนน CSV
            </button>
            {role === 'host' && (
              <button
                type="button"
                onClick={onRestartLobby}
                className="px-3.5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                เล่นรอบใหม่
              </button>
            )}
            <button
              type="button"
              onClick={onLeaveToHome}
              className="px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900/95 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              หน้าแรก
            </button>
          </div>
        </header>

        <footer className="pointer-events-auto max-w-3xl w-full mx-auto">
          <div
            className="rounded-2xl border border-slate-700/80 p-4 shadow-2xl"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <div className="text-xs font-bold text-slate-300 mb-2.5">ตารางอันดับคะแนนทั้งหมด</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scroll">
              {sortedPlayers.map((p, idx) => {
                const av = BLOOK_AVATARS.find((a) => a.id === p.avatar);
                const rankLabel = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                      p.id === playerId
                        ? 'border-cyan-400 bg-cyan-950/70'
                        : 'border-slate-700/80 bg-slate-950/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold w-6 text-center shrink-0">{rankLabel}</span>
                      <span className="text-lg shrink-0">{av?.emoji || '🦊'}</span>
                      <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    </div>
                    <span className="font-mono-tabular text-xs font-black text-amber-300 shrink-0">
                      {p.score.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter HUD Bar */}
      <header className="pointer-events-auto max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Question Progress & Timer */}
        <div
          className="rounded-xl border border-slate-700/80 px-4 py-2 flex items-center gap-4 shadow-lg"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="text-xs font-bold text-slate-300 tabular-nums">
            ข้อ {(q?.index ?? 0) + 1} / {q?.total ?? snapshot.questionCount}
          </div>
          <span className="text-slate-600">|</span>
          <div
            className={`font-mono-tabular text-lg font-black ${
              secondsLeft <= 5 && snapshot.phase === 'question' ? 'text-rose-400' : 'text-cyan-400'
            }`}
          >
            {snapshot.phase === 'question' ? `${secondsLeft}s` : 'เฉลย'}
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-xs font-semibold text-slate-300 tabular-nums">
            ตอบแล้ว {answeredCount}/{snapshot.players.length}
          </div>
        </div>

        {/* Center/Right: Player Score or Host Controls & Camera Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {role === 'player' && me && (
            <div
              className="rounded-xl border border-slate-700/80 px-3.5 py-2 flex items-center gap-3 shadow-lg"
              style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
            >
              <span className="font-mono-tabular text-sm font-black text-amber-400">
                {me.score.toLocaleString()} คะแนน
              </span>
              {me.streak > 1 && (
                <span className="text-xs font-bold text-orange-400 flex items-center gap-0.5 tabular-nums">
                  <Flame className="w-3.5 h-3.5" />
                  x{me.streak}
                </span>
              )}
            </div>
          )}

          {/* Camera Preset Selector */}
          <div
            className="hidden sm:flex items-center p-1 rounded-xl border border-slate-700/80 gap-1"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            {(
              [
                { id: 'arena', label: 'มุมสูง' },
                { id: 'follow', label: 'ตามตัว' },
                { id: 'stage', label: 'เวที' },
              ] as const
            ).map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => onChangeCamera(cam.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  cameraPreset === cam.id
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          {role === 'host' && (
            <>
              {snapshot.phase === 'question' ? (
                <button
                  type="button"
                  onClick={onRevealAnswer}
                  className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Eye className="w-4 h-4" />
                  เฉลยทันที
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onNextQuestion}
                  className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <FastForward className="w-4 h-4" />
                  {(q?.index ?? 0) + 1 >= (q?.total ?? 0) ? 'สรุปอันดับแชมป์' : 'ข้อถัดไป'}
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="p-2 rounded-xl border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onLeaveToHome}
            title="ออกจากห้อง"
            className="px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-bold text-xs cursor-pointer"
          >
            ออก
          </button>
        </div>
      </header>

      {/* Bottom Collapsible Question & Answer Dock */}
      <footer className="pointer-events-auto max-w-4xl w-full mx-auto flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="px-3 py-1 rounded-t-xl border border-b-0 border-slate-700/80 text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {dockCollapsed ? 'แสดงแผงคำถาม (H)' : 'ซ่อนแผงคำถามเพื่อชม 3D (H)'}
        </button>

        {!dockCollapsed && q && (
          <div
            className="w-full rounded-2xl border border-slate-700/80 p-4 shadow-2xl space-y-3"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.94)' }}
          >
            {/* Question Prompt + Result Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base sm:text-xl font-bold text-white leading-snug">
                {q.prompt}
              </h2>

              {snapshot.phase === 'reveal' && role === 'player' && me && (
                <div
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold tabular-nums ${
                    me.lastPointsEarned > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {me.lastPointsEarned > 0
                    ? `ถูกต้อง! +${me.lastPointsEarned} คะแนน`
                    : me.answeredCurrent
                      ? 'ตอบผิดรอบนี้'
                      : 'หมดเวลา!'}
                </div>
              )}

              {snapshot.phase === 'question' && role === 'player' && me?.answeredCurrent && (
                <div className="px-3 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-xs font-bold">
                  ล็อกคำตอบแล้ว! รอเพื่อนคนอื่น...
                </div>
              )}
            </div>

            {/* 4 Answer Cards matching 3D Pad Colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ANSWER_PADS.map((pad) => {
                const isCorrect = snapshot.correctIndex === pad.index;
                const isSelected = me?.selectedOption === pad.index;
                const count = snapshot.optionCounts[pad.index] || 0;
                const dimmed = snapshot.phase === 'reveal' && !isCorrect;
                const canClick =
                  role === 'player' && snapshot.phase === 'question' && !me?.answeredCurrent;

                return (
                  <button
                    key={pad.letter}
                    type="button"
                    disabled={!canClick}
                    onClick={() => onSubmitAnswer(pad.index)}
                    className={`relative flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150 ${
                      canClick ? 'cursor-pointer hover:brightness-110 active:scale-[0.99]' : 'cursor-default'
                    } ${dimmed ? 'opacity-45' : 'opacity-100'} ${
                      isSelected ? 'ring-2 ring-white' : ''
                    } ${
                      snapshot.phase === 'reveal' && isCorrect
                        ? 'ring-2 ring-emerald-300 border-emerald-300'
                        : 'border-slate-700'
                    }`}
                    style={{
                      backgroundColor:
                        snapshot.phase === 'reveal' && isCorrect
                          ? 'rgba(16, 185, 129, 0.28)'
                          : 'rgba(30, 41, 59, 0.9)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg font-display font-black text-sm text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: pad.hexColor }}
                      >
                        {pad.letter}
                      </span>
                      <span className="text-sm font-bold text-white truncate">
                        {q.options[pad.index]}
                      </span>
                    </div>

                    {(snapshot.phase === 'reveal' || role === 'host') && (
                      <span className="font-mono-tabular text-xs font-bold text-slate-300 shrink-0">
                        {count} คน
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Compact Live Top-4 Leaderboard strip during reveal */}
            {snapshot.phase === 'reveal' && sortedPlayers.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300 border-t border-slate-800">
                <span className="font-bold text-amber-400">อันดับล่าสุด:</span>
                {sortedPlayers.slice(0, 4).map((p, idx) => {
                  const av = BLOOK_AVATARS.find((a) => a.id === p.avatar);
                  return (
                    <span key={p.id} className="font-semibold tabular-nums">
                      #{idx + 1} {av?.emoji} {p.name} ({p.score.toLocaleString()})
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
