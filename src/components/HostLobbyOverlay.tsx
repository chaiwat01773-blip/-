import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Crosshair,
  FileSpreadsheet,
  Play,
  Plus,
  Trash2,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BLOOK_AVATARS,
  type BlookAvatarId,
  type GameMode,
  type GameStateSnapshot,
  type LogicPuzzle,
  type QuizQuestion,
  type ZombieTier,
} from '../shared/types.ts';
import { BUILTIN_QUESTION_PACKS, parseQuestionsFromCsv } from '../shared/questionPacks.ts';
import { DEFAULT_ZOMBIE_PUZZLES, parseZombiePuzzlesFromCsv } from '../shared/logicPuzzles.ts';

interface HostLobbyOverlayProps {
  snapshot: GameStateSnapshot;
  hostAvatar: BlookAvatarId;
  muted: boolean;
  onToggleMute: () => void;
  onChangeMode: (mode: GameMode) => void;
  onChangeHostAvatar: (avatar: BlookAvatarId) => void;
  onStartGame: () => void;
  onCloseRoom: () => void;
  onKickPlayer: (playerId: string) => void;
  onUpdatePack: (title: string, questions: QuizQuestion[]) => void;
  onUpdateZombiePuzzles: (title: string, puzzles: LogicPuzzle[], autoFill: boolean) => void;
}

function getSharedAppUrl(): string | null {
  const { hostname, protocol } = window.location;
  if (hostname.startsWith('ais-dev-')) {
    return `${protocol}//${hostname.replace(/^ais-dev-/, 'ais-pre-')}`;
  }
  return null;
}

