/**
 * setup-alumni.js
 * ตั้งค่าระบบศิษย์เก่า:
 *   1. สร้าง role "ศิษย์เก่า" (สิทธิ์ปกติ ไม่มีสิทธิ์พิเศษ)
 *   2. สร้างห้อง #ศิษย์เก่า (ห้องพูดคุยของศิษย์เก่า เห็นเฉพาะศิษย์เก่า + ครู)
 *   3. สร้างห้อง #ข้อมูลศิษย์เก่า (เก็บข้อมูลส่วนตัวที่กรอก เห็นเฉพาะแอดมิน)
 *   4. โพสต์ปุ่ม "🎓 ลงทะเบียนศิษย์เก่า" ในห้อง #รับยศเข้าใช้งาน
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-alumni.js
 */

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
require('dotenv').config();
const { ALUMNI_ROLE_NAME, ALUMNI_LOUNGE_CHANNEL, ALUMNI_DATA_CHANNEL } = require('./alumni');
const { TEACHER_ROLE_NAME } = require('./teachers');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const ALUMNI_POST_TITLE = '🎓 ลงทะเบียนศิษย์เก่า';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  const everyoneRole = guild.roles.everyone;

  // 1) role ศิษย์เก่า — สิทธิ์ปกติ ไม่ให้สิทธิ์พิเศษใดๆ
  let alumniRole = guild.roles.cache.find((r) => r.name === ALUMNI_ROLE_NAME);
  if (!alumniRole) {
    alumniRole = await guild.roles.create({ name: ALUMNI_ROLE_NAME, hoist: true, mentionable: false, color: 0x14b8a6 });
    console.log(`สร้าง role: ${ALUMNI_ROLE_NAME}`);
  } else {
    console.log(`role มีอยู่แล้ว: ${ALUMNI_ROLE_NAME}`);
  }

  const teacherRole = guild.roles.cache.find((r) => r.name === TEACHER_ROLE_NAME);
  const infoCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === '📌 ข้อมูลเซิร์ฟเวอร์'
  );

  // 2) ห้อง #ศิษย์เก่า — เห็นเฉพาะศิษย์เก่า + ครู (พื้นที่เครือข่ายศิษย์เก่า)
  let lounge = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === ALUMNI_LOUNGE_CHANNEL);
  if (!lounge) {
    const overwrites = [
      { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: alumniRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ];
    if (teacherRole) overwrites.push({ id: teacherRole.id, allow: [PermissionFlagsBits.ViewChannel] });
    lounge = await guild.channels.create({
      name: ALUMNI_LOUNGE_CHANNEL,
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : undefined,
      permissionOverwrites: overwrites,
    });
    console.log(`สร้างห้อง #${ALUMNI_LOUNGE_CHANNEL} แล้ว (เห็นเฉพาะศิษย์เก่า + ครู)`);
  } else {
    console.log(`ห้อง #${ALUMNI_LOUNGE_CHANNEL} มีอยู่แล้ว`);
  }

  // 3) ห้อง #ข้อมูลศิษย์เก่า — เก็บข้อมูลส่วนตัว เห็นเฉพาะแอดมิน (@everyone มองไม่เห็น, ไม่ให้แม้แต่ครู)
  let dataChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === ALUMNI_DATA_CHANNEL);
  if (!dataChannel) {
    dataChannel = await guild.channels.create({
      name: ALUMNI_DATA_CHANNEL,
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : undefined,
      topic: 'ข้อมูลส่วนตัวศิษย์เก่า — ลับเฉพาะแอดมิน ห้ามเปิดเผยต่อบุคคลอื่น (PDPA)',
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log(`สร้างห้อง #${ALUMNI_DATA_CHANNEL} แล้ว (ลับเฉพาะแอดมิน)`);
  } else {
    console.log(`ห้อง #${ALUMNI_DATA_CHANNEL} มีอยู่แล้ว`);
    await dataChannel.permissionOverwrites.edit(botRole.id, { ViewChannel: true, SendMessages: true });
  }

  // 4) ปุ่มลงทะเบียนศิษย์เก่าในห้อง #รับยศเข้าใช้งาน
  const roleChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'รับยศเข้าใช้งาน');
  if (roleChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x14b8a6)
      .setTitle(ALUMNI_POST_TITLE)
      .setDescription(
        'จบจากวิทยาลัยเทคโนโลยีไฮเทค หนองไผ่ ไปแล้วใช่ไหม? มาลงทะเบียนเป็นศิษย์เก่ากันครับ! 🎉\n\n' +
          'กดปุ่มด้านล่าง กรอกข้อมูลเพื่อรับยศ **ศิษย์เก่า** และเข้าห้องเครือข่ายศิษย์เก่าได้ทันที\n\n' +
          '🔒 **ความเป็นส่วนตัว:** ข้อมูลที่กรอก (รวมเบอร์/อีเมล) จะถูกเก็บไว้อย่างปลอดภัย ' +
          'เห็นเฉพาะผู้ดูแลของวิทยาลัยเท่านั้น ไม่เปิดเผยต่อสมาชิกคนอื่น และใช้เพื่อการติดต่อ/สถิติศิษย์เก่าเท่านั้น'
      )
      .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('openAlumniRegister').setLabel('🎓 ลงทะเบียนศิษย์เก่า').setStyle(ButtonStyle.Primary)
    );

    const messages = await roleChannel.messages.fetch({ limit: 25 });
    const existing = messages.find((m) => m.embeds[0]?.title === ALUMNI_POST_TITLE);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
      console.log('แก้ไขโพสต์ลงทะเบียนศิษย์เก่าให้เป็นเนื้อหาล่าสุดแล้ว');
    } else {
      await roleChannel.send({ embeds: [embed], components: [row] });
      console.log('โพสต์ปุ่มลงทะเบียนศิษย์เก่าในห้อง #รับยศเข้าใช้งาน แล้ว');
    }
  } else {
    console.warn('ไม่พบห้อง #รับยศเข้าใช้งาน — ข้ามการโพสต์ปุ่ม');
  }

  console.log('ตั้งค่าระบบศิษย์เก่าเสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
