import { useState, type FormEvent } from 'react';
import { Play, Plus, QrCode, Users, Volume2, VolumeX } from 'lucide-react';
import { BLOOK_AVATARS, type BlookAvatarId } from '../shared/types.ts';
import { BUILTIN_QUESTION_PACKS } from '../shared/questionPacks.ts';

interface HomeOverlayProps {
  connected: boolean;
  initialPin: string;
  hasQrPin: boolean;
  joinError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onCreateRoom: (packId: string) => void;
  onJoinRoom: (pin: string, name: string, avatar: BlookAvatarId) => void;
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
}: HomeOverlayProps) {
  const [pin, setPin] = useState(initialPin);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<BlookAvatarId>('fox');
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
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6 overflow-y-auto custom-scroll">
      {/* Top Bar: Brand Lockup & Connection/Audio */}
      <header className="pointer-events-auto flex items-center justify-between gap-4 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <svg
            width="42"
            height="42"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
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
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-white leading-none">
              BlookLobby 3D
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              ลานประลองตอบคำถาม 3 มิติแบบเรียลไทม์
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700/80 text-slate-200 whitespace-nowrap"
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
      <main className="pointer-events-auto w-full max-w-4xl mx-auto my-auto py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
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
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                สร้างห้องเกมเพื่อรับรหัส PIN 6 หลัก และ QR Code ให้ผู้เล่นสแกนเข้าลานประลอง 3 มิติได้ทันที
                พร้อมตัวแก้ไขชุดคำถามและนำเข้าไฟล์ CSV
              </p>

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
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={!connected}
                onClick={() => onCreateRoom(selectedPackId)}
                className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                สร้างห้องใหม่ (Create Room)
              </button>
              <p className="text-xs text-slate-400 text-center">
                ลากเมาส์เพื่อหมุนดูเกาะลอยฟ้า 3 มิติได้ตลอดเวลา
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Single flat control-hint line */}
      <footer className="pointer-events-none text-center text-xs text-slate-300/90 max-w-3xl mx-auto">
        WASD / ลูกศร เดินในลานประลอง · Space กระโดด · คลิกแท่นคำตอบ A-D หรือกด 1-4 เพื่อตอบ · ลากเมาส์หมุนกล้อง
      </footer>
    </div>
  );
}
