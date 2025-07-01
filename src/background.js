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
        return rawDeadlines.map(d => this.normalizeDeadline(d));

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
                    handleAuthentication()
                        .then(session => this.saveSessionData(session))
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error }));
                    return true; // Keep the message channel open for async response
                
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
            const tab = await this.findOrCreateBrightspaceTab();
            
            if (!this.isSessionValid()) {
                sendResponse({ 
                    success: false, 
                    error: "Session expired - reauthenticate first"
                });
                return;
            }

            let scrapedData;
            let success = false;
        
            // Inject MutationObserver to detect when Brightspace components are fully loaded
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Set a flag in the window object to track if we've already set up the observer
                    if (window._studySyncObserverSetup) return;
                    window._studySyncObserverSetup = true;
                    
                    // Set up a flag to track when components are loaded
                    window._brightspaceComponentsLoaded = false;
                    
                    // Create a MutationObserver to watch for Brightspace components
                    const observer = new MutationObserver((mutations) => {
                        for (const mutation of mutations) {
                            if (mutation.addedNodes && mutation.addedNodes.length) {
                                for (const node of mutation.addedNodes) {
                                    if (node.nodeType === Node.ELEMENT_NODE) {
                                        // Check if any of the target elements are added
                                        if (
                                            node.tagName && (
                                                node.tagName.toLowerCase().includes('d2l-') ||
                                                node.classList && Array.from(node.classList).some(c => c.includes('d2l-'))
                                            )
                                        ) {
                                            // If we find a D2L component, mark as loaded after a short delay
                                            // to allow for any child components to initialize
                                            setTimeout(() => {
                                                window._brightspaceComponentsLoaded = true;
                                                console.log('Brightspace components detected as loaded');
                                            }, 2000);
                                        }
                                    }
                                }
                            }
                        }
                    });
                    
                    // Start observing the document with the configured parameters
                    observer.observe(document.body, { childList: true, subtree: true });
                    
                    // Set a timeout to mark as loaded after 15 seconds even if we don't detect components
                    // This is a fallback in case our detection logic fails
                    setTimeout(() => {
                        window._brightspaceComponentsLoaded = true;
                        console.log('Brightspace components marked as loaded (timeout)');
                    }, 15000);
                }
            });
            
            // Wait for components to be loaded with a timeout
            for (let attempt = 1; attempt <= 15; attempt++) {
                try {
                    // Check if components are loaded
                    const componentsLoaded = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            return {
                                componentsLoaded: window._brightspaceComponentsLoaded === true,
                                readyState: document.readyState,
                                hasD2LElements: !!document.querySelector('[class*="d2l-"]') || 
                                                !!document.querySelector('d2l-navigation') || 
                                                !!document.querySelector('d2l-enrollment-card') ||
                                                !!document.querySelector('d2l-card')
                            };
                        }
                    });
                    
                    console.log(`Attempt ${attempt}: Component status:`, componentsLoaded[0].result);
                    
                    if (componentsLoaded[0].result.componentsLoaded || 
                        (componentsLoaded[0].result.readyState === 'complete' && 
                         componentsLoaded[0].result.hasD2LElements)) {
                        console.log('Brightspace components detected as loaded, proceeding with scraping');
                        break;
                    }
                    
                    // Check if we're on a login page
                    const isLoginPage = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => !!document.querySelector('input[type="password"]')
                    });

                    if (isLoginPage[0].result) {
                        throw new Error('Login required - session expired');
                    }

                    console.log(`Attempt ${attempt}: Waiting for Brightspace components to load...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Attempt ${attempt} failed:`, error);
                    if (error.message.includes('Login required')) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }

            // Execute scraping with improved Shadow DOM traversal
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: getbrightspaceScraperFunction()
                    });

                    if (results[0]?.result?.success) {
                        scrapedData = results[0].result;
                        success = true;
                        break;
                    } else {
                        console.log(`Attempt ${attempt}: Scraping returned no data, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
                    }
                } catch (error) {
                    console.error(`Scraping attempt ${attempt} failed:`, error);
                    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
                }
            }

            if (!success) {
                const pageState = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => ({
                        readyState: document.readyState,
                        title: document.title,
                        hasNav: !!document.querySelector('d2l-navigation'),
                        hasCards: !!document.querySelector('d2l-enrollment-card'),
                        bodyText: document.body.innerText.substring(0, 100)
                    })
                });
                console.error('Scraping failed with page state:', pageState[0].result);
                throw new Error(`Scraping failed after 5 attempts. Page state: ${JSON.stringify(pageState[0].result)}`);
            }

            console.log(`Successfully scraped ${scrapedData.courses.length} courses`);
        
            // Process deadlines for each course
            for (const course of scrapedData.courses) {
                const processedDeadlines = this.deadlineProcessor.processDeadlines(course.deadlines);
                course.deadlines = processedDeadlines;
                
                const changes = await this.changeDetector.detectChanges(
                    course.courseId, 
                    processedDeadlines
                );
                console.log(`Processed course: ${course.name}`);
            }
            
            // Save and respond ONCE
            await this.saveScrapedData(scrapedData.courses);
            
            sendResponse({ 
                success: true, 
                courses: scrapedData.courses,
                scrapedAt: Date.now(),
                sessionValid: this.isSessionValid()
            });

        } catch (error) {
            console.error('Scraping failed:', error);
            sendResponse({ 
                success: false, 
                error: error.message 
            });
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
                      // Force reload to ensure we're not on an org page
                await chrome.tabs.reload(brightspaceTab.id);
                await this.waitForPageLoad(brightspaceTab.id);
                
                // Verify we're on student view
                const isStudentView = await chrome.scripting.executeScript({
                    target: { tabId: brightspaceTab.id },
                    func: () => !document.body.innerText.includes('Org | University')
                });
                
                if (isStudentView[0].result) {
                    console.log(`[Tab] Existing tab ${brightspaceTab.id} is on student dashboard`);
                    await chrome.tabs.update(brightspaceTab.id, {active: true});
                    await chrome.windows.update(brightspaceTab.windowId, {focused: true});
                    return brightspaceTab;
                }
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

                    // Wait for page to load with a more robust approach
            await this.waitForPageLoad(brightspaceTab.id, 30000);
            
            // Additional wait to ensure JavaScript frameworks initialize
            await new Promise(resolve => setTimeout(resolve, 3000));
            
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
            let timeout;
            
            // Set a timeout to avoid waiting indefinitely
            if (maxWait) {
                timeout = setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(); // Resolve anyway after timeout
                }, maxWait);
            }
            
            const listener = (changedTabId, changeInfo) => {
                if (changedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    if (timeout) clearTimeout(timeout);
                    
                    // Add a small delay to allow for JavaScript frameworks to initialize
                    setTimeout(resolve, 1000);
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
            
            // Check if the page is already complete
            chrome.tabs.get(tabId, (tab) => {
                if (tab.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    if (timeout) clearTimeout(timeout);
                    setTimeout(resolve, 1000);
                }
            });
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

function getbrightspaceScraperFunction() {
    return async function() {
        // Helper function to recursively traverse shadow DOM
        function traverseShadowDOM(root, selector) {
            console.log(`traverseShadowDOM: Searching for '${selector}' in`, root);
            if (!root || !root.querySelector) {
                console.log('traverseShadowDOM: Invalid root provided.');
                return [];
            }
            
            // Find all matching elements in the current root
            const elements = Array.from(root.querySelectorAll(selector));
            console.log(`traverseShadowDOM: Found ${elements.length} direct matches for '${selector}'.`);
            
            // Find all elements with shadow roots
            const elementsWithShadowRoots = Array.from(root.querySelectorAll("*"))
                .filter(el => el.shadowRoot);
            console.log(`traverseShadowDOM: Found ${elementsWithShadowRoots.length} elements with shadow roots.`);
            
            // Recursively search in each shadow root
            for (const el of elementsWithShadowRoots) {
                console.log('traverseShadowDOM: Recursing into shadow root of', el.tagName);
                elements.push(...traverseShadowDOM(el.shadowRoot, selector));
            }
            
            return elements;
        }
        
        // Helper function to get text content from shadow DOM
        function getTextFromShadowDOM(element, selector) {
            console.log(`getTextFromShadowDOM: Searching for '${selector}' in element.shadowRoot`);
            if (!element || !element.shadowRoot) {
                console.warn('getTextFromShadowDOM: Invalid element or no shadowRoot.');
                return '';
            }
            
            const targetElement = element.shadowRoot.querySelector(selector);
            console.log(`getTextFromShadowDOM: Target element found: ${!!targetElement}`);
            return targetElement ? targetElement.textContent.trim() : '';
        }
        
        // Improved function to extract course info from enrollment cards
        function extractCourseInfoFromShadowDOM(element, index) {
            console.log(`extractCourseInfoFromShadowDOM: Processing element ${index}`);
            try {
                // 1. Access the shadow root of the d2l-enrollment-card
                const outerShadowRoot = element.shadowRoot;
                if (!outerShadowRoot) {
                    console.warn(`Element ${index} has no outer shadow root.`);
                    return null;
                }
                console.log(`extractCourseInfoFromShadowDOM: Element ${index} has outer shadow root.`);

                // 2. Find the d2l-card within the outer shadow root
                const d2lCard = outerShadowRoot.querySelector("d2l-card");
                if (!d2lCard) {
                    console.warn(`Element ${index} has no d2l-card in outer shadow root.`);
                    return null;
                }
                console.log(`extractCourseInfoFromShadowDOM: Element ${index} has d2l-card.`);

                // 3. Access the shadow root of the d2l-card
                const innerShadowRoot = d2lCard.shadowRoot;
                if (!innerShadowRoot) {
                    console.warn(`Element ${index} has no inner shadow root for d2l-card.`);
                    return null;
                }
                console.log(`extractCourseInfoFromShadowDOM: Element ${index} has inner shadow root.`);

                // 4. Extract course name, URL, and ID from the inner shadow root
                let courseName = '';
                let courseUrl = '';
                let courseId = '';
                let courseCode = '';
                const deadlines = [];

                // Try multiple selectors for the course link
                const linkSelectors = [
                    'a[href*="/d2l/home/"]',
                    'd2l-link[href*="/d2l/home/"]',
                    '.d2l-card-link',
                    '[class*="d2l-card-link"]',
                    'a'
                ];
                
                let linkElement = null;
                for (const selector of linkSelectors) {
                    linkElement = innerShadowRoot.querySelector(selector);
                    if (linkElement) {
                        console.log(`extractCourseInfoFromShadowDOM: Found link element with selector: ${selector}`);
                        break;
                    }
                }

                if (linkElement) {
                    courseName = linkElement.textContent.trim();
                    courseUrl = linkElement.href;
                    console.log(`extractCourseInfoFromShadowDOM: Course Name: ${courseName}, URL: ${courseUrl}`);

                    // Extract course ID from URL
                    const idMatch = courseUrl.match(/\/d2l\/home\/(\d+)/);
                    if (idMatch) {
                        courseId = idMatch[1];
                        console.log(`extractCourseInfoFromShadowDOM: Course ID: ${courseId}`);
                    }

                    // Attempt to extract course code from the name using multiple patterns
                    const codePatterns = [
                        /([A-Z]{2,4}\s?\d{3,4}[A-Z]?)/i,  // Standard format like CSI3140
                        /([A-Z]{2,4}[-\s]?\d{3,4}[-\s]?[A-Z0-9]?)/i,  // With dash or space
                        /([A-Z]{2,4}\d{3,4}[A-Z]?)/i  // No space like CSI3140
                    ];
                    
                    for (const pattern of codePatterns) {
                        const codeMatch = courseName.match(pattern);
                        if (codeMatch) {
                            courseCode = codeMatch[1].replace(/\s+|-/g, '').toUpperCase();
                            console.log(`extractCourseInfoFromShadowDOM: Course Code from name: ${courseCode}`);
                            break;
                        }
                    }
                    
                    // If no code found in name, try looking for it in other elements
                    if (!courseCode) {
                        console.log('extractCourseInfoFromShadowDOM: No course code found in name, checking other elements.');
                        // Look for course code in other elements within the card
                        const possibleCodeElements = [
                            ...innerShadowRoot.querySelectorAll('.d2l-card-text'),
                            ...innerShadowRoot.querySelectorAll('.d2l-enrollment-card-code'),
                            ...innerShadowRoot.querySelectorAll('[class*="code"]'),
                            ...innerShadowRoot.querySelectorAll('[class*="course-code"]')
                        ];
                        
                        for (const el of possibleCodeElements) {
                            const text = el.textContent.trim();
                            for (const pattern of codePatterns) {
                                const codeMatch = text.match(pattern);
                                if (codeMatch) {
                                    courseCode = codeMatch[1].replace(/\s+|-/g, '').toUpperCase();
                                    console.log(`extractCourseInfoFromShadowDOM: Course Code from other element: ${courseCode}`);
                                    break;
                                }
                            }
                            if (courseCode) break;
                        }
                    }
                } else {
                    console.warn(`Element ${index}: Could not find course link in inner shadow root.`);
                    return null;
                }

                // Extract deadlines using recursive shadow DOM traversal
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

                // Search for deadlines in both the outer and inner shadow roots
                for (const selector of deadlineSelectors) {
                    // Check in outer shadow root
                    outerShadowRoot.querySelectorAll(selector).forEach(el => {
                        const text = el.textContent.trim();
                        if (text) deadlines.push(text);
                    });
                    
                    // Check in inner shadow root
                    innerShadowRoot.querySelectorAll(selector).forEach(el => {
                        const text = el.textContent.trim();
                        if (text) deadlines.push(text);
                    });
                    
                    // Use recursive traversal to find deadlines in nested shadow DOMs
                    const nestedDeadlineElements = traverseShadowDOM(element, selector);
                    nestedDeadlineElements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text) deadlines.push(text);
                    });
                }
                console.log(`extractCourseInfoFromShadowDOM: Found ${deadlines.length} deadlines.`);

                // Basic validation
                if (!courseName || courseName.trim().length < 3 || !courseUrl) {
                    console.warn(`Element ${index}: Incomplete course data - Name: ${courseName}, URL: ${courseUrl}, ID: ${courseId}`);
                    return null;
                }

                return {
                    name: courseName,
                    code: courseCode || 'Unknown',
                    url: courseUrl,
                    deadlines: deadlines,
                    elementIndex: index,
                    courseId: courseId || `unknown_${index}`
                };

            } catch (error) {
                console.error(`Error in extractCourseInfoFromShadowDOM for element ${index}:`, error);
                return null;
            }
        }

        try {
            console.log('Scraper: Executing Brightspace scraper with improved Shadow DOM traversal...');
            
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
            console.log('Scraper: Attempt 1: Looking for d2l-my-courses-grid directly...');
            const directGrid = document.querySelector('d2l-my-courses-grid');
            if (directGrid) {
                foundContainerRoot = directGrid.shadowRoot || directGrid;
                console.log(`Scraper: Found d2l-my-courses-grid directly. Has shadowRoot: ${!!directGrid.shadowRoot}`);
            }

            // Attempt 2: Iterate through all d2l-tab-panel elements
            if (!foundContainerRoot) {
                console.log('Scraper: Attempt 2: d2l-my-courses-grid not found directly. Checking d2l-tab-panels...');
                const tabPanels = document.querySelectorAll('d2l-tab-panel');
                console.log(`Scraper: Found ${tabPanels.length} d2l-tab-panel elements.`);
                for (const panel of tabPanels) {
                    let currentSearchRoot = panel.shadowRoot || panel;
                    console.log(`Scraper: Checking d2l-tab-panel (id: ${panel.id || 'N/A'}). Has shadowRoot: ${!!panel.shadowRoot}`);
                    
                    const gridInPanel = currentSearchRoot.querySelector('d2l-my-courses-grid');
                    if (gridInPanel) {
                        foundContainerRoot = gridInPanel.shadowRoot || gridInPanel;
                        console.log(`Scraper: Found d2l-my-courses-grid within d2l-tab-panel (id: ${panel.id || 'N/A'}). Has shadowRoot: ${!!gridInPanel.shadowRoot}`);
                        break;
                    }
                }
            }

            // Attempt 3: Look for d2l-my-courses-content (parent of grid)
            if (!foundContainerRoot) {
                console.log('Scraper: Attempt 3: Still no container. Looking for d2l-my-courses-content...');
                const directContent = document.querySelector('d2l-my-courses-content');
                if (directContent) {
                    foundContainerRoot = directContent.shadowRoot || directContent;
                    console.log(`Scraper: Found d2l-my-courses-content directly. Has shadowRoot: ${!!directContent.shadowRoot}`);
                }
            }

            // Attempt 4: Look for d2l-my-courses (a common top-level component)
            if (!foundContainerRoot) {
                console.log('Scraper: Attempt 4: Still no container. Looking for d2l-my-courses...');
                const myCoursesComponent = document.querySelector('d2l-my-courses');
                if (myCoursesComponent) {
                    foundContainerRoot = myCoursesComponent.shadowRoot || myCoursesComponent;
                    console.log(`Scraper: Found d2l-my-courses directly. Has shadowRoot: ${!!myCoursesComponent.shadowRoot}`);
                    // If d2l-my-courses has a shadow root, it might contain the grid or content directly
                    if (myCoursesComponent.shadowRoot) {
                        const gridInsideMyCourses = myCoursesComponent.shadowRoot.querySelector('d2l-my-courses-grid');
                        if (gridInsideMyCourses) {
                            foundContainerRoot = gridInsideMyCourses.shadowRoot || gridInsideMyCourses;
                            console.log(`Scraper: Found d2l-my-courses-grid inside d2l-my-courses shadowRoot. Has shadowRoot: ${!!gridInsideMyCourses.shadowRoot}`);
                        } else {
                            const contentInsideMyCourses = myCoursesComponent.shadowRoot.querySelector('d2l-my-courses-content');
                            if (contentInsideMyCourses) {
                                foundContainerRoot = contentInsideMyCourses.shadowRoot || contentInsideMyCourses;
                                console.log(`Scraper: Found d2l-my-courses-content inside d2l-my-courses shadowRoot. Has shadowRoot: ${!!contentInsideMyCourses.shadowRoot}`);
                            }
                        }
                    }
                }
            }

            // Attempt 5: Look for d2l-enrollment-set-search-results (another possible container)
            if (!foundContainerRoot) {
                console.log('Scraper: Attempt 5: Still no container. Looking for d2l-enrollment-set-search-results...');
                const searchResults = document.querySelector('d2l-enrollment-set-search-results');
                if (searchResults) {
                    foundContainerRoot = searchResults.shadowRoot || searchResults;
                    console.log(`Scraper: Found d2l-enrollment-set-search-results directly. Has shadowRoot: ${!!searchResults.shadowRoot}`);
                }
            }

            // Attempt 6: Look for d2l-my-courses-container (another possible container)
            if (!foundContainerRoot) {
                console.log('Scraper: Attempt 6: Still no container. Looking for d2l-my-courses-container...');
                const container = document.querySelector('d2l-my-courses-container');
                if (container) {
                    foundContainerRoot = container.shadowRoot || container;
                    console.log(`Scraper: Found d2l-my-courses-container directly. Has shadowRoot: ${!!container.shadowRoot}`);
                }
            }

            // Final step: Query for d2l-enrollment-card within the found container root
            if (foundContainerRoot) {
                console.log('Scraper: Attempting to query for d2l-enrollment-card within found container root.');
                courseElements = Array.from(foundContainerRoot.querySelectorAll('d2l-enrollment-card'));
                console.log(`Scraper: Found ${courseElements.length} d2l-enrollment-card elements within the identified container root.`);
                
                // If no enrollment cards found directly, try recursive traversal
                if (courseElements.length === 0) {
                    console.log('Scraper: No enrollment cards found directly in container. Trying recursive traversal...');
                    courseElements = traverseShadowDOM(foundContainerRoot, 'd2l-enrollment-card');
                    console.log(`Scraper: Found ${courseElements.length} d2l-enrollment-card elements with recursive traversal.`);
                }
            }
            
            // If still no course elements found, try a document-wide recursive search
            if (!courseElements.length) {
                console.log('Scraper: No enrollment cards found in containers. Trying document-wide recursive traversal...');
                courseElements = traverseShadowDOM(document.body, 'd2l-enrollment-card');
                console.log(`Scraper: Found ${courseElements.length} d2l-enrollment-card elements with document-wide recursive traversal.`);
                
                // If still nothing, try looking for d2l-card elements
                if (!courseElements.length) {
                    console.log('Scraper: No enrollment cards found. Looking for d2l-card elements...');
                    courseElements = traverseShadowDOM(document.body, 'd2l-card');
                    console.log(`Scraper: Found ${courseElements.length} d2l-card elements with document-wide recursive traversal.`);
                }
            }
            
            // Extract current academic term
            let currentTerm = '';
            const termSelectors = [
                '.d2l-dropdown-text',
                '.d2l-selected',
                '.d2l-current-term',
                '.d2l-active-term',
                '.d2l-term-selector'
            ];
            
            for (const selector of termSelectors) {
                const termElement = document.querySelector(selector);
                if (termElement && termElement.textContent) {
                    currentTerm = termElement.textContent.trim();
                    console.log('Scraper: Detected term:', currentTerm);
                    break;
                }
            }

            // Extract term from URL as fallback
            if (!currentTerm) {
                const termMatch = window.location.href.match(/[?&]term=(\w+)/i);
                if (termMatch) {
                    currentTerm = `Term ${termMatch[1]}`;
                }
            }
            
            // Process each course element
            const courses = [];
            console.log(`Scraper: Processing ${courseElements.length} potential course elements.`);
            for (let i = 0; i < courseElements.length; i++) {
                const element = courseElements[i];
                // This function already handles the nested shadow roots of d2l-enrollment-card and d2l-card
                const courseData = extractCourseInfoFromShadowDOM(element, i); 
                if (courseData) {
                    console.log(`Scraper: Extracted course: ${courseData.name} (ID: ${courseData.courseId})`);
                    courses.push(courseData);
                }
            }
            
            // Add term information to courses
            for (const course of courses) {
                course.term = currentTerm;
                
                // Improved course code extraction
                if (!course.code) {
                    const codePattern = /([A-Z]{2,4}\s?\d{3,4}[A-Z]?)/i;
                    const codeMatch = course.name.match(codePattern);
                    if (codeMatch) {
                        course.code = codeMatch[1].replace(/\s/g, '').toUpperCase();
                    }
                }
            }
            
            console.log(`Scraper: Final course count: ${courses.length}`);
            
            return {
                success: courses.length > 0,
                courses: courses,
                currentTerm: currentTerm,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('Scraper: Error in Brightspace scraper:', error);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    };
}



async function handleAuthentication() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, async (token) => {
            if (chrome.runtime.lastError || !token) {
                return reject(new Error(chrome.runtime.lastError?.message || 'Token fetch failed'));
            }

            try {
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (userInfoRes.ok) {  // Fixed condition - check for success
                    const userInfo = await userInfoRes.json();
                    
                    return resolve({
                        success: true,
                        token: token,
                        user: {
                            name: userInfo.name,
                            email: userInfo.email,
                            picture: userInfo.picture,
                            id: userInfo.sub
                        },
                        lastLogin: Date.now()
                    });
                } else {
                    const errorText = await userInfoRes.text();
                    throw new Error('Failed to fetch user profile: ' + errorText);
                }
            } catch (error) {
                reject(error);
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

chrome.storage.local.get(null, function(data) {
  console.log('All stored data:', data);
});

