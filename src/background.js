// StudySync Enhanced Background Script
// Version 2.0 - Professional Service Worker

class StudySyncBackground {
  constructor() {
      this.init();
  }

  init() {
      console.log('StudySync Enhanced Background v2.0 - Starting...');
      
      // Setup message listeners
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          this.handleMessage(request, sender, sendResponse);
          return true; // Keep message channel open for async responses
      });

      // Setup installation listener
      chrome.runtime.onInstalled.addListener((details) => {
          this.handleInstallation(details);
      });

      // Setup alarm listeners for notifications
      chrome.alarms.onAlarm.addListener((alarm) => {
          this.handleAlarm(alarm);
      });

      console.log('StudySync Enhanced Background - Ready!');
  }

  async handleMessage(request, sender, sendResponse) {
      try {
          switch (request.action) {
              case 'authenticate':
                  await this.handleAuthentication(sendResponse);
                  break;
              
              case 'scrapeBrightspace':
                  await this.handleBrightspaceScraping(sendResponse);
                  break;
              
              case 'setStudyReminder':
                  await this.setStudyReminder(request.data, sendResponse);
                  break;
              
              case 'getAnalytics':
                  await this.getAnalytics(request.period, sendResponse);
                  break;
              
              case 'exportData':
                  await this.exportStudyData(sendResponse);
                  break;
              
              default:
                  sendResponse({ success: false, error: 'Unknown action' });
          }
      } catch (error) {
          console.error('Background message error:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  async handleAuthentication(sendResponse) {
      try {
          console.log('Starting Google OAuth authentication...');
          
          // Get OAuth token using Chrome Identity API
          const token = await new Promise((resolve, reject) => {
              chrome.identity.getAuthToken({ interactive: true }, (token) => {
                  if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                  } else {
                      resolve(token);
                  }
              });
          });

          if (!token) {
              throw new Error('Failed to get authentication token');
          }

          // Get user info from Google API
          const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`);
          
          if (!userResponse.ok) {
              throw new Error('Failed to fetch user information');
          }

          const userData = await userResponse.json();
          
          const user = {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              picture: userData.picture,
              token: token,
              authenticatedAt: Date.now()
          };

          console.log('Authentication successful:', user.email);
          sendResponse({ success: true, user });

      } catch (error) {
          console.error('Authentication error:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  async handleBrightspaceScraping(sendResponse) {
      try {
          console.log('Starting Brightspace data scraping...');

          // Find or create Brightspace tab
          const brightspaceTab = await this.findOrCreateBrightspaceTab();
          
          if (!brightspaceTab) {
              throw new Error('Could not access Brightspace. Please log in first.');
          }

          // Inject and execute scraper
          const results = await chrome.scripting.executeScript({
              target: { tabId: brightspaceTab.id },
              func: this.brightspaceScraper
          });

          if (!results || !results[0]) {
              throw new Error('Failed to execute scraper script');
          }

          const scrapedData = results[0].result;
          
          if (!scrapedData.success) {
              throw new Error(scrapedData.error || 'Scraping failed');
          }

          console.log(`Successfully scraped ${scrapedData.courses.length} courses`);
          
          // Enhance course data with additional information
          const enhancedCourses = await this.enhanceCourseData(scrapedData.courses);
          
          sendResponse({ 
              success: true, 
              courses: enhancedCourses,
              scrapedAt: Date.now()
          });

      } catch (error) {
          console.error('Brightspace scraping error:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  async findOrCreateBrightspaceTab() {
      try {
          // First, try to find existing Brightspace tab
          const tabs = await chrome.tabs.query({});
          const brightspaceTab = tabs.find(tab => 
              tab.url && tab.url.includes('brightspace.uottawa.ca')
          );

          if (brightspaceTab) {
              // Activate existing tab
              await chrome.tabs.update(brightspaceTab.id, { active: true });
              await chrome.windows.update(brightspaceTab.windowId, { focused: true });
              return brightspaceTab;
          }

          // Create new tab if none exists
          const newTab = await chrome.tabs.create({
              url: 'https://brightspace.uottawa.ca/d2l/home',
              active: true
          });

          // Wait for tab to load
          await new Promise((resolve) => {
              const listener = (tabId, changeInfo) => {
                  if (tabId === newTab.id && changeInfo.status === 'complete') {
                      chrome.tabs.onUpdated.removeListener(listener);
                      resolve();
                  }
              };
              chrome.tabs.onUpdated.addListener(listener);
          });

          return newTab;

      } catch (error) {
          console.error('Error finding/creating Brightspace tab:', error);
          return null;
      }
  }

  // Enhanced Brightspace scraper function
  brightspaceScraper() {
      try {
          console.log('Executing Brightspace scraper...');

          // Check if we're on the right page
          if (!window.location.href.includes('brightspace.uottawa.ca')) {
              return { success: false, error: 'Not on Brightspace domain' };
          }

          // Wait for page to be fully loaded
          if (document.readyState !== 'complete') {
              return { success: false, error: 'Page still loading' };
          }

          const courses = [];

          // Try multiple selectors for course cards
          const courseSelectors = [
              '.d2l-card',
              '.d2l-course-tile',
              '[data-automation-id="course-tile"]',
              '.d2l-enrollment-card',
              '.d2l-widget-content'
          ];

          let courseElements = [];
          
          for (const selector of courseSelectors) {
              courseElements = document.querySelectorAll(selector);
              if (courseElements.length > 0) {
                  console.log(`Found ${courseElements.length} courses using selector: ${selector}`);
                  break;
              }
          }

          if (courseElements.length === 0) {
              // Try alternative approach - look for course links
              const courseLinks = document.querySelectorAll('a[href*="/d2l/le/content/"]');
              if (courseLinks.length > 0) {
                  courseLinks.forEach((link, index) => {
                      const courseName = link.textContent.trim();
                      if (courseName && courseName.length > 3) {
                          courses.push({
                              id: `course_${index}`,
                              name: courseName,
                              code: this.extractCourseCode(courseName),
                              url: link.href,
                              lastAccessed: null,
                              isActive: true
                          });
                      }
                  });
              }
          } else {
              // Process course cards
              courseElements.forEach((element, index) => {
                  try {
                      const courseData = this.extractCourseInfo(element, index);
                      if (courseData) {
                          courses.push(courseData);
                      }
                  } catch (error) {
                      console.warn(`Error processing course element ${index}:`, error);
                  }
              });
          }

          // Remove duplicates
          const uniqueCourses = courses.filter((course, index, self) => 
              index === self.findIndex(c => c.name === course.name)
          );

          console.log(`Scraped ${uniqueCourses.length} unique courses`);

          return { 
              success: true, 
              courses: uniqueCourses,
              timestamp: Date.now(),
              url: window.location.href
          };

      } catch (error) {
          console.error('Scraper execution error:', error);
          return { success: false, error: error.message };
      }
  }

  extractCourseInfo(element, index) {
      // Try to extract course name
      const nameSelectors = [
          '.d2l-card-header',
          '.d2l-course-tile-title',
          '.d2l-heading',
          'h2', 'h3', 'h4',
          '[data-automation-id="course-title"]'
      ];

      let courseName = '';
      for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent.trim()) {
              courseName = nameEl.textContent.trim();
              break;
          }
      }

      // Try to extract course URL
      let courseUrl = '';
      const linkEl = element.querySelector('a[href*="/d2l/"]') || element.closest('a');
      if (linkEl && linkEl.href) {
          courseUrl = linkEl.href;
      }

      // Try to extract additional info
      const codeMatch = courseName.match(/([A-Z]{3,4}\s*\d{4})/);
      const courseCode = codeMatch ? codeMatch[1] : '';

      if (courseName && courseName.length > 3) {
          return {
              id: `course_${index}_${Date.now()}`,
              name: courseName,
              code: courseCode,
              url: courseUrl,
              lastAccessed: this.extractLastAccessed(element),
              isActive: true,
              scrapedAt: Date.now()
          };
      }

      return null;
  }

  extractCourseCode(courseName) {
      const codeMatch = courseName.match(/([A-Z]{3,4}\s*\d{4})/);
      return codeMatch ? codeMatch[1] : '';
  }

  extractLastAccessed(element) {
      const timeSelectors = [
          '.d2l-card-footer time',
          '.d2l-last-accessed',
          '[data-automation-id="last-accessed"]'
      ];

      for (const selector of timeSelectors) {
          const timeEl = element.querySelector(selector);
          if (timeEl) {
              return timeEl.textContent.trim();
          }
      }
      return null;
  }

  async enhanceCourseData(courses) {
      // Add additional metadata and processing
      return courses.map(course => ({
          ...course,
          semester: this.detectSemester(),
          year: new Date().getFullYear(),
          category: this.categorizeCourse(course.name),
          priority: this.calculatePriority(course),
          studyTime: 0,
          lastStudied: null,
          goals: [],
          assignments: [],
          schedule: null
      }));
  }

  detectSemester() {
      const month = new Date().getMonth();
      if (month >= 8 || month <= 0) return 'Fall';
      if (month >= 1 && month <= 4) return 'Winter';
      return 'Summer';
  }

  categorizeCourse(courseName) {
      const categories = {
          'Computer Science': ['CSI', 'SEG', 'CEG', 'ITI'],
          'Mathematics': ['MAT', 'STA'],
          'Engineering': ['ELG', 'MCG', 'CVG'],
          'Science': ['PHY', 'CHM', 'BIO'],
          'Business': ['ADM', 'ECO'],
          'Languages': ['FRA', 'ESP', 'GER']
      };

      for (const [category, codes] of Object.entries(categories)) {
          if (codes.some(code => courseName.includes(code))) {
              return category;
          }
      }
      return 'Other';
  }

  calculatePriority(course) {
      // Simple priority calculation based on course level
      const codeMatch = course.code.match(/\d{4}/);
      if (codeMatch) {
          const level = parseInt(codeMatch[0]);
          if (level >= 4000) return 'High';
          if (level >= 3000) return 'Medium';
          return 'Low';
      }
      return 'Medium';
  }

  async setStudyReminder(data, sendResponse) {
      try {
          const { time, message, recurring } = data;
          
          // Create alarm
          await chrome.alarms.create('studyReminder', {
              when: time,
              periodInMinutes: recurring ? 1440 : undefined // Daily if recurring
          });

          // Store reminder data
          await chrome.storage.local.set({
              studyReminder: { time, message, recurring, active: true }
          });

          sendResponse({ success: true });
      } catch (error) {
          console.error('Error setting study reminder:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  async getAnalytics(period, sendResponse) {
      try {
          const { studyData } = await chrome.storage.local.get(['studyData']);
          
          if (!studyData || !studyData.sessions) {
              sendResponse({ success: true, analytics: this.getEmptyAnalytics() });
              return;
          }

          const analytics = this.calculateAnalytics(studyData.sessions, period);
          sendResponse({ success: true, analytics });
      } catch (error) {
          console.error('Error getting analytics:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  calculateAnalytics(sessions, period) {
      const now = Date.now();
      const periodMs = {
          'week': 7 * 24 * 60 * 60 * 1000,
          'month': 30 * 24 * 60 * 60 * 1000,
          'semester': 120 * 24 * 60 * 60 * 1000
      };

      const cutoff = now - (periodMs[period] || periodMs.week);
      const filteredSessions = sessions.filter(s => s.timestamp >= cutoff);

      return {
          totalTime: filteredSessions.reduce((sum, s) => sum + s.duration, 0),
          sessionCount: filteredSessions.length,
          averageSession: filteredSessions.length > 0 ? 
              filteredSessions.reduce((sum, s) => sum + s.duration, 0) / filteredSessions.length : 0,
          subjectBreakdown: this.getSubjectBreakdown(filteredSessions),
          dailyProgress: this.getDailyProgress(filteredSessions, period),
          productivity: this.calculateProductivity(filteredSessions),
          goals: this.getGoalProgress(filteredSessions)
      };
  }

  getSubjectBreakdown(sessions) {
      const breakdown = {};
      sessions.forEach(session => {
          breakdown[session.subject] = (breakdown[session.subject] || 0) + session.duration;
      });
      return breakdown;
  }

  getDailyProgress(sessions, period) {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 120;
      const progress = new Array(days).fill(0);
      
      sessions.forEach(session => {
          const dayIndex = Math.floor((Date.now() - session.timestamp) / (24 * 60 * 60 * 1000));
          if (dayIndex < days) {
              progress[days - 1 - dayIndex] += session.duration;
          }
      });
      
      return progress;
  }

  calculateProductivity(sessions) {
      if (sessions.length === 0) return 0;
      
      const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);
      const averageSession = totalTime / sessions.length;
      
      // Productivity score based on session length and consistency
      const consistencyScore = sessions.length / 30; // Sessions per month
      const lengthScore = Math.min(averageSession / 60, 1); // Normalize to 1 hour
      
      return Math.min((consistencyScore + lengthScore) / 2, 1) * 100;
  }

  getGoalProgress(sessions) {
      // This would integrate with actual goal data
      return {
          daily: sessions.filter(s => this.isToday(s.timestamp)).length >= 2,
          weekly: sessions.length >= 10,
          monthly: sessions.length >= 40
      };
  }

  isToday(timestamp) {
      const today = new Date();
      const sessionDate = new Date(timestamp);
      return today.toDateString() === sessionDate.toDateString();
  }

  getEmptyAnalytics() {
      return {
          totalTime: 0,
          sessionCount: 0,
          averageSession: 0,
          subjectBreakdown: {},
          dailyProgress: new Array(7).fill(0),
          productivity: 0,
          goals: { daily: false, weekly: false, monthly: false }
      };
  }

  async exportStudyData(sendResponse) {
      try {
          const { studyData } = await chrome.storage.local.get(['studyData']);
          
          if (!studyData) {
              sendResponse({ success: false, error: 'No study data found' });
              return;
          }

          const exportData = {
              exportedAt: new Date().toISOString(),
              version: '2.0',
              data: studyData,
              summary: {
                  totalSessions: studyData.sessions?.length || 0,
                  totalTime: studyData.sessions?.reduce((sum, s) => sum + s.duration, 0) || 0,
                  coursesTracked: studyData.courses?.length || 0,
                  currentStreak: studyData.streak || 0
              }
          };

          // Create downloadable blob
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
              type: 'application/json' 
          });
          
          const url = URL.createObjectURL(blob);
          const filename = `studysync-data-${new Date().toISOString().split('T')[0]}.json`;
          
          // Trigger download
          await chrome.downloads.download({
              url: url,
              filename: filename,
              saveAs: true
          });

          sendResponse({ success: true, filename });
      } catch (error) {
          console.error('Error exporting data:', error);
          sendResponse({ success: false, error: error.message });
      }
  }

  async handleAlarm(alarm) {
      if (alarm.name === 'studyReminder') {
          const { studyReminder } = await chrome.storage.local.get(['studyReminder']);
          
          if (studyReminder && studyReminder.active) {
              // Show notification
              chrome.notifications.create({
                  type: 'basic',
                  iconUrl: 'icon48.png',
                  title: 'StudySync Reminder',
                  message: studyReminder.message || 'Time for your study session!',
                  buttons: [
                      { title: 'Start Session' },
                      { title: 'Snooze 10min' }
                  ]
              });
          }
      }
  }

  async handleInstallation(details) {
      if (details.reason === 'install') {
          console.log('StudySync Enhanced installed');
          
          // Set default settings
          await chrome.storage.local.set({
              version: '2.0',
              installedAt: Date.now(),
              settings: {
                  theme: 'light',
                  notifications: true,
                  autoSync: true,
                  reminderEnabled: false
              }
          });
          
          // Open welcome page
          chrome.tabs.create({
              url: chrome.runtime.getURL('welcome.html')
          });
      }
  }
}

// Initialize the background service
new StudySyncBackground();

