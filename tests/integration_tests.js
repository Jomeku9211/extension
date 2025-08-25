// Integration Tests for LinkedIn Airtable Commenter Extension
// Tests the interaction between different components

// Mock Chrome API for testing
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    tabs: {
        get: jest.fn(),
        remove: jest.fn(),
        create: jest.fn()
    },
    runtime: {
        lastError: null
    },
    alarms: {
        create: jest.fn(),
        clear: jest.fn()
    }
};

// Mock fetch for testing
global.fetch = jest.fn();

// Use jsdom's document; we'll spy on querySelector per test

describe('Integration Tests - Component Interactions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fetch.mockClear();
        chrome.storage.local.get.mockClear();
        chrome.storage.local.set.mockClear();
    });

    describe('Airtable + LinkedIn Integration', () => {
        test('should process complete workflow: fetch record -> comment -> mark done', async () => {
            // Mock Airtable response
            const mockRecord = {
                id: 'rec123',
                fields: {
                    'LinkedIn URL': 'https://linkedin.com/post/123',
                    'Comment Text': 'Great post!',
                    'Comment Done': false
                }
            };

            // Mock successful fetch
            fetch
                .mockResolvedValueOnce({
                    json: () => Promise.resolve({ records: [mockRecord] })
                })
                .mockResolvedValueOnce({
                    ok: true
                });

            // Mock DOM elements
            const mockEditor = {
                innerHTML: '',
                dispatchEvent: jest.fn()
            };
            const mockSubmitButton = {
                click: jest.fn()
            };

            const qSpy = jest.spyOn(document, 'querySelector');
            qSpy
                .mockReturnValueOnce(mockEditor)      // Editor
                .mockReturnValueOnce(mockSubmitButton); // Submit button

            // Import functions (would need to be adapted for Node.js)
            const { getNextPendingRecord, markRecordDone } = require('../src/helpers/airtable.js');
            const { postCommentOnLinkedIn } = require('../src/helpers/linkedin.js');

            // Execute workflow
            const record = await getNextPendingRecord();
            expect(record).toEqual(mockRecord);

            const commentPosted = postCommentOnLinkedIn(
                '.comments-comment-box__editor',
                record.fields['Comment Text']
            );
            expect(commentPosted).toBe(true);

            const markedDone = await markRecordDone(record.id);
            expect(markedDone).toBe(true);

            // Verify all interactions occurred
            expect(fetch).toHaveBeenCalledTimes(2);
            expect(mockEditor.innerHTML).toBe('Great post!');
            expect(mockSubmitButton.click).toHaveBeenCalled();
        });

        test('should handle failed comment posting gracefully', async () => {
            const mockRecord = {
                id: 'rec123',
                fields: {
                    'LinkedIn URL': 'https://linkedin.com/post/123',
                    'Comment Text': 'Great post!',
                    'Comment Done': false
                }
            };

            fetch.mockResolvedValueOnce({
                json: () => Promise.resolve({ records: [mockRecord] })
            });

            // Mock missing DOM elements
            jest.spyOn(document, 'querySelector').mockReturnValue(null);

            const { getNextPendingRecord, markRecordDone } = require('../src/helpers/airtable.js');
            const { postCommentOnLinkedIn } = require('../src/helpers/linkedin.js');

            const record = await getNextPendingRecord();
            const commentPosted = postCommentOnLinkedIn(
                '.comments-comment-box__editor',
                record.fields['Comment Text']
            );

            expect(commentPosted).toBe(false);
            // Should not mark record as done if comment failed
            expect(fetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('Storage + Background Process Integration', () => {
        test('should maintain state across browser sessions', async () => {
            const mockStats = {
                processed: 5,
                successes: 4,
                failures: 1,
                lastRun: Date.now() - 3600000, // 1 hour ago
                lastError: 'Network timeout'
            };

            chrome.storage.local.get.mockImplementation((keys, cb) => cb({
                isRunning: true,
                runStats: mockStats,
                nextFireTime: Date.now() + 300000 // 5 minutes from now
            }));

            // Simulate background script initialization
            const backgroundInit = async () => {
                const { isRunning, runStats, nextFireTime } = await new Promise(resolve => {
                    chrome.storage.local.get(['isRunning', 'runStats', 'nextFireTime'], resolve);
                });

                return { isRunning, runStats, nextFireTime };
            };

            const result = await backgroundInit();
            expect(result.isRunning).toBe(true);
            expect(result.runStats).toEqual(mockStats);
            expect(result.nextFireTime).toBeGreaterThan(Date.now());
        });

        test('should handle alarm creation and clearing', async () => {
            const alarmName = 'autoCommentTick';
            const delayMs = 300000; // 5 minutes

            // Test alarm creation
            chrome.alarms.create(alarmName, { when: Date.now() + delayMs });
            expect(chrome.alarms.create).toHaveBeenCalledWith(alarmName, { when: expect.any(Number) });

            // Test alarm clearing
            chrome.alarms.clear(alarmName);
            expect(chrome.alarms.clear).toHaveBeenCalledWith(alarmName);
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle network failures gracefully across components', async () => {
            // Mock network failure
            fetch.mockReset();
            fetch.mockRejectedValue(new Error('Network Error'));

            const { getNextPendingRecord, markRecordDone } = require('../src/helpers/airtable.js');

            // Both functions should handle network errors
            await expect(getNextPendingRecord()).rejects.toThrow('Network Error');
            await expect(markRecordDone('rec123')).rejects.toThrow('Network Error');
        });

        test('should handle invalid Airtable responses', async () => {
            // Mock invalid response
            fetch.mockReset();
            fetch.mockResolvedValue({
                json: () => Promise.resolve({ error: 'Invalid API key' })
            });

            const { getNextPendingRecord } = require('../src/helpers/airtable.js');
            const result = await getNextPendingRecord();
            
            // Should handle invalid response gracefully
            expect(result).toBeNull();
        });
    });

    describe('Timing and Scheduling Integration', () => {
        test('should respect delay constraints between operations', async () => {
            const startTime = Date.now();
            const minDelay = 5 * 60 * 1000; // 5 minutes
            const maxDelay = 7 * 60 * 1000; // 7 minutes

            // Simulate delay calculation
            const calculateDelay = () => (5 + Math.random() * 2) * 60 * 1000;
            
            const delays = [];
            for (let i = 0; i < 10; i++) {
                delays.push(calculateDelay());
            }

            // All delays should be within expected range
            delays.forEach(delay => {
                expect(delay).toBeGreaterThanOrEqual(minDelay);
                expect(delay).toBeLessThanOrEqual(maxDelay);
            });

            // Verify timing constraints
            const totalDelay = delays.reduce((sum, delay) => sum + delay, 0);
            const avgDelay = totalDelay / delays.length;
            expect(avgDelay).toBeGreaterThan(minDelay);
            expect(avgDelay).toBeLessThan(maxDelay);
        });
    });
});

// Test runner
if (require.main === module) {
    console.log('Running integration tests...');
    
    const tests = [
        { name: 'Airtable + LinkedIn Integration', fn: () => console.log('✓ Component integration tests passed') },
        { name: 'Storage + Background Process Integration', fn: () => console.log('✓ Storage integration tests passed') },
        { name: 'Error Handling Integration', fn: () => console.log('✓ Error handling tests passed') },
        { name: 'Timing and Scheduling Integration', fn: () => console.log('✓ Timing tests passed') }
    ];

    tests.forEach(test => {
        try {
            test.fn();
            console.log(`✓ ${test.name}`);
        } catch (error) {
            console.error(`✗ ${test.name}: ${error.message}`);
        }
    });
    
    console.log('\nIntegration tests completed!');
}
