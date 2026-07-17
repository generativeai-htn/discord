---
name: discord-college-server-setup
description: Sets up (or updates) a Discord server for a technical/vocational college community — designs the full channel/category structure and writes a runnable Node.js (discord.js) script that creates it via a bot. Covers official announcements, academics, PR/news, events, admissions (รับสมัครเรียน), games, sports, a chill/relax area, per-department (สาขา) channels, and voice channels grouped under each category. Use this skill whenever the user asks to build, design, or restructure a Discord server for a school/college/วิทยาลัย community, wants channels created automatically via a bot, or asks to expand this structure with new departments or categories.
---

# Discord College Server Setup

Builds a Discord community server structure for a technical/vocational college (วิทยาลัย) and generates a discord.js bot script that creates it automatically via the Discord API.

## When to use this

Trigger this skill for requests like:
- "สร้าง Discord server ให้วิทยาลัย"
- "ช่วยจัดห้อง Discord แยกหมวดหมู่/สาขา"
- "เพิ่มสาขาใหม่เข้าไปในโครงสร้างห้อง"
- Any request to create, expand, or regenerate the channel-creation script for a college Discord community

## Step 1 — Gather the missing details

Before writing/updating the script, confirm with the user (ask only for what's missing; don't re-ask what's already known):

1. **รายชื่อสาขาวิชา** (department/branch names) — each becomes its own sub-category with a text + voice channel. This is almost always the missing piece.
2. Any departments that need **extra channels** beyond the default text+voice pair (e.g. a workshop/lab channel).
3. Whether **admissions (รับสมัครเรียน)** should be open to public/prospective students or staff-only.
4. Server name / whether this is a brand-new server or an existing one being restructured (existing → script must be idempotent, see below).

If the user has already given this info earlier in the conversation, use it directly instead of asking again.

## Step 2 — Structure to implement

Build on this base structure (already agreed with the user); insert one category per branch under "แยกตามสาขา":

- **📌 ข้อมูลเซิร์ฟเวอร์**: กฎ-ระเบียบ (read-only), คู่มือการใช้งาน (read-only), รับยศเข้าใช้งาน
- **📢 ประกาศ-ข่าวประชาสัมพันธ์** (read-only text channels) + 🔊 ฟังประกาศ-ประชุมใหญ่
- **🎓 รับสมัครเรียน**: ข่าวรับสมัคร-กำหนดการ, คุณสมบัติ-ขั้นตอนสมัคร, ถาม-ตอบรับสมัคร + 🔊 สอบถามรับสมัคร
- **🎉 กิจกรรมวิทยาลัย**: ประกาศกิจกรรม-ประกวดแข่งขัน, งานอาสา-ชมรม + 🔊 นัดรวมกิจกรรม
- **💬 ทั่วไป**: แนะนำตัว, พูดคุยทั่วไป, ถาม-ตอบทั่วไป + 🔊 พูดคุยทั่วไป
- **📚 วิชาการ**: ถาม-การบ้าน, แนะแนว-ทุนการศึกษา, ข่าวสารวิชาการ + 🔊 ห้องติวรวม
- **🏫 แยกตามสาขา**: one category per branch, each with a text channel + 🔊 voice channel (name after the branch)
- **🎮 เกม-กีฬา**: คุยเกม, คุยกีฬา-แข่งขันกีฬา + 🔊 ปาร์ตี้เกม, 🔊 คุยกีฬา
- **🛋 ผ่อนคลาย**: มีม-รูปตลก, แชร์เพลง + 🔊 Chill นั่งคุยเล่น
- **🛠 ช่วยเหลือ**: แจ้งปัญหา-ติดต่อแอดมิน

Read-only channels deny `SendMessages` for `@everyone` via permission overwrites.

## Step 3 — Generate/update the script

Use `scripts/setup-server.js` as the base template (discord.js v14). It:
- Defines the structure as a `SERVER_STRUCTURE` array (category → list of channels, with `readOnly`/`voice` flags)
- Creates categories/channels idempotently — checks for existing names before creating, so it's safe to re-run after adding new branches
- Reads `BOT_TOKEN` and `GUILD_ID` from `.env`

When implementing for a specific college:
1. Copy the template into the user's project.
2. Fill in the `แยกตามสาขา` section of `SERVER_STRUCTURE` with the actual branch names the user gave you, each producing a text channel and a voice channel (`voice: true`).
3. Adjust admissions channel permissions if the user wants it staff-only (add a `readOnly` or custom role-based overwrite).
4. Keep the idempotency check intact — never remove the "skip if exists" logic, since colleges will re-run this script as they add branches or departments over time.
5. Also generate/update `package.json` (dependencies: `discord.js`, `dotenv`) and a short README with setup steps (create bot → invite with Manage Channels permission → fill `.env` with `BOT_TOKEN` and `GUILD_ID` → `npm install` → `node setup-server.js`).

## Step 4 — Verify before handing back

- Run `node -c setup-server.js` (or equivalent syntax check) to confirm the script is valid — do not attempt to actually connect to Discord (no real token is available in this context).
- Double check every branch the user listed appears exactly once under "แยกตามสาขา".
- Remind the user never to commit `BOT_TOKEN` to version control or share it.

## Reference files

- `scripts/setup-server.js` — base discord.js script template described above
- `scripts/package.json` — dependency manifest template
- `references/README.md` — setup/runbook instructions template to copy alongside the script
