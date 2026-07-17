/**
 * economy.js
 * ระบบ XP/เลเวล + เหรียญ (เศรษฐกิจในเซิร์ฟเวอร์) เก็บเป็นไฟล์ economy.json
 * ใช้ร่วมกันโดย bot.js (XP จากการแชท, เกมเสี่ยงโชค, /rank, /leaderboard, /daily)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'economy.json');

// ได้ XP เมื่อพิมพ์คุย แต่มีคูลดาวน์กันสแปม (นับ XP ครั้งเดียวต่อ 60 วิ)
const MESSAGE_XP_COOLDOWN_MS = 60 * 1000;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // รับรายวันได้ทุก 20 ชม.
const DAILY_AMOUNT = 100;

// role ตามเลเวล — พอถึงเลเวลจะได้ role นี้ (แทนที่ role เลเวลก่อนหน้า)
const LEVEL_ROLES = [
  { level: 5, name: '🌱 Lv.5 มือใหม่' },
  { level: 10, name: '⭐ Lv.10 หน้าเก่า' },
  { level: 20, name: '🔥 Lv.20 เซียน' },
  { level: 30, name: '💎 Lv.30 เทพ' },
  { level: 50, name: '👑 Lv.50 ตำนาน' },
];

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

function blankUser() {
  return { xp: 0, level: 0, coins: 0, lastDaily: 0, lastMsgAt: 0 };
}

function getUser(userId) {
  const data = load();
  return { ...blankUser(), ...(data[userId] || {}) };
}

// XP ที่ต้องใช้เพื่อขึ้นจากเลเวล level ไป level+1 (สูตรคล้าย MEE6 ยิ่งเลเวลสูงยิ่งต้องใช้เยอะ)
function xpForNext(level) {
  return 5 * level * level + 50 * level + 100;
}

function applyLevelUps(u) {
  let leveledUp = false;
  while (u.xp >= xpForNext(u.level)) {
    u.xp -= xpForNext(u.level);
    u.level += 1;
    leveledUp = true;
  }
  return leveledUp;
}

// ให้รางวัลจากการพิมพ์คุย — คืน null ถ้ายังติดคูลดาวน์ (ไม่ได้รางวัลรอบนี้)
function tryMessageReward(userId) {
  const data = load();
  const u = { ...blankUser(), ...(data[userId] || {}) };
  const now = Date.now();
  if (now - u.lastMsgAt < MESSAGE_XP_COOLDOWN_MS) return null;

  u.lastMsgAt = now;
  const xpGain = 15 + Math.floor(Math.random() * 11); // 15-25
  const coinGain = 1 + Math.floor(Math.random() * 5); // 1-5
  u.xp += xpGain;
  u.coins += coinGain;
  const leveledUp = applyLevelUps(u);
  data[userId] = u;
  save(data);
  return { leveledUp, level: u.level, xpGain, coinGain };
}

function addCoins(userId, amount) {
  const data = load();
  const u = { ...blankUser(), ...(data[userId] || {}) };
  u.coins = Math.max(0, u.coins + amount);
  data[userId] = u;
  save(data);
  return u.coins;
}

// หักเหรียญ — คืน false ถ้าเหรียญไม่พอ (ไม่หัก)
function spendCoins(userId, amount) {
  const data = load();
  const u = { ...blankUser(), ...(data[userId] || {}) };
  if (u.coins < amount) return false;
  u.coins -= amount;
  data[userId] = u;
  save(data);
  return true;
}

function transferCoins(fromId, toId, amount) {
  if (amount <= 0) throw new Error('จำนวนเหรียญต้องมากกว่า 0');
  if (!spendCoins(fromId, amount)) throw new Error('เหรียญของคุณไม่พอ');
  addCoins(toId, amount);
}

function canClaimDaily(userId) {
  const u = getUser(userId);
  return Date.now() - u.lastDaily >= DAILY_COOLDOWN_MS;
}

function claimDaily(userId) {
  const data = load();
  const u = { ...blankUser(), ...(data[userId] || {}) };
  const now = Date.now();
  if (now - u.lastDaily < DAILY_COOLDOWN_MS) {
    const remainMs = DAILY_COOLDOWN_MS - (now - u.lastDaily);
    const hours = Math.ceil(remainMs / (60 * 60 * 1000));
    throw new Error(`รับรายวันไปแล้ว รออีก ~${hours} ชม.`);
  }
  u.lastDaily = now;
  u.coins += DAILY_AMOUNT;
  data[userId] = u;
  save(data);
  return { amount: DAILY_AMOUNT, total: u.coins };
}

// อันดับเรียงตามเลเวลก่อน แล้วค่อย XP
function getLeaderboard(limit = 10) {
  const data = load();
  return Object.entries(data)
    .map(([userId, u]) => ({ userId, ...blankUser(), ...u }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, limit);
}

function getRankPosition(userId) {
  const data = load();
  const sorted = Object.entries(data)
    .map(([id, u]) => ({ userId: id, ...blankUser(), ...u }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp);
  const idx = sorted.findIndex((x) => x.userId === userId);
  return { position: idx === -1 ? null : idx + 1, total: sorted.length };
}

// role เลเวลที่ควรได้ ณ เลเวลปัจจุบัน (ตัวสูงสุดที่ถึง) — คืน null ถ้ายังไม่ถึงเลเวล 5
function levelRoleFor(level) {
  let earned = null;
  for (const lr of LEVEL_ROLES) {
    if (level >= lr.level) earned = lr;
  }
  return earned;
}

module.exports = {
  LEVEL_ROLES,
  xpForNext,
  getUser,
  tryMessageReward,
  addCoins,
  spendCoins,
  transferCoins,
  canClaimDaily,
  claimDaily,
  getLeaderboard,
  getRankPosition,
  levelRoleFor,
};
