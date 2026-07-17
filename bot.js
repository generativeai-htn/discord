/**
 * bot.js
 * บอทที่รันค้างไว้ตลอด ให้บริการ 3 ฟีเจอร์ ทั้งแบบพิมพ์คำสั่ง (/verify /ask /image)
 * และแบบกดปุ่ม (ปุ่มที่โพสต์ไว้โดย setup-content.js เปิดฟอร์มป๊อปอัปให้กรอกแทนการพิมพ์คำสั่ง):
 *
 *   ยืนยันตัวตน — นักเรียนกรอกเลขประจำตัวนักเรียน + ชื่อ-นามสกุล บอทตรวจกับ รายชื่อนักศึกษา.xlsx
 *                 ถ้าตรงกัน: ตั้งชื่อเล่นเป็นชื่อจริง และให้ role ประจำสาขาตามหลักสูตร
 *   ถาม AI     — ถามตอบกับ AI (ผ่าน OpenRouter) เกี่ยวกับวิทยาลัย ตอบแบบ ephemeral เฉพาะผู้ถาม
 *
 * /image (เจนภาพด้วย Pollinations.ai) ยังใช้พิมพ์คำสั่งได้ตามเดิม จำกัดสิทธิ์เฉพาะคนมี "Manage Server"
 * แต่ไม่มีปุ่มให้กดแล้ว (เอาออกตามคำขอ เพื่อลดความซับซ้อนของ UI)
 *
 * นอกจากนี้ยังคอยตรวจทุกข้อความในเซิร์ฟเวอร์ (moderation.js) ลบข้อความผิดกฎ + เตือนสมาชิก + บันทึกลง #mod-log
 *
 * ก่อนใช้ต้องรัน setup-roles.js (สร้าง role), setup-content.js (โพสต์ปุ่ม/กฎ/คู่มือ)
 * และ setup-modlog.js (สร้างห้อง #mod-log) ก่อน และตั้งค่า OPENROUTER_API_KEY ใน .env สำหรับฟีเจอร์ AI
 *
 * *** ต้องเปิด "MESSAGE CONTENT INTENT" ที่ Discord Developer Portal → แท็บ Bot ก่อน
 * ไม่งั้นระบบตรวจข้อความผิดกฎจะอ่านเนื้อหาข้อความไม่ได้เลย ***
 *
 * วิธีใช้: node bot.js   (ปล่อยให้รันค้างไว้ตลอดเวลา)
 */

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
require('dotenv').config();
const { loadRoster } = require('./roster');
const { VERIFIED_ROLE_NAME } = require('./verified-role');
const { askAI } = require('./openrouter');
const { generateImage } = require('./pollinations');
const { moderateMessage } = require('./moderation');
const { moderateImage } = require('./image-moderation');
const { addWarning } = require('./warnings');
const tournaments = require('./tournaments');
const announcements = require('./announcements');
const teachers = require('./teachers');
const { ALUMNI_ROLE_NAME, ALUMNI_DATA_CHANNEL } = require('./alumni');
const rovTeams = require('./rov-teams');
const economy = require('./economy');
const quiz = require('./quiz');
const { GAMES, roleName: gameRoleName } = require('./game-roles');
const { startDashboard } = require('./dashboard');
const { runBackup } = require('./backup');
const customWords = require('./custom-words');

const BOT_TRAP_CHANNEL_NAME = 'ห้องดักบอท';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('กรุณาตั้งค่า BOT_TOKEN และ GUILD_ID ในไฟล์ .env ก่อนรันสคริปต์');
  process.exit(1);
}

let roster = loadRoster(); // let เพื่อให้ /reload-roster โหลดใหม่ได้โดยไม่ต้องรีสตาร์ท
console.log(`โหลดรายชื่อนักเรียนสำเร็จ: ${roster.size} คน`);

// ===== คำสั่งแบบพิมพ์ (/verify /ask /image) — ยังใช้งานได้คู่กับปุ่ม =====

const verifyCommand = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('ยืนยันตัวตนนักเรียนเพื่อรับ role ประจำสาขา')
  .addStringOption((opt) =>
    opt.setName('เลขประจำตัวนักเรียน').setDescription('เลขประจำตัวนักเรียนของคุณตามทะเบียนวิทยาลัย').setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('ชื่อ-นามสกุล')
      .setDescription('ชื่อ-นามสกุลจริงของคุณตามที่ลงทะเบียนไว้กับวิทยาลัย')
      .setRequired(true)
  );

const askCommand = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('ถามคำถามเกี่ยวกับวิทยาลัยกับ AI')
  .addStringOption((opt) =>
    opt.setName('คำถาม').setDescription('คำถามของคุณ เช่น สาขาบัญชีเรียนอะไรบ้าง').setRequired(true)
  );

