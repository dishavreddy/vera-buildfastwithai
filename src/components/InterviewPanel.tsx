import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, PhoneOff, AlertCircle, ArrowRight,
  ChevronLeft, ChevronRight, Radio, Clock, Headphones,
  Subtitles, X,
} from 'lucide-react';
import {
  useVoiceInterview,
  type TranscriptEntry,
} from '@/hooks/useVoiceInterview';
import { StateIndicator } from '@/components/StateIndicator';
import { ReportView } from '@/components/ReportView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LandingScreen } from '@/components/LandingScreen';
import { Stepper, Tag } from '@/components/ui/Primitives';
import { warmApi } from '@/lib/api';
import type { CandidateProfile, InterviewReport } from '@/types/interview';

type Phase = 'setup' | 'interview' | 'report';

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  onController?: (controller: AbortController | null) => void,
  isStale: () => boolean = () => false,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (isStale()) throw new DOMException('Stale upload response', 'AbortError');
    const controller = new AbortController();
    onController?.(controller);
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      console.info(`[Vera upload] ${label} response:`, { status: response.status, attempt: attempt + 1 });
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel().catch(() => {});
        console.warn(`[Vera upload] retrying ${label} after HTTP ${response.status} in 700ms.`);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        continue;
      }
      return response;
    } catch (error) {
      if (isStale()) throw error;
      const retryable = error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError');
      if (retryable && attempt === 0) {
        console.warn(`[Vera upload] ${label} network/timeout failure; retrying in 700ms:`, error);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        continue;
      }
      if (error instanceof DOMException && error.name === 'AbortError') console.error(`[Vera upload] ${label} AbortError:`, error);
      throw error;
    } finally {
      window.clearTimeout(timeout);
      if (onController) onController(null);
    }
  }
  throw new Error(`${label} failed after retry.`);
}

function friendlyResumeError(error: unknown) {
  if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
    return 'Something went wrong reading your resume. Try again or paste your text instead.';
  }
  return error instanceof Error ? error.message : 'Something went wrong reading your resume. Try again or paste your text instead.';
}

const PROFILE_SKILL_KEYWORDS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'React', 'Next.js', 'Node.js', 'Express', 'Angular', 'Vue', 'Svelte', 'HTML', 'CSS', 'Tailwind', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Git', 'GraphQL', 'REST', 'Machine Learning', 'TensorFlow', 'PyTorch', 'Figma', 'Agile', 'Scrum', 'Linux', 'Firebase', 'Supabase', 'Jest', 'Playwright'];
function buildBasicProfileFromText(text: string): CandidateProfile {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const skills = PROFILE_SKILL_KEYWORDS.filter((skill) => text.toLowerCase().includes(skill.toLowerCase()));
  return { name: (lines[0] || 'Candidate').replace(/^(?:name\s*[:|-]\s*)/i, '').slice(0, 100), skills, keyTechnologies: skills, projects: [], experience: [], basicProfile: true };
}

