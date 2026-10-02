import { useCallback, useEffect, useRef, useState } from 'react';
import type { CandidateProfile, InterviewReport } from '@/types/interview';
import { useTTS } from '@/hooks/useTTS';
import type { VoiceEngine, VoiceOption } from '@/hooks/useTTS';
import { createBasicReport } from '@/lib/basicReport';

export type InterviewState = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface TranscriptEntry { id: number; role: 'user' | 'assistant'; text: string }
type PausePatience = 'short' | 'normal' | 'patient';
// Keep speaker detection conservative; adjust the ratio or disable auto barge-in here.
const SPEAKER_AUTO_BARGE_IN = true;
const SPEAKER_ECHO_MULTIPLIER = 2.5;
const SPEAKER_LEVEL_HOLD_MS = 250;
const SPEAKER_POST_PLAYBACK_GUARD_MS = 700;
interface UseVoiceInterviewOptions {
  messagesRef: React.MutableRefObject<{ role: string; content: string }[]>;
  profile: CandidateProfile | null;
  sessionId?: string;
  headphonesMode: boolean;
  isMuted: boolean;
  onReportReady: (report: InterviewReport) => void;
  onReportError: (msg: string) => void;
  onReportProgress?: (step: string) => void;
}


function cleanSpeechText(value: string) {
  return value.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s|\d+\.\s)/gm, '').replace(/\*\*|__|~~|\*/g, '')
    .replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/&/g, ' and ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}