const imageCommand = new SlashCommandBuilder()
  .setName('image')
  .setDescription('เจนภาพด้วย AI สำหรับทำโปสเตอร์/ตกแต่ง (เฉพาะแอดมิน/ทีมงานประชาสัมพันธ์)')
  .addStringOption((opt) =>
    opt
      .setName('รายละเอียดภาพ')
      .setDescription('อธิบายภาพที่ต้องการ เช่น โปสเตอร์กิจกรรมกีฬาสี ธีมสีฟ้า มีโลโก้วิทยาลัย')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ===== ระบบจัดการแข่งขัน (เกม/กีฬา) — คำสั่งสำหรับแอดมิน/ทีมงานเท่านั้น =====

// ห้องปลายทางให้เลือกตอนสร้างการแข่งขัน — ตรงกับหมวด 🎮 เกม-กีฬา เป็นหลัก
// เผื่อ "กิจกรรมทั่วไป" ไว้สำหรับกิจกรรมนอกเหนือเกม/กีฬา เช่น ประกวดร้องเพลง
const TOURNAMENT_CHANNEL_CHOICES = {
  เกม: 'คุยเกม',
  กีฬา: 'คุยกีฬา-แข่งขันกีฬา',
  กิจกรรมทั่วไป: 'ประกาศกิจกรรม-ประกวดแข่งขัน',
};

const tournamentCreateCommand = new SlashCommandBuilder()
  .setName('tournament-create')
  .setDescription('เปิดรับสมัครการแข่งขันใหม่ (เกม/กีฬา)')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน เช่น ROV ชิงแชมป์ HTN').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('ประเภท')
      .setDescription('แข่งแบบทีมหรือรายบุคคล')
      .setRequired(true)
      .addChoices({ name: 'ทีม', value: 'team' }, { name: 'รายบุคคล', value: 'individual' })
  )
  .addStringOption((opt) =>
    opt
      .setName('ห้อง')
      .setDescription('ห้องที่จะโพสต์ประกาศรับสมัคร')
      .setRequired(true)
      .addChoices(
        { name: 'เกม (#คุยเกม)', value: 'เกม' },
        { name: 'กีฬา (#คุยกีฬา-แข่งขันกีฬา)', value: 'กีฬา' },
        { name: 'กิจกรรมทั่วไป (#ประกาศกิจกรรม-ประกวดแข่งขัน)', value: 'กิจกรรมทั่วไป' }
      )
  )
  .addIntegerOption((opt) => opt.setName('ขนาดทีม').setDescription('จำนวนสมาชิกต่อทีม (ถ้าแข่งแบบทีม)').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentCloseCommand = new SlashCommandBuilder()
  .setName('tournament-close')
  .setDescription('ปิดรับสมัคร (ยังไม่จับสู่ ใช้ /tournament-bracket แยกต่างหาก)')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentOpenCommand = new SlashCommandBuilder()
  .setName('tournament-open')
  .setDescription('เปิดรับสมัครใหม่ (ใช้ตอนปิดเร็วไป เปิดคืนได้เฉพาะก่อนจับสู่)')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentBracketCommand = new SlashCommandBuilder()
  .setName('tournament-bracket')
  .setDescription('จับสู่สร้างสายการแข่งขัน (ต้องปิดรับสมัครก่อน)')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentResultCommand = new SlashCommandBuilder()
  .setName('tournament-result')
  .setDescription('บันทึกผลการแข่งขันของคู่ใดคู่หนึ่ง')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน').setRequired(true))
  .addIntegerOption((opt) => opt.setName('รอบ').setDescription('เลขรอบ เช่น 1').setRequired(true))
  .addIntegerOption((opt) => opt.setName('คู่ที่').setDescription('เลขคู่ในรอบนั้น เช่น 1').setRequired(true))
  .addStringOption((opt) => opt.setName('ผู้ชนะ').setDescription('ชื่อทีม/ผู้เล่นที่ชนะ (พิมพ์ให้ตรงกับที่สมัคร)').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentScheduleCommand = new SlashCommandBuilder()
  .setName('tournament-schedule')
  .setDescription('ตั้งเวลานัดแข่งของคู่ใดคู่หนึ่ง (บอทจะแจ้งเตือนอัตโนมัติเมื่อถึงเวลา)')
  .addStringOption((opt) => opt.setName('ชื่อ').setDescription('ชื่อการแข่งขัน').setRequired(true))
  .addIntegerOption((opt) => opt.setName('รอบ').setDescription('เลขรอบ เช่น 1').setRequired(true))
  .addIntegerOption((opt) => opt.setName('คู่ที่').setDescription('เลขคู่ในรอบนั้น เช่น 1').setRequired(true))
  .addStringOption((opt) =>
    opt.setName('เวลา').setDescription('รูปแบบ YYYY-MM-DD HH:mm เช่น 2026-08-15 09:00').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const tournamentListCommand = new SlashCommandBuilder()
  .setName('tournament-list')
  .setDescription('แสดงรายชื่อการแข่งขันทั้งหมดและสถานะ');

// ===== ระบบประกาศตามตาราง — คำสั่งสำหรับแอดมิน/ทีมงานเท่านั้น =====

const announceCommand = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('ตั้งประกาศล่วงหน้า บอทจะโพสต์ให้เองเมื่อถึงเวลา')
  .addChannelOption((opt) =>
    opt.setName('ห้อง').setDescription('ห้องที่จะโพสต์ประกาศ').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('เวลา').setDescription('รูปแบบ YYYY-MM-DD HH:mm เช่น 2026-08-15 08:00').setRequired(true)
  )
  .addStringOption((opt) => opt.setName('ข้อความ').setDescription('เนื้อหาประกาศ').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const announceListCommand = new SlashCommandBuilder()
  .setName('announce-list')
  .setDescription('ดูรายการประกาศที่รอโพสต์')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const announceCancelCommand = new SlashCommandBuilder()
  .setName('announce-cancel')
  .setDescription('ยกเลิกประกาศที่รอโพสต์')
  .addIntegerOption((opt) => opt.setName('หมายเลข').setDescription('หมายเลขประกาศ (ดูจาก /announce-list)').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

// ===== ระบบสนุกๆ: เลเวล/เหรียญ/เกมเสี่ยงโชค/quiz =====

const rankCommand = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('ดูเลเวลและ XP ของคุณ (หรือของคนอื่น)')
  .addUserOption((opt) => opt.setName('ผู้ใช้').setDescription('ดูของใคร (เว้นว่าง = ตัวเอง)').setRequired(false));

const leaderboardCommand = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('จัดอันดับผู้เล่นที่เลเวลสูงสุดในเซิร์ฟเวอร์');

const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('ดูเหรียญของคุณ (หรือของคนอื่น)')
  .addUserOption((opt) => opt.setName('ผู้ใช้').setDescription('ดูของใคร (เว้นว่าง = ตัวเอง)').setRequired(false));

const dailyCommand = new SlashCommandBuilder().setName('daily').setDescription('รับเหรียญรายวันฟรี (ทุก 20 ชม.)');

const giveCommand = new SlashCommandBuilder()
  .setName('give')
  .setDescription('โอนเหรียญให้เพื่อน')
  .addUserOption((opt) => opt.setName('ผู้รับ').setDescription('คนที่จะรับเหรียญ').setRequired(true))
  .addIntegerOption((opt) => opt.setName('จำนวน').setDescription('จำนวนเหรียญ').setRequired(true).setMinValue(1));

const coinflipCommand = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('ทอยหัว-ก้อย เดิมพันเหรียญ (ชนะได้ 2 เท่า)')
  .addIntegerOption((opt) => opt.setName('เดิมพัน').setDescription('จำนวนเหรียญที่เดิมพัน').setRequired(true).setMinValue(1))
  .addStringOption((opt) =>
    opt
      .setName('ทาย')
      .setDescription('ทายหัวหรือก้อย')
      .setRequired(true)
      .addChoices({ name: 'หัว', value: 'หัว' }, { name: 'ก้อย', value: 'ก้อย' })
  );

const slotCommand = new SlashCommandBuilder()
  .setName('slot')
  .setDescription('เล่นสล็อตแมชชีน เดิมพันเหรียญ')
  .addIntegerOption((opt) => opt.setName('เดิมพัน').setDescription('จำนวนเหรียญที่เดิมพัน').setRequired(true).setMinValue(1));

const diceCommand = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('ทอยเต๋าแข่งกับบอท ใครมากกว่าชนะ')
  .addIntegerOption((opt) => opt.setName('เดิมพัน').setDescription('จำนวนเหรียญที่เดิมพัน').setRequired(true).setMinValue(1));

const quizCommand = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('ตั้งคำถามชิงแต้ม ใครตอบถูกเร็วสุดได้เหรียญ (ครู/แอดมิน)')
  .addStringOption((opt) => opt.setName('คำถาม').setDescription('คำถาม').setRequired(true))
  .addStringOption((opt) => opt.setName('เฉลย').setDescription('คำตอบที่ถูกต้อง').setRequired(true))
  .addIntegerOption((opt) => opt.setName('รางวัล').setDescription('เหรียญรางวัล (ค่าเริ่มต้น 50)').setRequired(false).setMinValue(1))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

// ===== ระบบดูแลตัวเอง: จัดการคำต้องห้าม + โหลดรายชื่อใหม่ =====

const badwordAddCommand = new SlashCommandBuilder()
  .setName('badword-add')
  .setDescription('เพิ่มคำต้องห้ามใหม่ (มีผลทันที ไม่ต้องรีสตาร์ท)')
  .addStringOption((opt) => opt.setName('คำ').setDescription('คำที่จะเพิ่ม').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('ประเภท')
      .setDescription('บล็อกทันที หรือ เฝ้าระวัง (ให้ AI ช่วยดูบริบท)')
      .setRequired(true)
      .addChoices({ name: 'บล็อกทันที', value: 'block' }, { name: 'เฝ้าระวัง (AI ช่วยดู)', value: 'watch' })
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const badwordRemoveCommand = new SlashCommandBuilder()
  .setName('badword-remove')
  .setDescription('ลบคำต้องห้ามที่แอดมินเพิ่มเอง')
  .addStringOption((opt) => opt.setName('คำ').setDescription('คำที่จะลบ').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const badwordListCommand = new SlashCommandBuilder()
  .setName('badword-list')
  .setDescription('ดูรายการคำต้องห้ามที่แอดมินเพิ่มเอง')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const reloadRosterCommand = new SlashCommandBuilder()
  .setName('reload-roster')
  .setDescription('โหลดรายชื่อนักเรียนใหม่จากไฟล์ + สร้าง role ห้องใหม่ (หลังอัปเดตไฟล์ ไม่ต้องรีสตาร์ท)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ===== ฟอร์มป๊อปอัป (modal) ที่เปิดขึ้นเมื่อกดปุ่ม =====

function buildVerifyModal() {
  return new ModalBuilder()
    .setCustomId('verifyModal')
    .setTitle('ยืนยันตัวตนนักเรียน')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('studentId')
          .setLabel('เลขประจำตัวนักเรียน')
          .setPlaceholder('กรอกเลขประจำตัวนักเรียนของคุณ')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fullName')
          .setLabel('ชื่อ-นามสกุล')
          .setPlaceholder('ชื่อ-นามสกุลจริงตามทะเบียนวิทยาลัย')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildTeacherVerifyModal() {
  return new ModalBuilder()
    .setCustomId('teacherVerifyModal')
    .setTitle('ยืนยันตัวตนครู/บุคลากร')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('teacherName')
          .setLabel('ชื่อ-นามสกุล')
          .setPlaceholder('ชื่อ-นามสกุลจริงตามทะเบียนวิทยาลัย')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildAlumniModal() {
  return new ModalBuilder()
    .setCustomId('alumniRegisterModal')
    .setTitle('ลงทะเบียนศิษย์เก่า')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alumniName')
          .setLabel('ชื่อ-นามสกุล')
          .setPlaceholder('ชื่อ-นามสกุลจริงของคุณ')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alumniGradInfo')
          .setLabel('ปีที่จบ + สาขาที่จบ')
          .setPlaceholder('เช่น จบปี 2565 สาขาการบัญชี')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alumniStatus')
          .setLabel('สถานะปัจจุบัน')
          .setPlaceholder('เช่น ทำงาน / ศึกษาต่อ / ธุรกิจส่วนตัว')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alumniWorkplace')
          .setLabel('ที่ทำงาน/สถานศึกษาปัจจุบัน')
          .setPlaceholder('เช่น บริษัท ABC จำกัด / มหาวิทยาลัย XYZ (ไม่บังคับ)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('alumniContact')
          .setLabel('เบอร์ติดต่อ/อีเมล (เห็นเฉพาะแอดมิน)')
          .setPlaceholder('เช่น 08x-xxx-xxxx หรือ name@email.com (ไม่บังคับ)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

function buildAskModal() {
  return new ModalBuilder()
    .setCustomId('askModal')
    .setTitle('ถามคำถามกับ AI')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('question')
          .setLabel('คำถามของคุณ')
          .setPlaceholder('เช่น สาขาบัญชีเรียนอะไรบ้าง')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function buildTournamentRegisterModal(name) {
  return new ModalBuilder()
    .setCustomId(`tournamentRegisterModal:${name}`)
    .setTitle(`สมัคร: ${name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('entryName')
          .setLabel('ชื่อทีม / ชื่อผู้เล่น')
          .setPlaceholder('เช่น ทีมไฮเทค A หรือ นายสมชาย ใจดี')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('members')
          .setLabel('รายชื่อสมาชิก (ถ้าเป็นทีม คั่นด้วยจุลภาค)')
          .setPlaceholder('เช่น สมชาย, สมหญิง, สมปอง')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
}

// ===== ระบบสมัครทีม RoV แบบมีรายละเอียดนักกีฬาต่อคน =====

function buildRovTeamCreateModal() {
  return new ModalBuilder()
    .setCustomId('rovTeamCreateModal')
    .setTitle('สร้างทีม RoV')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('teamName')
          .setLabel('ชื่อทีม')
          .setPlaceholder('เช่น ทีมไฮเทค A')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildRovAddMemberModal() {
  return new ModalBuilder()
    .setCustomId('rovAddMemberModal')
    .setTitle('เพิ่มนักกีฬาในทีม')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('studentId')
          .setLabel('เลขประจำตัวนักเรียน')
          .setPlaceholder('ระบบจะดึงชื่อ/สาขา/ระดับชั้นให้อัตโนมัติ')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('position')
          .setLabel('ตำแหน่ง (พิมพ์ว่า ตัวจริง หรือ สำรอง)')
          .setPlaceholder('ตัวจริง')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function buildRovRemoveMemberModal() {
  return new ModalBuilder()
    .setCustomId('rovRemoveMemberModal')
    .setTitle('ลบนักกีฬาออกจากทีม')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('studentId')
          .setLabel('เลขประจำตัวนักเรียนที่จะลบ')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

// GuildMembers เป็น privileged intent — ต้องเปิด "SERVER MEMBERS INTENT" ใน Developer Portal → Bot ด้วย
// (ใช้สำหรับระบบต้อนรับสมาชิกใหม่ guildMemberAdd)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('clientReady', async () => {
  console.log(`ล็อกอินสำเร็จในชื่อ ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.commands.set([
    verifyCommand,
    askCommand,
    imageCommand,
    tournamentCreateCommand,
    tournamentCloseCommand,
    tournamentOpenCommand,
    tournamentBracketCommand,
    tournamentResultCommand,
    tournamentScheduleCommand,
    tournamentListCommand,
    announceCommand,
    announceListCommand,
    announceCancelCommand,
    rankCommand,
    leaderboardCommand,
    balanceCommand,
    dailyCommand,
    giveCommand,
    coinflipCommand,
    slotCommand,
    diceCommand,
    quizCommand,
    badwordAddCommand,
    badwordRemoveCommand,
    badwordListCommand,
    reloadRosterCommand,
  ]);
  console.log('ลงทะเบียนคำสั่งและปุ่มโต้ตอบทั้งหมดเรียบร้อย บอทพร้อมใช้งาน');

  // เปิดเว็บแดชบอร์ดหลังบ้าน (ถ้าตั้ง DASHBOARD_PASSWORD ใน .env)
  try {
    startDashboard(client);
  } catch (err) {
    console.warn('เปิดแดชบอร์ดไม่สำเร็จ:', err.message);
  }

  // สำรองข้อมูลอัตโนมัติ: ทันทีที่เริ่ม + ทุก 24 ชม. หลังจากนั้น
  try {
    runBackup();
  } catch (err) {
    console.warn('สำรองข้อมูลไม่สำเร็จ:', err.message);
  }
  setInterval(() => {
    try {
      runBackup();
    } catch (err) {
      console.warn('สำรองข้อมูลไม่สำเร็จ:', err.message);
    }
  }, 24 * 60 * 60 * 1000);

  // สแกนทุก 1 นาที: แจ้งเตือนนัดแข่งที่ถึงเวลา + โพสต์ประกาศตามตารางที่ถึงกำหนด
  setInterval(async () => {
    const due = tournaments.findDueReminders();
    for (const { tournament, roundNumber, matchNumber, match } of due) {
      const channel = guild.channels.cache.get(tournament.channelId);
      if (channel) {
        await channel
          .send(
            `🔔 ใกล้ถึงเวลาแข่งแล้ว! **${tournament.name}** รอบที่ ${roundNumber} คู่ที่ ${matchNumber}: ` +
              `**${match.p1}** vs **${match.p2}** (นัด: ${match.scheduledAt})`
          )
          .catch((err) => console.warn('ส่งแจ้งเตือนนัดแข่งไม่สำเร็จ:', err.message));
      }
      tournaments.markReminded(tournament.name, roundNumber, matchNumber);
    }

    const dueAnnouncements = announcements.findDue();
    for (const item of dueAnnouncements) {
      const channel = guild.channels.cache.get(item.channelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0xf97316)
          .setTitle('📢 ประกาศ')
          .setDescription(item.text)
          .setTimestamp()
          .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });
        await channel
          .send({ embeds: [embed] })
          .catch((err) => console.warn('โพสต์ประกาศตามตารางไม่สำเร็จ:', err.message));
      }
      announcements.markPosted(item.id);
    }
  }, 60 * 1000);
});

// ===== ระบบต้อนรับสมาชิกใหม่ =====

client.on('guildMemberAdd', async (member) => {
  const welcomeChannel = member.guild.channels.cache.find((c) => c.name === 'ยินดีต้อนรับ');
  if (!welcomeChannel) return;

  const roleChannel = member.guild.channels.cache.find((c) => c.name === 'รับยศเข้าใช้งาน');
  const roleRef = roleChannel ? `<#${roleChannel.id}>` : '#รับยศเข้าใช้งาน';

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('🎉 ผู้เล่นใหม่เข้าร่วมปาร์ตี้!')
    .setDescription(
      `ยินดีต้อนรับ <@${member.id}> สู่เซิร์ฟเวอร์วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่! 🏫\n\n` +
        `🎫 เป็นนักเรียน? ไปกดปุ่ม **✅ ยืนยันตัวตนนักเรียน** ที่ห้อง ${roleRef} เพื่อปลดล็อกห้องทั้งหมด\n` +
        '🎓 สนใจสมัครเรียน? ดูข้อมูลที่หมวด **🎓 รับสมัครเรียน** ได้เลย'
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await welcomeChannel.send({ embeds: [embed] }).catch((err) => console.warn('ส่งข้อความต้อนรับไม่สำเร็จ:', err.message));
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ask') {
      const question = interaction.options.getString('คำถาม').trim();
      return runAsk(interaction, question);
    }
    if (interaction.commandName === 'verify') {
      const studentId = interaction.options.getString('เลขประจำตัวนักเรียน').trim();
      const fullName = interaction.options.getString('ชื่อ-นามสกุล').trim();
      return runVerify(interaction, studentId, fullName);
    }
    if (interaction.commandName === 'image') {
      const prompt = interaction.options.getString('รายละเอียดภาพ').trim();
      return runImage(interaction, prompt);
    }
    if (interaction.commandName === 'tournament-create') return runTournamentCreate(interaction);
    if (interaction.commandName === 'tournament-close') return runTournamentClose(interaction);
    if (interaction.commandName === 'tournament-open') return runTournamentOpen(interaction);
    if (interaction.commandName === 'tournament-bracket') return runTournamentBracket(interaction);
    if (interaction.commandName === 'tournament-result') return runTournamentResult(interaction);
    if (interaction.commandName === 'tournament-schedule') return runTournamentSchedule(interaction);
    if (interaction.commandName === 'tournament-list') return runTournamentList(interaction);
    if (interaction.commandName === 'announce') return runAnnounce(interaction);
    if (interaction.commandName === 'announce-list') return runAnnounceList(interaction);
    if (interaction.commandName === 'announce-cancel') return runAnnounceCancel(interaction);
    if (interaction.commandName === 'rank') return runRank(interaction);
    if (interaction.commandName === 'leaderboard') return runLeaderboard(interaction);
    if (interaction.commandName === 'balance') return runBalance(interaction);
    if (interaction.commandName === 'daily') return runDaily(interaction);
    if (interaction.commandName === 'give') return runGive(interaction);
    if (interaction.commandName === 'coinflip') return runCoinflip(interaction);
    if (interaction.commandName === 'slot') return runSlot(interaction);
    if (interaction.commandName === 'dice') return runDice(interaction);
    if (interaction.commandName === 'quiz') return runQuiz(interaction);
    if (interaction.commandName === 'badword-add') return runBadwordAdd(interaction);
    if (interaction.commandName === 'badword-remove') return runBadwordRemove(interaction);
    if (interaction.commandName === 'badword-list') return runBadwordList(interaction);
    if (interaction.commandName === 'reload-roster') return runReloadRoster(interaction);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'openVerify') return interaction.showModal(buildVerifyModal());
    if (interaction.customId === 'openAsk') return interaction.showModal(buildAskModal());
    if (interaction.customId === 'openTeacherVerify') return interaction.showModal(buildTeacherVerifyModal());
    if (interaction.customId === 'openAlumniRegister') return interaction.showModal(buildAlumniModal());
    if (interaction.customId.startsWith('gameRole:')) return runToggleGameRole(interaction, interaction.customId.slice('gameRole:'.length));
    if (interaction.customId.startsWith('teacherApprove:')) {
      return runTeacherDecision(interaction, interaction.customId.slice('teacherApprove:'.length), true);
    }
    if (interaction.customId.startsWith('teacherReject:')) {
      return runTeacherDecision(interaction, interaction.customId.slice('teacherReject:'.length), false);
    }
    if (interaction.customId.startsWith('tournamentRegister:')) {
      const name = interaction.customId.slice('tournamentRegister:'.length);
      return interaction.showModal(buildTournamentRegisterModal(name));
    }
    if (interaction.customId === 'rovTeamCreate') return runRovTeamCreateClick(interaction);
    if (interaction.customId === 'rovAddMember') return interaction.showModal(buildRovAddMemberModal());
    if (interaction.customId === 'rovRemoveMember') return interaction.showModal(buildRovRemoveMemberModal());
    if (interaction.customId === 'rovSubmitTeam') return runRovSubmitTeam(interaction);
    if (interaction.customId === 'rovCancelTeam') return runRovCancelTeam(interaction);
    if (interaction.customId.startsWith('rovConfirmTeam:')) {
      return runRovDecision(interaction, interaction.customId.slice('rovConfirmTeam:'.length), true);
    }
    if (interaction.customId.startsWith('rovRejectTeam:')) {
      return runRovDecision(interaction, interaction.customId.slice('rovRejectTeam:'.length), false);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verifyModal') {
      const studentId = interaction.fields.getTextInputValue('studentId').trim();
      const fullName = interaction.fields.getTextInputValue('fullName').trim();
      return runVerify(interaction, studentId, fullName);
    }
    if (interaction.customId === 'teacherVerifyModal') {
      const name = interaction.fields.getTextInputValue('teacherName').trim();
      return runTeacherRequest(interaction, name);
    }
    if (interaction.customId === 'alumniRegisterModal') {
      return runAlumniRegister(interaction);
    }
    if (interaction.customId === 'askModal') {
      const question = interaction.fields.getTextInputValue('question').trim();
      return runAsk(interaction, question);
    }
    if (interaction.customId.startsWith('tournamentRegisterModal:')) {
      const name = interaction.customId.slice('tournamentRegisterModal:'.length);
      return runTournamentRegister(interaction, name);
    }
    if (interaction.customId === 'rovTeamCreateModal') return runRovTeamCreateSubmit(interaction);
    if (interaction.customId === 'rovAddMemberModal') return runRovAddMember(interaction);
    if (interaction.customId === 'rovRemoveMemberModal') return runRovRemoveMember(interaction);
  }
});

// ===== ระบบยืนยันตัวตนครู (กรอกชื่อ → แอดมินอนุมัติใน #mod-log) =====

async function runTeacherRequest(interaction, inputName) {
  if (!teachers.rosterExists()) {
    await interaction.reply({
      content: 'ระบบครูยังไม่พร้อมใช้งาน (แอดมินยังไม่ได้เพิ่มไฟล์ รายชื่อครู.xlsx) กรุณาติดต่อแอดมิน',
      ephemeral: true,
    });
    return;
  }

  const teacherRole = interaction.guild.roles.cache.find((r) => r.name === teachers.TEACHER_ROLE_NAME);
  if (teacherRole && interaction.member.roles.cache.has(teacherRole.id)) {
    await interaction.reply({ content: 'คุณได้รับ role คุณครู อยู่แล้วครับ', ephemeral: true });
    return;
  }

  if (teachers.getPending(interaction.user.id)) {
    await interaction.reply({ content: 'คุณมีคำขอที่รอแอดมินอนุมัติอยู่แล้ว กรุณารอสักครู่', ephemeral: true });
    return;
  }

  const teacher = teachers.findTeacher(inputName);
  if (!teacher) {
    await interaction.reply({
      content: 'ไม่พบชื่อนี้ในรายชื่อครูของวิทยาลัย กรุณาตรวจสอบตัวสะกด หรือติดต่อแอดมินโดยตรง',
      ephemeral: true,
    });
    return;
  }

  // กันชื่อครูเดียวถูกอ้างซ้ำ — ถ้ามีบัญชีอื่นได้รับอนุมัติในชื่อนี้ไปแล้ว ให้ปฏิเสธทันที
  const claimant = teachers.getTeacherClaimant(teacher.name);
  if (claimant && claimant !== interaction.user.id) {
    await interaction.reply({
      content:
        `ชื่อ "${teacher.name}" ถูกยืนยันให้บัญชีอื่นไปแล้ว หากคุณคือครูท่านนี้ตัวจริง ` +
        'กรุณาติดต่อแอดมินโดยตรงเพื่อตรวจสอบ (อาจมีคนแอบอ้างชื่อคุณ)',
      ephemeral: true,
    });
    return;
  }

  const modLogChannel = interaction.guild.channels.cache.find((c) => c.name === 'mod-log');
  if (!modLogChannel) {
    await interaction.reply({ content: 'ไม่พบห้อง mod-log กรุณาแจ้งแอดมินให้รัน setup-modlog.js', ephemeral: true });
    return;
  }

  teachers.addPending(interaction.user.id, teacher);

  // ===== รวบรวมข้อมูลช่วยแอดมินจับการแอบอ้าง =====
  const member = interaction.member;
  const verifiedRole = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  const isStudentVerified = verifiedRole && member.roles.cache.has(verifiedRole.id);
  const nickname = member.nickname || '(ไม่ได้ตั้งชื่อเล่น)';
  const createdTs = Math.floor(interaction.user.createdAt.getTime() / 1000);
  const joinedTs = member.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;
  // บัญชีที่เพิ่งสร้าง/เพิ่งเข้ามาไม่นานเป็นสัญญาณน่าสงสัย (< 7 วัน)
  const joinedRecently = member.joinedAt && Date.now() - member.joinedAt.getTime() < 7 * 24 * 60 * 60 * 1000;

  const suspicious = isStudentVerified || joinedRecently;

  const embed = new EmbedBuilder()
    .setColor(suspicious ? 0xdc2626 : 0xef4444)
    .setTitle('🍎 คำขอยืนยันตัวตนครู — รออนุมัติ')
    .addFields(
      { name: 'บัญชี Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
      { name: 'ชื่อเล่นปัจจุบัน', value: nickname, inline: true },
      { name: 'ชื่อที่กรอก', value: teacher.name, inline: false },
      { name: 'สาขา/ตำแหน่งตามทะเบียน', value: `${teacher.branch || '-'} / ${teacher.position}`, inline: false },
      {
        name: 'ข้อมูลบัญชี',
        value:
          `สร้างบัญชี: <t:${createdTs}:R>\n` +
          (joinedTs ? `เข้าเซิร์ฟเวอร์: <t:${joinedTs}:R>` : 'เข้าเซิร์ฟเวอร์: ไม่ทราบ'),
        inline: false,
      }
    )
    .setTimestamp();

  // แถบเตือนชัดเจนเมื่อพบสัญญาณแอบอ้าง
  const warnings = [];
  if (isStudentVerified) {
    warnings.push(`🚨 **บัญชีนี้ยืนยันเป็น "นักเรียน" ไปแล้ว** (ชื่อเล่น: ${nickname}) — ครูตัวจริงไม่ควรเป็นนักเรียน!`);
  }
  if (joinedRecently) {
    warnings.push('⚠️ บัญชีนี้เพิ่งเข้าเซิร์ฟเวอร์ไม่ถึง 7 วัน');
  }
  if (warnings.length) {
    embed.addFields({ name: '⚠️ สัญญาณน่าสงสัย — ตรวจสอบก่อนอนุมัติ', value: warnings.join('\n') });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`teacherApprove:${interaction.user.id}`).setLabel('✅ อนุมัติ').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`teacherReject:${interaction.user.id}`).setLabel('❌ ปฏิเสธ').setStyle(ButtonStyle.Danger)
  );

  await modLogChannel.send({ embeds: [embed], components: [row] });
  await interaction.reply({
    content: `ส่งคำขอแล้ว! ระบบพบชื่อ "${teacher.name}" ในรายชื่อครู กรุณารอแอดมินตรวจสอบและอนุมัติครับ`,
    ephemeral: true,
  });
}

async function runTeacherDecision(interaction, userId, approved) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'เฉพาะแอดมินเท่านั้นที่อนุมัติ/ปฏิเสธคำขอได้', ephemeral: true });
    return;
  }

  const pending = teachers.getPending(userId);
  if (!pending) {
    await interaction.reply({ content: 'คำขอนี้ถูกจัดการไปแล้ว หรือหมดอายุ', ephemeral: true });
    return;
  }

  // ตอบรับปุ่มทันที กันข้อความ "การโต้ตอบนี้ล้มเหลว" — งานข้างล่าง (ดึงสมาชิก/ให้ role/DM) อาจใช้เวลาเกิน 3 วิ
  await interaction.deferUpdate();

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    teachers.removePending(userId);
    await interaction.followUp({ content: 'ไม่พบสมาชิกคนนี้ในเซิร์ฟเวอร์แล้ว (อาจออกไปแล้ว) ลบคำขอทิ้ง', ephemeral: true });
    return;
  }

  if (approved) {
    // กันเผื่อมีอีกบัญชีถูกอนุมัติในชื่อนี้ไปก่อนแล้ว (ระหว่างที่คำขอนี้ยังค้างอยู่)
    const claimant = teachers.getTeacherClaimant(pending.name);
    if (claimant && claimant !== userId) {
      teachers.removePending(userId);
      await interaction.followUp({
        content: `ชื่อ "${pending.name}" ถูกอนุมัติให้บัญชีอื่นไปแล้ว ยกเลิกคำขอนี้อัตโนมัติ`,
        ephemeral: true,
      });
      return;
    }

    const teacherRole = interaction.guild.roles.cache.find((r) => r.name === teachers.TEACHER_ROLE_NAME);
    if (!teacherRole) {
      await interaction.followUp({ content: 'ไม่พบ role คุณครู กรุณารัน setup-teachers.js ก่อน', ephemeral: true });
      return;
    }
    try {
      await member.roles.add(teacherRole);
    } catch (err) {
      console.error('ให้ role ครูไม่สำเร็จ:', err);
      await interaction.followUp({ content: 'เกิดข้อผิดพลาดในการให้ role กรุณาลองใหม่', ephemeral: true });
      return;
    }
    // ล็อกชื่อครูนี้ให้บัญชีนี้ — คนอื่นอ้างชื่อซ้ำไม่ได้อีก
    teachers.claimTeacher(pending.name, userId);
    try {
      await member.setNickname(`ครู${pending.name.replace(/^(นางสาว|นาย|นาง)/, '')}`);
    } catch (err) {
      console.warn('ตั้งชื่อเล่นครูไม่สำเร็จ:', err.message);
    }
    await member
      .send(`✅ คำขอยืนยันตัวตนครูของคุณได้รับการอนุมัติแล้ว ยินดีต้อนรับ ${pending.name} สู่เซิร์ฟเวอร์วิทยาลัยครับ`)
      .catch(() => {});
  } else {
    await member
      .send('❌ คำขอยืนยันตัวตนครูของคุณไม่ได้รับการอนุมัติ หากคิดว่าเป็นความผิดพลาดกรุณาติดต่อแอดมินโดยตรง')
      .catch(() => {});
  }

  teachers.removePending(userId);

  const original = interaction.message.embeds[0];
  const updated = EmbedBuilder.from(original)
    .setColor(approved ? 0x22c55e : 0x6b7280)
    .setTitle(approved ? '🍎 คำขอยืนยันตัวตนครู — ✅ อนุมัติแล้ว' : '🍎 คำขอยืนยันตัวตนครู — ❌ ปฏิเสธแล้ว')
    .addFields({ name: 'ตัดสินโดย', value: `<@${interaction.user.id}>` });
  await interaction.editReply({ embeds: [updated], components: [] });
}

// ===== ระบบลงทะเบียนศิษย์เก่า (self-service ได้ role ทันที + ส่งข้อมูลเข้าห้องลับแอดมิน) =====

async function runAlumniRegister(interaction) {
  const name = interaction.fields.getTextInputValue('alumniName').trim();
  const gradInfo = interaction.fields.getTextInputValue('alumniGradInfo').trim();
  const status = interaction.fields.getTextInputValue('alumniStatus').trim();
  const workplace = interaction.fields.getTextInputValue('alumniWorkplace').trim();
  const contact = interaction.fields.getTextInputValue('alumniContact').trim();

  const alumniRole = interaction.guild.roles.cache.find((r) => r.name === ALUMNI_ROLE_NAME);
  if (!alumniRole) {
    await interaction.reply({
      content: 'ระบบศิษย์เก่ายังไม่พร้อม (แอดมินยังไม่ได้รัน setup-alumni.js) กรุณาติดต่อแอดมิน',
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.member.roles.add(alumniRole);
  } catch (err) {
    console.error('ให้ role ศิษย์เก่าไม่สำเร็จ:', err);
    await interaction.reply({ content: 'เกิดข้อผิดพลาดในการให้ role กรุณาติดต่อแอดมิน', ephemeral: true });
    return;
  }

  try {
    await interaction.member.setNickname(`ศิษย์เก่า·${name.replace(/^(นางสาว|นาย|นาง)/, '')}`);
  } catch (err) {
    console.warn('ตั้งชื่อเล่นศิษย์เก่าไม่สำเร็จ:', err.message);
  }

  // ส่งข้อมูลส่วนตัวเข้าห้องลับเฉพาะแอดมินเท่านั้น (ไม่โพสต์สาธารณะ ไม่เก็บไฟล์)
  const dataChannel = interaction.guild.channels.cache.find((c) => c.name === ALUMNI_DATA_CHANNEL);
  if (dataChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x14b8a6)
      .setTitle('🎓 ศิษย์เก่าลงทะเบียนใหม่')
      .addFields(
        { name: 'บัญชี Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
        { name: 'ชื่อ-นามสกุล', value: name, inline: true },
        { name: 'ปีที่จบ/สาขา', value: gradInfo, inline: true },
        { name: 'สถานะปัจจุบัน', value: status || '-', inline: true },
        { name: 'ที่ทำงาน/สถานศึกษา', value: workplace || '-' },
        { name: 'เบอร์ติดต่อ/อีเมล', value: contact || '-' }
      )
      .setFooter({ text: '🔒 ข้อมูลลับ — ห้ามเปิดเผยต่อบุคคลอื่น (PDPA)' })
      .setTimestamp();
    await dataChannel.send({ embeds: [embed] }).catch((err) => console.warn('ส่งข้อมูลศิษย์เก่าไม่สำเร็จ:', err.message));
  }

  await interaction.reply({
    content:
      `ลงทะเบียนศิษย์เก่าสำเร็จ! ยินดีต้อนรับกลับบ้าน ${name} 🎉\n` +
      'คุณได้รับ role ศิษย์เก่า และเข้าห้อง #ศิษย์เก่า ได้แล้ว ข้อมูลของคุณถูกเก็บไว้อย่างปลอดภัยครับ',
    ephemeral: true,
  });
}

// ===== ตรรกะจริงของแต่ละฟีเจอร์ — ใช้ร่วมกันทั้งจากคำสั่งพิมพ์และจากปุ่ม/ฟอร์ม =====

async function runAsk(interaction, question) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const answer = await askAI(question);
    await interaction.editReply({ content: answer.slice(0, 1900) });
  } catch (err) {
    console.error('เรียก AI ไม่สำเร็จ:', err);
    await interaction.editReply({ content: 'ขออภัย ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หรือติดต่อแอดมิน' });
  }
}

async function runImage(interaction, prompt) {
  await interaction.deferReply();
  try {
    const buffer = await generateImage(prompt);
    const attachment = new AttachmentBuilder(buffer, { name: 'image.jpg' });
    await interaction.editReply({ content: `ภาพจากคำสั่ง: "${prompt}"`, files: [attachment] });
  } catch (err) {
    console.error('เจนภาพไม่สำเร็จ:', err);
    await interaction.editReply({ content: 'ขออภัย เจนภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
}

// ===== ระบบจัดการแข่งขัน =====

function buildRegistrationPayload(t) {
  const list = t.participants.length
    ? t.participants.map((p, i) => `${i + 1}. ${p.name}${p.members.length ? ` (${p.members.join(', ')})` : ''}`).join('\n')
    : 'ยังไม่มีผู้สมัคร';

  const isOpen = t.status === 'registration';
  const statusText = isOpen ? 'กดปุ่มด้านล่างเพื่อสมัครเข้าร่วม' : '🔒 ปิดรับสมัครแล้ว';

  const embed = new EmbedBuilder()
    .setColor(isOpen ? 0x8b5cf6 : 0x6b7280)
    .setTitle(`🏆 ${isOpen ? 'เปิดรับสมัคร' : 'ปิดรับสมัครแล้ว'}: ${t.name}`)
    .setDescription(
      `ประเภท: ${t.type === 'team' ? `แข่งแบบทีม${t.teamSize ? ` (ทีมละ ${t.teamSize} คน)` : ''}` : 'แข่งแบบรายบุคคล'}\n${statusText}`
    )
    .addFields({ name: `ผู้สมัครแล้ว (${t.participants.length})`, value: list })
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournamentRegister:${t.name}`)
      .setLabel(isOpen ? '📝 สมัครเข้าร่วม' : '🔒 ปิดรับสมัครแล้ว')
      .setStyle(isOpen ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!isOpen)
  );

  return { embeds: [embed], components: [row] };
}

function buildBracketPayload(t) {
  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`🏆 สายการแข่งขัน: ${t.name}`)
    .setDescription(
      t.status === 'completed'
        ? `🎉 จบการแข่งขันแล้ว! ผู้ชนะเลิศ: **${t.rounds[t.rounds.length - 1][0].winner}**`
        : 'อัปเดตผลแบบเรียลไทม์ผ่านคำสั่ง /tournament-result'
    )
    .addFields(tournaments.formatBracketFields(t))
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });

  return { embeds: [embed] };
}

async function runTournamentCreate(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  const type = interaction.options.getString('ประเภท');
  const teamSize = interaction.options.getInteger('ขนาดทีม');
  const roomChoice = interaction.options.getString('ห้อง');
  const channelName = TOURNAMENT_CHANNEL_CHOICES[roomChoice];

  const channel = interaction.guild.channels.cache.find((c) => c.name === channelName);
  if (!channel) {
    await interaction.reply({ content: `ไม่พบห้อง #${channelName}`, ephemeral: true });
    return;
  }

  let t;
  try {
    t = tournaments.createTournament({
      name,
      type,
      teamSize,
      channelId: channel.id,
      createdBy: interaction.user.id,
    });
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  const message = await channel.send(buildRegistrationPayload(t));
  tournaments.setRegistrationMessage(name, message.id);
  await interaction.reply({ content: `เปิดรับสมัคร "${name}" แล้วที่ #${channelName}`, ephemeral: true });
}

async function runTournamentRegister(interaction, name) {
  const entryName = interaction.fields.getTextInputValue('entryName').trim();
  const membersRaw = interaction.fields.getTextInputValue('members').trim();
  const members = membersRaw ? membersRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  let t;
  try {
    t = tournaments.registerParticipant(name, entryName, members);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `สมัคร "${entryName}" เข้าร่วม "${name}" สำเร็จ! 🎉`, ephemeral: true });

  if (t.registrationMessageId) {
    const channel = interaction.guild.channels.cache.get(t.channelId);
    const message = await channel?.messages.fetch(t.registrationMessageId).catch(() => null);
    if (message) await message.edit(buildRegistrationPayload(t)).catch(() => {});
  }
}

async function updateRegistrationMessage(interaction, t) {
  if (!t.registrationMessageId) return;
  const channel = interaction.guild.channels.cache.get(t.channelId);
  const message = await channel?.messages.fetch(t.registrationMessageId).catch(() => null);
  if (message) await message.edit(buildRegistrationPayload(t)).catch(() => {});
}

async function runTournamentClose(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  let t;
  try {
    t = tournaments.closeRegistration(name);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await updateRegistrationMessage(interaction, t);
  await interaction.editReply({
    content: `ปิดรับสมัคร "${name}" แล้ว (${t.participants.length} สมัคร) ใช้ /tournament-bracket เพื่อจับสู่ต่อได้เลย`,
  });
}

async function runTournamentOpen(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  let t;
  try {
    t = tournaments.openRegistration(name);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await updateRegistrationMessage(interaction, t);
  await interaction.editReply({ content: `เปิดรับสมัคร "${name}" อีกครั้งแล้ว` });
}

async function runTournamentBracket(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  let t;
  try {
    t = tournaments.generateBracket(name);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.guild.channels.cache.get(t.channelId);
  const message = await channel.send(buildBracketPayload(t));
  tournaments.setBracketMessage(name, message.id);

  await interaction.editReply({ content: `จับสู่ "${name}" แล้ว ดูสายการแข่งขันได้ในห้องเดียวกับประกาศรับสมัคร` });
}

async function updateBracketMessage(interaction, t) {
  if (!t.bracketMessageId) return;
  const channel = interaction.guild.channels.cache.get(t.channelId);
  const message = await channel?.messages.fetch(t.bracketMessageId).catch(() => null);
  if (message) await message.edit(buildBracketPayload(t)).catch(() => {});
}

async function runTournamentResult(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  const round = interaction.options.getInteger('รอบ');
  const matchNumber = interaction.options.getInteger('คู่ที่');
  const winner = interaction.options.getString('ผู้ชนะ').trim();

  let t;
  try {
    t = tournaments.recordResult(name, round, matchNumber, winner);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await updateBracketMessage(interaction, t);
  await interaction.editReply({
    content: `บันทึกผล "${name}" รอบ ${round} คู่ที่ ${matchNumber}: ${winner} ชนะ` + (t.status === 'completed' ? ' 🏆 (จบทัวร์นาเมนต์แล้ว!)' : ''),
  });
}

async function runTournamentSchedule(interaction) {
  const name = interaction.options.getString('ชื่อ').trim();
  const round = interaction.options.getInteger('รอบ');
  const matchNumber = interaction.options.getInteger('คู่ที่');
  const timeText = interaction.options.getString('เวลา').trim();

  const parsed = new Date(timeText.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    await interaction.reply({ content: 'รูปแบบเวลาไม่ถูกต้อง ใช้ YYYY-MM-DD HH:mm เช่น 2026-08-15 09:00', ephemeral: true });
    return;
  }

  let t;
  try {
    t = tournaments.setMatchSchedule(name, round, matchNumber, parsed.toISOString());
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await updateBracketMessage(interaction, t);
  await interaction.reply({ content: `ตั้งเวลานัดแข่ง "${name}" รอบ ${round} คู่ที่ ${matchNumber} เป็น ${timeText} แล้ว`, ephemeral: true });
}

async function runTournamentList(interaction) {
  const all = tournaments.listTournaments();
  if (!all.length) {
    await interaction.reply({ content: 'ยังไม่มีการแข่งขันในระบบ', ephemeral: true });
    return;
  }
  const lines = all.map((t) => `**${t.name}** — ${t.status} (${t.participants.length} สมัคร)`);
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

// ===== ระบบประกาศตามตาราง =====

async function runAnnounce(interaction) {
  const channel = interaction.options.getChannel('ห้อง');
  const timeText = interaction.options.getString('เวลา').trim();
  const text = interaction.options.getString('ข้อความ').trim();

  const parsed = new Date(timeText.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    await interaction.reply({ content: 'รูปแบบเวลาไม่ถูกต้อง ใช้ YYYY-MM-DD HH:mm เช่น 2026-08-15 08:00', ephemeral: true });
    return;
  }
  if (parsed <= new Date()) {
    await interaction.reply({ content: 'เวลาที่ตั้งต้องอยู่ในอนาคต', ephemeral: true });
    return;
  }

  const item = announcements.addAnnouncement({
    channelId: channel.id,
    channelName: channel.name,
    text,
    scheduledAt: parsed.toISOString(),
    createdBy: interaction.user.id,
  });

  await interaction.reply({
    content: `ตั้งประกาศหมายเลข ${item.id} แล้ว จะโพสต์ที่ <#${channel.id}> เวลา ${timeText}`,
    ephemeral: true,
  });
}

async function runAnnounceList(interaction) {
  const pending = announcements.listPending();
  if (!pending.length) {
    await interaction.reply({ content: 'ไม่มีประกาศรอโพสต์', ephemeral: true });
    return;
  }
  const lines = pending.map(
    (a) => `**#${a.id}** → <#${a.channelId}> เวลา ${a.scheduledAt.replace('T', ' ').slice(0, 16)}\n> ${a.text.slice(0, 100)}`
  );
  await interaction.reply({ content: lines.join('\n\n').slice(0, 1900), ephemeral: true });
}

async function runAnnounceCancel(interaction) {
  const id = interaction.options.getInteger('หมายเลข');
  try {
    announcements.cancelAnnouncement(id);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }
  await interaction.reply({ content: `ยกเลิกประกาศหมายเลข ${id} แล้ว`, ephemeral: true });
}

// ===== ระบบสนุกๆ: reaction role เกม =====

async function runToggleGameRole(interaction, gameKey) {
  const game = GAMES.find((g) => g.key === gameKey);
  if (!game) {
    await interaction.reply({ content: 'ไม่พบเกมนี้', ephemeral: true });
    return;
  }
  const role = interaction.guild.roles.cache.find((r) => r.name === gameRoleName(game.label));
  if (!role) {
    await interaction.reply({ content: 'ยังไม่มี role เกมนี้ กรุณาแจ้งแอดมินให้รัน setup-fun.js', ephemeral: true });
    return;
  }
  try {
    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.member.roles.remove(role);
      await interaction.reply({ content: `เอา role **${game.label}** ออกแล้ว`, ephemeral: true });
    } else {
      await interaction.member.roles.add(role);
      await interaction.reply({ content: `รับ role **${game.label}** แล้ว! 🎮 หาเพื่อนเล่นเกมเดียวกันได้เลย`, ephemeral: true });
    }
  } catch (err) {
    console.error('สลับ role เกมไม่สำเร็จ:', err);
    await interaction.reply({ content: 'เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
  }
}

// ===== ระบบสนุกๆ: เลเวล/เหรียญ =====

function makeBar(current, needed, size = 12) {
  const filled = Math.round((current / needed) * size);
  return '█'.repeat(Math.min(filled, size)) + '░'.repeat(Math.max(size - filled, 0));
}

async function runRank(interaction) {
  const target = interaction.options.getUser('ผู้ใช้') || interaction.user;
  const u = economy.getUser(target.id);
  const needed = economy.xpForNext(u.level);
  const { position, total } = economy.getRankPosition(target.id);
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`📊 เลเวลของ ${target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: 'เลเวล', value: `**${u.level}**`, inline: true },
      { name: 'อันดับ', value: position ? `#${position} / ${total}` : 'ยังไม่มีข้อมูล', inline: true },
      { name: 'เหรียญ', value: `🪙 ${u.coins}`, inline: true },
      { name: `XP: ${u.xp} / ${needed}`, value: `\`${makeBar(u.xp, needed)}\`` }
    )
    .setFooter({ text: 'พิมพ์คุยในเซิร์ฟเวอร์เพื่อรับ XP และเหรียญ' });
  await interaction.reply({ embeds: [embed] });
}

async function runLeaderboard(interaction) {
  const top = economy.getLeaderboard(10);
  if (!top.length) {
    await interaction.reply({ content: 'ยังไม่มีใครมี XP เลย เริ่มพิมพ์คุยกันได้เลย!', ephemeral: true });
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.userId}> — เลเวล **${u.level}** (🪙 ${u.coins})`);
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('🏆 อันดับผู้เล่นสูงสุด')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่' });
  await interaction.reply({ embeds: [embed] });
}

async function runBalance(interaction) {
  const target = interaction.options.getUser('ผู้ใช้') || interaction.user;
  const u = economy.getUser(target.id);
  await interaction.reply({ content: `🪙 ${target.username} มีเหรียญ **${u.coins}** เหรียญ`, ephemeral: target.id !== interaction.user.id ? false : true });
}

async function runDaily(interaction) {
  try {
    const { amount, total } = economy.claimDaily(interaction.user.id);
    await interaction.reply({ content: `🎁 รับเหรียญรายวัน +${amount} เหรียญ! ตอนนี้มี 🪙 **${total}** เหรียญ`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `⏳ ${err.message}`, ephemeral: true });
  }
}

async function runGive(interaction) {
  const receiver = interaction.options.getUser('ผู้รับ');
  const amount = interaction.options.getInteger('จำนวน');
  if (receiver.id === interaction.user.id) {
    await interaction.reply({ content: 'โอนให้ตัวเองไม่ได้นะ', ephemeral: true });
    return;
  }
  if (receiver.bot) {
    await interaction.reply({ content: 'โอนให้บอทไม่ได้', ephemeral: true });
    return;
  }
  try {
    economy.transferCoins(interaction.user.id, receiver.id, amount);
    await interaction.reply({ content: `✅ โอน 🪙 ${amount} เหรียญ ให้ <@${receiver.id}> เรียบร้อย!` });
  } catch (err) {
    await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
  }
}

// ตัวช่วยรับเดิมพัน — เช็กเหรียญพอไหม แล้วหักออกก่อนเล่น
async function takeBet(interaction, bet) {
  if (!economy.spendCoins(interaction.user.id, bet)) {
    await interaction.reply({ content: `❌ เหรียญไม่พอ (คุณมี 🪙 ${economy.getUser(interaction.user.id).coins})`, ephemeral: true });
    return false;
  }
  return true;
}

async function runCoinflip(interaction) {
  const bet = interaction.options.getInteger('เดิมพัน');
  const guess = interaction.options.getString('ทาย');
  if (!(await takeBet(interaction, bet))) return;
  const result = Math.random() < 0.5 ? 'หัว' : 'ก้อย';
  if (result === guess) {
    const total = economy.addCoins(interaction.user.id, bet * 2);
    await interaction.reply(`🪙 ออก **${result}** — ถูก! ได้ ${bet} เหรียญ (มีทั้งหมด ${total})`);
  } else {
    await interaction.reply(`🪙 ออก **${result}** — ผิด! เสีย ${bet} เหรียญ 😢`);
  }
}

async function runSlot(interaction) {
  const bet = interaction.options.getInteger('เดิมพัน');
  if (!(await takeBet(interaction, bet))) return;
  const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
  const roll = [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
  let payout = 0;
  let msg;
  if (roll[0] === roll[1] && roll[1] === roll[2]) {
    payout = bet * (roll[0] === '7️⃣' ? 10 : 5); // เลข 7 สามตัว = แจ็คพอต
    msg = `🎰 ${roll.join(' | ')}\n🎉 **สามตัวเหมือนกัน!** ได้ ${payout} เหรียญ`;
  } else if (roll[0] === roll[1] || roll[1] === roll[2] || roll[0] === roll[2]) {
    payout = Math.floor(bet * 1.5);
    msg = `🎰 ${roll.join(' | ')}\n✨ คู่เหมือน! ได้ ${payout} เหรียญ`;
  } else {
    msg = `🎰 ${roll.join(' | ')}\n💸 ไม่ตรงเลย เสีย ${bet} เหรียญ`;
  }
  if (payout > 0) economy.addCoins(interaction.user.id, payout);
  await interaction.reply(msg);
}

async function runDice(interaction) {
  const bet = interaction.options.getInteger('เดิมพัน');
  if (!(await takeBet(interaction, bet))) return;
  const you = 1 + Math.floor(Math.random() * 6);
  const botRoll = 1 + Math.floor(Math.random() * 6);
  let msg = `🎲 คุณทอยได้ **${you}** — บอททอยได้ **${botRoll}**\n`;
  if (you > botRoll) {
    const total = economy.addCoins(interaction.user.id, bet * 2);
    msg += `🎉 คุณชนะ! ได้ ${bet} เหรียญ (มีทั้งหมด ${total})`;
  } else if (you < botRoll) {
    msg += `😢 บอทชนะ เสีย ${bet} เหรียญ`;
  } else {
    economy.addCoins(interaction.user.id, bet); // เสมอคืนเดิมพัน
    msg += '🤝 เสมอ! คืนเดิมพัน';
  }
  await interaction.reply(msg);
}

async function runQuiz(interaction) {
  const question = interaction.options.getString('คำถาม').trim();
  const answer = interaction.options.getString('เฉลย').trim();
  const reward = interaction.options.getInteger('รางวัล') || 50;

  if (quiz.hasQuiz(interaction.channelId)) {
    await interaction.reply({ content: 'ห้องนี้มีคำถามที่ยังเปิดอยู่ รอให้จบก่อนนะ', ephemeral: true });
    return;
  }

  // ตั้งเวลาหมดอายุ 60 วิ — ถ้าไม่มีใครตอบถูกจะเฉลยเอง
  const timer = setTimeout(async () => {
    const q = quiz.endQuiz(interaction.channelId);
    if (q) {
      await interaction.channel
        .send(`⏰ หมดเวลา! ไม่มีใครตอบถูก คำตอบคือ **${q.rawAnswer}**`)
        .catch(() => {});
    }
  }, 60 * 1000);

  quiz.startQuiz(interaction.channelId, question, answer, reward, timer);

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('❓ คำถามชิงเหรียญ!')
    .setDescription(`${question}\n\nพิมพ์คำตอบในห้องนี้ ใครตอบถูกเร็วสุดได้ 🪙 **${reward}** เหรียญ (มีเวลา 60 วิ)`)
    .setFooter({ text: `ตั้งโดย ${interaction.user.username}` });
  await interaction.reply({ embeds: [embed] });
}

// ===== ระบบดูแลตัวเอง =====

async function runBadwordAdd(interaction) {
  const word = interaction.options.getString('คำ');
  const type = interaction.options.getString('ประเภท');
  try {
    customWords.addWord(type, word);
    await interaction.reply({
      content: `เพิ่มคำ "${word}" เข้าบัญชี${type === 'block' ? 'คำต้องห้าม (บล็อกทันที)' : 'เฝ้าระวัง (AI ช่วยดู)'} แล้ว มีผลทันที`,
      ephemeral: true,
    });
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runBadwordRemove(interaction) {
  const word = interaction.options.getString('คำ');
  try {
    customWords.removeWord(word);
    await interaction.reply({ content: `ลบคำ "${word}" ออกแล้ว`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runBadwordList(interaction) {
  const c = customWords.getCustom();
  const block = c.blocklist.length ? c.blocklist.join(', ') : '(ยังไม่มี)';
  const watch = c.watchlist.length ? c.watchlist.join(', ') : '(ยังไม่มี)';
  await interaction.reply({
    content: `**คำที่แอดมินเพิ่มเอง**\n🚫 บล็อกทันที: ${block}\n👀 เฝ้าระวัง: ${watch}\n\n(นอกจากนี้ยังมีบัญชีคำในโค้ด banned-words.js ที่ทำงานอยู่เสมอ)`,
    ephemeral: true,
  });
}

async function runReloadRoster(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    roster = loadRoster();
    // สร้าง role ห้องเรียนใหม่ที่ยังไม่มี (เผื่อไฟล์ใหม่มีห้องเพิ่ม)
    const rooms = [...new Set([...roster.values()].map((r) => r.room).filter(Boolean))];
    let created = 0;
    for (const room of rooms) {
      if (!interaction.guild.roles.cache.find((r) => r.name === room)) {
        await interaction.guild.roles.create({ name: room, mentionable: true, hoist: false }).catch(() => {});
        created += 1;
      }
    }
    await interaction.editReply(
      `โหลดรายชื่อใหม่สำเร็จ: ${roster.size} คน` + (created ? ` · สร้าง role ห้องใหม่ ${created} ห้อง` : '')
    );
  } catch (err) {
    console.error('reload roster ไม่สำเร็จ:', err);
    await interaction.editReply('โหลดรายชื่อใหม่ไม่สำเร็จ — ตรวจสอบว่าไฟล์ รายชื่อนักศึกษา.xlsx ถูกต้อง');
  }
}

// ===== ระบบสมัครทีม RoV แบบมีรายละเอียดนักกีฬาต่อคน =====

function buildRovPanel(draft) {
  const statusLabel = { draft: '📝 ร่าง (แก้ไขได้)', pending: '⏳ รอครูยืนยัน', confirmed: '✅ ยืนยันแล้ว', rejected: '❌ ถูกปฏิเสธ' };
  const starters = draft.members.filter((m) => m.position === 'ตัวจริง');
  const subs = draft.members.filter((m) => m.position === 'สำรอง');

  const memberLines = (list, label) =>
    list.length
      ? list.map((m) => `${label} **${m.name}** (${m.studentId}) — ${m.branch || '-'} ${m.level || ''}`).join('\n')
      : `${label} (ยังไม่มี)`;

  const embed = new EmbedBuilder()
    .setColor(draft.status === 'confirmed' ? 0x22c55e : draft.status === 'pending' ? 0xf59e0b : 0x6366f1)
    .setTitle(`🎮 ทีม: ${draft.teamName}`)
    .setDescription(
      `สถานะ: ${statusLabel[draft.status] || draft.status}\n` +
        `สมาชิก: ${draft.members.length}/${rovTeams.MAX_MEMBERS} (ต้องมีตัวจริงครบ ${rovTeams.REQUIRED_STARTERS} คน + สำรองได้สูงสุด 1 คน)`
    )
    .addFields(
      { name: '🟢 ตัวจริง', value: memberLines(starters, '•') },
      { name: '🟡 สำรอง', value: memberLines(subs, '•') }
    );

  if (draft.status === 'rejected' || draft.rejectReason) {
    embed.addFields({ name: '⚠️ เหตุผลที่ถูกปฏิเสธล่าสุด', value: draft.rejectReason || 'ไม่ระบุ' });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rovAddMember')
      .setLabel('➕ เพิ่มนักกีฬา')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(draft.status !== 'draft' || draft.members.length >= rovTeams.MAX_MEMBERS),
    new ButtonBuilder()
      .setCustomId('rovRemoveMember')
      .setLabel('➖ ลบนักกีฬา')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(draft.status !== 'draft' || draft.members.length === 0),
    new ButtonBuilder()
      .setCustomId('rovSubmitTeam')
      .setLabel('✅ ส่งทีมเพื่อยืนยัน')
      .setStyle(ButtonStyle.Success)
      .setDisabled(draft.status !== 'draft'),
    new ButtonBuilder()
      .setCustomId('rovCancelTeam')
      .setLabel('❌ ยกเลิกทีม')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(draft.status === 'confirmed')
  );

  return { embeds: [embed], components: [row1], ephemeral: true };
}

async function runRovTeamCreateClick(interaction) {
  const existing = rovTeams.getDraft(interaction.user.id);
  if (existing) {
    await interaction.reply(buildRovPanel(existing));
    return;
  }
  return interaction.showModal(buildRovTeamCreateModal());
}

async function runRovTeamCreateSubmit(interaction) {
  const teamName = interaction.fields.getTextInputValue('teamName').trim();
  try {
    const draft = rovTeams.createDraft(interaction.user.id, teamName, interaction.user.tag);
    await interaction.reply(buildRovPanel(draft));
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runRovAddMember(interaction) {
  const studentId = interaction.fields.getTextInputValue('studentId').trim();
  const rawPosition = interaction.fields.getTextInputValue('position').trim();
  const position = rawPosition.includes('สำรอง') ? 'สำรอง' : rawPosition.includes('ตัวจริง') ? 'ตัวจริง' : null;

  if (!position) {
    await interaction.reply({ content: 'กรุณาพิมพ์ตำแหน่งเป็น "ตัวจริง" หรือ "สำรอง" เท่านั้น', ephemeral: true });
    return;
  }

  const record = roster.get(studentId);
  if (!record) {
    await interaction.reply({ content: `ไม่พบเลขประจำตัวนักเรียน "${studentId}" ในระบบ กรุณาตรวจสอบอีกครั้ง`, ephemeral: true });
    return;
  }
  if (record.status !== 'กำลังศึกษา') {
    await interaction.reply({ content: `นักเรียนรหัส ${studentId} สถานะไม่ใช่ "กำลังศึกษา" ในระบบ`, ephemeral: true });
    return;
  }

  try {
    const draft = rovTeams.addMember(interaction.user.id, studentId, position, record, interaction.user.tag);
    await interaction.reply(buildRovPanel(draft));
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runRovRemoveMember(interaction) {
  const studentId = interaction.fields.getTextInputValue('studentId').trim();
  try {
    const draft = rovTeams.removeMember(interaction.user.id, studentId, interaction.user.tag);
    await interaction.reply(buildRovPanel(draft));
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runRovCancelTeam(interaction) {
  try {
    rovTeams.cancelDraft(interaction.user.id, interaction.user.tag);
    await interaction.reply({ content: 'ยกเลิกทีมแล้ว กด "สมัครทีม RoV" เพื่อเริ่มใหม่ได้ตลอด', ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}

async function runRovSubmitTeam(interaction) {
  let draft;
  try {
    draft = rovTeams.submitDraft(interaction.user.id, interaction.user.tag);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const officialChannel = interaction.guild.channels.cache.find((c) => c.name === 'ประกาศกิจกรรม-ประกวดแข่งขัน');
  const modLogChannel = interaction.guild.channels.cache.find((c) => c.name === 'mod-log');

  // สร้าง thread ต่อทีม สำหรับให้กัปตันอัปโหลดรูปนักกีฬา (Discord modal แนบไฟล์ไม่ได้)
  let threadLine = '';
  if (officialChannel) {
    try {
      const thread = await officialChannel.threads.create({
        name: `ทีม-${draft.teamName}`.slice(0, 90),
        autoArchiveDuration: 1440,
        reason: `ทีม RoV: ${draft.teamName}`,
      });
      await thread.members.add(interaction.user.id).catch(() => {});
      await thread.send(
        `📸 สวัสดีทีม **${draft.teamName}** ครับ ห้องนี้ไว้สำหรับแนบรูปประจำตัวนักกีฬาแต่ละคน (ไม่บังคับ)\n` +
          'ตอบกลับในห้องนี้พร้อมแนบรูปได้เลย ระบุชื่อ-รหัสนักศึกษากำกับรูปด้วยนะครับ\n\n' +
          '⏳ ทีมของคุณกำลังรอครู/แอดมินตรวจสอบและยืนยันการชำระค่าสมัคร (50 บาท/ทีม) อยู่ครับ'
      );
      rovTeams.setThread(interaction.user.id, thread.id);
      threadLine = ` และไปที่เธรด ${thread} เพื่อแนบรูปนักกีฬา (ไม่บังคับ)`;
    } catch (err) {
      console.warn('สร้าง thread ทีม RoV ไม่สำเร็จ:', err.message);
    }
  }

  if (modLogChannel) {
    const roster_ = draft.members
      .map((m, i) => `${i + 1}. [${m.position}] **${m.name}** (${m.studentId}) — ${m.branch || '-'} ${m.level || ''}`)
      .join('\n');
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🎮 ทีม RoV รอยืนยัน + รับชำระเงิน')
      .addFields(
        { name: 'ชื่อทีม', value: draft.teamName, inline: true },
        { name: 'กัปตัน (Discord)', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'ค่าสมัคร', value: '50 บาท/ทีม (ยืนยันตัวตน+รับเงินก่อนกดยืนยัน)', inline: true },
        { name: 'รายชื่อนักกีฬา', value: roster_ }
      )
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rovConfirmTeam:${interaction.user.id}`).setLabel('✅ ยืนยัน + รับเงินแล้ว').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rovRejectTeam:${interaction.user.id}`).setLabel('❌ ปฏิเสธ').setStyle(ButtonStyle.Danger)
    );
    const msg = await modLogChannel.send({ embeds: [embed], components: [row] });
    rovTeams.setConfirmMessage(interaction.user.id, msg.id);
  }

  await interaction.editReply(
    `ส่งทีม "${draft.teamName}" เพื่อรอครู/แอดมินยืนยันแล้วครับ${threadLine}\n` +
      'อย่าลืมไปยืนยันตัวตน + ชำระค่าสมัคร 50 บาท กับอาจารย์จิมมี่ หรืออาจารย์พีด้วยนะครับ'
  );
}

async function runRovDecision(interaction, captainId, approved) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'เฉพาะครู/แอดมินเท่านั้นที่ยืนยัน/ปฏิเสธทีมได้', ephemeral: true });
    return;
  }

  let draft;
  try {
    draft = approved
      ? rovTeams.confirmTeam(captainId, interaction.user.tag)
      : rovTeams.rejectTeam(captainId, interaction.user.tag, null);
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
    return;
  }

  // ตอบรับปุ่มทันที กันข้อความ "การโต้ตอบนี้ล้มเหลว" — งานข้างล่าง (แก้ประกาศ/ดึงสมาชิก/DM) อาจใช้เวลาเกิน 3 วิ
  await interaction.deferUpdate();

  if (approved) {
    try {
      const memberList = draft.members.map((m) => `${m.position} ${m.name} (${m.studentId})`);
      tournaments.registerParticipant(rovTeams.ROV_TOURNAMENT_NAME, draft.teamName, memberList);
    } catch (err) {
      console.warn('ลงทะเบียนทีมเข้า tournaments.js ไม่สำเร็จ:', err.message);
    }

    // อัปเดตประกาศหลักให้เห็นทีมที่ยืนยันแล้วล่าสุด
    try {
      const t = tournaments.getTournament(rovTeams.ROV_TOURNAMENT_NAME);
      if (t?.registrationMessageId) {
        const officialChannel = interaction.guild.channels.cache.get(t.channelId);
        const officialMsg = await officialChannel?.messages.fetch(t.registrationMessageId).catch(() => null);
        if (officialMsg) {
          const confirmedTeams = rovTeams.listConfirmedTeams();
          const newField = {
            name: `✅ ทีมที่ยืนยันแล้ว (${confirmedTeams.length})`,
            value: confirmedTeams.map((tm) => `• ${tm.teamName}`).join('\n') || '-',
          };
          const existingFields = officialMsg.embeds[0].fields || [];
          const idx = existingFields.findIndex((f) => f.name.startsWith('✅ ทีมที่ยืนยันแล้ว'));
          const embed = EmbedBuilder.from(officialMsg.embeds[0]);
          if (idx === -1) embed.addFields(newField);
          else embed.spliceFields(idx, 1, newField);
          await officialMsg.edit({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('อัปเดตประกาศหลักไม่สำเร็จ:', err.message);
    }
  }

  const member = await interaction.guild.members.fetch(captainId).catch(() => null);
  if (member) {
    const dm = approved
      ? `✅ ทีม "${draft.teamName}" ของคุณได้รับการยืนยันแล้ว! ชื่อทีมขึ้นบนไลน์การแข่งขันแล้วครับ`
      : `❌ ทีม "${draft.teamName}" ยังไม่ได้รับการยืนยัน กรุณากด "สมัครทีม RoV" เพื่อแก้ไขและส่งใหม่ หรือติดต่ออาจารย์จิมมี่/อาจารย์พีครับ`;
    await member.send(dm).catch(() => {});
  }

  const original = interaction.message.embeds[0];
  const updated = EmbedBuilder.from(original)
    .setColor(approved ? 0x22c55e : 0x6b7280)
    .setTitle(approved ? '🎮 ทีม RoV — ✅ ยืนยันแล้ว' : '🎮 ทีม RoV — ❌ ปฏิเสธแล้ว')
    .addFields({ name: 'ตัดสินโดย', value: `<@${interaction.user.id}>` });
  await interaction.editReply({ embeds: [updated], components: [] });
}

function normalizeName(name) {
  return name.replace(/\s+/g, '').trim();
}

async function runVerify(interaction, studentId, inputName) {
  const record = roster.get(studentId);

  if (!record) {
    await interaction.reply({
      content: 'ไม่พบเลขประจำตัวนักเรียนนี้ในระบบ กรุณาตรวจสอบอีกครั้ง หรือติดต่อแอดมิน',
      ephemeral: true,
    });
    return;
  }

  if (normalizeName(record.name) !== normalizeName(inputName)) {
    await interaction.reply({
      content: 'ชื่อ-นามสกุลไม่ตรงกับเลขประจำตัวนักเรียนที่กรอก กรุณาตรวจสอบอีกครั้ง',
      ephemeral: true,
    });
    return;
  }

  if (record.status !== 'กำลังศึกษา') {
    await interaction.reply({
      content: 'สถานะนักเรียนของคุณไม่ใช่ "กำลังศึกษา" ในระบบ กรุณาติดต่อแอดมินเพื่อตรวจสอบ',
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  const role = guild.roles.cache.find((r) => r.name === record.branch);
  const verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!role || !verifiedRole) {
    await interaction.reply({
      content: `ไม่พบ role ที่จำเป็น (สาขา "${record.branch}" หรือ role ยืนยันตัวตน) กรุณาแจ้งแอดมินให้รัน setup-roles.js ก่อน`,
      ephemeral: true,
    });
    return;
  }

  // role ห้องเรียนตามข้อมูลในไฟล์ (ถ้ามี — สร้างไว้ด้วย setup-classes.js)
  const rolesToAdd = [role, verifiedRole];
  const classRole = record.room ? guild.roles.cache.find((r) => r.name === record.room) : null;
  if (classRole) rolesToAdd.push(classRole);

  // ตอบรับทันที กันข้อความ "การโต้ตอบนี้ล้มเหลว" — ให้ role + ตั้งชื่อเล่น (2 คำขอ Discord) อาจรวมกันเกิน 3 วิ
  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.member.roles.add(rolesToAdd);
  } catch (err) {
    console.error('เพิ่ม role ไม่สำเร็จ:', err);
    await interaction.editReply({ content: 'เกิดข้อผิดพลาดในการให้สิทธิ์ กรุณาติดต่อแอดมิน' });
    return;
  }

  try {
    await interaction.member.setNickname(record.name);
  } catch (err) {
    console.warn('ตั้งชื่อเล่นไม่สำเร็จ (สิทธิ์บอทอาจไม่พอ หรือผู้ใช้เป็นเจ้าของเซิร์ฟเวอร์):', err.message);
  }

  const classNote = classRole ? ` ห้อง ${record.room}` : '';
  await interaction.editReply({
    content: `ยืนยันตัวตนสำเร็จ! ยินดีต้อนรับ ${record.name} (${record.room}) เข้าสาขา ${record.branch}${classNote} 🎉`,
  });
}

// ===== ระบบตรวจข้อความผิดกฎอัตโนมัติ =====

// บทลงโทษอัตโนมัติตามจำนวนครั้งที่เตือน (ยิ่งบ่อยยิ่งนาน)
// ครบ 3 ครั้ง → 10 นาที, 5 ครั้ง → 1 ชม., 7 ครั้งขึ้นไป → 24 ชม.
function timeoutForWarnings(count) {
  if (count >= 7) return { ms: 24 * 60 * 60 * 1000, label: '24 ชั่วโมง' };
  if (count >= 5) return { ms: 60 * 60 * 1000, label: '1 ชั่วโมง' };
  if (count >= 3) return { ms: 10 * 60 * 1000, label: '10 นาที' };
  return null;
}

// ให้ role ตามเลเวล (เหลือ role เลเวลปัจจุบันตัวเดียว) + ประกาศเลเวลอัป
async function handleLevelUp(message, level) {
  await message.channel
    .send(`🎉 <@${message.author.id}> เลเวลอัปเป็น **เลเวล ${level}** แล้ว! 🆙`)
    .catch(() => {});

  const target = economy.levelRoleFor(level);
  if (!target || !message.member) return;
  try {
    const allLevelNames = economy.LEVEL_ROLES.map((lr) => lr.name);
    const toRemove = message.member.roles.cache.filter((r) => allLevelNames.includes(r.name) && r.name !== target.name);
    for (const r of toRemove.values()) await message.member.roles.remove(r).catch(() => {});
    const role = message.guild.roles.cache.find((r) => r.name === target.name);
    if (role && !message.member.roles.cache.has(role.id)) await message.member.roles.add(role).catch(() => {});
  } catch (err) {
    console.warn('ให้ role เลเวลไม่สำเร็จ:', err.message);
  }
}

client.on('messageCreate', async (message) => {
  if (!message.guild) return;

  // ห้องดักบอท — ใครก็ตาม (คน/self-bot/บอท) พิมพ์ข้อความในห้องนี้ ถือว่าต้องสงสัยว่าเป็นบอทสแปม เตะออกทันที
  // ยกเว้นข้อความของบอทเราเอง (เช่นตอนโพสต์ป้ายเตือนตอน setup)
  if (message.channel.name === BOT_TRAP_CHANNEL_NAME && message.author.id !== client.user.id) {
    await message.delete().catch(() => {});
    let kicked = false;
    try {
      if (message.member) {
        await message.member.kick('พิมพ์ข้อความในห้องดักบอท (ต้องสงสัยว่าเป็นบอทสแปม/self-bot)');
        kicked = true;
      }
    } catch (err) {
      console.warn('เตะสมาชิกที่โดนห้องดักบอทจับได้ไม่สำเร็จ (เช็คว่าบอทมีสิทธิ์ Kick Members หรือยัง):', err.message);
    }
    const modLogChannel = message.guild.channels.cache.find((c) => c.name === 'mod-log');
    if (modLogChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x7c2d12)
        .setTitle('🪤 ห้องดักบอททำงาน')
        .addFields(
          { name: 'สมาชิก', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          {
            name: 'ผลลัพธ์',
            value: kicked
              ? '✅ เตะออกจากเซิร์ฟเวอร์แล้ว'
              : '⚠️ ลบข้อความแล้ว แต่เตะไม่สำเร็จ — เช็คว่าบอทมีสิทธิ์ "Kick Members" หรือยัง',
          },
          { name: 'ข้อความ', value: message.content?.slice(0, 500) || '(ไม่มีข้อความ/มีแต่ไฟล์แนบ)' }
        )
        .setTimestamp();
      await modLogChannel.send({ embeds: [embed] }).catch(() => {});
    }
    return;
  }

  if (message.author.bot) return;
  if (!message.content && message.attachments.size === 0) return;

  // 0) ตรวจรูปภาพที่แนบมา (ถ้ามี) — ลบทันทีถ้า AI สงสัยว่าผิดกฎ
  // หมายเหตุ: โมเดล vision ฟรีที่ใช้ตรวจภาษาไทยในภาพได้ไม่แม่น มี false positive พอสมควร
  // จึงแค่ "ลบ" เท่านั้น ไม่ตัดคะแนน/ไม่ timeout กันนักเรียนโดนลงโทษเกินจริงจาก AI ที่ยังไม่แม่น 100%
  const imageAttachments = [...message.attachments.values()].filter((a) =>
    (a.contentType || '').startsWith('image/')
  );
  for (const attachment of imageAttachments) {
    let imgResult;
    try {
      imgResult = await moderateImage(attachment.url);
    } catch (err) {
      imgResult = { flagged: false };
    }
    if (!imgResult.flagged) continue;

    const channelName = message.channel.name;
    let evidenceAttachment = null;
    try {
      const res = await fetch(attachment.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      evidenceAttachment = new AttachmentBuilder(buffer, { name: attachment.name || 'evidence.jpg' });
    } catch (err) {
      console.warn('ดาวน์โหลดรูปหลักฐานไม่สำเร็จ:', err.message);
    }

    try {
      await message.delete();
    } catch (err) {
      console.warn('ลบข้อความ (รูปภาพ) ไม่สำเร็จ:', err.message);
    }

    try {
      const warnMsg = await message.channel.send(
        `⚠️ <@${message.author.id}> รูปภาพถูกลบเนื่องจาก AI ตรวจพบว่าอาจผิดกฎ (${imgResult.reason})\n` +
          'หากคิดว่าเป็นความผิดพลาด ติดต่อแอดมิน/ครูได้เลย'
      );
      setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
    } catch (err) {
      console.warn('ส่งข้อความเตือนไม่สำเร็จ:', err.message);
    }

    const modLogChannel = message.guild.channels.cache.find((c) => c.name === 'mod-log');
    if (modLogChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🖼️ ลบรูปภาพต้องสงสัย (AI ตรวจ)')
        .addFields(
          { name: 'สมาชิก', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'ห้อง', value: `#${channelName}`, inline: true },
          { name: 'เหตุผลจาก AI', value: imgResult.reason || 'ไม่ระบุ' },
          { name: 'หมายเหตุ', value: 'ตรวจอัตโนมัติเท่านั้น ยังไม่ตัดคะแนน/ไม่ timeout — โปรดตรวจสอบด้วยตาก่อนดำเนินการเพิ่มเติม' }
        )
        .setTimestamp();
      if (evidenceAttachment) {
        embed.setImage(`attachment://${evidenceAttachment.name}`);
        await modLogChannel
          .send({ embeds: [embed], files: [evidenceAttachment] })
          .catch((err) => console.warn('ส่ง mod-log ไม่สำเร็จ:', err.message));
      } else {
        await modLogChannel.send({ embeds: [embed] }).catch((err) => console.warn('ส่ง mod-log ไม่สำเร็จ:', err.message));
      }
    }
    return; // ลบไปแล้ว ไม่ต้องตรวจข้อความ/ให้ XP ต่อ
  }

  if (!message.content) return; // มีแต่รูป (ผ่านการตรวจแล้ว) ไม่มีข้อความให้ตรวจต่อ

  // 1) ตรวจข้อความผิดกฎก่อน
  let result;
  try {
    result = await moderateMessage(message.content);
  } catch (err) {
    result = { flagged: false };
  }

  if (result.flagged) {
    const warnCount = addWarning(message.author.id);
    const channelName = message.channel.name;
    try {
      await message.delete();
    } catch (err) {
      console.warn('ลบข้อความไม่สำเร็จ:', err.message);
    }

    // ลงโทษอัตโนมัติตามจำนวนครั้งที่เตือน (Timeout ยิ่งเตือนบ่อยยิ่งนาน)
    const punish = timeoutForWarnings(warnCount);
    let punishNote = '';
    if (punish && message.member) {
      try {
        await message.member.timeout(punish.ms, `ผิดกฎครบ ${warnCount} ครั้ง: ${result.reason}`);
        punishNote = ` และถูกปิดเสียง (Timeout) ${punish.label}`;
      } catch (err) {
        console.warn('Timeout ไม่สำเร็จ (อาจเป็นแอดมิน/เจ้าของ):', err.message);
      }
    }

    try {
      const warnMsg = await message.channel.send(
        `⚠️ <@${message.author.id}> ข้อความถูกลบเนื่องจากผิดกฎ (${result.reason}) — เตือนครั้งที่ ${warnCount}${punishNote}\n` +
          'อ่านกฎเพิ่มเติมได้ที่ห้อง #กฎ-ระเบียบ'
      );
      setTimeout(() => warnMsg.delete().catch(() => {}), 8000);
    } catch (err) {
      console.warn('ส่งข้อความเตือนไม่สำเร็จ:', err.message);
    }
    const modLogChannel = message.guild.channels.cache.find((c) => c.name === 'mod-log');
    if (modLogChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🚨 ลบข้อความผิดกฎ')
        .addFields(
          { name: 'สมาชิก', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'ห้อง', value: `#${channelName}`, inline: true },
          { name: 'เตือนครั้งที่', value: String(warnCount), inline: true },
          { name: 'เหตุผล', value: `${result.reason} (แหล่งตรวจ: ${result.source})` },
          { name: 'บทลงโทษ', value: punish ? `Timeout ${punish.label}` : 'เตือนอย่างเดียว' },
          { name: 'ข้อความต้นฉบับ', value: message.content.slice(0, 1000) }
        )
        .setTimestamp();
      await modLogChannel.send({ embeds: [embed] }).catch((err) => console.warn('ส่ง mod-log ไม่สำเร็จ:', err.message));
    }
    return; // ข้อความผิดกฎ ไม่ให้ XP/ไม่นับ quiz
  }

  // 2) เช็กคำตอบ quiz — คนแรกที่ตอบถูกได้เหรียญ
  try {
    if (quiz.isCorrect(message.channelId, message.content)) {
      const q = quiz.endQuiz(message.channelId);
      if (q) {
        economy.addCoins(message.author.id, q.reward);
        await message.channel
          .send(`🎉 <@${message.author.id}> ตอบถูก! ได้ 🪙 **${q.reward}** เหรียญ (คำตอบ: **${q.rawAnswer}**)`)
          .catch(() => {});
      }
    }
  } catch (err) {
    console.warn('เช็ก quiz ไม่สำเร็จ:', err.message);
  }

  // 3) ให้ XP + เหรียญจากการแชท (มีคูลดาวน์กันสแปมในตัว)
  try {
    const reward = economy.tryMessageReward(message.author.id);
    if (reward && reward.leveledUp) await handleLevelUp(message, reward.level);
  } catch (err) {
    console.warn('ให้ XP ไม่สำเร็จ:', err.message);
  }
});

client.login(BOT_TOKEN);
