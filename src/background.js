// StudySync Enhanced Background Script - Fixed Version
// Version 3.0 - Secure Session Management & Deadline Processing

// Deadline Processor Class - Inline for service worker compatibility
class DeadlineProcessor {
    constructor() {
        this.categories = {
            assignment: {
                keywords: ['assignment', 'hw', 'homework', 'project', 'report', 'essay', 'submission', 'submit', 'lab'],
                icon: '📄'
            },
            quiz: {
                keywords: ['quiz', 'test', 'midterm', 'assessment', 'evaluation'],
                icon: '🧪'
            },
            exam: {
                keywords: ['exam', 'final', 'examination', 'finals'],
                icon: '📅'
            }
        };
    }

    categorizeDeadline(title, description = '') {
        const text = (title + ' ' + description).toLowerCase();
        
        for (const [categoryName, categoryData] of Object.entries(this.categories)) {
            for (const keyword of categoryData.keywords) {
                if (text.includes(keyword)) {
                    return {
                        type: categoryName,
                        icon: categoryData.icon,
                        confidence: this.calculateConfidence(text, keyword)
                    };
                }
            }
        }
        
        return {
            type: 'assignment',
            icon: '📄',
            confidence: 0.3
        };
    }

    calculateConfidence(text, keyword) {
        const words = text.split(/\s+/);
        const keywordIndex = words.findIndex(word => word.includes(keyword));
        
        if (keywordIndex === -1) return 0.5;
        if (keywordIndex < 3) return 0.9;
        if (keywordIndex < 6) return 0.7;
        return 0.5;
    }

    normalizeDeadline(rawText) {
        const category = this.categorizeDeadline(rawText);
        const dateMatch = this.extractDate(rawText);
        const title = this.extractTitle(rawText);

        return {
            type: category.type,
            title: title,
            dueDate: dateMatch ? dateMatch.toISOString().split('T')[0] : null,
            rawText: rawText,
            icon: category.icon,
            confidence: category.confidence,
            extractedAt: new Date().toISOString()
        };
    }

    extractDate(text) {
        const datePatterns = [
            /(\w+\s+\d{1,2},\s+\d{4})/g,
            /(\d{1,2}\/\d{1,2}\/\d{4})/g,
            /(\d{4}-\d{2}-\d{2})/g,
            /(\w+\s+\d{1,2})/g
        ];

        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                const dateStr = match[0];
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate;
                }
            }
        }
        return null;
    }

    extractTitle(text) {
        let title = text.replace(/^(due|deadline|assignment|quiz|exam):\s*/i, '');
        title = title.replace(/\s*(due|deadline)\s*:.*$/i, '');
        title = title.replace(/\s*-\s*\w+\s+\d{1,2}(,\s+\d{4})?.*$/i, '');
        title = title.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/i, '');
        return title.trim();
    }

    processDeadlines(rawDeadlines) {
        return rawDeadlines
            .filter(deadline => deadline && deadline.trim().length > 0)
            .map(deadline => this.normalizeDeadline(deadline))
            .sort((a, b) => {
                if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate) - new Date(b.dueDate);
                }
                if (a.dueDate && !b.dueDate) return -1;
                if (!a.dueDate && b.dueDate) return 1;
                
                const typePriority = { exam: 3, quiz: 2, assignment: 1 };
                return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
            });
    }
}

// Change Detector Class - Inline for service worker compatibility
class ChangeDetector {
    constructor() {
        this.storageKey = 'deadlineSnapshots';
    }

