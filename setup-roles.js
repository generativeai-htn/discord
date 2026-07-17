/**
 * setup-roles.js
 * สร้าง role ประจำสาขา (ตาม branches.js) + role กลาง "ยืนยันตัวตนแล้ว"
 * แล้วจำกัดสิทธิ์การมองเห็นห้อง "ภายใน" ตามระดับที่เหมาะสม:
 *   - หมวดหมู่ 🏫 [สาขา]  → เฉพาะนักเรียนสาขานั้น
 *   - หมวดหมู่ภายใน (ทั่วไป/วิชาการ/เกม-กีฬา/ผ่อนคลาย/ช่วยเหลือ) → เฉพาะคนที่ยืนยันตัวตนแล้ว (ทุกสาขา)
 *   - หมวดหมู่สาธารณะ (ข้อมูลเซิร์ฟเวอร์/ประกาศ/รับสมัครเรียน/กิจกรรมวิทยาลัย) → เปิดให้ทุกคนเห็น ไม่แก้ไข
 *
 * รันครั้งเดียวหลัง setup-server.js (idempotent — รันซ้ำได้ปลอดภัย)
 * ต้องให้บอทมีสิทธิ์ "จัดการบทบาท" (Manage Roles) เพิ่มจากที่ตั้งไว้ตอนแรก
 *
 * วิธีใช้: node setup-roles.js
 */

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const BRANCHES = require('./branches');
const { VERIFIED_ROLE_NAME } = require('./verified-role');

const INTERNAL_CATEGORIES = ['💬 ทั่วไป', '📚 วิชาการ', '🎮 เกม-กีฬา', '🛋 ผ่อนคลาย', '🛠 ช่วยเหลือ', '🎉 กิจกรรมวิทยาลัย'];

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ตั้งสิทธิ์การมองเห็นของหมวดหมู่ พร้อม "ฝังสิทธิ์ของบอทเองไว้เสมอ" กัน bot ล็อกตัวเองออกจากห้อง
// (ถ้าไม่ทำแบบนี้ รอบต่อไปที่รันสคริปต์ บอทจะไม่มีสิทธิ์มองเห็นห้องที่เพิ่งจำกัดสิทธิ์ไปแล้ว
// เพราะ Discord ต้องการให้ผู้แก้ไขสิทธิ์มองเห็นห้องนั้นอยู่ก่อนถึงจะแก้ไขต่อได้)
async function restrictCategory(category, allowRoleId, botRoleId, everyoneRoleId, label) {
  try {
    await category.permissionOverwrites.set([
      { id: everyoneRoleId, deny: [PermissionFlagsBits.ViewChannel] },
      { id: allowRoleId, allow: [PermissionFlagsBits.ViewChannel] },
      { id: botRoleId, allow: [PermissionFlagsBits.ViewChannel] },
    ]);
    console.log(`  จำกัดสิทธิ์หมวดหมู่ "${label}" สำเร็จ`);

    // สำคัญ: Discord ไม่ได้ให้ห้องย่อยสืบทอดสิทธิ์จากหมวดหมู่โดยอัตโนมัติ (ทำงานเฉพาะตอนกด "Sync
    // Permissions" ในหน้าเว็บ ซึ่งจะ "คัดลอก" สิทธิ์ลงไปจริงๆ) ถ้าห้องย่อยไม่มี override ของตัวเองเลย
    // มันจะยังใช้สิทธิ์เริ่มต้นของ @everyone (มองเห็นได้) ทั้งที่หมวดหมู่ล็อกไปแล้ว ต้อง sync ลงห้องย่อยด้วยเสมอ
    const children = category.guild.channels.cache.filter((c) => c.parentId === category.id);
    for (const child of children.values()) {
      await child.lockPermissions().catch((err) => console.error(`    ✗ sync ห้อง "${child.name}" ไม่สำเร็จ: ${err.message}`));
    }
  } catch (err) {
    console.error(
      `  ✗ ตั้งสิทธิ์หมวดหมู่ "${label}" ไม่สำเร็จ (${err.message}) — ถ้าเป็น Missing Access ` +
        `แปลว่าบอทถูกล็อกออกจากห้องนี้ไปแล้วจากรอบก่อนหน้า ให้เปิด "ผู้ดูแล (Administrator)" ` +
        `ให้ role htn_bot ชั่วคราวใน Server Settings → Roles แล้วรันสคริปต์นี้ใหม่อีกครั้ง`
    );
  }
}

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const everyoneRole = guild.roles.everyone;
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;

  for (const branch of BRANCHES) {
    let role = guild.roles.cache.find((r) => r.name === branch);
    if (!role) {
      role = await guild.roles.create({ name: branch, hoist: true, mentionable: false });
      console.log(`สร้าง role: ${branch}`);
    } else {
      console.log(`role มีอยู่แล้ว: ${branch}`);
    }

    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === `🏫 ${branch}`
    );
    if (!category) {
      console.warn(`  ไม่พบหมวดหมู่ 🏫 ${branch} — ข้ามการตั้งสิทธิ์ (รัน setup-server.js ก่อน)`);
      continue;
    }

    await restrictCategory(category, role.id, botRole.id, everyoneRole.id, `🏫 ${branch}`);
  }

  let verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({ name: VERIFIED_ROLE_NAME, hoist: false, mentionable: false });
    console.log(`สร้าง role: ${VERIFIED_ROLE_NAME}`);
  } else {
    console.log(`role มีอยู่แล้ว: ${VERIFIED_ROLE_NAME}`);
  }

  for (const categoryName of INTERNAL_CATEGORIES) {
    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName
    );
    if (!category) {
      console.warn(`  ไม่พบหมวดหมู่ "${categoryName}" — ข้ามการตั้งสิทธิ์ (รัน setup-server.js ก่อน)`);
      continue;
    }

    await restrictCategory(category, verifiedRole.id, botRole.id, everyoneRole.id, categoryName);
  }

  console.log('ตั้งค่า role และสิทธิ์เสร็จสมบูรณ์ — บุคคลภายนอกจะเห็นเฉพาะห้องประกาศ-ข่าว/รับสมัครเรียนเท่านั้น');
  process.exit(0);
});

client.login(BOT_TOKEN);
