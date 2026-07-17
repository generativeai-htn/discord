# CLAUDE.md — คู่มือโปรเจกต์สำหรับ AI/นักพัฒนา

ไฟล์นี้คือ "กติกาถาวร" ของโปรเจกต์ อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง จะได้เข้าใจโครงสร้าง+ข้อควรระวังทันที
ภาษาที่ใช้กับผู้ใช้: **ภาษาไทย** (ผู้ใช้เป็นคนไทย ข้อความในบอททุกอย่างเป็นไทย)

## โปรเจกต์นี้คืออะไร
Discord bot ตัวเดียว (`htn_bot`) สำหรับชุมชน **วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่ (HTN)** — ระดับ ปวช./ปวส.
Node.js + discord.js v14 รันเป็นโปรเซสเดียวที่ทำทุกระบบ (ไม่ใช่หลายบอท)

## รันยังไง
- รันถาวรผ่าน **pm2** ชื่อโปรเซส `htn-bot` (config: `ecosystem.config.js`) — autorestart ถ้า crash
- `bot.js` คือ entrypoint หลัก (long-running) และ **เปิดเว็บแดชบอร์ด** (`dashboard.js`) ที่ `http://localhost:3000` ในโปรเซสเดียวกัน
- **กันบอทหลุด: Scheduled Task ชื่อ "HTN-Bot-Watchdog" รันเป็น SYSTEM** (ตั้งเมื่อ 2026-07-13) — ทำงานตอนบูต
  + เช็คซ้ำทุก 5 นาทีตลอดไป เรียก `pm2-watchdog.bat` (ตั้ง `PM2_HOME` เองชัดเจน แล้ว `pm2 resurrect`)
  รันเป็น SYSTEM จึงไม่ผูกกับ session ผู้ใช้คนไหนเลย รอดแม้ sign out/session หลุดโดยไม่ได้ reboot
  (ปัญหาเดิม: ไฟล์ `.bat` ใน Windows Startup folder ทำงานแค่ตอน "ล็อกอินหลังบูต" เท่านั้น ถ้า pm2 ตายระหว่าง
  session โดยไม่มีการ reboot จะไม่มีอะไรมาช่วยฟื้นเลย — เจอจริง 13 ก.ค. บอทหายไปทั้งคืนทั้งที่เครื่องไม่ได้ปิด)
  ไฟล์ Startup folder เดิม (`htn-bot-start.bat`) ยังอยู่ไม่ได้ลบ (ไม่มีอันตราย รันซ้ำแค่เรียก resurrect เฉยๆ)
- **⚠️ แก้โค้ดหรือแก้ `.env` แล้วต้อง `pm2 restart htn-bot`** ถึงจะมีผล (ยกเว้นสิ่งที่โหลดสด — ดูด้านล่าง)

## คำสั่ง pm2 ที่ใช้บ่อย
```bash
pm2 status              # ดูสถานะ
pm2 logs htn-bot        # ดู log สด
pm2 restart htn-bot     # รีสตาร์ทหลังแก้โค้ด/แก้ .env
pm2 resurrect           # เปิดกลับมาถ้าเผลอหยุด (idempotent ปลอดภัย ไม่สร้างตัวซ้ำ)
```

## Discord ที่ต้องตั้งค่า (สำคัญ — ถ้าขาด บอทจะพัง)
Privileged Intents (Developer Portal → Bot): **Message Content Intent** + **Server Members Intent**
สิทธิ์ role `htn_bot` ที่ต้องมี: **Manage Channels, Manage Roles, Manage Messages, Timeout/Moderate Members, Manage Nicknames, Kick Members**
(Kick Members ใช้กับห้อง 🪤 ห้องดักบอทเท่านั้น — ยังไม่ได้ให้สิทธิ์นี้ ต้องเปิดเองใน Server Settings → Roles)
(Administrator ถูกถอดออกแล้ว — ทุกสคริปต์ฝังสิทธิ์บอทเองในแต่ละห้องไว้ กันบอทล็อกตัวเองออก)

