/**
 * setup-welcome.js
 * สร้างห้อง #ยินดีต้อนรับ (read-only, บนสุดของหมวด 📌 ข้อมูลเซิร์ฟเวอร์)
 * แล้วโพสต์ป้ายต้อนรับธีม pixel art พร้อมปุ่มลัด "ยืนยันตัวตน" และ "ถาม AI"
 *
 * ต้องรัน gen-banners.js ก่อนเพื่อให้มีไฟล์ assets/welcome.jpg (ถ้าไม่มีจะโพสต์แบบไม่มีภาพ)
 * idempotent แบบ upsert — รันซ้ำได้ แก้โพสต์เดิมให้ตรงกับเนื้อหาล่าสุดเสมอ
 *
 * วิธีใช้: node setup-welcome.js
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const WELCOME_TITLE = '🏫 ยินดีต้อนรับสู่ วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่!';

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

  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === 'ยินดีต้อนรับ'
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: 'ยินดีต้อนรับ',
      type: ChannelType.GuildText,
      parent: category ? category.id : undefined,
      position: 0,
      permissionOverwrites: [
        { id: everyoneRole.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
        { id: botRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    console.log('สร้างห้อง #ยินดีต้อนรับ แล้ว');
  } else {
    console.log('ห้อง #ยินดีต้อนรับ มีอยู่แล้ว');
    await channel.permissionOverwrites.edit(botRole.id, { ViewChannel: true, SendMessages: true });
  }

  // อ้างอิงห้องกฎด้วย channel mention จริง (ต้องใช้ id ถึงจะคลิกได้)
  const rulesChannel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === 'กฎ-ระเบียบ'
  );
  const rulesRef = rulesChannel ? `<#${rulesChannel.id}>` : '#กฎ-ระเบียบ';

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(WELCOME_TITLE)
    .setDescription(
      '```\n╔════════════════════════════╗\n║  ไฮเทคล้ำ คุณธรรมเด่น เน้นวิชาการ  ║\n╚════════════════════════════╝\n```\n' +
        '### 🎮 เริ่มต้นการผจญภัยของคุณ 3 ขั้นตอน:\n\n' +
        `> 🗺️ **STEP 1** — อ่านกฎที่ห้อง ${rulesRef} ให้ครบ\n` +
        '> 🎫 **STEP 2** — กดปุ่ม **✅ ยืนยันตัวตนนักเรียน** ด้านล่าง กรอกเลขนักเรียน + ชื่อจริง\n' +
        '> 🏆 **STEP 3** — ปลดล็อกห้องพูดคุย ห้องสาขา เกม-กีฬา และกิจกรรมทั้งหมด!\n\n' +
        '💬 มีคำถาม? กดปุ่ม **🤖 ถาม AI** ได้ตลอด 24 ชม. หรือทักแอดมินที่ห้องช่วยเหลือ\n' +
        '👀 บุคคลภายนอก/ผู้สนใจสมัครเรียน ดูข้อมูลได้ที่หมวด **🎓 รับสมัครเรียน** เลย'
    )
    .setFooter({ text: '⚡ Powered by htn_bot • วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('openVerify').setLabel('✅ ยืนยันตัวตนนักเรียน').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('openAsk').setLabel('🤖 ถาม AI').setStyle(ButtonStyle.Primary)
  );

  const payload = { embeds: [embed], components: [row], files: [] };

  const messages = await channel.messages.fetch({ limit: 20 });
  const existing = messages.find((m) => m.embeds[0]?.title === WELCOME_TITLE);
  if (existing) {
    await existing.edit({ ...payload, attachments: [] });
    console.log('แก้ไขป้ายต้อนรับให้เป็นเนื้อหาล่าสุดแล้ว');
  } else {
    await channel.send(payload);
    console.log('โพสต์ป้ายต้อนรับแล้ว');
  }

  console.log('เสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
