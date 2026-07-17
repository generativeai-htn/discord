/**
 * setup-content.js
 * โพสต์กฎระเบียบ + คู่มือการใช้งาน + ปุ่มโต้ตอบ (แทนการพิมพ์คำสั่ง) ลงในห้องที่เกี่ยวข้อง
 *
 * idempotent แบบ "upsert" — ถ้าเคยโพสต์แล้ว (เช็กจาก embed title) จะแก้ไขข้อความเดิมให้ตรงกับ
 * เนื้อหาล่าสุดในไฟล์นี้เสมอ แทนที่จะข้ามหรือโพสต์ซ้ำ ทำให้แก้กฎ/คู่มือ/ปุ่มแล้วรันซ้ำได้เรื่อยๆ
 * ต้องรัน setup-server.js ให้ห้องพวกนี้มีอยู่ก่อน: กฎ-ระเบียบ, คู่มือการใช้งานเซิร์ฟเวอร์, รับยศเข้าใช้งาน
 *
 * วิธีใช้: node setup-content.js
 */

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const RULES_TITLE = '📜 กฎระเบียบเซิร์ฟเวอร์ — วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่';
const GUIDE_TITLE = '📖 คู่มือการใช้งานเซิร์ฟเวอร์';
const ROLE_TITLE = '🎫 ยืนยันตัวตนนักเรียน';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function findChannel(guild, categoryName, channelName) {
  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === categoryName
  );
  if (!category) return null;
  return guild.channels.cache.find((c) => c.parentId === category.id && c.name === channelName) || null;
}

async function findExisting(channel, title) {
  const messages = await channel.messages.fetch({ limit: 20 });
  return messages.find((m) => m.embeds[0]?.title === title) || null;
}

async function upsert(channel, title, payload, label) {
  if (!channel) {
    console.warn(`ไม่พบห้องสำหรับ "${label}" — ข้าม`);
    return;
  }
  const existing = await findExisting(channel, title);
  if (existing) {
    // ต้องระบุ attachments: [] ชัดเจน ไม่งั้น Discord จะเก็บไฟล์แนบ (เช่นภาพเก่า) ไว้ตามเดิม
    await existing.edit({ ...payload, attachments: [] });
    console.log(`แก้ไข "${label}" ให้เป็นเนื้อหาล่าสุดแล้ว`);
  } else {
    await channel.send(payload);
    console.log(`โพสต์ "${label}" ใหม่แล้ว`);
  }
}

function buildRulesPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(RULES_TITLE)
    .setDescription('อ่านให้ครบก่อนใช้งานเซิร์ฟเวอร์นะครับ การอยู่ในเซิร์ฟเวอร์นี้ถือว่ายอมรับกฎทุกข้อ')
    .addFields(
      {
        name: '1️⃣ ให้เกียรติซึ่งกันและกัน',
        value: 'ห้ามด่าทอ เหยียดเชื้อชาติ/ศาสนา/เพศ/รูปร่างหน้าตา หรือคุกคามผู้อื่นไม่ว่ากรณีใด',
      },
      {
        name: '2️⃣ ห้ามสแปม/โฆษณา',
        value: 'ห้ามส่งข้อความซ้ำๆ รัว ๆ ห้ามโฆษณาขายของหรือแชร์ลิงก์เชิญเซิร์ฟเวอร์อื่นโดยไม่ได้รับอนุญาต',
      },
      {
        name: '3️⃣ ห้ามเนื้อหาไม่เหมาะสม',
        value: 'ภาพ/ข้อความ 18+ ความรุนแรง ยาเสพติด การพนัน ห้ามโดยเด็ดขาดทุกกรณี',
      },
      {
        name: '4️⃣ ใช้ห้องให้ตรงวัตถุประสงค์',
        value: 'เช่น ถามการบ้านในห้อง #ถาม-การบ้าน พูดคุยเล่นในห้อง #พูดคุยทั่วไป ไม่ใช่ในห้องประกาศ',
      },
      {
        name: '5️⃣ ต้องยืนยันตัวตนก่อนใช้งานห้องภายใน',
        value:
          'นักเรียนทุกคนต้องกดปุ่ม "✅ ยืนยันตัวตนนักเรียน" ในห้อง #รับยศเข้าใช้งาน เพื่อรับ role ประจำสาขา ' +
          'ถึงจะเห็นห้องพูดคุย/วิชาการ/สาขาของตัวเองได้',
      },
      { name: '6️⃣ ห้ามแอบอ้างเป็นผู้อื่น', value: 'การกรอกข้อมูลเท็จตอนยืนยันตัวตนถือเป็นความผิดร้ายแรง' },
      {
        name: '7️⃣ ใช้ AI อย่างมีความรับผิดชอบ',
        value: 'ห้ามใช้คำสั่ง/ปุ่มถาม AI สร้างเนื้อหาที่ผิดกฎหมาย ไม่เหมาะสม หรือละเมิดสิทธิ์ผู้อื่น',
      },
      { name: '8️⃣ เชื่อฟังแอดมิน/ผู้ดูแล', value: 'การตัดสินของทีมงานถือเป็นที่สิ้นสุด' },
      {
        name: '⚖️ บทลงโทษ',
        value: 'ตักเตือน → ปิดเสียงชั่วคราว (Timeout) → ระงับสิทธิ์บางห้อง → เชิญออกจากเซิร์ฟเวอร์ ตามความรุนแรง',
      },
      { name: '🛠 มีปัญหา/สงสัย', value: 'ติดต่อแอดมินได้ที่ห้อง #แจ้งปัญหา-ติดต่อแอดมิน' }
    )
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  return { embeds: [embed], files: [] };
}

