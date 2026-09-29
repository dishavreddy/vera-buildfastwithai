import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.warn('[Vera] WARNING: GROQ_API_KEY is not set. The /api/chat endpoint will return an error.');
}

const SYSTEM_PROMPT =
  'You are Vera, a real-time voice AI interviewer. Conduct a natural, conversational interview. ' +
  'Ask one question at a time, wait for the full answer, and always respond to something specific ' +
  'the candidate just said before moving on — never ask a generic next question. Keep responses short ' +
  'and conversational, like a real interviewer speaking out loud, not written text. If interrupted, ' +
  'stop and respond to what the candidate just said. Never use markdown, bullet points, or numbered lists. ' +
  'Respond in plain spoken sentences only.';

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY. Add it to your .env file.' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.7,
    max_tokens: 200,
  };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Vera] Groq API error:', response.status, errText);
      return res.status(response.status).json({ error: `Groq API error: ${response.status}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
    return res.json({ reply });
  } catch (err) {
    console.error('[Vera] Request failed:', err);
    return res.status(500).json({ error: 'Failed to reach Groq API.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    groqConfigured: Boolean(GROQ_API_KEY),
  });
});

app.listen(PORT, () => {
  console.log(`[Vera] Backend running on http://localhost:${PORT}`);
});
