/**
 * warnings.js
 * เก็บจำนวนครั้งที่สมาชิกแต่ละคนถูกเตือนจากระบบตรวจข้อความผิดกฎ
 * เก็บเป็นไฟล์ JSON ง่ายๆ (ไม่ใช้ฐานข้อมูล) อยู่รอดผ่านการรีสตาร์ทบอท
 */

const fs = require('fs');
const path = require('path');

const WARNINGS_FILE = path.join(__dirname, 'warnings.json');

function load() {
  if (!fs.existsSync(WARNINGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function addWarning(userId) {
  const data = load();
  data[userId] = (data[userId] || 0) + 1;
  save(data);
  return data[userId];
}

module.exports = { addWarning };
