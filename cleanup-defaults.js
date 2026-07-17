/**
 * cleanup-defaults.js
 * ลบหมวดหมู่/ห้องเริ่มต้นที่ Discord สร้างให้อัตโนมัติตอนสร้างเซิร์ฟเวอร์ใหม่
 * (Information, Text Channels, Voice Channels) ซึ่งไม่ได้อยู่ในโครงสร้างของวิทยาลัย
 *
 * ลบถาวร กู้คืนไม่ได้ — idempotent: รันซ้ำได้ปลอดภัย จะข้ามหมวดหมู่ที่ลบไปแล้ว
 * วิธีใช้: node cleanup-defaults.js
 */

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const DEFAULT_CATEGORY_NAMES = ['Information', 'Text Channels', 'Voice Channels'];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();

  for (const name of DEFAULT_CATEGORY_NAMES) {
    const category = [...channels.values()].find(
      (c) => c.type === ChannelType.GuildCategory && c.name === name
    );
    if (!category) {
      console.log(`ไม่พบหมวดหมู่ "${name}" (อาจลบไปแล้ว) — ข้าม`);
      continue;
    }

    const children = [...channels.values()].filter((c) => c.parentId === category.id);
    for (const child of children) {
      await child.delete('ลบห้องเริ่มต้นของ Discord ที่ไม่ใช้งาน');
      console.log(`  ลบห้อง: ${child.name}`);
    }

    await category.delete('ลบหมวดหมู่เริ่มต้นของ Discord ที่ไม่ใช้งาน');
    console.log(`ลบหมวดหมู่: ${name}`);
  }

  console.log('ลบหมวดหมู่เริ่มต้นเสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
