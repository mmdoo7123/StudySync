# StudySync

A feature-rich Chrome extension built for university students to synchronize their academic life. StudySync intelligently extracts deadlines from Brightspace and PDF syllabi, categorizes them, and integrates them with Google Calendar. It also includes a Pomodoro-style study timer, streak tracker, analytics dashboard, and a polished UI with light/dark modes.

## Features

- **Deadline Extraction**
  - Automatically scrapes Brightspace and PDF syllabi
  - Extracts assignment, quiz, and exam deadlines using NLP-enhanced matching
  - Deduplicates and categorizes using confidence scoring

- **Calendar Integration**
  - Syncs extracted deadlines to Google Calendar
  - Avoids duplicates using event fingerprinting
  - Sends popup and email reminders 1 day and 1 hour before deadlines

- **Pomodoro-style Study Timer**
  - Customizable focus/break modes
  - Tracks daily study time, subject, and topic
  - Auto-records session stats to dashboard

- **Student Dashboard**
  - Tracks day streaks, courses, study time, and goals
  - Course-wise analytics view
  - Google sign-in + session expiration handler

- **Brightspace Integration**
  - Scrapes syllabus PDFs when opened
  - Automatically monitors for updates via service worker
  - Smart toast notifications and update history

## UI Highlights

- Responsive UI with light/dark theme
- Tabbed navigation: Dashboard, Study, Courses, Analytics
- Beautiful login page with animated cards
- Theme toggle, action buttons, and interactive charts

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript  
- **Extension API**: Chrome Storage, Alarms, Tabs, Notifications, Runtime Messaging  
- **Backend Utilities**: PDF.js, Google Calendar API, Regex-enhanced NLP  
- **Bundler**: Rollup.js  
- **Deployment**: Chrome Web Store (manual)

## Folder Structure

