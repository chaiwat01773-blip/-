import type { LogicPuzzle, ZombieTier } from './types.ts';
import { parseDelimitedRows } from './questionPacks.ts';

export type { LogicPuzzle, ZombieTier };

export function normalizeLogicInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/จริง/g, 'T')
    .replace(/TRUE/g, 'T')
    .replace(/เท็จ/g, 'F')
    .replace(/FALSE/g, 'F')
    .replace(/¬|!/g, '~')
    .replace(/&&|&|\^/g, '∧')
    .replace(/\|\||\|/g, '∨')
    .replace(/->|=>/g, '→')
    .replace(/<->|<=>/g, '↔')
    .replace(/\s+/g, '')
    .replace(/T\(T\)|\(T\)T/g, 'T')
    .replace(/F\(F\)|\(F\)F/g, 'F');
}

export function isLogicAnswerMatch(userInput: string, puzzle: LogicPuzzle): boolean {
  const trimmed = userInput.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (
    puzzle.displayAnswer.trim().toLowerCase() === lower ||
    puzzle.acceptedAnswers.some((ans) => ans.trim().toLowerCase() === lower)
  ) {
    return true;
  }

  const norm = normalizeLogicInput(trimmed);
  if (!norm) return false;
  if (normalizeLogicInput(puzzle.displayAnswer) === norm) return true;
  return puzzle.acceptedAnswers.some((ans) => normalizeLogicInput(ans) === norm);
}

/**
 * Formats a logic prompt into stacked lines for high readability:
 * e.g. "P = จริง", "Q = เท็จ", "P ∨ Q ≡ ?"
 */
