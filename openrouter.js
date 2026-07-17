/**
 * openrouter.js
 * เรียก OpenRouter API (https://openrouter.ai) แบบ REST ตรงๆ ผ่าน fetch ในตัวของ Node
 * OpenRouter รวมโมเดล AI หลายค่าย (Llama, Gemini, DeepSeek ฯลฯ) ไว้ในคีย์เดียว
 * ใช้ endpoint แบบ OpenAI-compatible (chat/completions)
 */

const { OPENROUTER_MODEL, OPENROUTER_VISION_MODEL, SYSTEM_PROMPT } = require('./ai-config');

async function chatCompletion(systemPrompt, userMessage) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY ในไฟล์ .env');
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) {
    throw new Error('OpenRouter ไม่ได้ตอบข้อความกลับมา');
  }
  return text;
}

async function askAI(question) {
  return chatCompletion(SYSTEM_PROMPT, question);
}

// ตรวจภาพด้วยโมเดล vision — โมเดลฟรีตัวนี้เจอ rate-limit/timeout เป็นครั้งคราว
// จึงใส่ timeout ต่อครั้ง + ลองซ้ำ 1 ครั้งก่อนยอมแพ้ (ปล่อยผ่านไว้ก่อนถ้ายังไม่สำเร็จ ให้ผู้เรียกตัดสินใจ)
async function visionCompletion(systemPrompt, imageUrl, { timeoutMs = 15000, retries = 1 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY ในไฟล์ .env');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: OPENROUTER_VISION_MODEL,
          reasoning: { enabled: false }, // ปิด reasoning ให้ตอบเร็วขึ้น กันหลุด timeout
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemPrompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter vision API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('OpenRouter ไม่ได้ตอบข้อความกลับมา (vision)');
      return text;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

module.exports = { askAI, chatCompletion, visionCompletion };