    createHash(deadlines) {
        const sortedData = deadlines
            .map(d => `${d.type}:${d.title}:${d.dueDate}`)
            .sort()
            .join('|');
        
        let hash = 0;
        for (let i = 0; i < sortedData.length; i++) {
            const char = sortedData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    async detectChanges(courseId, currentDeadlines) {
        try {
            const snapshots = await this.getStoredSnapshots();
            const previousSnapshot = snapshots[courseId];
            const currentHash = this.createHash(currentDeadlines);

            if (!previousSnapshot) {
                await this.saveSnapshot(courseId, currentDeadlines, currentHash);
                return {
                    hasChanges: true,
                    isFirstScrape: true,
                    added: currentDeadlines,
                    removed: [],
                    modified: []
                };
            }

            if (previousSnapshot.hash === currentHash) {
                return {
                    hasChanges: false,
                    isFirstScrape: false,
                    added: [],
                    removed: [],
                    modified: []
                };
            }

            const changes = this.compareDeadlines(previousSnapshot.deadlines, currentDeadlines);
            await this.saveSnapshot(courseId, currentDeadlines, currentHash);

            return {
                hasChanges: true,
                isFirstScrape: false,
                ...changes
            };

        } catch (error) {
            console.error('Error detecting changes:', error);
            return {
                hasChanges: false,
                error: error.message
            };
        }
    }

    compareDeadlines(oldDeadlines, newDeadlines) {
        const added = [];
        const removed = [];
        const modified = [];

        const oldMap = new Map(oldDeadlines.map(d => [`${d.title}:${d.type}`, d]));
        const newMap = new Map(newDeadlines.map(d => [`${d.title}:${d.type}`, d]));

        for (const [key, deadline] of newMap) {
            if (!oldMap.has(key)) {
                added.push(deadline);
            }
        }

        for (const [key, oldDeadline] of oldMap) {
            if (!newMap.has(key)) {
                removed.push(oldDeadline);
            } else {
                const newDeadline = newMap.get(key);
                if (oldDeadline.dueDate !== newDeadline.dueDate) {
                    modified.push({
                        old: oldDeadline,
                        new: newDeadline
                    });
                }
            }
        }

        return { added, removed, modified };
    }

    async getStoredSnapshots() {
        try {
            const result = await chrome.storage.local.get([this.storageKey]);
            return result[this.storageKey] || {};
        } catch (error) {
            console.error('Error retrieving snapshots:', error);
            return {};
        }
    }

    async saveSnapshot(courseId, deadlines, hash) {
        try {
            const snapshots = await this.getStoredSnapshots();
            snapshots[courseId] = {
                deadlines: deadlines,
                hash: hash,
                timestamp: Date.now()
            };
            
            await chrome.storage.local.set({ [this.storageKey]: snapshots });
            console.log(`Saved snapshot for course ${courseId}`);
        } catch (error) {
            console.error('Error saving snapshot:', error);
        }
    }
}

function getbrightspaceScraperFunction() {
    return async function() {
        function extractCourseInfo(element, index) {
            // Skip elements that are clearly not courses
            const text = element.textContent.trim();
            if (text.match(/CDATA|function|javascript:|loading|copyright|do not remove|bienvenue|welcome|service|support|©|d21|flex|scroll|body|footer|head|html|script/i)) {
                return null;
            }
            
            // Skip elements with no visible content
            if (text.length < 10) return null;
            
            // Extract course name - multiple fallbacks
            let courseName = '';
            const nameSelectors = [
                'h1', 'h2', 'h3', 'h4', 
                '.d2l-heading-2', '.d2l-heading-3', 
                '[data-testid="course-name"]',
                '.d2l-course-name', '.course-name'
            ];
            
            for (const selector of nameSelectors) {
                const nameEl = element.querySelector(selector);
                if (nameEl && nameEl.textContent.trim()) {
                    courseName = nameEl.textContent.trim();
                    break;
                }
            }
            
            if (!courseName) {
                // Fallback to first meaningful text
                courseName = text.substring(0, 50).replace(/\s{2,}/g, ' ').trim();
            }
            
            // Skip if name looks like code
            if (courseName.match(/[{};()=*\/]/)) return null;
            const nonCoursePhrases = [
                'anytime',
                'for assistance',
                'service desk',
                'help',
                'support',
                'welcome',
                'bienvenue'
            ];

            const lowerName = courseName.toLowerCase();
            for (const phrase of nonCoursePhrases) {
                if (lowerName.includes(phrase)) {
                    console.log(`Skipping non-course element: ${courseName}`);
                    return null;
                }
            }
            // Extract course URL and ID
            let courseUrl = '';
            let courseId = '';
            const linkEl = element.querySelector('a[href*="/d2l/"]'); // More generic selector
            
            if (linkEl && linkEl.href) {
                courseUrl = linkEl.href;
                // Try multiple patterns for course ID extraction
                const idPatterns = [
                    /\/d2l\/home\/(\d+)/,
                    /\/d2l\/le\/content\/(\d+)/,
                    /\/d2l\/lp\/ouHome\/(\d+)/,
                    /[&?]ou=(\d+)/  // Additional pattern for ID in query params
                ];
                
                for (const pattern of idPatterns) {
                    const idMatch = courseUrl.match(pattern);
                    if (idMatch) {
                        courseId = idMatch[1];
                        break;
                    }
                }
            }

            // Extract course code from name
            let courseCode = '';
            
            // Strategy 1: Extract from data attributes
            const dataCode = element.getAttribute('data-course-code') || 
                            element.closest('[data-course-code]')?.getAttribute('data-course-code');
            if (dataCode) {
                courseCode = dataCode.trim().toUpperCase();
            }
            
            // Strategy 2: Extract from URL
            if (!courseCode && linkEl && linkEl.href) {
                const urlPatterns = [
                    /\/d2l\/home\/(\d+)_([A-Z]{2,4}\d{3,4}[A-Z]?)/i,
                    /[&?]code=([A-Z]{2,4}\d{3,4}[A-Z]?)/i,
                    /[&?]course=([A-Z]{2,4}\d{3,4}[A-Z]?)/i
                ];
                
                for (const pattern of urlPatterns) {
                    const match = linkEl.href.match(pattern);
                    if (match && match[1]) {
                        courseCode = match[1].toUpperCase();
                        break;
                    }
                }
            }
            
            // Strategy 3: Extract from element ID/class
            if (!courseCode) {
                const idPattern = /([A-Z]{2,4}\d{3,4}[A-Z]?)/i;
                const idMatch = element.id.match(idPattern) || 
                                Array.from(element.classList).find(c => c.match(idPattern))?.match(idPattern);
                if (idMatch) {
                    courseCode = idMatch[1].toUpperCase();
                }
            }
            
            // Strategy 4: Extract from text content patterns
            if (!courseCode) {
                const textPatterns = [
                    // Standard pattern: ABC 1234 or ABC1234
                    /([A-Z]{2,4}\s?\d{3,4}[A-Z]?)/i,
                        /([A-Z]{2,4}-\d{3,4}[A-Z]?)/i,
                        /(?:course|code|id)[:\s-]+([A-Z]{2,4}\d{3,4}[A-Z]?)/i
                    ];
                
                for (const pattern of textPatterns) {
                    const match = text.match(pattern);
                    if (match && match[1]) {
                        // Reconstruct code from match groups
                        courseCode = match.slice(1).join('').toUpperCase();
                        break;
                    }
                }
            }
            // After all extraction attempts, add a fallback
            if (!courseCode && courseName) {
                // Try to extract from course name
                const codeMatch = courseName.match(/([A-Z]{2,4}\s?\d{3,4}[A-Z]?)/);
                if (codeMatch) {
                    courseCode = codeMatch[1].replace(/\s+/, '').toUpperCase();
                }
            }

            // Extract deadlines with more comprehensive selectors
            const deadlines = [];
            const deadlineSelectors = [
                '.d2l-activity-deadline', 
                '[data-testid="activity-deadline"]',
                '.d2l-date-text', 
                '.d2l-datetime'
            ];
            
            deadlineSelectors.forEach(selector => {
                element.querySelectorAll(selector).forEach(el => {
                    const text = el.textContent.trim();
                    if (text) deadlines.push(text);
                });
            });

            return {
                name: courseName,
                code: courseCode,
                url: courseUrl,
                deadlines: deadlines,
                elementIndex: index,
                courseId: courseId
            };
        }
        
        
         try {
            console.log('Scraper: Executing focused Brightspace scraper...');
            
            // Wait for courses to load
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    document.addEventListener('DOMContentLoaded', resolve);
                    setTimeout(resolve, 3000);
                }
            });
            
            // Find course containers
            const commonContainers = [
                '#d2l_my_courses_widget',
                '.d2l-my-courses-container',
                '.d2l-course-widget',
                '#course-widget',
                'd2l-my-courses',
                'd2l-course-tile-grid',
                '.d2l-course-homepage',
                '.d2l-course-list' 
            ];
            
            let courseElements = [];
            
            for (const containerSelector of commonContainers) {
                const container = document.querySelector(containerSelector);
                if (container) {
                    console.log(`Found course container: ${containerSelector}`);
                    courseElements = Array.from(container.querySelectorAll(
                        '[data-testid="course-tile"], .d2l-course-tile, .d2l-enrollment-card'
                    ));
                    break;
                }
            }
            
            // Search whole document if no container found
            if (courseElements.length === 0) {
                console.log('No course container found, searching entire document');
                const courseSelectors = [
                    '[data-testid="course-tile"]',
                    '.d2l-course-tile',
                    '.d2l-enrollment-card',
                    '.d2l-course-card',
                    '.course-tile',
                    '.d2l-my-courses-course-name',
                    '.d2l-course-link',
                    'd2l-enrollment-card', 
                    'd2l-course-tile' 
                ];
                
                for (const selector of courseSelectors) {
                    const elements = Array.from(document.querySelectorAll(selector));
                    courseElements = courseElements.concat(elements);
                }
            }
            
            console.log(`Found ${courseElements.length} potential course tiles`);
            
            // Process all course elements
            const courses = [];
            courseElements.forEach((element, index) => {
                try {
                    const courseData = extractCourseInfo(element, index);
                    if (courseData) {
                        console.log(`Found course: ${courseData.name}`);
                        courses.push(courseData);
                    }
                } catch (error) {
                    console.warn(`Error processing element ${index}:`, error);
                }
            });
        
            // Filter out invalid courses
            const validCourses = courses.filter(course => 
                course && 
                course.courseId && 
                course.courseId.trim() !== '' &&  // Ensure non-empty course ID
                course.name && 
                course.name.trim().length > 3 &&
                !course.name.match(/CDATA|function|javascript:/i)
            );
            // detailed logging for validation failures
            const invalidCourses = courses.filter(course => 
                !course ||
                !course.courseId || 
                course.courseId.trim() === '' || 
                !course.name || 
                course.name.trim().length <= 3 ||
                course.name.match(/CDATA|function|javascript:/i)
            );
            console.log(`Found ${invalidCourses.length} invalid courses`);
            invalidCourses.forEach((course, index) => {
                console.log(`Invalid course #${index + 1}:`, course);
                if (!course.courseId || course.courseId.trim() === '') {
                    console.log('  Reason: Missing course ID');
                }
                if (!course.name || course.name.trim().length <= 3) {
                    console.log('  Reason: Invalid course name');
                }
                if (course.name.match(/CDATA|function|javascript:/i)) {
                    console.log('  Reason: Invalid name pattern');
                }
            });

            // Fallback if no courses found
            if (validCourses.length === 0) {
                console.log('No courses found with selectors, trying fallback method...');
                const allElements = document.querySelectorAll('*');
                const possibleCourses = [];
                
                allElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text.length > 20 && text.length < 200 && 
                        !text.match(/CDATA|function|javascript:|loading|copyright|do not remove|bienvenue|welcome|service|support|©|d21|flex|scroll|body|footer|head|html|script/i) &&
                        text.match(/(course|class|subject|module)/i)) {
                        possibleCourses.push(el);
                    }
                });
                
                console.log(`Found ${possibleCourses.length} possible course elements`);
                
                possibleCourses.forEach((element, index) => {
                    try {
                        const courseData = extractCourseInfo(element, index);
                        if (courseData) {
                            console.log(`Found course via fallback: ${courseData.name}`);
                            validCourses.push(courseData);
                        }
                    } catch (error) {
                        console.warn(`Error processing fallback element ${index}:`, error);
                    }
                });
            }
            
            return { 
                success: true, 
                courses: validCourses,
                timestamp: Date.now(),
                url: window.location.href
            };
            
        } catch (error) {
            console.error('Scraper error:', error);
            return { success: false, error: error.message };
        }
        
    };
}
// Main Background Script Class
class StudySyncBackground {
    constructor() {
        this.brightspaceBaseUrl = 'https://uottawa.brightspace.com';
        this.sessionData = null;
        this.deadlineProcessor = new DeadlineProcessor();
        this.changeDetector = new ChangeDetector();
        this.syncIntervalMinutes = 60;
        this.init();
    }

