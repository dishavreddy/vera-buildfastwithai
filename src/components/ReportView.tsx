import { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, ChevronDown, Clipboard, Download, FileText, Sparkles, TrendingUp } from 'lucide-react';
import type { CandidateProfile, InterviewReport, ReportCategory, ReportInsight } from '@/types/interview';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface ReportViewProps {
  report: InterviewReport;
  profile: CandidateProfile | null;
  transcript: { role: 'user' | 'assistant'; text: string }[];
  onRestart: () => void;
  onRetry?: () => void;
}

const CATEGORY_LIST: { key: keyof InterviewReport['categories']; label: string }[] = [
  { key: 'communication', label: 'Communication' }, { key: 'technicalKnowledge', label: 'Technical knowledge' },
  { key: 'problemSolving', label: 'Problem solving' }, { key: 'projectUnderstanding', label: 'Project understanding' },
  { key: 'confidence', label: 'Confidence' }, { key: 'resumeKnowledge', label: 'Resume knowledge' },
];

function scoreColor(score: number | null) {
  if (score === null) return { text: 'text-text-muted', bar: 'bg-white/10', label: 'Not enough evidence' };
  if (score >= 90) return { text: 'text-emerald-300', bar: 'bg-emerald-400', label: 'Exceptional' };
  if (score >= 75) return { text: 'text-emerald-300', bar: 'bg-emerald-400', label: 'Strong' };
  if (score >= 60) return { text: 'text-lime-200', bar: 'bg-lime-300', label: 'Solid with gaps' };
  if (score >= 40) return { text: 'text-amber-200', bar: 'bg-amber-300', label: 'Weak' };
  return { text: 'text-rose-200', bar: 'bg-rose-300', label: 'Poor' };
}

function CategoryBar({ label, category }: { label: string; category: ReportCategory }) {
  const tone = scoreColor(category.score);
  return (
    <details className="glass rounded-[1.75rem] p-5 group">
      <summary className="list-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-text-primary">{label}</h3><span className={`text-sm font-bold ${tone.text}`}>{category.score === null ? '—' : `${category.score}/100`}</span></div>
            <div className="h-1.5 rounded-full bg-white/10 mt-3 overflow-hidden"><div className={`h-full rounded-full transition-none ${tone.bar}`} style={{ width: `${category.score ?? 0}%` }} /></div>
            <p className={`mt-2 text-[11px] ${tone.text}`}>{tone.label} <span className="text-text-muted">· {category.supportingAnswerTurns.length} answers considered</span></p>
          </div>
          <ChevronDown aria-hidden="true" className="w-4 h-4 text-text-muted mt-1 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="mt-3 pt-3 border-t border-white/10 text-xs leading-relaxed text-text-secondary">
        {category.score === null ? <p>{category.note}</p> : <>
          <p className="font-medium text-text-primary mb-2">Why this score</p>
          <ul className="space-y-2">{category.evidence.map((item, index) => <li key={`${item.turn}-${index}`}><span className="text-lime-200">Turn {item.turn}:</span> “{item.quote}” <span>{item.why}</span></li>)}</ul>
          {category.note && <p className="mt-2">{category.note}</p>}
        </>}
      </div>
    </details>
  );
}

function SwotCard({ title, items, tone }: { title: string; items: ReportInsight[]; tone: string }) {
  return (
    <Card className="h-full">
      <h3 className={`text-sm font-semibold mb-3 ${tone}`}>{title}</h3>
      <ul className="space-y-3">{items.map((item, i) => <li key={`${title}-${i}`} className="text-xs text-text-secondary leading-relaxed">
        <p className="font-semibold text-text-primary">{item.title}</p><p>{item.detail}</p>
        {item.evidence && <p className="mt-1 text-text-muted">{item.turn !== null ? `Turn ${item.turn}: ` : ''}{item.evidence}</p>}
      </li>)}</ul>
    </Card>
  );
}

