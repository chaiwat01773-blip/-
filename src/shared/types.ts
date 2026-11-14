export type BlookAvatarId =
  | 'fox'
  | 'panda'
  | 'frog'
  | 'lion'
  | 'unicorn'
  | 'octopus'
  | 'bee'
  | 'robot';

export interface BlookDefinition {
  id: BlookAvatarId;
  emoji: string;
  label: string;
  primaryColor: number;
  accentColor: number;
}

export const BLOOK_AVATARS: BlookDefinition[] = [
  { id: 'fox', emoji: '🦊', label: 'จิ้งจอกส้ม', primaryColor: 0xf97316, accentColor: 0xfff7ed },
  { id: 'panda', emoji: '🐼', label: 'แพนด้า', primaryColor: 0xf8fafc, accentColor: 0x1e293b },
  { id: 'frog', emoji: '🐸', label: 'กบน้อย', primaryColor: 0x22c55e, accentColor: 0xbef264 },
  { id: 'lion', emoji: '🦁', label: 'สิงโต', primaryColor: 0xeab308, accentColor: 0x9a3412 },
  { id: 'unicorn', emoji: '🦄', label: 'ยูนิคอร์น', primaryColor: 0xec4899, accentColor: 0x38bdf8 },
  { id: 'octopus', emoji: '🐙', label: 'หมึกยักษ์', primaryColor: 0x8b5cf6, accentColor: 0xf472b6 },
  { id: 'bee', emoji: '🐝', label: 'ผึ้งน้อย', primaryColor: 0xfacc15, accentColor: 0x1e293b },
  { id: 'robot', emoji: '🤖', label: 'หุ่นยนต์', primaryColor: 0x06b6d4, accentColor: 0x64748b },
];

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  timeLimitSec: number;
}

export interface QuestionPack {
  id: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
}

export interface PlayerPublicState {
  id: string;
  name: string;
  avatar: BlookAvatarId;
  score: number;
  streak: number;
  lastPointsEarned: number;
  answeredCurrent: boolean;
  selectedOption: number | null;
  x: number;
  z: number;
  rotY: number;
  vy: number;
}

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'podium';

export interface PublicQuestionPayload {
  index: number;
  total: number;
  id: string;
  prompt: string;
  options: [string, string, string, string];
  timeLimitSec: number;
  endsAt: number;
}

export interface RevealPayload {
  correctIndex: 0 | 1 | 2 | 3;
  optionCounts: [number, number, number, number];
  players: PlayerPublicState[];
}

export interface GameStateSnapshot {
  pin: string;
  phase: GamePhase;
  packTitle: string;
  questionCount: number;
  currentQuestionIndex: number;
  question: PublicQuestionPayload | null;
  correctIndex: number | null;
  optionCounts: [number, number, number, number];
  players: PlayerPublicState[];
}

export const ANSWER_PADS: Array<{
  index: 0 | 1 | 2 | 3;
  letter: 'A' | 'B' | 'C' | 'D';
  x: number;
  z: number;
  radius: number;
  hexColor: string;
  colorNum: number;
}> = [
  { index: 0, letter: 'A', x: -7.5, z: -6.5, radius: 3.1, hexColor: '#ef4444', colorNum: 0xef4444 },
  { index: 1, letter: 'B', x: 7.5, z: -6.5, radius: 3.1, hexColor: '#06b6d4', colorNum: 0x06b6d4 },
  { index: 2, letter: 'C', x: -7.5, z: 6.5, radius: 3.1, hexColor: '#f59e0b', colorNum: 0xf59e0b },
  { index: 3, letter: 'D', x: 7.5, z: 6.5, radius: 3.1, hexColor: '#22c55e', colorNum: 0x22c55e },
];
