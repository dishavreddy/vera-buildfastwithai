export interface CandidateProfile {
  name: string;
  skills: string[];
  projects: { name: string; description: string }[];
  experience: string[];
  keyTechnologies: string[];
  basicProfile?: boolean;
}

export interface ReportEvidence {
  turn: number;
  quote: string;
  why: string;
}

export interface ReportCategory {
  score: number | null;
  evidence: ReportEvidence[];
  supportingAnswerTurns: number[];
  note: string;
}

export interface ReportInsight {
  title: string;
  detail: string;
  evidence: string;
  turn: number | null;
}

export interface InterviewReport {
  basicReport?: boolean;
  analysisNote?: string;
  categories: {
    communication: ReportCategory;
    technicalKnowledge: ReportCategory;
    problemSolving: ReportCategory;
    projectUnderstanding: ReportCategory;
    confidence: ReportCategory;
    resumeKnowledge: ReportCategory;
  };
  overall: {
    score: number | null;
    scoredCategories: number;
    candidateAnswerCount: number;
    hiringReadiness: 'Ready' | 'Almost there' | 'Needs practice';
  };
  summary: string;
  shortSession: boolean;
  swot: {
    strengths: ReportInsight[];
    weaknesses: ReportInsight[];
    opportunities: ReportInsight[];
    threats: ReportInsight[];
  };
  answerReviews: {
    turn: number;
    question: string;
    candidateAnswer: string;
    strongerAnswerShouldInclude: string;
    modelAnswer: string;
  }[];
  interviewBehavior: {
    fillerWordCount: number;
    averageAnswerLengthWords: number;
    tooShortTurns: number[];
    ramblingTurns: number[];
    interruptionHandling: string;
    followUpHandling: string;
  };
  practicePlan: { day: number; title: string; task: string; topics: string[] }[];
  quoteCards: {
    bestMoment: { quote: string; turn: number | null; why: string };
    momentToRevisit: { quote: string; turn: number | null; why: string };
  };
}
