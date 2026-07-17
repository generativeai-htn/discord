/**
 * roster.js
 * โหลดรายชื่อนักเรียนจาก รายชื่อนักศึกษา.xlsx สำหรับใช้ยืนยันตัวตนใน bot.js
 *
 * หมายเหตุความปลอดภัย: จงใจไม่อ่านคอลัมน์ "เลขประจำตัวประชาชน" และวันเกิด
 * เข้าหน่วยความจำเลย เพราะไม่จำเป็นต่อการยืนยันตัวตน และเป็นข้อมูลอ่อนไหวเกินความจำเป็น
 * ใช้ "เลขประจำตัวนักเรียน" คู่กับชื่อ-นามสกุลแทน
 */

const path = require('path');
const XLSX = require('xlsx');

const ROSTER_FILE = path.join(__dirname, 'รายชื่อนักศึกษา.xlsx');

// ชื่อชีตขึ้นต้นด้วย (H = ปวส.) แล้วตามด้วย BA/BC/MP ซึ่งตรงกับสาขาใน branches.js
function branchForSheet(sheetName) {
  const m = sheetName.match(/^H?(BA|BC|MP)/);
  if (!m) return null;
  return {
    BA: 'การบัญชี',
    BC: 'เทคโนโลยีธุรกิจดิจิทัล-คอมพิวเตอร์ธุรกิจ',
    MP: 'ช่างยนต์-เทคนิคยานยนต์',
  }[m[1]];
}

function loadRoster() {
  const workbook = XLSX.readFile(ROSTER_FILE);
  const roster = new Map();

  for (const sheetName of workbook.SheetNames) {
    const branch = branchForSheet(sheetName);
    if (!branch) continue; // ข้ามชีตที่จับคู่สาขาไม่ได้ (เช่น สาขาที่ยังไม่เปิดสอน)

    // แถวที่ 1-3 เป็นหัวเรื่อง/หัวตาราง ข้อมูลจริงเริ่มแถวที่ 4 (index 3)
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      range: 3,
    });

    for (const row of rows) {
      const studentId = row[2];
      const room = row[3];
      const fullName = row[4];
      const status = row[6];
      if (!studentId || !fullName) continue;

      roster.set(String(studentId).trim(), {
        name: String(fullName).trim(),
        room: room ? String(room).trim() : '',
        branch,
        status: status ? String(status).trim() : '',
      });
    }
  }

  return roster;
}

module.exports = { loadRoster };
