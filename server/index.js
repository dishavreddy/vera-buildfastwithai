import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.warn('[Vera] WARNING: GROQ_API_KEY is not set. The /api/chat endpoint will return an error.');
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function buildAdaptiveSystemPrompt(profile: unknown): string {
  if (!profile) {
    return (
      'You are Vera, a real-time voice AI interviewer. Conduct a natural, conversational interview. ' +
      'Ask one question at a time, wait for the full answer, and always respond to something specific ' +
      'the candidate just said before moving on — never ask a generic next question. Keep responses short ' +
      'and conversational, like a real interviewer speaking out loud, not written text. If interrupted, ' +
      'stop and respond to what the candidate just said. Never use markdown, bullet points, or numbered lists. ' +
      'Respond in plain spoken sentences only.'
    );
  }

  const profileText = JSON.stringify(profile, null, 2);

  return (
    `You are Vera, a real-time voice AI interviewer. Here is the candidate's background:\n\n${profileText}\n\n` +
    'Conduct a natural interview covering both behavioral/HR questions and technical questions grounded in ' +
    'their actual resume. Rules:\n' +
    '- Ask one question at a time, and always react to specifics in their last answer before moving on — ' +
    'never ask a generic next question.\n' +
    '- When they mention a project or technology, dig deeper with a follow-up before moving to a new topic ' +
    '(e.g. ask why they made a specific technical choice, then how it would change at larger scale).\n' +
    '- Include at least one real-time technical problem-solving question relevant to their stated skills, ' +
    'and adjust its difficulty based on how well they are answering.\n' +
    '- Reference something they said earlier in the call later on, if relevant, to test consistency.\n' +
    '- Keep every response short and conversational, like a real interviewer speaking out loud.\n' +
    '- If interrupted, stop immediately and respond to what they just said.\n' +
    '- Never use markdown, bullet points, or numbered lists. Respond in plain spoken sentences only.'
  );
}

async function callGroq(messages: { role: string; content: string }[], maxTokens: number): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Vera] Groq API error:', response.status, errText);
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// --- POST /api/chat ---
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY. Add it to your .env file.' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const sysContent = systemPrompt || buildAdaptiveSystemPrompt(null);

  try {
    const reply = await callGroq(
      [{ role: 'system', content: sysContent }, ...messages],
      200,
    );
    return res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
});

// --- POST /api/parse-resume ---
app.post('/api/parse-resume', async (req, res) => {
  const { fileBase64, fileName } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY.' });
  }

  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64 is required.' });
  }

  try {
    // Write the PDF to a temp file so pdf-parse can read it
    const buffer = Buffer.from(fileBase64, 'base64');
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `vera-resume-${Date.now()}-${fileName || 'resume.pdf'}`);
    fs.writeFileSync(tmpPath, buffer);

    let pdfText = '';
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(fs.readFileSync(tmpPath));
      pdfText = pdfData.text;
    } finally {
      fs.unlinkSync(tmpPath);
    }

    if (!pdfText || pdfText.trim().length < 20) {
      return res.status(422).json({ error: 'Could not extract meaningful text from this PDF. It may be image-based.' });
    }

    // Ask Groq to produce a structured candidate profile
    const profilePrompt = [
      {
        role: 'system',
        content:
          'You are a resume parser. Given the raw text of a resume, extract a structured candidate profile. ' +
          'Return ONLY valid JSON (no markdown, no code fences) with this exact shape:\n' +
          '{\n' +
          '  "name": "Full Name",\n' +
          '  "skills": ["skill1", "skill2", ...],\n' +
          '  "projects": [{ "name": "Project Name", "description": "one-line description" }],\n' +
          '  "experience": ["one-line role summaries"],\n' +
          '  "keyTechnologies": ["tech1", "tech2", ...]\n' +
          '}\n' +
          'If a field cannot be determined, use an empty array or empty string.',
      },
      {
        role: 'user',
        content: `Resume text:\n\n${pdfText.slice(0, 6000)}`,
      },
    ];

    const rawProfile = await callGroq(profilePrompt, 1000);

    // Strip any markdown fences if present
    let jsonStr = rawProfile.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    let profile;
    try {
      profile = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse resume profile as JSON.', raw: rawProfile });
    }

    return res.json({ profile, extractedText: pdfText.slice(0, 500) });
  } catch (err) {
    console.error('[Vera] Resume parse error:', err);
    return res.status(500).json({ error: 'Failed to parse resume PDF.' });
  }
});

// --- POST /api/report ---
app.post('/api/report', async (req, res) => {
  const { transcript, profile } = req.body;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY.' });
  }

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: 'transcript array is required.' });
  }

  const transcriptText = transcript
    .map((entry: { role: string; text: string }) => `${entry.role === 'assistant' ? 'Vera' : 'Candidate'}: ${entry.text}`)
    .join('\n\n');

  const profileContext = profile ? `\n\nCandidate background: ${JSON.stringify(profile)}` : '';

  const reportPrompt = [
    {
      role: 'system',
      content:
        'Analyze this interview transcript and produce a structured evaluation. ' +
        'Return ONLY valid JSON (no markdown, no code fences) with this exact shape:\n' +
        '{\n' +
        '  "communication": "rating or short assessment",\n' +
        '  "technicalKnowledge": "rating or short assessment",\n' +
        '  "problemSolving": "rating or short assessment",\n' +
        '  "projectUnderstanding": "rating or short assessment",\n' +
        '  "strengths": ["..."],\n' +
        '  "weaknesses": ["..."],\n' +
        '  "topicsToStudy": ["..."],\n' +
        '  "preparationSuggestion": "short personalized suggestion"\n' +
        '}',
    },
    {
      role: 'user',
      content: `Interview transcript:${profileContext}\n\n${transcriptText}`,
    },
  ];

  try {
    const rawReport = await callGroq(reportPrompt, 1500);

    let jsonStr = rawReport.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    let report;
    try {
      report = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse report as JSON.', raw: rawReport });
    }

    return res.json({ report });
  } catch (err) {
    console.error('[Vera] Report error:', err);
    return res.status(500).json({ error: 'Failed to generate report.' });
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
