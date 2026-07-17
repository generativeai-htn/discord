/**
 * setup-server.js
 * สคริปต์สร้าง/อัปเดตโครงสร้างหมวดหมู่และห้อง (channels) ในเซิร์ฟเวอร์ Discord
 * ของวิทยาลัยโดยอัตโนมัติ ครอบคลุม: ข้อมูลเซิร์ฟเวอร์, ประกาศ, รับสมัครเรียน,
 * กิจกรรม, ทั่วไป, วิชาการ, แยกตามสาขา, เกม-กีฬา, ผ่อนคลาย, ช่วยเหลือ
 *
 * *** แก้ไขตัวแปร BRANCHES ด้านล่างให้ตรงกับสาขาวิชาจริงของวิทยาลัยก่อนรัน ***
 *
 * วิธีใช้:
 * 1. ติดตั้ง dependency: npm install discord.js dotenv
 * 2. สร้างไฟล์ .env แล้วใส่ BOT_TOKEN และ GUILD_ID
 * 3. เชิญบอทเข้าเซิร์ฟเวอร์ พร้อมสิทธิ์ "Manage Channels"
 * 4. รันคำสั่ง: node setup-server.js
 *
 * สคริปต์นี้เป็น idempotent — รันซ้ำได้ปลอดภัย จะข้ามหมวดหมู่/ห้องที่มีอยู่แล้ว
 * เหมาะกับตอนที่ต้องเพิ่มสาขาใหม่ในภายหลัง แค่เพิ่มชื่อใน BRANCHES แล้วรันใหม่
 */

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

// ===== แก้ไขรายชื่อสาขาวิชาตรงนี้ =====
const BRANCHES = [
  'คอมพิวเตอร์ธุรกิจ',
  'ช่างยนต์',
  'ช่างไฟฟ้า',
  'บัญชี',
  'การตลาด',
  // เพิ่ม/แก้ไขสาขาได้ตามจริง
];
// =======================================

// โครงสร้างหลัก (ไม่รวมหมวด "แยกตามสาขา" ซึ่งจะสร้างจาก BRANCHES ด้านล่าง)
const BASE_STRUCTURE = [
  {
    category: '📌 ข้อมูลเซิร์ฟเวอร์',
    channels: [
      { name: 'กฎ-ระเบียบ', readOnly: true },
      { name: 'คู่มือการใช้งานเซิร์ฟเวอร์', readOnly: true },
      { name: 'เลือกบทบาท' },
    ],
  },
  {
    category: '📢 ประกาศ-ข่าวประชาสัมพันธ์',
    channels: [
      { name: 'ประกาศทางการ', readOnly: true },
      { name: 'ข่าวประชาสัมพันธ์', readOnly: true },
      { name: 'ตาราง-สอบ-ตารางเรียน', readOnly: true },
      { name: 'ฟังประกาศ-ประชุมใหญ่', voice: true },
    ],
  },
  {
    category: '🎓 รับสมัครเรียน',
    channels: [
      { name: 'ข่าวรับสมัคร-กำหนดการ', readOnly: true },
      { name: 'คุณสมบัติ-ขั้นตอนสมัคร', readOnly: true },
      { name: 'ถาม-ตอบรับสมัคร' },
      { name: 'สอบถามรับสมัคร', voice: true },
    ],
  },
  {
    category: '🎉 กิจกรรมวิทยาลัย',
    channels: [
      { name: 'ประกาศกิจกรรม-ประกวดแข่งขัน', readOnly: true },
      { name: 'งานอาสา-ชมรม' },
      { name: 'นัดรวมกิจกรรม', voice: true },
    ],
  },
  {
    category: '💬 ทั่วไป',
    channels: [
      { name: 'แนะนำตัว' },
      { name: 'พูดคุยทั่วไป' },
      { name: 'ถาม-ตอบทั่วไป' },
      { name: 'พูดคุยทั่วไป', voice: true },
    ],
  },
  {
    category: '📚 วิชาการ',
    channels: [
      { name: 'ถาม-การบ้าน' },
      { name: 'แนะแนว-ทุนการศึกษา' },
      { name: 'ข่าวสารวิชาการ' },
      { name: 'ห้องติวรวม', voice: true },
    ],
  },
  {
    category: '🎮 เกม-กีฬา',
    channels: [
      { name: 'คุยเกม' },
      { name: 'คุยกีฬา-แข่งขันกีฬา' },
      { name: 'ปาร์ตี้เกม', voice: true },
      { name: 'คุยกีฬา', voice: true },
    ],
  },
  {
    category: '🛋 ผ่อนคลาย',
    channels: [
      { name: 'มีม-รูปตลก' },
      { name: 'แชร์เพลง' },
      { name: 'Chill นั่งคุยเล่น', voice: true },
    ],
  },
  {
    category: '🛠 ช่วยเหลือ',
    channels: [
      { name: 'แจ้งปัญหา-ติดต่อแอดมิน' },
    ],
  },
];