## โมดูลตอนรัน (require โดย bot.js)
| ไฟล์ | หน้าที่ |
|---|---|
| `bot.js` | entrypoint — ลงทะเบียน slash commands, ปุ่ม/modal, event handlers, เปิดแดชบอร์ด+backup |
| `roster.js` | โหลดรายชื่อนักเรียนจาก `รายชื่อนักศึกษา.xlsx` (อ่านเฉพาะ เลขนักเรียน/ห้อง/ชื่อ/สถานะ — **ไม่อ่านเลขบัตร ปชช./วันเกิด**) |
| `teachers.js` | รายชื่อครูจาก `รายชื่อครู.xlsx` (อ่านเฉพาะชื่อ+ตำแหน่ง **ไม่อ่าน PIN/UID**) + คำขอรออนุมัติ + ล็อกชื่อครู 1 ชื่อ/1 บัญชี |
| `alumni.js` | ค่าคงที่ระบบศิษย์เก่า (role/ห้อง) |
| `verified-role.js` | ชื่อ role "นักเรียน (ยืนยันแล้ว)" |
| `branches.js` | รายชื่อสาขา (บัญชี / เทคโนโลยีธุรกิจดิจิทัล-คอมพิวเตอร์ธุรกิจ / การจัดการ / ช่างยนต์-เทคนิคยานยนต์) |
| `game-roles.js` | รายชื่อเกมสำหรับ reaction role |
| `openrouter.js` | เรียก AI (OpenRouter) — ใช้โดย `/ask` และ moderation |
| `ai-config.js` | system prompt AI (ยึดข้อมูลวิทยาลัย) + `OPENROUTER_MODEL` (ค่าเริ่มต้น `openai/gpt-oss-20b:free`) + `OPENROUTER_VISION_MODEL` (ค่าเริ่มต้น `nvidia/nemotron-nano-12b-v2-vl:free`) |
| `pollinations.js` | เจนภาพฟรี (ไม่ต้องมี API key) — ใช้โดย `/image` |
| `moderation.js` | ตรวจข้อความ 2 ชั้น (blocklist ทันที + watchlist ให้ AI ดู) รวม `banned-words.js` + `custom-words.js` |
| `image-moderation.js` | ตรวจรูปภาพที่แนบมาด้วย AI vision (`OPENROUTER_VISION_MODEL`) — พบผิดกฎ **ลบทันทีอย่างเดียว ไม่ตัดคะแนน/ไม่ timeout** เพราะโมเดลฟรีที่ใช้อ่านภาษาไทยในภาพไม่แม่น มี false positive สูง |
| `banned-words.js` | บัญชีคำต้องห้ามในโค้ด (แก้แล้วต้องรีสตาร์ท) |
| `custom-words.js` | คำที่แอดมินเพิ่มเองตอนรัน → `custom-words.json` (**อ่านสดทุกครั้ง ไม่ต้องรีสตาร์ท**) |
| `warnings.js` | นับจำนวนครั้งที่เตือน → `warnings.json` |
| `tournaments.js` | ระบบแข่งขัน (bracket/schedule) → `tournaments.json` |
| `economy.js` | XP/เลเวล/เหรียญ + role เลเวล → `economy.json` |
| `quiz.js` | สถานะ quiz (in-memory) |
| `announcements.js` | ประกาศตั้งเวลา → `announcements.json` |
| `dashboard.js` | เว็บแดชบอร์ด Express (ประกาศ/สมาชิก/จัดแข่ง/สถิติ) auth ด้วย `DASHBOARD_PASSWORD` |
| `backup.js` | สำรองข้อมูล → `backups/` (รันตอนสตาร์ท + ทุก 24 ชม. เก็บ 14 ชุด) |

