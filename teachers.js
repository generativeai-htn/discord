/**
 * teachers.js
 * ระบบข้อมูลครูสำหรับการยืนยันตัวตนแบบ "กรอกชื่อ + แอดมินอนุมัติ"
 *
 * - โหลดรายชื่อครูจาก รายชื่อครู.xlsx (คอลัมน์: ชื่อ-นามสกุล | สาขา | ตำแหน่ง)
 * - เก็บคำขอที่รออนุมัติใน teacher-pending.json (อยู่รอดผ่านการรีสตาร์ทบอท)
 *
 * หมายเหตุความปลอดภัย: การได้ role ครูต้องผ่านแอดมินกดอนุมัติเสมอ
 * การเช็กชื่อกับไฟล์เป็นแค่ด่านแรกกันสแปม ไม่ใช่การยืนยันขั้นสุดท้าย
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROSTER_FILE = path.join(__dirname, 'รายชื่อครู.xlsx');
const PENDING_FILE = path.join(__dirname, 'teacher-pending.json');
// เก็บว่าชื่อครูแต่ละคนถูกอนุมัติให้บัญชี Discord ไหนไปแล้ว (กันชื่อเดียวถูกอ้างซ้ำ)
const CLAIMED_FILE = path.join(__dirname, 'teacher-claimed.json');

const TEACHER_ROLE_NAME = 'คุณครู';

function normalizeName(name) {
  return String(name).replace(/\s+/g, '').trim();
}

function rosterExists() {
  return fs.existsSync(ROSTER_FILE);
}

// เดาสาขาจากข้อความตำแหน่ง เพื่อแสดงประกอบให้แอดมินดูตอนอนุมัติ
function branchFromPosition(position) {
  if (position.includes('บัญชี')) return 'การบัญชี';
  if (position.includes('ดิจิทัล') || position.includes('คอมพิวเตอร์')) return 'เทคโนโลยีธุรกิจดิจิทัล-คอมพิวเตอร์ธุรกิจ';
  if (position.includes('การจัดการ')) return 'การจัดการ';
  if (position.includes('ช่างยนต์') || position.includes('ยานยนต์') || position.includes('เครื่องกล'))
    return 'ช่างยนต์-เทคนิคยานยนต์';
  if (position.includes('สามัญ')) return 'วิชาสามัญ';
  return '';
}

// โหลดรายชื่อครูทั้งหมดจากไฟล์ระบบสแกนนิ้ว
// โครงสร้างคอลัมน์: [ลำดับ, ชื่อ-นามสกุล, ตำแหน่ง, PIN, UID]
// *** จงใจอ่านเฉพาะชื่อ+ตำแหน่ง ไม่แตะคอลัมน์ PIN/UID เลย เพราะเป็นรหัสระบบสแกนนิ้ว (ข้อมูลอ่อนไหว) ***
function loadTeacherRoster() {
  if (!rosterExists()) return [];
  const workbook = XLSX.readFile(ROSTER_FILE);
  const teachers = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    for (const row of rows) {
      // แถวข้อมูลจริงขึ้นต้นด้วยเลขลำดับ — ข้ามหัวตาราง/แถวคั่นหมวด (เช่น "ครูผู้สอน")
      if (typeof row[0] !== 'number' || !row[1]) continue;
      const position = row[2] ? String(row[2]).trim() : 'ครูผู้สอน';
      teachers.push({
        name: String(row[1]).trim(),
        branch: branchFromPosition(position),
        position,
      });
    }
  }
  return teachers;
}

function findTeacher(inputName) {
  const roster = loadTeacherRoster();
  const normalized = normalizeName(inputName);
  return roster.find((t) => normalizeName(t.name) === normalized) || null;
}

// ===== คำขอรออนุมัติ =====

function loadPending() {
  if (!fs.existsSync(PENDING_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function savePending(data) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function addPending(userId, teacher) {
  const data = loadPending();
  data[userId] = { ...teacher, requestedAt: new Date().toISOString() };
  savePending(data);
}

function getPending(userId) {
  return loadPending()[userId] || null;
}

function removePending(userId) {
  const data = loadPending();
  delete data[userId];
  savePending(data);
}

// ===== ชื่อครูที่ถูกอ้างสิทธิ์แล้ว (1 ชื่อ = 1 บัญชี) =====

function loadClaimed() {
  if (!fs.existsSync(CLAIMED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CLAIMED_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveClaimed(data) {
  fs.writeFileSync(CLAIMED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// คืน userId ของบัญชีที่อ้างชื่อครูนี้ไปแล้ว (null = ยังว่าง)
function getTeacherClaimant(teacherName) {
  return loadClaimed()[normalizeName(teacherName)] || null;
}

function claimTeacher(teacherName, userId) {
  const data = loadClaimed();
  data[normalizeName(teacherName)] = userId;
  saveClaimed(data);
}

// ปลดการอ้างสิทธิ์ (ใช้ตอนแอดมินถอด role ครูออก เพื่อให้ชื่อว่างกลับมาอ้างใหม่ได้)
function releaseTeacher(teacherName) {
  const data = loadClaimed();
  delete data[normalizeName(teacherName)];
  saveClaimed(data);
}

module.exports = {
  TEACHER_ROLE_NAME,
  rosterExists,
  loadTeacherRoster,
  findTeacher,
  addPending,
  getPending,
  removePending,
  getTeacherClaimant,
  claimTeacher,
  releaseTeacher,
};
