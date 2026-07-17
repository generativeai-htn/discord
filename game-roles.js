/**
 * game-roles.js
 * รายชื่อเกมสำหรับระบบ reaction role (เลือก role เกมที่เล่น)
 * ใช้ร่วมกันโดย setup-fun.js (สร้าง role + ปุ่ม) และ bot.js (จัดการปุ่มกด)
 *
 * role ของแต่ละเกมชื่อ "🎮 [ชื่อเกม]" — เพิ่ม/ลบเกมได้ตามใจ (สูงสุด 25 เกม = 5 แถว)
 */

module.exports = {
  GAME_PANEL_TITLE: '🎮 เลือกเกมที่คุณเล่น',
  GAMES: [
    { key: 'roblox', label: 'Roblox', emoji: '🟥' },
    { key: 'fivem', label: 'FiveM (GTA RP)', emoji: '🚓' },
    { key: 'minecraft', label: 'Minecraft', emoji: '⛏️' },
    { key: 'rov', label: 'RoV', emoji: '⚔️' },
    { key: 'valorant', label: 'Valorant', emoji: '🎯' },
    { key: 'freefire', label: 'Free Fire', emoji: '🔥' },
    { key: 'genshin', label: 'Genshin Impact', emoji: '🌸' },
    { key: 'amongus', label: 'Among Us', emoji: '🚀' },
    { key: 'gta', label: 'GTA V', emoji: '🚗' },
    { key: 'other', label: 'เกมอื่น ๆ', emoji: '🕹️' },
  ],
};

module.exports.roleName = (label) => `🎮 ${label}`;
