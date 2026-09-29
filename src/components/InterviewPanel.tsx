import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, AlertCircle, Chrome, Zap, FileCheck2 } from 'lucide-react';
import {
  useVoiceInterview,
  type TranscriptEntry,
} from '@/hooks/useVoiceInterview';
import { StateIndicator } from '@/components/StateIndicator';
import { ResumeUpload } from '@/components/ResumeUpload';
import { ReportView } from '@/components/ReportView';
import type { CandidateProfile, InterviewReport } from '@/types/interview';

type Phase = 'setup' | 'interview' | 'report';

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

  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  // Parse resume when a file is selected
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
      // Convert file to base64
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

      // Build the adaptive system prompt using the profile
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
  };

  // --- Report phase ---
  if (phase === 'report') {
    if (reportLoading && !report && !reportError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Generating interview report…</p>
          </div>
        </div>
      );
    }

    if (reportError && !report) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-xl border border-red-800/50 bg-red-950/40 p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{reportError}</p>
            </div>
            <button
              onClick={handleRestart}
              className="w-full rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors"
            >
              Back to Setup
            </button>
          </div>
        </div>
      );
    }

    if (report) {
      return (
        <ReportView
          report={report}
          profile={profile}
          transcript={finalTranscript}
          onRestart={handleRestart}
        />
      );
    }
  }

  // --- Setup + Interview phases ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Vera</h1>
            <p className="text-xs text-slate-500">Real-time voice AI interviewer</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Chrome className="w-4 h-4" />
          <span>Best in Chrome</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl flex flex-col gap-6">
          {/* Not supported warning */}
          {!isSupported && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200">
                Your browser doesn't support the Web Speech API. Please open this app in
                <strong> Google Chrome</strong> on desktop to use the voice interview.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Setup panel (pre-interview) */}
          {phase === 'setup' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Zap className="w-4 h-4 text-sky-400" />
                <span>Setup</span>
              </div>
              <ResumeUpload
                onFileSelected={handleResumeSelected}
                parsing={parsing}
                parseError={parseError}
              />

              {/* Profile preview */}
              {profile && !parsing && (
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <FileCheck2 className="w-4 h-4" />
                    <span>Resume parsed successfully</span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-col gap-1.5">
                    {profile.name && (
                      <p><span className="text-slate-500">Name:</span> {profile.name}</p>
                    )}
                    {profile.skills && profile.skills.length > 0 && (
                      <p><span className="text-slate-500">Skills:</span> {profile.skills.join(', ')}</p>
                    )}
                    {profile.keyTechnologies && profile.keyTechnologies.length > 0 && (
                      <p><span className="text-slate-500">Tech:</span> {profile.keyTechnologies.join(', ')}</p>
                    )}
                    {profile.projects && profile.projects.length > 0 && (
                      <p><span className="text-slate-500">Projects:</span> {profile.projects.map((p) => p.name).join(', ')}</p>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500">
                {resumeFile
                  ? profile
                    ? 'Vera will tailor the interview to your resume.'
                    : parsing
                      ? 'Analyzing your resume…'
                      : 'Resume uploaded but not yet parsed.'
                  : 'Resume upload is optional — Vera will conduct a general interview without one.'}
              </p>
              <button
                onClick={handleStart}
                disabled={!isSupported || parsing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500 px-4 py-3 font-semibold text-white transition-colors"
              >
                <Mic className="w-5 h-5" />
                Start Interview
              </button>
            </div>
          )}

          {/* State indicator (during interview) */}
          {phase === 'interview' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
              <StateIndicator state={state} />
            </div>
          )}

          {/* Transcript */}
          {phase === 'interview' && transcript.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-3 max-h-80 overflow-y-auto">
              {transcript.map((entry: TranscriptEntry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      entry.role === 'assistant'
                        ? 'bg-slate-800 text-slate-200'
                        : 'bg-sky-600/20 text-sky-100 border border-sky-700/30'
                    }`}
                  >
                    <span className="text-xs font-medium block mb-0.5 opacity-60">
                      {entry.role === 'assistant' ? 'Vera' : 'You'}
                    </span>
                    {entry.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}

          {/* Stop button */}
          {phase === 'interview' && (
            <button
              onClick={handleStop}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/30 hover:bg-red-900/40 text-red-300 px-4 py-3 font-medium transition-colors"
            >
              <Square className="w-4 h-4" />
              End Interview
            </button>
          )}

          {/* Interruption hint */}
          {phase === 'interview' && state === 'speaking' && (
            <p className="text-center text-xs text-slate-500">
              Speak at any time to interrupt Vera
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
