import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env');
const inheritedGroqKey = process.env.GROQ_API_KEY;
try {
  process.loadEnvFile(envPath);
  if (inheritedGroqKey !== undefined) process.env.GROQ_API_KEY = inheritedGroqKey;
  console.info('[Vera config] Loaded environment file:', envPath);
} catch (error) {
  if (error?.code !== 'ENOENT') console.error('[Vera config] Could not load environment file:', envPath, error.message);
  else console.info('[Vera config] No .env file at expected project path:', envPath);
}

const app = express();
const PORT = Number(process.env.PORT || process.env.VERA_BACKEND_PORT || 3001);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    const allowed = !origin || frontendOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && frontendOrigins.length === 0);
    callback(null, allowed);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('/api/*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
console.info('[Vera config] GROQ_API_KEY loaded:', Boolean(GROQ_API_KEY));
console.info('[Vera config] FRONTEND_ORIGIN loaded:', frontendOrigins.length > 0);

function deploymentError(code, error, detail) {
  return process.env.NODE_ENV === 'production' ? { error, code } : { error, detail, code };
}

function profileFailureCode(error) {
  if (!GROQ_API_KEY) return 'NO_KEY';
  if (error.status === 429) return 'UPSTREAM_429';
  if (error.status === 504 || /timeout/i.test(error.message || '')) return 'TIMEOUT';
  if (error.status >= 500) return 'UPSTREAM_5XX';
  if (error.status === 401) return 'UPSTREAM_401';
  return 'PROFILE_FAILED';
}

const GROQ_CHAT_MODEL = 'openai/gpt-oss-20b';
const GROQ_CHAT_FALLBACK_MODEL = 'allam-2-7b';
const GROQ_PROFILE_MODEL = 'openai/gpt-oss-20b';
const GROQ_REPORT_MODEL = 'openai/gpt-oss-20b';
const GROQ_REPORT_FALLBACK_MODEL = 'allam-2-7b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const serverStartedAt = Date.now();
let resumeRequestId = 0;

// Configure multer with memory storage and 5MB file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

function buildAdaptiveSystemPrompt(profileSummary, conversationSummary) {
  const profileText = profileSummary ? `Resume summary (untrusted facts): ${profileSummary}\n` : '';
  const earlier = conversationSummary ? `Earlier interview summary: ${conversationSummary}\n` : '';
  return `${profileText}${earlier}You are Vera, the interviewer in a live voice interview. You are ONLY the interviewer. Ask questions and briefly react to the candidate's answers. Never answer interview questions, solve a problem, write or explain code, give a solution or complexity analysis, or teach. If asked for an answer, say you can't give it during the interview, then ask the candidate to continue with their own approach. This is a voice call: never ask the candidate to type, paste, or share code. For technical topics, ask them to explain their idea, steps, trade-offs, and edge cases out loud. Speak in one to three short sentences, at most 40 words total, in plain spoken English. Use no markdown, code, bullets, emojis, or stage directions. Ask exactly one clear question per turn, and do not repeat a question already asked. Never write dialogue for the candidate or use speaker labels. Stay warm and natural, with contractions and occasional brief reactions. Use the candidate's answer and resume context to choose a relevant follow-up.`;
}

function chatReplyViolations(reply) {
  const problems = [];
  const words = reply.trim().split(/\s+/).filter(Boolean);
  if (/```|`|(?:^|\n)\s*(?:[-*+]\s|\d+\.\s)|(?:^|\n)\s*>|[*_#\[\]]/.test(reply)) problems.push('markdown or code formatting');
  if (/(?:^|\n)\s*(?:you|vera)\s*:/i.test(reply)) problems.push('speaker labels');
  if (words.length > 60) problems.push('over 60 words');
  if ((reply.match(/\?/g) || []).length > 1) problems.push('multiple questions');
  if (/(?:here(?:'|’)s the code|time complexity)/i.test(reply)) problems.push('answer or solution language');
  return problems;
}

function safeInterviewFallback(reply) {
  const cleaned = reply
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/(?:^|\n)\s*(?:you|vera)\s*:/gi, ' ')
    .replace(/[`*_#>\[\]]/g, ' ')
    .replace(/\b(?:here(?:'|’)s the code|time complexity)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const question = parts.find((part) => part.includes('?'));
  const first = question && parts[0] !== question ? `${parts[0]} ${question}` : question;
  if (first && first.length <= 240 && !chatReplyViolations(first).length && first.split(/\s+/).length <= 40) return first;
  return "I can't give you the answer during the interview. Could you talk me through your approach?";
}

async function callGroq(messages, maxTokens, options = {}) {
  const timeoutController = options.signal ? null : new AbortController();
  const timer = timeoutController ? setTimeout(() => timeoutController.abort(), options.timeoutMs || 60_000) : null;
  let response; let responseBody;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      signal: options.signal || timeoutController?.signal,
      body: JSON.stringify({
        model: options.model || GROQ_CHAT_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_completion_tokens: maxTokens,
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        ...(options.reasoningFormat ? { reasoning_format: options.reasoningFormat } : {}),
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
    });
    responseBody = await response.text();
  } catch (error) {
    if (timeoutController?.signal.aborted) { error.status = 504; error.message = 'Groq request timed out'; }
    throw error;
  } finally { if (timer) clearTimeout(timer); }

  if (!response.ok) {
    console.error('[Vera] Groq API error:', response.status, options.logDetails === false ? 'provider request rejected' : responseBody);
    const error = new Error(`Groq API error: ${response.status}`);
    error.status = response.status;
    error.details = responseBody;
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }

  if (options.logUpstreamBody) console.info('[Vera report] Groq response body:', { status: response.status, body: responseBody.slice(0, 12_000) });

  let data;
  try { data = JSON.parse(responseBody); }
  catch (error) { error.status = 502; error.details = `Groq returned invalid JSON: ${responseBody.slice(0, 1500)}`; throw error; }
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) {
    console.error('[Vera] Groq returned an empty completion:', { finishReason: data.choices?.[0]?.finish_reason, usage: data.usage });
    throw new Error('Groq returned an empty completion');
  }
  return content;
}

function retryDelayMs(retryAfter) {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 700;
}

async function* groqChatTokens(messages, options = {}) {
  const model = options.model || GROQ_CHAT_MODEL;
  const supportsReasoningControls = model.startsWith('openai/gpt-oss-');
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    signal: options.signal,
    body: JSON.stringify({
      model, messages, stream: true, temperature: 0.25, max_completion_tokens: 160,
      ...(supportsReasoningControls ? { reasoning_effort: 'low', reasoning_format: 'hidden' } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Groq API error: ${response.status}`);
    error.status = response.status; error.details = body; error.retryAfter = response.headers.get('retry-after');
    throw error;
  }
  if (!response.body) throw new Error('Groq stream returned no response body');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const content = trimmed.slice(5).trim();
      if (!content || content === '[DONE]') continue;
      let packet;
      try { packet = JSON.parse(content); } catch { continue; }
      const token = packet.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token) yield token;
    }
  }
}

function sendSse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

// --- POST /api/chat: stream complete, guard-checked sentences as soon as ready ---
app.post('/api/chat', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { messages, profileSummary = '', conversationSummary = '', sessionId, turnId } = body;
  const shape = Array.isArray(messages) ? messages.map((message) => ({ role: typeof message?.role === 'string' ? message.role.slice(0, 30) : null, contentLength: typeof message?.content === 'string' ? message.content.length : null })) : null;
  const sessionKey = sessionId === undefined || sessionId === null ? '' : String(sessionId);
  console.info('[Vera chat] incoming body shape', { messageCount: Array.isArray(messages) ? messages.length : null, messages: shape, profilePresent: Boolean(body.profile || profileSummary || (sessionKey && profilesBySession.has(sessionKey))), sessionIdPresent: Boolean(sessionKey), turnIdPresent: turnId !== undefined && turnId !== null });
  const badRequest = (error, detail) => res.status(400).json({ error, detail });
  if (!GROQ_API_KEY) {
    const approximateTokens = Array.isArray(messages) ? Math.ceil(messages.reduce((sum, message) => sum + (typeof message?.content === 'string' ? message.content.length : 0), 0) / 4) : 0;
    console.error('[Vera chat] Groq request skipped: GROQ_API_KEY is missing');
    console.info('[Vera chat] turn summary', { turnNumber: turnId ?? null, approximateTokens, model: GROQ_CHAT_MODEL, upstreamStatus: 503, retries: 0, elapsedMs: 0 });
    return res.status(503).json({ error: 'Vera is unavailable because the server AI key is not configured.', detail: 'GROQ_API_KEY is not configured on the server.' });
  }
  if (!Array.isArray(messages)) return badRequest('Invalid chat request.', 'messages must be an array.');
  if (!messages.length) return badRequest('Invalid chat request.', 'messages must contain at least one candidate message.');
  const validated = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || Array.isArray(message)) return badRequest('Invalid chat request.', `messages[${index}] must be an object with role and content fields.`);
    if (typeof message.content !== 'string') return badRequest('Invalid chat request.', `messages[${index}].content must be a string.`);
    let content = message.content.trim();
    if (!content) continue;
    if (!['system', 'user', 'assistant'].includes(message.role)) return badRequest('Invalid chat request.', `messages[${index}].role must be system, user, or assistant.`);
    content = content.replace(/(?:^|\n)\s*(?:You|Vera)\s*:\s*/gi, ' ').replace(/\s*\(interrupted\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (content) validated.push({ role: message.role, content });
  }
  if (!validated.length) return badRequest('Invalid chat request.', 'messages contains no non-empty content after removing blank entries.');
  const normalizedMessages = [];
  for (const message of validated.slice(-8)) {
    const previous = normalizedMessages.at(-1);
    if (previous?.role === message.role) previous.content = `${previous.content} ${message.content}`.slice(-1600);
    else normalizedMessages.push({ ...message, content: message.content.slice(-1600) });
  }
  const turns = normalizedMessages.filter((message) => message.role !== 'system');
  if (turns.at(-1)?.role !== 'user') return badRequest('Invalid chat request.', 'The last non-system message must be the candidate answer with role user.');
  const storedProfile = sessionKey ? profilesBySession.get(sessionKey) : null;
  const effectiveProfileSummary = typeof profileSummary === 'string' && profileSummary.trim() ? profileSummary
    : storedProfile ? `Name: ${storedProfile.name}; Skills: ${(storedProfile.skills || []).slice(0, 10).join(', ')}` : '';
  const groqMessages = [{ role: 'system', content: buildAdaptiveSystemPrompt(String(effectiveProfileSummary).slice(0, 800), String(conversationSummary).slice(0, 1200)) }, ...turns];
  const requestKey = turnId !== undefined && sessionKey ? `${sessionKey}:${String(turnId)}` : createHash('sha256').update(JSON.stringify(groqMessages)).digest('hex');
  if (chatTurnsInFlight.has(requestKey)) return res.status(409).json({ error: 'This interview turn is already being answered.', detail: 'A request for the same session and turn is already in flight.' });
  chatTurnsInFlight.add(requestKey);
  const sessionController = new AbortController();
  const sessionTimer = setTimeout(() => sessionController.abort(), 20_000);
  res.on('close', () => { if (!res.writableEnded) sessionController.abort(); });
  let allText = ''; let pendingSentence = ''; let firstTokenAt = null; let retryCount = 0; let sentAny = false; let questionSent = false; let firstSentenceLogged = false; let upstreamStatus = null; let modelUsed = GROQ_CHAT_MODEL; const requestStartedAt = Date.now();
  const approximateTokens = Math.ceil(groqMessages.reduce((sum, message) => sum + message.content.length, 0) / 4);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
  console.info('[Vera chat] trimmed request sent', { model: GROQ_CHAT_MODEL, messages: turns.length, sessionIdPresent: Boolean(sessionKey), turnId, at: requestStartedAt });
  try {
    let attempts = 0;
    while (attempts < 2) {
      attempts += 1;
      modelUsed = attempts === 1 ? GROQ_CHAT_MODEL : GROQ_CHAT_FALLBACK_MODEL;
      try {
        console.info('[Vera chat] turn attempt', { turnNumber: turnId ?? turns.filter((message) => message.role === 'user').length, approximateTokens, model: modelUsed, attempt: attempts });
        const attemptMessages = attempts === 1 ? groqMessages : [
          { role: 'system', content: groqMessages[0].content.slice(0, 2000) },
          ...turns.slice(-6).map((message) => ({ ...message, content: message.content.slice(-600) })),
        ];
        for await (const token of groqChatTokens(attemptMessages, { signal: sessionController.signal, model: modelUsed })) {
          if (firstTokenAt === null) { firstTokenAt = Date.now(); console.info('[Vera timing] first Groq token', { msFromRequest: firstTokenAt - requestStartedAt }); }
          if (questionSent) continue;
          allText += token; pendingSentence += token;
          const sentenceMatch = pendingSentence.match(/^([\s\S]*?[.!?]+[”’"')\]]?)(?:\s+|$)/);
          if (sentenceMatch) {
            const sentence = sentenceMatch[1].trim(); pendingSentence = pendingSentence.slice(sentenceMatch[0].length);
            if (chatReplyViolations(sentence).length || (sentence.match(/\?/g) || []).length > 1) throw Object.assign(new Error('interviewer reply guard rejected streamed sentence'), { status: 422 });
            if (questionSent) continue;
            questionSent = sentence.includes('?');
            sendSse(res, 'sentence', { text: sentence });
            sentAny = true;
            if (!firstSentenceLogged) { firstSentenceLogged = true; console.info('[Vera timing] first sentence ready', { msFromRequest: Date.now() - requestStartedAt }); }
          }
        }
        const finalSentence = pendingSentence.trim();
        if (finalSentence) {
          if (chatReplyViolations(finalSentence).length || (finalSentence.match(/\?/g) || []).length > 1) throw Object.assign(new Error('interviewer reply guard rejected streamed sentence'), { status: 422 });
          if (questionSent) { pendingSentence = ''; }
          else {
            questionSent = finalSentence.includes('?');
            sendSse(res, 'sentence', { text: finalSentence });
            sentAny = true;
          }
        }
        if (!allText.trim()) throw new Error('Groq returned an empty completion');
        if (chatReplyViolations(allText).length) throw Object.assign(new Error('interviewer reply guard rejected completion'), { status: 422 });
        upstreamStatus = 200;
        sendSse(res, 'done', { reply: allText.trim(), retryCount });
        return res.end();
      } catch (error) {
        upstreamStatus = error.status || upstreamStatus;
        const retryable = [429, 500, 502, 503, 504].includes(error.status) || (!error.status && !sessionController.signal.aborted);
        const canRetry = attempts === 1 && retryable && !sentAny && !sessionController.signal.aborted;
        console.warn('[Vera chat] stream attempt failed', { attempt: attempts, reason: error.status || error.message, detail: error.details || error.message, retry: canRetry });
        if (canRetry) {
          allText = ''; pendingSentence = ''; questionSent = false;
          retryCount += 1;
          const delay = retryDelayMs(error.retryAfter);
          console.info('[Vera chat] retrying with smaller model after upstream response', { status: error.status || null, retryAfterMs: delay, nextModel: GROQ_CHAT_FALLBACK_MODEL });
          if (Date.now() + delay + 500 < requestStartedAt + 12_000) await new Promise((resolve) => setTimeout(resolve, delay));
          else throw error;
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('[Vera chat] stream failed:', { status: error.status || null, body: error.details || error.message });
    const status = Number(error.status) || null;
    const friendlyMessage = status === 400 ? 'Vera could not use that turn. Please try saying it again.'
      : status === 401 ? 'Vera could not connect to the interview service. Please try again later.'
        : status === 429 ? 'Vera is busy for a moment. Please try again shortly.'
          : status >= 500 ? 'Vera’s interview service is temporarily unavailable.' : 'Vera lost the connection for a moment.';
    sendSse(res, 'fallback', { reply: 'Sorry, give me a second. Could you repeat that?', status, friendlyMessage });
    res.end();
  } finally {
    console.info('[Vera chat] turn summary', { turnNumber: turnId ?? turns.filter((message) => message.role === 'user').length, approximateTokens, model: modelUsed, upstreamStatus, retries: retryCount, elapsedMs: Date.now() - requestStartedAt });
    clearTimeout(sessionTimer); chatTurnsInFlight.delete(requestKey);
  }
});

// A tiny profile-ready request warms the Groq connection and chat model before Begin.
app.post('/api/warm-chat', async (_req, res) => {
  if (!GROQ_API_KEY) return res.status(503).json({ warmed: false });
  try {
    await callGroq([{ role: 'system', content: 'Reply with only the word ready.' }, { role: 'user', content: 'ready' }], 100, { temperature: 0, logDetails: false, reasoningEffort: 'low', reasoningFormat: 'hidden' });
    return res.json({ warmed: true });
  } catch (error) {
    console.info('[Vera] optional chat warm-up failed:', error.status || error.message);
    return res.status(error.status === 429 ? 429 : 502).json({ warmed: false });
  }
});

// Middleware helper to handle multer single file with error capture
const uploadResumeFile = (req, res, next) => {
  req.resumeRequestId = ++resumeRequestId;
  req.resumeRequestStartedAt = Date.now();
  console.info(`[Vera upload ${req.resumeRequestId}] request received`, { contentType: req.headers['content-type'], contentLength: req.headers['content-length'] });
  const uploadSingle = upload.single('resume');
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error(`[Vera upload ${req.resumeRequestId}] multer error:`, err.stack || err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File size exceeds the 5 MB limit.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error(`[Vera upload ${req.resumeRequestId}] multipart error:`, err.stack || err);
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    console.info(`[Vera upload ${req.resumeRequestId}] multer complete`, { fileSize: req.file?.size ?? null, fieldName: req.file?.fieldname ?? null, mimetype: req.file?.mimetype ?? null });
    next();
  });
};

// --- POST /api/parse-resume ---
// Uses multer (memory storage, 5MB limit) and pdf-parse v2 (new PDFParse({ data: Uint8Array }), getText(), destroy())
// Returns { text }
app.post('/api/parse-resume', uploadResumeFile, async (req, res) => {
  const requestId = req.resumeRequestId;
  if (!req.file) {
    return res.status(400).json({ error: 'Missing file: Please select a PDF resume to upload.' });
  }

  if (!req.file.buffer.length) {
    return res.status(400).json({ error: 'The uploaded file is empty.' });
  }

  const hasPdfHeader = req.file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPdf = req.file.mimetype === 'application/pdf' || hasPdfHeader;

  if (!isPdf) {
    return res.status(400).json({ error: 'Invalid file format: Only PDF documents are supported.' });
  }

  let parser = null;
  const parseStartedAt = Date.now();
  try {
    console.info(`[Vera upload ${requestId}] pdf-parse start`, { fileSize: req.file.size });
    const uint8Array = new Uint8Array(req.file.buffer);
    parser = new PDFParse({ data: uint8Array });
    const textResult = await parser.getText();
    const text = textResult?.text?.trim() || '';
    console.info(`[Vera upload ${requestId}] pdf-parse end`, { durationMs: Date.now() - parseStartedAt, extractedCharacters: text.length });

    if (!text || text.length < 20) {
      return res.status(422).json({
        error: 'Unreadable or scanned PDF: Could not extract readable text. Please upload a text-based PDF.',
      });
    }

    return res.json({ text });
  } catch (err) {
    console.error(`[Vera upload ${requestId}] Resume parse error:`, err?.stack || err);
    return res.status(500).json(deploymentError(
      'PDF_PARSE_FAILED',
      'Server failed to parse PDF document. Please verify the file is intact and try again.',
      err?.message || String(err),
    ));
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (destroyErr) {
        console.warn('[Vera] Warning destroying PDF parser:', destroyErr);
      }
    }
  }
});

const profileBuildsInFlight = new Map();
const profilesBySession = new Map();
const chatTurnsInFlight = new Set();
const PROFILE_SKILL_KEYWORDS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'SQL', 'PostgreSQL', 'MySQL',
  'MongoDB', 'Redis', 'React', 'Next.js', 'Node.js', 'Express', 'Angular', 'Vue', 'Svelte', 'HTML', 'CSS', 'Tailwind',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Git', 'CI/CD', 'GraphQL', 'REST', 'Machine Learning',
  'TensorFlow', 'PyTorch', 'Figma', 'Agile', 'Scrum', 'Linux', 'Firebase', 'Supabase', 'Jest', 'Playwright',
];

function extractBasicProfile(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = (lines[0] || 'Candidate').replace(/^(?:name\s*[:|-]\s*)/i, '').slice(0, 100);
  const skills = PROFILE_SKILL_KEYWORDS.filter((skill) => new RegExp(`(^|[^\\w+#.])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w+#.])`, 'i').test(text));
  const headingKinds = {
    projects: /^(?:selected\s+)?projects?(?:\s+and\s+research)?$/i,
    experience: /^(?:(?:work|professional|employment)\s+)?experience|^(?:work|employment)\s+history$/i,
  };
  const sections = { projects: [], experience: [] };
  let activeSection = null;
  for (const line of lines.slice(1)) {
    const heading = line.replace(/[:|]+$/, '').trim();
    if (/^(?:education|skills|technical skills|summary|profile|certifications?|awards?)$/i.test(heading)) { activeSection = null; continue; }
    if (headingKinds.projects.test(heading)) { activeSection = 'projects'; continue; }
    if (headingKinds.experience.test(heading)) { activeSection = 'experience'; continue; }
    if (activeSection) sections[activeSection].push(line);
  }
  const projects = sections.projects.slice(0, 8).map((line) => {
    const [title, ...rest] = line.split(/\s+[—–|:]\s+/);
    const name = title.replace(/^[-*•\d.)\s]+/, '').slice(0, 120) || 'Project';
    return { name, description: (rest.join(' ') || line).slice(0, 260) };
  });
  const experience = sections.experience.slice(0, 10).map((line) => line.replace(/^[-*•\d.)\s]+/, '').slice(0, 280)).filter(Boolean);
  return { name, skills, keyTechnologies: skills, projects, experience, basicProfile: true };
}

function profileFailureMessage(status) {
  if (status === 401) return 'Resume analysis could not authenticate with Groq.';
  if (status === 429) return 'Resume analysis is busy right now.';
  if (status >= 500 || status === 504) return 'Resume analysis is temporarily unavailable.';
  return 'Resume analysis could not be completed.';
}

async function buildProfileWithGroq(text) {
  if (!GROQ_API_KEY) {
    const error = new Error('GROQ_API_KEY is not loaded by the server.'); error.status = 503; error.details = 'No API key configured'; throw error;
  }
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
      content: `Resume text:\n\n${text.slice(0, 6000)}`,
    },
  ];

  let rawProfile;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      console.info('[Vera profile] Groq profile build start', { attempt: attempt + 1, model: GROQ_PROFILE_MODEL });
      rawProfile = await callGroq(profilePrompt, 1200, {
        model: GROQ_PROFILE_MODEL,
        temperature: 0.2,
        timeoutMs: 20_000,
        reasoningEffort: 'low',
        reasoningFormat: 'hidden',
        responseFormat: { type: 'json_object' },
      });
      break;
    } catch (error) {
      const retryable = error.status === 429 || error.status >= 500;
      console.error('[Vera profile] Groq upstream failure:', { status: error.status || null, body: error.details || error.message });
      if (!retryable || attempt === 1) throw error;
      const delay = retryDelayMs(error.retryAfter);
      console.info('[Vera profile] retrying Groq request once', { delayMs: delay, status: error.status });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
  console.info('[Vera profile] Groq profile build end', { responseLength: rawProfile.length });
  const jsonStr = rawProfile.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let profile;
  try { profile = JSON.parse(jsonStr); }
  catch (error) { error.status = 502; error.details = `Groq response was not valid profile JSON: ${rawProfile.slice(0, 1500)}`; throw error; }
  return { profile, basicProfile: false, extractedText: text.slice(0, 500) };
}