function sentenceChunks(value: string) {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= 195) { chunks.push(sentence); continue; }
    let piece = '';
    for (const word of sentence.split(/\s+/)) {
      if (piece && `${piece} ${word}`.length > 195) { chunks.push(piece); piece = ''; }
      piece = piece ? `${piece} ${word}` : word;
    }
    if (piece) chunks.push(piece);
  }
  return chunks;
}
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function likelyEcho(value: string, current: string) {
  const candidate = normalized(value).split(' ').filter((w) => w.length > 2);
  const spoken = new Set(normalized(current).split(' '));
  return candidate.length >= 2 && candidate.filter((w) => spoken.has(w)).length / candidate.length >= 0.6;
}
function looksLikeInterviewerPrompt(value: string) {
  return /^(?:tell me|could you|can you tell me|what would you|how would you|walk me through|describe|explain|let(?:'|’)s talk about)\b/i.test(value.trim());
}
function openingGreeting(profile: CandidateProfile | null) {
  const name = profile?.name?.trim().split(/\s+/)[0] || 'there';
  return `Hi ${name}, thanks for joining. I've read your resume. Tell me a bit about yourself.`;
}
function waitForPlayback<T>(playback: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T | undefined> {
  let timer = 0;
  const timeout = new Promise<undefined>((resolve) => {
    timer = window.setTimeout(() => { onTimeout(); resolve(undefined); }, timeoutMs);
  });
  return Promise.race([playback, timeout]).finally(() => window.clearTimeout(timer));
}
function compactProfile(profile: CandidateProfile | null) {
  if (!profile) return '';
  return [`Name: ${profile.name || 'Candidate'}`, `Skills: ${(profile.skills || []).slice(0, 10).join(', ')}`, `Projects: ${(profile.projects || []).slice(0, 3).map((project) => `${project.name}: ${project.description}`).join('; ')}`, `Experience: ${(profile.experience || []).slice(0, 3).join('; ')}`].join('. ').slice(0, 800);
}
function summarizeEarlierTurns(messages: { role: string; content: string }[]) {
  const earlier = messages.slice(0, -8);
  if (!earlier.length) return '';
  return earlier.map((message) => `${message.role === 'assistant' ? 'Vera asked/said' : 'Candidate explained'}: ${message.content.trim().split(/\s+/).slice(0, 22).join(' ')}`).join(' ').slice(-1200);
}
function getPauseMs(text: string, patience: PausePatience) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lower = text.trim().toLowerCase();
  const endsFinished = /[.!?]["')\]]?$/.test(text.trim());
  const unfinished = /(?:\b(?:um|uh|so|and|but|because|like|i mean|you know))$/i.test(lower) || !endsFinished;
  const patienceOffset = patience === 'short' ? -500 : patience === 'patient' ? 900 : 0;
  const extra = unfinished ? 1200 : words.length > 25 && endsFinished ? -500 : 0;
  const base = endsFinished && words.length > 12 ? 1200 : 1800;
  return Math.min(6000, Math.max(700, base + extra + patienceOffset));
}

export function useVoiceInterview({ messagesRef, profile, sessionId: profileSessionId = 'vera-session', headphonesMode, isMuted, onReportReady, onReportError, onReportProgress }: UseVoiceInterviewOptions) {
  const tts = useTTS();
  const [state, setState] = useState<InterviewState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [heardText, setHeardText] = useState('');
  const [hasSpeechPending, setHasSpeechPending] = useState(false);
  const [retryingChat, setRetryingChat] = useState(false);
  const [pausePatience, setPausePatience] = useState<PausePatience>('normal');
  const [pauseCountdown, setPauseCountdown] = useState(0);
  const [wordTick, setWordTick] = useState(0);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const runningRef = useRef(false); const startingRef = useRef(false);
  const sessionActiveRef = useRef(false); const activeRef = sessionActiveRef;
  const sessionIdRef = useRef(0); const endedSessionRef = useRef(false);
  const mutedRef = useRef(isMuted); const headphonesRef = useRef(headphonesMode);
  const speakingRef = useRef(false); const shouldListenRef = useRef(false);
  const pendingTextRef = useRef(''); const interimRef = useRef(''); const turnPendingRef = useRef(false);
  const stateRef = useRef<InterviewState>('idle'); const transcriptRef = useRef<TranscriptEntry[]>([]);
  const profileRef = useRef(profile); const patienceRef = useRef(pausePatience);
  const silenceTimerRef = useRef<number | null>(null); const countdownTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null); const watchdogRef = useRef<number | null>(null);
  const thinkingWatchdogRef = useRef<number | null>(null); const speechGenerationRef = useRef(0);
  const micActivityIntervalRef = useRef<number | null>(null); const resumeTimerRef = useRef<number | null>(null);
  const pendingTurnRef = useRef<(text: string) => void>(() => {}); const recognitionRestartRef = useRef<() => void>(() => {});
  const addIdRef = useRef(0); const generatingReportRef = useRef(false);
  const chatControllersRef = useRef(new Set<AbortController>());
  const chatTimeoutsRef = useRef(new Set<number>());
  const transientTimersRef = useRef(new Map<number, () => void>());
  const audioRef = useRef<HTMLAudioElement | null>(null); const audioContextRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null); const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null); const audioFrameRef = useRef<number | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null); const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const currentSentenceRef = useRef(''); const mouthLevelRef = useRef(0); const noiseFloorRef = useRef(0);
  const lastPlayedSentenceRef = useRef(''); const ignoreRecognitionUntilRef = useRef(0); const lastSpeechEndedAtRef = useRef(0);
  const speakerBaselineSumRef = useRef(0); const speakerBaselineSamplesRef = useRef(0); const speakerEchoBaselineRef = useRef(0);
  const speakerFirstSentenceRef = useRef(false); const speakerBaselineReadyRef = useRef(false); const speakerBaselineEndRef = useRef(0);
  const lastMouthTickRef = useRef(0); const lastMicActivityRef = useRef(0);
  const likelyEchoUntilRef = useRef(0);
  const aboveThresholdSinceRef = useRef<number | null>(null); const calibrationRef = useRef(false);
  const lastAssistantIdRef = useRef<number | null>(null); const lastAssistantTextRef = useRef('');
  const timingRef = useRef({ beginAt: 0, turnEndedAt: 0, firstAudioLogged: false, turnId: 0, firstAudioTurnId: -1, turnAudioMs: [] as number[] });
  const openingAudioRef = useRef<{ sentence: string; audio: Promise<Blob> } | null>(null);
  const streamSequenceRef = useRef(0); const activeChatControllerRef = useRef<AbortController | null>(null); const inFlightTurnKeyRef = useRef<string | null>(null);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { headphonesRef.current = headphonesMode; }, [headphonesMode]);
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { patienceRef.current = pausePatience; }, [pausePatience]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const waitForSession = useCallback((delayMs: number, sessionId: number) => new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      transientTimersRef.current.delete(timer);
      resolve(sessionActiveRef.current && sessionIdRef.current === sessionId);
    }, delayMs);
    transientTimersRef.current.set(timer, () => { window.clearTimeout(timer); transientTimersRef.current.delete(timer); resolve(false); });
  }), []);

  const setInterviewState = useCallback((next: InterviewState) => {
    if (stateRef.current === next) return;
    console.info('[Vera] state changed:', stateRef.current, '->', next);
    stateRef.current = next; setState(next);
  }, []);
  const addTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    const entry = { id: ++addIdRef.current, role, text } as TranscriptEntry;
    setTranscript((old) => { const next = [...old, entry]; transcriptRef.current = next; return next; });
    if (role === 'assistant') { lastAssistantIdRef.current = entry.id; lastAssistantTextRef.current = text; }
    return entry;
  }, []);

  const cancelPlayback = useCallback(() => {
    speechGenerationRef.current += 1;
    tts.cancelPending();
    const audio = audioRef.current; if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url); objectUrlsRef.current.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    if (audioFrameRef.current !== null) cancelAnimationFrame(audioFrameRef.current);
    audioFrameRef.current = null; mouthLevelRef.current = 0;
  }, [tts.cancelPending]);

  const resumeListening = useCallback(() => {
    if (!activeRef.current) return;
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    speakingRef.current = false;
    lastSpeechEndedAtRef.current = performance.now();
    if (!headphonesRef.current) {
      ignoreRecognitionUntilRef.current = performance.now() + SPEAKER_POST_PLAYBACK_GUARD_MS;
      interimRef.current = '';
      setHeardText('');
      console.info('[Vera] speaker playback ended; recognition ignored for 700ms and interim text cleared');
      try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    }
    if (mutedRef.current) { shouldListenRef.current = true; setInterviewState('listening'); return; }
    shouldListenRef.current = true; turnPendingRef.current = false;
    setInterviewState('listening');
    const sessionId = sessionIdRef.current;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      if (sessionActiveRef.current && sessionIdRef.current === sessionId) recognitionRestartRef.current();
      else console.warn('[Vera] dropped recognition restart after End', { sessionId });
    }, 0);
  }, [setInterviewState]);

  const setupAudio = useCallback(async () => {
    if (!audioRef.current) { audioRef.current = document.createElement('audio'); audioRef.current.preload = 'auto'; }
    const context = audioContextRef.current && audioContextRef.current.state !== 'closed' ? audioContextRef.current : new AudioContext(); audioContextRef.current = context;
    await context.resume();
    if (!outputAnalyserRef.current) {
      const analyser = context.createAnalyser(); analyser.fftSize = 512; outputAnalyserRef.current = analyser;
      mediaSourceRef.current = context.createMediaElementSource(audioRef.current); mediaSourceRef.current.connect(analyser); analyser.connect(context.destination);
    }
    if (micStreamRef.current && !micAnalyserRef.current) {
      const analyser = context.createAnalyser(); analyser.fftSize = 512; micAnalyserRef.current = analyser;
      micSourceRef.current = context.createMediaStreamSource(micStreamRef.current); micSourceRef.current.connect(analyser);
    }
  }, []);

  const calibrateMic = useCallback(async (sessionId: number) => {
    const analyser = micAnalyserRef.current;
    if (!analyser) return;
    calibrationRef.current = true;
    let count = 0; let total = 0; const data = new Uint8Array(analyser.fftSize); const begin = performance.now();
    while (performance.now() - begin < 1000 && sessionActiveRef.current && sessionIdRef.current === sessionId) {
      analyser.getByteTimeDomainData(data); let sum = 0;
      for (const value of data) { const sample = (value - 128) / 128; sum += sample * sample; }
      total += Math.sqrt(sum / data.length); count += 1;
      if (!await waitForSession(50, sessionId)) return;
    }
    if (sessionActiveRef.current && sessionIdRef.current === sessionId) {
      noiseFloorRef.current = count ? total / count : 0.005;
      console.info('[Vera] mic noise floor calibrated:', noiseFloorRef.current);
    }
    calibrationRef.current = false;
  }, [waitForSession]);

  const unlockAudio = useCallback(async () => {
    try { await setupAudio(); }
    catch (error) { console.warn('[Vera] audio context unlock failed:', error); }
  }, [setupAudio]);

  const startRecognition = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass || !activeRef.current || !shouldListenRef.current || runningRef.current || startingRef.current) return;
    const sessionId = sessionIdRef.current;
    let recognition = recognitionRef.current;
    if (!recognition) {
      recognition = new SpeechRecognitionClass(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
      recognition.onstart = () => { if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) { try { recognition?.abort(); } catch { /* stale recognition */ } return; } runningRef.current = true; startingRef.current = false; setError(null); console.info('[Vera] recognition onstart'); };
      recognition.onaudiostart = () => { if (sessionActiveRef.current && sessionIdRef.current === sessionId) console.info('[Vera] recognition onaudiostart'); };
      recognition.onspeechstart = () => { if (sessionActiveRef.current && sessionIdRef.current === sessionId) console.info('[Vera] recognition onspeechstart'); };
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
        if (mutedRef.current || (turnPendingRef.current && !speakingRef.current)) return;
        let interim = ''; let final = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i]; if (item.isFinal) final += `${item[0].transcript} `; else interim += `${item[0].transcript} `;
        }
        const interimValue = interim.trim(); const finalValue = final.trim();
        if (!headphonesRef.current && !speakingRef.current && performance.now() < ignoreRecognitionUntilRef.current) {
          interimRef.current = '';
          console.info('[Vera] discarded recognition during speaker playback guard:', interimValue || finalValue || '(empty result)');
          return;
        }
        const candidateText = finalValue || interimValue;
        const nearVeraEnd = performance.now() - lastSpeechEndedAtRef.current < 1500;
        if (candidateText && (likelyEcho(candidateText, lastAssistantTextRef.current)
          || (nearVeraEnd && looksLikeInterviewerPrompt(candidateText)))) {
          interimRef.current = '';
          console.info('[Vera] discarded likely echo/interviewer phrase:', candidateText);
          return;
        }
        const withinEchoWindow = !headphonesRef.current && performance.now() < ignoreRecognitionUntilRef.current + 1500;
        if (withinEchoWindow && ((interimValue && likelyEcho(interimValue, lastPlayedSentenceRef.current)) || (finalValue && likelyEcho(finalValue, lastPlayedSentenceRef.current)))) {
          console.info('[Vera] discarded post-playback text matching Vera audio:', interimValue || finalValue);
          return;
        }
        if (interimValue) {
          console.info('[Vera] recognition onresult interim:', interimValue);
          if (speakingRef.current && interimValue.split(/\s+/).length >= 2) {
            if (!likelyEcho(interimValue, currentSentenceRef.current)) interruptVera();
            else { likelyEchoUntilRef.current = performance.now() + 900; console.info('[Vera] ignored likely speaker echo interim'); }
          }
          if (!speakingRef.current || !likelyEcho(interimValue, currentSentenceRef.current)) {
            interimRef.current = interimValue; updateHeard(); markSpeechActivity();
          }
        }
        if (finalValue) {
          console.info('[Vera] recognition onresult final:', finalValue);
          const wordCount = finalValue.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
          if (wordCount < 2) { console.info('[Vera] ignored candidate turn shorter than two words'); return; }
          if (speakingRef.current && likelyEcho(finalValue, currentSentenceRef.current)) { likelyEchoUntilRef.current = performance.now() + 900; console.info('[Vera] ignored likely speaker echo final'); return; }
          if (speakingRef.current) interruptVera();
          pendingTextRef.current = `${pendingTextRef.current} ${finalValue}`.trim(); interimRef.current = '';
          updateHeard(); markSpeechActivity();
        }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
        console.error('[Vera] recognition onerror:', event.error, event.message);
        startingRef.current = false; runningRef.current = false;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { setError('Please allow the microphone in your browser settings'); activeRef.current = false; shouldListenRef.current = false; setInterviewState('idle'); }
        else if (event.error === 'no-speech' || event.error === 'aborted') { /* onend quietly restarts */ }
        else if (event.error === 'audio-capture') setError('No microphone was found. Connect a microphone and try again.');
        else if (event.error === 'network') setError('Speech recognition needs an internet connection. Check your connection and try again.');
        else setError('Speech recognition stopped unexpectedly. Please try again.');
      };
      recognition.onend = () => {
        runningRef.current = false; startingRef.current = false; console.info('[Vera] recognition onend');
        if (sessionActiveRef.current && sessionIdRef.current === sessionId && shouldListenRef.current && !mutedRef.current) {
          if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
          const restartDelay = !headphonesRef.current && !speakingRef.current
            ? Math.max(250, ignoreRecognitionUntilRef.current - performance.now()) : 250;
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (sessionActiveRef.current && sessionIdRef.current === sessionId) recognitionRestartRef.current();
          }, restartDelay);
        }
      };
      recognitionRef.current = recognition;
    }
    startingRef.current = true;
    console.info('[Vera] recognition start requested', { sessionId });
    try { recognition.start(); }
    catch (err) {
      startingRef.current = false;
      if (err instanceof DOMException && err.name === 'InvalidStateError') { runningRef.current = true; console.warn('[Vera] recognition already active'); }
      else console.error('[Vera] recognition start failed:', err);
    }
  }, []);
  recognitionRestartRef.current = startRecognition;

  function updateHeard() {
    const combined = `${pendingTextRef.current} ${interimRef.current}`.trim();
    setHeardText(combined);
  }
  function markSpeechActivity() {
    if (turnPendingRef.current || !activeRef.current) return;
    const sessionId = sessionIdRef.current;
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    const content = `${pendingTextRef.current} ${interimRef.current}`.trim(); if (!content) return;
    const wait = getPauseMs(content, patienceRef.current); const deadline = Date.now() + wait;
    setPauseCountdown(wait); setHasSpeechPending(true);
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = window.setInterval(() => {
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
      setPauseCountdown(Math.max(0, deadline - Date.now()));
    }, 100);
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current); setPauseCountdown(0);
      const text = `${pendingTextRef.current} ${interimRef.current}`.trim();
      if (!text || turnPendingRef.current) return;
      turnPendingRef.current = true; pendingTextRef.current = ''; interimRef.current = ''; setHeardText(text); setHasSpeechPending(false);
      pendingTurnRef.current(text);
    }, wait);
  }

  const interruptVera = useCallback(() => {
    if (!speakingRef.current) return;
    console.info('[Vera] barge-in detected');
    streamSequenceRef.current += 1;
    activeChatControllerRef.current?.abort(); activeChatControllerRef.current = null;
    cancelPlayback(); speakingRef.current = false;
    // The reply continuation is invalidated above, so release its pending-turn
    // lock or subsequent recognition results would be ignored indefinitely.
    turnPendingRef.current = false;
    interimRef.current = '';
    if (!headphonesRef.current) {
      ignoreRecognitionUntilRef.current = 0;
      setHeardText('');
    }
    const lastId = lastAssistantIdRef.current;
    if (lastId !== null) {
      const text = lastAssistantTextRef.current;
      setTranscript((old) => { const next = old.map((entry) => entry.id === lastId ? { ...entry, text: `${text} (interrupted)` } : entry); transcriptRef.current = next; return next; });
      const messages = messagesRef.current; const last = messages[messages.length - 1];
      if (last?.role === 'assistant') last.content = `${last.content} (interrupted)`;
    }
    shouldListenRef.current = true; setInterviewState('listening');
    recognitionRestartRef.current();
  }, [cancelPlayback, messagesRef, setInterviewState]);

  const interrupt = useCallback(() => interruptVera(), [interruptVera]);

  // Mic-level barge-in and audio output lip-sync share a single animation loop.
  const audioLoop = useCallback(() => {
    if (speakingRef.current) {
      const out = outputAnalyserRef.current;
      if (out) { const data = new Uint8Array(out.fftSize); out.getByteTimeDomainData(data); let sum = 0; for (const v of data) { const x = (v - 128) / 128; sum += x * x; } mouthLevelRef.current = Math.min(1, Math.sqrt(sum / data.length) * 5); if (mouthLevelRef.current > 0.035 && performance.now() - lastMouthTickRef.current > 110) { lastMouthTickRef.current = performance.now(); setWordTick((tick) => tick + 1); } }
    } else mouthLevelRef.current = 0;
    const mic = micAnalyserRef.current;
    if (speakingRef.current && !calibrationRef.current && mic && !mutedRef.current) {
      const data = new Uint8Array(mic.fftSize); mic.getByteTimeDomainData(data); let sum = 0; for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
      const level = Math.sqrt(sum / data.length);
      if (!headphonesRef.current && speakerFirstSentenceRef.current && performance.now() < speakerBaselineEndRef.current) {
        speakerBaselineSumRef.current += level;
        speakerBaselineSamplesRef.current += 1;
      }
      const threshold = headphonesRef.current
        ? noiseFloorRef.current + 0.018
        : Math.max(noiseFloorRef.current * 2.5, speakerEchoBaselineRef.current * SPEAKER_ECHO_MULTIPLIER);
      if (level > threshold) {
        if (aboveThresholdSinceRef.current === null) aboveThresholdSinceRef.current = performance.now();
        const holdMs = headphonesRef.current ? 250 : SPEAKER_LEVEL_HOLD_MS;
        if (performance.now() - aboveThresholdSinceRef.current >= holdMs && (headphonesRef.current || (SPEAKER_AUTO_BARGE_IN && speakerBaselineReadyRef.current))) { aboveThresholdSinceRef.current = null; if (performance.now() > likelyEchoUntilRef.current) interruptVera(); }
      } else aboveThresholdSinceRef.current = null;
    }
    if (sessionActiveRef.current) audioFrameRef.current = requestAnimationFrame(audioLoop);
    else { audioFrameRef.current = null; mouthLevelRef.current = 0; }
  }, [interruptVera]);
  const speakReply = useCallback(async (reply: string, resumeAfter = true, preparedAudio?: Promise<Blob>) => {
    const sessionId = sessionIdRef.current;
    if (!sessionActiveRef.current) return;
    const chunks = sentenceChunks(cleanSpeechText(reply));
    if (!chunks.length) { resumeListening(); return; }
    const generation = ++speechGenerationRef.current;
    if (!headphonesRef.current) {
      ignoreRecognitionUntilRef.current = Number.POSITIVE_INFINITY;
      speakerBaselineSumRef.current = 0; speakerBaselineSamplesRef.current = 0;
      speakerEchoBaselineRef.current = 0; speakerFirstSentenceRef.current = true; speakerBaselineReadyRef.current = false;
    }
    const watchdogMs = cleanSpeechText(reply).split(/\s+/).length * 500 + 4000;
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = resumeAfter ? window.setTimeout(() => { if (generation === speechGenerationRef.current && speakingRef.current) { console.warn('[Vera] speaking watchdog fired'); cancelPlayback(); resumeListening(); } }, watchdogMs) : null;
    const logPlayback = (voice: string, lang: string) => {
      const detail = { engine: tts.engine === 'kokoro' ? 'Kokoro' : 'Browser', voice, lang, at: performance.now() };
      console.info('[Vera] speech started:', detail);
      if (!timingRef.current.firstAudioLogged) {
        timingRef.current.firstAudioLogged = true;
        console.info('[Vera timing] first audio started', { msFromBegin: Math.round(detail.at - timingRef.current.beginAt), at: detail.at });
        console.info('[Vera timing] summary', { beginToFirstAudioMs: Math.round(detail.at - timingRef.current.beginAt) });
      } else if (timingRef.current.turnEndedAt && timingRef.current.firstAudioTurnId !== timingRef.current.turnId) {
        timingRef.current.firstAudioTurnId = timingRef.current.turnId;
        const ms = Math.round(detail.at - timingRef.current.turnEndedAt);
        timingRef.current.turnAudioMs.push(ms);
        console.info('[Vera timing] turn end to first audio ms', ms);
        const averageMs = Math.round(timingRef.current.turnAudioMs.reduce((sum, value) => sum + value, 0) / timingRef.current.turnAudioMs.length);
        console.info('[Vera timing] turn summary', { turn: timingRef.current.turnId, endToAudioMs: ms, turnsMeasured: timingRef.current.turnAudioMs.length, averageEndToAudioMs: averageMs });
      }
    };
    const browserVoice = tts.engine === 'browser' ? tts.getBrowserVoice() : null;
    let kokoro = tts.engine === 'kokoro';
    let index = 0;
    const audio = audioRef.current;
    let currentUrl: string | null = null;
    try {
      if (kokoro) await setupAudio();
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
      const preparedOpening = openingAudioRef.current?.sentence === chunks[0] ? openingAudioRef.current.audio : null;
      let nextAudio = kokoro ? (preparedAudio || preparedOpening || tts.synthesize(chunks[0])) : Promise.resolve(null);
      while (index < chunks.length && generation === speechGenerationRef.current && sessionActiveRef.current && sessionIdRef.current === sessionId) {
        const sentence = chunks[index];
        currentSentenceRef.current = sentence;
        if (!headphonesRef.current && speakerFirstSentenceRef.current) speakerBaselineEndRef.current = performance.now() + Math.min(4500, Math.max(1800, sentence.split(/\s+/).length * 300));
        if (!kokoro) {
          const playback = new Promise<void>((resolve, reject) => {
            tts.speakBrowser(sentence, browserVoice, () => {
              if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || generation !== speechGenerationRef.current) return;
              speakingRef.current = true; setInterviewState('speaking');
              logPlayback(browserVoice?.name || tts.actualVoice, browserVoice?.lang || 'en');
              if (audioFrameRef.current === null) audioFrameRef.current = requestAnimationFrame(audioLoop);
            }, resolve, (reason) => reject(new Error(reason)), () => setWordTick((tick) => tick + 1));
          });
          await waitForPlayback(playback, watchdogMs, () => {
            console.warn('[Vera] browser speech completion watchdog fired; resuming interview');
            cancelPlayback();
            if (resumeAfter) resumeListening();
          });
        } else {
          const blob = await nextAudio;
          if (generation !== speechGenerationRef.current) return;
          if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
          if (!(blob instanceof Blob) || !audio) throw new Error('Kokoro did not return playable audio');
          currentUrl = URL.createObjectURL(blob); objectUrlsRef.current.add(currentUrl);
          index += 1;
          nextAudio = index < chunks.length ? tts.synthesize(chunks[index]) : Promise.resolve(null);
          audio.src = currentUrl; audio.currentTime = 0;
          const playbackEnded = new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error('Kokoro audio playback failed'));
          });
          const playback = (async () => {
            await audio.play();
            if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || generation !== speechGenerationRef.current) return;
            speakingRef.current = true; setInterviewState('speaking');
            tts.markKokoroPlayed(tts.actualVoice);
            logPlayback(tts.actualVoice, 'en-US');
            await playbackEnded;
          })();
          await waitForPlayback(playback, watchdogMs, () => {
            console.warn('[Vera] Kokoro audio completion watchdog fired; resuming interview');
            audio.onended = null; audio.onerror = null;
            audio.pause();
            cancelPlayback();
            if (resumeAfter) resumeListening();
          });
          if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || generation !== speechGenerationRef.current) return;
          URL.revokeObjectURL(currentUrl); objectUrlsRef.current.delete(currentUrl); currentUrl = null;
          if (nextAudio) void nextAudio.catch(() => {});
        }
        if (!kokoro) index += 1;
        if (!headphonesRef.current && speakerFirstSentenceRef.current) {
          speakerEchoBaselineRef.current = speakerBaselineSamplesRef.current ? speakerBaselineSumRef.current / speakerBaselineSamplesRef.current : noiseFloorRef.current;
          speakerFirstSentenceRef.current = false; speakerBaselineReadyRef.current = true;
        }
        lastPlayedSentenceRef.current = sentence;
        if (index < chunks.length && !kokoro && !await waitForSession(200, sessionId)) return;
      }
      if (resumeAfter && generation === speechGenerationRef.current && sessionActiveRef.current && sessionIdRef.current === sessionId) resumeListening();
    } catch (error) {
      if (generation !== speechGenerationRef.current || !sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
      console.error('[Vera] Kokoro speech failed; switching to browser voice:', error);
      const fallbackStart = Math.max(0, index - (currentUrl ? 1 : 0));
      if (currentUrl) { URL.revokeObjectURL(currentUrl); objectUrlsRef.current.delete(currentUrl); }
      audio?.pause();
      kokoro = false;
      const fallbackVoice = await tts.useBrowserFallback(error instanceof Error ? error.message : String(error));
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || generation !== speechGenerationRef.current) return;
      if (!fallbackVoice && !('speechSynthesis' in window)) { if (resumeAfter) resumeListening(); return; }
      index = fallbackStart;
      try {
        while (index < chunks.length && generation === speechGenerationRef.current && sessionActiveRef.current && sessionIdRef.current === sessionId) {
          const sentence = chunks[index++]; currentSentenceRef.current = sentence;
          const playback = new Promise<void>((resolve, reject) => tts.speakBrowser(sentence, fallbackVoice, () => {
            if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || generation !== speechGenerationRef.current) return;
            speakingRef.current = true; setInterviewState('speaking');
            logPlayback(fallbackVoice?.name || 'Browser voice', fallbackVoice?.lang || 'en');
            if (audioFrameRef.current === null) audioFrameRef.current = requestAnimationFrame(audioLoop);
          }, resolve, (reason) => reject(new Error(reason)), () => setWordTick((tick) => tick + 1)));
          await waitForPlayback(playback, watchdogMs, () => {
            console.warn('[Vera] fallback speech completion watchdog fired; resuming interview');
            cancelPlayback();
            if (resumeAfter) resumeListening();
          });
          if (index < chunks.length && !await waitForSession(200, sessionId)) return;
        }
        if (resumeAfter && generation === speechGenerationRef.current && sessionActiveRef.current && sessionIdRef.current === sessionId) resumeListening();
      } catch (browserError) { if (sessionActiveRef.current && sessionIdRef.current === sessionId) { console.error('[Vera] browser speech failed:', browserError); if (resumeAfter) resumeListening(); } }
    }
  }, [audioLoop, cancelPlayback, resumeListening, setInterviewState, setupAudio, tts, waitForSession]);

  useEffect(() => {
    if (!profile) { openingAudioRef.current = null; return; }
    const greeting = openingGreeting(profile);
    const firstSentence = sentenceChunks(cleanSpeechText(greeting))[0];
    if (!firstSentence) return;
    const preparedAt = performance.now();
    const audio = tts.synthesize(firstSentence);
    openingAudioRef.current = { sentence: firstSentence, audio };
    console.info('[Vera timing] opening line synthesis started', { at: preparedAt });
    void audio.then(() => console.info('[Vera timing] opening line audio cached', { ms: Math.round(performance.now() - preparedAt), at: performance.now() }))
      .catch((error) => console.info('[Vera timing] opening line pre-synthesis unavailable:', error));
  }, [profile, tts.synthesize]);

  const processUserInput = useCallback(async (text: string) => {
    const sessionId = sessionIdRef.current;
    timingRef.current.turnEndedAt = performance.now();
    timingRef.current.turnId += 1;
    console.info('[Vera timing] end-of-user-turn', { at: timingRef.current.turnEndedAt, sessionId });
    const trimmed = text.trim();
    const wordCount = trimmed.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    if (!trimmed || !activeRef.current) { turnPendingRef.current = false; return; }
    if (wordCount < 2 || likelyEcho(trimmed, lastAssistantTextRef.current)
      || (performance.now() - lastSpeechEndedAtRef.current < 1500 && looksLikeInterviewerPrompt(trimmed))) {
      console.info('[Vera] ignored empty/noise/echo candidate turn:', trimmed);
      pendingTextRef.current = ''; interimRef.current = ''; turnPendingRef.current = false;
      setHeardText(''); setHasSpeechPending(false); setPauseCountdown(0); setInterviewState('listening');
      return;
    }
    if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
    const turnRequestKey = `${sessionId}:${timingRef.current.turnId}`;
    if (inFlightTurnKeyRef.current === turnRequestKey) { console.warn('[Vera chat] duplicate turn ignored', { sessionId, turnId: timingRef.current.turnId }); return; }
    inFlightTurnKeyRef.current = turnRequestKey;
    const streamSequence = ++streamSequenceRef.current;
    addTranscript('user', trimmed); messagesRef.current.push({ role: 'user', content: trimmed }); setInterviewState('thinking');
    if (thinkingWatchdogRef.current) window.clearTimeout(thinkingWatchdogRef.current);
    thinkingWatchdogRef.current = window.setTimeout(() => { if (sessionActiveRef.current && sessionIdRef.current === sessionId && streamSequenceRef.current === streamSequence && stateRef.current === 'thinking') { setError('Vera is taking too long to respond. Please try again.'); resumeListening(); } }, 14_000);
    const controller = new AbortController(); activeChatControllerRef.current = controller; chatControllersRef.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20_500); chatTimeoutsRef.current.add(timeout);
    let playback = Promise.resolve(); let streamedReply = ''; let gotFallback = false; let firstSentenceLogged = false;
    const enqueueSentence = (sentence: string) => {
      const cleanSentence = sentence.trim(); if (!cleanSentence) return;
      if (!firstSentenceLogged) {
        firstSentenceLogged = true;
        console.info('[Vera timing] first sentence ready', { msFromTurnEnd: Math.round(performance.now() - timingRef.current.turnEndedAt), at: performance.now() });
      }
      streamedReply = `${streamedReply} ${cleanSentence}`.trim();
      const prepared = tts.engine === 'kokoro' ? tts.synthesize(cleanSentence) : undefined;
      playback = playback.then(() => {
        if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || streamSequenceRef.current !== streamSequence) return;
        return speakReply(cleanSentence, false, prepared);
      });
    };
    try {
      const fullMessages = messagesRef.current;
      const payload = {
        messages: fullMessages.slice(-8),
        profileSummary: compactProfile(profileRef.current),
        conversationSummary: summarizeEarlierTurns(fullMessages),
        sessionId: profileSessionId,
        turnId: timingRef.current.turnId,
      };
      const sentAt = performance.now();
      console.info('[Vera timing] request sent', { at: sentAt, sessionId, messageCount: payload.messages.length, contextCharacters: payload.conversationSummary.length });
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(payload), signal: controller.signal });
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
      setRetryingChat(false);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === 'string' ? data.detail : '';
        console.error('[Vera chat] API rejected request', { status: response.status, error: data.error, detail });
        setError(response.status === 400 ? 'Vera could not use that turn. Please try saying it again.'
          : response.status === 401 ? 'Vera could not connect to the interview service. Please try again later.'
            : response.status === 429 ? 'Vera is busy for a moment. Please try again shortly.'
              : response.status >= 500 ? 'Vera’s interview service is temporarily unavailable.' : 'Vera lost the connection for a moment.');
        throw new Error(data.detail || data.error || `Chat request failed (${response.status})`);
      }
      if (!response.body) throw new Error('Chat stream returned no response body');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      const handleFrame = (frame: string) => {
        const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
        const dataText = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!event || !dataText) return;
        const data = JSON.parse(dataText);
        if (event === 'sentence') enqueueSentence(data.text || '');
        if (event === 'fallback') {
          gotFallback = true;
          const fallback = data.reply || 'Sorry, I lost that for a second. Could you say it again?';
          if (data.friendlyMessage) setError(data.friendlyMessage);
          enqueueSentence(fallback);
          const assistantReply = `${streamedReply.trim()} ${fallback}`.trim();
          addTranscript('assistant', assistantReply); messagesRef.current.push({ role: 'assistant', content: assistantReply });
        }
        if (event === 'done') {
          const reply = String(data.reply || streamedReply).trim();
          if (reply) { addTranscript('assistant', reply); messagesRef.current.push({ role: 'assistant', content: reply }); }
          console.info('[Vera timing] stream complete', { msFromTurnEnd: Math.round(performance.now() - timingRef.current.turnEndedAt), retryCount: data.retryCount || 0 });
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
        for (const frame of frames) handleFrame(frame);
      }
      if (buffer.trim()) handleFrame(buffer);
      if (!streamedReply) {
        gotFallback = true;
        enqueueSentence('Sorry, I lost that for a second. Could you say it again?');
        addTranscript('assistant', 'Sorry, I lost that for a second. Could you say it again?');
        messagesRef.current.push({ role: 'assistant', content: 'Sorry, I lost that for a second. Could you say it again?' });
      }
      await playback;
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || streamSequenceRef.current !== streamSequence) return;
      if (thinkingWatchdogRef.current) window.clearTimeout(thinkingWatchdogRef.current);
      turnPendingRef.current = false;
      resumeListening();
    } catch (err) {
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || streamSequenceRef.current !== streamSequence) return;
      setRetryingChat(false);
      if (thinkingWatchdogRef.current) window.clearTimeout(thinkingWatchdogRef.current);
      console.warn('[Vera timing] chat failed; speaking fallback', { reason: err instanceof Error ? err.message : String(err) });
      const fallback = 'Sorry, I lost that for a second. Could you say it again?';
      if (!error) setError('Vera could not reach the interview service. Please try your answer again.');
      addTranscript('assistant', fallback); messagesRef.current.push({ role: 'assistant', content: fallback });
      turnPendingRef.current = false;
      await speakReply(fallback);
    } finally {
      if (activeChatControllerRef.current === controller) activeChatControllerRef.current = null;
      chatControllersRef.current.delete(controller);
      window.clearTimeout(timeout); chatTimeoutsRef.current.delete(timeout);
      if (inFlightTurnKeyRef.current === turnRequestKey) inFlightTurnKeyRef.current = null;
    }
  }, [addTranscript, error, messagesRef, resumeListening, setError, setInterviewState, speakReply, tts.engine, tts.synthesize]);
  pendingTurnRef.current = (text) => { void processUserInput(text); };

  const submitNow = useCallback(() => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current); setPauseCountdown(0);
    const text = `${pendingTextRef.current} ${interimRef.current}`.trim();
    if (!text || turnPendingRef.current) return;
    pendingTextRef.current = ''; interimRef.current = ''; turnPendingRef.current = true; setHeardText(text); setHasSpeechPending(false); pendingTurnRef.current(text);
  }, []);

  const generateReport = useCallback(async (entries: TranscriptEntry[] = transcriptRef.current) => {
    if (generatingReportRef.current) return; generatingReportRef.current = true;
    if (!entries.length) { generatingReportRef.current = false; onReportError('There is not enough interview transcript to create a report.'); return; }
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 46_000);
    console.info('[Vera report timing] request started', { turns: entries.length, approximateTokens: Math.ceil(entries.reduce((sum, entry) => sum + entry.text.length, 0) / 4), at: startedAt });
    try {
      const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ transcript: entries, profile: profileRef.current }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Report request failed (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let report: InterviewReport | null = null;
      const handleFrame = (frame: string) => {
        const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
        const dataText = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!event || !dataText) return;
        const data = JSON.parse(dataText);
        if (event === 'progress' && typeof data.step === 'string') onReportProgress?.(data.step);
        if (event === 'done' && data.report) report = data.report as InterviewReport;
      };
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
        frames.forEach(handleFrame);
      }
      if (buffer.trim()) handleFrame(buffer);
      const completedReport = report as InterviewReport | null;
      if (!completedReport) throw new Error('No report returned from server stream');
      console.info('[Vera report timing] complete', { totalMs: Math.round(performance.now() - startedAt), local: completedReport.basicReport === true });
      onReportReady(completedReport);
    } catch (err) {
      console.error('[Vera report timing] server report failed; creating local report', { reason: err instanceof Error ? err.message : String(err), totalMs: Math.round(performance.now() - startedAt) });
      onReportReady(createBasicReport(entries));
    } finally { window.clearTimeout(timeout); generatingReportRef.current = false; }
  }, [onReportError, onReportReady, onReportProgress]);

  const start = useCallback(async () => {
    const sessionId = ++sessionIdRef.current;
    inFlightTurnKeyRef.current = null;
      timingRef.current.beginAt = performance.now(); timingRef.current.firstAudioLogged = false; timingRef.current.firstAudioTurnId = -1; timingRef.current.turnAudioMs = [];
    endedSessionRef.current = false;
    activeRef.current = true; shouldListenRef.current = false; speakingRef.current = false;
    console.info('[Vera timing] Begin clicked', { at: timingRef.current.beginAt, sessionId });
    setError(null); setInterviewState('idle');
    setHeardText(''); setHasSpeechPending(false); setTranscript([]); transcriptRef.current = []; pendingTextRef.current = ''; interimRef.current = ''; turnPendingRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) { stream.getTracks().forEach((track) => track.stop()); return; }
      micStreamRef.current = stream;
      await setupAudio(); setError(null);
    } catch (err) {
      const denied = err instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(err.name);
      setError(denied ? 'Please allow the microphone in your browser settings' : err instanceof Error ? err.message : 'No microphone was found. Connect a microphone and try again.');
      activeRef.current = false; shouldListenRef.current = false; setInterviewState('idle'); return;
    }
    if (!sessionActiveRef.current || sessionIdRef.current !== sessionId) return;
    shouldListenRef.current = true; ignoreRecognitionUntilRef.current = 0;
    const greeting = openingGreeting(profileRef.current);
    addTranscript('assistant', greeting); messagesRef.current = [{ role: 'assistant', content: greeting }];
    void calibrateMic(sessionId);
    if (micActivityIntervalRef.current !== null) window.clearInterval(micActivityIntervalRef.current);
    micActivityIntervalRef.current = window.setInterval(() => {
      if (!sessionActiveRef.current || sessionIdRef.current !== sessionId || speakingRef.current || !micAnalyserRef.current || mutedRef.current) return;
      const analyser = micAnalyserRef.current; const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data);
      let sum = 0; for (const value of data) { const x = (value - 128) / 128; sum += x * x; }
      if (Math.sqrt(sum / data.length) > noiseFloorRef.current + (headphonesRef.current ? 0.018 : 0.04) && performance.now() - lastMicActivityRef.current > 300) { lastMicActivityRef.current = performance.now(); markSpeechActivity(); }
    }, 100);
    if (audioFrameRef.current === null) audioFrameRef.current = requestAnimationFrame(audioLoop);
    startRecognition(); speakReply(greeting);
  }, [addTranscript, audioLoop, calibrateMic, messagesRef, setInterviewState, setupAudio, speakReply, startRecognition]);

  const endInterview = useCallback((options: { quiet?: boolean } = {}) => {
    if (endedSessionRef.current) return transcriptRef.current;
    endedSessionRef.current = true;
    const endedId = sessionIdRef.current;
    sessionActiveRef.current = false; sessionIdRef.current += 1;
    console.info('[Vera] endInterview: invalidated session', { endedId, nextSessionId: sessionIdRef.current });
    shouldListenRef.current = false; speakingRef.current = false; turnPendingRef.current = true;
    for (const controller of chatControllersRef.current) controller.abort(); chatControllersRef.current.clear();
    for (const timeout of chatTimeoutsRef.current) window.clearTimeout(timeout); chatTimeoutsRef.current.clear();
    for (const [timer, cancel] of transientTimersRef.current) { window.clearTimeout(timer); cancel(); } transientTimersRef.current.clear();
    for (const timer of [silenceTimerRef.current, restartTimerRef.current, watchdogRef.current, thinkingWatchdogRef.current, resumeTimerRef.current]) if (timer !== null) window.clearTimeout(timer);
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    if (micActivityIntervalRef.current !== null) window.clearInterval(micActivityIntervalRef.current);
    silenceTimerRef.current = null; restartTimerRef.current = null; watchdogRef.current = null; thinkingWatchdogRef.current = null;
    resumeTimerRef.current = null; countdownTimerRef.current = null; micActivityIntervalRef.current = null;
    calibrationRef.current = false; cancelPlayback(); tts.cancelPending(true);
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onstart = null; recognition.onaudiostart = null; recognition.onspeechstart = null;
      recognition.onresult = null; recognition.onerror = null; recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
    recognitionRef.current = null; runningRef.current = false; startingRef.current = false;
    micStreamRef.current?.getTracks().forEach((track) => track.stop()); micStreamRef.current = null;
    try { micSourceRef.current?.disconnect(); } catch { /* already disconnected */ } micSourceRef.current = null; micAnalyserRef.current = null;
    try { mediaSourceRef.current?.disconnect(); } catch { /* already disconnected */ } mediaSourceRef.current = null; outputAnalyserRef.current = null;
    audioRef.current = null;
    const context = audioContextRef.current; audioContextRef.current = null; if (context && context.state !== 'closed') void context.close();
    pendingTextRef.current = ''; interimRef.current = ''; setHasSpeechPending(false); setPauseCountdown(0); setHeardText(''); setRetryingChat(false);
    inFlightTurnKeyRef.current = null;
    aboveThresholdSinceRef.current = null; speakerFirstSentenceRef.current = false; speakerBaselineReadyRef.current = false;
    if (!options.quiet) setInterviewState('idle'); else stateRef.current = 'idle';
    return transcriptRef.current;
  }, [cancelPlayback, setInterviewState, tts.cancelPending]);

  const stop = endInterview;

  useEffect(() => { setIsSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) && 'speechSynthesis' in window); }, []);
  useEffect(() => {
    const unload = () => { console.info('[Vera] page unload; ending interview'); endInterview({ quiet: true }); };
    window.addEventListener('pagehide', unload);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('pagehide', unload); window.removeEventListener('beforeunload', unload); endInterview({ quiet: true }); };
  }, [endInterview]);

  return {
    state, transcript, error, heardText, isSupported, start, stop, endInterview, generateReport, unlockAudio, submitNow, interrupt,
    wordTick, mouthLevel: mouthLevelRef.current, pauseCountdown, pausePatience, setPausePatience, hasSpeechPending,
    voiceEngine: tts.engine as VoiceEngine, actualVoice: tts.actualVoiceLabel, selectedVoiceName: tts.selectedVoiceName,
    setSelectedVoiceName: tts.setSelectedVoiceName, voiceOptions: tts.options as VoiceOption[],
    voiceLoading: tts.loading, voiceProgress: tts.progress, browserFallback: tts.fallback,
    noFemaleVoice: tts.noFemaleVoice, retryingChat,
  };
}
