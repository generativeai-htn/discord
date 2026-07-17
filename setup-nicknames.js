/**
 * setup-nicknames.js
 * บังคับ/ล็อกชื่อเล่น — ทำให้ชื่อจริงที่บอทตั้งตอนยืนยันตัวตนอยู่ถาวร เปลี่ยนเองไม่ได้
 *
 * วิธีทำ: ปิดสิทธิ์ "เปลี่ยนชื่อเล่น (Change Nickname)" ของ @everyone
 * → สมาชิกทั่วไปเปลี่ยนชื่อเล่นตัวเองไม่ได้อีก มีแต่บอท/แอดมินที่ตั้งให้ได้
 * เมื่อบอทตั้งชื่อจริงตอน /verify แล้ว ชื่อนั้นจะติดถาวร
 *
 * *** ต้องเพิ่มสิทธิ์บอท "จัดการชื่อเล่น (Manage Nicknames)" ก่อน ***
 * ไม่งั้นบอทตั้งชื่อเล่นให้ใครไม่ได้เลย (ตั้งค่าที่ Server Settings → Roles → htn_bot)
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-nicknames.js
 */

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config();

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
  const me = await guild.members.fetchMe();

  if (!me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    console.warn(
      '⚠️ เตือน: บอทยังไม่มีสิทธิ์ "จัดการชื่อเล่น (Manage Nicknames)" — ตั้งชื่อเล่นให้ใครไม่ได้\n' +
        '   ไปเปิดที่ Server Settings → Roles → htn_bot ก่อน แล้วรันสคริปต์นี้ใหม่'
    );
  }

  const everyone = guild.roles.everyone;
  if (everyone.permissions.has(PermissionsBitField.Flags.ChangeNickname)) {
    const newPerms = everyone.permissions.remove(PermissionsBitField.Flags.ChangeNickname);
    await everyone.setPermissions(newPerms, 'ล็อกชื่อเล่น — สมาชิกเปลี่ยนชื่อเล่นตัวเองไม่ได้');
    console.log('ปิดสิทธิ์ "เปลี่ยนชื่อเล่น" ของ @everyone แล้ว — ชื่อเล่นถูกล็อก');
  } else {
    console.log('สิทธิ์ "เปลี่ยนชื่อเล่น" ของ @everyone ถูกปิดอยู่แล้ว');
  }

  console.log('ตั้งค่าล็อกชื่อเล่นเสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
