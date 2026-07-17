/**
 * image-moderation.js
 * ตรวจรูปภาพที่ส่งเข้ามาในเซิร์ฟเวอร์ด้วยโมเดล AI แบบ vision (ผ่าน OpenRouter)
 * ตรวจทั้งเนื้อหาภาพ (โป๊/รุนแรง/พนัน) และข้อความที่ปรากฏในภาพไปพร้อมกันในการเรียกครั้งเดียว
 *
 * หมายเหตุ: โมเดล vision ฟรีที่ใช้อยู่ (nvidia/nemotron-nano-12b-v2-vl:free) อ่านตัวอักษรไทยใน
 * ภาพได้ไม่แม่นนัก (ทดสอบแล้วอ่านผิดเพี้ยนบ่อย) จึงเป็นการตรวจแบบ "ช่วยกรองเพิ่ม" ไม่ใช่ตัวตัดสินสมบูรณ์แบบ
 */

const { visionCompletion } = require('./openrouter');

const IMAGE_MODERATION_PROMPT = `คุณคือระบบตรวจสอบรูปภาพสำหรับ Discord ของวิทยาลัยอาชีวศึกษา (นักเรียนอายุ 15-20 ปี)
พิจารณาภาพที่แนบมานี้ว่า "ผิดกฎ" หรือไม่ โดยผิดกฎถ้าเข้าข่ายอย่างใดอย่างหนึ่ง:
- ภาพโป๊เปลือย ลามก หรือสื่อทางเพศ
- ภาพความรุนแรง เลือด อาวุธในลักษณะข่มขู่ หรือทำร้ายร่างกาย
- ภาพชักชวนพนัน โฆษณาขายบริการทางเพศ หรือสิ่งผิดกฎหมาย
- ข้อความที่ปรากฏอยู่ในภาพ (ถ้ามี) เป็นคำหยาบคาย ด่าทอ เหยียดผู้อื่น หรือเนื้อหาไม่เหมาะสมกับวัยเรียน

ถ้าเป็นภาพทั่วไป (มีม รูปถ่าย การ์ตูน สกรีนช็อตเกม อาหาร ฯลฯ) ที่ไม่มีเนื้อหาข้างต้น ให้ถือว่าไม่ผิดกฎ
ตอบกลับเป็น JSON บรรทัดเดียวเท่านั้น รูปแบบ: {"flagged": true/false, "reason": "เหตุผลสั้นๆ เป็นภาษาไทย"}
ห้ามตอบอย่างอื่นนอกจาก JSON`;

/**
 * ตรวจรูปภาพ 1 รูปจาก URL คืนค่า { flagged, reason } เสมอ
 * ถ้าเรียก AI ไม่สำเร็จ (rate limit/timeout ของโมเดลฟรี) จะปล่อยผ่านไว้ก่อน (fail-open)
 * เหมือนกับพฤติกรรมของ moderation.js ตอน AI เรียกไม่สำเร็จ
 */
async function moderateImage(imageUrl) {
  try {
    const raw = await visionCompletion(IMAGE_MODERATION_PROMPT, imageUrl);
    const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
    if (parsed.flagged) {
      return { flagged: true, reason: parsed.reason || 'AI ตรวจพบภาพไม่เหมาะสม' };
    }
    return { flagged: false, reason: null };
  } catch (err) {
    console.warn('เรียก AI ตรวจสอบรูปภาพไม่สำเร็จ (จะปล่อยผ่านรูปนี้ไว้ก่อน):', err.message);
    return { flagged: false, reason: null };
  }
}

module.exports = { moderateImage };
