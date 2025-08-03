// Optimized PDF Extractor with improved date parsing and deduplication

class OptimizedPdfExtractor {
    constructor() {
        this.pdfjsLoaded = false;
    }

    async loadPdfJs() {
        if (this.pdfjsLoaded) return;
        
        try {
            if (typeof pdfjsLib === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                document.head.appendChild(script);
                
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
                
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            
            this.pdfjsLoaded = true;
        } catch (error) {
            console.error('Failed to load PDF.js:', error);
            throw error;
        }
    }

    async extractTextFromPdf(pdfUrl, authToken) {
        try {
            console.log('Starting PDF text extraction from:', pdfUrl);
            
            const response = await fetch(pdfUrl, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/pdf'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const pdfBlob = await response.blob();
            const arrayBuffer = await pdfBlob.arrayBuffer();
            
            await this.loadPdfJs();
            
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            console.log(`PDF has ${pdf.numPages} pages`);
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
                console.log(`Extracted text from page ${i}: ${pageText.length} characters`);
            }
            
            console.log(`Total extracted text: ${fullText.length} characters`);
            return fullText;

        } catch (error) {
            console.error('Error extracting text from PDF:', error);
            throw error;
        }
    }
}

class OptimizedDeadlineProcessor {
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

    extractDeadlinesFromText(content) {
        console.log('Extracting deadlines from text content...');
        const deadlines = new Set(); // Use Set to avoid duplicates
        
        // Enhanced patterns with better date matching
        const deadlinePatterns = [
            // Pattern 1: "Assignment 1 - Due September 15, 2024"
            /(\b(?:Assignment|Lab|Midterm|Exam|Project|Report|Quiz|Test)\s*\d*)\s*[-–—]\s*(?:Due\s*)?(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
            
            // Pattern 2: "Assignment 1 | Individual | 15% | September 15, 2024"
            /([A-Za-z\s\d-]+?)\s*\|\s*[A-Za-z\s]+\s*\|\s*\d{1,3}%\s*\|\s*(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
            
            // Pattern 3: "Assignment 1 | Individual | 15% | September 15" (without year)
            /([A-Za-z\s\d-]+?)\s*\|\s*[A-Za-z\s]+\s*\|\s*\d{1,3}%\s*\|\s*(\w+\s+\d{1,2}(?:st|nd|rd|th)?)/gi,
            
            // Pattern 4: Natural language "due on September 15, 2024"
            /(\b(?:due|deadline|submit|hand in)\s+(?:on\s+)?)?(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
            
            // Pattern 5: Course end dates
            /(course\s*ends?|term\s*ends?|semester\s*ends?)[\s\S]*?(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi
        ];

        // Extract deadlines using patterns
        for (const pattern of deadlinePatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const context = (match[1] || '').trim();
                const dateText = (match[2] || '').trim();
                
                if (dateText && this.isValidDateText(dateText)) {
                    let deadlineText;
                    
                    if (context && !context.toLowerCase().includes('due')) {
                        deadlineText = `${context}: ${dateText}`;
                    } else {
                        deadlineText = dateText;
                    }
                    
                    // Clean up text
                    deadlineText = deadlineText
                        .replace(/\s+/g, ' ')
                        .replace(/\|\s*/g, '')
                        .replace(/\b(?:Due|due)\s*:?\s*/gi, '')
                        .trim();
                    
                    deadlines.add(deadlineText);
                }
            }
        }

        const uniqueDeadlines = Array.from(deadlines);
        console.log(`Found ${uniqueDeadlines.length} unique deadlines in text`);
        return uniqueDeadlines;
    }

    isValidDateText(dateText) {
        // Check if the date text contains a valid month and reasonable day/year
        const months = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december'];
        
        const lowerText = dateText.toLowerCase();
        const hasMonth = months.some(month => lowerText.includes(month));
        const hasDay = /\d{1,2}/.test(dateText);
        
        return hasMonth && hasDay;
    }

    processDeadlines(rawDeadlines) {
        const processedDeadlines = [];
        const seenDeadlines = new Set();
        
        for (const rawText of rawDeadlines) {
            const processed = this.normalizeDeadline(rawText);
            
            // Create a unique key for deduplication
            const key = `${processed.title}:${processed.dueDate}`;
            
            if (!seenDeadlines.has(key) && processed.dueDate) {
                seenDeadlines.add(key);
                processedDeadlines.push(processed);
            }
        }
        
        // Sort by due date
        processedDeadlines.sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        return processedDeadlines;
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

    extractDate(text) {
        // Enhanced date extraction with better year handling
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        
        const datePatterns = [
            // Full date with year
            /(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
            // Date without year (assume current or next academic year)
            /(\w+\s+\d{1,2}(?:st|nd|rd|th)?)/gi,
            // Numeric formats
            /(\d{1,2}\/\d{1,2}\/\d{4})/g,
            /(\d{4}-\d{2}-\d{2})/g
        ];

        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) {
                let dateStr = match[0];
                
                // If no year is specified, add current or next year based on month
                if (!/\d{4}/.test(dateStr)) {
                    const monthMatch = dateStr.match(/(\w+)/);
                    if (monthMatch) {
                        const month = monthMatch[1].toLowerCase();
                        const monthNum = this.getMonthNumber(month);
                        const currentMonth = new Date().getMonth() + 1;
                        
                        // If the month is before current month, assume next year
                        const year = monthNum < currentMonth ? nextYear : currentYear;
                        dateStr += `, ${year}`;
                    }
                }
                
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate;
                }
            }
        }
        return null;
    }

    getMonthNumber(monthName) {
        const months = {
            'january': 1, 'february': 2, 'march': 3, 'april': 4,
            'may': 5, 'june': 6, 'july': 7, 'august': 8,
            'september': 9, 'october': 10, 'november': 11, 'december': 12
        };
        return months[monthName.toLowerCase()] || 1;
    }

    extractTitle(text) {
        let title = text.replace(/^(due|deadline|ends|assignment|quiz|exam):?\s*/i, '');
        title = title.replace(/\s*(due|deadline|ends)\s*:.*$/i, '');
        title = title.replace(/\s*-\s*\w+\s+\d{1,2}(,\s+\d{4})?.*$/i, '');
        title = title.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/i, '');
        title = title.replace(/:\s*\w+\s+\d{1,2}.*$/i, '');
        
        // If title is just a date, extract the assignment type
        if (/^\w+\s+\d{1,2}/.test(title)) {
            const originalText = text.toLowerCase();
            if (originalText.includes('assignment')) title = 'Assignment';
            else if (originalText.includes('exam')) title = 'Exam';
            else if (originalText.includes('project')) title = 'Project';
            else if (originalText.includes('lab')) title = 'Lab';
            else if (originalText.includes('quiz')) title = 'Quiz';
        }
        
        return title.trim() || 'Assignment';
    }
}

// Test the optimized version
async function testOptimizedExtraction() {
    console.log('=== Testing Optimized PDF Extraction ===');
    
    const testContent = `
    Course Outline - Computer Science 101
    
    Assessment Schedule:
    
    Assignment 1 - Due September 15, 2024
    Lab Report 1 - Due September 22, 2024
    Midterm Exam - October 10, 2024
    Assignment 2 - Due October 25, 2024
    Final Project - Due November 30, 2024
    Final Exam - December 15, 2024
    
    Course Deliverables:
    
    Assignment 1 | Individual | 15% | September 15, 2024
    Lab Report 1 | Individual | 10% | September 22, 2024
    Midterm Exam | Individual | 25% | October 10, 2024
    Assignment 2 | Group | 20% | October 25, 2024
    Final Project | Group | 20% | November 30, 2024
    Final Exam | Individual | 30% | December 15, 2024
    
    Course ends December 20, 2024
    `;
    
    const deadlineProcessor = new OptimizedDeadlineProcessor();
    
    try {
        const rawDeadlines = deadlineProcessor.extractDeadlinesFromText(testContent);
        console.log('Raw deadlines found:', rawDeadlines);
        
        const processedDeadlines = deadlineProcessor.processDeadlines(rawDeadlines);
        console.log('Processed deadlines:', processedDeadlines);
        
        console.log('=== Optimized Test Results ===');
        console.log(`✅ Successfully extracted ${rawDeadlines.length} raw deadlines`);
        console.log(`✅ Successfully processed ${processedDeadlines.length} unique deadlines`);
        
        processedDeadlines.forEach((deadline, index) => {
            console.log(`${index + 1}. ${deadline.title} - Due: ${deadline.dueDate || 'Date not parsed'} (${deadline.type})`);
        });
        
        return {
            success: true,
            rawDeadlines,
            processedDeadlines
        };
        
    } catch (error) {
        console.error('❌ Optimized test failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OptimizedPdfExtractor, OptimizedDeadlineProcessor, testOptimizedExtraction };
}

// Run test if this file is executed directly
if (require.main === module) {
    testOptimizedExtraction().then(result => {
        if (result.success) {
            console.log('🎉 Optimized tests passed!');
        } else {
            console.log('💥 Optimized tests failed:', result.error);
        }
    });
}

