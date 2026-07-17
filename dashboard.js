/**
 * dashboard.js
 * เว็บแดชบอร์ดหลังบ้านสำหรับสั่งงานบอท — รันในโปรเซสเดียวกับ bot.js จึงเข้าถึง Discord client ตรงๆ
 * ครอบคลุม: ประกาศ/ส่งข้อความ, จัดการ role/สมาชิก, จัดแข่ง, ดูสถิติ
 *
 * ความปลอดภัย: ต้องตั้ง DASHBOARD_PASSWORD ใน .env ถึงจะเปิดแดชบอร์ด (ล็อกอินด้วยรหัสผ่าน)
 * ทุก API ต้องแนบ token ที่ได้จากการล็อกอิน — ไม่มี token = เข้าไม่ได้
 *
 * ⚠️ แดชบอร์ดนี้สั่งงานบอทได้เต็มที่ ควรตั้งรหัสผ่านที่แข็งแรง และถ้าเปิดออกอินเทอร์เน็ต
 *    ควรวางหลัง reverse proxy + HTTPS หรือจำกัดให้เข้าได้เฉพาะในวง LAN/VPN
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const announcements = require('./announcements');
const tournaments = require('./tournaments');
const economy = require('./economy');
const teachers = require('./teachers');
const { VERIFIED_ROLE_NAME } = require('./verified-role');
const { ALUMNI_ROLE_NAME } = require('./alumni');

const PORT = process.env.DASHBOARD_PORT || 3000;
const PASSWORD = process.env.DASHBOARD_PASSWORD;
const GUILD_ID = process.env.GUILD_ID;

function startDashboard(client) {
  if (!PASSWORD) {
    console.warn('⚠️ ไม่ได้ตั้ง DASHBOARD_PASSWORD ใน .env — ไม่เปิดแดชบอร์ด (เพื่อความปลอดภัย)');
    return;
  }

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const validTokens = new Set();
  const getGuild = () => client.guilds.fetch(GUILD_ID);

  // ---- ล็อกอิน ----
  app.post('/api/login', (req, res) => {
    if (req.body && req.body.password === PASSWORD) {
      const token = crypto.randomBytes(24).toString('hex');
      validTokens.add(token);
      res.json({ token });
    } else {
      res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }
  });

  // ---- ตรวจ token ทุก /api/* (ยกเว้น login ที่ผ่านไปแล้ว) ----
  app.use('/api', (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (validTokens.has(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  });

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error('dashboard API error:', err);
      res.status(500).json({ error: err.message });
    }
  };

  // ---- สถิติ/รายงาน ----
  app.get('/api/stats', wrap(async (req, res) => {
    const guild = await getGuild();
    await guild.members.fetch();
    const countRole = (name) => {
      const role = guild.roles.cache.find((r) => r.name === name);
      return role ? role.members.size : 0;
    };
    const top = economy.getLeaderboard(5).map((u) => {
      const m = guild.members.cache.get(u.userId);
      return { name: m ? m.displayName : u.userId, level: u.level, coins: u.coins };
    });
    const activeTournaments = tournaments.listTournaments().filter((t) => t.status !== 'completed').length;
    res.json({
      members: guild.memberCount,
      students: countRole(VERIFIED_ROLE_NAME),
      teachers: countRole(teachers.TEACHER_ROLE_NAME),
      alumni: countRole(ALUMNI_ROLE_NAME),
      top,
      activeTournaments,
      pendingAnnouncements: announcements.listPending().length,
    });
  }));

  // ---- รายชื่อห้อง (สำหรับ dropdown ประกาศ) ----
  app.get('/api/channels', wrap(async (req, res) => {
    const guild = await getGuild();
    await guild.channels.fetch();
    const channels = guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    res.json(channels);
  }));

  // ---- รายชื่อ role (สำหรับ dropdown จัดการสมาชิก) ----
  app.get('/api/roles', wrap(async (req, res) => {
    const guild = await getGuild();
    const roles = guild.roles.cache
      .filter((r) => r.name !== '@everyone' && !r.managed)
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    res.json(roles);
  }));

  // ---- ค้นหาสมาชิก ----
  app.get('/api/members', wrap(async (req, res) => {
    const guild = await getGuild();
    await guild.members.fetch();
    const q = (req.query.q || '').toString().toLowerCase();
    const members = guild.members.cache
      .filter((m) => !m.user.bot)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.user.tag.toLowerCase().includes(q))
      .map((m) => ({
        id: m.id,
        name: m.displayName,
        tag: m.user.tag,
        roles: m.roles.cache.filter((r) => r.name !== '@everyone').map((r) => ({ id: r.id, name: r.name })),
      }))
      .slice(0, 50);
    res.json(members);
  }));

  // ---- เพิ่ม/ถอด role ให้สมาชิก ----
  app.post('/api/members/:id/roles', wrap(async (req, res) => {
    const guild = await getGuild();
    const member = await guild.members.fetch(req.params.id);
    const { roleId, action } = req.body;
    const role = guild.roles.cache.get(roleId);
    if (!role) return res.status(404).json({ error: 'ไม่พบ role' });
    if (action === 'add') await member.roles.add(role);
    else await member.roles.remove(role);
    res.json({ ok: true });
  }));

  // ---- ประกาศ: ส่งทันที หรือ ตั้งเวลา ----
  app.post('/api/announce', wrap(async (req, res) => {
    const guild = await getGuild();
    const { channelId, message, scheduleAt } = req.body;
    if (!channelId || !message) return res.status(400).json({ error: 'ต้องระบุห้องและข้อความ' });
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));

    if (scheduleAt) {
      const when = new Date(scheduleAt);
      if (Number.isNaN(when.getTime()) || when <= new Date()) {
        return res.status(400).json({ error: 'เวลาไม่ถูกต้องหรืออยู่ในอดีต' });
      }
      const item = announcements.addAnnouncement({
        channelId,
        channelName: channel.name,
        text: message,
        scheduledAt: when.toISOString(),
        createdBy: 'dashboard',
      });
      return res.json({ ok: true, scheduled: true, id: item.id });
    }

    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle('📢 ประกาศ')
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });
    await channel.send({ embeds: [embed] });
    res.json({ ok: true, scheduled: false });
  }));

  app.get('/api/announcements', wrap(async (req, res) => {
    res.json(announcements.listPending());
  }));

  app.delete('/api/announcements/:id', wrap(async (req, res) => {
    announcements.cancelAnnouncement(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---- จัดแข่ง ----
  app.get('/api/tournaments', wrap(async (req, res) => {
    res.json(
      tournaments.listTournaments().map((t) => ({
        name: t.name,
        type: t.type,
        status: t.status,
        participants: t.participants.length,
      }))
    );
  }));

  app.post('/api/tournaments', wrap(async (req, res) => {
    const guild = await getGuild();
    const { name, type, teamSize, channelId } = req.body;
    if (!name || !channelId) return res.status(400).json({ error: 'ต้องระบุชื่อและห้อง' });
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));
    const t = tournaments.createTournament({ name, type: type || 'team', teamSize: teamSize || null, channelId, createdBy: 'dashboard' });

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`🏆 เปิดรับสมัคร: ${t.name}`)
      .setDescription(
        `ประเภท: ${t.type === 'team' ? `แข่งแบบทีม${t.teamSize ? ` (ทีมละ ${t.teamSize} คน)` : ''}` : 'แข่งแบบรายบุคคล'}\n` +
          'กดปุ่มด้านล่างเพื่อสมัครเข้าร่วม'
      )
      .addFields({ name: 'ผู้สมัครแล้ว (0)', value: 'ยังไม่มีผู้สมัคร' })
      .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tournamentRegister:${t.name}`).setLabel('📝 สมัครเข้าร่วม').setStyle(ButtonStyle.Success)
    );
    const msg = await channel.send({ embeds: [embed], components: [row] });
    tournaments.setRegistrationMessage(name, msg.id);
    res.json({ ok: true });
  }));

  app.post('/api/tournaments/:name/:cmd', wrap(async (req, res) => {
    const { name, cmd } = req.params;
    if (cmd === 'close') tournaments.closeRegistration(name);
    else if (cmd === 'open') tournaments.openRegistration(name);
    else if (cmd === 'bracket') {
      const t = tournaments.generateBracket(name);
      const guild = await getGuild();
      const channel = guild.channels.cache.get(t.channelId) || (await guild.channels.fetch(t.channelId));
      const embed = new EmbedBuilder()
        .setColor(0xf97316)
        .setTitle(`🏆 สายการแข่งขัน: ${t.name}`)
        .setDescription('อัปเดตผลผ่านคำสั่ง /tournament-result ใน Discord')
        .addFields(tournaments.formatBracketFields(t))
        .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });
      const msg = await channel.send({ embeds: [embed] });
      tournaments.setBracketMessage(name, msg.id);
    } else {
      return res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' });
    }
    res.json({ ok: true });
  }));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🖥️  แดชบอร์ดหลังบ้านเปิดที่ http://localhost:${PORT} (ล็อกอินด้วย DASHBOARD_PASSWORD)`);
  });
}

module.exports = { startDashboard };
