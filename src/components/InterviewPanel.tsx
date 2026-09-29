import { useEffect, useRef, useState } from 'react';
import { Mic, Square, AlertCircle, Chrome, Zap } from 'lucide-react';
import { useVoiceInterview, type TranscriptEntry } from '@/hooks/useVoiceInterview';
import { StateIndicator } from '@/components/StateIndicator';
import { ResumeUpload } from '@/components/ResumeUpload';

export function InterviewPanel() {
  const messagesRef = useRef<{ role: string; content: string }[]>([]);
  const { state, transcript, error, isSupported, start, stop } = useVoiceInterview({
    messagesRef,
  });

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleStart = () => {
    setIsStarted(true);
    start();
  };

  const handleStop = () => {
    stop();
    setIsStarted(false);
  };

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
          {!isStarted && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Zap className="w-4 h-4 text-sky-400" />
                <span>Setup</span>
              </div>
              <ResumeUpload onFileSelected={setResumeFile} />
              <p className="text-xs text-slate-500">
                {resumeFile
                  ? `Resume ready: ${resumeFile.name}`
                  : 'Resume upload is optional for this demo — Vera will conduct a general interview.'}
              </p>
              <button
                onClick={handleStart}
                disabled={!isSupported}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500 px-4 py-3 font-semibold text-white transition-colors"
              >
                <Mic className="w-5 h-5" />
                Start Interview
              </button>
            </div>
          )}

          {/* State indicator (always visible once started) */}
          {isStarted && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
              <StateIndicator state={state} />
            </div>
          )}

          {/* Transcript */}
          {isStarted && transcript.length > 0 && (
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
          {isStarted && (
            <button
              onClick={handleStop}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/30 hover:bg-red-900/40 text-red-300 px-4 py-3 font-medium transition-colors"
            >
              <Square className="w-4 h-4" />
              End Interview
            </button>
          )}

          {/* Interruption hint */}
          {isStarted && state === 'speaking' && (
            <p className="text-center text-xs text-slate-500">
              Speak at any time to interrupt Vera
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
