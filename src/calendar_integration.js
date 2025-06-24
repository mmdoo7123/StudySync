// Calendar Integration Module for StudySync Extension
// Supports Google Calendar API and .ics export

class CalendarIntegrator {
    constructor() {
        this.googleCalendarApiUrl = 'https://www.googleapis.com/calendar/v3';
        this.calendarId = 'primary'; // Default to primary calendar
        this.eventColors = {
            assignment: '2', // Green
            quiz: '5',       // Yellow
            exam: '11'       // Red
        };
    }

    /**
     * Converts deadline objects to Google Calendar events
     * @param {Array} deadlines - Array of processed deadline objects
     * @param {string} courseCode - Course code for event titles
     * @returns {Array} Array of calendar event objects
     */
    convertDeadlinesToEvents(deadlines, courseCode) {
        return deadlines.map(deadline => {
            const eventTitle = `${courseCode}: ${deadline.title}`;
            const eventDescription = `Type: ${deadline.type}\nCourse: ${courseCode}\nConfidence: ${deadline.confidence}`;
            
            // Set event time to 11:59 PM on due date
            const dueDateTime = new Date(deadline.dueDate + 'T23:59:00');
            
            return {
                summary: eventTitle,
                description: eventDescription,
                start: {
                    dateTime: dueDateTime.toISOString(),
                    timeZone: 'America/Toronto' // Ottawa timezone
                },
                end: {
                    dateTime: dueDateTime.toISOString(),
                    timeZone: 'America/Toronto'
                },
                colorId: this.eventColors[deadline.type] || this.eventColors.assignment,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 24 * 60 }, // 1 day before
                        { method: 'popup', minutes: 60 },      // 1 hour before
                        { method: 'email', minutes: 24 * 60 }  // Email 1 day before
                    ]
                },
                extendedProperties: {
                    private: {
                        studySyncType: deadline.type,
                        studySyncCourse: courseCode,
                        studySyncId: `${courseCode}_${deadline.title}_${deadline.dueDate}`.replace(/\s+/g, '_')
                    }
                }
            };
        });
    }

    /**
     * Creates events in Google Calendar
     * @param {string} accessToken - Google OAuth access token
     * @param {Array} events - Array of calendar event objects
     * @returns {Promise<Object>} Results of calendar operations
     */
    async createCalendarEvents(accessToken, events) {
        const results = {
            success: [],
            failed: [],
            total: events.length
        };

        for (const event of events) {
            try {
                const response = await fetch(`${this.googleCalendarApiUrl}/calendars/${this.calendarId}/events`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(event)
                });

                if (response.ok) {
                    const createdEvent = await response.json();
                    results.success.push({
                        title: event.summary,
                        id: createdEvent.id,
                        htmlLink: createdEvent.htmlLink
                    });
                } else {
                    const error = await response.text();
                    results.failed.push({
                        title: event.summary,
                        error: error
                    });
                }
            } catch (error) {
                results.failed.push({
                    title: event.summary,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Checks for existing StudySync events to avoid duplicates
     * @param {string} accessToken - Google OAuth access token
     * @param {string} courseCode - Course code to filter events
     * @returns {Promise<Array>} Array of existing StudySync event IDs
     */
    async getExistingStudySyncEvents(accessToken, courseCode) {
        try {
            const timeMin = new Date().toISOString();
            const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ahead
            
            const response = await fetch(
                `${this.googleCalendarApiUrl}/calendars/${this.calendarId}/events?` +
                `timeMin=${timeMin}&timeMax=${timeMax}&q=${courseCode}&singleEvents=true`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data.items
                    .filter(event => 
                        event.extendedProperties?.private?.studySyncCourse === courseCode
                    )
                    .map(event => ({
                        id: event.id,
                        studySyncId: event.extendedProperties.private.studySyncId,
                        summary: event.summary
                    }));
            }
            
            return [];
        } catch (error) {
            console.error('Error fetching existing events:', error);
            return [];
        }
    }

    /**
     * Syncs deadlines to Google Calendar with duplicate prevention
     * @param {string} accessToken - Google OAuth access token
     * @param {Array} courses - Array of course objects with deadlines
     * @returns {Promise<Object>} Sync results
     */
    async syncDeadlinesToCalendar(accessToken, courses) {
        const syncResults = {
            totalCourses: courses.length,
            totalDeadlines: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        for (const course of courses) {
            if (!course.deadlines || course.deadlines.length === 0) {
                continue;
            }

            const courseCode = course.code || course.name;
            const events = this.convertDeadlinesToEvents(course.deadlines, courseCode);
            syncResults.totalDeadlines += events.length;

            // Check for existing events
            const existingEvents = await this.getExistingStudySyncEvents(accessToken, courseCode);
            const existingIds = new Set(existingEvents.map(e => e.studySyncId));

            // Filter out events that already exist
            const newEvents = events.filter(event => {
                const eventId = event.extendedProperties.private.studySyncId;
                return !existingIds.has(eventId);
            });

            syncResults.skipped += events.length - newEvents.length;

            if (newEvents.length > 0) {
                const createResults = await this.createCalendarEvents(accessToken, newEvents);
                syncResults.created += createResults.success.length;
                syncResults.failed += createResults.failed.length;

                syncResults.details.push({
                    course: courseCode,
                    created: createResults.success.length,
                    failed: createResults.failed.length,
                    skipped: events.length - newEvents.length
                });
            }
        }

        return syncResults;
    }

    /**
     * Generates .ics file content for calendar import
     * @param {Array} courses - Array of course objects with deadlines
     * @returns {string} .ics file content
     */
    generateIcsFile(courses) {
        const icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//StudySync//StudySync Extension//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH'
        ];

        for (const course of courses) {
            if (!course.deadlines || course.deadlines.length === 0) {
                continue;
            }

            const courseCode = course.code || course.name;

            for (const deadline of course.deadlines) {
                if (!deadline.dueDate) continue;

                const dueDate = new Date(deadline.dueDate + 'T23:59:00');
                const uid = `${courseCode}_${deadline.title}_${deadline.dueDate}@studysync.extension`;
                const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                const dtStart = dueDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

                icsLines.push(
                    'BEGIN:VEVENT',
                    `UID:${uid}`,
                    `DTSTAMP:${dtStamp}`,
                    `DTSTART:${dtStart}`,
                    `DTEND:${dtStart}`,
                    `SUMMARY:${courseCode}: ${deadline.title}`,
                    `DESCRIPTION:Type: ${deadline.type}\\nCourse: ${courseCode}\\nExtracted from StudySync`,
                    `CATEGORIES:${deadline.type.toUpperCase()}`,
                    'BEGIN:VALARM',
                    'TRIGGER:-P1D',
                    'ACTION:DISPLAY',
                    `DESCRIPTION:Reminder: ${deadline.title} due tomorrow`,
                    'END:VALARM',
                    'END:VEVENT'
                );
            }
        }

        icsLines.push('END:VCALENDAR');
        return icsLines.join('\r\n');
    }

    /**
     * Downloads .ics file to user's computer
     * @param {Array} courses - Array of course objects with deadlines
     * @param {string} filename - Optional filename (default: studysync-deadlines.ics)
     */
    downloadIcsFile(courses, filename = 'studysync-deadlines.ics') {
        const icsContent = this.generateIcsFile(courses);
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Validates Google Calendar access token
     * @param {string} accessToken - Google OAuth access token
     * @returns {Promise<boolean>} True if token is valid
     */
    async validateCalendarAccess(accessToken) {
        try {
            const response = await fetch(`${this.googleCalendarApiUrl}/calendars/${this.calendarId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Error validating calendar access:', error);
            return false;
        }
    }

    /**
     * Gets user's calendar list for selection
     * @param {string} accessToken - Google OAuth access token
     * @returns {Promise<Array>} Array of available calendars
     */
    async getUserCalendars(accessToken) {
        try {
            const response = await fetch(`${this.googleCalendarApiUrl}/users/me/calendarList`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.items.map(calendar => ({
                    id: calendar.id,
                    name: calendar.summary,
                    primary: calendar.primary || false,
                    accessRole: calendar.accessRole
                }));
            }
            
            return [];
        } catch (error) {
            console.error('Error fetching calendars:', error);
            return [];
        }
    }

    /**
     * Sets the target calendar for event creation
     * @param {string} calendarId - Google Calendar ID
     */
    setTargetCalendar(calendarId) {
        this.calendarId = calendarId;
    }

    /**
     * Removes StudySync events from calendar
     * @param {string} accessToken - Google OAuth access token
     * @param {string} courseCode - Optional course code to filter deletions
     * @returns {Promise<Object>} Deletion results
     */
    async removeStudySyncEvents(accessToken, courseCode = null) {
        try {
            const existingEvents = await this.getExistingStudySyncEvents(accessToken, courseCode || '');
            const deleteResults = {
                total: existingEvents.length,
                deleted: 0,
                failed: 0
            };

            for (const event of existingEvents) {
                try {
                    const response = await fetch(
                        `${this.googleCalendarApiUrl}/calendars/${this.calendarId}/events/${event.id}`,
                        {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        }
                    );

                    if (response.ok) {
                        deleteResults.deleted++;
                    } else {
                        deleteResults.failed++;
                    }
                } catch (error) {
                    deleteResults.failed++;
                }
            }

            return deleteResults;
        } catch (error) {
            console.error('Error removing StudySync events:', error);
            return { total: 0, deleted: 0, failed: 0, error: error.message };
        }
    }
}

// Calendar Settings Manager
class CalendarSettings {
    constructor() {
        this.storageKey = 'calendarSettings';
        this.defaultSettings = {
            autoSync: false,
            syncInterval: 'daily',
            targetCalendar: 'primary',
            reminderSettings: {
                popup1Day: true,
                popup1Hour: true,
                email1Day: true
            },
            eventColors: {
                assignment: '2',
                quiz: '5',
                exam: '11'
            }
        };
    }

    /**
     * Loads calendar settings from storage
     * @returns {Promise<Object>} Calendar settings
     */
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([this.storageKey]);
            return { ...this.defaultSettings, ...result[this.storageKey] };
        } catch (error) {
            console.error('Error loading calendar settings:', error);
            return this.defaultSettings;
        }
    }

    /**
     * Saves calendar settings to storage
     * @param {Object} settings - Settings to save
     * @returns {Promise<boolean>} Success status
     */
    async saveSettings(settings) {
        try {
            await chrome.storage.local.set({ [this.storageKey]: settings });
            return true;
        } catch (error) {
            console.error('Error saving calendar settings:', error);
            return false;
        }
    }

    /**
     * Updates specific setting
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     * @returns {Promise<boolean>} Success status
     */
    async updateSetting(key, value) {
        try {
            const settings = await this.loadSettings();
            settings[key] = value;
            return await this.saveSettings(settings);
        } catch (error) {
            console.error('Error updating calendar setting:', error);
            return false;
        }
    }
}

// Export for use in background script and popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CalendarIntegrator, CalendarSettings };
}

