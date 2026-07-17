/**
 * ecosystem.config.js — คอนฟิก pm2 สำหรับรันบอทถาวร 24 ชม.
 *
 * คำสั่งที่ใช้บ่อย:
 *   pm2 start ecosystem.config.js   # เริ่มรันบอท
 *   pm2 status                      # ดูสถานะ
 *   pm2 logs htn-bot                # ดู log สด
 *   pm2 restart htn-bot             # รีสตาร์ท (หลังแก้โค้ด)
 *   pm2 stop htn-bot                # หยุด
 *   pm2 save                        # จำรายการโปรเซสไว้ให้เปิดเองหลังบูตเครื่อง
 */
module.exports = {
  apps: [
    {
      name: 'htn-bot',
      script: 'bot.js',
      cwd: __dirname,
      autorestart: true, // รีสตาร์ทเองถ้า crash
      max_restarts: 20,
      restart_delay: 5000, // รอ 5 วิ ก่อนรีสตาร์ท (กันลูปรัวๆ)
      max_memory_restart: '500M',
    },
  ],
};