    init() {
        console.log('StudySync Enhanced Background v3.0 - Starting...');
        
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

        // Load session data on startup
        this.loadSessionData();

        console.log('StudySync Enhanced Background - Ready!');
    }

    async loadSessionData() {
        try {
            const result = await chrome.storage.local.get(['brightspaceSession']);
            if (result.brightspaceSession) {
                this.sessionData = result.brightspaceSession;
                console.log('Loaded existing Brightspace session data');
            }
        } catch (error) {
            console.error('Error loading session data:', error);
        }
    }

    async saveSessionData(sessionData) {
        try {
            this.sessionData = {
                ...sessionData,
                lastUpdated: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            };
            
            await chrome.storage.local.set({ 
                brightspaceSession: this.sessionData 
            });
            
            console.log('Saved Brightspace session data securely');
        } catch (error) {
            console.error('Error saving session data:', error);
        }
    }

    isSessionValid() {
        if (!this.sessionData) return false;
        if (Date.now() > this.sessionData.expiresAt) {
            console.log('Session expired, clearing data');
            this.clearSessionData();
            return false;
        }
        return true;
    }

    async clearSessionData() {
        try {
            this.sessionData = null;
            await chrome.storage.local.remove(['brightspaceSession']);
            console.log('Cleared expired session data');
        } catch (error) {
            console.error('Error clearing session data:', error);
        }
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            console.log('Background received message:', request.action);
            
            switch (request.action) {
                case 'authenticate':
                    await this.handleAuthentication(sendResponse);
                    break;
                
                case 'scrapeBrightspace':
                    await this.handleBrightspaceScraping(sendResponse);
                    break;
                
                case 'validateSession':
                    sendResponse({ success: true, valid: this.isSessionValid() });
                    break;
                
                case 'clearSession':
                    await this.clearSessionData();
                    sendResponse({ success: true });
                    break;
                
                default:
                    console.log('Unknown action:', request.action);
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
                        console.error('Auth error:', chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            if (!token) {
                throw new Error('Failed to get authentication token');
            }

            console.log('Got auth token, fetching user info...');

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
            console.log('Waiting for dynamic content to load...');
            await new Promise(resolve => setTimeout(resolve, 500));
            const brightspaceTab = await this.findOrCreateBrightspaceTab();

            if (!brightspaceTab) {
                throw new Error('Could not access Brightspace. Please log in first.');
            }

            // Try scraping up to 3 times with delays
            let scrapedData;
            for (let attempt = 1; attempt <= 5; attempt++) {
                console.log(`Scraping attempt ${attempt}...`);
                const results = await chrome.scripting.executeScript({
                    target: { tabId: brightspaceTab.id },
                    func: getbrightspaceScraperFunction()
                });

                if (results && results[0] && results[0].result) {
                    scrapedData = results[0].result;
                    if (scrapedData.success && scrapedData.courses.length > 0) {
                        break; // Exit loop if we got courses
                    }
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                // Add check for specific Brightspace element
                const isLoaded = await chrome.scripting.executeScript({
                    target: { tabId: brightspaceTab.id },
                    func: () => {
                        return !!document.querySelector('d2l-navigation') || 
                            !!document.querySelector('d2l-course-tile-grid') ||
                            document.title.includes('Brightspace') ||
                            window.location.href.includes('brightspace');
                    }
                });      

                if (!isLoaded[0].result) {
                    throw new Error('Brightspace did not load properly');
                }
            }

            if (!scrapedData || !scrapedData.success) {
                throw new Error(scrapedData?.error || 'Scraping failed after 3 attempts');
            }

            console.log(`Successfully scraped ${scrapedData.courses.length} courses`);

            console.log('Raw course data:', scrapedData.courses);

            // Process deadlines for each course
            for (const course of scrapedData.courses) {
                if (course.deadlines && course.deadlines.length > 0) {
                    const processedDeadlines = this.deadlineProcessor.processDeadlines(course.deadlines);
                    course.deadlines = processedDeadlines;
                    console.log(`Processed course: ${course.name} (ID: ${course.courseId})`);
                    console.log('  Code:', course.code);
                    console.log('  URL:', course.url);
                    console.log('  Deadlines:', processedDeadlines);
                }
            }

            // Save scraped data for future use
            await this.saveScrapedData(scrapedData.courses);
            
            sendResponse({ 
                success: true, 
                courses: scrapedData.courses,
                scrapedAt: Date.now(),
                sessionValid: this.isSessionValid()
            });

        } catch (error) {
            console.error('Brightspace scraping error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    
    async findOrCreateBrightspaceTab() {
        try {
            console.log('[Tab] Finding or creating Brightspace tab...');
            const targetUrl = `${this.brightspaceBaseUrl}/d2l/home`;
            
            // Find existing Brightspace tab
            const tabs = await chrome.tabs.query({url: '*://*.brightspace.com/*'});
            let brightspaceTab = tabs.find(tab => 
                tab.url && (
                    tab.url.includes(this.brightspaceBaseUrl) ||
                    tab.url.includes('brightspace.uottawa.ca')
                )
            );

            // Check if tab is already at target URL
            if (brightspaceTab && brightspaceTab.url.includes(targetUrl)) {
                console.log(`[Tab] Existing tab ${brightspaceTab.id} is already at Brightspace home`);
                await chrome.tabs.update(brightspaceTab.id, {active: true});
                await chrome.windows.update(brightspaceTab.windowId, {focused: true});
                return brightspaceTab;
            }

            if (brightspaceTab) {
                console.log(`[Tab] Found existing tab ${brightspaceTab.id}, updating...`);
                await chrome.tabs.update(brightspaceTab.id, { 
                    url: targetUrl,
                    active: true
                });
            } else {
                console.log('[Tab] Creating new tab...');
                brightspaceTab = await chrome.tabs.create({ 
                    url: targetUrl,
                    active: true
                });
            }

            // Wait for navigation to complete only if we changed the URL
            console.log('[Tab] Waiting for navigation to complete...');
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === brightspaceTab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
            // Verify we're on Brightspace with retries
            console.log('[Tab] Verifying Brightspace page...');
            let attempts = 0;
            while (attempts < 5) {
                const [isBrightspace, isLoginPage] = await Promise.all([
                    chrome.scripting.executeScript({
                        target: { tabId: brightspaceTab.id },
                        func: () => {
                            // Multiple Brightspace indicators
                            return !!document.querySelector('d2l-navigation') || 
                                !!document.querySelector('d2l-course-tile-grid') ||
                                document.title.includes('Brightspace') ||
                                window.location.href.includes('brightspace');
                        }
                    }),
                    chrome.scripting.executeScript({
                        target: { tabId: brightspaceTab.id },
                        func: () => {
                            // Comprehensive login detection
                            return window.location.href.includes('login') || 
                                !!document.querySelector('#password') ||
                                !!document.querySelector('input[type="password"]') ||
                                !!document.querySelector('[data-testid="login-button"]') ||
                                window.location.href.includes('login.microsoftonline.com') ||
                                !!document.querySelector('input[name="passwd"]');
                        }
                    })
                ]);

                if (isLoginPage[0].result) {
                    console.log('[Tab] Detected login page');
                    throw new Error('Please log in to Brightspace first');
                }

                if (isBrightspace[0].result) {
                    console.log('[Tab] Verified Brightspace page');
                    return brightspaceTab;
                }

                console.log(`[Tab] Brightspace not detected, retrying... (${attempts + 1}/5)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
            }

            throw new Error('Could not verify Brightspace page after loading');
        } catch (error) {
            console.error('Tab error:', error);
            throw new Error('Could not access Brightspace. Please log in first.');
        }
    }

    async waitForPageLoad(tabId, maxWait = 30000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkLoad = async () => {
                if (Date.now() - startTime > maxWait) {
                    reject(new Error('Page load timeout'));
                    return;
                }

                try {
                    // Use the promise-based tabs.get API
                    const tab = await chrome.tabs.get(tabId);
                    
                    if (tab.status === 'complete') {
                        // Additional check for DOM readiness
                        const isReady = await chrome.scripting.executeScript({
                            target: { tabId },
                            func: () => document.readyState === 'complete'
                        });
                        
                        if (isReady[0].result) {
                            resolve();
                        } else {
                            setTimeout(checkLoad, 500);
                        }
                    } else {
                        setTimeout(checkLoad, 500);
                    }
                } catch (error) {
                    reject(error);
                }
            };

            checkLoad();
        });
    }

    async saveScrapedData(courses) {
        try {
            await chrome.storage.local.set({ scrapedCourses: courses });
            console.log(`Saved ${courses.length} courses to local storage.`);
        } catch (error) {
            console.error('Error saving scraped data:', error);
        }
    }

    async handleAlarm(alarm) {
        if (alarm.name.startsWith('study_reminder_')) {
            const reminderId = alarm.name.replace('study_reminder_', 'reminder_');
            const result = await chrome.storage.local.get([reminderId]);
            const reminderData = result[reminderId];

            if (reminderData) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/ExtensionLogo.png',
                    title: 'Study Reminder',
                    message: reminderData.message || 'Time to study!',
                    priority: 2
                });
                await chrome.storage.local.remove([reminderId]);
            }
        }
    }

    handleInstallation(details) {
        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
            console.log('StudySync Enhanced installed: initial setup');
        } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
            console.log('StudySync Enhanced updated');
        }
    }


}

// Initialize the background script
console.log('Initializing StudySync Background...');
new StudySyncBackground();

chrome.storage.local.get(['scrapedCourses'], (result) => {
    console.log('Stored courses:', result.scrapedCourses);
});