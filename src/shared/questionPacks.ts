import type { QuestionPack, QuizQuestion } from './types.ts';

export const BUILTIN_QUESTION_PACKS: QuestionPack[] = [
  {
    id: 'maths-logic',
    title: 'Maths: ตรรกศาสตร์เบื้องต้น (8 ข้อ)',
    description: 'ประพจน์ ค่าความจริง ตัวเชื่อมประพจน์ (∧, ∨, ↔) และนิเสธ',
    questions: [
      {
        id: 'ml-1',
        prompt: '1. “จังหวัดบึงกาฬตั้งอยู่ทางภาคตะวันออกเฉียงเหนือของประเทศไทย”',
        options: ['เป็นประพจน์ จริง (T)', 'เป็นประพจน์ เท็จ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
        correctIndex: 0,
        timeLimitSec: 18,
      },
      {
        id: 'ml-2',
        prompt: '2. ดวงอาทิตย์ขึ้นทางทิศตะวันตก',
        options: ['เป็นประพจน์ จริง (T)', 'เป็นประพจน์ เท็จ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'ml-3',
        prompt: '3. จังหวัดขอนแก่นอยู่ในภาคใต้ของประเทศไทย',
        options: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'ml-4',
        prompt: '4. ถ้า 4 เป็นจำนวนคู่ แล้ว 4 หารด้วย 2 ลงตัว',
        options: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
        correctIndex: 0,
        timeLimitSec: 18,
      },
      {
        id: 'ml-5',
        prompt: '5. กรุณาปิดประตูด้วย',
        options: ['เป็นประพจน์ (T)', 'เป็นประพจน์ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก'],
        correctIndex: 2,
        timeLimitSec: 16,
      },
      {
        id: 'ml-6',
        prompt: '6. เต่ามีสี่ขาและลิงมีสองขา (เขียนเป็นสัญลักษณ์ตรรกศาสตร์)',
        options: ['p ∧ q', 'p ∨ q', 'p ก็ต่อเมื่อ q', 'ถูกทุกข้อ'],
        correctIndex: 0,
        timeLimitSec: 18,
      },
      {
        id: 'ml-7',
        prompt: '7. 2+3 > 7 และ 7+5 > 9 (เขียนเป็นสัญลักษณ์ตรรกศาสตร์)',
        options: ['p ∨ q', 'p ∧ q', 'p ถ้าแล้ว q', 'ไม่มีข้อใดถูก'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'ml-8',
        prompt: '8. นิเสธของ "3×4 ไม่น้อยกว่า 4×3" คืออะไร',
        options: ['3×4 มากกว่า 4×3', '3×4 น้อยกว่า 4×3', '3×4 ไม่มากกว่า 4×3', 'ถูกทุกข้อ'],
        correctIndex: 1,
        timeLimitSec: 20,
      },
    ],
  },
];

/**
 * Parse CSV rows with columns:
 * prompt, optionA, optionB, optionC, optionD, correctLetterOrIndex (A/B/C/D or 1-4), timeLimitSec
 */
export function parseQuestionsFromCsv(csvText: string): QuizQuestion[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: QuizQuestion[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 6) continue;

    // Skip header row if detected
    if (
      i === 0 &&
      (cols[0].toLowerCase().includes('question') ||
        cols[0].toLowerCase().includes('prompt') ||
        cols[0].includes('คำถาม'))
    ) {
      continue;
    }

    const prompt = cols[0].trim();
    const optA = cols[1].trim();
    const optB = cols[2].trim();
    const optC = cols[3].trim();
    const optD = cols[4].trim();
    if (!prompt || !optA || !optB || !optC || !optD) continue;

    const rawAns = cols[5].trim().toUpperCase();
    let correctIndex: 0 | 1 | 2 | 3 = 0;
    if (rawAns === 'B' || rawAns === '2') correctIndex = 1;
    else if (rawAns === 'C' || rawAns === '3') correctIndex = 2;
    else if (rawAns === 'D' || rawAns === '4') correctIndex = 3;

    const rawTime = Number(cols[6]);
    const timeLimitSec =
      Number.isFinite(rawTime) && rawTime >= 5 && rawTime <= 60 ? Math.round(rawTime) : 18;

    parsed.push({
      id: `csv-${Date.now()}-${i}`,
      prompt,
      options: [optA, optB, optC, optD],
      correctIndex,
      timeLimitSec,
    });
  }

  return parsed;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
