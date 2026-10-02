import type { InterviewReport } from '@/types/interview';

export function createBasicReport(transcript: { role: 'user' | 'assistant'; text: string }[]): InterviewReport {
  const answers = transcript.map((entry, index) => ({ turn: index + 1, role: entry.role, text: entry.text })).filter((entry) => entry.role === 'user');
  const lengths = answers.map((answer) => answer.text.trim().split(/\s+/).filter(Boolean).length);
  const totalWords = lengths.reduce((sum, length) => sum + length, 0);
  const fillers = answers.map((answer) => answer.text).join(' ').match(/\b(?:um|uh|erm|er|ah|like)\b|\byou know\b|\bi mean\b/gi) || [];
  const topicKeywords = ['JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Node.js', 'AWS', 'SQL', 'PostgreSQL', 'MongoDB', 'Docker', 'Kubernetes', 'leadership', 'testing', 'performance'];
  const topics = topicKeywords.filter((topic) => answers.some((answer) => answer.text.toLowerCase().includes(topic.toLowerCase()))).slice(0, 8);
  const topicText = topics.length ? topics.join(', ') : 'no repeated technical topics identified';
  const average = answers.length ? totalWords / answers.length : 0;
  const shortRatio = answers.length ? lengths.filter((length) => length < 15).length / answers.length : 1;
  const ideaTerms = answers.filter((answer) => /because|trade.?off|approach|step|edge case|result|measur|improv|built|designed/i.test(answer.text)).length;
  const projectTerms = answers.filter((answer) => /project|built|develop|implemented|users|customer|percent|\d+%/i.test(answer.text)).length;
  const clamp = (score: number) => Math.max(40, Math.min(75, Math.round(score)));
  const scores = {
    communication: clamp(45 + Math.min(average, 80) * 0.25 - fillers.length * 1.5 - shortRatio * 8),
    technicalKnowledge: clamp(44 + topics.length * 3 + Math.min(answers.length, 5)),
    problemSolving: clamp(44 + ideaTerms * 4 + Math.min(answers.length, 5)),
    projectUnderstanding: clamp(44 + projectTerms * 4 + Math.min(topics.length, 4)),
    confidence: clamp(58 - fillers.length * 1.5 - shortRatio * 10),
    resumeKnowledge: clamp(42 + topics.length * 2 + projectTerms * 3),
  };
  const metricEvidence = answers[0] ? [{ turn: answers[0].turn, quote: answers[0].text.slice(0, 120), why: `Basic estimate uses transcript counts: ${answers.length} answers, ${Math.round(average)} words per answer, ${fillers.length} fillers, and ${topics.length} topic matches. This is not a semantic evaluation.` }] : [];
  const category = (score: number) => ({ score, evidence: metricEvidence, supportingAnswerTurns: answers.map((answer) => answer.turn), note: 'Basic transcript-statistic estimate. Retry for detailed evidence-based analysis.' });
  const item = (title: string, detail: string, evidence = '', turn: number | null = null) => ({ title, detail, evidence, turn });
  const first = answers[0]; const last = answers[answers.length - 1];
  const findQuestion = (turn: number) => [...transcript.slice(0, turn - 1)].reverse().find((entry) => entry.role === 'assistant')?.text || 'Interview question';
  const pairedAnswers = answers.filter((answer) => transcript.slice(0, answer.turn - 1).some((entry) => entry.role === 'assistant'));
  return {
    basicReport: true,
    analysisNote: 'Detailed analysis unavailable. Retry for a detailed report. Basic scores use transcript statistics.',
    categories: { communication: category(scores.communication), technicalKnowledge: category(scores.technicalKnowledge), problemSolving: category(scores.problemSolving), projectUnderstanding: category(scores.projectUnderstanding), confidence: category(scores.confidence), resumeKnowledge: category(scores.resumeKnowledge) },
    overall: { score: Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) / 6), scoredCategories: 6, candidateAnswerCount: answers.length, hiringReadiness: 'Needs practice' },
    summary: `${answers.length} candidate answers were recorded, averaging ${answers.length ? Math.round(totalWords / answers.length) : 0} words, with ${fillers.length} filler words. Topics: ${topicText}. Detailed analysis unavailable. Retry for evidence-based feedback; these scores are basic transcript-statistic estimates.`,
    shortSession: answers.length < 4,
    swot: {
      strengths: [item('Answers recorded', `You completed ${answers.length} candidate answers.`, first ? `${lengths[0]} words in the first answer` : 'No answer text was captured', first?.turn ?? null), item('Topics captured', `The transcript includes ${topicText}.`), item('Practice completed', 'You have a real interview transcript to review.')],
      weaknesses: [item('Detailed scoring unavailable', 'The scores are basic transcript-statistic estimates.'), item('Answer depth unmeasured', 'This summary counts words but does not judge answer quality.'), item('Evidence review unavailable', 'Retry for transcript-linked feedback.')],
      opportunities: [item('Retry the detailed report', 'Reconnect to get evidence-based feedback.'), item('Practice mentioned topics', `Review ${topicText}.`), item('Structure answers', 'Use a situation, action, and result structure next time.')],
      threats: [item('Provisional estimates', 'Recruiters may probe areas this summary could not assess.'), item('Gaps were not evaluated', 'This report cannot identify role-specific gaps.'), item('Feedback is incomplete', 'Retry to replace this basic summary with detailed analysis.')],
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