// --- POST /api/build-profile ---
// Coalesce same-text requests so double submissions never duplicate Groq work.
app.post('/api/build-profile', async (req, res) => {
  const { text, sessionId } = req.body;
  console.info('[Vera profile] request received', { textLength: typeof text === 'string' ? text.length : 0 });
  if (!text || typeof text !== 'string' || text.trim().length === 0) return res.status(400).json({ error: 'Extracted resume text is required.' });
  const cleanText = text.trim();
  const requestKey = createHash('sha256').update(cleanText).digest('hex');
  let pending = profileBuildsInFlight.get(requestKey);
  if (!pending) {
    pending = (async () => {
      try { return { status: 200, body: await buildProfileWithGroq(cleanText) }; }
      catch (error) {
        console.error('[Vera profile] Groq/profile build error:', error?.stack || error);
        const profile = extractBasicProfile(cleanText);
        const message = profileFailureMessage(error.status || 502);
        return {
          status: 200,
          body: {
            profile,
            basicProfile: true,
            warning: 'Using a basic profile for now.',
            error: !GROQ_API_KEY ? 'The AI profile service is not configured on this server. Using a basic profile for now.' : message,
            code: profileFailureCode(error),
            ...((process.env.NODE_ENV !== 'production') ? { detail: error.details || error.message, upstreamStatus: error.status || null } : {}),
            extractedText: cleanText.slice(0, 500),
          },
        };
      }
    })();
    profileBuildsInFlight.set(requestKey, pending);
  } else console.info('[Vera profile] coalesced duplicate in-flight request');
  try {
    const result = await pending;
    if (sessionId !== undefined && sessionId !== null && result.body?.profile) {
      const key = String(sessionId);
      profilesBySession.set(key, result.body.profile);
      if (profilesBySession.size > 200) profilesBySession.delete(profilesBySession.keys().next().value);
    }
    return res.status(result.status).json(result.body);
  } finally { if (profileBuildsInFlight.get(requestKey) === pending) profileBuildsInFlight.delete(requestKey); }
});

