// StudySync Enhanced - Professional Study Companion
// Version 2.0 - Market-competitive features

class StudySyncApp {
    constructor() {
        this.user = null;
        this.currentTab = 'dashboard';
        this.timer = null;
        this.timerState = {
            isRunning: false,
            isPaused: false,
            currentTime: 25 * 60, // 25 minutes in seconds
            totalTime: 25 * 60,
            mode: 'focus' // focus, short-break, long-break
        };
        this.studyData = {
            todayTime: 0,
            streak: 0,
            goals: { completed: 0, total: 3 },
            courses: [],
            sessions: [],
            analytics: {}
        };
        this.theme = 'light';
        this.sessionDuration = 24 * 60 * 60 * 1000; // Default session duration in seconds
        this.init();

    }

    async init() {
        console.log('StudySync Enhanced v2.0 - Initializing...');
        
        // Load saved data
        await this.loadUserData();
        await this.loadStudyData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize UI
        this.initializeUI();
        
        // Check authentication
        await this.checkAuthStatus();
        await this.checkSession();

        console.log('StudySync Enhanced - Ready!');
        // Start session check interval
        this.sessionCheck = setInterval(() => this.checkSession(), 60000); // Check every minute

    }
    
    async checkSession() {
        const result = await chrome.storage.local.get(['lastLogin']);
        if (result.lastLogin && Date.now() - result.lastLogin > this.sessionDuration) {
            await this.handleLogout();
            this.showToast('Session expired. Please log in again.', 'warning');
        }
    }
    async loadUserData() {
        try {
            const result = await chrome.storage.local.get(['user', 'theme', 'termsAccepted']);
            if (result.user) {
                this.user = result.user;
            }
            if (result.theme) {
                this.theme = result.theme;
                document.documentElement.setAttribute('data-theme', this.theme);
            }
            if (result.termsAccepted) {
                this.termsAccepted = result.termsAccepted;
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadStudyData() {
        try {
            const result = await chrome.storage.local.get(['studyData']);
            if (result.studyData) {
                this.studyData = { ...this.studyData, ...result.studyData };

                if(this.currentTab =='courses'){
                    this.loadCourses();
                }
            }
            this.updateDashboardStats();
            this.updateStudySubjectDropdown(); // Populate dropdown with stored courses
        } catch (error) {
            console.error('Error loading study data:', error);
        }
    }

    async saveStudyData() {
        try {
            await chrome.storage.local.set({ studyData: this.studyData });
        } catch (error) {
            console.error('Error saving study data:', error);
        }
    }

    setupEventListeners() {
        // Authentication
        document.getElementById('google-login-btn')?.addEventListener('click', () => this.handleGoogleLogin());
        document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());

        // Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Theme toggle
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());

        // Timer controls
        document.getElementById('start-timer-btn')?.addEventListener('click', () => this.startTimer());
        document.getElementById('pause-timer-btn')?.addEventListener('click', () => this.pauseTimer());
        document.getElementById('stop-timer-btn')?.addEventListener('click', () => this.stopTimer());

        // Session modes
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                const duration = parseInt(e.currentTarget.dataset.duration);
                this.setTimerMode(mode, duration);
            });
        });

        // Quick actions
        document.getElementById('start-study-btn')?.addEventListener('click', () => {
            this.switchTab('study');
            this.startTimer();
        });
        document.getElementById('sync-brightspace-btn')?.addEventListener('click', () => this.syncBrightspace());
        document.getElementById('sync-courses-btn')?.addEventListener('click', () => this.syncBrightspace());

        // Terms & Conditions
        document.getElementById('agree-checkbox')?.addEventListener('change', (e) => {
            document.getElementById('agree-btn').disabled = !e.target.checked;
        });
        document.getElementById('agree-btn')?.addEventListener('click', () => this.acceptTerms());
        document.getElementById('decline-btn')?.addEventListener('click', () => this.declineTerms());

        // Analytics filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const period = e.currentTarget.dataset.period;
                this.updateAnalytics(period);
            });
        });
    }

    initializeUI() {
        // Set environment info
        const envInfo = document.getElementById('env-info');
        if (envInfo) {
            const extensionId = chrome.runtime.id;
            const isDev = extensionId && extensionId.length < 32;
            envInfo.textContent = isDev ? 'Development' : 'Production';
        }

        // Initialize timer display
        this.updateTimerDisplay();
        
        // Update dashboard
        this.updateDashboardStats();
        
        // Load recent activity
        this.loadRecentActivity();
    }

    async checkAuthStatus() {
        try {
            const result = await chrome.storage.local.get(['user', 'brightspaceSession']);
            
            // Check if session exists and is valid
            if (result.brightspaceSession && Date.now() < result.brightspaceSession.expiresAt) {
                this.user = result.user;
                this.showMainContent();
                
                if (!this.termsAccepted) {
                    this.showTermsModal();
                }
                return;
            }
            
            // Clear expired session
            if (result.brightspaceSession) {
                await chrome.storage.local.remove(['user', 'brightspaceSession']);
            }
            
            this.showLoginSection();
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.showLoginSection();
        }
    }

    async handleGoogleLogin() {
        this.showLoading('Signing in...');
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'authenticate'
            });

            if (response.success) {
                this.user = response.user;
                await chrome.storage.local.set({ 
                    user: this.user,
                    lastLogin: Date.now() // Add last login timestamp
                });
                
                // Show main content immediately after successful login
                this.showMainContent();
                this.hideLoading();
                
                // Show terms if not accepted
                if (!this.termsAccepted) {
                    this.showTermsModal();
                }
                
                this.showToast('Welcome to StudySync!', 'success');
            } else {
                throw new Error(response.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.hideLoading();
            this.showToast('Login failed. Please try again.', 'error');
            this.showLoginSection();
        }
    }

    async handleLogout() {
        try {
            // Clear session data
            await chrome.storage.local.remove(['user', 'lastLogin']);
            this.user = null;
            this.showLoginSection();
            this.showToast('Signed out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Error signing out', 'error');
        }
    }

    showLoginSection() {
        document.getElementById('login-section')?.classList.remove('hidden');
        document.getElementById('main-content')?.classList.add('hidden');
        document.getElementById('user-profile')?.classList.add('hidden');
    }

    showMainContent() {
        const loginSection = document.getElementById('login-section');
        const mainContent = document.getElementById('main-content');
        
        if (loginSection) loginSection.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        
        // Update user info
        if (this.user) {
            const nameEl = document.getElementById('user-name');
            const emailEl = document.getElementById('user-email');
            const avatarEl = document.getElementById('user-avatar');
            
            if (nameEl) nameEl.textContent = this.user.name || 'User';
            if (emailEl) emailEl.textContent = this.user.email || '';
            if (avatarEl && this.user.picture) avatarEl.src = this.user.picture;
        }
    }

    showTermsModal() {
        document.getElementById('terms-modal')?.classList.remove('hidden');
    }

    hideTermsModal() {
        document.getElementById('terms-modal')?.classList.add('hidden');
    }

    async acceptTerms() {
        try {
            await chrome.storage.local.set({ termsAccepted: true });
            this.termsAccepted = true;
            this.hideTermsModal();
            this.showToast('Terms accepted. You can now sync your courses!', 'success');
        } catch (error) {
            console.error('Error accepting terms:', error);
            this.showToast('Error accepting terms', 'error');
        }
    }

    declineTerms() {
        this.hideTermsModal();
        this.showToast('Terms declined. Some features will be limited.', 'warning');
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`)?.classList.add('active');

        this.currentTab = tabName;

        // Load tab-specific data
        if (tabName === 'analytics') {
            this.updateAnalytics('week');
        } else if (tabName === 'courses') {
            this.loadCourses();
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        chrome.storage.local.set({ theme: this.theme });
        
        const themeIcon = document.querySelector('#theme-toggle .icon');
        if (themeIcon) {
            themeIcon.textContent = this.theme === 'light' ? '🌙' : '☀️';
        }
    }

    // Timer Functions
    setTimerMode(mode, duration) {
        if (this.timerState.isRunning) {
            this.showToast('Stop current session to change mode', 'warning');
            return;
        }

        this.timerState.mode = mode;
        this.timerState.currentTime = duration * 60;
        this.timerState.totalTime = duration * 60;

        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

        this.updateTimerDisplay();
    }

    startTimer() {
        if (this.timerState.isRunning) return;

        const subject = document.getElementById('study-subject')?.value;
        const topic = document.getElementById('study-topic')?.value;

        if (!subject && this.timerState.mode === 'focus') {
            this.showToast('Please select a subject', 'warning');
            return;
        }

        this.timerState.isRunning = true;
        this.timerState.isPaused = false;

        // Update UI
        document.getElementById('start-timer-btn')?.classList.add('hidden');
        document.getElementById('pause-timer-btn')?.classList.remove('hidden');
        document.getElementById('stop-timer-btn')?.classList.remove('hidden');

        // Start countdown
        this.timer = setInterval(() => {
            this.timerState.currentTime--;
            this.updateTimerDisplay();

            if (this.timerState.currentTime <= 0) {
                this.completeSession(subject, topic);
            }
        }, 1000);

        this.showToast(`${this.timerState.mode === 'focus' ? 'Focus' : 'Break'} session started!`, 'success');
    }

    pauseTimer() {
        if (!this.timerState.isRunning) return;

        this.timerState.isPaused = !this.timerState.isPaused;

        if (this.timerState.isPaused) {
            clearInterval(this.timer);
            document.getElementById('pause-timer-btn').innerHTML = '<span class="icon">▶️</span>Resume';
        } else {
            this.timer = setInterval(() => {
                this.timerState.currentTime--;
                this.updateTimerDisplay();

                if (this.timerState.currentTime <= 0) {
                    const subject = document.getElementById('study-subject')?.value;
                    const topic = document.getElementById('study-topic')?.value;
                    this.completeSession(subject, topic);
                }
            }, 1000);
            document.getElementById('pause-timer-btn').innerHTML = '<span class="icon">⏸️</span>Pause';
        }
    }

    stopTimer() {
        if (!this.timerState.isRunning) return;

        clearInterval(this.timer);
        this.timerState.isRunning = false;
        this.timerState.isPaused = false;

        // Reset timer
        const duration = document.querySelector('.mode-btn.active')?.dataset.duration || 25;
        this.timerState.currentTime = duration * 60;
        this.timerState.totalTime = duration * 60;

        // Update UI
        document.getElementById('start-timer-btn')?.classList.remove('hidden');
        document.getElementById('pause-timer-btn')?.classList.add('hidden');
        document.getElementById('stop-timer-btn')?.classList.add('hidden');
        document.getElementById('pause-timer-btn').innerHTML = '<span class="icon">⏸️</span>Pause';

        this.updateTimerDisplay();
        this.showToast('Session stopped', 'warning');
    }

    completeSession(subject, topic) {
        clearInterval(this.timer);
        this.timerState.isRunning = false;

        if (this.timerState.mode === 'focus') {
            // Record study session
            const sessionData = {
                subject: subject || 'General',
                topic: topic || '',
                duration: this.timerState.totalTime / 60,
                timestamp: Date.now(),
                date: new Date().toDateString()
            };

            this.studyData.sessions.push(sessionData);
            this.studyData.todayTime += this.timerState.totalTime / 60;
            this.updateStreak();
            this.saveStudyData();
            this.updateDashboardStats();

            this.showToast('🎉 Focus session completed!', 'success');
            
            // Auto-suggest break
            setTimeout(() => {
                if (confirm('Great job! Take a 5-minute break?')) {
                    this.setTimerMode('short-break', 5);
                    this.startTimer();
                }
            }, 1000);
        } else {
            this.showToast('Break completed! Ready for another session?', 'success');
        }

        // Reset UI
        document.getElementById('start-timer-btn')?.classList.remove('hidden');
        document.getElementById('pause-timer-btn')?.classList.add('hidden');
        document.getElementById('stop-timer-btn')?.classList.add('hidden');

        // Reset timer
        const duration = document.querySelector('.mode-btn.active')?.dataset.duration || 25;
        this.timerState.currentTime = duration * 60;
        this.timerState.totalTime = duration * 60;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timerState.currentTime / 60);
        const seconds = this.timerState.currentTime % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerEl = document.getElementById('timer-display');
        if (timerEl) timerEl.textContent = display;

        // Update progress circle
        const progress = 1 - (this.timerState.currentTime / this.timerState.totalTime);
        const circumference = 2 * Math.PI * 45; // radius = 45
        const offset = circumference * (1 - progress);
        
        const progressEl = document.getElementById('timer-progress');
        if (progressEl) {
            progressEl.style.strokeDashoffset = offset;
        }
    }

    updateStreak() {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
        
        const todaySessions = this.studyData.sessions.filter(s => s.date === today);
        const yesterdaySessions = this.studyData.sessions.filter(s => s.date === yesterday);
        
        if (todaySessions.length > 0) {
            if (yesterdaySessions.length > 0) {
              // Continue streak from yesterday
              this.studyData.streak = (this.studyData.streak || 0) + 1;
            } else {
              // Reset streak since there was a break yesterday
              this.studyData.streak = 1;
          }
      }
  }

    updateDashboardStats() {
        // Today's time
        const todayEl = document.getElementById('today-time');
        if (todayEl) {
            const hours = Math.floor(this.studyData.todayTime / 60);
            const minutes = Math.floor(this.studyData.todayTime % 60);
            todayEl.textContent = `${hours}h ${minutes}m`;
        }

        // Streak
        const streakEl = document.getElementById('study-streak');
        if (streakEl) streakEl.textContent = this.studyData.streak.toString();

        // Goals
        const goalsEl = document.getElementById('goals-completed');
        if (goalsEl) goalsEl.textContent = `${this.studyData.goals.completed}/${this.studyData.goals.total}`;

        // Courses - show active courses count
        const coursesEl = document.getElementById('active-courses');
        if (coursesEl) {
            const activeCourses = this.studyData.courses?.length || 0;
            coursesEl.textContent = activeCourses.toString();
            
            // Add click handler to switch to courses tab
            coursesEl.closest('.stat-card')?.addEventListener('click', () => {
                this.switchTab('courses');
            });
        }
    }

    loadRecentActivity() {
        const activityEl = document.getElementById('recent-activity');
        if (!activityEl) return;

        const recentSessions = this.studyData.sessions
            .slice(-5)
            .reverse()
            .map(session => {
                const timeAgo = this.getTimeAgo(session.timestamp);
                return `
                    <div class="activity-item">
                        <span class="activity-icon">📖</span>
                        <div class="activity-info">
                            <span class="activity-title">${session.subject} - ${session.duration}min</span>
                            <span class="activity-time">${timeAgo}</span>
                        </div>
                    </div>
                `;
            }).join('');

        activityEl.innerHTML = recentSessions || `
            <div class="activity-item">
                <span class="activity-icon">🎯</span>
                <div class="activity-info">
                    <span class="activity-title">Start your first study session!</span>
                    <span class="activity-time">Click the timer tab to begin</span>
                </div>
            </div>
        `;
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    }
    getCourseIcon(course) {
        if (!course.deadlines || course.deadlines.length === 0) {
            return '📚'; // Default book icon
        }

        // Get the most common deadline type
        const typeCounts = {};
        course.deadlines.forEach(d => {
            typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
        });

        const mostCommonType = Object.keys(typeCounts).reduce((a, b) => 
            typeCounts[a] > typeCounts[b] ? a : b
        );

        const icons = {
            'assignment': '📝',
            'quiz': '🧪', 
            'exam': '📅',
            'project': '📂',
            'default': '📚'
        };

        return icons[mostCommonType] || icons.default;
    }

    async syncBrightspace() {
        if (!this.termsAccepted) {
            this.showTermsModal();
            return;
        }

        this.showLoading('Syncing courses from Brightspace...');

        let retries = 0;
        const maxRetries = 2;

        while (retries < maxRetries) {
            try {
                this.showLoading('Syncing courses...');
                const response = await chrome.runtime.sendMessage({ action: 'scrapeBrightspace' });

                if (response.success) {
                     // Store the courses data
                    this.studyData.courses = response.courses;
                    this.studyData.currentTerm = response.currentTerm;
                    await this.saveStudyData();
                    
                    // Update the UI
                    this.loadCourses();
                    this.updateDashboardStats();
                    this.updateStudySubjectDropdown(); // Update dropdown with synced courses
                    this.hideLoading();
                    this.showToast('Courses synced successfully!', 'success');
                    return;
                }
            } catch (error) {
                retries++;
                if (retries >= maxRetries) {
                    let errorMessage = 'Sync failed';
                    if (error.message.includes('Wrong Brightspace view')) {
                        errorMessage = 'Please open the Brightspace student dashboard first';
                    } else if (error.message.includes('Login required')) {
                        errorMessage = 'Session expired - please log in again';
                    }
                    
                    this.showToast(errorMessage, 'error', 5000);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    loadCourses() {
        const coursesEl = document.getElementById('courses-list');
        const termHeader = document.getElementById('term-header');
        const subjectSelect = document.getElementById('study-subject');
        
        if (!coursesEl) return;
        
        // Update term header with current term if available
        if (termHeader) {
            termHeader.innerHTML = this.studyData.currentTerm 
                ? `<h2>My Courses - ${this.studyData.currentTerm}</h2>`
                : '<h2>My Courses</h2>';
        }

         // Clear and rebuild subject dropdown
        if (subjectSelect) {
            // Keep the first "Select Subject" option
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        }

        // Show placeholder if no courses
        if (!this.studyData.courses || this.studyData.courses.length === 0) {
            coursesEl.innerHTML = `
                <div class="course-card placeholder">
                    <div class="course-icon">📚</div>
                    <div class="course-info">
                        <h3>No courses yet</h3>
                        <p>Sync your Brightspace courses to get started</p>
                    </div>
                </div>
            `;
            return;
        }

        // Create course cards and populate subject dropdown
        const coursesHTML = this.studyData.courses.map(course => {
            // Add course to subject dropdown
            if (subjectSelect) {
                const option = document.createElement('option');
                option.value = course.code || course.name;
                option.textContent = `${course.code} - ${course.name}`;
                subjectSelect.appendChild(option);
            }

            return `
                <div class="course-card" data-course-id="${course.courseId}">
                    <div class="course-icon">${this.getCourseIcon(course)}</div>
                    <div class="course-info">
                        <h3>${course.code || 'Course'}</h3>
                        <p>${this.truncateCourseName(course.name)}</p>
                        <div class="course-meta">
                            <span class="deadline-count">
                                ${course.deadlines?.length || 0} upcoming deadlines
                            </span>
                            ${course.instructor ? `<span class="instructor">Instructor: ${course.instructor}</span>` : ''}
                        </div>
                    </div>
                    <div class="course-actions">
                        <button class="course-action-btn" title="Open in Brightspace">
                            <span class="icon">🔗</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        coursesEl.innerHTML = coursesHTML;

        // Add click handlers for course cards
        coursesEl.querySelectorAll('.course-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Check if the click was on the action button
                if (e.target.closest('.course-action-btn')) {
                    e.stopPropagation();
                    const courseId = card.dataset.courseId;
                    const course = this.studyData.courses.find(c => c.courseId === courseId);
                    if (course && course.url) {
                        chrome.tabs.create({ url: course.url });
                    }
                } else {
                    // Show course options modal
                    const courseId = card.dataset.courseId;
                    const course = this.studyData.courses.find(c => c.courseId === courseId);
                    if (course) {
                        this.showCourseOptionsModal(course);
                    }
                }
            });
        });
        
        // Update the study subject dropdown with loaded courses
        this.updateStudySubjectDropdown();
    }

    truncateCourseName(name, maxLength = 30) {
        if (!name) return '';
        return name.length > maxLength ? `${name.substring(0, maxLength)}...` : name;
    }

    updateAnalytics(period) {
        // This would normally fetch and display analytics data
        // For now, we'll show placeholder data
        console.log(`Updating analytics for period: ${period}`);
        
        // Update insights based on actual data
        this.updateInsights();
    }

    updateInsights() {
        const insights = this.generateInsights();
        const insightsEl = document.querySelector('.insights-grid');
        
        if (insightsEl && insights.length > 0) {
            insightsEl.innerHTML = insights.map(insight => `
                <div class="insight-card">
                    <span class="insight-icon">${insight.icon}</span>
                    <div class="insight-content">
                        <h4>${insight.title}</h4>
                        <p>${insight.description}</p>
                    </div>
                </div>
            `).join('');
        }
    }

    updateStudySubjectDropdown() {
        const subjectSelect = document.getElementById('study-subject');
        if (!subjectSelect || !this.studyData.courses) return;

        // Keep the default "Select Subject" option
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';

        // Add courses to dropdown
        this.studyData.courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.code || course.name;
            option.textContent = this.getCourseDisplayName(course);
            subjectSelect.appendChild(option);
        });

        // Restore last selected subject if available
        if (this.lastSelectedSubject) {
            subjectSelect.value = this.lastSelectedSubject;
        }
    }
    
    getCourseDisplayName(course) {
    if (!course.code && !course.name) return 'Unknown Course';
    
    // If we have both code and name: "ADM2320 - Marketing"
    if (course.code && course.name) {
        return `${course.code} - ${this.truncateCourseName(course.name, 30)}`;
    }
    
    // If we only have code
    if (course.code) return course.code;
    
    // If we only have name
    return this.truncateCourseName(course.name, 40);
    }
    
    generateInsights() {
        const insights = [];
        
        if (this.studyData.sessions.length > 0) {
            // Most productive subject
            const subjectCounts = {};
            this.studyData.sessions.forEach(session => {
                subjectCounts[session.subject] = (subjectCounts[session.subject] || 0) + session.duration;
            });
            
            const topSubject = Object.keys(subjectCounts).reduce((a, b) => 
                subjectCounts[a] > subjectCounts[b] ? a : b
            );
            
            insights.push({
                icon: '🎯',
                title: 'Top Subject',
                description: `You spend most time studying ${topSubject}`
            });
        }
        
        if (this.studyData.streak > 0) {
            insights.push({
                icon: '🔥',
                title: 'Study Streak',
                description: `${this.studyData.streak} day${this.studyData.streak > 1 ? 's' : ''} of consistent studying!`
            });
        }
        
        if (this.studyData.todayTime > 0) {
            insights.push({
                icon: '📈',
                title: 'Today\'s Progress',
                description: `${Math.floor(this.studyData.todayTime / 60)}h ${Math.floor(this.studyData.todayTime % 60)}m studied today`
            });
        }
        
        return insights;
    }

    showCourseOptionsModal(course) {
        const modal = document.createElement('div');
        modal.className = 'modal course-options-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${course.code} - ${course.name}</h3>
                    <button class="modal-close-btn">&times;</button>
                </div>
                <div class="course-options">
                    <button class="option-btn" data-action="open-course">
                        <span class="icon">🔗</span>
                        <div class="option-info">
                            <span class="option-title">Open Course</span>
                            <span class="option-desc">Go to course in Brightspace</span>
                        </div>
                    </button>
                    <button class="option-btn" data-action="view-syllabus">
                        <span class="icon">📋</span>
                        <div class="option-info">
                            <span class="option-title">View Syllabus</span>
                            <span class="option-desc">Read course syllabus</span>
                        </div>
                    </button>
                    <button class="option-btn" data-action="scrape-syllabus">
                        <span class="icon">🔄</span>
                        <div class="option-info">
                            <span class="option-title">Update Syllabus</span>
                            <span class="option-desc">Fetch latest syllabus from Brightspace</span>
                        </div>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        modal.querySelector('.modal-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.modal-overlay').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                document.body.removeChild(modal);
                
                switch (action) {
                    case 'open-course':
                        if (course.url) {
                            chrome.tabs.create({ url: course.url });
                        }
                        break;
                    case 'view-syllabus':
                        await this.viewSyllabus(course);
                        break;
                    case 'scrape-syllabus':
                        await this.scrapeSyllabus(course);
                        break;
                }
            });
        });
    }
    
    async viewSyllabus(course) {
        this.showLoading('Loading syllabus...');
        
        try {
            // Check if we have cached syllabus data
            const result = await chrome.storage.local.get(['syllabi']);
            const syllabi = result.syllabi || {};
            const syllabusData = syllabi[course.courseId];
            
            if (syllabusData) {
                console.log("Syllabus data from cache in viewSyllabus:", syllabusData);
                this.hideLoading();
                this.showSyllabusModal(course, syllabusData);
            } else {
                // No cached syllabus, offer to scrape it
                this.hideLoading();
                const shouldScrape = confirm("No syllabus found for this course. Would you like to fetch it from Brightspace?");
                if (shouldScrape) {
                    await this.scrapeSyllabus(course);
                }
            }
        } catch (error) {
            this.hideLoading();
            this.showToast('Error loading syllabus', 'error');
            console.error('Error viewing syllabus:', error);
        }
    }
    
    async scrapeSyllabus(course) {
        this.showLoading('Fetching syllabus from Brightspace...');
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'scrapeSyllabus',
                courseUrl: course.url,
                courseId: course.courseId
            });
            
            this.hideLoading();
            
            if (response.success) {
                console.log("Syllabus data from scrapeSyllabus response:", response.syllabus);
                this.showToast("Syllabus updated successfully!", "success");
                this.showSyllabusModal(course, response.syllabus);
            } else {
                this.showToast("Failed to fetch syllabus: " + response.error, "error");
            }
        } catch (error) {
            this.hideLoading();
            this.showToast('Error fetching syllabus', 'error');
            console.error('Error scraping syllabus:', error);
        }
    }
    
    showSyllabusModal(course, syllabusData) {
        console.log("Syllabus Data received in showSyllabusModal:", syllabusData);
        const modal = document.createElement("div");
        modal.className = 'modal syllabus-modal';
        
        let contentHtml = '';
        
        if (syllabusData.isPDF) {
            // Handle PDF syllabus
            contentHtml = `
                <div class="syllabus-body">
                    <div class="syllabus-meta">
                        <span class="syllabus-title">${syllabusData.title || 'Course Syllabus (PDF)'}</span>
                    </div>
                    <div class="syllabus-text">
                        <p>The syllabus is available as a PDF document.</p>
                        <a href="${syllabusData.url}" target="_blank" class="pdf-link">Open PDF Syllabus</a>
                        <p class="pdf-notice">Note: PDF content cannot be displayed inline</p>
                    </div>
                </div>
            `;
        } else {
            // Handle HTML syllabus
            contentHtml = `
                <div class="syllabus-body">
                    <div class="syllabus-meta">
                        <span class="syllabus-title">${syllabusData.title || 'Course Syllabus'}</span>
                        <span class="syllabus-date">Last updated: ${syllabusData.extractedAt ? new Date(syllabusData.extractedAt).toLocaleDateString() : 'Unknown'}</span>
                    </div>
                    <div class="syllabus-text">
                        ${this.formatSyllabusContent(syllabusData.content)}
                    </div>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content syllabus-content">
                <div class="modal-header">
                    <h3>${course.code} - Syllabus</h3>
                    <button class="modal-close-btn">&times;</button>
                </div>
                ${contentHtml}
                <div class="modal-actions">
                    <button class="secondary-btn" id="refresh-syllabus">
                        <span class="icon">🔄</span>
                        Refresh
                    </button>
                    <button class="primary-btn" id="close-syllabus">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        modal.querySelector('.modal-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.modal-overlay').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('#close-syllabus').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('#refresh-syllabus').addEventListener('click', async () => {
            document.body.removeChild(modal);
            await this.scrapeSyllabus(course);
        });
    }
    
    formatSyllabusContent(content) {
        if (!content) return '<p>No content available</p>';
        
        // Split into meaningful sections
        return content
            .split(/\n/)
            .filter(line => line.trim().length > 0)
            .map(line => {
                // Format section headers
                if (line.match(/^[A-Z][A-Z\s]+:$/) || 
                    line.match(/^[A-Z][a-z\s]+:$/) || 
                    line.endsWith(':')) {
                    return `<h4>${line}</h4>`;
                }
                // Format list items
                if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
                    return `<li>${line.substring(2)}</li>`;
                }
                return `<p>${line}</p>`;
            })
            .join('');
    }

    // Utility Functions
    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const textEl = document.getElementById('loading-text');
        
        if (overlay) overlay.classList.remove('hidden');
        if (textEl) textEl.textContent = text;
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease-in-out forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.studySyncApp = new StudySyncApp();
});

// Add CSS animation for toast slide out
const style = document.createElement('style');
style.textContent = `
    @keyframes toastSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

