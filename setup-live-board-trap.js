/**
 * setup-live-board-trap.js
 * เพิ่ม 3 ห้องใหม่ตามที่ขอ:
 *   1. 🔴 Live Showoff (voice, สาธารณะ) — บุคคลภายนอกดูสตรีมได้ แต่ live/สตรีมได้เฉพาะนักเรียนที่ยืนยันแล้ว+ครู
 *   2. 📋 กระดานถาม-ตอบ (forum, ภายในเท่านั้น) — เฉพาะนักเรียนที่ยืนยันตัวตนแล้ว/ครู ตั้งกระทู้ถาม-คุยกันได้
 *   3. 🪤 ห้องดักบอท (text, สาธารณะ) — ใครพิมพ์ในห้องนี้ถือว่าต้องสงสัยเป็นบอทสแปม โดนเตะทันที (ดักจับใน bot.js)
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * ต้องรัน setup-roles.js มาก่อน (ต้องมี role "นักเรียน (ยืนยันแล้ว)") และ setup-teachers.js (role "คุณครู")
 * ⚠️ ห้องดักบอทให้เตะสมาชิกได้จริง ต้องเพิ่มสิทธิ์ "Kick Members" ให้ role htn_bot ก่อน (ไม่งั้นจะลบข้อความได้อย่างเดียว)
 *
 * วิธีใช้: node setup-live-board-trap.js
 */

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
require('dotenv').config();
const { VERIFIED_ROLE_NAME } = require('./verified-role');
const { TEACHER_ROLE_NAME } = require('./teachers');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const TRAP_TITLE = '🪤 ห้องดักบอท';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function ensureCategory(guild, name) {
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (!category) {
    category = await guild.channels.create({ name, type: ChannelType.GuildCategory });
    console.log(`สร้างหมวดหมู่: ${name}`);
  }
  return category;
}

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  const everyoneRole = guild.roles.everyone;

  const verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  const teacherRole = guild.roles.cache.find((r) => r.name === TEACHER_ROLE_NAME);
  if (!verifiedRole || !teacherRole) {
    console.error('ไม่พบ role ยืนยันตัวตน/ครู — รัน setup-roles.js และ setup-teachers.js ก่อน');
    process.exit(1);
  }

  // ===== 1) 🔴 Live Showoff — voice สาธารณะ ดูได้ทุกคน แต่ live ได้เฉพาะนักเรียนยืนยันแล้ว+ครู =====
  const liveCategory = await ensureCategory(guild, '📺 Live Showoff');
  let liveChannel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.parentId === liveCategory.id && c.name === 'Live Showoff'
  );
  if (!liveChannel) {
    liveChannel = await guild.channels.create({
      name: 'Live Showoff',
      type: ChannelType.GuildVoice,
      parent: liveCategory.id,
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.Stream] },
        { id: verifiedRole.id, allow: [PermissionFlagsBits.Stream] },
        { id: teacherRole.id, allow: [PermissionFlagsBits.Stream] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ],
    });
    console.log('สร้างห้อง 🔴 Live Showoff แล้ว (ดูได้ทุกคน, live ได้เฉพาะนักเรียนยืนยันแล้ว+ครู)');
  } else {
    await liveChannel.permissionOverwrites.set([
      { id: everyoneRole.id, deny: [PermissionFlagsBits.Stream] },
      { id: verifiedRole.id, allow: [PermissionFlagsBits.Stream] },
      { id: teacherRole.id, allow: [PermissionFlagsBits.Stream] },
      { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    ]);
    console.log('ห้อง 🔴 Live Showoff มีอยู่แล้ว (อัปเดตสิทธิ์ให้ตรงล่าสุด)');
  }

  // ===== 2) 📋 กระดานถาม-ตอบ — forum ภายในเท่านั้น (sync สิทธิ์จากหมวด 💬 ทั่วไป) =====
  const generalCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === '💬 ทั่วไป'
  );
  if (!generalCategory) {
    console.warn('ไม่พบหมวดหมู่ 💬 ทั่วไป — ข้ามการสร้างกระดานถาม-ตอบ (รัน setup-server.js ก่อน)');
  } else {
    let boardChannel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildForum && c.parentId === generalCategory.id && c.name === 'กระดานถาม-ตอบ'
    );
    if (!boardChannel) {
      boardChannel = await guild.channels.create({
        name: 'กระดานถาม-ตอบ',
        type: ChannelType.GuildForum,
        parent: generalCategory.id,
        topic: 'ตั้งกระทู้ถามหรือพูดคุยอะไรก็ได้ — เฉพาะนักเรียนที่ยืนยันตัวตนแล้ว/ครู',
      });
      console.log('สร้างห้อง 📋 กระดานถาม-ตอบ แล้ว (forum)');
    } else {
      console.log('ห้อง 📋 กระดานถาม-ตอบ มีอยู่แล้ว');
    }
    // ห้องย่อยไม่สืบทอดสิทธิ์จากหมวดหมู่อัตโนมัติ ต้อง sync เองเสมอ (ดู CLAUDE.md)
    await boardChannel.lockPermissions();
    console.log('  sync สิทธิ์กระดานถาม-ตอบให้ตรงกับหมวด 💬 ทั่วไป แล้ว (ภายในเท่านั้น)');
  }

  // ===== 3) 🪤 ห้องดักบอท — text สาธารณะ (ต้องเปิดให้ทุกคนพิมพ์ได้ ถึงจะดักได้) =====
  const infoCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === '📌 ข้อมูลเซิร์ฟเวอร์'
  );
  let trapChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'ห้องดักบอท');
  if (!trapChannel) {
    trapChannel = await guild.channels.create({
      name: 'ห้องดักบอท',
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : undefined,
      permissionOverwrites: [{ id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }],
    });
    console.log('สร้างห้อง 🪤 ห้องดักบอท แล้ว (เปิดให้ทุกคนเห็น+พิมพ์ได้ ถึงจะดักได้ผล)');
  } else {
    console.log('ห้อง 🪤 ห้องดักบอท มีอยู่แล้ว');
  }

  const trapEmbed = new EmbedBuilder()
    .setColor(0x7c2d12)
    .setTitle(TRAP_TITLE)
    .setDescription(
      '⚠️ **ห้ามพิมพ์ข้อความในห้องนี้โดยเด็ดขาด**\n\n' +
        'ห้องนี้เป็น "ห้องดักบอท" (honeypot) สำหรับดักจับบอทสแปม/self-bot ที่แอบเข้ามากวนในเซิร์ฟเวอร์\n' +
        '**หากมีการพิมพ์ข้อความใดๆ ในห้องนี้ จะถูกเตะออกจากเซิร์ฟเวอร์ทันทีโดยอัตโนมัติ ไม่มีการเตือนก่อน**'
    )
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  const messages = await trapChannel.messages.fetch({ limit: 20 });
  const existing = messages.find((m) => m.embeds[0]?.title === TRAP_TITLE);
  if (existing) {
    await existing.edit({ embeds: [trapEmbed] });
    console.log('  แก้ไขป้ายเตือนห้องดักบอทให้เป็นล่าสุดแล้ว');
  } else {
    const posted = await trapChannel.send({ embeds: [trapEmbed] });
    await posted.pin().catch(() => {});
    console.log('  โพสต์ป้ายเตือนห้องดักบอทแล้ว');
  }

  console.log('\nเสร็จสมบูรณ์ — 3 ห้องใหม่พร้อมใช้งาน');
  console.log('⚠️ อย่าลืม: ให้สิทธิ์ "Kick Members" กับ role htn_bot ใน Server Settings → Roles ด้วย ไม่งั้นห้องดักบอทจะลบข้อความได้อย่างเดียว เตะไม่ได้');
  process.exit(0);
});

client.login(BOT_TOKEN);
