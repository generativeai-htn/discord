/**
 * quiz.js
 * สถานะเกมตอบคำถาม (quiz) แบบชั่วคราวในหน่วยความจำ — 1 ห้องมีได้ 1 คำถามที่กำลังเปิดอยู่
 * ถ้าบอทรีสตาร์ทกลางคัน คำถามที่ค้างอยู่จะหาย (ยอมรับได้ เพราะเป็นเกมสั้นๆ)
 */

const active = new Map(); // channelId -> { answer, reward, question, timer }

function normalize(text) {
  return String(text).toLowerCase().replace(/\s+/g, '').trim();
}

function startQuiz(channelId, question, answer, reward, timer) {
  active.set(channelId, { answer: normalize(answer), rawAnswer: answer, reward, question, timer });
}

function hasQuiz(channelId) {
  return active.has(channelId);
}

function getQuiz(channelId) {
  return active.get(channelId) || null;
}

// เช็กว่าข้อความตอบถูกไหม
function isCorrect(channelId, text) {
  const q = active.get(channelId);
  return q ? normalize(text) === q.answer : false;
}

function endQuiz(channelId) {
  const q = active.get(channelId);
  if (q?.timer) clearTimeout(q.timer);
  active.delete(channelId);
  return q;
}

module.exports = { startQuiz, hasQuiz, getQuiz, isCorrect, endQuiz };