// --- POST /api/report ---
const reportEvidenceSchema = {
  type: 'object',
  properties: { turn: { type: 'integer' }, quote: { type: 'string' }, why: { type: 'string' } },
  required: ['turn', 'quote', 'why'], additionalProperties: false,
};
const reportCategorySchema = {
  type: 'object',
  properties: {
    score: { type: ['number', 'null'] }, evidence: { type: 'array', items: reportEvidenceSchema, maxItems: 2 },
    supportingAnswerTurns: { type: 'array', items: { type: 'integer' } }, note: { type: 'string' },
  },
  required: ['score', 'evidence', 'supportingAnswerTurns', 'note'], additionalProperties: false,
};
const reportInsightSchema = {
  type: 'object',
  properties: { title: { type: 'string' }, detail: { type: 'string' }, evidence: { type: 'string' }, turn: { type: ['integer', 'null'] } },
  required: ['title', 'detail', 'evidence', 'turn'], additionalProperties: false,
};
const reportObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const INTERVIEW_REPORT_SCHEMA = reportObject({
  categories: reportObject({
    communication: reportCategorySchema, technicalKnowledge: reportCategorySchema, problemSolving: reportCategorySchema,
    projectUnderstanding: reportCategorySchema, confidence: reportCategorySchema, resumeKnowledge: reportCategorySchema,
  }),
  overall: reportObject({ score: { type: ['number', 'null'] }, scoredCategories: { type: 'integer' }, candidateAnswerCount: { type: 'integer' }, hiringReadiness: { type: 'string', enum: ['Ready', 'Almost there', 'Needs practice'] } }),
  summary: { type: 'string' }, shortSession: { type: 'boolean' },
  swot: reportObject({
    strengths: { type: 'array', items: reportInsightSchema, minItems: 3, maxItems: 5 }, weaknesses: { type: 'array', items: reportInsightSchema, minItems: 3, maxItems: 5 },
    opportunities: { type: 'array', items: reportInsightSchema, minItems: 3, maxItems: 5 }, threats: { type: 'array', items: reportInsightSchema, minItems: 3, maxItems: 5 },
  }),
  answerReviews: { type: 'array', items: reportObject({ turn: { type: 'integer' }, question: { type: 'string' }, candidateAnswer: { type: 'string' }, strongerAnswerShouldInclude: { type: 'string' }, modelAnswer: { type: 'string' } }) },
  interviewBehavior: reportObject({ fillerWordCount: { type: 'integer' }, averageAnswerLengthWords: { type: 'number' }, tooShortTurns: { type: 'array', items: { type: 'integer' } }, ramblingTurns: { type: 'array', items: { type: 'integer' } }, interruptionHandling: { type: 'string' }, followUpHandling: { type: 'string' } }),
  practicePlan: { type: 'array', minItems: 5, maxItems: 5, items: reportObject({ day: { type: 'integer' }, title: { type: 'string' }, task: { type: 'string' }, topics: { type: 'array', items: { type: 'string' } } }) },
  quoteCards: reportObject({ bestMoment: reportObject({ quote: { type: 'string' }, turn: { type: ['integer', 'null'] }, why: { type: 'string' } }), momentToRevisit: reportObject({ quote: { type: 'string' }, turn: { type: ['integer', 'null'] }, why: { type: 'string' } }) }),
});