export function formatLogicPromptLines(prompt: string): string[] {
  const clean = prompt.trim();
  if (!clean) return [];

  if (clean.includes('\n')) {
    return clean
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // Handle "P = True, Q = False → P ∧ Q = ?" style strings
  const arrowParts = clean.split(/\s*→\s*/);
  if (arrowParts.length === 2 && /[PQR]\s*=/.test(arrowParts[0])) {
    const vars = arrowParts[0]
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const expr = arrowParts[1].trim().replace(/\s*=\s*\?$/, ' ≡ ?');
    return [...vars, expr];
  }

  // Handle "กำหนดให้ประพจน์ (...) จงหาค่า..." or multi-part Thai prompts
  if (clean.length > 34 && clean.includes(' จง')) {
    const idx = clean.indexOf(' จง');
    return [clean.slice(0, idx).trim(), clean.slice(idx + 1).trim()];
  }

  return [clean];
}

function shuffleStrings(arr: string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const FALLBACK_DISTRACTORS = [
  '~P ∧ ~Q',
  '~P ∨ ~Q',
  'P ∧ ~Q',
  '~P ∨ Q',
  'P=T, Q=F, R=F',
  'P=T, Q=T, R=F',
  'P=F, Q=F, R=F',
  'จริง (T)',
  'เท็จ (F)',
];

export function ensurePuzzleChoices(
  puzzle: LogicPuzzle,
  extraPool: LogicPuzzle[] = [],
): LogicPuzzle {
  const authored = (puzzle.quickChoices || []).map((c) => String(c || '').trim()).filter(Boolean);
  const ans = puzzle.displayAnswer.trim();

  // Preserve explicitly authored multi-choice order (e.g. 4 Maths choices ending with "ไม่มีข้อใดถูก" / "ถูกทุกข้อ")
  if (authored.length >= 4 && authored.some((c) => isLogicAnswerMatch(c, puzzle))) {
    return {
      ...puzzle,
      acceptedAnswers: [...(puzzle.acceptedAnswers || [ans])],
      quickChoices: authored.slice(0, 4),
    };
  }

  const unique = new Set<string>();
  if (ans) unique.add(ans);
  for (const c of authored) unique.add(c);

  // Smart binary T/F completion
  const normAns = normalizeLogicInput(ans);
  if (unique.size < 2 && (normAns === 'T' || normAns === 'F')) {
    unique.clear();
    unique.add('จริง (T)');
    unique.add('เท็จ (F)');
  }

  // Numeric distractors if answer is numeric
  if (unique.size < 4 && /^-?\d+$/.test(ans)) {
    const n = Number(ans);
    for (const offset of [1, -1, 2, -2, 3, 4]) {
      if (unique.size >= 4) break;
      unique.add(String(n + offset));
    }
  }

  // Pull distractors from same pool
  for (const other of shuffleStrings(extraPool.map((p) => p.displayAnswer))) {
    if (unique.size >= 4) break;
    if (other && other !== ans) unique.add(other);
  }

  // Pull from fallback logic distractors
  if (unique.size < 4 && !(normAns === 'T' || normAns === 'F')) {
    for (const d of shuffleStrings(FALLBACK_DISTRACTORS)) {
      if (unique.size >= 4) break;
      unique.add(d);
    }
  }

  const finalChoices =
    normAns === 'T' || normAns === 'F'
      ? Array.from(unique).slice(0, 2)
      : shuffleStrings(Array.from(unique).slice(0, 4));

  return {
    ...puzzle,
    acceptedAnswers: [...(puzzle.acceptedAnswers || [ans])],
    quickChoices: finalChoices,
  };
}

let puzzleCounter = 0;

function generateEasyPuzzle(): LogicPuzzle {
  const p = Math.random() > 0.5;
  const q = Math.random() > 0.5;
  const pStr = p ? 'จริง (T)' : 'เท็จ (F)';
  const qStr = q ? 'จริง (T)' : 'เท็จ (F)';

  const ops: Array<{
    sym: string;
    fn: (a: boolean, b: boolean) => boolean;
    unary?: boolean;
  }> = [
    { sym: '∧', fn: (a, b) => a && b },
    { sym: '∨', fn: (a, b) => a || b },
    { sym: '→', fn: (a, b) => !a || b },
    { sym: '↔', fn: (a, b) => a === b },
    { sym: '~', fn: (a) => !a, unary: true },
  ];

  const chosen = ops[Math.floor(Math.random() * ops.length)];
  const result = chosen.fn(p, q);
  const ans = result ? 'จริง (T)' : 'เท็จ (F)';

  const prompt = chosen.unary
    ? `P = ${pStr}\n~P ≡ ?`
    : `P = ${pStr}\nQ = ${qStr}\nP ${chosen.sym} Q ≡ ?`;

  return {
    id: `easy-${++puzzleCounter}`,
    tier: 'easy',
    prompt,
    displayAnswer: ans,
    acceptedAnswers: result
      ? ['จริง (T)', 'T', 'True', 'จริง']
      : ['เท็จ (F)', 'F', 'False', 'เท็จ'],
    quickChoices: ['จริง (T)', 'เท็จ (F)'],
  };
}

export const MATHS_LOGIC_ZOMBIE_PUZZLES: LogicPuzzle[] = [
  {
    id: 'mlz-1',
    tier: 'easy',
    prompt: '“จังหวัดบึงกาฬตั้งอยู่ทางภาค\nตะวันออกเฉียงเหนือของประเทศไทย”',
    displayAnswer: 'เป็นประพจน์ จริง (T)',
    acceptedAnswers: ['เป็นประพจน์ จริง (T)', 'จริง (T)', 'T'],
    quickChoices: ['เป็นประพจน์ จริง (T)', 'เป็นประพจน์ เท็จ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-2',
    tier: 'easy',
    prompt: 'ประพจน์ต่อไปนี้มีค่าความจริงใด:\nดวงอาทิตย์ขึ้นทางทิศตะวันตก',
    displayAnswer: 'เป็นประพจน์ เท็จ (F)',
    acceptedAnswers: ['เป็นประพจน์ เท็จ (F)', 'เท็จ (F)', 'F'],
    quickChoices: ['เป็นประพจน์ จริง (T)', 'เป็นประพจน์ เท็จ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-3',
    tier: 'easy',
    prompt: 'ประพจน์ต่อไปนี้มีค่าความจริงใด:\nจังหวัดขอนแก่นอยู่ในภาคใต้ของไทย',
    displayAnswer: 'เป็นประพจน์ (F)',
    acceptedAnswers: ['เป็นประพจน์ (F)', 'เท็จ (F)', 'F'],
    quickChoices: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-4',
    tier: 'medium',
    prompt: 'ถ้า 4 เป็นจำนวนคู่\nแล้ว 4 หารด้วย 2 ลงตัว',
    displayAnswer: 'เป็นประพจน์ (T)',
    acceptedAnswers: ['เป็นประพจน์ (T)', 'จริง (T)', 'T'],
    quickChoices: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-5',
    tier: 'easy',
    prompt: 'ประโยคนี้เป็นประพจน์หรือไม่:\n“กรุณาปิดประตูด้วย”',
    displayAnswer: 'ไม่เป็นประพจน์',
    acceptedAnswers: ['ไม่เป็นประพจน์'],
    quickChoices: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-6',
    tier: 'medium',
    prompt: 'ข้อความเชิงสัญลักษณ์:\nเต่ามีสี่ขา และ ลิงมีสองขา',
    displayAnswer: 'p ∧ q',
    acceptedAnswers: ['p ∧ q', 'p^q', 'p∧q'],
    quickChoices: ['p ∧ q', 'p ∨ q', 'p ก็ต่อเมื่อ q', 'ถูกทุกข้อ'],
  },
  {
    id: 'mlz-7',
    tier: 'medium',
    prompt: 'ข้อความเชิงสัญลักษณ์:\n2+3 > 7 และ 7+5 > 9',
    displayAnswer: 'p ∧ q',
    acceptedAnswers: ['p ∧ q', 'p^q', 'p∧q'],
    quickChoices: ['p ∨ q', 'p ∧ q', 'p ถ้าแล้ว q', 'ไม่มีข้อใดถูก'],
  },
  {
    id: 'mlz-8',
    tier: 'hard',
    prompt: 'นิเสธของ\n“3×4 ไม่น้อยกว่า 4×3” คืออะไร?',
    displayAnswer: '3×4 น้อยกว่า 4×3',
    acceptedAnswers: ['3×4 น้อยกว่า 4×3', '3x4 น้อยกว่า 4x3'],
    quickChoices: ['3×4 มากกว่า 4×3', '3×4 น้อยกว่า 4×3', '3×4 ไม่มากกว่า 4×3', 'ถูกทุกข้อ'],
  },
];

const MEDIUM_BANK: Array<{
  prompt: string;
  displayAnswer: string;
  acceptedAnswers: string[];
  quickChoices: string[];
}> = [
  {
    prompt: 'นิเสธของประพจน์\nP ∨ Q คือข้อใด?',
    displayAnswer: '~P ∧ ~Q',
    acceptedAnswers: ['~P∧~Q', '~P^~Q', '!P&&!Q'],
    quickChoices: ['~P ∧ ~Q', '~P ∨ ~Q', 'P ∧ ~Q', '~P → Q'],
  },
  {
    prompt: 'นิเสธของประพจน์\nP ∧ Q คือข้อใด?',
    displayAnswer: '~P ∨ ~Q',
    acceptedAnswers: ['~P∨~Q', '~Pv~Q', '!P||!Q'],
    quickChoices: ['~P ∨ ~Q', '~P ∧ ~Q', 'P ∨ ~Q', 'P ∧ ~Q'],
  },
  {
    prompt: 'นิเสธของประพจน์\nP → Q คือข้อใด?',
    displayAnswer: 'P ∧ ~Q',
    acceptedAnswers: ['P∧~Q', 'P^~Q', 'P&&!Q'],
    quickChoices: ['P ∧ ~Q', '~P → ~Q', '~P ∨ Q', 'Q → P'],
  },
  {
    prompt: 'ประพจน์ที่สมมูลกับ\nP → Q คือข้อใด?',
    displayAnswer: '~P ∨ Q',
    acceptedAnswers: ['~P∨Q', '~PvQ', '!P||Q', '~Q→~P'],
    quickChoices: ['~P ∨ Q', 'P ∧ ~Q', '~P ∧ Q', 'P ∨ ~Q'],
  },
  {
    prompt: 'นิเสธของประพจน์\n~P ∧ Q คือข้อใด?',
    displayAnswer: 'P ∨ ~Q',
    acceptedAnswers: ['P∨~Q', 'Pv~Q', 'P||!Q'],
    quickChoices: ['P ∨ ~Q', 'P ∧ ~Q', '~P ∨ ~Q', 'P ∧ Q'],
  },
  {
    prompt: 'นิเสธของประพจน์\n~P → Q คือข้อใด?',
    displayAnswer: '~P ∧ ~Q',
    acceptedAnswers: ['~P∧~Q', '~P^~Q', '!P&&!Q'],
    quickChoices: ['~P ∧ ~Q', 'P ∨ Q', 'P ∧ ~Q', 'Q → ~P'],
  },
];

const HARD_BANK: Array<{
  prompt: string;
  displayAnswer: string;
  acceptedAnswers: string[];
  quickChoices: string[];
}> = [
  {
    prompt: '(P → Q) ∨ R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=T, Q=F, R=F',
    acceptedAnswers: ['P=T,Q=F,R=F', 'T,F,F', 'TFF'],
    quickChoices: ['P=T, Q=F, R=F', 'P=F, Q=T, R=F', 'P=T, Q=T, R=F', 'P=F, Q=F, R=T'],
  },
  {
    prompt: '(P ∧ Q) → R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=T, Q=T, R=F',
    acceptedAnswers: ['P=T,Q=T,R=F', 'T,T,F', 'TTF'],
    quickChoices: ['P=T, Q=T, R=F', 'P=T, Q=F, R=F', 'P=F, Q=T, R=T', 'P=F, Q=F, R=F'],
  },
  {
    prompt: '(P → ~Q) ∨ R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=T, Q=T, R=F',
    acceptedAnswers: ['P=T,Q=T,R=F', 'T,T,F', 'TTF'],
    quickChoices: ['P=T, Q=T, R=F', 'P=T, Q=F, R=F', 'P=F, Q=T, R=F', 'P=T, Q=T, R=T'],
  },
  {
    prompt: '(~P → Q) ∨ R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=F, Q=F, R=F',
    acceptedAnswers: ['P=F,Q=F,R=F', 'F,F,F', 'FFF'],
    quickChoices: ['P=F, Q=F, R=F', 'P=T, Q=F, R=F', 'P=F, Q=T, R=F', 'P=F, Q=F, R=T'],
  },
  {
    prompt: '(~P ∧ Q) → R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=F, Q=T, R=F',
    acceptedAnswers: ['P=F,Q=T,R=F', 'F,T,F', 'FTF'],
    quickChoices: ['P=F, Q=T, R=F', 'P=T, Q=T, R=F', 'P=F, Q=F, R=F', 'P=F, Q=T, R=T'],
  },
  {
    prompt: '(P ∧ ~Q) → ~R เป็นเท็จ\nค่าของ P, Q, R คือ?',
    displayAnswer: 'P=T, Q=F, R=T',
    acceptedAnswers: ['P=T,Q=F,R=T', 'T,F,T', 'TFT'],
    quickChoices: ['P=T, Q=F, R=T', 'P=T, Q=F, R=F', 'P=F, Q=F, R=T', 'P=T, Q=T, R=T'],
  },
];

export const DEFAULT_ZOMBIE_PUZZLES: LogicPuzzle[] = [
  ...MATHS_LOGIC_ZOMBIE_PUZZLES,
  {
    id: 'z-easy-1',
    tier: 'easy',
    prompt: 'P = จริง (T)\nQ = เท็จ (F)\nP ∧ Q ≡ ?',
    displayAnswer: 'เท็จ (F)',
    acceptedAnswers: ['เท็จ (F)', 'F', 'False', 'เท็จ'],
    quickChoices: ['จริง (T)', 'เท็จ (F)'],
  },
  {
    id: 'z-easy-2',
    tier: 'easy',
    prompt: 'P = จริง (T)\nQ = เท็จ (F)\nP ∨ Q ≡ ?',
    displayAnswer: 'จริง (T)',
    acceptedAnswers: ['จริง (T)', 'T', 'True', 'จริง'],
    quickChoices: ['จริง (T)', 'เท็จ (F)'],
  },
  {
    id: 'z-easy-3',
    tier: 'easy',
    prompt: 'P = จริง (T)\nQ = เท็จ (F)\nP → Q ≡ ?',
    displayAnswer: 'เท็จ (F)',
    acceptedAnswers: ['เท็จ (F)', 'F', 'False', 'เท็จ'],
    quickChoices: ['จริง (T)', 'เท็จ (F)'],
  },
  {
    id: 'z-easy-4',
    tier: 'easy',
    prompt: 'P = เท็จ (F)\nQ = เท็จ (F)\nP ↔ Q ≡ ?',
    displayAnswer: 'จริง (T)',
    acceptedAnswers: ['จริง (T)', 'T', 'True', 'จริง'],
    quickChoices: ['จริง (T)', 'เท็จ (F)'],
  },
  ...MEDIUM_BANK.slice(0, 4).map((item, idx) => ({
    id: `z-med-${idx + 1}`,
    tier: 'medium' as const,
    ...item,
  })),
  ...HARD_BANK.slice(0, 4).map((item, idx) => ({
    id: `z-hard-${idx + 1}`,
    tier: 'hard' as const,
    ...item,
  })),
];

export function generateLogicPuzzle(tier: ZombieTier): LogicPuzzle {
  if (tier === 'easy') {
    if (Math.random() < 0.35) {
      const easyMaths = MATHS_LOGIC_ZOMBIE_PUZZLES.filter((p) => p.tier === 'easy');
      const pick = easyMaths[Math.floor(Math.random() * easyMaths.length)];
      return ensurePuzzleChoices({ ...pick, id: `easy-${++puzzleCounter}` });
    }
    return generateEasyPuzzle();
  }
  if (tier === 'medium') {
    const medPool = [
      ...MEDIUM_BANK,
      ...MATHS_LOGIC_ZOMBIE_PUZZLES.filter((p) => p.tier === 'medium'),
    ];
    const item = medPool[Math.floor(Math.random() * medPool.length)];
    return ensurePuzzleChoices({
      id: `med-${++puzzleCounter}`,
      tier: 'medium',
      prompt: item.prompt,
      displayAnswer: item.displayAnswer,
      acceptedAnswers: [...item.acceptedAnswers],
      quickChoices: [...item.quickChoices],
    });
  }
  const hardPool = [
    ...HARD_BANK,
    ...MATHS_LOGIC_ZOMBIE_PUZZLES.filter((p) => p.tier === 'hard'),
  ];
  const item = hardPool[Math.floor(Math.random() * hardPool.length)];
  return ensurePuzzleChoices({
    id: `hard-${++puzzleCounter}`,
    tier: 'hard',
    prompt: item.prompt,
    displayAnswer: item.displayAnswer,
    acceptedAnswers: [...item.acceptedAnswers],
    quickChoices: [...item.quickChoices],
  });
}

/**
 * Generates 5 distinct logic/math questions for a Boss Zombie encounter.
 */
export function generateBossPuzzleSequence(
  customPool: LogicPuzzle[] = [],
  allowAutoFill = true,
): LogicPuzzle[] {
  const result: LogicPuzzle[] = [];
  const usedPrompts = new Set<string>();

  // If host disabled auto-fill and provided custom pool, pull from custom pool first
  if (!allowAutoFill && customPool.length > 0) {
    const shuffled = [...customPool].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 5; i++) {
      const p = shuffled[i % shuffled.length];
      result.push(
        ensurePuzzleChoices(
          {
            ...p,
            id: `boss-q-${++puzzleCounter}`,
            acceptedAnswers: [...p.acceptedAnswers],
            quickChoices: [...p.quickChoices],
          },
          customPool,
        ),
      );
    }
    return result;
  }

  const tiers: ZombieTier[] = ['easy', 'medium', 'medium', 'hard', 'hard'];
  for (let i = 0; i < tiers.length; i++) {
    let picked: LogicPuzzle | null = null;
    if (customPool.length > 0 && Math.random() < 0.55) {
      const candidates = customPool.filter((p) => !usedPrompts.has(p.prompt));
      if (candidates.length > 0) {
        const raw = candidates[Math.floor(Math.random() * candidates.length)];
        picked = ensurePuzzleChoices(
          {
            ...raw,
            id: `boss-q-${++puzzleCounter}`,
            acceptedAnswers: [...raw.acceptedAnswers],
            quickChoices: [...raw.quickChoices],
          },
          customPool,
        );
      }
    }
    if (!picked) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const cand = generateLogicPuzzle(tiers[i]);
        if (!usedPrompts.has(cand.prompt)) {
          picked = cand;
          break;
        }
      }
      if (!picked) {
        picked = generateLogicPuzzle(tiers[i]);
      }
    }
    usedPrompts.add(picked.prompt);
    result.push(picked);
  }
  return result;
}

/**
 * Picks a replacement puzzle (different prompt) when a player answers wrong on a zombie.
 */
export function pickReplacementPuzzle(
  current: LogicPuzzle,
  customPool: LogicPuzzle[] = [],
  allowAutoFill = true,
): LogicPuzzle {
  const sameTierCustom = customPool.filter(
    (p) => p.tier === current.tier && p.prompt !== current.prompt,
  );
  const anyOtherCustom = customPool.filter((p) => p.prompt !== current.prompt);

  if (sameTierCustom.length > 0 && (!allowAutoFill || Math.random() < 0.7)) {
    const picked = sameTierCustom[Math.floor(Math.random() * sameTierCustom.length)];
    return ensurePuzzleChoices(picked, customPool);
  }
  if (!allowAutoFill && anyOtherCustom.length > 0) {
    const picked = anyOtherCustom[Math.floor(Math.random() * anyOtherCustom.length)];
    return ensurePuzzleChoices({ ...picked, tier: current.tier }, customPool);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateLogicPuzzle(current.tier);
    if (candidate.prompt !== current.prompt) {
      return candidate;
    }
  }
  return generateLogicPuzzle(current.tier);
}

export const ZOMBIE_SPREADSHEET_TEMPLATE_HEADERS = [
  'ระดับ (easy/medium/hard)',
  'โจทย์บนหัวซอมบี้ (ขึ้นบรรทัดใหม่ได้)',
  'คำตอบที่ถูกต้อง',
  'คำตอบสำรองเพิ่มเติม (คั่นด้วย |)',
  'ตัวเลือกช้อย 2-4 ข้อ (คั่นด้วย |)',
];

const ZOMBIE_TEMPLATE_SAMPLE_ROWS: string[][] = [
  ['easy', 'P = จริง (T)\nQ = เท็จ (F)\nP ∧ Q ≡ ?', 'เท็จ (F)', 'F|False|เท็จ', 'จริง (T)|เท็จ (F)'],
  ['medium', 'นิเสธของ P ∨ Q คือข้อใด?', '~P ∧ ~Q', '~P^~Q|!P&&!Q', '~P ∧ ~Q|~P ∨ ~Q|P ∧ ~Q|~P → Q'],
  ['hard', '(P → Q) ∨ R เป็นเท็จ\nค่าของ P, Q, R คือ?', 'P=T, Q=F, R=F', 'P=T,Q=F,R=F|TFF', 'P=T, Q=F, R=F|P=F, Q=T, R=F|P=T, Q=T, R=F|P=F, Q=F, R=T'],
  ['easy', '', '', '', ''],
  ['medium', '', '', '', ''],
  ['hard', '', '', '', ''],
];

function escapeZombieCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const ZOMBIE_SPREADSHEET_TEMPLATE_CSV = [
  ZOMBIE_SPREADSHEET_TEMPLATE_HEADERS.map(escapeZombieCsvCell).join(','),
  ...ZOMBIE_TEMPLATE_SAMPLE_ROWS.map((r) => r.map(escapeZombieCsvCell).join(',')),
].join('\r\n');

export const ZOMBIE_SPREADSHEET_TEMPLATE_TSV = [
  ZOMBIE_SPREADSHEET_TEMPLATE_HEADERS.join('\t'),
  ...ZOMBIE_TEMPLATE_SAMPLE_ROWS.map((r) => r.map((c) => c.replace(/\t|\r?\n/g, ' | ')).join('\t')),
].join('\n');

export function parseZombiePuzzlesFromCsv(csvText: string): LogicPuzzle[] {
  const rows = parseDelimitedRows(csvText);
  const parsed: LogicPuzzle[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].map((c) => c.trim());
    if (cols.length < 2) continue;

    const firstLower = cols[0].toLowerCase();
    if (
      i === 0 &&
      (firstLower === 'tier' ||
        firstLower.startsWith('ระดับ') ||
        firstLower.startsWith('โจทย์') ||
        firstLower === 'prompt')
    ) {
      continue;
    }

    let tier: ZombieTier = 'medium';
    let prompt = '';
    let answer = '';
    let extraAliasesRaw = '';
    let quickChoicesRaw = '';

    if (
      ['easy', 'medium', 'hard', 'ง่าย', 'ปานกลาง', 'กลาง', 'ยาก'].includes(firstLower) &&
      cols.length >= 3
    ) {
      if (firstLower === 'easy' || firstLower === 'ง่าย') tier = 'easy';
      else if (firstLower === 'hard' || firstLower === 'ยาก') tier = 'hard';
      else tier = 'medium';

      prompt = cols[1];
      answer = cols[2];
      extraAliasesRaw = cols[3] || '';
      quickChoicesRaw = cols[4] || '';
    } else {
      prompt = cols[0];
      answer = cols[1];
      extraAliasesRaw = cols[2] || '';
      quickChoicesRaw = cols[3] || '';
    }

    if (!prompt || !answer) continue;

    const acceptedSet = new Set<string>([answer]);
    extraAliasesRaw
      .split(/[|;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => acceptedSet.add(s));

    const quickChoices = quickChoicesRaw
      .split(/[|;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!quickChoices.includes(answer)) {
      quickChoices.unshift(answer);
    }

    parsed.push({
      id: `z-csv-${Date.now()}-${i}`,
      tier,
      prompt: prompt.slice(0, 140),
      displayAnswer: answer.slice(0, 60),
      acceptedAnswers: Array.from(acceptedSet),
      quickChoices: quickChoices.slice(0, 4),
    });
  }

  return parsed;
}
