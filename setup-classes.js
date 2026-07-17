/**
 * setup-classes.js
 * สร้าง role ห้องเรียนตามรายชื่อนักเรียน (เช่น ปวช.1/1, ปวส.2/2)
 * เมื่อนักเรียนยืนยันตัวตน (/verify) บอทจะให้ role ห้องเรียนอัตโนมัติตามห้องในไฟล์
 * → ครูสามารถ @mention ทั้งห้องได้ เช่น "@ปวช.1/1 พรุ่งนี้มีสอบ"
 *
 * role ตั้งชื่อตามห้องตรงๆ (mentionable) ไม่ hoist เพื่อไม่ให้รายชื่อสมาชิกรก
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-classes.js
 */

const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const { loadRoster } = require('./roster');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();

  const rooms = [...new Set([...loadRoster().values()].map((r) => r.room).filter(Boolean))].sort();
  console.log(`พบห้องเรียน ${rooms.length} ห้อง`);

  for (const room of rooms) {
    const existing = guild.roles.cache.find((r) => r.name === room);
    if (existing) {
      console.log(`  role มีอยู่แล้ว: ${room}`);
      continue;
    }
    await guild.roles.create({ name: room, mentionable: true, hoist: false });
    console.log(`  สร้าง role ห้องเรียน: ${room}`);
  }

  console.log('ตั้งค่า role ห้องเรียนเสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