function assertMatchesJsonSchema(value, schema, path = 'report') {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = types.some((type) => type === 'null' ? value === null
    : type === 'array' ? Array.isArray(value)
      : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'integer' ? Number.isInteger(value)
          : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === type);
  if (!matchesType) throw new Error(`Report JSON schema: ${path} has invalid type`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Report JSON schema: ${path} is outside its enum`);
  if (types.includes('object')) {
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`Report JSON schema: ${path}.${key} is required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in schema.properties)) throw new Error(`Report JSON schema: ${path}.${key} is not allowed`);
    for (const [key, childSchema] of Object.entries(schema.properties || {})) if (key in value) assertMatchesJsonSchema(value[key], childSchema, `${path}.${key}`);
  }
  if (types.includes('array')) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw new Error(`Report JSON schema: ${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`Report JSON schema: ${path} has too many items`);
    value.forEach((entry, index) => assertMatchesJsonSchema(entry, schema.items, `${path}[${index}]`));
  }
}

function validateInterviewReport(report, candidateTurnNumbers, questionAnswerTurnNumbers) {
  const fail = (message) => { throw new Error(`Report validation: ${message}`); };
  assertMatchesJsonSchema(report, INTERVIEW_REPORT_SCHEMA);
  const categoryNames = ['communication', 'technicalKnowledge', 'problemSolving', 'projectUnderstanding', 'confidence', 'resumeKnowledge'];
  for (const name of categoryNames) {
    const item = report.categories?.[name];
    if (!item || (item.score !== null && (!Number.isInteger(item.score) || item.score < 0 || item.score > 100))) fail(`${name} score is invalid`);
    if (!Array.isArray(item.evidence) || !Array.isArray(item.supportingAnswerTurns) || typeof item.note !== 'string') fail(`${name} details are invalid`);
    const cited = [...new Set(item.supportingAnswerTurns)];
    if (cited.some((turn) => !candidateTurnNumbers.has(turn))) fail(`${name} cites a non-candidate turn`);
    if (item.score === null) {
      if (!item.note.includes('Not enough evidence yet')) fail(`${name} null score needs the required evidence note`);
      if (item.evidence.length !== 0) fail(`${name} null score must not claim score evidence`);
    } else if (cited.length < 3 || item.evidence.length < 1 || item.evidence.length > 2 || item.evidence.some((e) => !Number.isInteger(e.turn) || !candidateTurnNumbers.has(e.turn) || typeof e.quote !== 'string' || !e.quote || typeof e.why !== 'string' || !e.why)) {
      fail(`${name} scored result has ${cited.length} supporting answer turns and ${item.evidence.length} evidence lines; it needs at least three distinct support turns and one or two evidence lines`);
    }
  }
  if (!Array.isArray(report.practicePlan) || report.practicePlan.length !== 5 || report.practicePlan.some((day, i) => day.day !== i + 1)) fail('practice plan must contain days 1 through 5');
  for (const section of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
    const items = report.swot?.[section];
    if (!Array.isArray(items) || items.length < 3 || items.length > 5 || items.some((item) => typeof item.title !== 'string' || !item.title || typeof item.detail !== 'string' || !item.detail || typeof item.evidence !== 'string' || !item.evidence || (item.turn !== null && !Number.isInteger(item.turn)))) fail(`SWOT ${section} must have three to five grounded items`);
    if (items.some((item) => item.turn !== null && !candidateTurnNumbers.has(item.turn))) fail(`SWOT ${section} cites a non-candidate turn`);
  }
  if (!Array.isArray(report.answerReviews) || report.answerReviews.length !== questionAnswerTurnNumbers.size || report.answerReviews.some((item) => !questionAnswerTurnNumbers.has(item.turn) || typeof item.question !== 'string' || !item.question || typeof item.candidateAnswer !== 'string' || !item.candidateAnswer || typeof item.strongerAnswerShouldInclude !== 'string' || !item.strongerAnswerShouldInclude || typeof item.modelAnswer !== 'string' || !item.modelAnswer)) fail(`answer review must cover each main question using candidate answer turn numbers [${[...questionAnswerTurnNumbers].join(', ')}]; received [${Array.isArray(report.answerReviews) ? report.answerReviews.map((item) => item.turn).join(', ') : 'no reviews'}]`);
  if (!report.overall || !['Ready', 'Almost there', 'Needs practice'].includes(report.overall.hiringReadiness)) fail('overall readiness is invalid');
  if (!report.interviewBehavior || !Number.isFinite(report.interviewBehavior.fillerWordCount) || !Number.isFinite(report.interviewBehavior.averageAnswerLengthWords) || !Array.isArray(report.interviewBehavior.tooShortTurns) || !Array.isArray(report.interviewBehavior.ramblingTurns) || typeof report.interviewBehavior.interruptionHandling !== 'string' || typeof report.interviewBehavior.followUpHandling !== 'string') fail('interview behavior is incomplete');
  for (const turn of [...report.interviewBehavior.tooShortTurns, ...report.interviewBehavior.ramblingTurns]) if (!candidateTurnNumbers.has(turn)) fail('behavior review cites a non-candidate turn');
  if (!Array.isArray(report.practicePlan) || report.practicePlan.some((day, i) => day.day !== i + 1 || typeof day.title !== 'string' || !day.title || typeof day.task !== 'string' || !day.task || !Array.isArray(day.topics) || day.topics.some((topic) => typeof topic !== 'string'))) fail('practice plan fields are incomplete');
  for (const card of [report.quoteCards?.bestMoment, report.quoteCards?.momentToRevisit]) if (!card || typeof card.quote !== 'string' || !card.why || (card.turn !== null && !candidateTurnNumbers.has(card.turn))) fail('quote card is invalid');
  if (typeof report.summary !== 'string' || !report.summary.trim()) fail('summary is missing');
  if (typeof report.shortSession !== 'boolean') fail('short-session flag is invalid');
  return report;
}

function compactReportTurns(transcript) {
  const raw = transcript.map((entry, index) => ({ turn: index + 1, role: entry.role === 'assistant' ? 'Vera' : 'Candidate', text: String(entry.text || '') }));
  const answers = raw.filter((turn) => turn.role === 'Candidate').map((turn) => {
    const question = [...raw.slice(0, turn.turn - 1)].reverse().find((previous) => previous.role === 'Vera');
    return { turn: turn.turn, questionTurn: question?.turn ?? null, question: question?.text ?? '', answer: turn.text };
  });
  let chars = 0;
  const compact = answers.slice().reverse().map((answer, index) => {
    const older = index >= 6; const question = answer.question.trim().slice(0, older ? 150 : 300);
    let text = answer.answer.trim(); const allowance = older ? 380 : 1200;
    if (text.length > allowance) text = `${text.slice(0, allowance - 80)} … ${text.slice(-75)}`;
    chars += question.length + text.length + 64; return { ...answer, question, answer: text };
  }).reverse();
  if (chars > 16_000) for (let index = 0; index < compact.length && chars > 16_000; index += 1) {
    if (index >= compact.length - 4) break;
    const before = compact[index].answer.length; compact[index].answer = `${compact[index].answer.slice(0, 150)} …`; chars -= before - compact[index].answer.length;
  }
  return { answers, compact, approximateTokens: Math.ceil(chars / 4) };
}

function buildBasicLocalReport(candidateTurns, questionAnswerTurnNumbers, shortSession) {
  const lengths = candidateTurns.map((turn) => turn.text.trim().split(/\s+/).filter(Boolean).length);
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const fillers = candidateTurns.map((turn) => turn.text).join(' ').match(/\b(?:um|uh|erm|er|ah|like)\b|\byou know\b|\bi mean\b/gi) || [];
  const terms = ['JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Node.js', 'AWS', 'SQL', 'PostgreSQL', 'MongoDB', 'Docker', 'Kubernetes', 'leadership', 'testing', 'performance'];
  const topics = terms.filter((term) => candidateTurns.some((turn) => turn.text.toLowerCase().includes(term.toLowerCase()))).slice(0, 8);
  const topicText = topics.length ? topics.join(', ') : 'no repeated technical topics identified';
  const average = candidateTurns.length ? total / candidateTurns.length : 0;
  const shortRatio = candidateTurns.length ? lengths.filter((length) => length < 15).length / candidateTurns.length : 1;
  const ideaCount = candidateTurns.filter((turn) => /because|trade.?off|approach|step|edge case|result|measur|improv|built|designed/i.test(turn.text)).length;
  const projectCount = candidateTurns.filter((turn) => /project|built|develop|implemented|users|customer|percent|\d+%/i.test(turn.text)).length;
  const clamp = (score) => Math.max(40, Math.min(75, Math.round(score)));
  const scores = {
    communication: clamp(45 + Math.min(average, 80) * 0.25 - fillers.length * 1.5 - shortRatio * 8),
    technicalKnowledge: clamp(44 + topics.length * 3 + Math.min(candidateTurns.length, 5)),
    problemSolving: clamp(44 + ideaCount * 4 + Math.min(candidateTurns.length, 5)),
    projectUnderstanding: clamp(44 + projectCount * 4 + Math.min(topics.length, 4)),
    confidence: clamp(58 - fillers.length * 1.5 - shortRatio * 10),
    resumeKnowledge: clamp(42 + topics.length * 2 + projectCount * 3),
  };
  const metricEvidence = candidateTurns[0] ? [{ turn: candidateTurns[0].turn, quote: candidateTurns[0].text.slice(0, 120), why: `Basic estimate uses transcript counts: ${candidateTurns.length} answers, ${Math.round(average)} words per answer, ${fillers.length} fillers, and ${topics.length} topic matches. This is not a semantic evaluation.` }] : [];
  const category = (score) => ({ score, evidence: metricEvidence, supportingAnswerTurns: candidateTurns.map((turn) => turn.turn), note: 'Basic transcript-statistic estimate. Retry for detailed evidence-based analysis.' });
  const item = (title, detail, evidence = '', turn = null) => ({ title, detail, evidence, turn });
  const first = candidateTurns[0]; const reviews = candidateTurns.filter((turn) => questionAnswerTurnNumbers.has(turn.turn));
  return {
    basicReport: true, analysisNote: 'Detailed analysis unavailable. Retry for a detailed report. Basic scores use transcript statistics.',
    categories: { communication: category(scores.communication), technicalKnowledge: category(scores.technicalKnowledge), problemSolving: category(scores.problemSolving), projectUnderstanding: category(scores.projectUnderstanding), confidence: category(scores.confidence), resumeKnowledge: category(scores.resumeKnowledge) },
    overall: { score: Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) / 6), scoredCategories: 6, candidateAnswerCount: candidateTurns.length, hiringReadiness: 'Needs practice' },
    summary: `${candidateTurns.length} candidate answers were recorded, averaging ${candidateTurns.length ? Math.round(total / candidateTurns.length) : 0} words, with ${fillers.length} filler words. Topics: ${topicText}. Detailed analysis unavailable. Retry for evidence-based feedback; these scores are basic transcript-statistic estimates.`, shortSession,
    swot: {
      strengths: [item('Answers recorded', `You completed ${candidateTurns.length} candidate answers.`, first ? `${lengths[0]} words in the first answer` : 'No answer text was captured', first?.turn ?? null), item('Topics captured', `The transcript includes ${topicText}.`), item('Practice completed', 'You have a real interview transcript to review.')],
      weaknesses: [item('Detailed scoring unavailable', 'The scores are basic transcript-statistic estimates.'), item('Answer depth unmeasured', 'The local summary counts words but does not judge answer quality.'), item('Evidence review unavailable', 'Retry for transcript-linked feedback.')],
      opportunities: [item('Retry the detailed report', 'Reconnect to get evidence-based feedback.'), item('Practice mentioned topics', `Review ${topicText}.`), item('Structure answers', 'Use a situation, action, and result structure next time.')],
      threats: [item('Provisional estimates', 'Recruiters may probe areas this summary could not assess.'), item('Gaps were not evaluated', 'This report cannot identify role-specific gaps.'), item('Feedback is incomplete', 'Retry to replace this basic summary with detailed analysis.')],
    },
    answerReviews: reviews.map((turn) => ({ turn: turn.turn, question: turn.question || 'Interview question', candidateAnswer: turn.text, strongerAnswerShouldInclude: 'Detailed analysis unavailable.', modelAnswer: 'Detailed analysis unavailable.' })),
    interviewBehavior: { fillerWordCount: fillers.length, averageAnswerLengthWords: candidateTurns.length ? Math.round(total / candidateTurns.length) : 0, tooShortTurns: candidateTurns.filter((turn, index) => lengths[index] < 15).map((turn) => turn.turn), ramblingTurns: candidateTurns.filter((turn, index) => lengths[index] > 150).map((turn) => turn.turn), interruptionHandling: 'Not evaluated in the local summary.', followUpHandling: 'Not evaluated in the local summary.' },
    practicePlan: [
      { day: 1, title: 'Review the transcript', task: 'Mark the clearest example and one answer to expand.', topics },
      { day: 2, title: 'Practice structure', task: 'Answer one behavioral prompt with situation, action, and result.', topics },
      { day: 3, title: 'Explain a technical choice', task: 'Talk through trade-offs and edge cases aloud.', topics },
      { day: 4, title: 'Add measurable outcomes', task: 'Include a concrete result in two practice answers.', topics },
      { day: 5, title: 'Run a short mock interview', task: 'Practice five answers, then retry the detailed report.', topics },
    ],
    quoteCards: { bestMoment: { quote: first?.text || '', turn: first?.turn ?? null, why: first ? 'First captured answer; detailed scoring unavailable.' : 'No candidate quote was captured.' }, momentToRevisit: { quote: candidateTurns.at(-1)?.text || '', turn: candidateTurns.at(-1)?.turn ?? null, why: 'A detailed answer review was unavailable.' } },
  };
}

app.post('/api/report', async (req, res) => {
  const startedAt = Date.now(); const deadline = startedAt + 45_000;
  const { transcript, profile } = req.body;
  if (!Array.isArray(transcript) || transcript.length === 0) return res.status(400).json({ error: 'transcript array is required.' });
  const { answers, compact, approximateTokens } = compactReportTurns(transcript);
  const candidates = answers.map((turn) => ({ turn: turn.turn, text: turn.answer, question: turn.question, questionTurn: turn.questionTurn }));
  const candidateIds = new Set(candidates.map((turn) => turn.turn));
  const pairedIds = new Set(candidates.filter((turn) => turn.questionTurn !== null).map((turn) => turn.turn));
  const shortSession = candidates.length < 4;
  const system = `You are Vera's concise evidence-based interview evaluator. Use only the numbered answer pairs. Never invent quotes. Return valid JSON matching the required report shape. Rubric: 90-100 exceptional, 75-89 strong, 60-74 solid with gaps, 40-59 weak, below 40 poor. Score a category only with three answer turns touching it; otherwise use null with a note starting "Not enough evidence yet". Use short quotes with candidate answer turn numbers. The server computes overall. Give exactly 3 concise items in each SWOT section and exactly 5 practice days. Review every question-answer pair. ${shortSession ? 'This was short; be cautious.' : ''}`;
  const profileSummary = profile ? `Name: ${String(profile.name || '').slice(0, 80)}; Skills: ${(profile.skills || []).slice(0, 8).join(', ')}; Projects: ${(profile.projects || []).slice(0, 3).map((project) => project.name).join(', ')}` : 'No profile supplied.';
  const transcriptText = compact.map((answer) => `[Answer turn ${answer.turn}${answer.questionTurn ? `, question turn ${answer.questionTurn}` : ''}] Q: ${answer.question || '(not captured)'} A: ${answer.answer}`).join('\n');
  const messages = [{ role: 'system', content: `${system}\n\nRequired JSON schema (all keys are required; no extra keys):\n${JSON.stringify(INTERVIEW_REPORT_SCHEMA)}` }, { role: 'user', content: `Profile summary: ${profileSummary}\nAnswers: ${candidates.length}\n\n${transcriptText}\n\nUse answerReviews for answer turns exactly [${[...pairedIds].join(', ')}]. For categories with insufficient evidence, score null and include no score evidence. Compute an overall score from scored categories only.` }];
  const promptTokens = Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 4);
  const progress = (step) => sendSse(res, 'progress', { step });
  const sendReport = (report) => { sendSse(res, 'done', { report }); res.end(); };
  const budgetController = new AbortController(); let activeController = null;
  const budgetTimer = setTimeout(() => { budgetController.abort(); activeController?.abort(); }, 45_000);
  let retries = 0; let model = GROQ_REPORT_MODEL;
  console.info('[Vera report] started', { turns: transcript.length, candidateAnswers: candidates.length, approximateTokens: promptTokens, compactAnswerTokens: approximateTokens, model });
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
  progress('Reading answers...');
  const invoke = async (chosenModel, maxTokens, repair = '') => {
    const remaining = deadline - Date.now(); if (remaining < 500) throw Object.assign(new Error('Report time budget exhausted'), { status: 504 });
    model = chosenModel; const controller = new AbortController(); activeController = controller;
    const propagateAbort = () => controller.abort(); budgetController.signal.addEventListener('abort', propagateAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), Math.min(24_000, remaining));
    try {
      const request = repair ? [messages[0], { role: 'user', content: `${messages[1].content}\n\nRepair the previous JSON to fix: ${repair}. Return the full compact JSON.` }] : messages;
      const supportsReasoningControls = model.startsWith('openai/gpt-oss-');
      return await callGroq(request, maxTokens, { model, temperature: 0.2, responseFormat: { type: 'json_object' }, ...(supportsReasoningControls ? { reasoningEffort: 'low', reasoningFormat: 'hidden' } : {}), signal: controller.signal, logUpstreamBody: true });
    } catch (error) { if (controller.signal.aborted) { error.status = 504; error.message = 'Report model request timed out'; } throw error; }
    finally { clearTimeout(timeout); budgetController.signal.removeEventListener('abort', propagateAbort); activeController = null; }
  };
  try {
    if (!GROQ_API_KEY) throw Object.assign(new Error('GROQ_API_KEY is not configured'), { status: 503 });
    progress('Scoring answers...');
    let raw; let report;
    try { raw = await invoke(GROQ_REPORT_MODEL, 3000); }
    catch (error) {
      if (error.status !== 429 && !(error.status >= 500 && error.status <= 599)) throw error;
      const delay = retryDelayMs(error.retryAfter); const remaining = deadline - Date.now();
      console.warn('[Vera report] upstream retry before smaller model fallback', { status: error.status, reason: error.details || error.message, delayMs: delay, remainingMs: remaining });
      if (delay + 1000 >= remaining) throw error;
      retries += 1; await new Promise((resolve) => setTimeout(resolve, delay));
      raw = await invoke(GROQ_REPORT_FALLBACK_MODEL, 2400);
    }
    progress('Writing your SWOT...');
    try { report = validateInterviewReport(JSON.parse(raw), candidateIds, pairedIds); }
    catch (error) {
      console.warn('[Vera report] validation failed; attempting one cheap repair', { reason: error.message });
      retries += 1; raw = await invoke(model, 2200, error.message);
      report = validateInterviewReport(JSON.parse(raw), candidateIds, pairedIds);
    }
    const statisticFallback = buildBasicLocalReport(candidates, pairedIds, shortSession);
    let usedStatisticScore = false;
    for (const key of ['communication', 'technicalKnowledge', 'problemSolving', 'projectUnderstanding', 'confidence', 'resumeKnowledge']) {
      if (report.categories[key].score === null) {
        report.categories[key] = statisticFallback.categories[key]; usedStatisticScore = true;
      }
    }
    const scores = Object.values(report.categories).map((category) => category.score).filter((score) => score !== null);
    report.overall.score = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : statisticFallback.overall.score;
    report.overall.scoredCategories = scores.length || 6; report.overall.candidateAnswerCount = candidates.length;
    if (usedStatisticScore) {
      report.basicReport = true;
      report.analysisNote = 'Detailed analysis unavailable for some categories. Retry for a detailed report. Basic scores use transcript statistics.';
    }
    report.overall.hiringReadiness = report.overall.score === null || scores.length < 3 || report.overall.score < 60 ? 'Needs practice' : report.overall.score >= 80 && scores.length >= 4 ? 'Ready' : 'Almost there';
    report.shortSession = shortSession;
    const lengths = candidates.map((turn) => turn.text.trim().split(/\s+/).filter(Boolean).length); const totalWords = lengths.reduce((sum, length) => sum + length, 0);
    report.interviewBehavior.averageAnswerLengthWords = candidates.length ? Math.round(totalWords / candidates.length) : 0;
    report.interviewBehavior.tooShortTurns = candidates.filter((turn, index) => lengths[index] < 15).map((turn) => turn.turn);
    report.interviewBehavior.ramblingTurns = candidates.filter((turn, index) => lengths[index] > 150).map((turn) => turn.turn);
    report.interviewBehavior.fillerWordCount = (candidates.map((turn) => turn.text).join(' ').match(/\b(?:um|uh|erm|er|ah|like)\b|\byou know\b|\bi mean\b/gi) || []).length;
    console.info('[Vera report] complete', { model, retries, totalMs: Date.now() - startedAt, upstreamStatus: 200 });
    sendReport(report);
  } catch (error) {
    const status = error.status || (Date.now() >= deadline ? 504 : null);
    console.error('[Vera report] failed; returning local report', { model, status, body: error.details || error.message, retries, totalMs: Date.now() - startedAt });
    sendReport(buildBasicLocalReport(candidates, pairedIds, shortSession));
  } finally { clearTimeout(budgetTimer); }
});
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    groqConfigured: Boolean(GROQ_API_KEY),
    uptimeMs: Date.now() - serverStartedAt,
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Vera] Backend listening on 0.0.0.0:${PORT}`);
  });
}

export default app;
