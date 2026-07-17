/**
 * setup-modlog.js
 * สร้างห้อง #mod-log (ถ้ายังไม่มี) สำหรับเก็บประวัติข้อความที่ถูกลบ/สมาชิกที่ถูกเตือน
 * โดยระบบตรวจข้อความผิดกฎอัตโนมัติ (moderation.js)
 *
 * ห้องนี้ถูกซ่อนจาก @everyone โดยตั้งใจ (เห็นเฉพาะเจ้าของ/แอดมินที่มีสิทธิ์ Administrator อยู่แล้วโดยอัตโนมัติ)
 * ถ้าต้องการให้ทีมงาน/ครูคนอื่นเห็นห้องนี้ด้วย ไปที่ตั้งค่าห้อง #mod-log → Permissions
 * แล้วเพิ่ม role/สมาชิกที่ต้องการเข้าไปเอง (สคริปต์นี้ไม่รู้ว่าใครคือทีมงานจริงในเซิร์ฟเวอร์)
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-modlog.js
 */

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
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
  await guild.channels.fetch();
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  const everyoneRole = guild.roles.everyone;

  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === '📌 ข้อมูลเซิร์ฟเวอร์'
  );

  let channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'mod-log');

  if (!channel) {
    channel = await guild.channels.create({
      name: 'mod-log',
      type: ChannelType.GuildText,
      parent: category ? category.id : undefined,
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('สร้างห้อง #mod-log แล้ว (ซ่อนจาก @everyone)');
  } else {
    console.log('ห้อง #mod-log มีอยู่แล้ว');
    await channel.permissionOverwrites.edit(botRole.id, {
      ViewChannel: true,
      SendMessages: true,
    });
  }

  console.log('เสร็จสมบูรณ์ — เจ้าของ/แอดมินเห็นห้องนี้อัตโนมัติ ถ้าต้องการให้ทีมงานคนอื่นเห็นด้วย ไปเพิ่มสิทธิ์เองที่ตั้งค่าห้อง');
  process.exit(0);
});

client.login(BOT_TOKEN);