// สร้างหมวดหมู่ "🏫 [ชื่อสาขา]" ให้แต่ละสาขาโดยอัตโนมัติ จาก BRANCHES
// แต่ละสาขาจะได้ห้องแชท 1 ห้อง และห้องเสียง 1 ห้อง
const BRANCH_STRUCTURE = BRANCHES.map((branch) => ({
  category: `🏫 ${branch}`,
  channels: [
    { name: 'ห้องแชท' },
    { name: 'ห้องเสียง', voice: true },
  ],
}));

const SERVER_STRUCTURE = [...BASE_STRUCTURE, ...BRANCH_STRUCTURE];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const everyoneRole = guild.roles.everyone;

  for (const group of SERVER_STRUCTURE) {
    // สร้างหมวดหมู่ (category) — ถ้ามีอยู่แล้วจะใช้ตัวเดิม ไม่สร้างซ้ำ
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === group.category
    );

    if (!category) {
      category = await guild.channels.create({
        name: group.category,
        type: ChannelType.GuildCategory,
      });
      console.log(`สร้างหมวดหมู่: ${group.category}`);
    } else {
      console.log(`หมวดหมู่มีอยู่แล้ว: ${group.category}`);
    }

    // สร้างห้องภายในหมวดหมู่ — ข้ามถ้ามีชื่อซ้ำอยู่แล้วในหมวดเดียวกัน
    for (const ch of group.channels) {
      const targetType = ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText;
      const exists = guild.channels.cache.find(
        (c) =>
          c.parentId === category.id &&
          c.type === targetType &&
          c.name === toChannelName(ch.name, ch.voice)
      );
      if (exists) {
        console.log(`  - ห้องมีอยู่แล้ว: ${ch.name}`);
        continue;
      }

      const permissionOverwrites = ch.readOnly
        ? [
            {
              id: everyoneRole.id,
              deny: [PermissionFlagsBits.SendMessages],
              allow: [PermissionFlagsBits.ViewChannel],
            },
          ]
        : [];

      await guild.channels.create({
        name: ch.name,
        type: targetType,
        parent: category.id,
        permissionOverwrites,
      });

      console.log(`  + สร้างห้อง: ${ch.name}${ch.readOnly ? ' (อ่านอย่างเดียว)' : ''}${ch.voice ? ' (ห้องเสียง)' : ''}`);
    }
  }

  console.log('สร้าง/อัปเดตโครงสร้างเซิร์ฟเวอร์เสร็จสมบูรณ์');
  process.exit(0);
});

// ห้องข้อความ Discord จะแปลงชื่อเป็นตัวพิมพ์เล็กและแทนที่ช่องว่างด้วยขีดกลางโดยอัตโนมัติ
// ห้องเสียงไม่ถูกแปลง จึงเทียบชื่อตรงๆ
function toChannelName(name, isVoice) {
  return isVoice ? name : name.toLowerCase().replace(/\s+/g, '-');
}

client.login(BOT_TOKEN);
