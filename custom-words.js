/**
 * custom-words.js
 * จัดการคำต้องห้าม "เพิ่มเติม" ที่แอดมินเพิ่ม/ลบได้เองตอนรัน (ไม่ต้องแก้โค้ด/รีสตาร์ท)
 * เก็บใน custom-words.json — moderation.js จะรวมกับบัญชีคำในโค้ด (banned-words.js) ตอนตรวจทุกครั้ง
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'custom-words.json');

function load() {
  if (!fs.existsSync(FILE)) return { blocklist: [], watchlist: [] };
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return { blocklist: data.blocklist || [], watchlist: data.watchlist || [] };
  } catch {
    return { blocklist: [], watchlist: [] };
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getCustom() {
  return load();
}

// type: 'block' (ลบทันที) | 'watch' (ให้ AI ช่วยดู)
function addWord(type, word) {
  const w = String(word).trim().toLowerCase();
  if (!w) throw new Error('คำว่าง');
  const data = load();
  const key = type === 'block' ? 'blocklist' : 'watchlist';
  if (data[key].includes(w)) throw new Error(`มีคำ "${w}" อยู่แล้วในบัญชี${type === 'block' ? 'คำต้องห้าม' : 'เฝ้าระวัง'}`);
  data[key].push(w);
  save(data);
  return data[key].length;
}

function removeWord(word) {
  const w = String(word).trim().toLowerCase();
  const data = load();
  let removed = false;
  for (const key of ['blocklist', 'watchlist']) {
    const idx = data[key].indexOf(w);
    if (idx !== -1) {
      data[key].splice(idx, 1);
      removed = true;
    }
  }
  if (!removed) throw new Error(`ไม่พบคำ "${w}" ในบัญชีที่เพิ่มเอง`);
  save(data);
}

module.exports = { getCustom, addWord, removeWord };