export function ReportView({ report, profile, transcript, onRestart, onRetry }: ReportViewProps) {
  const [openAnswer, setOpenAnswer] = useState<number | null>(null);
  const [checkedDays, setCheckedDays] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const summaryText = useMemo(() => `${report.summary}\n\nHiring readiness: ${report.overall.hiringReadiness}. Overall score: ${report.overall.score ?? 'Not enough evidence'} based on ${report.overall.candidateAnswerCount} candidate answers.`, [report]);
  useEffect(() => {
    if (report.overall.score === null) { setAnimatedScore(0); return; }
    let frame = 0; const start = performance.now(); const duration = 1100;
    const tick = (now: number) => { const progress = Math.min(1, (now - start) / duration); setAnimatedScore(Math.round(report.overall.score! * (1 - (1 - progress) ** 3))); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [report.overall.score]);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(summaryText); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  const toggleDay = (day: number) => setCheckedDays((previous) => previous.includes(day) ? previous.filter((value) => value !== day) : [...previous, day]);
  const score = report.overall.score;
  const dialColor = score === null ? '#64748b' : score >= 75 ? '#10b981' : score >= 60 ? '#ccff00' : score >= 40 ? '#fbbf24' : '#fb7185';
  const circumference = 2 * Math.PI * 46;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-background text-text-primary pb-16 report-page">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-8 sm:px-8 sm:py-12 animate-fade-in">
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-lime-300/10 to-emerald-400/10 text-lime-200 border border-lime-300/20"><Sparkles className="w-3.5 h-3.5" />Vera Interview Assessment</span>
            <h1 className="mt-3 text-3xl font-medium tracking-[-.055em] text-text-primary sm:text-5xl">{profile?.name ? `${profile.name}'s interview report` : 'Your interview report'}</h1>
            <p className="text-xs text-text-muted mt-1">{today} · {report.overall.candidateAnswerCount} candidate answers evaluated</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            {report.basicReport && onRetry && <Button variant="secondary" size="md" onClick={onRetry}>Retry detailed analysis</Button>}
            <Button variant="secondary" size="md" onClick={() => window.print()} className="gap-2"><Download className="w-4 h-4" />Download report</Button>
            <Button variant="secondary" size="md" onClick={() => void handleCopy()} className="gap-2"><Clipboard className="w-4 h-4" />{copied ? 'Copied' : 'Copy summary'}</Button>
            <Button variant="primary" size="md" onClick={onRestart} className="gap-2"><TrendingUp className="w-4 h-4" />Interview again</Button>
          </div>
        </header>

        {report.shortSession && <div role="status" className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[.04] px-5 py-4 text-sm text-amber-100">This was a short interview, so the analysis is limited.</div>}
        {report.analysisNote && <div role="status" className="rounded-[1.5rem] border border-white/10 bg-white/[.03] px-5 py-4 text-sm text-text-secondary">{report.analysisNote}</div>}

        <Card className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8">
          <div className="relative w-32 h-32 shrink-0 flex items-center justify-center" aria-label={score === null ? 'Overall score: not enough evidence' : `Overall score ${animatedScore} out of 100`}>
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" /><circle cx="50" cy="50" r="46" fill="none" stroke={dialColor} strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={score === null ? circumference : 0} style={{ opacity: score === null ? .2 : Math.max(.3, animatedScore / 100) }} /></svg>
            <div className="absolute text-center"><p className="text-3xl font-bold" style={{ color: dialColor }}>{score === null ? '—' : animatedScore}</p><p className="text-[10px] text-text-muted">{score === null ? 'No score yet' : 'overall / 100'}</p></div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2"><h2 className="text-base font-semibold">Overall assessment</h2><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-text-primary">{report.overall.hiringReadiness}</span></div>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">{report.summary}</p>
            <p className="mt-3 text-xs text-text-muted">Average of {report.overall.scoredCategories} scored categories, based on {report.overall.candidateAnswerCount} candidate answers.</p>
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><Award className="w-4 h-4 text-lime-200" /><h2 className="text-base font-semibold">Six evidence-based scores</h2></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{CATEGORY_LIST.map(({ key, label }) => <CategoryBar key={key} label={label} category={report.categories[key]} />)}</div>
        </section>

        <section className="flex flex-col gap-3">
          <div><h2 className="text-base font-semibold">SWOT analysis</h2><p className="text-xs text-text-muted mt-1">Specific signals from this interview and practical next steps.</p></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SwotCard title="Strengths" items={report.swot.strengths} tone="text-lime-300" />
            <SwotCard title="Weaknesses" items={report.swot.weaknesses} tone="text-rose-300" />
            <SwotCard title="Opportunities" items={report.swot.opportunities} tone="text-emerald-300" />
            <SwotCard title="Threats" items={report.swot.threats} tone="text-rose-200" />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-lime-200" /><h2 className="text-base font-semibold">Answer-by-answer review</h2></div>
          <div className="flex flex-col gap-2">{report.answerReviews.map((answer) => {
            const open = openAnswer === answer.turn;
            return <Card key={answer.turn} className="p-0 overflow-hidden"><button type="button" aria-expanded={open} onClick={() => setOpenAnswer(open ? null : answer.turn)} className="w-full flex items-center justify-between gap-4 p-4 text-left"><span className="min-w-0"><span className="block text-[10px] text-lime-200 mb-1">Candidate answer · Turn {answer.turn}</span><span className="block text-sm font-medium text-text-primary">{answer.question}</span></span><ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} /></button>
              <div className={`print-report-content px-4 pb-4 space-y-3 text-xs leading-relaxed ${open ? '' : 'hidden'}`}><p><span className="font-semibold text-text-primary">What you said: </span><span className="text-text-secondary">{answer.candidateAnswer}</span></p><p><span className="font-semibold text-rose-200">A stronger answer would include: </span><span className="text-text-secondary">{answer.strongerAnswerShouldInclude}</span></p><p><span className="font-semibold text-emerald-300">Model answer: </span><span className="text-text-secondary">{answer.modelAnswer}</span></p></div>
            </Card>;
          })}</div>
        </section>

        <Card>
          <h2 className="text-base font-semibold mb-3">Interview behavior</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs"><p className="glass rounded-xl p-3"><span className="block text-text-muted">Filler words</span><strong className="text-text-primary">{report.interviewBehavior.fillerWordCount}</strong></p><p className="glass rounded-xl p-3"><span className="block text-text-muted">Average answer</span><strong className="text-text-primary">{Math.round(report.interviewBehavior.averageAnswerLengthWords)} words</strong></p><p className="glass rounded-xl p-3"><span className="block text-text-muted">Very short</span><strong className="text-text-primary">{report.interviewBehavior.tooShortTurns.length ? `Turns ${report.interviewBehavior.tooShortTurns.join(', ')}` : 'None noted'}</strong></p><p className="glass rounded-xl p-3"><span className="block text-text-muted">Rambling</span><strong className="text-text-primary">{report.interviewBehavior.ramblingTurns.length ? `Turns ${report.interviewBehavior.ramblingTurns.join(', ')}` : 'None noted'}</strong></p></div>
          <div className="space-y-2 text-xs leading-relaxed"><p><span className="font-semibold text-text-primary">Interruptions: </span><span className="text-text-secondary">{report.interviewBehavior.interruptionHandling}</span></p><p><span className="font-semibold text-text-primary">Follow-ups: </span><span className="text-text-secondary">{report.interviewBehavior.followUpHandling}</span></p></div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold mb-3">Your 7-day practice plan</h2>
          <div className="space-y-2">{report.practicePlan.map((day) => <label key={day.day} className="flex items-start gap-3 rounded-xl border border-white/5 p-3 text-xs cursor-pointer"><input type="checkbox" checked={checkedDays.includes(day.day)} onChange={() => toggleDay(day.day)} className="mt-0.5 accent-emerald-400" /><span className="flex-1"><strong className="text-text-primary">Day {day.day}: {day.title}</strong><span className="block mt-1 text-text-secondary leading-relaxed">{day.task}</span>{day.topics.length > 0 && <span className="block mt-1 text-text-muted">Study: {day.topics.join(' · ')}</span>}</span>{checkedDays.includes(day.day) && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}</label>)}</div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Card><p className="text-[10px] text-emerald-200">Best moment</p><blockquote className="mt-2 text-sm text-text-primary">“{report.quoteCards.bestMoment.quote || 'No candidate quote was available.'}”</blockquote><p className="mt-2 text-xs text-text-muted">{report.quoteCards.bestMoment.turn !== null ? `Turn ${report.quoteCards.bestMoment.turn} · ` : ''}{report.quoteCards.bestMoment.why}</p></Card><Card><p className="text-[10px] uppercase tracking-wider text-rose-200">Moment to revisit</p><blockquote className="mt-2 text-sm text-text-primary">“{report.quoteCards.momentToRevisit.quote || 'No candidate quote was available.'}”</blockquote><p className="mt-2 text-xs text-text-muted">{report.quoteCards.momentToRevisit.turn !== null ? `Turn ${report.quoteCards.momentToRevisit.turn} · ` : ''}{report.quoteCards.momentToRevisit.why}</p></Card></div>

        <Card className="no-print">
          <button type="button" onClick={() => setOpenAnswer(openAnswer === -1 ? null : -1)} aria-expanded={openAnswer === -1} className="w-full flex items-center justify-between text-left"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-lime-200" /><span className="text-sm font-semibold">Complete interview transcript</span></span><ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${openAnswer === -1 ? 'rotate-180' : ''}`} /></button>
          {openAnswer === -1 && <div className="mt-4 border-t border-white/10 pt-3 space-y-3 max-h-96 overflow-y-auto">{transcript.map((entry, index) => <div key={index} className="text-xs"><span className={entry.role === 'assistant' ? 'text-lime-200' : 'text-emerald-300'}>Turn {index + 1} · {entry.role === 'assistant' ? 'Vera' : profile?.name || 'Candidate'}:</span><p className="text-text-secondary mt-1 whitespace-pre-wrap">{entry.text}</p></div>)}</div>}
        </Card>
      </div>
    </div>
  );
}
