/**
 * rov-teams.js
 * ระบบสมัครทีม "HTN x RoV Tournament 2569" แบบมีรายละเอียดนักกีฬาต่อคน
 * (ชื่อทีม + สมาชิก 5 ตัวจริง + 1 สำรอง โดยดึงชื่อ/สาขา/ระดับชั้นจากรหัสนักศึกษาอัตโนมัติ)
 *
 * เก็บทีมทั้งหมดใน rov-teams.json (คีย์ด้วย captainId — 1 คนคุมได้ 1 ทีมที่กำลังทำ)
 * เก็บ log ทุก action ใน rov-registration-log.json (audit trail กันข้อมูลหาย/ตรวจสอบย้อนหลังได้)
 * เก็บ claims (รหัสนักศึกษา -> captainId) แยกไว้กันสมัครซ้ำข้ามทีม
 */

const fs = require('fs');
const path = require('path');

const TEAMS_FILE = path.join(__dirname, 'rov-teams.json');
const LOG_FILE = path.join(__dirname, 'rov-registration-log.json');

const ROV_TOURNAMENT_NAME = 'HTN x RoV Tournament 2569';
const REQUIRED_STARTERS = 5;
const MAX_MEMBERS = 6;

function loadData() {
  if (!fs.existsSync(TEAMS_FILE)) return { teams: {}, claims: {} };
  try {
    const d = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf-8'));
    return { teams: d.teams || {}, claims: d.claims || {} };
  } catch {
    return { teams: {}, claims: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(TEAMS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function appendLog(entry) {
  let log = [];
  if (fs.existsSync(LOG_FILE)) {
    try {
      log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    } catch {
      log = [];
    }
  }
  log.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

function levelFromRoom(room) {
  if (!room) return '';
  if (room.startsWith('ปวช.')) return 'ปวช.';
  if (room.startsWith('ปวส.')) return 'ปวส.';
  return '';
}

function getDraft(captainId) {
  return loadData().teams[captainId] || null;
}

function findClaim(studentId) {
  return loadData().claims[studentId] || null;
}

function createDraft(captainId, teamName, actorTag) {
  const data = loadData();
  const existing = data.teams[captainId];
  if (existing && existing.status !== 'rejected') {
    throw new Error(`คุณมีทีม "${existing.teamName}" ที่กำลังทำอยู่แล้ว (สถานะ: ${existing.status}) ใช้ทีมเดิมต่อได้เลย`);
  }
  const nameTaken = Object.values(data.teams).some(
    (t) => t.teamName === teamName && t.captainId !== captainId && t.status !== 'rejected'
  );
  if (nameTaken) throw new Error(`มีทีมชื่อ "${teamName}" อยู่แล้ว กรุณาใช้ชื่ออื่น`);

  data.teams[captainId] = {
    captainId,
    teamName,
    members: [],
    status: 'draft', // draft -> pending -> confirmed | rejected(กลับไป draft ได้)
    threadId: null,
    confirmMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveData(data);
  appendLog({ action: 'create_team', captainId, actorTag, teamName });
  return data.teams[captainId];
}

function addMember(captainId, studentId, position, rosterRecord, actorTag) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ยังไม่ได้สร้างทีม กด "สมัครทีม RoV" ก่อน');
  if (draft.status !== 'draft') throw new Error(`ทีมนี้อยู่ในสถานะ "${draft.status}" แก้ไขไม่ได้แล้ว`);
  if (draft.members.length >= MAX_MEMBERS) throw new Error(`ทีมเต็มแล้ว (${MAX_MEMBERS} คน)`);
  if (draft.members.some((m) => m.studentId === studentId)) {
    throw new Error(`รหัส ${studentId} อยู่ในทีมนี้แล้ว`);
  }
  const claimant = data.claims[studentId];
  if (claimant && claimant !== captainId) {
    const otherTeam = data.teams[claimant];
    throw new Error(`รหัสนักศึกษานี้ถูกใช้สมัครทีม "${otherTeam?.teamName || 'อื่น'}" ไปแล้ว`);
  }

  draft.members.push({
    studentId,
    name: rosterRecord.name,
    room: rosterRecord.room,
    branch: rosterRecord.branch,
    level: levelFromRoom(rosterRecord.room),
    position,
  });
  draft.updatedAt = new Date().toISOString();
  data.claims[studentId] = captainId;
  saveData(data);
  appendLog({ action: 'add_member', captainId, actorTag, studentId, name: rosterRecord.name, position });
  return draft;
}

function removeMember(captainId, studentId, actorTag) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ไม่พบทีมของคุณ');
  if (draft.status !== 'draft') throw new Error(`ทีมนี้อยู่ในสถานะ "${draft.status}" แก้ไขไม่ได้แล้ว`);
  const idx = draft.members.findIndex((m) => m.studentId === studentId);
  if (idx === -1) throw new Error(`ไม่พบรหัส ${studentId} ในทีมนี้`);
  draft.members.splice(idx, 1);
  draft.updatedAt = new Date().toISOString();
  if (data.claims[studentId] === captainId) delete data.claims[studentId];
  saveData(data);
  appendLog({ action: 'remove_member', captainId, actorTag, studentId });
  return draft;
}

function cancelDraft(captainId, actorTag) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ไม่พบทีมของคุณ');
  for (const m of draft.members) {
    if (data.claims[m.studentId] === captainId) delete data.claims[m.studentId];
  }
  delete data.teams[captainId];
  saveData(data);
  appendLog({ action: 'cancel_team', captainId, actorTag, teamName: draft.teamName });
}

function validateForSubmit(draft) {
  const starters = draft.members.filter((m) => m.position === 'ตัวจริง').length;
  const subs = draft.members.filter((m) => m.position === 'สำรอง').length;
  if (starters !== REQUIRED_STARTERS) {
    return `ต้องมีตัวจริงครบ ${REQUIRED_STARTERS} คน (ตอนนี้มี ${starters} คน)`;
  }
  if (subs > 1) return 'มีผู้เล่นสำรองได้สูงสุด 1 คน';
  return null;
}

function submitDraft(captainId, actorTag) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ไม่พบทีมของคุณ');
  if (draft.status !== 'draft') throw new Error(`ทีมนี้อยู่ในสถานะ "${draft.status}" อยู่แล้ว`);
  const err = validateForSubmit(draft);
  if (err) throw new Error(err);
  draft.status = 'pending';
  draft.updatedAt = new Date().toISOString();
  saveData(data);
  appendLog({ action: 'submit_team', captainId, actorTag, teamName: draft.teamName });
  return draft;
}

function setThread(captainId, threadId) {
  const data = loadData();
  if (data.teams[captainId]) {
    data.teams[captainId].threadId = threadId;
    saveData(data);
  }
}

function setConfirmMessage(captainId, messageId) {
  const data = loadData();
  if (data.teams[captainId]) {
    data.teams[captainId].confirmMessageId = messageId;
    saveData(data);
  }
}

function confirmTeam(captainId, confirmedByTag) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ไม่พบทีมนี้ (อาจถูกลบไปแล้ว)');
  if (draft.status !== 'pending') throw new Error(`ทีมนี้ถูกจัดการไปแล้ว (สถานะปัจจุบัน: ${draft.status})`);
  draft.status = 'confirmed';
  draft.confirmedBy = confirmedByTag;
  draft.confirmedAt = new Date().toISOString();
  saveData(data);
  appendLog({ action: 'confirm_team', captainId, actorTag: confirmedByTag, teamName: draft.teamName });
  return draft;
}

function rejectTeam(captainId, rejectedByTag, reason) {
  const data = loadData();
  const draft = data.teams[captainId];
  if (!draft) throw new Error('ไม่พบทีมนี้ (อาจถูกลบไปแล้ว)');
  if (draft.status !== 'pending') throw new Error(`ทีมนี้ถูกจัดการไปแล้ว (สถานะปัจจุบัน: ${draft.status})`);
  draft.status = 'draft'; // เปิดให้แก้ไขและส่งใหม่ได้
  draft.rejectedBy = rejectedByTag;
  draft.rejectReason = reason || null;
  draft.updatedAt = new Date().toISOString();
  saveData(data);
  appendLog({ action: 'reject_team', captainId, actorTag: rejectedByTag, teamName: draft.teamName, reason });
  return draft;
}

function listConfirmedTeams() {
  return Object.values(loadData().teams).filter((t) => t.status === 'confirmed');
}

module.exports = {
  ROV_TOURNAMENT_NAME,
  REQUIRED_STARTERS,
  MAX_MEMBERS,
  getDraft,
  findClaim,
  createDraft,
  addMember,
  removeMember,
  cancelDraft,
  submitDraft,
  validateForSubmit,
  setThread,
  setConfirmMessage,
  confirmTeam,
  rejectTeam,
  listConfirmedTeams,
};