export function InterviewPanel() {
  const [voiceNoteDismissed, setVoiceNoteDismissed] = useState(false);
  const messagesRef = useRef<{ role: string; content: string }[]>([]);
  const sessionIdRef = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `vera-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const [phase, setPhase] = useState<Phase>('setup');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportProgress, setReportProgress] = useState('Reading answers...');
  const [finalTranscript, setFinalTranscript] = useState<TranscriptEntry[]>([]);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [headphonesMode, setHeadphonesMode] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const endingRef = useRef(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const micCheckStreamRef = useRef<MediaStream | null>(null);
  const micCheckContextRef = useRef<AudioContext | null>(null);
  const micCheckFrameRef = useRef<number | null>(null);
  const [micStatus, setMicStatus] = useState<'idle' | 'checking' | 'ready' | 'failed'>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const startTimeRef = useRef<number>(0);
  const prevStateRef = useRef<string>('idle');
  const uploadInFlightRef = useRef(false);
  const uploadGenerationRef = useRef(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const profileBuildInFlightRef = useRef(false);

  useEffect(() => { void warmApi(); }, []);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Interview timer
  useEffect(() => {
    if (phase !== 'interview') return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleReportReady = useCallback((r: InterviewReport) => {
    setReport(r);
    setReportLoading(false);
    setReportError(null);
    setPhase('report');
  }, []);

  const handleReportError = useCallback((msg: string) => {
    setReportError(msg);
    setReportLoading(false);
    setPhase('report');
    setToastMessage(`Failed to generate report: ${msg}`);
  }, []);

  const handleReportProgress = useCallback((step: string) => setReportProgress(step), []);

  const { state, transcript, error, heardText, hasSpeechPending, pauseCountdown, pausePatience, setPausePatience, wordTick, mouthLevel, actualVoice, voiceOptions, selectedVoiceName, setSelectedVoiceName, voiceLoading, voiceProgress, browserFallback, noFemaleVoice, retryingChat, isSupported, start, endInterview, generateReport, unlockAudio, submitNow, interrupt } = useVoiceInterview({
    headphonesMode,
    isMuted,
    messagesRef,
    profile,
    sessionId: sessionIdRef.current,
    onReportReady: handleReportReady,
    onReportError: handleReportError,
    onReportProgress: handleReportProgress,
  });

  // Interruption detection: when speech was happening and candidate barges in
  useEffect(() => {
    if (prevStateRef.current === 'speaking' && (state === 'listening' || state === 'thinking')) {
      setIsInterrupted(true);
      const timer = setTimeout(() => setIsInterrupted(false), 900);
      return () => clearTimeout(timer);
    }
    prevStateRef.current = state;
  }, [state]);

  // Sync hook errors to toast
  useEffect(() => {
    if (error) {
      setToastMessage(error);
    }
  }, [error]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Recent transcript for live captions
  const recentTranscript = transcript.slice(-3);

  const stopMicCheck = useCallback(() => {
    if (micCheckFrameRef.current !== null) cancelAnimationFrame(micCheckFrameRef.current);
    micCheckFrameRef.current = null;
    micCheckStreamRef.current?.getTracks().forEach((track) => track.stop());
    micCheckStreamRef.current = null;
    if (micCheckContextRef.current && micCheckContextRef.current.state !== 'closed') void micCheckContextRef.current.close();
    micCheckContextRef.current = null;
  }, []);

  const checkMicrophone = useCallback(async () => {
    stopMicCheck();
    setMicLevel(0);
    setMicStatus('checking');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micCheckStreamRef.current = stream;
      const context = new AudioContext();
      micCheckContextRef.current = context;
      await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      setMicStatus('ready');
      let lastUpdate = 0;
      const data = new Uint8Array(analyser.fftSize);
      const sample = (now: number) => {
        if (micCheckStreamRef.current !== stream) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0; for (const value of data) { const signal = (value - 128) / 128; sum += signal * signal; }
        if (now - lastUpdate > 70) { setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 9)); lastUpdate = now; }
        micCheckFrameRef.current = requestAnimationFrame(sample);
      };
      micCheckFrameRef.current = requestAnimationFrame(sample);
    } catch (error) {
      stopMicCheck();
      setMicStatus('failed');
      setToastMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Allow microphone access in your browser settings, then check again.' : 'Vera could not access a microphone. Connect one and try again.');
    }
  }, [stopMicCheck]);

  useEffect(() => () => stopMicCheck(), [stopMicCheck]);

  const handleResumeText = useCallback(async (text: string, generation?: number) => {
    if (!text.trim() || profileBuildInFlightRef.current) {
      if (profileBuildInFlightRef.current) console.info('[Vera profile] ignored duplicate profile-build submission');
      return;
    }
    profileBuildInFlightRef.current = true;
    setParsing(true);
    setParseError(null);
    setProfile(null);
    try {
      const profileResponse = await fetchWithRetry('/api/build-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId: sessionIdRef.current }),
      }, 'profile build', undefined, () => generation !== undefined && generation !== uploadGenerationRef.current);
      if (generation !== undefined && generation !== uploadGenerationRef.current) return;
      if (!profileResponse.ok) {
        const failure = await profileResponse.json().catch(() => ({}));
        throw new Error(failure.error || 'Something went wrong reading your resume. Try again or paste your text instead.');
      }
      const profileData = await profileResponse.json();
      const parsedProfile = { ...profileData.profile, basicProfile: Boolean(profileData.basicProfile || profileData.profile?.basicProfile) } as CandidateProfile;
      if (parsedProfile.basicProfile) console.warn('[Vera profile] using local basic profile:', { error: profileData.error, upstreamStatus: profileData.upstreamStatus, detail: profileData.detail });
      setProfile(parsedProfile);
      console.info('[Vera timing] resume profile ready', { at: performance.now() });
      void fetch('/api/warm-chat', { method: 'POST' }).then((response) => {
        console.info('[Vera timing] chat warm-up completed', { at: performance.now(), status: response.status });
      }).catch((error) => console.info('[Vera] optional chat warm-up unavailable:', error));
    } catch (err) {
      if (generation !== undefined && generation !== uploadGenerationRef.current) return;
      const localProfile = buildBasicProfileFromText(text);
      setProfile(localProfile);
      console.warn('[Vera profile] profile service failed; using local profile for this session:', friendlyResumeError(err));
      console.info('[Vera timing] local resume profile ready', { at: performance.now() });
      void fetch('/api/warm-chat', { method: 'POST' }).catch(() => {});
    } finally {
      setParsing(false);
      profileBuildInFlightRef.current = false;
    }
  }, []);

  // Resume Upload Handler: sends FormData to backend and then extracted text to profile builder
  const handleResumeSelected = useCallback(async (file: File | null) => {
    if (uploadInFlightRef.current && file) {
      console.info('[Vera upload] ignored duplicate selection while a request is in flight.');
      return;
    }
    const generation = ++uploadGenerationRef.current;
    if (uploadControllerRef.current) uploadControllerRef.current.abort();
    setResumeFile(file);
    setProfile(null);
    setParseError(null);

    if (!file) {
      uploadInFlightRef.current = false;
      uploadControllerRef.current = null;
      setParsing(false);
      return;
    }

    setParsing(true);
    uploadInFlightRef.current = true;
    try {
      await warmApi();
      if (generation !== uploadGenerationRef.current) return;
      // 1. Send file via FormData to POST /api/parse-resume
      const formData = new FormData();
      formData.append('resume', file);
      console.info('[Vera upload] request start:', { name: file.name, size: file.size, endpoint: '/api/parse-resume' });
      const parseResponse = await fetchWithRetry('/api/parse-resume', {
        method: 'POST',
        body: formData,
      }, 'PDF parse', (controller) => { uploadControllerRef.current = controller; }, () => generation !== uploadGenerationRef.current);
      if (generation !== uploadGenerationRef.current) return;

      if (!parseResponse.ok) {
        const messages: Record<number, string> = {
          422: "I couldn't read text from that PDF. It might be a scan. Try another file or paste your resume text instead.",
          413: 'That file is too big. Please use a PDF under 5 MB.',
        };
        throw new Error(messages[parseResponse.status] || 'Something went wrong reading your resume. Try again or paste your text instead.');
      }

      const { text } = await parseResponse.json();
      if (!text || text.trim().length === 0) {
        throw new Error('No readable text could be extracted from this PDF.');
      }

      await handleResumeText(text, generation);
    } catch (err) {
      if (generation !== uploadGenerationRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') console.warn('[Vera upload] upload AbortError:', err);
      const msg = friendlyResumeError(err);
      setParseError(msg);
      setToastMessage(msg);
    } finally {
      if (generation === uploadGenerationRef.current) {
        setParsing(false);
        uploadInFlightRef.current = false;
        uploadControllerRef.current = null;
      }
    }
  }, [handleResumeText]);

  const handleStart = () => {
    if (!profile || micStatus !== 'ready' || !isSupported) return;
    console.info('[Vera timing] Begin button handler', { at: performance.now() });
    endingRef.current = false;
    setWrappingUp(false);
    stopMicCheck();
    setReport(null);
    setReportError(null);
    setReportLoading(false);
    setElapsed(0);
    setPhase('interview');
    start();
  };

  const handleStop = () => {
    if (endingRef.current) return;
    endingRef.current = true;
    console.info('[Vera] End confirmation accepted');
    const entries = endInterview();
    setFinalTranscript(entries);
    setWrappingUp(true);
    setReportLoading(true);
    setReportProgress('Reading answers...');
    setPhase('report');
    void generateReport(entries);
  };

  const handleRetryReport = () => {
    setReport(null);
    setReportError(null);
    setReportLoading(true);
    setReportProgress('Reading answers...');
    void generateReport(finalTranscript);
  };

  useEffect(() => {
    if (!showEndConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !endingRef.current) setShowEndConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showEndConfirm]);

  const handleRestart = () => {
    setPhase('setup');
    setReport(null);
    setReportError(null);
    setReportLoading(false);
    setFinalTranscript([]);
    setProfile(null);
    setResumeFile(null);
    setParseError(null);
    setElapsed(0);
  };

  // --- SKELETON LOADING STATE ---
  const ReportLoading = () => (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center p-6">
      <div className="max-w-2xl w-full flex flex-col items-center gap-6 text-center">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-lime-300/10" />
          <div className="absolute inset-0 rounded-full border-2 border-lime-300 border-t-transparent animate-spin" />
          <span className="text-xl font-bold text-lime-200">
            V
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Vera is reviewing your interview...
          </h2>
          <p className="text-xs text-text-muted">
            {reportProgress}
          </p>
        </div>

        <div className="w-full glass rounded-2xl p-5 flex flex-col gap-4 mt-2">
          <div className="skeleton h-5 w-44 rounded" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="skeleton w-16 h-16 rounded-full" />
                <div className="skeleton h-3 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 flex flex-col gap-2">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-4/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // --- REPORT PHASE ---
  if (phase === 'report') {
    if (reportLoading && !report && !reportError) return <ReportLoading />;

    if (reportError && !report) {
      return (
        <div className="min-h-screen bg-background text-text-primary flex items-center justify-center px-4">
          <Card className="max-w-md w-full flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-red-300">Assessment Error</h3>
                <p className="text-xs text-text-secondary mt-1">{reportError}</p>
              </div>
            </div>
            <Button variant="secondary" size="md" className="w-full" onClick={handleRestart}>
              Return to Setup
            </Button>
          </Card>
        </div>
      );
    }

    if (report) {
      return (
        <>
          <ReportView
            report={report}
            profile={profile}
            transcript={finalTranscript}
            onRestart={handleRestart}
            onRetry={handleRetryReport}
          />
        </>
      );
    }
  }

  // --- SETUP & INTERVIEW PHASES ---
  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col relative overflow-x-hidden">

      {/* Global Toast Alert Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%] glass-strong border-rose-300/20 rounded-[1.5rem] px-4 py-3 shadow-2xl flex items-center justify-between gap-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
              <span className="text-text-primary leading-tight">{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss message"
              className="text-text-muted hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent Slim Header */}
      <header className="relative z-20 flex items-center justify-between gap-5 border-b border-white/[.08] bg-black/40 px-5 py-4 backdrop-blur-xl sm:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-3" aria-label="Vera home">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-500 text-lg font-bold text-black shadow-[0_0_26px_rgba(204,255,0,.22)]">V</span>
          <span><span className="block text-base font-semibold tracking-[-.04em] text-text-primary">vera</span><span className="block font-micro text-text-muted">Interview practice</span></span>
        </a>
        {phase === 'setup' ? (
          <>
            <nav aria-label="Main navigation" className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[.035] p-1 md:flex">
              <a href="#how-it-works" className="rounded-full px-4 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary">How it works</a>
              <a href="#features" className="rounded-full px-4 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary">Features</a>
              <a href="#resume" className="rounded-full px-4 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary">Start</a>
            </nav>
            <div className="flex items-center gap-2 sm:gap-4">
              <Tag tone={isSupported ? 'emerald' : 'rose'} dot className="hidden sm:inline-flex">{isSupported ? 'Voice ready' : 'Voice unavailable'}</Tag>
              <Button size="sm" onClick={() => document.getElementById('resume')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="hidden sm:inline-flex">Start interview <ArrowRight className="h-3.5 w-3.5"/></Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-end gap-3 sm:gap-6">
            <div className="hidden max-w-[500px] flex-1 lg:block"><Stepper steps={['Intro', 'Resume', 'Technical', 'Wrap-up']} current={state === 'thinking' ? 2 : state === 'speaking' ? 0 : 1}/></div>
            <Tag tone="lime" dot>Live · {formatTime(elapsed)}</Tag>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        <AnimatePresence mode="wait">
          {/* Landing and first-time setup */}
          {phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <LandingScreen
                profile={profile}
                parsing={parsing}
                parseError={parseError}
                pasteText={pasteText}
                micStatus={micStatus}
                micLevel={micLevel}
                isSupported={isSupported}
                selectedVoiceName={selectedVoiceName}
                voiceOptions={voiceOptions}
                actualVoice={actualVoice}
                voiceLoading={voiceLoading}
                voiceProgress={voiceProgress}
                browserFallback={browserFallback}
                noFemaleVoice={noFemaleVoice}
                canStart={Boolean(profile && micStatus === 'ready' && isSupported && !parsing)}
                startReason={!profile ? 'Add your resume or paste your experience to continue.' : micStatus !== 'ready' ? 'Check your microphone to continue.' : !isSupported ? 'Use a supported browser to start the voice interview.' : 'Preparing your interview.'}
                onFileSelected={handleResumeSelected}
                onPasteChange={setPasteText}
                onPasteContinue={() => void handleResumeText(pasteText)}
                onVoiceChange={(voice) => setSelectedVoiceName(voice as typeof selectedVoiceName)}
                onMicCheck={() => { void unlockAudio(); void checkMicrophone(); }}
                onStart={handleStart}
              />
            </motion.div>
          )}

          {/* ================= SCREEN 2: LIVE INTERVIEW ================= */}
          {phase === 'interview' && (
            <motion.div
              key="interview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full max-w-6xl min-h-[calc(100vh-150px)] flex flex-col items-center justify-between gap-6 py-2 sm:py-5"
            >
              {/* Center Stage: Avatar + Status Pill */}
              <div className="relative my-auto flex w-full flex-1 flex-col items-center justify-center rounded-[2.5rem] border border-white/[.07] bg-[radial-gradient(ellipse_at_50%_35%,rgba(204,255,0,.07),transparent_54%),rgba(255,255,255,.018)] px-3 py-7 sm:px-8 sm:py-9">
                <StateIndicator
                  state={state}
                  speaking={state === 'speaking'}
                  isInterrupted={isInterrupted}
                  wordTick={wordTick}
                  audioLevel={mouthLevel > 0.008 ? mouthLevel : undefined}
                />

                {/* Barge-in alert flash banner */}
                <AnimatePresence>
                  {isInterrupted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute top-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200"
                    >
                      Barge-in: Vera paused to listen
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Live Captions Strip */}
                {showCaptions && (
                  <div className="w-full max-w-2xl mt-4 px-4">
                    <div className="glass min-h-[76px] rounded-[1.5rem] px-5 py-4 shadow-lg">
                      {recentTranscript.length > 0 ? (
                        recentTranscript.map((entry, i) => {
                          const isLatest = i === recentTranscript.length - 1;
                          return (
                            <div
                              key={entry.id}
                              className="text-xs sm:text-sm leading-relaxed transition-all"
                              style={{
                                opacity: isLatest ? 1 : 0.45,
                              }}
                            >
                              <span
                                className={`font-semibold mr-2 ${
                                  entry.role === 'assistant' ? 'text-lime-200' : 'text-emerald-300'
                                }`}
                              >
                                {entry.role === 'assistant' ? 'Vera:' : 'You:'}
                              </span>
                              <span className="text-text-primary">{entry.text}</span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-text-muted text-center">
                          {state === 'listening' ? 'Go ahead, I’m listening.' : 'Getting your interview ready…'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {error && <p role="status" className="w-full max-w-2xl mt-2 px-4 text-sm text-rose-200">{error}</p>}
                {retryingChat && <p role="status" className="w-full max-w-2xl mt-1 px-4 text-xs text-text-muted">Give me a second…</p>}
                {browserFallback && !voiceNoteDismissed && <p role="status" className="w-full max-w-2xl mt-1 flex items-center gap-2 px-4 text-xs text-text-muted">Using your browser’s voice. Edge or a faster laptop gives a more natural one.<button type="button" onClick={() => setVoiceNoteDismissed(true)} className="min-h-8 rounded px-1 text-text-secondary underline">Dismiss</button></p>}
                {noFemaleVoice && <p role="status" className="w-full max-w-2xl mt-1 px-4 text-xs text-text-muted">No female voice found on this device. Try Microsoft Edge.</p>}
                {state === 'speaking' && !headphonesMode && <p role="status" className="mt-2 rounded-full border border-white/[.07] bg-black/20 px-3 py-1.5 text-xs text-text-muted">Vera is speaking, mic paused.</p>}
                {state === 'speaking' && <button type="button" onClick={interrupt} className="mt-2 min-h-11 rounded-full border border-lime-300/25 bg-lime-300/[.06] px-5 text-sm text-lime-100 hover:bg-lime-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300">Interrupt</button>}
                {heardText && <p className="mt-3 max-w-2xl text-sm text-text-secondary"><span className="text-lime-200">I heard:</span> {heardText}</p>}
                {(pauseCountdown > 0 || hasSpeechPending) && state === 'listening' && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                    {pauseCountdown > 0 && <><span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-lime-300/40 text-[10px] text-lime-100" aria-label={`${Math.ceil(pauseCountdown / 1000)} seconds remaining`}>{Math.ceil(pauseCountdown / 1000)}</span><span>Take your time</span></>}
                    {hasSpeechPending && <button type="button" onClick={submitNow} className="min-h-11 rounded-full px-3 text-lime-100 hover:bg-lime-300/10">I’m done speaking</button>}
                  </div>
                )}
              </div>

              {/* Floating Glass Control Bar */}
              <div className="mt-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#101010]/90 p-2.5 shadow-2xl backdrop-blur-xl sm:gap-2">
                {/* Mute Mic Toggle */}
                <button
                  type="button"
                  onClick={() => setIsMuted((v) => !v)}
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  title={isMuted ? 'Unmute mic' : 'Mute mic'}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                    isMuted
                      ? 'bg-rose-400/15 text-rose-200 border border-rose-300/25'
                      : 'hover:bg-white/10 text-text-secondary hover:text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Headphones Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setHeadphonesMode((v) => !v)}
                  aria-label={headphonesMode ? 'Audio mode: Headphones. Switch to speakers' : 'Audio mode: Speakers. Switch to headphones'}
                  title={headphonesMode ? 'Headphones mode active' : 'Speaker mode active'}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                    headphonesMode
                      ? 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/25'
                      : 'hover:bg-white/10 text-text-muted hover:text-white'
                  }`}
                >
                  <Headphones className="w-5 h-5" />
                </button>

                {/* Live Captions Toggle */}
                <button
                  type="button"
                  onClick={() => setShowCaptions((v) => !v)}
                  aria-label="Toggle live captions strip"
                  title={showCaptions ? 'Captions enabled' : 'Captions disabled'}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                    showCaptions
                      ? 'bg-lime-300/10 text-lime-100 border border-lime-300/25'
                      : 'hover:bg-white/10 text-text-muted hover:text-white'
                  }`}
                >
                  <Subtitles className="w-5 h-5" />
                </button>

                {/* Collapsible Transcript Side Panel Toggle */}
                <button
                  type="button"
                  onClick={() => setShowTranscriptPanel((v) => !v)}
                  aria-label="Toggle transcript side drawer"
                  title="View full conversation history"
                  className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center text-text-secondary hover:text-white transition-all"
                >
                  {showTranscriptPanel ? (
                    <ChevronRight className="w-5 h-5 text-lime-200" />
                  ) : (
                    <ChevronLeft className="w-5 h-5" />
                  )}
                </button>

                {/* End Interview Call Button */}
                <button
                  type="button"
                  onClick={() => { console.info('[Vera] End clicked'); if (!endingRef.current) setShowEndConfirm(true); }}
                  disabled={wrappingUp}
                  aria-label="End call and review interview"
                  title="Finish interview and generate assessment report"
                  className="flex h-11 items-center gap-2 rounded-full border border-rose-300/25 bg-rose-300/10 px-4 text-xs font-medium text-rose-200 transition-all hover:bg-rose-300/15"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="hidden sm:inline">{wrappingUp ? 'Wrapping up…' : 'End'}</span>
                </button>
              </div>
              <p className="mt-1 max-w-xl text-center text-xs text-text-muted">
                {headphonesMode ? 'Audio mode: Headphones.' : 'Audio mode: Speakers. On speakers, tap Interrupt to cut in. Headphones give the smoothest conversation.'}
              </p>
              <label className="mt-2 flex items-center justify-center gap-2 text-[11px] text-text-muted">
                <span>Pause patience</span><span>Short</span>
                <input aria-label="Pause patience" type="range" min="0" max="2" step="1" value={pausePatience === 'short' ? 0 : pausePatience === 'normal' ? 1 : 2} onChange={(event) => setPausePatience((['short', 'normal', 'patient'] as const)[Number(event.target.value)])} className="w-20 accent-lime-300" />
                <span>Patient</span>
              </label>

              {/* Collapsible Transcript Panel */}
              <AnimatePresence>
                {showEndConfirm && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="end-interview-title">
                    <div className="glass-strong w-full max-w-md rounded-[2rem] p-6 sm:p-8">
                      <Tag tone="rose" className="mb-4">Wrap-up</Tag>
                      <h2 id="end-interview-title" className="text-2xl font-medium tracking-[-.04em] text-text-primary">Ready to see your debrief?</h2>
                      <p className="mt-3 text-sm leading-6 text-text-secondary">Ending now will create your personalized interview report.</p>
                      <div className="mt-6 flex gap-3"><Button variant="secondary" className="flex-1" disabled={wrappingUp} onClick={() => setShowEndConfirm(false)}>Keep practicing</Button><Button className="flex-1" disabled={wrappingUp} onClick={handleStop}>{wrappingUp ? 'Wrapping up…' : 'End interview'}</Button></div>
                    </div>
                  </motion.div>
                )}
                {showTranscriptPanel && (
                  <motion.div
                    initial={{ x: 360, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 360, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="fixed right-0 top-0 bottom-0 w-80 sm:w-96 glass-strong border-l border-white/10 z-30 flex flex-col shadow-2xl backdrop-blur-2xl"
                  >
                    <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <h3 className="text-sm font-semibold text-text-primary">Live call transcript</h3>
                      </div>
                      <button
                        onClick={() => setShowTranscriptPanel(false)}
                        aria-label="Close transcript panel"
                        className="text-text-muted hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {transcript.map((entry: TranscriptEntry) => (
                        <div
                          key={entry.id}
                          className={`flex ${entry.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              entry.role === 'assistant'
                                ? 'glass text-text-primary border-white/10'
                                : 'bg-lime-300/[.08] text-text-primary border border-lime-300/15'
                            }`}
                          >
                            <span className="text-[10px] font-bold block mb-1 opacity-70">
                              {entry.role === 'assistant' ? 'Vera' : (profile?.name || 'You')}
                            </span>
                            {entry.text}
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
