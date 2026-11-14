import type { QuestionPack, QuizQuestion } from './types.ts';

export const BUILTIN_QUESTION_PACKS: QuestionPack[] = [
  {
    id: 'thai-general',
    title: 'ความรู้รอบตัว & วิทยาศาสตร์',
    description: 'คำถามสนุกๆ รอบโลก วิทยาศาสตร์ และวัฒนธรรมไทย (8 ข้อ)',
    questions: [
      {
        id: 'tg-1',
        prompt: 'ดาวเคราะห์ดวงใดในระบบสุริยะที่มีขนาดใหญ่ที่สุด?',
        options: ['ดาวเสาร์', 'ดาวพฤหัสบดี', 'ดาวยูเรนัส', 'ดาวโลก'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'tg-2',
        prompt: 'ก๊าซชนิดใดที่มีสัดส่วนมากที่สุดในชั้นบรรยากาศโลก?',
        options: ['ออกซิเจน', 'คาร์บอนไดออกไซด์', 'ไนโตรเจน', 'ฮีเลียม'],
        correctIndex: 2,
        timeLimitSec: 18,
      },
      {
        id: 'tg-3',
        prompt: 'จังหวัดใดของประเทศไทยที่มีพื้นที่ใหญ่ที่สุด?',
        options: ['เชียงใหม่', 'นครราชสีมา', 'กาญจนบุรี', 'ตาก'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'tg-4',
        prompt: 'อวัยวะใดในร่างกายมนุษย์ที่ทำหน้าที่สูบฉีดเลือดไปเลี้ยงส่วนต่างๆ?',
        options: ['ปอด', 'ตับ', 'หัวใจ', 'ไต'],
        correctIndex: 2,
        timeLimitSec: 15,
      },
      {
        id: 'tg-5',
        prompt: 'ธาตุทางเคมีที่มีสัญลักษณ์ "Au" คือโลหะชนิดใด?',
        options: ['เงิน', 'ทองคำ', 'ทองแดง', 'อะลูมิเนียม'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'tg-6',
        prompt: 'ความเร็วแสงในสุญญากาศมีค่าประมาณเท่าใด?',
        options: ['300,000 กม./วินาที', '150,000 กม./วินาที', '30,000 กม./วินาที', '1,000 กม./วินาที'],
        correctIndex: 0,
        timeLimitSec: 20,
      },
      {
        id: 'tg-7',
        prompt: 'สัตว์เลี้ยงลูกด้วยนมชนิดใดที่สามารถบินได้จริง?',
        options: ['กระรอกบิน', 'ค้างคาว', 'นกเพนกวิน', 'บ่าง'],
        correctIndex: 1,
        timeLimitSec: 16,
      },
      {
        id: 'tg-8',
        prompt: 'มหาสมุทรใดมีขนาดใหญ่และลึกที่สุดในโลก?',
        options: ['มหาสมุทรแอตแลนติก', 'มหาสมุทรอินเดีย', 'มหาสมุทรแปซิฟิก', 'มหาสมุทรอาร์กติก'],
        correctIndex: 2,
        timeLimitSec: 16,
      },
    ],
  },
  {
    id: 'tech-gaming',
    title: 'โลกดิจิทัล & เกม 3 มิติ',
    description: 'ทดสอบความรู้ด้านคอมพิวเตอร์ กราฟิก 3D และเทคโนโลยี (6 ข้อ)',
    questions: [
      {
        id: 'tech-1',
        prompt: 'ระบบพิกัดแกนใดใน Three.js ที่ชี้ขึ้นด้านบน (Up)?',
        options: ['แกน +X', 'แกน +Y', 'แกน +Z', 'แกน -Z'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'tech-2',
        prompt: 'โปรโตคอลใดใช้สำหรับการสื่อสารแบบ Real-time สองทิศทางบนเว็บ?',
        options: ['FTP', 'SMTP', 'WebSocket', 'POP3'],
        correctIndex: 2,
        timeLimitSec: 18,
      },
      {
        id: 'tech-3',
        prompt: 'หน่วยพื้นฐานของข้อมูลดิจิทัลที่เก็บค่าได้เพียง 0 หรือ 1 เรียกว่าอะไร?',
        options: ['Byte', 'Bit', 'Pixel', 'Voxel'],
        correctIndex: 1,
        timeLimitSec: 15,
      },
      {
        id: 'tech-4',
        prompt: 'HTML ย่อมาจากคำว่าอะไร?',
        options: [
          'HyperText Markup Language',
          'High Tech Machine Learning',
          'Hyperlink Transfer Mode',
          'Home Tool Markup Language',
        ],
        correctIndex: 0,
        timeLimitSec: 16,
      },
      {
        id: 'tech-5',
        prompt: 'แม่สีของแสงบนหน้าจอ (RGB) ประกอบด้วยสีอะไรบ้าง?',
        options: ['แดง เหลือง น้ำเงิน', 'แดง เขียว น้ำเงิน', 'ฟ้า ม่วง เหลือง', 'ส้ม เขียว ม่วง'],
        correctIndex: 1,
        timeLimitSec: 16,
      },
      {
        id: 'tech-6',
        prompt: 'พอร์ตมาตรฐานเริ่มต้นของโปรโตคอล HTTPS คือหมายเลขใด?',
        options: ['80', '3000', '443', '8080'],
        correctIndex: 2,
        timeLimitSec: 18,
      },
    ],
  },
  {
    id: 'world-trivia',
    title: 'World Geography & Logic',
    description: 'Fast-paced English trivia on geography, logic, and space (6 questions)',
    questions: [
      {
        id: 'wt-1',
        prompt: 'Which country has the longest coastline in the world?',
        options: ['Australia', 'Russia', 'Canada', 'Indonesia'],
        correctIndex: 2,
        timeLimitSec: 18,
      },
      {
        id: 'wt-2',
        prompt: 'What is the only planet in our solar system that rotates clockwise on its axis (alongside Uranus)?',
        options: ['Mercury', 'Venus', 'Mars', 'Neptune'],
        correctIndex: 1,
        timeLimitSec: 18,
      },
      {
        id: 'wt-3',
        prompt: 'If a triangle has angles of 90° and 35°, what is the third angle?',
        options: ['45°', '55°', '65°', '75°'],
        correctIndex: 1,
        timeLimitSec: 15,
      },
      {
        id: 'wt-4',
        prompt: 'Which city is known as the "City of Canals" in Italy?',
        options: ['Florence', 'Milan', 'Venice', 'Naples'],
        correctIndex: 2,
        timeLimitSec: 15,
      },
      {
        id: 'wt-5',
        prompt: 'What is the hardest naturally occurring mineral on Earth?',
        options: ['Quartz', 'Topaz', 'Corundum', 'Diamond'],
        correctIndex: 3,
        timeLimitSec: 15,
      },
      {
        id: 'wt-6',
        prompt: 'How many sides does a dodecagon have?',
        options: ['10', '12', '14', '20'],
        correctIndex: 1,
        timeLimitSec: 16,
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
