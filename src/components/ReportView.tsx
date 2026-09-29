import type { InterviewReport, CandidateProfile } from '@/types/interview';

interface ReportViewProps {
  report: InterviewReport;
  profile: CandidateProfile | null;
  transcript: { role: 'user' | 'assistant'; text: string }[];
  onRestart: () => void;
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 ${color}`}>{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-slate-300 flex gap-2">
            <span className="text-slate-600">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RatingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-800">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-200">{value || '—'}</span>
    </div>
  );
}

export function ReportView({ report, profile, transcript, onRestart }: ReportViewProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Interview Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            {profile ? `Candidate: ${profile.name || 'Unknown'}` : 'General interview'}
          </p>
        </div>

        {/* Ratings */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold mb-3">Evaluation</h2>
          <RatingRow label="Communication" value={report.communication} />
          <RatingRow label="Technical Knowledge" value={report.technicalKnowledge} />
          <RatingRow label="Problem Solving" value={report.problemSolving} />
          <RatingRow label="Project Understanding" value={report.projectUnderstanding} />
        </div>

        {/* Lists */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 flex flex-col gap-5">
          <ListSection title="Strengths" items={report.strengths} color="text-emerald-400" />
          <ListSection title="Weaknesses" items={report.weaknesses} color="text-amber-400" />
          <ListSection title="Topics to Study" items={report.topicsToStudy} color="text-sky-400" />
        </div>

        {/* Preparation suggestion */}
        {report.preparationSuggestion && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-base font-semibold mb-2">Personalized Preparation Suggestion</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{report.preparationSuggestion}</p>
          </div>
        )}

        {/* Full transcript */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-base font-semibold mb-3">Full Transcript</h2>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {transcript.map((entry, i) => (
              <div key={i} className="text-sm">
                <span className={`font-medium ${entry.role === 'assistant' ? 'text-sky-400' : 'text-emerald-400'}`}>
                  {entry.role === 'assistant' ? 'Vera' : 'You'}:
                </span>{' '}
                <span className="text-slate-300">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Restart */}
        <button
          onClick={onRestart}
          className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-3 font-semibold text-white transition-colors"
        >
          Start New Interview
        </button>
      </div>
    </div>
  );
}
