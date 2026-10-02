# Vera — AI Voice Interviewer

Vera is an AI-powered voice interviewer that turns interview preparation into a realistic, adaptive conversation.

Built for the **Build Fast with AI Hackathon 2026**, Vera goes beyond asking predefined questions. It analyzes the candidate’s resume, listens to their answers, and dynamically decides what to ask next based on the conversation.

## What Vera Does

* Upload your resume and automatically build a candidate profile
* Extract skills, technologies, projects, and experience
* Conduct a voice-based interview
* Ask adaptive follow-up questions based on your answers
* Allow natural interruptions during the conversation
* Handle pauses while you think
* Generate a detailed interview report after the session
* Provide scores across six interview areas
* Generate a SWOT analysis
* Create a personalized 7-day improvement plan

## How It Works

```text
Resume
   ↓
Resume Parsing
   ↓
Candidate Profile
   ↓
AI Interview
   ↓
Voice Input
   ↓
Answer Analysis
   ↓
Adaptive Follow-up
   ↓
Interview Report
   ↓
SWOT + 7-Day Practice Plan
```

## Key Feature: Adaptive Interviews

Traditional interview practice tools usually follow a fixed sequence:

```text
Question 1 → Question 2 → Question 3 → Question 4
```

Vera instead adapts to the candidate:

```text
Question
   ↓
Candidate Answer
   ↓
Analyze Answer
   ↓
Identify Relevant Topic
   ↓
Generate Follow-up
   ↓
Continue Conversation
```

For example, if a candidate mentions using **Node.js and MongoDB**, Vera can follow up on why those technologies were chosen instead of simply moving to the next predefined question.

## Voice Interaction

Vera is designed to feel more like a real interview conversation.

The candidate can:

* Speak naturally
* Pause to think
* Interrupt Vera
* Clarify an answer
* Continue the conversation naturally

This makes the interview experience less like a questionnaire and more like an actual interview.

## Interview Report

After the interview, Vera generates a structured debrief containing:

### Performance Scores

The candidate receives scores across six interview-related areas, supported by observations from their actual responses.

### SWOT Analysis

* **Strengths**
* **Weaknesses**
* **Opportunities**
* **Risks**

### 7-Day Practice Plan

Vera converts the interview feedback into a short, actionable plan focused on areas that need improvement.

## Tech Stack

### Frontend

* React
* Vite
* Tailwind CSS

### Backend

* Node.js
* Express.js

### AI

* Groq API

### Voice

* Browser speech recognition
* Browser speech synthesis

### Other

* Resume parsing
* REST APIs
* GitHub
* Vercel

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd vera-voice-ai-interviewer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file and add your API configuration:

```env
GROQ_API_KEY=your_groq_api_key
```

Add any other environment variables required by your local configuration.

### 4. Run the application

```bash
npm run dev
```

The application should start the frontend and backend development servers.

## Project Structure

```text
vera-voice-ai-interviewer/
│
├── src/
│   ├── components/
│   ├── pages/
│   └── ...
│
├── server/
│   ├── index.js
│   └── ...
│
├── public/
├── package.json
└── README.md
```

## Why I Built Vera

Interview preparation often focuses on memorizing common questions rather than practicing how to actually communicate under interview conditions.

I built Vera to make that practice more realistic.

The goal was to create an interviewer that doesn't simply follow a script, but listens to the candidate, understands the context of their response, and adapts the conversation accordingly.

## Hackathon

Vera was built as part of the **Build Fast with AI Hackathon 2026**.

The project focuses on using AI to create a more realistic and personalized interview-practice experience.

## Future Improvements

* More specialized interview modes for different roles
* Better evaluation of technical answers
* Multiple interviewer personalities
* Interview history and progress tracking
* More detailed communication analysis
* Support for additional languages
* Improved resume and job-description matching

## Author

**Disha V Reddy**

Built with React, Node.js, Groq, and browser-based voice technologies.

