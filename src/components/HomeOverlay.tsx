import { useState, type FormEvent } from 'react';
import { Crosshair, Play, Plus, QrCode, Users, Volume2, VolumeX } from 'lucide-react';
import { BLOOK_AVATARS, type BlookAvatarId, type GameMode } from '../shared/types.ts';
import { BUILTIN_QUESTION_PACKS } from '../shared/questionPacks.ts';

interface HomeOverlayProps {
  connected: boolean;
  initialPin: string;
  hasQrPin: boolean;
  joinError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onCreateRoom: (packId: string, mode: GameMode, hostAvatar: BlookAvatarId) => void;
  onJoinRoom: (pin: string, name: string, avatar: BlookAvatarId) => void;
  onStartZombieMode: (avatar: BlookAvatarId) => void;
}

export function HomeOverlay({
  connected,
  initialPin,
  hasQrPin,
  joinError,
  muted,
  onToggleMute,
  onCreateRoom,
  onJoinRoom,
  onStartZombieMode,
}: HomeOverlayProps) {
  const [pin, setPin] = useState(initialPin);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<BlookAvatarId>('fox');
  const [hostMode, setHostMode] = useState<GameMode>('quiz');
  const [selectedPackId, setSelectedPackId] = useState(BUILTIN_QUESTION_PACKS[0].id);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const cleanPin = pin.trim();
    const cleanName = name.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      setLocalError('กรุณากรอกรหัส Game PIN ตัวเลข 6 หลัก');
      return;
    }
    if (!cleanName) {
      setLocalError('กรุณาใส่ชื่อเล่นของคุณ');
      return;
    }
    onJoinRoom(cleanPin, cleanName, avatar);
  };

  const displayError = localError || joinError;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none overflow-y-auto custom-scroll ios-scroll-shell">
      <div className="min-h-full flex flex-col justify-between gap-3 p-3 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* Top Bar: Brand Lockup & Connection/Audio */}
      <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 max-w-5xl w-full mx-auto shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <svg
            width="38"
            height="38"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0 sm:w-[42px] sm:h-[42px]"
          >
            <rect x="4" y="8" width="40" height="34" rx="10" fill="#0e7490" />
            <rect x="4" y="4" width="40" height="34" rx="10" fill="#06b6d4" />
            <circle cx="17" cy="20" r="4" fill="#0f172a" />
            <circle cx="31" cy="20" r="4" fill="#0f172a" />
            <circle cx="18.2" cy="18.8" r="1.4" fill="#ffffff" />
            <circle cx="32.2" cy="18.8" r="1.4" fill="#ffffff" />
            <path
              d="M18 28C20.5 31 27.5 31 30 28"
              stroke="#0f172a"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-3xl font-black tracking-tight text-white leading-none">
              เกมตอบปัญหาคณิตศาสตร์
            </h1>
            <p className="text-[11px] sm:text-sm text-slate-300 mt-1">
              ลานประลองตอบปัญหาคณิตศาสตร์ 3 มิติ & โหมดซอมบี้ตรรกศาสตร์แบบเรียลไทม์
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border border-slate-700/80 text-slate-200 whitespace-nowrap"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.88)' }}
          >
            {connected ? 'เซิร์ฟเวอร์พร้อมใช้งาน' : 'กำลังเชื่อมต่อเซิร์ฟเวอร์...'}
          </span>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="p-2 rounded-lg border border-slate-700/80 text-slate-200 hover:text-white hover:border-cyan-400 transition-colors"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.88)' }}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Center Split Lobby Cards */}
      <main className="pointer-events-auto w-full max-w-4xl mx-auto my-auto py-2 sm:py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-stretch">
          {/* Player Join Card */}
          <section
            className="rounded-2xl border border-slate-700/80 p-6 flex flex-col justify-between shadow-2xl"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-cyan-400" />
                  เข้าร่วมเกม (Player)
                </h2>
                <span className="text-xs text-slate-400">สแกน QR หรือกรอก PIN</span>
              </div>

              {hasQrPin && (
                <div className="mb-3 px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-950/60 text-cyan-200 text-xs font-semibold flex items-center gap-2">
                  <QrCode className="w-4 h-4 shrink-0 text-cyan-400" />
                  <span>พบห้องเกม PIN {initialPin} จากลิงก์เชิญ กรุณาใส่ชื่อแล้วเข้าห้อง</span>
                </div>
              )}

              {displayError && (
                <div className="mb-3 px-3 py-2 rounded-lg border border-rose-500/50 bg-rose-950/70 text-rose-200 text-xs font-semibold">
                  {displayError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pin-input" className="block text-xs font-semibold text-slate-300 mb-1">
                      รหัส Game PIN (6 หลัก)
                    </label>
                    <input
                      id="pin-input"
                      type="tel"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="เช่น 123456"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-white font-mono-tabular text-base tracking-widest focus:outline-none focus:border-cyan-400"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="name-input" className="block text-xs font-semibold text-slate-300 mb-1">
                      ชื่อเล่นของคุณ
                    </label>
                    <input
                      id="name-input"
                      type="text"
                      maxLength={20}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ใส่ชื่อเล่น..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400"
                      required
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                    เลือกตัวละคร 3D Blook ({BLOOK_AVATARS.find((b) => b.id === avatar)?.label})
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {BLOOK_AVATARS.map((b) => {
                      const active = b.id === avatar;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setAvatar(b.id)}
                          title={b.label}
                          className={`h-11 rounded-xl border text-xl flex items-center justify-center transition-transform duration-150 ${
                            active
                              ? 'border-cyan-400 bg-cyan-500/20 scale-105'
                              : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                          }`}
                        >
                          <span>{b.emoji}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!connected}
                  className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  เข้าห้องเกม 3 มิติ
                </button>
              </form>
            </div>
          </section>

          {/* Host Create Room Card */}
          <section
            className="rounded-2xl border border-slate-700/80 p-6 flex flex-col justify-between shadow-2xl"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <div>
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-amber-400" />
                สำหรับผู้จัดกิจกรรม (Host)
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed mb-3.5">
                สร้างห้องเกมเพื่อรับรหัส PIN 6 หลัก และ QR Code ให้เพื่อนสแกนเข้าเล่นด้วยกันได้ทันที
                พร้อมตัวแก้ไขโจทย์และนำเข้าไฟล์ CSV
              </p>

              {/* Mode Selector inside Host Card */}
              <div className="mb-3.5">
                <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                  เลือกโหมดเกมที่จะเปิดห้อง
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHostMode('quiz')}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold transition-colors cursor-pointer ${
                      hostMode === 'quiz'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    ตอบคำถาม 3 มิติ
                  </button>
                  <button
                    type="button"
                    onClick={() => setHostMode('zombie')}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      hostMode === 'zombie'
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5 shrink-0" />
                    ซอมบี้ (Co-op)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHostMode('zombie_teams')}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      hostMode === 'zombie_teams'
                        ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    ซอมบี้ 4 ทีม
                  </button>
                </div>
              </div>

              {hostMode === 'quiz' ? (
                <div className="mb-4">
                  <label htmlFor="pack-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    เลือกชุดคำถามเริ่มต้น
                  </label>
                  <select
                    id="pack-select"
                    value={selectedPackId}
                    onChange={(e) => setSelectedPackId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                  >
                    {BUILTIN_QUESTION_PACKS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.questions.length} ข้อ)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {BUILTIN_QUESTION_PACKS.find((p) => p.id === selectedPackId)?.description}
                  </p>
                </div>
              ) : hostMode === 'zombie_teams' ? (
                <div className="mb-4 rounded-xl border border-cyan-500/35 bg-cyan-950/40 p-3 text-xs text-cyan-100 space-y-1">
                  <div className="font-bold text-cyan-300">
                    โหมดซอมบี้แบ่ง 4 ทีม (ทีม A / B / C / D)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    ผู้เล่นเลือกเข้าทีม A, B, C หรือ D ในห้องรอ หน้าจอผู้เล่นแบ่งบนเป็น 3D ล่างเป็นคำถาม A-D ส่วนผู้คุม (Host) เห็นทุกทีมพร้อมกัน 2–4 จอ และกดขยายตรวจดูรายทีมได้!
                  </p>
                </div>
              ) : (
                <div className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-950/40 p-3 text-xs text-emerald-100 space-y-1">
                  <div className="font-bold text-emerald-300">
                    โหมดซอมบี้ตรรกศาสตร์ Co-op (เล่นด้วยกัน & แก้โจทย์ได้)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    ผู้สร้างและเพื่อนจะยืนป้องกันฐานร่วมกัน! สามารถเพิ่ม/แก้ไขโจทย์ซอมบี้ (Easy / Medium / Hard) หรือนำเข้า CSV ได้ในหน้าห้องรอ
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={!connected}
                onClick={() => onCreateRoom(selectedPackId, hostMode, avatar)}
                className={`w-full py-3 px-4 rounded-xl font-bold text-slate-950 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  hostMode === 'zombie_teams'
                    ? 'bg-cyan-400 hover:bg-cyan-300'
                    : hostMode === 'zombie'
                      ? 'bg-emerald-400 hover:bg-emerald-300'
                      : 'bg-amber-400 hover:bg-amber-300'
                }`}
              >
                <Plus className="w-5 h-5" />
                {hostMode === 'zombie_teams'
                  ? 'สร้างห้องซอมบี้ 4 ทีม (Create Room)'
                  : hostMode === 'zombie'
                    ? 'สร้างห้องโหมดซอมบี้ (Create Room)'
                    : 'สร้างห้องใหม่ (Create Room)'}
              </button>
              {window.location.hostname.startsWith('ais-dev-') ? (
                <div className="rounded-xl border border-amber-400/40 bg-[#000000] p-2.5 text-center space-y-1.5">
                  <p className="text-[11px] text-amber-200 font-semibold">
                    ต้องการให้เพื่อนเข้าเล่นด้วย? เปิดหน้า Shared App เพื่อสร้างห้องบนเซิร์ฟเวอร์เดียวกับเพื่อน:
                  </p>
                  <a
                    href={`${window.location.protocol}//${window.location.hostname.replace(/^ais-dev-/, 'ais-pre-')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 text-xs font-bold transition-colors"
                  >
                    เปิดหน้า Shared App (สำหรับเล่นกับเพื่อน)
                  </a>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center">
                  ลากเมาส์เพื่อหมุนดูเกาะลอยฟ้า 3 มิติได้ตลอดเวลา
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Solo Logic Zombie Defense Quick-Play Banner */}
        <section
          className="mt-4 rounded-2xl border border-emerald-500/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="space-y-1 max-w-xl">
            <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-emerald-400" />
              โหมดซอมบี้ตรรกศาสตร์ (ซ้อมเล่นคนเดียว / Solo)
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              ซอมบี้โจทย์ตรรกศาสตร์ & Maths กำลังบุก! เลือกช้อยคำตอบที่ถูกเพื่อยิงปืน (ตอบผิดซอมบี้จะวิ่งเร็วขึ้นและเปลี่ยนโจทย์ใหม่ · เล่นถึง Wave 3 พบ Boss Zombie 5 คำถาม!)
            </p>
          </div>
          <button
            type="button"
            onClick={() => onStartZombieMode(avatar)}
            className="px-5 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-4 h-4" />
            เล่นคนเดียวทันที
          </button>
        </section>
      </main>

      {/* Single flat control-hint line */}
      <footer className="pointer-events-none text-center text-xs text-slate-300/90 max-w-3xl mx-auto shrink-0">
        WASD / ลูกศร เดินในลานประลอง · Space กระโดด · คลิกแท่นคำตอบ A-D หรือกด 1-4 เพื่อตอบ · ลากเมาส์หมุนกล้อง
      </footer>
      </div>
    </div>
  );
}
