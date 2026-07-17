/**
 * moderation.js
 * ตรวจข้อความว่าผิดกฎหรือไม่ 2 ชั้น:
 *   1. บัญชีคำต้องห้าม (HARD_BLOCKLIST) — ชัดเจน ตัดสินทันที ไม่ต้องเรียก AI
 *   2. บัญชีคำเฝ้าระวัง (WATCHLIST) — กำกวม ส่งให้ AI ช่วยตัดสินอีกชั้น (ล่อแหลม/บริบทเสี่ยง)
 */

const { HARD_BLOCKLIST, WATCHLIST } = require('./banned-words');
const { getCustom } = require('./custom-words');
const { chatCompletion } = require('./openrouter');

const MODERATION_SYSTEM_PROMPT = `คุณคือระบบตรวจสอบเนื้อหาสำหรับ Discord ของวิทยาลัย
หน้าที่ของคุณคือพิจารณาว่าข้อความที่ได้รับ "ผิดกฎ" หรือไม่ โดยผิดกฎหมายถึง:
- คำหยาบคาย ด่าทอ คุกคาม เหยียดผู้อื่น
- เนื้อหาล่อแหลมทางเพศ หรือชักชวนไปในทางที่ไม่เหมาะสมกับวัยเรียน
- การชักชวนพนัน ขายบริการ หรือกิจกรรมผิดกฎหมาย

ตอบกลับเป็น JSON บรรทัดเดียวเท่านั้น รูปแบบ: {"flagged": true/false, "reason": "เหตุผลสั้นๆ"}
ถ้าข้อความเป็นการพูดคุยปกติ ล้อเล่นแบบไม่มีพิษภัย หรือใช้คำที่ดูเสี่ยงแต่บริบทไม่ได้ไม่เหมาะสมจริง
ให้ตอบ flagged: false ห้ามตอบอย่างอื่นนอกจาก JSON`;

function normalize(text) {
  let t = text.toLowerCase();
  t = t.replace(/[^a-zA-Zก-๙0-9]/g, '');
  t = t.replace(/(.)\1{2,}/g, '$1$1');
  return t;
}

function findMatch(normalizedText, wordList) {
  return wordList.find((word) => normalizedText.includes(normalize(word))) || null;
}

/**
 * ตรวจข้อความ คืนค่า { flagged, reason, source } เสมอ
 * source: 'blocklist' | 'ai' | null (ถ้าไม่ผิดกฎ)
 */
async function moderateMessage(text) {
  const normalized = normalize(text);

  // รวมบัญชีคำในโค้ด + คำที่แอดมินเพิ่มเองตอนรัน (อ่านสดทุกครั้ง ให้เพิ่มแล้วมีผลทันที)
  const custom = getCustom();
  const blocklist = [...HARD_BLOCKLIST, ...custom.blocklist];
  const watchlist = [...WATCHLIST, ...custom.watchlist];

  const hardMatch = findMatch(normalized, blocklist);
  if (hardMatch) {
    return { flagged: true, reason: `พบคำต้องห้าม ("${hardMatch}")`, source: 'blocklist' };
  }

  const watchMatch = findMatch(normalized, watchlist);
  if (!watchMatch) {
    return { flagged: false, reason: null, source: null };
  }

  // เจอคำเฝ้าระวัง แต่กำกวม ให้ AI ช่วยพิจารณาบริบทอีกชั้น
  try {
    const raw = await chatCompletion(MODERATION_SYSTEM_PROMPT, text);
    const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
    if (parsed.flagged) {
      return { flagged: true, reason: parsed.reason || 'AI ตรวจพบเนื้อหาไม่เหมาะสม', source: 'ai' };
    }
    return { flagged: false, reason: null, source: null };
  } catch (err) {
    console.warn('เรียก AI ตรวจสอบเนื้อหาไม่สำเร็จ (จะปล่อยผ่านข้อความนี้ไว้ก่อน):', err.message);
    return { flagged: false, reason: null, source: null };
  }
}

module.exports = { moderateMessage };
