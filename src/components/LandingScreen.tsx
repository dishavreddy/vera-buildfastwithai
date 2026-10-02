import { ArrowDown, ArrowRight, Check, CircleHelp, FileCheck2, Headphones, Mic, Sparkles, UserRound } from 'lucide-react';
import type { CandidateProfile } from '@/types/interview';
import { ResumeUpload } from '@/components/ResumeUpload';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MicMeter, Stepper, Tag } from '@/components/ui/Primitives';
import { useState } from 'react';

type MicCheckState = 'idle' | 'checking' | 'ready' | 'failed';
interface LandingScreenProps {
  serverWarming: boolean;
  profile: CandidateProfile | null;
  parsing: boolean;
  parseError: string | null;
  pasteText: string;
  micStatus: MicCheckState;
  micLevel: number;
  isSupported: boolean;
  selectedVoiceName: string;
  voiceOptions: { value: string; label: string; female: boolean }[];
  actualVoice: string;
  voiceLoading: boolean;
  voiceProgress: number;
  browserFallback: boolean;
  noFemaleVoice: boolean;
  canStart: boolean;
  startReason: string;
  onFileSelected: (file: File | null) => void;
  onPasteChange: (value: string) => void;
  onPasteContinue: () => void;
  onVoiceChange: (voice: string) => void;
  onMicCheck: () => void;
  onStart: () => void;
}

