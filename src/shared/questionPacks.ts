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

export const QUIZ_SPREADSHEET_TEMPLATE_HEADERS = [
  'Question #',
  'Question Text',
  'Answer 1',
  'Answer 2',
  'Answer 3 (Optional)',
  'Answer 4 (Optional)',
  'Time Limit (sec) (Max: 300 Seconds)',
  'Correct Answer(s) (Only Include Answer #)',
];

const QUIZ_TEMPLATE_SAMPLE_ROWS: string[][] = [
  ['1', '2 + 2 เท่ากับเท่าใด?', '4', '3', '1', '5', '20', '1'],
  ['2', 'ดวงอาทิตย์ขึ้นทางทิศตะวันตก เป็นประพจน์หรือไม่?', 'เป็นประพจน์ จริง (T)', 'เป็นประพจน์ เท็จ (F)', 'ไม่เป็นประพจน์', 'ไม่มีข้อใดถูก', '20', '2'],
  ['3', '', '', '', '', '', '', ''],
  ['4', '', '', '', '', '', '', ''],
  ['5', '', '', '', '', '', '', ''],
  ['6', '', '', '', '', '', '', ''],
  ['7', '', '', '', '', '', '', ''],
  ['8', '', '', '', '', '', '', ''],
  ['9', '', '', '', '', '', '', ''],
  ['10', '', '', '', '', '', '', ''],
];

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const QUIZ_SPREADSHEET_TEMPLATE_CSV = [
  QUIZ_SPREADSHEET_TEMPLATE_HEADERS.map(escapeCsvCell).join(','),
  ...QUIZ_TEMPLATE_SAMPLE_ROWS.map((row) => row.map(escapeCsvCell).join(',')),
].join('\r\n');

export const QUIZ_SPREADSHEET_TEMPLATE_TSV = [
  QUIZ_SPREADSHEET_TEMPLATE_HEADERS.join('\t'),
  ...QUIZ_TEMPLATE_SAMPLE_ROWS.map((row) => row.map((c) => c.replace(/\t|\r?\n/g, ' ')).join('\t')),
].join('\n');

export function parseDelimitedRows(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  // Detect TSV vs CSV using first non-empty line outside quotes
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= 2 && tabCount >= commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(current);
      if (row.some((c) => c.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  row.push(current);
  if (row.some((c) => c.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseCorrectOptionIndex(raw: string): 0 | 1 | 2 | 3 {
  const firstToken = raw
    .trim()
    .split(/[\s,;|/]+/)
    .find(Boolean)
    ?.toUpperCase() || '';

  if (firstToken === 'B' || firstToken === '2' || firstToken === 'ข') return 1;
  if (firstToken === 'C' || firstToken === '3' || firstToken === 'ค') return 2;
  if (firstToken === 'D' || firstToken === '4' || firstToken === 'ง') return 3;
  return 0;
}

/**
 * Parse CSV/TSV rows in EITHER format:
 * 1) Classic 6-7 cols: prompt, optA, optB, optC, optD, answer(A-D/1-4), timeLimitSec
 * 2) 8-col Spreadsheet template: Question #, Question Text, Answer 1, Answer 2, Answer 3 (Optional), Answer 4 (Optional), Time Limit (sec), Correct Answer(s)
 */
export function parseQuestionsFromCsv(csvText: string): QuizQuestion[] {
  const rows = parseDelimitedRows(csvText);
  const parsed: QuizQuestion[] = [];
  let detectedTemplate8Col = false;

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].map((c) => c.trim());
    const col0Lower = (cols[0] || '').toLowerCase();
    const col1Lower = (cols[1] || '').toLowerCase();

    // Skip banner rows (e.g. "Blooket" or title row with empty answer columns)
    if (
      col0Lower === 'blooket' ||
      (cols.length >= 2 && cols[0] !== '' && cols.slice(1).every((c) => c === ''))
    ) {
      continue;
    }

    // Detect & skip header row
    if (
      col0Lower.includes('question #') ||
      col0Lower === 'ข้อที่' ||
      col1Lower.includes('question text') ||
      col1Lower.includes('คำถาม')
    ) {
      detectedTemplate8Col = true;
      continue;
    }

    if (
      i === 0 &&
      (col0Lower.includes('question') ||
        col0Lower.includes('prompt') ||
        col0Lower.includes('คำถาม'))
    ) {
      continue;
    }

    const looksIndexedRow =
      detectedTemplate8Col ||
      (cols.length >= 8 && (/^\d+\.?$/.test(cols[0]) || /^ข้อ\s*\d+$/i.test(cols[0])));

    let prompt = '';
    let optA = '';
    let optB = '';
    let optC = '';
    let optD = '';
    let rawAns = '';
    let rawTimeNum = 18;

    if (looksIndexedRow) {
      if (cols.length < 4) continue;
      prompt = cols[1] || '';
      optA = cols[2] || '';
      optB = cols[3] || '';
      optC = cols[4] || '-';
      optD = cols[5] || '-';
      rawTimeNum = Number(cols[6]);
      rawAns = cols[7] || '1';
    } else {
      if (cols.length < 6) continue;
      prompt = cols[0] || '';
      optA = cols[1] || '';
      optB = cols[2] || '';
      optC = cols[3] || '-';
      optD = cols[4] || '-';
      rawAns = cols[5] || 'A';
      rawTimeNum = Number(cols[6]);
    }

    if (!prompt || !optA || !optB) continue;

    const correctIndex = parseCorrectOptionIndex(rawAns);
    const timeLimitSec =
      Number.isFinite(rawTimeNum) && rawTimeNum >= 5 && rawTimeNum <= 300
        ? Math.min(60, Math.round(rawTimeNum))
        : 18;

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
