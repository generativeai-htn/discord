/**
 * announcements.js
 * ระบบประกาศตามตาราง — แอดมินตั้งเวลาล่วงหน้า บอทโพสต์เองเมื่อถึงเวลา
 * เก็บเป็นไฟล์ JSON ง่ายๆ อยู่รอดผ่านการรีสตาร์ทบอท (แพทเทิร์นเดียวกับ tournaments.js)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'announcements.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, items: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { nextId: 1, items: [] };
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function addAnnouncement({ channelId, channelName, text, scheduledAt, createdBy }) {
  const data = load();
  const item = {
    id: data.nextId,
    channelId,
    channelName,
    text,
    scheduledAt,
    posted: false,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  data.items.push(item);
  data.nextId += 1;
  save(data);
  return item;
}

function listPending() {
  return load().items.filter((a) => !a.posted);
}

function cancelAnnouncement(id) {
  const data = load();
  const idx = data.items.findIndex((a) => a.id === id && !a.posted);
  if (idx === -1) throw new Error(`ไม่พบประกาศรอโพสต์หมายเลข ${id}`);
  const [removed] = data.items.splice(idx, 1);
  save(data);
  return removed;
}

// คืนรายการประกาศที่ถึงเวลาแล้วแต่ยังไม่ได้โพสต์ ให้ผู้เรียกไปโพสต์เอง
function findDue() {
  return load().items.filter((a) => !a.posted && new Date(a.scheduledAt) <= new Date());
}

function markPosted(id) {
  const data = load();
  const item = data.items.find((a) => a.id === id);
  if (item) item.posted = true;
  save(data);
}

module.exports = { addAnnouncement, listPending, cancelAnnouncement, findDue, markPosted };
