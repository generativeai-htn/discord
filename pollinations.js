/**
 * pollinations.js
 * เจนภาพด้วย Pollinations.ai — ฟรี ไม่ต้องใช้ API key เลย
 * ยิง GET ไปที่ endpoint พร้อม prompt แล้วได้ไบต์ของรูปกลับมาตรงๆ
 */

async function generateImage(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`สร้างภาพไม่สำเร็จ (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { generateImage };
