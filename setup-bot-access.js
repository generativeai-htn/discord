/**
 * setup-bot-access.js
 * ให้สิทธิ์ ViewChannel + SendMessages แก่ role ของบอทเองในทุกห้องที่เป็น read-only
 * (deny SendMessages สำหรับ @everyone) ทั่วทั้งเซิร์ฟเวอร์ กันบอทถูกล็อกออกจากห้องประกาศต่างๆ
 * เวลาต้องโพสต์อัตโนมัติ (เช่น ประกาศกิจกรรม-ประกวดแข่งขัน, ประกาศทางการ)
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-bot-access.js
 */

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
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

  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
  let fixed = 0;

  for (const channel of textChannels.values()) {
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
    const isReadOnly = everyoneOverwrite?.deny.has(PermissionsBitField.Flags.SendMessages);
    if (!isReadOnly) continue;

    try {
      await channel.permissionOverwrites.edit(botRole.id, { ViewChannel: true, SendMessages: true });
      console.log(`  ให้สิทธิ์บอทในห้อง "${channel.name}" แล้ว`);
      fixed += 1;
    } catch (err) {
      console.warn(`  ตั้งสิทธิ์ห้อง "${channel.name}" ไม่สำเร็จ: ${err.message}`);
    }
  }

  console.log(`เสร็จสมบูรณ์ — ตั้งสิทธิ์ให้บอท ${fixed} ห้อง`);
  process.exit(0);
});

client.login(BOT_TOKEN);
