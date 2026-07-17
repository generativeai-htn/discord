/**
 * backup.js
 * สำรองข้อมูลสำคัญ — ก๊อปไฟล์ข้อมูล (.json) และไฟล์รายชื่อ (.xlsx) ไปเก็บในโฟลเดอร์ backups/
 * พร้อม timestamp เก็บย้อนหลัง 14 ชุดล่าสุด (ลบชุดเก่ากว่านั้นอัตโนมัติ)
 *
 * ใช้ได้ 2 แบบ:
 *   - รันมือ: node backup.js
 *   - เรียกจาก bot.js อัตโนมัติทุกวัน (require('./backup').runBackup())
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, 'backups');
const KEEP = 14; // เก็บย้อนหลังกี่ชุด

// ไฟล์ที่ต้องสำรอง (จะข้ามไฟล์ที่ยังไม่มี)
const FILES = [
  'economy.json',
  'tournaments.json',
  'announcements.json',
  'warnings.json',
  'teacher-pending.json',
  'teacher-claimed.json',
  'รายชื่อนักศึกษา.xlsx',
  'รายชื่อครู.xlsx',
  '.env',
];

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  const dest = path.join(BACKUP_DIR, `backup-${timestamp()}`);
  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  for (const file of FILES) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dest, file));
      copied += 1;
    }
  }

  // ลบชุดเก่าเกิน KEEP
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => n.startsWith('backup-'))
    .sort();
  while (backups.length > KEEP) {
    const old = backups.shift();
    fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
  }

  console.log(`[backup] สำรองข้อมูล ${copied} ไฟล์ → ${path.basename(dest)} (เก็บย้อนหลัง ${Math.min(backups.length, KEEP)} ชุด)`);
  return dest;
}

module.exports = { runBackup };

// ถ้ารันไฟล์นี้ตรงๆ ให้สำรองทันที
if (require.main === module) runBackup();
