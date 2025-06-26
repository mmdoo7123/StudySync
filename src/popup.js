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
            }
            this.updateDashboardStats();
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
                await chrome.storage.local.set({ user: this.user });
                
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
        document.getElementById('login-section')?.classList.add('hidden');
        document.getElementById('main-content')?.classList.remove('hidden');
        
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

        // Courses
        const coursesEl = document.getElementById('active-courses');
        if (coursesEl) coursesEl.textContent = this.studyData.courses.length.toString();
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

    // Brightspace Integration
    async syncBrightspace() {
        if (!this.termsAccepted) {
            this.showTermsModal();
            return;
        }

        this.showLoading('Syncing courses from Brightspace...');

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'scrapeBrightspace'
            });

            if (response.success) {
                this.studyData.courses = response.courses || [];
                await this.saveStudyData();
                this.loadCourses();
                this.updateDashboardStats();
                
                this.showToast(`Synced ${this.studyData.courses.length} courses!`, 'success');
                
                // Update sync status
                const syncStatus = document.getElementById('sync-status');
                if (syncStatus) {
                    syncStatus.innerHTML = `
                        <span class="status-icon">✅</span>
                        <span>Last sync: Just now</span>
                    `;
                }
            } else {
                throw new Error(response.error || 'Sync failed');
            }
        } catch (error) {
            console.error('Brightspace sync error:', error);
            this.showToast('Sync failed. Make sure you\'re logged into Brightspace.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    loadCourses() {
        const coursesEl = document.getElementById('courses-list');
        if (!coursesEl) return;

        if (this.studyData.courses.length === 0) {
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

        const coursesHTML = this.studyData.courses.map(course => `
            <div class="course-card" data-course-id="${course.id}">
                <div class="course-icon">📚</div>
                <div class="course-info">
                    <h3>${course.name}</h3>
                    <p>${course.code || 'Course'}</p>
                </div>
            </div>
        `).join('');

        coursesEl.innerHTML = coursesHTML;

        // Add click handlers
        coursesEl.querySelectorAll('.course-card').forEach(card => {
            card.addEventListener('click', () => {
                const courseId = card.dataset.courseId;
                const course = this.studyData.courses.find(c => c.id === courseId);
                if (course && course.url) {
                    chrome.tabs.create({ url: course.url });
                }
            });
        });
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

