/**
 * tournaments.js
 * ระบบจัดการแข่งขัน (เกมออนไลน์/กีฬา) — เปิดรับสมัคร, จับสู่อัตโนมัติ (single elimination),
 * บันทึกผล, ตั้งตารางแข่ง/แจ้งเตือน
 *
 * เก็บข้อมูลเป็นไฟล์ JSON ง่ายๆ (ไม่ใช้ฐานข้อมูล) อยู่รอดผ่านการรีสตาร์ทบอท
 * เก็บทัวร์นาเมนต์เป็น object คีย์ด้วยชื่อทัวร์นาเมนต์ (ต้องไม่ซ้ำกัน)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'tournaments.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function createTournament({ name, type, teamSize, channelId, createdBy }) {
  const data = load();
  if (data[name]) {
    throw new Error(`มีทัวร์นาเมนต์ชื่อ "${name}" อยู่แล้ว ใช้ชื่ออื่น`);
  }
  data[name] = {
    name,
    type, // 'team' | 'individual'
    teamSize: teamSize || null,
    channelId,
    status: 'registration', // registration | bracket | completed
    registrationMessageId: null,
    bracketMessageId: null,
    participants: [], // { name, members: string[] }
    rounds: [],
    createdBy,
    createdAt: new Date().toISOString(),
  };
  save(data);
  return data[name];
}

function getTournament(name) {
  const data = load();
  return data[name] || null;
}

function listTournaments() {
  return Object.values(load());
}

function updateTournament(name, mutateFn) {
  const data = load();
  const t = data[name];
  if (!t) throw new Error(`ไม่พบทัวร์นาเมนต์ชื่อ "${name}"`);
  mutateFn(t);
  save(data);
  return t;
}

function setRegistrationMessage(name, messageId) {
  return updateTournament(name, (t) => {
    t.registrationMessageId = messageId;
  });
}

function setBracketMessage(name, messageId) {
  return updateTournament(name, (t) => {
    t.bracketMessageId = messageId;
  });
}

function registerParticipant(name, entryName, members) {
  return updateTournament(name, (t) => {
    if (t.status !== 'registration') {
      throw new Error('ทัวร์นาเมนต์นี้ปิดรับสมัครแล้ว');
    }
    if (t.participants.some((p) => p.name === entryName)) {
      throw new Error(`มีชื่อ "${entryName}" สมัครไว้แล้ว`);
    }
    t.participants.push({ name: entryName, members: members || [] });
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function advanceWinner(rounds, roundIdx, matchIdx, winnerName) {
  rounds[roundIdx][matchIdx].winner = winnerName;
  const nextRoundIdx = roundIdx + 1;
  if (nextRoundIdx >= rounds.length) return;
  const nextMatchIdx = Math.floor(matchIdx / 2);
  const slot = matchIdx % 2 === 0 ? 'p1' : 'p2';
  rounds[nextRoundIdx][nextMatchIdx][slot] = winnerName;
}

function buildBracketRounds(participantNames) {
  const names = shuffle(participantNames);
  let size = 1;
  while (size < names.length) size *= 2;
  while (names.length < size) names.push(null); // null = ตำแหน่งบาย (bye)

  const round1 = [];
  for (let i = 0; i < names.length; i += 2) {
    round1.push({ p1: names[i], p2: names[i + 1], winner: null, scheduledAt: null, reminded: false });
  }

  const rounds = [round1];
  let count = round1.length;
  while (count > 1) {
    count = Math.floor(count / 2);
    rounds.push(
      Array.from({ length: count }, () => ({ p1: null, p2: null, winner: null, scheduledAt: null, reminded: false }))
    );
  }

  round1.forEach((m, idx) => {
    if (m.p1 && !m.p2) advanceWinner(rounds, 0, idx, m.p1);
    else if (!m.p1 && m.p2) advanceWinner(rounds, 0, idx, m.p2);
  });

  return rounds;
}

// ปิดรับสมัคร — เฉพาะปิด ไม่จับสู่ (เหมาะกับกิจกรรมที่ไม่ต้องมีสายแข่ง เช่น กีฬาสีนับหัวจำนวนทีม)
function closeRegistration(name) {
  return updateTournament(name, (t) => {
    if (t.status !== 'registration') {
      throw new Error(`ทัวร์นาเมนต์นี้อยู่ในสถานะ "${t.status}" ปิดรับสมัครไม่ได้ (ปิดได้เฉพาะตอนเปิดรับสมัครอยู่)`);
    }
    if (t.participants.length < 1) {
      throw new Error('ยังไม่มีผู้สมัครเลย ปิดรับสมัครไม่ได้');
    }
    t.status = 'closed';
  });
}

// เปิดรับสมัครใหม่ — ใช้ตอนปิดเร็วไปหรือมีคนขอสมัครเพิ่ม (เปิดคืนได้เฉพาะก่อนจับสู่เท่านั้น)
function openRegistration(name) {
  return updateTournament(name, (t) => {
    if (t.status !== 'closed') {
      throw new Error(`ทัวร์นาเมนต์นี้อยู่ในสถานะ "${t.status}" เปิดรับสมัครใหม่ไม่ได้ (เปิดคืนได้เฉพาะตอนปิดรับสมัครไว้ ยังไม่จับสู่)`);
    }
    t.status = 'registration';
  });
}

// จับสู่สร้างสายการแข่งขัน — ต้องปิดรับสมัครก่อนเสมอ แยกขั้นตอนจากการปิดรับสมัครโดยตั้งใจ
function generateBracket(name) {
  return updateTournament(name, (t) => {
    if (t.status !== 'closed') {
      throw new Error('ต้องปิดรับสมัครก่อน (/tournament-close) ถึงจะจับสู่ได้');
    }
    if (t.participants.length < 2) {
      throw new Error('ต้องมีผู้สมัครอย่างน้อย 2 ทีม/คน ถึงจะจับสู่ได้');
    }
    t.rounds = buildBracketRounds(t.participants.map((p) => p.name));
    t.status = 'bracket';
  });
}

function recordResult(name, roundNumber, matchNumber, winnerName) {
  return updateTournament(name, (t) => {
    const roundIdx = roundNumber - 1;
    const matchIdx = matchNumber - 1;
    const round = t.rounds[roundIdx];
    if (!round || !round[matchIdx]) {
      throw new Error('ไม่พบคู่แข่งขันที่ระบุ (เช็กเลขรอบ/เลขคู่อีกครั้ง)');
    }
    const match = round[matchIdx];
    if (winnerName !== match.p1 && winnerName !== match.p2) {
      throw new Error(`ผู้ชนะต้องเป็น "${match.p1}" หรือ "${match.p2}" เท่านั้น`);
    }
    advanceWinner(t.rounds, roundIdx, matchIdx, winnerName);
    const isFinal = roundIdx === t.rounds.length - 1;
    if (isFinal) t.status = 'completed';
  });
}

function setMatchSchedule(name, roundNumber, matchNumber, isoDatetime) {
  return updateTournament(name, (t) => {
    const match = t.rounds[roundNumber - 1]?.[matchNumber - 1];
    if (!match) throw new Error('ไม่พบคู่แข่งขันที่ระบุ (เช็กเลขรอบ/เลขคู่อีกครั้ง)');
    match.scheduledAt = isoDatetime;
    match.reminded = false;
  });
}

function formatBracketFields(tournament) {
  return tournament.rounds.map((round, rIdx) => ({
    name: `รอบที่ ${rIdx + 1}`,
    value:
      round
        .map((m, mIdx) => {
          const p1 = m.p1 || 'รอผลรอบก่อนหน้า';
          const p2 = m.p2 || 'รอผลรอบก่อนหน้า';
          const winnerText = m.winner ? ` → 🏆 **${m.winner}**` : '';
          const schedText = m.scheduledAt ? ` (นัดแข่ง: ${m.scheduledAt})` : '';
          return `คู่ที่ ${mIdx + 1}: ${p1} vs ${p2}${winnerText}${schedText}`;
        })
        .join('\n') || '-',
  }));
}

// สแกนหาแมตช์ที่ถึงเวลานัดแล้วแต่ยังไม่ได้แจ้งเตือน คืนค่าเป็นรายการให้ผู้เรียกไปโพสต์แจ้งเตือนเอง
function findDueReminders() {
  const data = load();
  const due = [];
  for (const t of Object.values(data)) {
    t.rounds.forEach((round, rIdx) => {
      round.forEach((m, mIdx) => {
        if (m.scheduledAt && !m.reminded && new Date(m.scheduledAt) <= new Date()) {
          due.push({ tournament: t, roundNumber: rIdx + 1, matchNumber: mIdx + 1, match: m });
        }
      });
    });
  }
  return due;
}

function markReminded(name, roundNumber, matchNumber) {
  updateTournament(name, (t) => {
    const match = t.rounds[roundNumber - 1]?.[matchNumber - 1];
    if (match) match.reminded = true;
  });
}

module.exports = {
  createTournament,
  getTournament,
  listTournaments,
  setRegistrationMessage,
  setBracketMessage,
  registerParticipant,
  closeRegistration,
  openRegistration,
  generateBracket,
  recordResult,
  setMatchSchedule,
  formatBracketFields,
  findDueReminders,
  markReminded,
};