## สคริปต์ setup (รันครั้งเดียว/ตามต้องการ — idempotent ทุกตัว)
ลำดับตอนตั้งเซิร์ฟเวอร์ใหม่: `setup-server` → `cleanup-defaults` → `setup-roles` → `setup-classes` → `setup-modlog` → `setup-bot-access` → `setup-content` → `setup-welcome` → `setup-teachers` → `setup-alumni` → `setup-fun` → `setup-nicknames` → `setup-live-board-trap`
`setup-live-board-trap.js` เพิ่ม 3 ห้อง: 📺 Live Showoff (voice สาธารณะ ดูได้ทุกคน แต่ live/สตรีมได้เฉพาะนักเรียนยืนยันแล้ว+ครู
ผ่านสิทธิ์ `Stream`), 📋 กระดานถาม-ตอบ (forum ภายในเท่านั้น sync จากหมวด 💬 ทั่วไป), 🪤 ห้องดักบอท (text สาธารณะ เปิดให้พิมพ์ได้
ตั้งใจ — ใครพิมพ์ในห้องนี้โดน `bot.js` ลบ+เตะทันที ต้องให้สิทธิ์ **Kick Members** กับ role htn_bot ก่อน ไม่งั้นเตะไม่ได้ ลบได้อย่างเดียว)
(ดูรายละเอียดแต่ละตัวใน `README.md` ซึ่งเป็นคู่มือ setup ฉบับเต็ม)
`check-openrouter-models.js`, `list-channels.js` = เครื่องมือ debug ชั่วคราว

## ไฟล์ข้อมูล (gitignored ทั้งหมด — ห้าม commit)
ความลับ: `.env` (BOT_TOKEN, GUILD_ID, OPENROUTER_API_KEY, DASHBOARD_PASSWORD)
ข้อมูลส่วนบุคคล: `รายชื่อนักศึกษา.xlsx`, `รายชื่อครู.xlsx`
state: `economy.json`, `tournaments.json`, `announcements.json`, `warnings.json`, `teacher-pending.json`, `teacher-claimed.json`, `custom-words.json`
+ `backups/`, `node_modules/`

## สิ่งที่โหลด "สด" ไม่ต้องรีสตาร์ท
- คำต้องห้ามที่เพิ่มผ่าน `/badword-add` (custom-words.json อ่านทุกครั้งที่ตรวจ)
- teacher roster (teachers.js อ่านไฟล์ใหม่ทุก call)
- รายชื่อนักเรียน: cache ตอนสตาร์ท (`let roster`) — อัปเดตไฟล์แล้วใช้ **`/reload-roster`** (ไม่ต้องรีสตาร์ท)

