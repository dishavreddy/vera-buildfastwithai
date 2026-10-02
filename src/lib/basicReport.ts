import type { InterviewReport } from '@/types/interview';

export function createBasicReport(transcript: { role: 'user' | 'assistant'; text: string }[]): InterviewReport {
  const answers = transcript.map((entry, index) => ({ turn: index + 1, role: entry.role, text: entry.text })).filter((entry) => entry.role === 'user');
  const lengths = answers.map((answer) => answer.text.trim().split(/\s+/).filter(Boolean).length);
  const totalWords = lengths.reduce((sum, length) => sum + length, 0);
  const fillers = answers.map((answer) => answer.text).join(' ').match(/\b(?:um|uh|erm|er|ah|like)\b|\byou know\b|\bi mean\b/gi) || [];
  const topicKeywords = ['JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Node.js', 'AWS', 'SQL', 'PostgreSQL', 'MongoDB', 'Docker', 'Kubernetes', 'leadership', 'testing', 'performance'];
  const topics = topicKeywords.filter((topic) => answers.some((answer) => answer.text.toLowerCase().includes(topic.toLowerCase()))).slice(0, 8);
  const topicText = topics.length ? topics.join(', ') : 'no repeated technical topics identified';
  const emptyCategory = () => ({ score: null, evidence: [], supportingAnswerTurns: [], note: 'Not enough evidence yet. Detailed analysis was unavailable; retry for category scores.' });
  const item = (title: string, detail: string, evidence = '', turn: number | null = null) => ({ title, detail, evidence, turn });
  const first = answers[0]; const last = answers[answers.length - 1];
  const findQuestion = (turn: number) => [...transcript.slice(0, turn - 1)].reverse().find((entry) => entry.role === 'assistant')?.text || 'Interview question';
  const pairedAnswers = answers.filter((answer) => transcript.slice(0, answer.turn - 1).some((entry) => entry.role === 'assistant'));
  return {
    basicReport: true,
    analysisNote: 'Detailed analysis unavailable',
    categories: { communication: emptyCategory(), technicalKnowledge: emptyCategory(), problemSolving: emptyCategory(), projectUnderstanding: emptyCategory(), confidence: emptyCategory(), resumeKnowledge: emptyCategory() },
    overall: { score: null, scoredCategories: 0, candidateAnswerCount: answers.length, hiringReadiness: 'Needs practice' },
    summary: `${answers.length} candidate answers were recorded, averaging ${answers.length ? Math.round(totalWords / answers.length) : 0} words, with ${fillers.length} filler words. Topics: ${topicText}. Detailed analysis unavailable; retry when the report service is ready.`,
    shortSession: answers.length < 4,
    swot: {
      strengths: [item('Answers recorded', `You completed ${answers.length} candidate answers.`, first ? `${lengths[0]} words in the first answer` : 'No answer text was captured', first?.turn ?? null), item('Topics captured', `The transcript includes ${topicText}.`), item('Practice completed', 'You have a real interview transcript to review.')],
      weaknesses: [item('Scoring unavailable', 'A detailed scoring pass did not complete.'), item('Answer depth unmeasured', 'This summary counts words but does not judge answer quality.'), item('Evidence review unavailable', 'Retry for transcript-linked feedback.')],
      opportunities: [item('Retry the detailed report', 'Reconnect to get evidence-based feedback.'), item('Practice mentioned topics', `Review ${topicText}.`), item('Structure answers', 'Use a situation, action, and result structure next time.')],
      threats: [item('No scored evidence yet', 'Recruiters may probe areas this summary could not assess.'), item('Gaps were not evaluated', 'This report cannot identify role-specific gaps.'), item('Feedback is incomplete', 'Retry to replace this basic summary with detailed analysis.')],
    },
    answerReviews: pairedAnswers.map((answer) => ({ turn: answer.turn, question: findQuestion(answer.turn), candidateAnswer: answer.text, strongerAnswerShouldInclude: 'Detailed analysis unavailable.', modelAnswer: 'Detailed analysis unavailable.' })),
    interviewBehavior: { fillerWordCount: fillers.length, averageAnswerLengthWords: answers.length ? Math.round(totalWords / answers.length) : 0, tooShortTurns: answers.filter((_, index) => lengths[index] < 15).map((answer) => answer.turn), ramblingTurns: answers.filter((_, index) => lengths[index] > 150).map((answer) => answer.turn), interruptionHandling: 'Not evaluated in the local summary.', followUpHandling: 'Not evaluated in the local summary.' },
    practicePlan: [
      { day: 1, title: 'Review the transcript', task: 'Mark the clearest example and one answer to expand.', topics },
      { day: 2, title: 'Practice structure', task: 'Answer a behavioral prompt with situation, action, and result.', topics },
      { day: 3, title: 'Explain a technical choice', task: 'Talk through trade-offs and edge cases aloud.', topics },
      { day: 4, title: 'Add measurable outcomes', task: 'Include a concrete result in two practice answers.', topics },
      { day: 5, title: 'Run a short mock interview', task: 'Practice five answers, then retry the detailed report.', topics },
    ],
    quoteCards: { bestMoment: { quote: first?.text || '', turn: first?.turn ?? null, why: first ? 'First captured answer; detailed scoring unavailable.' : 'No candidate quote was captured.' }, momentToRevisit: { quote: last?.text || '', turn: last?.turn ?? null, why: 'A detailed answer review was unavailable.' } },
  };
}
