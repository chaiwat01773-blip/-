import { LogOut, Volume2, VolumeX } from 'lucide-react';
import { BLOOK_AVATARS, type GameStateSnapshot } from '../shared/types.ts';

interface PlayerLobbyOverlayProps {
  snapshot: GameStateSnapshot;
  playerId: string;
  muted: boolean;
  onToggleMute: () => void;
  onLeaveRoom: () => void;
}

export function PlayerLobbyOverlay({
  snapshot,
  playerId,
  muted,
  onToggleMute,
  onLeaveRoom,
}: PlayerLobbyOverlayProps) {
  const me = snapshot.players.find((p) => p.id === playerId);
  const myAvatar = BLOOK_AVATARS.find((a) => a.id === me?.avatar);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between gap-3 p-3 sm:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Top Status Cluster */}
      <header className="pointer-events-auto max-w-4xl w-full mx-auto flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div
          className="rounded-2xl border border-slate-700/80 px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2.5 sm:gap-3 shadow-xl min-w-0 flex-1 sm:flex-initial"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <span className="text-xl sm:text-2xl shrink-0">{myAvatar?.emoji || '🦊'}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white leading-tight truncate">{me?.name || 'Player'}</div>
            <div className="text-[11px] sm:text-xs text-slate-400 font-mono-tabular truncate">
              ห้อง PIN {snapshot.pin} ·{' '}
              {snapshot.mode === 'zombie'
                ? `โหมดซอมบี้ตรรกศาสตร์ (${snapshot.zombiePackTitle})`
                : snapshot.packTitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="p-2 sm:p-2.5 rounded-xl border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border border-rose-500/40 bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            ออกจากห้อง
          </button>
        </div>
      </header>

      {/* Bottom Waiting Strip — leaves center 3D island open to run & jump around! */}
      <footer className="pointer-events-auto max-w-4xl w-full mx-auto shrink-0">
        <div
          className="rounded-2xl border border-slate-700/80 p-3 sm:p-4 shadow-2xl max-h-[45dvh] overflow-y-auto touch-pan-y custom-scroll"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2">
            <div className="text-xs sm:text-sm font-bold text-cyan-300">
              {snapshot.mode === 'zombie'
                ? 'เข้าร่วมห้องโหมดซอมบี้สำเร็จ! รอผู้สร้างห้อง (Host) กดเริ่มเกมช่วยกันยิงซอมบี้...'
                : 'เข้าร่วมห้องสำเร็จ! กำลังรอผู้จัดกิจกรรม (Host) กดเริ่มเกม...'}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-300 font-semibold">
              เพื่อนร่วมห้อง ({snapshot.players.length} คน) · แตะพื้นที่บนเกาะเพื่อกระโดดเล่นรอได้เลย
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-24 overflow-y-auto custom-scroll">
            {snapshot.players.map((p) => {
              const av = BLOOK_AVATARS.find((a) => a.id === p.avatar);
              const isMe = p.id === playerId;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold ${
                    isMe
                      ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200'
                      : 'border-slate-700 bg-slate-950/70 text-slate-200'
                  }`}
                >
                  <span>{av?.emoji || '🦊'}</span>
                  <span>{p.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}
