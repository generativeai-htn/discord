/**
 * setup-teachers.js
 * ตั้งค่าระบบครู:
 *   1. สร้าง role "คุณครู" (สิทธิ์: จัดการข้อความ + Timeout สมาชิก)
 *   2. ให้ role ครูมองเห็นห้องทุกสาขา (🏫) และห้องภายในทั้งหมด
 *   3. สร้างห้อง #ห้องพักครู (เห็นเฉพาะครู + ผู้บริหาร/แอดมิน)
 *   4. โพสต์ปุ่ม "🍎 ยืนยันตัวตนครู" ในห้อง #รับยศเข้าใช้งาน
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-teachers.js
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
const BRANCHES = require('./branches');
const { TEACHER_ROLE_NAME } = require('./teachers');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const TEACHER_POST_TITLE = '🍎 ยืนยันตัวตนสำหรับคุณครู/บุคลากร';
const INTERNAL_CATEGORIES = ['💬 ทั่วไป', '📚 วิชาการ', '🎮 เกม-กีฬา', '🛋 ผ่อนคลาย', '🛠 ช่วยเหลือ', '🎉 กิจกรรมวิทยาลัย'];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  const everyoneRole = guild.roles.everyone;

  // 1) role คุณครู — จัดการข้อความ + Timeout สมาชิก ช่วยงานดูแลความเรียบร้อย
  let teacherRole = guild.roles.cache.find((r) => r.name === TEACHER_ROLE_NAME);
  if (!teacherRole) {
    teacherRole = await guild.roles.create({
      name: TEACHER_ROLE_NAME,
      hoist: true,
      mentionable: false,
      color: 0xef4444,
      permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers],
    });
    console.log(`สร้าง role: ${TEACHER_ROLE_NAME}`);
  } else {
    await teacherRole.setPermissions([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers]);
    console.log(`role มีอยู่แล้ว: ${TEACHER_ROLE_NAME} (อัปเดตสิทธิ์ให้ตรงล่าสุด)`);
  }

  // 2) ครูมองเห็นห้องทุกสาขา + ห้องภายในทั้งหมด
  const categoriesToOpen = [
    ...BRANCHES.map((b) => `🏫 ${b}`),
    ...INTERNAL_CATEGORIES,
  ];
  for (const categoryName of categoriesToOpen) {
    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName
    );
    if (!category) {
      console.warn(`  ไม่พบหมวดหมู่ "${categoryName}" — ข้าม`);
      continue;
    }
    await category.permissionOverwrites.edit(teacherRole.id, { ViewChannel: true });
    // ห้องย่อยไม่สืบทอดสิทธิ์จากหมวดหมู่อัตโนมัติ (Discord/discord.js ไม่ทำแบบนั้น) ต้อง sync ลงห้องย่อยเสมอ
    // ไม่งั้นห้องย่อยที่มี @everyone: deny ViewChannel อยู่แล้ว (จาก setup-roles.js) จะบังครูไปด้วย
    const children = guild.channels.cache.filter((c) => c.parentId === category.id);
    for (const child of children.values()) {
      await child.lockPermissions().catch((err) => console.error(`    ✗ sync ห้อง "${child.name}" ไม่สำเร็จ: ${err.message}`));
    }
    console.log(`  เปิดหมวดหมู่ "${categoryName}" ให้ครูมองเห็นแล้ว (sync ห้องย่อย ${children.size} ห้อง)`);
  }

  // 3) ห้องพักครู — เห็นเฉพาะครู (แอดมิน/เจ้าของเห็นอัตโนมัติ)
  const infoCategory = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === '📌 ข้อมูลเซิร์ฟเวอร์'
  );
  let loungeChannel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === 'ห้องพักครู'
  );
  if (!loungeChannel) {
    loungeChannel = await guild.channels.create({
      name: 'ห้องพักครู',
      type: ChannelType.GuildText,
      parent: infoCategory ? infoCategory.id : undefined,
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: teacherRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('สร้างห้อง #ห้องพักครู แล้ว (เห็นเฉพาะครู)');
  } else {
    console.log('ห้อง #ห้องพักครู มีอยู่แล้ว');
  }

  // 4) ปุ่มยืนยันตัวตนครูในห้อง #รับยศเข้าใช้งาน
  const roleChannel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === 'รับยศเข้าใช้งาน'
  );
  if (roleChannel) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle(TEACHER_POST_TITLE)
      .setDescription(
        'กดปุ่มด้านล่าง กรอกชื่อ-นามสกุลตามทะเบียนวิทยาลัย\n' +
          'ระบบจะส่งคำขอให้ผู้ดูแลตรวจสอบและอนุมัติ เมื่ออนุมัติแล้วจะได้รับยศ **คุณครู** อัตโนมัติ\n' +
          '(มองเห็นห้องทุกสาขา, เข้าห้องพักครู, ช่วยดูแลความเรียบร้อย และใช้คำสั่งประกาศ/จัดแข่งขันได้)'
      )
      .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('openTeacherVerify').setLabel('🍎 ยืนยันตัวตนครู').setStyle(ButtonStyle.Danger)
    );

    const messages = await roleChannel.messages.fetch({ limit: 20 });
    const existing = messages.find((m) => m.embeds[0]?.title === TEACHER_POST_TITLE);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
      console.log('แก้ไขโพสต์ยืนยันตัวตนครูให้เป็นเนื้อหาล่าสุดแล้ว');
    } else {
      await roleChannel.send({ embeds: [embed], components: [row] });
      console.log('โพสต์ปุ่มยืนยันตัวตนครูในห้อง #รับยศเข้าใช้งาน แล้ว');
    }
  } else {
    console.warn('ไม่พบห้อง #รับยศเข้าใช้งาน — ข้ามการโพสต์ปุ่ม');
  }

  console.log('ตั้งค่าระบบครูเสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
