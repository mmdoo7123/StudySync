// Deadline Categorization and Change Detection Module
// Enhanced StudySync Extension - Deadline Processing

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

    /**
     * Categorizes a deadline based on its title and content
     * @param {string} title - The deadline title
     * @param {string} description - Optional description
     * @returns {Object} Categorized deadline object
     */
    categorizeDeadline(title, description = '') {
        const text = (title + ' ' + description).toLowerCase();
        
        // Check each category for keyword matches
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
        
        // Default to assignment if no specific category found
        return {
            type: 'assignment',
            icon: '📄',
            confidence: 0.3
        };
    }

    /**
     * Calculates confidence score for categorization
     * @param {string} text - The text to analyze
     * @param {string} keyword - The matched keyword
     * @returns {number} Confidence score between 0 and 1
     */
    calculateConfidence(text, keyword) {
        const words = text.split(/\s+/);
        const keywordIndex = words.findIndex(word => word.includes(keyword));
        
        // Higher confidence if keyword appears early in the text
        if (keywordIndex === -1) return 0.5;
        if (keywordIndex < 3) return 0.9;
        if (keywordIndex < 6) return 0.7;
        return 0.5;
    }

    /**
     * Normalizes deadline data into standard format
     * @param {string} rawText - Raw deadline text from Brightspace
     * @returns {Object} Normalized deadline object
     */
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

    /**
     * Extracts date from deadline text
     * @param {string} text - Text containing date information
     * @returns {Date|null} Extracted date or null if not found
     */
    extractDate(text) {
        // Common date patterns in Brightspace
        const datePatterns = [
            /(\w+\s+\d{1,2},\s+\d{4})/g, // "January 15, 2025"
            /(\d{1,2}\/\d{1,2}\/\d{4})/g, // "01/15/2025"
            /(\d{4}-\d{2}-\d{2})/g, // "2025-01-15"
            /(\w+\s+\d{1,2})/g // "January 15" (current year assumed)
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

    /**
     * Extracts clean title from deadline text
     * @param {string} text - Raw deadline text
     * @returns {string} Cleaned title
     */
    extractTitle(text) {
        // Remove common prefixes and suffixes
        let title = text.replace(/^(due|deadline|assignment|quiz|exam):\s*/i, '');
        title = title.replace(/\s*(due|deadline)\s*:.*$/i, '');
        
        // Remove date information
        title = title.replace(/\s*-\s*\w+\s+\d{1,2}(,\s+\d{4})?.*$/i, '');
        title = title.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/i, '');
        
        return title.trim();
    }

    /**
     * Processes array of raw deadlines and returns categorized results
     * @param {Array} rawDeadlines - Array of raw deadline strings
     * @returns {Array} Array of normalized deadline objects
     */
    processDeadlines(rawDeadlines) {
        return rawDeadlines
            .filter(deadline => deadline && deadline.trim().length > 0)
            .map(deadline => this.normalizeDeadline(deadline))
            .sort((a, b) => {
                // Sort by due date, then by type priority
                if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate) - new Date(b.dueDate);
                }
                if (a.dueDate && !b.dueDate) return -1;
                if (!a.dueDate && b.dueDate) return 1;
                
                // Type priority: exam > quiz > assignment
                const typePriority = { exam: 3, quiz: 2, assignment: 1 };
                return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
            });
    }
}

// Change Detection System
class ChangeDetector {
    constructor() {
        this.storageKey = 'deadlineSnapshots';
    }

    /**
     * Creates a hash of deadline data for comparison
     * @param {Array} deadlines - Array of deadline objects
     * @returns {string} Hash string
     */
    createHash(deadlines) {
        const sortedData = deadlines
            .map(d => `${d.type}:${d.title}:${d.dueDate}`)
            .sort()
            .join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < sortedData.length; i++) {
            const char = sortedData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Compares current deadlines with stored snapshot
     * @param {string} courseId - Course identifier
     * @param {Array} currentDeadlines - Current deadline data
     * @returns {Object} Change detection results
     */
    async detectChanges(courseId, currentDeadlines) {
        try {
            const snapshots = await this.getStoredSnapshots();
            const previousSnapshot = snapshots[courseId];
            const currentHash = this.createHash(currentDeadlines);

            if (!previousSnapshot) {
                // First time scraping this course
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
                // No changes detected
                return {
                    hasChanges: false,
                    isFirstScrape: false,
                    added: [],
                    removed: [],
                    modified: []
                };
            }

            // Detect specific changes
            const changes = this.compareDeadlines(previousSnapshot.deadlines, currentDeadlines);
            
            // Save new snapshot
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

    /**
     * Compares two arrays of deadlines to find differences
     * @param {Array} oldDeadlines - Previous deadlines
     * @param {Array} newDeadlines - Current deadlines
     * @returns {Object} Comparison results
     */
    compareDeadlines(oldDeadlines, newDeadlines) {
        const added = [];
        const removed = [];
        const modified = [];

        // Create maps for easier comparison
        const oldMap = new Map(oldDeadlines.map(d => [`${d.title}:${d.type}`, d]));
        const newMap = new Map(newDeadlines.map(d => [`${d.title}:${d.type}`, d]));

        // Find added deadlines
        for (const [key, deadline] of newMap) {
            if (!oldMap.has(key)) {
                added.push(deadline);
            }
        }

        // Find removed and modified deadlines
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

    /**
     * Retrieves stored deadline snapshots
     * @returns {Object} Stored snapshots
     */
    async getStoredSnapshots() {
        try {
            const result = await chrome.storage.local.get([this.storageKey]);
            return result[this.storageKey] || {};
        } catch (error) {
            console.error('Error retrieving snapshots:', error);
            return {};
        }
    }

    /**
     * Saves deadline snapshot for a course
     * @param {string} courseId - Course identifier
     * @param {Array} deadlines - Deadline data
     * @param {string} hash - Data hash
     */
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

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DeadlineProcessor, ChangeDetector };
}

