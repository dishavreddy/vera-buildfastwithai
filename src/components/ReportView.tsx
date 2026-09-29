import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, AlertTriangle, BookOpen, ChevronDown, ChevronUp,
  Download, Sparkles, TrendingUp, FileText,
} from 'lucide-react';
import type { InterviewReport, CandidateProfile } from '@/types/interview';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ScoreGauge } from '@/components/ui/ScoreGauge';

interface ReportViewProps {
  report: InterviewReport;
  profile: CandidateProfile | null;
  transcript: { role: 'user' | 'assistant'; text: string }[];
  onRestart: () => void;
}

function ListCard({
  title, items, icon, accent,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  accent: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <span className={accent}>{icon}</span>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-text-secondary flex gap-2 leading-relaxed">
            <span className={`shrink-0 ${accent}`}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportView({ report, profile, transcript, onRestart }: ReportViewProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const gauges = [
    { label: 'Communication', value: report.communication },
    { label: 'Technical Knowledge', value: report.technicalKnowledge },
    { label: 'Problem Solving', value: report.problemSolving },
    { label: 'Project Understanding', value: report.projectUnderstanding },
  ];

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent-400" />
              <span className="text-xs font-medium text-accent-300 uppercase tracking-wide">Interview Report</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {profile?.name || 'Your Interview'}
            </h1>
            <p className="text-sm text-text-muted mt-1">{today}</p>
          </div>
          <div className="flex gap-2 no-print">
            <Button
              variant="secondary"
              size="md"
              onClick={() => window.print()}
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
            <Button variant="primary" size="md" onClick={onRestart}>
              <TrendingUp className="w-4 h-4" />
              New Interview
            </Button>
          </div>
        </div>

        {/* Score overview */}
        <Card>
          <h2 className="text-base font-semibold mb-4">Evaluation Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {gauges.map((g) => (
              <ScoreGauge key={g.label} label={g.label} value={g.value} />
            ))}
          </div>
        </Card>

        {/* Lists */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ListCard
            title="Strengths"
            items={report.strengths}
            icon={<CheckCircle2 className="w-4 h-4" />}
            accent="text-success-400"
          />
          <ListCard
            title="Areas to Improve"
            items={report.weaknesses}
            icon={<AlertTriangle className="w-4 h-4" />}
            accent="text-warning-400"
          />
          <ListCard
            title="Recommended Practice"
            items={report.topicsToStudy}
            icon={<BookOpen className="w-4 h-4" />}
            accent="text-accent-300"
          />
        </div>

        {/* Topics to study as chips */}
        {report.topicsToStudy && report.topicsToStudy.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Topics to Study</h3>
            <div className="flex flex-wrap gap-2">
              {report.topicsToStudy.map((topic, i) => (
                <Chip key={i} color="accent">{topic}</Chip>
              ))}
            </div>
          </Card>
        )}

        {/* Preparation suggestion */}
        {report.preparationSuggestion && (
          <Card glow>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent-400" />
              <h2 className="text-base font-semibold">Personalized Preparation</h2>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{report.preparationSuggestion}</p>
          </Card>
        )}

        {/* Collapsible transcript */}
        <Card>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-text-muted" />
              <h2 className="text-base font-semibold">Full Transcript</h2>
            </div>
            {showTranscript ? (
              <ChevronUp className="w-5 h-5 text-text-muted" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-muted" />
            )}
          </button>
          {showTranscript && (
            <div className="mt-4 flex flex-col gap-2 max-h-96 overflow-y-auto">
              {transcript.map((entry, i) => (
                <div key={i} className="text-sm leading-relaxed">
                  <span className={`font-semibold ${entry.role === 'assistant' ? 'text-accent-300' : 'text-success-400'}`}>
                    {entry.role === 'assistant' ? 'Vera' : 'You'}:
                  </span>{' '}
                  <span className="text-text-secondary">{entry.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
