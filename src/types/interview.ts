export interface CandidateProfile {
  name: string;
  skills: string[];
  projects: { name: string; description: string }[];
  experience: string[];
  keyTechnologies: string[];
}

export interface InterviewReport {
  communication: string;
  technicalKnowledge: string;
  problemSolving: string;
  projectUnderstanding: string;
  strengths: string[];
  weaknesses: string[];
  topicsToStudy: string[];
  preparationSuggestion: string;
}
