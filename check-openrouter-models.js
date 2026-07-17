/**
 * check-openrouter-models.js
 * สคริปต์ตรวจสอบชั่วคราว: ทดสอบว่า OPENROUTER_API_KEY ใช้กับโมเดลฟรีตัวไหนได้บ้าง
 * ไม่พิมพ์ API key ออกมาเลย
 */
require('dotenv').config();

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('ไม่พบ OPENROUTER_API_KEY ใน .env');
  process.exit(1);
}

const CANDIDATES = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-chat-v3.1:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

async function testChat(model) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ตอบคำว่า OK คำเดียว' }],
    }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error?.message || res.status };
  const text = data?.choices?.[0]?.message?.content ?? '';
  return { ok: true, text };
}

(async () => {
  console.log('ไล่ทดสอบยิงจริงทีละตัวจากรายชื่อโมเดลฟรีตัวเก็ง:');
  for (const model of CANDIDATES) {
    process.stdout.write(`  ${model} ... `);
    try {
      const result = await testChat(model);
      if (result.ok) {
        console.log(`ใช้ได้ ✓ (ตอบ: "${result.text.trim().slice(0, 40)}")`);
      } else {
        console.log(`ใช้ไม่ได้ ✗ (${result.error})`);
      }
    } catch (err) {
      console.log(`error ✗ (${err.message})`);
    }
  }
})();
