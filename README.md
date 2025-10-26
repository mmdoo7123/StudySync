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
StudySync/
├── public/ # Static files (index.html, favicon, etc.)
├── src/ # Main application source
│ ├── components/ # Reusable React components
│ ├── pages/ # Route pages
│ ├── context/ # Context providers (auth, theme, etc.)
│ ├── hooks/ # Custom React hooks
│ ├── utils/ # Helper functions
│ ├── services/ # Firebase/Auth APIs
│ └── App.js # Main app component
├── .env # Environment variables
├── firebase.json # Firebase config
├── package.json

## Installation

```bash
# Clone the repo
git clone https://github.com/mmdoo7123/StudySync.git
cd StudySync

# Install dependencies
npm install

# Run development server
npm start
Deployment
bash
Copy code
# Build project
npm run build

# Deploy to Firebase (if configured)
firebase deploy
Usage
Sign in or register

Create or join a study room

Collaborate via chat and shared notes

View/edit notes live with your peers

Contribution
Pull requests are welcome! For major changes, open an issue first to discuss what you’d like to change.

License
MIT License. See LICENSE for details.

Author
Mahmoud Zourob – mahmoudzourob13@gmail.com

Would you like me to finalize this README using your actual folder structure and features? Just paste them in, and I’ll refine it further!

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

StudySync/
├── popup.html # Extension popup interface
├── popup.css # Modern responsive styles
├── popup.js # UI logic, timer, tabs, analytics
├── background.js # Service worker: session mgmt, PDF scraper
├── deadline_processor.js # Deadline parsing & normalization
├── optimized_pdf_extractor.js # PDF.js integration & deadline parsing
├── calendar_integration.js # Google Calendar API support
├── rollup.config.js # JS bundler for background scripts
└── dist/ # Rollup output

bash
Copy code

## Requirements

- Google Developer Account (for Calendar API credentials)
- Chrome browser with Developer Mode
- Firebase (optional for auth/session extensions)

## Installation (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/mmdoo7123/StudySync.git
   cd StudySync
Install dependencies and build:

bash
Copy code
npm install
npx rollup -c
Load extension into Chrome:

Open chrome://extensions/

Enable "Developer Mode"

Click "Load Unpacked"

Select the root directory of this project

Sign in with Google and click “Sync Brightspace”

Using the Extension
1. Login
Click "Sign in with Google" — used for syncing deadlines to your Google Calendar.

2. Study Timer
Switch to the Study tab. Select a subject and click Start Study Session.
Tracks your streak and time logged today.

3. Brightspace Sync
Click Sync Brightspace to pull courses and auto-scrape syllabi.
Automatically extracts key deadlines and shows a notification.

4. Calendar Integration
Events are added to your primary calendar:

11:59 PM due time

Reminders: 1 day email + popup, 1 hour popup

Events color-coded by type (assignment/quiz/exam)

Calendar Permissions
This extension requires:

https://www.googleapis.com/calendar/v3/ access

OAuth scopes: calendar.events, calendar.readonly

Development Commands
bash
Copy code
# Build background script
npx rollup -c

# Watch changes
npx rollup -c -w
Coming Soon
GPT-powered syllabus summarization

Weekly study planner

Native mobile notifications

Dark mode sync with system

License
MIT License. See LICENSE for full terms.

Author
👨‍💻 Mahmoud Zourob
📫 mahmoudzourob13@gmail.com
📍 Ottawa, Canada