export function HostLobbyOverlay({
  snapshot,
  hostAvatar,
  muted,
  onToggleMute,
  onChangeMode,
  onChangeHostAvatar,
  onStartGame,
  onCloseRoom,
  onKickPlayer,
  onUpdatePack,
  onUpdateZombiePuzzles,
}: HostLobbyOverlayProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOrigin, setShareOrigin] = useState<string>(() => window.location.origin);
  const [editingLink, setEditingLink] = useState(false);

  // Quiz editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(snapshot.packTitle);
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>(
    BUILTIN_QUESTION_PACKS[0].questions,
  );
  const [csvText, setCsvText] = useState('');
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  // Zombie puzzle editor state
  const [zombieEditorOpen, setZombieEditorOpen] = useState(false);
  const [zEditTitle, setZEditTitle] = useState(snapshot.zombiePackTitle);
  const [zEditPuzzles, setZEditPuzzles] = useState<LogicPuzzle[]>(
    snapshot.zombiePuzzles.length > 0 ? snapshot.zombiePuzzles : DEFAULT_ZOMBIE_PUZZLES,
  );
  const [zAutoFill, setZAutoFill] = useState(snapshot.zombieAutoFill);
  const [zCsvText, setZCsvText] = useState('');
  const [zCsvFeedback, setZCsvFeedback] = useState<string | null>(null);

  const sharedAppUrl = getSharedAppUrl();
  const cleanBase = shareOrigin.trim().replace(/\/$/, '') || window.location.origin;
  const joinUrl = `${cleanBase}/?pin=${snapshot.pin}`;

  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, joinUrl, {
      width: 148,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => {});
  }, [joinUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenEditor = () => {
    const matched = BUILTIN_QUESTION_PACKS.find((p) => p.title === snapshot.packTitle);
    if (matched) {
      setEditTitle(matched.title);
      setEditQuestions(
        matched.questions.map((q) => ({
          ...q,
          options: [...q.options] as [string, string, string, string],
        })),
      );
    } else {
      setEditTitle(snapshot.packTitle);
    }
    setCsvFeedback(null);
    setEditorOpen(true);
  };

  const handleOpenZombieEditor = () => {
    setZEditTitle(snapshot.zombiePackTitle);
    setZEditPuzzles(
      (snapshot.zombiePuzzles.length > 0 ? snapshot.zombiePuzzles : DEFAULT_ZOMBIE_PUZZLES).map(
        (p) => ({
          ...p,
          acceptedAnswers: [...p.acceptedAnswers],
          quickChoices: [...p.quickChoices],
        }),
      ),
    );
    setZAutoFill(snapshot.zombieAutoFill);
    setZCsvFeedback(null);
    setZombieEditorOpen(true);
  };

  const handleImportCsv = () => {
    const parsed = parseQuestionsFromCsv(csvText);
    if (parsed.length === 0) {
      setCsvFeedback('ไม่พบแถวคำถามที่ถูกต้อง (รูปแบบ: คำถาม,ตัวเลือกA,B,C,D,คำตอบA-D,วินาที)');
      return;
    }
    setEditQuestions(parsed);
    setCsvFeedback(`นำเข้าคำถามสำเร็จ ${parsed.length} ข้อ!`);
  };

  const handleSaveEditor = () => {
    const valid = editQuestions.filter(
      (q) => q.prompt.trim() && q.options.every((o) => o.trim().length > 0),
    );
    if (valid.length === 0) {
      setCsvFeedback('กรุณามีคำถามที่สมบูรณ์อย่างน้อย 1 ข้อ');
      return;
    }
    onUpdatePack(editTitle.trim() || 'ชุดคำถามกำหนดเอง', valid);
    setEditorOpen(false);
  };

  const handleImportZombieCsv = () => {
    const parsed = parseZombiePuzzlesFromCsv(zCsvText);
    if (parsed.length === 0) {
      setZCsvFeedback(
        'ไม่พบแถวโจทย์ที่ถูกต้อง (รูปแบบ: ระดับ easy/medium/hard, โจทย์, คำตอบ, คำตอบสำรองคั่นด้วย |)',
      );
      return;
    }
    setZEditPuzzles(parsed);
    setZCsvFeedback(`นำเข้าโจทย์ซอมบี้สำเร็จ ${parsed.length} ข้อ!`);
  };

  const handleSaveZombieEditor = () => {
    const valid = zEditPuzzles.filter(
      (p) => p.prompt.trim().length > 0 && p.displayAnswer.trim().length > 0,
    );
    if (valid.length === 0 && !zAutoFill) {
      setZCsvFeedback('กรุณามีโจทย์อย่างน้อย 1 ข้อ หรือเปิดเติมโจทย์สุ่มอัตโนมัติ');
      return;
    }
    onUpdateZombiePuzzles(zEditTitle.trim() || 'ชุดโจทย์ซอมบี้กำหนดเอง', valid, zAutoFill);
    setZombieEditorOpen(false);
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none overflow-y-auto custom-scroll ios-scroll-shell">
      <div className="min-h-full flex flex-col justify-between gap-3 sm:gap-4 p-3 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* Top Header Strip */}
      <header className="pointer-events-auto max-w-5xl w-full mx-auto flex flex-wrap items-start justify-between gap-3 sm:gap-4 shrink-0">
        <div
          className="rounded-2xl border border-slate-700/80 px-4 py-3 sm:px-5 sm:py-3.5 space-y-2.5 shadow-xl w-full md:w-auto max-w-2xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <div>
              <div className="text-xs font-semibold text-slate-400">รหัสเข้าห้อง (Game PIN)</div>
              <div className="font-mono-tabular text-2xl sm:text-4xl font-black text-amber-400 tracking-widest mt-0.5">
                {snapshot.pin}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'คัดลอกลิงก์ชวนเพื่อนแล้ว' : 'คัดลอกลิงก์ชวนเพื่อน'}
              </button>

              {snapshot.mode === 'zombie' ? (
                <button
                  type="button"
                  onClick={handleOpenZombieEditor}
                  className="px-3.5 py-2 rounded-xl border border-emerald-500/50 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  แก้ไขโจทย์ซอมบี้ ({snapshot.zombiePuzzleCount} ข้อ)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenEditor}
                  className="px-3.5 py-2 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  จัดการคำถาม ({snapshot.questionCount} ข้อ)
                </button>
              )}
            </div>
          </div>

          {/* Mode Toggle Row */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-400">โหมดเกมในห้องนี้:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeMode('quiz')}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold border transition-colors cursor-pointer ${
                  snapshot.mode === 'quiz'
                    ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                    : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                ตอบคำถาม 3 มิติ
              </button>
              <button
                type="button"
                onClick={() => onChangeMode('zombie')}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold border flex items-center gap-1 transition-colors cursor-pointer ${
                  snapshot.mode === 'zombie'
                    ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                ซอมบี้ตรรกศาสตร์ (Co-op)
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            {editingLink ? (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="url"
                  value={shareOrigin}
                  onChange={(e) => setShareOrigin(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setEditingLink(false)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-400 text-slate-950 font-bold cursor-pointer"
                >
                  ตกลง
                </button>
              </div>
            ) : (
              <>
                <span className="text-slate-300 truncate max-w-md font-mono text-[11px]">
                  ลิงก์ QR: {joinUrl}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingLink(true)}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer whitespace-nowrap"
                >
                  แก้โดเมนลิงก์
                </button>
              </>
            )}
            {sharedAppUrl && (
              <div className="w-full rounded-xl border border-amber-400/50 bg-amber-950/60 p-2.5 text-[11px] text-amber-100 space-y-1.5">
                <p className="font-semibold">
                  สำคัญ: ตอนนี้คุณเปิดอยู่ในโหมดแก้ไข (ais-dev) ซึ่งอยู่คนละเซิร์ฟเวอร์กับลิงก์แชร์ — หากสร้างห้องตรงนี้ เพื่อนจากลิงก์ Shared App จะขึ้นว่า "ไม่พบห้องเกม PIN"
                </p>
                <a
                  href={sharedAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold transition-colors"
                >
                  เปิดหน้า Shared App เพื่อสร้างห้องให้เพื่อนเล่นด้วยกัน
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full md:w-auto">
          <div
            className="rounded-2xl border border-slate-700/80 p-2 sm:p-2.5 flex flex-col items-center shadow-xl"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)' }}
          >
            <canvas
              ref={qrCanvasRef}
              width={148}
              height={148}
              className="rounded-lg w-24 h-24 sm:w-[148px] sm:h-[148px]"
            />
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 mt-1">
              สแกน QR เข้าห้อง
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="p-2.5 rounded-xl border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Bottom Dock: Live Player Roster + Host Avatar (in Zombie Mode) + Start / Close Actions */}
      <footer className="pointer-events-auto max-w-5xl w-full mx-auto shrink-0">
        <div
          className="rounded-2xl border border-slate-700/80 p-3.5 sm:p-5 shadow-2xl space-y-3"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
              <span>ผู้เล่นในห้อง ({snapshot.players.length} คน)</span>
              <span className="text-slate-500">·</span>
              <span className="text-xs font-medium text-slate-300">
                {snapshot.mode === 'zombie'
                  ? `ชุดโจทย์ซอมบี้: ${snapshot.zombiePackTitle} (${snapshot.zombiePuzzleCount} ข้อ)`
                  : `ชุดคำถาม: ${snapshot.packTitle}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onStartGame}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                {snapshot.mode === 'zombie' ? 'เริ่มเกมซอมบี้ Co-op!' : 'เริ่มเกมเลย!'}
              </button>
              <button
                type="button"
                onClick={onCloseRoom}
                className="px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                ปิดห้อง
              </button>
            </div>
          </div>

          {/* Host Defender Avatar Picker when in Zombie Mode */}
          {snapshot.mode === 'zombie' && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-950/35">
              <span className="text-xs font-bold text-emerald-200">
                ตัวละครของคุณ (ผู้สร้างห้องจะได้ร่วมยิงซอมบี้กับเพื่อนด้วย):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {BLOOK_AVATARS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onChangeHostAvatar(b.id)}
                    title={b.label}
                    className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center cursor-pointer transition-transform ${
                      hostAvatar === b.id
                        ? 'border-emerald-400 bg-emerald-500/25 scale-105'
                        : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                    }`}
                  >
                    {b.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {snapshot.players.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-xl">
              {snapshot.mode === 'zombie'
                ? 'รอเพื่อนเข้าร่วมห้อง (หรือกดเริ่มเกมซอมบี้ได้เลย เพื่อนสามารถสแกน QR เข้ามาร่วมยิงระหว่างเกมได้ด้วย!)'
                : 'กำลังรอผู้เล่นเข้าร่วมห้อง... (สามารถเปิดแท็บใหม่หรือสแกน QR Code เพื่อทดสอบเข้าห้องได้ทันที)'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-32 overflow-y-auto custom-scroll pr-1">
              {snapshot.players.map((p) => {
                const av = BLOOK_AVATARS.find((a) => a.id === p.avatar);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-700 bg-slate-950/70"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{av?.emoji || '🦊'}</span>
                      <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onKickPlayer(p.id)}
                      title="เชิญออกจากห้อง"
                      className="text-slate-400 hover:text-rose-400 p-0.5 shrink-0 cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </footer>

      {/* Quiz Question Pack & CSV Editor Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(2, 6, 23, 0.78)' }}
        >
          <div className="w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="font-display text-lg font-bold">จัดการชุดคำถาม & นำเข้า CSV</h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scroll space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    ชื่อชุดคำถาม
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    โหลดชุดคำถามสำเร็จรูป
                  </label>
                  <select
                    onChange={(e) => {
                      const found = BUILTIN_QUESTION_PACKS.find((p) => p.id === e.target.value);
                      if (found) {
                        setEditTitle(found.title);
                        setEditQuestions(
                          found.questions.map((q) => ({
                            ...q,
                            options: [...q.options] as [string, string, string, string],
                          })),
                        );
                      }
                    }}
                    defaultValue=""
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  >
                    <option value="" disabled>
                      -- เลือกชุดคำถาม --
                    </option>
                    {BUILTIN_QUESTION_PACKS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    นำเข้าคำถามจาก CSV (คำถาม,A,B,C,D,คำตอบ A-D,วินาที)
                  </span>
                  <button
                    type="button"
                    onClick={handleImportCsv}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    แปลงข้อมูล CSV
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={'ตัวอย่าง:\nเมืองหลวงของไทยคือข้อใด?,เชียงใหม่,กรุงเทพมหานคร,ภูเก็ต,ขอนแก่น,B,15'}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono"
                />
                {csvFeedback && <p className="text-xs text-cyan-300 font-semibold">{csvFeedback}</p>}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    รายการคำถาม ({editQuestions.length} ข้อ)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditQuestions((prev) => [
                        ...prev,
                        {
                          id: `q-${Date.now()}`,
                          prompt: '',
                          options: ['', '', '', ''],
                          correctIndex: 0,
                          timeLimitSec: 18,
                        },
                      ])
                    }
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มคำถาม
                  </button>
                </div>

                {editQuestions.map((q, qi) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 shrink-0">ข้อ {qi + 1}</span>
                      <input
                        type="text"
                        value={q.prompt}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditQuestions((prev) =>
                            prev.map((item, idx) => (idx === qi ? { ...item, prompt: val } : item)),
                          );
                        }}
                        placeholder="ใส่โจทย์คำถาม..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                      />
                      <select
                        value={q.correctIndex}
                        onChange={(e) => {
                          const val = Number(e.target.value) as 0 | 1 | 2 | 3;
                          setEditQuestions((prev) =>
                            prev.map((item, idx) =>
                              idx === qi ? { ...item, correctIndex: val } : item,
                            ),
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-300 font-bold"
                      >
                        <option value={0}>ถูก: A</option>
                        <option value={1}>ถูก: B</option>
                        <option value={2}>ถูก: C</option>
                        <option value={3}>ถูก: D</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setEditQuestions((prev) => prev.filter((_, idx) => idx !== qi))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['A', 'B', 'C', 'D'] as const).map((letter, oi) => (
                        <input
                          key={letter}
                          type="text"
                          value={q.options[oi]}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditQuestions((prev) =>
                              prev.map((item, idx) => {
                                if (idx !== qi) return item;
                                const nextOpts = [...item.options] as [
                                  string,
                                  string,
                                  string,
                                  string,
                                ];
                                nextOpts[oi] = val;
                                return { ...item, options: nextOpts };
                              }),
                            );
                          }}
                          placeholder={`ตัวเลือก ${letter}`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                บันทึกชุดคำถาม
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zombie Logic Puzzle Editor & CSV Modal */}
      {zombieEditorOpen && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(2, 6, 23, 0.8)' }}
        >
          <div className="w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-emerald-500/40 bg-slate-900 text-slate-100 flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-emerald-400" />
                จัดการโจทย์ซอมบี้ (แก้ไขโจทย์ / นำเข้า CSV)
              </h3>
              <button
                type="button"
                onClick={() => setZombieEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scroll space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    ชื่อชุดโจทย์ซอมบี้
                  </label>
                  <input
                    type="text"
                    value={zEditTitle}
                    onChange={(e) => setZEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={zAutoFill}
                      onChange={(e) => setZAutoFill(e.target.checked)}
                      className="rounded accent-emerald-400"
                    />
                    <span>ผสมโจทย์สุ่มอัตโนมัติ (Easy-Hard)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setZEditTitle('ตรรกศาสตร์พื้นฐาน (Easy - Hard)');
                      setZEditPuzzles(
                        DEFAULT_ZOMBIE_PUZZLES.map((p) => ({
                          ...p,
                          acceptedAnswers: [...p.acceptedAnswers],
                          quickChoices: [...p.quickChoices],
                        })),
                      );
                      setZCsvFeedback('โหลดโจทย์ตรรกศาสตร์มาตรฐานเรียบร้อยแล้ว');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    รีเซ็ตโจทย์มาตรฐาน
                  </button>
                </div>
              </div>

              {/* Zombie CSV Importer */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-400">
                    นำเข้า CSV (ระดับ easy/medium/hard, โจทย์บนหัวซอมบี้, คำตอบ, คำตอบสำรองคั่นด้วย |)
                  </span>
                  <button
                    type="button"
                    onClick={handleImportZombieCsv}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shrink-0"
                  >
                    แปลงข้อมูล CSV
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={zCsvText}
                  onChange={(e) => setZCsvText(e.target.value)}
                  placeholder={
                    'ตัวอย่าง:\neasy,P = True และ Q = False → P ∧ Q = ?,F,False|เท็จ,T|F\nmedium,นิเสธของ P ∨ Q คือ?,~P ∧ ~Q,~P^~Q,~P ∧ ~Q|~P ∨ ~Q'
                  }
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono"
                />
                {zCsvFeedback && <p className="text-xs text-cyan-300 font-semibold">{zCsvFeedback}</p>}
              </div>

              {/* Editable Zombie Puzzles List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    รายการโจทย์บนหัวซอมบี้ ({zEditPuzzles.length} ข้อ)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setZEditPuzzles((prev) => [
                        ...prev,
                        {
                          id: `z-custom-${Date.now()}`,
                          tier: 'easy',
                          prompt: '',
                          displayAnswer: '',
                          acceptedAnswers: [],
                          quickChoices: [],
                        },
                      ])
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มโจทย์ใหม่
                  </button>
                </div>

                {zEditPuzzles.map((p, pi) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2"
                  >
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 shrink-0">#{pi + 1}</span>
                      <select
                        value={p.tier}
                        onChange={(e) => {
                          const tier = e.target.value as ZombieTier;
                          setZEditPuzzles((prev) =>
                            prev.map((item, idx) => (idx === pi ? { ...item, tier } : item)),
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-300"
                      >
                        <option value="easy">ง่าย (Easy)</option>
                        <option value="medium">ปานกลาง (Medium)</option>
                        <option value="hard">ยาก (Hard)</option>
                      </select>
                      <textarea
                        rows={2}
                        value={p.prompt}
                        onChange={(e) => {
                          const prompt = e.target.value;
                          setZEditPuzzles((prev) =>
                            prev.map((item, idx) => (idx === pi ? { ...item, prompt } : item)),
                          );
                        }}
                        placeholder={'โจทย์บนหัวซอมบี้ (ขึ้นบรรทัดใหม่ได้ เช่น)\nP = จริง (T)\nQ = เท็จ (F)\nP ∧ Q ≡ ?'}
                        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white leading-snug"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setZEditPuzzles((prev) => prev.filter((_, idx) => idx !== pi))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          คำตอบที่ถูกต้อง
                        </label>
                        <input
                          type="text"
                          value={p.displayAnswer}
                          onChange={(e) => {
                            const ans = e.target.value;
                            setZEditPuzzles((prev) =>
                              prev.map((item, idx) =>
                                idx === pi
                                  ? {
                                      ...item,
                                      displayAnswer: ans,
                                      acceptedAnswers: [
                                        ans,
                                        ...item.acceptedAnswers.filter((a) => a !== item.displayAnswer),
                                      ].filter(Boolean),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          placeholder="เช่น F หรือ ~P ∧ ~Q"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-amber-300 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          คำตอบสำรองเพิ่มเติม (คั่นด้วย |)
                        </label>
                        <input
                          type="text"
                          value={p.acceptedAnswers.filter((a) => a !== p.displayAnswer).join(' | ')}
                          onChange={(e) => {
                            const extras = e.target.value
                              .split('|')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            setZEditPuzzles((prev) =>
                              prev.map((item, idx) =>
                                idx === pi
                                  ? {
                                      ...item,
                                      acceptedAnswers: [item.displayAnswer, ...extras].filter(Boolean),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          placeholder="เช่น False | เท็จ"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          ตัวเลือกช้อย 2-4 ข้อ (คั่นด้วย | ถ้าเว้นว่างระบบสุ่มตัวหลอกให้)
                        </label>
                        <input
                          type="text"
                          value={p.quickChoices.join(' | ')}
                          onChange={(e) => {
                            const choices = e.target.value
                              .split('|')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            setZEditPuzzles((prev) =>
                              prev.map((item, idx) =>
                                idx === pi ? { ...item, quickChoices: choices } : item,
                              ),
                            );
                          }}
                          placeholder="เช่น T | F หรือ ~P ∧ ~Q | ~P ∨ ~Q"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setZombieEditorOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveZombieEditor}
                className="px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                บันทึกโจทย์ซอมบี้
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
