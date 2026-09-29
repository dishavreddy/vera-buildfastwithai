import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, PhoneOff, Chrome, AlertCircle, FileCheck2,
  ChevronLeft, ChevronRight, Radio, Clock,
} from 'lucide-react';
import {
  useVoiceInterview,
  type TranscriptEntry,
} from '@/hooks/useVoiceInterview';
import { StateIndicator } from '@/components/StateIndicator';
import { ResumeUpload } from '@/components/ResumeUpload';
import { ReportView } from '@/components/ReportView';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { CandidateProfile, InterviewReport } from '@/types/interview';

type Phase = 'setup' | 'interview' | 'report';

const TRUST_ITEMS = ['Adaptive follow-ups', 'Live voice', 'Personalized report'];

export function InterviewPanel() {
  const messagesRef = useRef<{ role: string; content: string }[]>([]);

  const [phase, setPhase] = useState<Phase>('setup');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState<TranscriptEntry[]>([]);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  // Timer
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
    setPhase('report');
  }, []);

  const handleReportError = useCallback((msg: string) => {
    setReportError(msg);
    setReportLoading(false);
    setPhase('report');
  }, []);

  const { state, transcript, error, isSupported, start, stop } = useVoiceInterview({
    messagesRef,
    systemPrompt,
    profile,
    onReportReady: handleReportReady,
    onReportError: handleReportError,
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Get last few transcript entries for captions
  const recentTranscript = transcript.slice(-4);

  const handleResumeSelected = useCallback(async (file: File | null) => {
    setResumeFile(file);
    setProfile(null);
    setParseError(null);

    if (!file) {
      setSystemPrompt('');
      return;
    }

    setParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, fileName: file.name }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
      }

      const data = await response.json();
      const parsedProfile = data.profile as CandidateProfile;
      setProfile(parsedProfile);

      const profileText = JSON.stringify(parsedProfile, null, 2);
      const adaptivePrompt =
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
        '- Never use markdown, bullet points, or numbered lists. Respond in plain spoken sentences only.';
      setSystemPrompt(adaptivePrompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setParseError(`Failed to parse resume: ${msg}`);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleStart = () => {
    setReport(null);
    setReportError(null);
    setReportLoading(false);
    setElapsed(0);
    setPhase('interview');
    start();
  };

  const handleStop = () => {
    setFinalTranscript(transcript);
    setReportLoading(true);
    stop();
  };

  const handleRestart = () => {
    setPhase('setup');
    setReport(null);
    setReportError(null);
    setReportLoading(false);
    setFinalTranscript([]);
    setProfile(null);
    setResumeFile(null);
    setSystemPrompt('');
    setParseError(null);
    setElapsed(0);
  };

  // --- Report loading skeleton ---
  const ReportLoading = () => (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center">
      <div className="max-w-2xl w-full px-6 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-accent-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-accent-400 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-accent-300">V</span>
            </div>
          </div>
          <p className="text-sm text-text-secondary animate-pulse">Vera is reviewing your interview...</p>
        </div>
        {/* Skeleton cards */}
        <div className="glass rounded-2xl p-5">
          <div className="skeleton h-5 w-40 rounded mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="skeleton w-20 h-20 rounded-full" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl p-5">
              <div className="skeleton h-4 w-24 rounded mb-3" />
              <div className="skeleton h-3 w-full rounded mb-2" />
              <div className="skeleton h-3 w-3/4 rounded mb-2" />
              <div className="skeleton h-3 w-5/6 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // --- Report phase ---
  if (phase === 'report') {
    if (reportLoading && !report && !reportError) return <ReportLoading />;

    if (reportError && !report) {
      return (
        <div className="min-h-screen bg-background text-text-primary flex items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="report-error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-md w-full"
            >
              <Card>
                <div className="flex items-start gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-error-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-error-300">{reportError}</p>
                </div>
                <Button variant="secondary" size="md" className="w-full" onClick={handleRestart}>
                  Back to Setup
                </Button>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      );
    }

    if (report) {
      return (
        <>
          <AnimatedBackground />
          <AnimatePresence mode="wait">
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <ReportView
                report={report}
                profile={profile}
                transcript={finalTranscript}
                onRestart={handleRestart}
              />
            </motion.div>
          </AnimatePresence>
        </>
      );
    }
  }

  // --- Setup + Interview phases ---
  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col relative">
      <AnimatedBackground />

      {/* Top bar */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl glass-strong flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6L12 18L20 6" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Vera</h1>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">AI Interviewer</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {phase === 'interview' && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Radio className="w-3.5 h-3.5 text-error-400 animate-pulse" />
                <span>Live</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(elapsed)}</span>
              </div>
            </>
          )}
          {phase === 'setup' && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Chrome className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Best in Chrome</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 relative z-10">
        <AnimatePresence mode="wait">
          {/* --- SETUP PHASE --- */}
          {phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-xl flex flex-col gap-6"
            >
              {/* Hero */}
              <div className="text-center flex flex-col gap-3 pt-4">
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
                  An interviewer that
                  <br />
                  <span className="text-gradient">adapts to you</span>
                </h2>
                <p className="text-base text-text-secondary max-w-md mx-auto">
                  Upload your resume and have a live voice conversation with Vera — an AI interviewer that asks real follow-up questions.
                </p>
              </div>

              {/* Trust row */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {TRUST_ITEMS.map((item) => (
                  <span key={item} className="text-xs text-text-muted flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-accent-400" />
                    {item}
                  </span>
                ))}
              </div>

              {/* Warnings */}
              {!isSupported && (
                <div className="glass rounded-xl border-warning-500/30 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-warning-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-warning-200">
                    Your browser doesn't support the Web Speech API. Please use Google Chrome on desktop.
                  </p>
                </div>
              )}

              {error && (
                <div className="glass rounded-xl border-error-500/30 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-error-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-error-300">{error}</p>
                </div>
              )}

              {/* Upload card */}
              <Card className="flex flex-col gap-5">
                <ResumeUpload
                  onFileSelected={handleResumeSelected}
                  parsing={parsing}
                  parseError={parseError}
                />

                {/* Profile preview */}
                {profile && !parsing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="glass-strong rounded-xl border-success-500/20 p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-sm text-success-400">
                        <FileCheck2 className="w-4 h-4" />
                        <span>Resume parsed successfully</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {profile.name && (
                          <p className="text-sm font-semibold text-text-primary">{profile.name}</p>
                        )}
                        {profile.skills && profile.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {profile.skills.slice(0, 8).map((skill, i) => (
                              <Chip key={i} color="accent">{skill}</Chip>
                            ))}
                          </div>
                        )}
                        {profile.projects && profile.projects.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-text-muted uppercase tracking-wide">Projects</span>
                            {profile.projects.slice(0, 3).map((p, i) => (
                              <p key={i} className="text-xs text-text-secondary">
                                <span className="text-text-primary font-medium">{p.name}</span>
                                {p.description && <span className="text-text-muted"> — {p.description}</span>}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                <p className="text-xs text-text-muted text-center">
                  {resumeFile
                    ? profile
                      ? 'Vera will tailor the interview to your resume.'
                      : parsing
                        ? 'Analyzing your resume...'
                        : 'Resume uploaded but not yet parsed.'
                    : 'Resume upload is optional — Vera will conduct a general interview without one.'}
                </p>

                {/* Start button with tooltip */}
                <div className="relative">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleStart}
                    disabled={!isSupported || parsing}
                    title={!profile && !parsing ? 'Upload a resume for a personalized interview, or start without one' : undefined}
                  >
                    <Mic className="w-5 h-5" />
                    {profile ? 'Start Interview' : 'Start Interview'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* --- INTERVIEW PHASE --- */}
          {phase === 'interview' && (
            <motion.div
              key="interview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full flex flex-col"
            >
              {/* Full-viewport interview layout */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4 relative">

                {/* Avatar + state indicator */}
                <StateIndicator state={state} />

                {/* Live captions strip */}
                <div className="w-full max-w-2xl mt-4">
                  <div className="glass rounded-2xl px-5 py-3 min-h-[60px] flex flex-col gap-1.5 justify-center">
                    {recentTranscript.length > 0 ? (
                      recentTranscript.map((entry, i) => {
                        const isLatest = i === recentTranscript.length - 1;
                        return (
                          <div
                            key={entry.id}
                            className="text-sm leading-relaxed transition-all"
                            style={{
                              opacity: isLatest ? 1 : 0.4 - (recentTranscript.length - 1 - i) * 0.1,
                            }}
                          >
                            <span className={`text-xs font-medium ${entry.role === 'assistant' ? 'text-accent-300' : 'text-success-400'}`}>
                              {entry.role === 'assistant' ? 'Vera' : 'You'}
                            </span>
                            <span className="text-text-secondary"> {entry.text}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-text-muted text-center">Waiting for conversation to start...</p>
                    )}
                  </div>
                </div>

                {/* Floating control bar */}
                <div className="mt-6 flex items-center gap-2">
                  {/* Toggle transcript */}
                  <button
                    onClick={() => setShowTranscriptPanel((v) => !v)}
                    aria-label="Toggle transcript panel"
                    className="glass-strong w-11 h-11 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all active:scale-95"
                  >
                    {showTranscriptPanel ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                  </button>

                  {/* End call */}
                  <button
                    onClick={handleStop}
                    aria-label="End interview"
                    className="bg-error-500/15 border border-error-500/30 text-error-400 hover:bg-error-500/25 active:scale-95 rounded-xl w-14 h-14 flex items-center justify-center transition-all"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>
                </div>

                {/* Interruption hint */}
                {state === 'speaking' && (
                  <p className="text-xs text-text-muted mt-2">Speak at any time to interrupt</p>
                )}
              </div>

              {/* Collapsible transcript side panel */}
              <AnimatePresence>
                {showTranscriptPanel && (
                  <motion.div
                    initial={{ x: 320, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 320, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="fixed right-0 top-0 bottom-0 w-80 glass-strong border-l border-border z-20 flex flex-col"
                  >
                    <div className="px-4 py-4 border-b border-border flex items-center justify-between">
                      <span className="text-sm font-semibold">Transcript</span>
                      <button
                        onClick={() => setShowTranscriptPanel(false)}
                        aria-label="Close transcript panel"
                        className="text-text-muted hover:text-text-primary transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                      {transcript.map((entry: TranscriptEntry) => (
                        <div
                          key={entry.id}
                          className={`flex ${entry.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                              entry.role === 'assistant'
                                ? 'glass text-text-secondary'
                                : 'bg-accent-500/15 text-accent-100 border border-accent-500/20'
                            }`}
                          >
                            <span className="text-[10px] font-medium block mb-0.5 opacity-60">
                              {entry.role === 'assistant' ? 'Vera' : 'You'}
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
      </div>
    </div>
  );
}
