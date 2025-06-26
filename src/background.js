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
        function extractCourseInfoFromShadowDOM(element, index) {
            try {
                // 1. Access the shadow root of the d2l-enrollment-card
                const outerShadowRoot = element.shadowRoot;
                if (!outerShadowRoot) {
                    console.warn(`Element ${index} has no outer shadow root.`);
                    return null;
                }

                // 2. Find the d2l-card within the outer shadow root
                const d2lCard = outerShadowRoot.querySelector('d2l-card');
                if (!d2lCard) {
                    console.warn(`Element ${index} has no d2l-card in outer shadow root.`);
                    return null;
                }

                // 3. Access the shadow root of the d2l-card
                const innerShadowRoot = d2lCard.shadowRoot;
                if (!innerShadowRoot) {
                    console.warn(`Element ${index} has no inner shadow root for d2l-card.`);
                    return null;
                }

                // 4. Extract course name, URL, and ID from the inner shadow root
                let courseName = '';
                let courseUrl = '';
                let courseId = '';
                let courseCode = '';
                const deadlines = [];

                // The screenshot shows the course name and link within an <a> tag
                const linkElement = innerShadowRoot.querySelector('a[href*="/d2l/home/"]');
                if (linkElement) {
                    courseName = linkElement.textContent.trim();
                    courseUrl = linkElement.href;

                    // Extract course ID from URL
                    const idMatch = courseUrl.match(/\/d2l\/home\/(\d+)/);
                    if (idMatch) {
                        courseId = idMatch[1];
                    }

                    // Attempt to extract course code from the name (e.g., ADM2320 X00)
                    const codeMatch = courseName.match(/([A-Z]{2,4}\s?\d{3,4}[A-Z]?)/i);
                    if (codeMatch) {
                        courseCode = codeMatch[1].replace(/\s+/, '').toUpperCase();
                    }
                } else {
                    console.warn(`Element ${index}: Could not find course link in inner shadow root.`);
                    return null;
                }

                // Extract deadlines (if any are present within the shadow DOM structure)
                // Based on the screenshot, deadlines might be outside the d2l-card,
                // or in other specific elements within the outer shadow root.
                // We'll look for common deadline patterns within the outer shadow root.
                const deadlineSelectors = [
                    '.d2l-activity-deadline',
                    '[data-testid="activity-deadline"]',
                    '.d2l-date-text',
                    '.d2l-datetime',
                    '[class*="d2l-deadline"]',
                    '[class*="d2l-due-date"]',
                    '.d2l-list-item-content',
                    '.d2l-tile-content'
                ];

                deadlineSelectors.forEach(selector => {
                    outerShadowRoot.querySelectorAll(selector).forEach(el => {
                        const text = el.textContent.trim();
                        if (text) deadlines.push(text);
                    });
                });

                // Basic validation
                if (!courseName || courseName.trim().length < 5 || !courseUrl || !courseId) {
                    console.warn(`Element ${index}: Incomplete course data - Name: ${courseName}, URL: ${courseUrl}, ID: ${courseId}`);
                    return null;
                }

                return {
                    name: courseName,
                    code: courseCode,
                    url: courseUrl,
                    deadlines: deadlines,
                    elementIndex: index,
                    courseId: courseId
                };

            } catch (error) {
                console.error(`Error in extractCourseInfoFromShadowDOM for element ${index}:`, error);
                return null;
            }
        }
        
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

        try {
            console.log('Scraper: Executing Brightspace scraper with robust nested Shadow DOM support...');
            
            // Wait for page to be fully loaded and stable
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    document.addEventListener('DOMContentLoaded', resolve);
                    // Increased timeout for dynamic content and Shadow DOMs to load
                    setTimeout(resolve, 5000); 
                }
            });
            
            let courseElements = [];
            let foundContainerRoot = null; // This will hold the ShadowRoot or Element where d2l-enrollment-cards are found

            // Attempt 1: Find d2l-my-courses-grid directly from the document
            console.log('Attempt 1: Looking for d2l-my-courses-grid directly...');
            const directGrid = document.querySelector('d2l-my-courses-grid');
            if (directGrid) {
                foundContainerRoot = directGrid.shadowRoot || directGrid;
                console.log(`Found d2l-my-courses-grid directly. Has shadowRoot: ${!!directGrid.shadowRoot}`);
            }

            // Attempt 2: Iterate through all d2l-tab-panel elements
            if (!foundContainerRoot) {
                console.log('Attempt 2: d2l-my-courses-grid not found directly. Checking d2l-tab-panels...');
                const tabPanels = document.querySelectorAll('d2l-tab-panel');
                for (const panel of tabPanels) {
                    let currentSearchRoot = panel.shadowRoot || panel;
                    
                    const gridInPanel = currentSearchRoot.querySelector('d2l-my-courses-grid');
                    if (gridInPanel) {
                        foundContainerRoot = gridInPanel.shadowRoot || gridInPanel;
                        console.log(`Found d2l-my-courses-grid within d2l-tab-panel (id: ${panel.id || 'N/A'}). Has shadowRoot: ${!!gridInPanel.shadowRoot}`);
                        break;
                    }
                }
            }

            // Attempt 3: Look for d2l-my-courses-content (parent of grid)
            if (!foundContainerRoot) {
                console.log('Attempt 3: Still no container. Looking for d2l-my-courses-content...');
                const directContent = document.querySelector('d2l-my-courses-content');
                if (directContent) {
                    foundContainerRoot = directContent.shadowRoot || directContent;
                    console.log(`Found d2l-my-courses-content directly. Has shadowRoot: ${!!directContent.shadowRoot}`);
                }
            }

            // Attempt 4: Look for d2l-my-courses (a common top-level component)
            if (!foundContainerRoot) {
                console.log('Attempt 4: Still no container. Looking for d2l-my-courses...');
                const myCoursesComponent = document.querySelector('d2l-my-courses');
                if (myCoursesComponent) {
                    foundContainerRoot = myCoursesComponent.shadowRoot || myCoursesComponent;
                    console.log(`Found d2l-my-courses directly. Has shadowRoot: ${!!myCoursesComponent.shadowRoot}`);
                    // If d2l-my-courses has a shadow root, it might contain the grid or content directly
                    if (myCoursesComponent.shadowRoot) {
                        const gridInsideMyCourses = myCoursesComponent.shadowRoot.querySelector('d2l-my-courses-grid');
                        if (gridInsideMyCourses) {
                            foundContainerRoot = gridInsideMyCourses.shadowRoot || gridInsideMyCourses;
                            console.log(`Found d2l-my-courses-grid inside d2l-my-courses shadowRoot. Has shadowRoot: ${!!gridInsideMyCourses.shadowRoot}`);
                        } else {
                            const contentInsideMyCourses = myCoursesComponent.shadowRoot.querySelector('d2l-my-courses-content');
                            if (contentInsideMyCourses) {
                                foundContainerRoot = contentInsideMyCourses.shadowRoot || contentInsideMyCourses;
                                console.log(`Found d2l-my-courses-content inside d2l-my-courses shadowRoot. Has shadowRoot: ${!!contentInsideMyCourses.shadowRoot}`);
                            }
                        }
                    }
                }
            }


            // Final step: Query for d2l-enrollment-card within the found container root
            if (foundContainerRoot) {
                courseElements = Array.from(foundContainerRoot.querySelectorAll('d2l-enrollment-card'));
                console.log(`Found ${courseElements.length} d2l-enrollment-card elements within the identified container root.`);
            } else {
                console.warn('No suitable container element or shadow root found after all attempts. Falling back to direct document query for d2l-enrollment-card (unlikely to work).');
                courseElements = Array.from(document.querySelectorAll('d2l-enrollment-card'));
            }
            
            const courses = [];
            for (let i = 0; i < courseElements.length; i++) {
                const element = courseElements[i];
                // This function already handles the nested shadow roots of d2l-enrollment-card and d2l-card
                const courseData = extractCourseInfoFromShadowDOM(element, i); 
                if (courseData) {
                    console.log(`Extracted course: ${courseData.name} (ID: ${courseData.courseId})`);
                    courses.push(courseData);
                }
            }
        
            // Process deadlines for each course
            const deadlineProcessor = new DeadlineProcessor();
            for (const course of courses) {
                if (course.deadlines && course.deadlines.length > 0) {
                    course.deadlines = deadlineProcessor.processDeadlines(course.deadlines);
                }
            }

            return { 
                success: true, 
                courses: courses,
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
        setInterval(() => this.checkSession(), 60 * 1000);
        console.log('StudySync Enhanced Background - Ready!');
    }
    async checkSession() {
        const result = await chrome.storage.local.get(['brightspaceSession']);
        if (result.brightspaceSession && Date.now() > result.brightspaceSession.expiresAt) {
            await this.handleLogout();
            this.showToast('Session expired. Please log in again.', 'warning');
        }
    } 

    async loadSessionData() {
        try {
            const result = await chrome.storage.local.get(['brightspaceSession']);
            if (result.brightspaceSession) {
                // Check expiration
                if (Date.now() > result.brightspaceSession.expiresAt) {
                    console.log('Session expired, clearing data');
                    await this.clearSessionData();
                    return;
                }
                
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
                    handleAuthentication().then(sendResponse).catch(error => {
                        console.error('Auth error:', error);
                        sendResponse({ success: false, error: error.message });
                    });
                    break;
                case 'saveSession':
                    await this.saveSessionData(request.sessionData);
                    sendResponse({ success: true });
                    break;
                    
                case 'scrapeBrightspace':
                    await this.handleBrightspaceScraping(sendResponse);
                    break;
                
                case 'validateSession':
                    const isValid = await validateSession();
                    sendResponse({ valid: isValid });
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

async function handleAuthentication() {
    const clientId = '385701813068-h70jb49tbhvcbjusfd652840760clkpg.apps.googleusercontent.com';
    const scopes = ['https://www.googleapis.com/auth/calendar.events', 'profile', 'email'];

    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, async (token) => {
            if (chrome.runtime.lastError || !token) {
                return reject(new Error(chrome.runtime.lastError?.message || 'Token fetch failed'));
            }

            try {
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!userInfoRes.ok) 
                    {
                         const userInfo = await userInfoRes.json();
        
                        return resolve({
                            success: true,
                            token: token,
                            user: {
                                name: userInfo.name,
                                email: userInfo.email,
                                picture: userInfo.picture,
                                id: userInfo.sub
                            }
                        });
                    }
                    const errorText = await userInfoRes.text();
                
            } catch (error) {
                reject(error);
                throw new Error('Failed to fetch user profile: ' + errorText);

            }
        });
    });
}
async function validateSession() {
    const result = await chrome.storage.local.get(['lastLogin']);
    if (!result.lastLogin) return false;
    
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return (Date.now() - result.lastLogin) < twentyFourHours;
}

// Initialize the background script
console.log('Initializing StudySync Background...');
new StudySyncBackground();

chrome.storage.local.get(['scrapedCourses'], (result) => {
    console.log('Stored courses:', result.scrapedCourses);
});

