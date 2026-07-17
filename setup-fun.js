/**
 * setup-fun.js
 * ตั้งค่าระบบสนุกๆ:
 *   1. สร้าง role เลเวล (🌱 Lv.5 ... 👑 Lv.50) — hoisted โชว์ในรายชื่อสมาชิก
 *   2. สร้าง role เกมแต่ละเกม (🎮 Roblox, 🎮 FiveM ...)
 *   3. โพสต์แผงปุ่ม "เลือกเกมที่คุณเล่น" ในห้อง #รับยศเข้าใช้งาน
 *
 * idempotent — รันซ้ำได้ปลอดภัย
 * วิธีใช้: node setup-fun.js
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
const { LEVEL_ROLES } = require('./economy');
const { GAMES, GAME_PANEL_TITLE, roleName } = require('./game-roles');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function ensureRole(guild, name, options = {}) {
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await guild.roles.create({ name, mentionable: true, ...options });
    console.log(`  สร้าง role: ${name}`);
  }
  return role;
}

// ปุ่มเกม แบ่งเป็นแถวละ 5 (Discord จำกัด 5 ปุ่ม/แถว, 5 แถว/ข้อความ)
function buildGameRows() {
  const rows = [];
  for (let i = 0; i < GAMES.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const game of GAMES.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gameRole:${game.key}`)
          .setLabel(game.label)
          .setEmoji(game.emoji)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  return rows;
}

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();

  console.log('สร้าง role เลเวล:');
  for (const lr of LEVEL_ROLES) {
    await ensureRole(guild, lr.name, { hoist: true, mentionable: false });
  }

  console.log('สร้าง role เกม:');
  for (const game of GAMES) {
    await ensureRole(guild, roleName(game.label), { hoist: false });
  }

  const roleChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'รับยศเข้าใช้งาน');
  if (roleChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(GAME_PANEL_TITLE)
      .setDescription(
        'กดปุ่มเกมที่คุณเล่นด้านล่าง เพื่อรับ role เกมนั้น (กดอีกครั้งเพื่อเอาออก)\n' +
          'เมื่อได้ role แล้วจะหาเพื่อนเล่นเกมเดียวกันเจอง่ายขึ้น และแท็กหากันชวนเล่นได้ 🎮'
      )
      .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

    const rows = buildGameRows();
    const messages = await roleChannel.messages.fetch({ limit: 30 });
    const existing = messages.find((m) => m.embeds[0]?.title === GAME_PANEL_TITLE);
    if (existing) {
      await existing.edit({ embeds: [embed], components: rows });
      console.log('แก้ไขแผงเลือกเกมให้เป็นล่าสุดแล้ว');
    } else {
      await roleChannel.send({ embeds: [embed], components: rows });
      console.log('โพสต์แผงเลือกเกมในห้อง #รับยศเข้าใช้งาน แล้ว');
    }
  } else {
    console.warn('ไม่พบห้อง #รับยศเข้าใช้งาน — ข้ามการโพสต์แผงเกม');
  }

  console.log('ตั้งค่าระบบสนุกๆ เสร็จสมบูรณ์');
  process.exit(0);
});

client.login(BOT_TOKEN);