## Gotchas / บทเรียนที่เจอมาแล้ว (อ่านก่อนแก้ เรื่องพวกนี้)
- **บอทตั้งชื่อเล่นของเจ้าของเซิร์ฟเวอร์ไม่ได้** — ข้อจำกัด Discord (setNickname fail = Missing Permissions) นักเรียนทั่วไปตั้งได้ปกติ โค้ด catch error ไว้แล้ว
- **ชื่อเล่นถูกล็อก** — ปิด "Change Nickname" ของ @everyone แล้ว (setup-nicknames.js) สมาชิกเปลี่ยนเองไม่ได้ บอทตั้งให้ล็อกถาวร
- **สร้าง role ที่มีสิทธิ์ที่บอทไม่มีไม่ได้** — ตอนสร้าง role คุณครู (มี Timeout) บอทต้องมี Timeout Members ก่อน
- **แก้ข้อความบอทที่มีไฟล์แนบ** ต้องส่ง `attachments: []` ด้วย ไม่งั้นไฟล์เก่าค้าง
- **ห้องที่ทำ read-only ทำให้บอทโพสต์เองไม่ได้** ถ้าไม่ฝังสิทธิ์บอท — สคริปต์ setup แก้ให้แล้วทุกตัว
- **curl บน Windows ทำภาษาไทยเพี้ยน** — ทดสอบ API ที่ส่งไทยให้ยิงผ่าน Node fetch (UTF-8 ถูก) ไม่ใช่ curl
- **pm2 resurrect ปลอดภัย** รันตอนบอทรันอยู่ก็ไม่สร้างตัวซ้ำ (ยืนยันแล้ว)
- **⚠️ ห้ามใช้ `timeout` ในสคริปต์ `.bat` ที่รันตอน Windows logon (Startup folder)** — คำสั่ง `timeout` ต้องการ
  console/stdin แบบ interactive ซึ่งไม่มีให้ตอน Windows รันไฟล์ใน Startup folder ทำให้ fail เงียบๆ
  (เจอจริง: `htn-bot-start.bat` fail มาตั้งแต่ 2026-07-06 ทุกรอบรีบูต ทำให้บอทไม่เคยฟื้นตัวเองเลย ต้อง
  `pm2 resurrect` มือทุกครั้ง จนกว่าจะสังเกตเห็นจาก `startup-log.txt` มีข้อความ "The system cannot find
  the path specified") **แก้แล้วโดยเปลี่ยนไปใช้ `ping -n 31 127.0.0.1 >nul` แทน** (ไม่ต้องพึ่ง console)
  ทดสอบยืนยันด้วยการรันสคริปต์แบบ detached process (จำลองการรันตอน Startup จริง) แล้วเช็ค log สำเร็จ
- **⚠️ ห้องย่อยไม่สืบทอดสิทธิ์จากหมวดหมู่อัตโนมัติ** — ทั้ง Discord จริงและ discord.js คำนวณสิทธิ์จาก
  override ของ "ห้องนั้นเอง" เท่านั้น ถ้าห้องย่อยไม่มี override ของตัวเลย จะใช้สิทธิ์เริ่มต้น (มองเห็นได้)
  ทั้งที่หมวดหมู่แม่ล็อกไปแล้ว ("Sync to Category" ใน UI คือการ**คัดลอก**ค่าลงจริงๆ ไม่ใช่การอ้างอิงสด)
  เคยเกิดจริง: ทุกห้องใน 💬ทั่วไป/📚วิชาการ/🎮เกม-กีฬา/🛋ผ่อนคลาย/🛠ช่วยเหลือ/🏫ทุกสาขา รั่วให้บุคคลภายนอกเห็นได้
  มาตั้งแต่ต้น เพราะ `setup-roles.js`/`setup-teachers.js` เดิมตั้งสิทธิ์แค่ระดับหมวดหมู่ ไม่ sync ลงห้องย่อย
  แก้แล้วโดยให้ทั้งสองสคริปต์เรียก `channel.lockPermissions()` กับห้องย่อยทุกห้องหลังตั้งสิทธิ์หมวดหมู่เสมอ —
  **ถ้าเพิ่มห้อง/หมวดหมู่ใหม่ในอนาคต ต้องรัน `setup-roles.js` (และ `setup-teachers.js` ถ้าเกี่ยวครู) ซ้ำทุกครั้ง**
  ห้ามเช็คสิทธิ์ด้วย `category.permissionsFor()` เฉยๆ ต้องเช็คที่ตัวห้องจริงเสมอ
- **โมเดล vision ฟรี (`nvidia/nemotron-nano-12b-v2-vl:free`) หลอน (hallucinate) บ่อย** — ทดสอบภาพข้อความไทยล้วนๆ ที่ไม่ผิดอะไรเลย 5 ครั้ง ฟ้องผิดกฎมั่ว 2 ครั้ง จึงออกแบบให้ `image-moderation.js` **ลบอย่างเดียว ไม่ตัดคะแนน/ไม่ timeout** ห้ามเปลี่ยนให้ auto-timeout จากผลตรวจภาพ เว้นแต่เปลี่ยนโมเดลแล้วทดสอบซ้ำจนมั่นใจ

## Conventions
- ข้อความผู้ใช้ = ภาษาไทย; คำตอบส่วนตัว = `ephemeral: true`; embed ใส่ footer "วิทยาลัยเทคโนโลยีไฮเทค หนองไผ่"
- คำสั่งแอดมิน gate ด้วย `ManageGuild` (งานหนัก) หรือ `ManageMessages` (ครู/ทีมงานใช้ได้: badword, tournament, announce, quiz, image)
- customId ปุ่ม/modal: prefix แล้วตามด้วยข้อมูล เช่น `tournamentRegister:<ชื่อ>`, `gameRole:<key>`, `teacherApprove:<userId>`
- ทุกฟีเจอร์ทำได้ทั้ง "พิมพ์คำสั่ง" และ "กดปุ่ม" (ปุ่มเปิด modal เรียก handler เดียวกับคำสั่ง)

## บริการภายนอก
- **OpenRouter** (AI ถาม-ตอบ + moderation) — โมเดลฟรีบางตัวถูกยกเลิกเป็นครั้งคราว ใช้ `check-openrouter-models.js` หาตัวใหม่แล้วแก้ `OPENROUTER_MODEL`
- **Pollinations.ai** (เจนภาพ) — ฟรี ไม่ต้องมี key
- ลิงก์เชิญเซิร์ฟเวอร์ (ถาวร): https://discord.gg/78U3xgSadV