export function LandingScreen({
  serverWarming, profile, parsing, parseError, pasteText, micStatus, micLevel, isSupported, selectedVoiceName,
  voiceOptions, actualVoice, voiceLoading, voiceProgress, browserFallback, noFemaleVoice,
  canStart, startReason, onFileSelected, onPasteChange, onPasteContinue, onVoiceChange, onMicCheck, onStart,
}: LandingScreenProps) {
  const [dismissFallback, setDismissFallback] = useState(false);
  const stepCurrent = canStart ? 2 : profile ? 1 : 0;
  return (
    <div className="w-full">
      <section className="mx-auto grid w-full max-w-[1380px] items-center gap-12 px-5 pb-14 pt-12 sm:px-10 lg:grid-cols-12 lg:gap-8 lg:pb-24 lg:pt-20">
        <div className="lg:col-span-7">
          <Tag dot className="mb-6">Real-time AI interviewer</Tag>
          <h1 className="max-w-[850px] text-5xl font-medium leading-[.99] tracking-[-.06em] text-text-primary sm:text-6xl lg:text-7xl xl:text-[88px]">
            Interviews that follow your answer, <span className="italic text-lime-gradient">not a script.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-text-secondary sm:text-lg">Upload your resume, talk out loud, get a debrief.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={() => document.getElementById('resume')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="gap-2.5">
              Prepare your interview <ArrowDown className="h-4 w-4" />
            </Button>
            <span className="text-sm text-text-muted">About 15 minutes · No script to memorize</span>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-lime-300"/>Personalized follow-ups</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-lime-300"/>Evidence-based debrief</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[540px] lg:col-span-5 lg:ml-auto">
          <div className="absolute -inset-7 rounded-[3rem] bg-lime-300/[.055] blur-3xl" aria-hidden="true" />
          <div className="relative rounded-[2.5rem] border border-white/10 bg-white/[.035] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-white/[.08] pb-5">
              <div><p className="font-micro text-text-muted">Practice room</p><p className="mt-1 text-sm text-text-primary">Product engineer · Session preview</p></div>
              <Tag tone="emerald" dot>Ready</Tag>
            </div>
            <div className="py-8">
              <p className="font-micro text-text-muted">Vera asks</p>
              <p className="mt-3 text-2xl leading-snug tracking-[-.035em] text-text-primary">“Tell me about a technical choice you made that changed the outcome.”</p>
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-lime-300/15 bg-lime-300/[.045] p-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-300/10 text-lime-200"><Sparkles className="h-4 w-4"/></div>
                <div><p className="text-xs font-medium text-text-primary">Vera noticed</p><p className="text-xs text-text-secondary">You mentioned MongoDB in your resume</p></div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-black/30 p-4">
              <div><p className="font-micro text-text-muted">Communication</p><p className="mt-1 text-sm text-text-primary">Clear and thoughtful</p></div>
              <div className="relative h-12 w-12 rounded-full border-[3px] border-white/10 border-t-lime-300"><span className="absolute inset-0 grid place-items-center text-xs font-semibold text-text-primary">82</span></div>
            </div>
            <div className="absolute -right-2 top-24 hidden -rotate-2 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 shadow-xl sm:block lift-card">
              <p className="font-micro text-text-muted">Follow-up</p><p className="mt-1 text-xs text-text-primary">“What trade-off did you consider?”</p>
            </div>
          </div>
        </div>
      </section>

      <section id="resume" className="scroll-mt-8 px-4 pb-16 sm:px-8 lg:px-10">
        <Card className="mx-auto max-w-5xl !p-0 overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[.85fr_1.15fr]">
            <div className="border-b border-white/[.08] p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <Tag className="mb-4">Your interview, your pace</Tag>
              <h2 className="text-3xl font-medium tracking-[-.045em] text-text-primary">A few details, then we begin.</h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">Vera uses your experience to ask relevant questions. You can paste your resume if you prefer.</p>
              <div className="mt-7"><Stepper steps={['Resume', 'Mic check', 'Interview']} current={stepCurrent} completed={profile ? 0 : -1}/></div>
              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
                <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"/>
                <p className="text-xs leading-5 text-text-secondary">For the smoothest conversation, use Chrome and headphones. You can interrupt Vera at any time.</p>
              </div>
            </div>

            <div className="space-y-7 p-6 sm:p-8">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><p className="font-micro text-text-muted">Step 1 · Resume</p><h3 className="mt-1 text-lg font-medium text-text-primary">Give Vera some context</h3></div>
                  {profile && <Tag tone="emerald" dot>Ready</Tag>}
                </div>
                {serverWarming && <p role="status" className="mb-3 text-xs text-text-muted">Warming up Vera’s server, this can take up to a minute.</p>}
                <ResumeUpload onFileSelected={onFileSelected} parsing={parsing} parseError={parseError} isParsed={Boolean(profile)} disabled={!isSupported}/>
                <details className="group mt-4 rounded-2xl border border-white/[.08] bg-white/[.02] open:bg-white/[.035]">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm text-text-secondary"><span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-lime-200"/>Paste resume text instead</span><span aria-hidden="true" className="text-lg text-text-muted group-open:rotate-45 transition-transform">+</span></summary>
                  <div className="space-y-3 px-4 pb-4">
                    <label htmlFor="resume-paste" className="sr-only">Paste resume text</label>
                    <textarea id="resume-paste" value={pasteText} onChange={(event) => onPasteChange(event.target.value)} disabled={parsing || !isSupported} rows={5} placeholder="Paste your resume text here" className="w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-text-primary placeholder:text-text-muted focus:border-lime-300/40 focus:outline-none focus:ring-2 focus:ring-lime-300/20 disabled:opacity-50"/>
                    <Button type="button" variant="secondary" onClick={onPasteContinue} disabled={!pasteText.trim() || parsing || !isSupported} className="w-full">Continue with pasted text <ArrowRight className="h-4 w-4"/></Button>
                  </div>
                </details>
              </div>

              {profile && !parsing && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><UserRound className="h-4 w-4"/>{profile.name || 'Resume understood'}</div><Tag tone="emerald">Profile ready</Tag></div>
                {profile.basicProfile && <p role="status" className="mt-2 text-xs text-text-muted">Using a basic profile for now.</p>}
                {profile.skills?.length ? <div className="mt-3 flex flex-wrap gap-2">{profile.skills.slice(0, 8).map((skill, index) => <Chip key={`${skill}-${index}`} color="accent">{skill}</Chip>)}</div> : null}
                {profile.projects?.length ? <p className="mt-3 text-xs leading-5 text-text-secondary"><span className="text-text-primary">Project to explore: </span>{profile.projects[0].name}{profile.projects[0].description ? ` — ${profile.projects[0].description}` : ''}</p> : null}
              </div>}

              <div className="border-t border-white/[.08] pt-6">
                <div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-micro text-text-muted">Step 2 · Mic check</p><h3 className="mt-1 text-lg font-medium text-text-primary">Make sure Vera can hear you</h3></div><Tag tone={micStatus === 'ready' ? 'emerald' : micStatus === 'failed' ? 'rose' : 'muted'} dot={micStatus === 'ready'}>{micStatus === 'checking' ? 'Checking' : micStatus === 'ready' ? 'Mic ready' : micStatus === 'failed' ? 'Needs attention' : 'Not checked'}</Tag></div>
                <div className="rounded-2xl border border-white/[.08] bg-black/25 p-4"><MicMeter level={micLevel} status={micStatus}/><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text-secondary">{micStatus === 'ready' ? 'Microphone is ready. Try saying a few words.' : micStatus === 'checking' ? 'Allow microphone access in your browser.' : micStatus === 'failed' ? 'Microphone access was blocked. Check browser permissions and try again.' : 'A quick check helps prevent surprises.'}</p><button type="button" onClick={onMicCheck} disabled={micStatus === 'checking'} className="min-h-11 shrink-0 rounded-full border border-white/10 px-4 text-xs font-medium text-text-primary transition-transform hover:scale-105 hover:border-lime-300/30 disabled:opacity-50">{micStatus === 'checking' ? 'Checking…' : micStatus === 'ready' ? 'Check again' : 'Check microphone'}</button></div></div>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/[.08] pt-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1"><label htmlFor="vera-voice-select" className="font-micro text-text-muted">Vera’s voice</label><select id="vera-voice-select" value={selectedVoiceName} onChange={(event) => onVoiceChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-[#111] px-4 text-sm text-text-primary focus:border-lime-300/30 focus:outline-none focus:ring-2 focus:ring-lime-300/20">{voiceOptions.map((voice) => <option key={voice.value} value={voice.value} disabled={!voice.female && voiceOptions.some((option) => option.female)}>{voice.label}</option>)}</select><p className="mt-2 text-xs text-text-muted">Last played: {actualVoice}</p>{voiceLoading && <p role="status" className="mt-1 text-xs text-lime-100">Warming up Vera’s voice… {voiceProgress}%</p>}{browserFallback && !dismissFallback && <p role="status" className="mt-1 flex items-center gap-2 text-xs text-text-muted">Using your browser’s voice. Edge or a faster laptop gives a more natural one.<button type="button" onClick={() => setDismissFallback(true)} className="min-h-8 rounded px-1 text-text-secondary underline">Dismiss</button></p>}{noFemaleVoice && <p role="status" className="mt-1 text-xs text-text-muted">No female voice found on this device. Try Microsoft Edge.</p>}</div>
                <div className="w-full sm:w-auto sm:min-w-[210px]" title={canStart ? 'Start your personalized interview' : startReason}><Button variant="primary" size="lg" className="w-full" onClick={onStart} disabled={!canStart} aria-label="Begin interview"><Mic className="h-4 w-4"/>Begin interview<ArrowRight className="h-4 w-4"/></Button></div>
              </div>
              {!canStart && <p className="-mt-2 text-xs text-text-muted">{startReason}</p>}
              {!isSupported && <p role="status" className="flex items-start gap-2 text-xs leading-5 text-rose-200"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0"/>Voice interview works best in desktop Chrome. Enable microphone and speech recognition, then reload.</p>}
            </div>
          </div>
        </Card>
      </section>

      <section id="features" className="mx-auto grid max-w-[1380px] grid-cols-1 gap-4 px-5 pb-24 sm:px-10 md:grid-cols-2 lg:grid-cols-4">
        <article className="glass lift-card min-h-56 rounded-[2rem] p-7 lg:col-span-2"><p className="font-micro text-lime-200">01 · Conversation</p><h2 className="mt-4 max-w-md text-3xl font-medium tracking-[-.045em] text-text-primary">Follow-ups that listen.</h2><p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">Vera follows the details in your answer, gives you room to think, and lets you interrupt naturally.</p></article>
        <article className="glass lift-card min-h-56 rounded-[2rem] p-7 lg:row-span-2"><p className="font-micro text-emerald-200">02 · Context</p><h2 className="mt-4 text-2xl font-medium tracking-[-.04em] text-text-primary">Your resume, understood.</h2><p className="mt-3 text-sm leading-6 text-text-secondary">Practice questions connect to your projects, tools, and experience.</p><div className="mt-8 flex flex-wrap gap-2"><Chip color="accent">Your projects</Chip><Chip color="accent">Your skills</Chip><Chip color="accent">Your next step</Chip></div></article>
        <article className="lift-card min-h-56 rounded-[2rem] bg-accent-500 p-7 text-black shadow-[0_18px_60px_rgba(204,255,0,.1)]"><p className="font-micro text-black/60">03 · Debrief</p><h2 className="mt-4 text-3xl font-medium tracking-[-.045em]">Debrief in minutes.</h2><p className="mt-3 text-sm leading-6 text-black/70">Leave with evidence, clear feedback, and a practice plan.</p></article>
        <article className="glass lift-card min-h-56 rounded-[2rem] p-7"><p className="font-micro text-text-muted">04 · At your pace</p><h2 className="mt-4 text-2xl font-medium tracking-[-.04em] text-text-primary">Talk naturally.</h2><p className="mt-3 text-sm leading-6 text-text-secondary">Pause to think. Finish when you’re ready. Cut in whenever you need.</p></article>
      </section>

      <section id="how-it-works" className="rounded-t-[2.5rem] bg-[#e5e5e5] px-5 py-16 text-black sm:px-10 lg:py-24">
        <div className="mx-auto max-w-[1280px]">
          <Tag tone="muted" className="border-black/10 bg-black/5 text-black/60">How it works</Tag>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ['01', 'Bring your experience', 'Upload a PDF or paste your resume, then check your microphone.'],
              ['02', 'Meet Vera', 'Answer out loud in a focused interview shaped around your background.'],
              ['03', 'Know what to practice', 'Review specific evidence, then use your seven-day plan to improve.'],
            ].map(([number, title, detail]) => <article key={number} className="border-t border-black/15 pt-5"><span className="font-micro text-black/45">{number}</span><h3 className="mt-5 text-2xl font-medium tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-black/65">{detail}</p></article>)}
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden px-5 py-16 sm:px-10 lg:py-24">
        <span aria-hidden="true" className="pointer-events-none absolute -right-4 top-0 select-none text-[clamp(8rem,25vw,22rem)] font-semibold leading-none tracking-[-.09em] text-white/[.025]">VERA</span>
        <div className="relative mx-auto max-w-[1280px]">
          <div className="flex flex-col items-start justify-between gap-7 rounded-[2rem] border border-lime-300/20 bg-lime-300/[.06] p-7 sm:flex-row sm:items-center sm:p-10"><div><p className="font-micro text-lime-200">Your next interview starts here</p><h2 className="mt-3 max-w-2xl text-3xl font-medium tracking-[-.05em] text-text-primary sm:text-5xl">Build confidence one answer at a time.</h2></div><Button size="lg" onClick={() => document.getElementById('resume')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Start practicing <ArrowRight className="h-4 w-4"/></Button></div>
          <div className="mt-10 grid gap-8 border-t border-white/10 pt-7 sm:grid-cols-3"><div><a href="#top" className="text-lg font-semibold tracking-[-.05em] text-text-primary">vera</a><p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">A thoughtful space to practice what comes next.</p></div><div><p className="font-micro text-text-muted">Explore</p><div className="mt-3 flex flex-col items-start gap-2 text-sm text-text-secondary"><a href="#features" className="hover:text-text-primary">Features</a><a href="#how-it-works" className="hover:text-text-primary">How it works</a></div></div><div><p className="font-micro text-text-muted">Ready when you are</p><p className="mt-3 text-sm text-text-secondary">Private practice, at your own pace.</p></div></div>
          <p className="mt-12 border-t border-white/[.06] pt-5 font-micro text-text-muted">© 2026 VERA · INTERVIEW PRACTICE</p>
        </div>
      </footer>
    </div>
  );
}