function buildGuidePayload() {
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(GUIDE_TITLE)
    .setDescription('ทุกฟีเจอร์ใช้งานได้ด้วยการกดปุ่มด้านล่าง ไม่ต้องพิมพ์คำสั่งเองก็ได้')
    .addFields(
      {
        name: '🗂 โครงสร้างหมวดหมู่',
        value:
          '📌 ข้อมูลเซิร์ฟเวอร์ • 📢 ประกาศ-ข่าว • 🎓 รับสมัครเรียน (เปิดสาธารณะทั้งหมด)\n' +
          '💬 ทั่วไป • 📚 วิชาการ • 🎮 เกม-กีฬา • 🛋 ผ่อนคลาย • 🛠 ช่วยเหลือ • 🎉 กิจกรรมวิทยาลัย (เฉพาะนักเรียนที่ยืนยันตัวตนแล้ว)\n' +
          '🏫 [สาขา] (เฉพาะนักเรียนสาขานั้นๆ)',
      },
      {
        name: '✅ เริ่มต้นใช้งาน',
        value: 'กดปุ่ม "ยืนยันตัวตนนักเรียน" กรอกเลขประจำตัวนักเรียน + ชื่อ-นามสกุล ระบบจะให้ role สาขาให้ทันที',
      },
      { name: '🤖 ถามคำถามเกี่ยวกับวิทยาลัย', value: 'กดปุ่ม "ถาม AI" ถามได้ตลอด 24 ชม. ตอบเฉพาะคุณเห็นคนเดียว' },
      { name: '⌨️ ถนัดพิมพ์มากกว่า?', value: 'ใช้คำสั่ง /verify /ask ได้เหมือนเดิม' }
    )
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('openVerify').setLabel('✅ ยืนยันตัวตนนักเรียน').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('openAsk').setLabel('🤖 ถาม AI').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], files: [], components: [row] };
}

function buildRoleSelectPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(ROLE_TITLE)
    .setDescription(
      '⚠️ **ต้องยืนยันตัวตนก่อน จึงจะปลดล็อกห้องภายในทั้งหมดได้** (ทั่วไป/วิชาการ/เกม-กีฬา/ผ่อนคลาย/ช่วยเหลือ/กิจกรรมวิทยาลัย/ห้องสาขา)\n' +
        'ถ้ายังไม่ยืนยัน จะเห็นแค่หมวดประกาศ-ข่าว/รับสมัครเรียนเท่านั้น\n\n' +
        'กดปุ่มด้านล่าง กรอกเลขประจำตัวนักเรียน + ชื่อ-นามสกุลตามที่ลงทะเบียนไว้กับวิทยาลัย\n' +
        'ระบบจะตั้งชื่อเล่นเป็นชื่อจริงของคุณ และมอบยศประจำสาขาให้ทันที ทำให้เห็นห้องพูดคุย/วิชาการ/สาขาตัวเอง'
    )
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('openVerify').setLabel('✅ ยืนยันตัวตนนักเรียน').setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

// ห้อง กฎ-ระเบียบ/คู่มือ เป็น read-only (@everyone ส่งข้อความไม่ได้) ต้องเปิดสิทธิ์ส่งข้อความให้บอทเองก่อน
// (ใช้แพทเทิร์นเดียวกับ setup-roles.js กัน bot ถูกล็อกสิทธิ์ตัวเอง)
async function ensureBotCanPost(channel, botRoleId) {
  if (!channel) return;
  try {
    await channel.permissionOverwrites.edit(botRoleId, {
      ViewChannel: true,
      SendMessages: true,
    });
  } catch (err) {
    console.warn(`  ตั้งสิทธิ์ส่งข้อความให้บอทในห้อง "${channel.name}" ไม่สำเร็จ: ${err.message}`);
  }
}

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;

  const rulesChannel = findChannel(guild, '📌 ข้อมูลเซิร์ฟเวอร์', 'กฎ-ระเบียบ');
  const guideChannel = findChannel(guild, '📌 ข้อมูลเซิร์ฟเวอร์', 'คู่มือการใช้งานเซิร์ฟเวอร์');
  const roleChannel = findChannel(guild, '📌 ข้อมูลเซิร์ฟเวอร์', 'รับยศเข้าใช้งาน');

  if (botRole) {
    await ensureBotCanPost(rulesChannel, botRole.id);
    await ensureBotCanPost(guideChannel, botRole.id);
    await ensureBotCanPost(roleChannel, botRole.id);
  }

  await upsert(rulesChannel, RULES_TITLE, buildRulesPayload(), 'กฎระเบียบ');
  await upsert(guideChannel, GUIDE_TITLE, buildGuidePayload(), 'คู่มือการใช้งาน');
  await upsert(roleChannel, ROLE_TITLE, buildRoleSelectPayload(), 'ปุ่มยืนยันตัวตน');

  console.log('เสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
