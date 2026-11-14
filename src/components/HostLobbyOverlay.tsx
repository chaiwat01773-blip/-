import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  FileSpreadsheet,
  Play,
  Plus,
  Trash2,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BLOOK_AVATARS, type GameStateSnapshot, type QuizQuestion } from '../shared/types.ts';
import { BUILTIN_QUESTION_PACKS, parseQuestionsFromCsv } from '../shared/questionPacks.ts';

interface HostLobbyOverlayProps {
  snapshot: GameStateSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onStartGame: () => void;
  onCloseRoom: () => void;
  onKickPlayer: (playerId: string) => void;
  onUpdatePack: (title: string, questions: QuizQuestion[]) => void;
}

export function HostLobbyOverlay({
  snapshot,
  muted,
  onToggleMute,
  onStartGame,
  onCloseRoom,
  onKickPlayer,
  onUpdatePack,
}: HostLobbyOverlayProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(snapshot.packTitle);
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>(
    BUILTIN_QUESTION_PACKS[0].questions,
  );
  const [csvText, setCsvText] = useState('');
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  const joinUrl = `${window.location.origin}/?pin=${snapshot.pin}`;

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
      setEditQuestions(matched.questions.map((q) => ({ ...q, options: [...q.options] as [string, string, string, string] })));
    } else {
      setEditTitle(snapshot.packTitle);
    }
    setCsvFeedback(null);
    setEditorOpen(true);
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

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
      {/* Top Header Strip */}
      <header className="pointer-events-auto max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-4">
        <div
          className="rounded-2xl border border-slate-700/80 px-5 py-3.5 flex flex-wrap items-center gap-6 shadow-xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div>
            <div className="text-xs font-semibold text-slate-400">รหัสเข้าห้อง (Game PIN)</div>
            <div className="font-mono-tabular text-3xl sm:text-4xl font-black text-amber-400 tracking-widest mt-0.5">
              {snapshot.pin}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์เชิญ'}
            </button>
            <button
              type="button"
              onClick={handleOpenEditor}
              className="px-3.5 py-2 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              จัดการคำถาม ({snapshot.questionCount} ข้อ)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="rounded-2xl border border-slate-700/80 p-2.5 flex flex-col items-center shadow-xl"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)' }}
          >
            <canvas ref={qrCanvasRef} width={148} height={148} className="rounded-lg" />
            <span className="text-[11px] font-bold text-slate-800 mt-1">สแกน QR เข้าห้อง</span>
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

      {/* Bottom Dock: Live Player Roster + Start / Close Actions */}
      <footer className="pointer-events-auto max-w-5xl w-full mx-auto">
        <div
          className="rounded-2xl border border-slate-700/80 p-4 sm:p-5 shadow-2xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>ผู้เล่นในห้อง ({snapshot.players.length} คน)</span>
              <span className="text-slate-500">·</span>
              <span className="text-xs font-medium text-slate-300">
                ชุดคำถาม: {snapshot.packTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onStartGame}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                เริ่มเกมเลย!
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

          {snapshot.players.length === 0 ? (
            <div className="py-5 text-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-xl">
              กำลังรอผู้เล่นเข้าร่วมห้อง... (สามารถเปิดแท็บใหม่หรือสแกน QR Code เพื่อทดสอบเข้าห้องได้ทันที)
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-36 overflow-y-auto custom-scroll pr-1">
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

      {/* Question Pack & CSV Editor Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(2, 6, 23, 0.78)' }}
        >
          <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 flex flex-col shadow-2xl overflow-hidden">
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
              {/* Quick Preset Switcher */}
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

              {/* CSV Importer */}
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

              {/* Questions List */}
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
    </div>
  );
}
