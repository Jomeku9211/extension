// Background script starting
console.log('[background] Background script loaded and starting...');

// Fallback: periodically check for stuck tabs and force finalize/close if needed
setInterval(async () => {
    const active = await getActiveTask();
    if (active && active.tabId && active.startedAt && Date.now() - active.startedAt > 2 * 60 * 1000) {
        try {
            console.warn('[fallback] Forcing finalize/close for stuck tab', active.tabId, 'record', active.recordId);
            await markRecordDone(active.recordId, null);
            chrome.tabs.remove(active.tabId, () => void chrome.runtime.lastError);
            await clearActiveTask();
        } catch (e) {
            console.error('[fallback] Error during forced finalize/close:', e);
        }
    }
}, 30000); // check every 30s
// Airtable config: fixed and constant
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
const COMMENT_BY = 'Dheeraj';
// Today view (for single-account D) - This should be the Comment form view
const AIRTABLE_TODAY_VIEW_ID = 'viwjzxpzCC24wtkfc';
// View to check for already-commented posts to avoid duplicates
const AIRTABLE_DUPLICATE_VIEW_ID = 'viwhyoCkHret6DqWe';
let CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID };

// Messaging configuration
const MESSAGING_AIRTABLE_TABLE_ID = 'tblQmyqKc6mhjc1Yd';
const MESSAGING_AIRTABLE_VIEW_ID = 'viwOdRbCrNjyKwO8r';
let MESSAGING_CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID: MESSAGING_AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID: MESSAGING_AIRTABLE_VIEW_ID };

let isRunning = false;
let nextDelay = null;
let nextFireTime = null;
let startedAt = null;
let runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
let todayCount = 0;
let lastCountAt = 0;
let lastPostUrl = null;
let totalProspectsCount = 0;
let lastTotalProspectsAt = 0;
let forceStop = false; // Global stop flag
const TODAY_COUNT_TTL_MS = 2 * 60 * 1000; // refresh every ~2 minutes
let isProcessingTick = false; // prevent overlapping runs
const ACTIVE_TASK_TTL_MS = 6 * 60 * 1000; // 6 minutes safety window
const MAX_ATTEMPTS_PER_RECORD = 3; // auto-skip a record after this many attempts
let recordAttempts = {}; // recordId -> number of attempts

// Messaging-specific variables
let isMessagingRunning = false;
let messagingNextDelay = null;
let messagingNextFireTime = null;
let messagingStartedAt = null;
let messagingRunStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
let messagingTodayCount = 0;
let messagingLastCountAt = 0;
let messagingLastProfileUrl = null;
let totalMessageProspectsCount = 0;
let lastTotalMessageProspectsAt = 0;
let messagingForceStop = false; // Messaging stop flag
let isMessagingProcessingTick = false; // prevent overlapping messaging runs
let messagingRecordAttempts = {}; // recordId -> number of attempts
let messagingTargetCount = 0; // How many messages to send
let messagingCurrentCount = 0; // How many sent so far

// Commenting target count variables
let commentingTargetCount = 0; // How many comments to make
let commentingCurrentCount = 0; // How many made so far

function getFromStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function setInStorage(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}
function removeFromStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}
function tabsGet(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.get(tabId, (tab) => {
                // If not found, runtime.lastError is set
                if (chrome.runtime.lastError) return resolve(null);
                resolve(tab || null);
            });
        } catch (_) { resolve(null); }
    });
}
async function getActiveTask() {
    const { activeTask } = await getFromStorage(['activeTask']);
    return activeTask || null;
}
async function setActiveTask(task) {
    await setInStorage({ activeTask: task });
}
async function clearActiveTask() {
    await removeFromStorage(['activeTask']);
}

async function getActiveMessagingTask() {
    const { activeMessagingTask } = await getFromStorage(['activeMessagingTask']);
    return activeMessagingTask || null;
}
async function setActiveMessagingTask(task) {
    await setInStorage({ activeMessagingTask: task });
}
async function clearActiveMessagingTask() {
    await removeFromStorage(['activeMessagingTask']);
}

async function loadRecordAttempts() {
    try {
        const { recordAttempts: stored } = await getFromStorage(['recordAttempts']);
        recordAttempts = stored && typeof stored === 'object' ? stored : {};
    } catch (_) {
        recordAttempts = {};
    }
}

async function saveRecordAttempts() {
    try { await setInStorage({ recordAttempts }); } catch (_) {}
}

function getAttemptCount(recordId) {
    if (!recordId) return 0;
    const n = recordAttempts[recordId];
    return typeof n === 'number' && isFinite(n) ? n : 0;
}

function setAttemptCount(recordId, count) {
    if (!recordId) return;
    recordAttempts[recordId] = Math.max(0, count | 0);
}

function clearAttemptCount(recordId) {
    if (!recordId) return;
    delete recordAttempts[recordId];
}

// Messaging record attempts management
async function loadMessagingRecordAttempts() {
    try {
        const { messagingRecordAttempts: stored } = await getFromStorage(['messagingRecordAttempts']);
        messagingRecordAttempts = stored && typeof stored === 'object' ? stored : {};
    } catch (_) {
        messagingRecordAttempts = {};
    }
}

async function saveMessagingRecordAttempts() {
    try { await setInStorage({ messagingRecordAttempts }); } catch (_) {}
}

function getMessagingAttemptCount(recordId) {
    if (!recordId) return 0;
    const n = messagingRecordAttempts[recordId];
    return typeof n === 'number' && isFinite(n) ? n : 0;
}

function setMessagingAttemptCount(recordId, count) {
    if (!recordId) return;
    messagingRecordAttempts[recordId] = Math.max(0, count | 0);
}

function clearMessagingAttemptCount(recordId) {
    if (!recordId) return;
    delete messagingRecordAttempts[recordId];
}

// Restore state on boot
chrome.storage.local.get(['isRunning','nextFireTime','runStats','startedAt','todayCount','lastCountAt','lastPostUrl','totalProspectsCount','lastTotalProspectsAt','forceStop','isMessagingRunning','messagingNextFireTime','messagingRunStats','messagingStartedAt','messagingForceStop','messagingTargetCount','messagingCurrentCount'], (items) => {
    // Auto-fix corrupted timer if detected
    if (items.nextFireTime && typeof items.nextFireTime === 'number' && isFinite(items.nextFireTime)) {
        const now = Date.now();
        const timeDiff = items.nextFireTime - now;
        if (timeDiff > 24 * 60 * 60 * 1000) { // More than 24 hours in future
            console.error('[boot] CRITICAL: Detected corrupted timer:', new Date(items.nextFireTime), 'resetting automatically');
            items.nextFireTime = now + 2000; // Reset to 2 seconds from now
            chrome.storage.local.set({ nextFireTime: items.nextFireTime });
        }
    }
    isRunning = !!items.isRunning;
    nextFireTime = items.nextFireTime || null;
    runStats = items.runStats || runStats;
    startedAt = items.startedAt || null;
    todayCount = typeof items.todayCount === 'number' ? items.todayCount : 0;
    lastCountAt = typeof items.lastCountAt === 'number' ? items.lastCountAt : 0;
    lastPostUrl = items.lastPostUrl || null;
    totalProspectsCount = typeof items.totalProspectsCount === 'number' ? items.totalProspectsCount : 0;
    lastTotalProspectsAt = typeof items.lastTotalProspectsAt === 'number' ? items.lastTotalProspectsAt : 0;
    forceStop = !!items.forceStop;

    // Restore messaging state
    isMessagingRunning = !!items.isMessagingRunning;
    messagingNextFireTime = items.messagingNextFireTime || null;
    messagingRunStats = items.messagingRunStats || messagingRunStats;
    messagingStartedAt = items.messagingStartedAt || null;
    messagingForceStop = !!items.messagingForceStop;
    messagingTargetCount = typeof items.messagingTargetCount === 'number' ? items.messagingTargetCount : 0;
    messagingCurrentCount = typeof items.messagingCurrentCount === 'number' ? items.messagingCurrentCount : 0;
    if (isRunning && !forceStop) {
        // Validate nextFireTime to prevent corrupted values
        if (nextFireTime && typeof nextFireTime === 'number' && isFinite(nextFireTime)) {
            const now = Date.now();
            const timeDiff = nextFireTime - now;
            
            // Check if the time is reasonable (not more than 24 hours in the future)
            if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000) {
                console.log('[boot] Restoring timer with valid nextFireTime:', new Date(nextFireTime), 'delayMs:', timeDiff);
                chrome.alarms.create('autoCommentTick', { when: nextFireTime });
            } else {
                console.warn('[boot] nextFireTime is corrupted or too far in future:', new Date(nextFireTime), 'resetting to soon');
                nextFireTime = now + 1000;
                chrome.storage.local.set({ nextFireTime });
                chrome.alarms.create('autoCommentTick', { when: nextFireTime });
            }
        } else {
            // nextFireTime missing or invalid; trigger soon
            console.log('[boot] nextFireTime missing or invalid, triggering soon');
            const soon = 1000;
            nextFireTime = Date.now() + soon;
            chrome.storage.local.set({ nextFireTime });
            chrome.alarms.create('autoCommentTick', { when: nextFireTime });
        }
    } else if (forceStop) {
        console.log('[boot] Service was force stopped, not restoring alarms');
        isRunning = false;
        chrome.storage.local.set({ isRunning: false });
    }

    // Handle messaging timer restoration
    if (isMessagingRunning && !messagingForceStop) {
        console.log('[boot] Messaging service was running, checking messaging timer...');

        // Auto-fix corrupted messaging timer if detected
        if (messagingNextFireTime && typeof messagingNextFireTime === 'number' && isFinite(messagingNextFireTime)) {
            const now = Date.now();
            const timeDiff = messagingNextFireTime - now;
            if (timeDiff > 24 * 60 * 60 * 1000) { // More than 24 hours in future
                console.error('[boot] CRITICAL: Detected corrupted messaging timer:', new Date(messagingNextFireTime), 'resetting automatically');
                messagingNextFireTime = now + 2000; // Reset to 2 seconds from now
                chrome.storage.local.set({ messagingNextFireTime });
            }
        }

        // Validate messagingNextFireTime to prevent corrupted values
        if (messagingNextFireTime && typeof messagingNextFireTime === 'number' && isFinite(messagingNextFireTime)) {
            const now = Date.now();
            const timeDiff = messagingNextFireTime - now;

            // Check if the time is reasonable (not more than 24 hours in the future)
            if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000) {
                console.log('[boot] Restoring messaging timer with valid messagingNextFireTime:', new Date(messagingNextFireTime), 'delayMs:', timeDiff);
                chrome.alarms.create('autoMessagingTick', { when: messagingNextFireTime });
            } else if (timeDiff <= 0) {
                // Timer is in the past or now; trigger soon
                console.log('[boot] Messaging timer is due or past, triggering soon');
                const soon = 2000;
                messagingNextFireTime = now + soon;
                chrome.storage.local.set({ messagingNextFireTime });
                chrome.alarms.create('autoMessagingTick', { when: messagingNextFireTime });
            } else {
                // nextFireTime missing or invalid; trigger soon
                console.log('[boot] Messaging nextFireTime missing or invalid, triggering soon');
                const soon = 2000;
                messagingNextFireTime = now + soon;
                chrome.storage.local.set({ messagingNextFireTime });
                chrome.alarms.create('autoMessagingTick', { when: messagingNextFireTime });
            }
        } else if (messagingForceStop) {
            console.log('[boot] Messaging service was force stopped, not restoring alarms');
            isMessagingRunning = false;
            chrome.storage.local.set({ isMessagingRunning: false });
        }
    }
});

function getRandomDelay() {
    // Random delay between 3 and 5 minutes
    return (3 + Math.random() * 2) * 60 * 1000;
}

async function loadConfig() { return CONFIG; }

async function fetchTodayCount() {
    try {
        let count = 0;
        let offset = undefined;
        do {
            const params = new URLSearchParams();
            params.set('view', AIRTABLE_TODAY_VIEW_ID);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (data && Array.isArray(data.records)) count += data.records.length;
            offset = data && data.offset;
        } while (offset);
        todayCount = count;
        lastCountAt = Date.now();
        chrome.storage.local.set({ todayCount, lastCountAt });
        return count;
    } catch (e) {
        console.warn('Failed to fetch today count', e);
        return todayCount;
    }
}

async function fetchTotalProspectsCount() {
    console.log('[fetchTotalProspectsCount] Starting fetch from view:', AIRTABLE_VIEW_ID);
    try {
        let count = 0;
        let offset = undefined;
        do {
            const params = new URLSearchParams();
            params.set('view', AIRTABLE_VIEW_ID); // Use the main view
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            console.log('[fetchTotalProspectsCount] Fetching URL:', url.replace(AIRTABLE_API_KEY, '***'));
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (data && Array.isArray(data.records)) {
                count += data.records.length;
                console.log('[fetchTotalProspectsCount] Batch count:', data.records.length, 'total so far:', count);
            }
            offset = data && data.offset;
        } while (offset);
        console.log('[fetchTotalProspectsCount] Final count:', count);
        totalProspectsCount = count;
        lastTotalProspectsAt = Date.now();
        chrome.storage.local.set({ totalProspectsCount, lastTotalProspectsAt });
        return count;
    } catch (e) {
        console.warn('[fetchTotalProspectsCount] Failed to fetch total prospects count:', e);
        return totalProspectsCount;
    }
}

function refreshTodayCountIfStale() {
    if (!AIRTABLE_TODAY_VIEW_ID) return;
    if (Date.now() - lastCountAt > TODAY_COUNT_TTL_MS) fetchTodayCount();
}

function refreshTotalProspectsCountIfStale() {
    if (!AIRTABLE_VIEW_ID) return;
    if (Date.now() - lastTotalProspectsAt > TODAY_COUNT_TTL_MS) fetchTotalProspectsCount();
}

// Messaging count functions
async function fetchMessagingTodayCount() {
    try {
        console.log('[fetchMessagingTodayCount] Fetching today messaging count from view: viw7AoyHR9nJ8wNYD');

        let count = 0;
        let offset = undefined;

        // Use the specific "today" view provided by user
        const TODAY_VIEW_ID = 'viw7AoyHR9nJ8wNYD';

        do {
            const params = new URLSearchParams();
            params.set('view', TODAY_VIEW_ID);
            if (offset) params.set('offset', offset);

            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MESSAGING_AIRTABLE_TABLE_ID}?${params.toString()}`;

            console.log('[fetchMessagingTodayCount] Making API call to:', url.replace(AIRTABLE_API_KEY, '***'));

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[fetchMessagingTodayCount] API error:', response.status, errorText);
                return messagingTodayCount; // Return cached value on error
            }

            const data = await response.json();
            console.log('[fetchMessagingTodayCount] API response received, records:', data.records ? data.records.length : 0);

            if (data.records) {
                count += data.records.length;
                offset = data.offset;
                console.log('[fetchMessagingTodayCount] Batch count:', data.records.length, 'total so far:', count);
            } else {
                console.error('[fetchMessagingTodayCount] No records in response');
                break;
            }

        } while (offset);

        console.log('[fetchMessagingTodayCount] Final today count:', count);
        messagingTodayCount = count;
        messagingLastCountAt = Date.now();
        chrome.storage.local.set({ messagingTodayCount, messagingLastCountAt });
        return count;
    } catch (e) {
        console.warn('[fetchMessagingTodayCount] Failed to fetch messaging today count:', e);
        return messagingTodayCount;
    }
}

async function fetchTotalMessageProspectsCount() {
    try {
        let count = 0;
        let offset = undefined;
        do {
            const params = new URLSearchParams();
            params.set('view', MESSAGING_AIRTABLE_VIEW_ID);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MESSAGING_AIRTABLE_TABLE_ID}?${params.toString()}`;

            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();

            if (data && Array.isArray(data.records)) {
                count += data.records.length;
            } else if (data.error) {
                console.error('[fetchTotalMessageProspectsCount] API Error:', data.error);
                break;
            }

            offset = data && data.offset;
        } while (offset);

        totalMessageProspectsCount = count;
        lastTotalMessageProspectsAt = Date.now();
        chrome.storage.local.set({ totalMessageProspectsCount, lastTotalMessageProspectsAt });
        return count;
    } catch (e) {
        console.error('[fetchTotalMessageProspectsCount] Error:', e);
        return totalMessageProspectsCount;
    }
}

function refreshMessagingTodayCountIfStale() {
    if (Date.now() - messagingLastCountAt > TODAY_COUNT_TTL_MS) fetchMessagingTodayCount();
}

function refreshTotalMessageProspectsCountIfStale() {
    if (!MESSAGING_AIRTABLE_VIEW_ID) return;
    if (Date.now() - lastTotalMessageProspectsAt > TODAY_COUNT_TTL_MS) fetchTotalMessageProspectsCount();
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[background] Received message:', request.action, 'from:', sender.url);
    if (request.action === "start") {
        const commentCount = parseInt(request.commentCount) || 10;
        console.log('[start] Start button clicked with count:', commentCount, 'current state:', { isRunning, forceStop });
        if (isRunning || forceStop) {
            console.log('[start] Cannot start - service is already running or force stopped');
            return;
        }
        loadConfig().then(() => {
            console.log('[start] Config loaded, starting service');
            forceStop = false; // Clear force stop flag
            isRunning = true;
            // Set target and current count for commenting
            commentingTargetCount = commentCount;
            commentingCurrentCount = 0;
            // Reset session stats on Start
            runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
            // Run soon (2 seconds) for immediate feedback
            nextDelay = 2000;
            nextFireTime = Date.now() + nextDelay;
            startedAt = Date.now();
            console.log('[start] Setting storage:', { isRunning, nextFireTime, startedAt, runStats, forceStop: false, commentingTargetCount, commentingCurrentCount });
            chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats, forceStop: false, commentingTargetCount, commentingCurrentCount }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[start] Storage set error:', chrome.runtime.lastError);
                } else {
                    console.log('[start] Storage set successfully');
                }
            });
            refreshTodayCountIfStale();
            console.log('[start] Scheduling next run in', nextDelay, 'ms');
            scheduleNext(nextDelay);
        }).catch(err => {
            console.error('[start] Error loading config:', err);
        });
    } 
    else if (request.action === "stop") {
        console.log('[stop] Stopping auto-commenting service');
        forceStop = true; // Set global stop flag
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        isProcessingTick = false; // Force stop any ongoing processing
        
        // Clear ALL alarms (not just autoCommentTick)
        try {
            chrome.alarms.clearAll(() => {
                if (chrome.runtime.lastError) {
                    console.warn('[stop] Error clearing all alarms:', chrome.runtime.lastError.message);
                } else {
                    console.log('[stop] Successfully cleared all alarms');
                }
            });
        } catch (e) {
            console.warn('[stop] Failed to clear alarms:', e);
        }
        
        // Force close any active tabs and clear active task
        (async () => {
            try {
                const active = await getActiveTask();
                if (active && active.tabId) {
                    console.log('[stop] Closing active tab:', active.tabId);
                    chrome.tabs.remove(active.tabId, () => void chrome.runtime.lastError);
                }
                await clearActiveTask();
            } catch (e) {
                console.warn('[stop] Error clearing active task:', e);
            }
        })();
        
        // Reset stats on Stop as requested
        runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        // Reset commenting counts
        commentingTargetCount = 0;
        commentingCurrentCount = 0;
        chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats, forceStop: true, commentingTargetCount, commentingCurrentCount });
        
        console.log('[stop] Service stopped successfully');
    }
    else if (request.action === "getStatus") {
        refreshTodayCountIfStale();
        refreshTotalProspectsCountIfStale();
        // Include active task and current attempt count (if any) for UI transparency
        (async () => {
            try {
                await loadRecordAttempts();
                const activeTask = await getActiveTask();
                const currentAttempt = activeTask ? getAttemptCount(activeTask.recordId) : 0;
                sendResponse({ isRunning, nextFireTime, runStats, startedAt, todayCount, lastPostUrl, totalProspects: totalProspectsCount, activeTask, isProcessingTick, currentAttempt, commentingTargetCount, commentingCurrentCount });
            } catch (_) {
                sendResponse({ isRunning, nextFireTime, runStats, startedAt, todayCount, lastPostUrl, totalProspects: totalProspectsCount, activeTask: null, isProcessingTick, currentAttempt: 0, commentingTargetCount, commentingCurrentCount });
            }
        })();
        return true; // async sendResponse
        // No need to return true, since sendResponse is synchronous here
    }

    else if (request.action === "getTodayNow") {
        // Respond after fetching to provide an immediate, accurate value
        fetchTodayCount()
            .then((cnt) => sendResponse({ todayCount: cnt }))
            .catch(() => sendResponse({ todayCount }));
        return true; // keep the message channel open for async response
    }
    else if (request.action === "getTotalProspectsNow") {
        // Always fetch fresh data for immediate accuracy
        fetchTotalProspectsCount()
            .then((cnt) => sendResponse({ totalProspects: cnt }))
            .catch((err) => {
                console.error('[getTotalProspectsNow] Error fetching count:', err);
                sendResponse({ totalProspects: totalProspectsCount });
            });
        return true; // keep the message channel open for async response
    }
    else if (request.action === "forceResetTimer") {
        console.log('[forceResetTimer] Manually resetting timer');
        nextFireTime = Date.now() + 2000; // Reset to 2 seconds from now
        chrome.storage.local.set({ nextFireTime });
        chrome.alarms.clearAll(() => {
            chrome.alarms.create('autoCommentTick', { when: nextFireTime });
        });
        sendResponse({ success: true, nextFireTime });
    }

    // Messaging handlers
    else if (request.action === "startMessaging") {
        console.log('[startMessaging] Start button clicked, current state:', { isMessagingRunning, messagingForceStop });
        console.log('[startMessaging] Current counts - target:', messagingTargetCount, 'current:', messagingCurrentCount);

        // Force reset state if it's stuck from a previous run
        if (messagingCurrentCount >= messagingTargetCount && messagingTargetCount > 0) {
            console.log('[startMessaging] Previous run completed or stuck, resetting state');
            isMessagingRunning = false;
            messagingForceStop = false;
            messagingCurrentCount = 0;
            messagingTargetCount = 0;
            chrome.storage.local.set({
                isMessagingRunning: false,
                messagingForceStop: false,
                messagingCurrentCount: 0,
                messagingTargetCount: 0
            });
        }

        if (isMessagingRunning || messagingForceStop) {
            console.log('[startMessaging] Cannot start - service already running or force stopped');
            console.log('[startMessaging] isMessagingRunning:', isMessagingRunning, 'messagingForceStop:', messagingForceStop);
            return;
        }
        messagingTargetCount = parseInt(request.messageCount) || 10;
        messagingCurrentCount = 0;
        console.log('[startMessaging] Config loaded, starting messaging service for', messagingTargetCount, 'messages');
        messagingForceStop = false; // Clear force stop flag
        isMessagingRunning = true;
        // Reset session stats on Start
        messagingRunStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        // Run soon (2 seconds) for immediate feedback
        messagingNextDelay = 2000;
        messagingNextFireTime = Date.now() + messagingNextDelay;
        messagingStartedAt = Date.now();
        console.log('[startMessaging] Setting storage:', { isMessagingRunning, messagingNextFireTime, messagingStartedAt, messagingRunStats, messagingForceStop: false });
        chrome.storage.local.set({ isMessagingRunning, messagingNextFireTime, messagingStartedAt, messagingRunStats, messagingForceStop: false, messagingTargetCount, messagingCurrentCount }, () => {
            if (chrome.runtime.lastError) {
                console.error('[startMessaging] Storage set error:', chrome.runtime.lastError);
            } else {
                console.log('[startMessaging] Storage set successfully');
            }
        });
        refreshMessagingTodayCountIfStale();
        console.log('[startMessaging] Scheduling next messaging run in', messagingNextDelay, 'ms');
        scheduleNextMessaging(messagingNextDelay);
        sendResponse({ success: true });
    }

    else if (request.action === "stopMessaging") {
        console.log('[stopMessaging] Stopping auto-messaging service');
        messagingForceStop = true; // Set global stop flag
        isMessagingRunning = false;
        messagingNextFireTime = null;
        messagingStartedAt = null;
        isMessagingProcessingTick = false; // Force stop any ongoing processing

        // Clear ALL messaging alarms
        try {
            chrome.alarms.clear('autoMessagingTick', () => {
                if (chrome.runtime.lastError) {
                    console.warn('[stopMessaging] Error clearing messaging alarm:', chrome.runtime.lastError.message);
                } else {
                    console.log('[stopMessaging] Successfully cleared messaging alarm');
                }
            });
        } catch (e) {
            console.warn('[stopMessaging] Failed to clear messaging alarms:', e);
        }

        // Force close any active messaging tabs and clear active task
        (async () => {
            try {
                const active = await getActiveMessagingTask();
                if (active && active.tabId) {
                    console.log('[stopMessaging] Closing active messaging tab:', active.tabId);
                    chrome.tabs.remove(active.tabId, () => void chrome.runtime.lastError);
                }
                await clearActiveMessagingTask();
            } catch (e) {
                console.warn('[stopMessaging] Error clearing active messaging task:', e);
            }
        })();

        // Reset stats on Stop
        messagingRunStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        messagingCurrentCount = 0;
        chrome.storage.local.set({ isMessagingRunning, messagingNextFireTime, messagingStartedAt, messagingRunStats, messagingForceStop: true, messagingCurrentCount });

        console.log('[stopMessaging] Messaging service stopped successfully');
        sendResponse({ success: true });
    }

    else if (request.action === "getMessagingStatus") {
        refreshMessagingTodayCountIfStale();
        refreshTotalMessageProspectsCountIfStale();
        // Include active task and current attempt count for UI transparency
        (async () => {
            try {
                await loadMessagingRecordAttempts();
                const activeMessagingTask = await getActiveMessagingTask();
                const messagingCurrentAttempt = activeMessagingTask ? getMessagingAttemptCount(activeMessagingTask.recordId) : 0;
                sendResponse({
                    isMessagingRunning,
                    messagingNextFireTime,
                    messagingRunStats,
                    messagingStartedAt,
                    messagingTodayCount,
                    messagingLastProfileUrl,
                    totalMessageProspects: totalMessageProspectsCount,
                    activeMessagingTask,
                    isMessagingProcessingTick,
                    messagingCurrentAttempt,
                    messagingTargetCount,
                    messagingCurrentCount
                });
            } catch (_) {
                sendResponse({
                    isMessagingRunning,
                    messagingNextFireTime,
                    messagingRunStats,
                    messagingStartedAt,
                    messagingTodayCount,
                    messagingLastProfileUrl,
                    totalMessageProspects: totalMessageProspectsCount,
                    activeMessagingTask: null,
                    isMessagingProcessingTick,
                    messagingCurrentAttempt: 0,
                    messagingTargetCount,
                    messagingCurrentCount
                });
            }
        })();
        return true; // async sendResponse
    }

    else if (request.action === "getMessagingTodayNow") {
        // Respond after fetching to provide an immediate, accurate value
        fetchMessagingTodayCount()
            .then((cnt) => sendResponse({ messagingTodayCount: cnt }))
            .catch(() => sendResponse({ messagingTodayCount }));
        return true; // keep the message channel open for async response
    }

    else if (request.action === "getTotalMessageProspectsNow") {
        fetchTotalMessageProspectsCount()
            .then((count) => {
                sendResponse({ totalMessageProspects: count });
            })
            .catch((err) => {
                console.error('[getTotalMessageProspectsNow] Error:', err);
                sendResponse({ totalMessageProspects: 0 });
            });
        return true;
    }

    else if (request.action === "forceResetMessagingTimer") {
        console.log('[forceResetMessagingTimer] Manually resetting messaging timer');
        messagingNextFireTime = Date.now() + 2000; // Reset to 2 seconds from now
        chrome.storage.local.set({ messagingNextFireTime });
        chrome.alarms.clear('autoMessagingTick', () => {
            chrome.alarms.create('autoMessagingTick', { when: messagingNextFireTime });
        });
        sendResponse({ success: true, messagingNextFireTime });
    }

    else if (request.action === "forceResetMessagingState") {
        console.log('[forceResetMessagingState] Force resetting messaging state');
        // Reset all messaging state variables
        isMessagingRunning = false;
        messagingNextFireTime = null;
        messagingStartedAt = null;
        messagingForceStop = false;
        messagingTargetCount = 0;
        messagingCurrentCount = 0;
        messagingRunStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        isMessagingProcessingTick = false;

        // Clear any pending alarms
        chrome.alarms.clear('autoMessagingTick', () => void chrome.runtime.lastError);

        // Save reset state to storage
        chrome.storage.local.set({
            isMessagingRunning: false,
            messagingNextFireTime: null,
            messagingStartedAt: null,
            messagingForceStop: false,
            messagingTargetCount: 0,
            messagingCurrentCount: 0,
            messagingRunStats
        });

        console.log('[forceResetMessagingState] Messaging state reset complete');
        sendResponse({ success: true });
    }
});

// If the active tab is closed (manually or by code), clear the active task lock
try {
    chrome.tabs.onRemoved.addListener(async (closedTabId) => {
        try {
            const active = await getActiveTask();
            if (active && active.tabId === closedTabId) {
                await clearActiveTask();
                console.log('[activeTask] Cleared on tab close');
            }
        } catch (e) {
            console.warn('Failed to clear activeTask on tab close', e);
        }
    });
} catch (_) { /* not available in some contexts */ }

function scheduleNext(delayMs) {
    if (!isRunning || forceStop) {
        console.log('[scheduleNext] Not scheduling - service is stopped or force stopped');
        return;
    }
    const safeDelay = (typeof delayMs === 'number' && isFinite(delayMs) && delayMs >= 0) ? delayMs : 2000;
    const when = Date.now() + safeDelay;
    nextFireTime = when;
    console.log('[scheduleNext] Setting nextFireTime to:', new Date(when), 'delayMs:', delayMs, 'safeDelay:', safeDelay);
    
    // Validate the calculated time
    if (when > Date.now() + 24 * 60 * 60 * 1000) { // More than 24 hours in the future
        console.error('[scheduleNext] ERROR: Calculated time is too far in the future:', new Date(when), 'delayMs:', delayMs, 'safeDelay:', safeDelay);
        // Reset to a safe value
        nextFireTime = Date.now() + 2000;
        chrome.storage.local.set({ nextFireTime });
        console.log('[scheduleNext] Reset to safe value:', new Date(nextFireTime));
        return;
    }
    
    try {
        console.log('[scheduleNext] Clearing existing alarm');
        chrome.alarms.clear('autoCommentTick', () => {
            if (chrome.runtime.lastError) {
                console.warn('[scheduleNext] Error clearing alarm:', chrome.runtime.lastError);
            } else {
                console.log('[scheduleNext] Alarm cleared successfully');
            }
            if (!chrome.alarms || typeof chrome.alarms.create !== 'function') {
                console.warn('[alarms] API not available in this context');
                return;
            }
            console.log('[scheduleNext] Creating new alarm for:', new Date(when));
            chrome.alarms.create('autoCommentTick', { when: when }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[scheduleNext] Error creating alarm:', chrome.runtime.lastError);
                } else {
                    console.log('[scheduleNext] Alarm created successfully');
                }
            });
        });
    } catch (e) {
        console.error('Failed to schedule alarm', e);
    }
    chrome.storage.local.set({ nextFireTime });
    console.log('[scheduleNext] Saved nextFireTime to storage:', nextFireTime);
}

function scheduleNextMessaging(delayMs) {
    if (!isMessagingRunning || messagingForceStop) {
        console.log('[scheduleNextMessaging] Not scheduling - messaging service is stopped or force stopped');
        return;
    }
    const safeDelay = (typeof delayMs === 'number' && isFinite(delayMs) && delayMs >= 0) ? delayMs : 2000;
    const when = Date.now() + safeDelay;
    messagingNextFireTime = when;
    console.log('[scheduleNextMessaging] Setting messagingNextFireTime to:', new Date(when), 'delayMs:', delayMs, 'safeDelay:', safeDelay);

    // Validate the calculated time
    if (when > Date.now() + 24 * 60 * 60 * 1000) { // More than 24 hours in the future
        console.error('[scheduleNextMessaging] ERROR: Calculated time is too far in the future:', new Date(when), 'delayMs:', delayMs, 'safeDelay:', safeDelay);
        // Reset to a safe value
        messagingNextFireTime = Date.now() + 2000;
        chrome.storage.local.set({ messagingNextFireTime });
        console.log('[scheduleNextMessaging] Reset to safe value:', new Date(messagingNextFireTime));
        return;
    }

    try {
        console.log('[scheduleNextMessaging] Clearing existing messaging alarm');
        chrome.alarms.clear('autoMessagingTick', () => {
            if (chrome.runtime.lastError) {
                console.warn('[scheduleNextMessaging] Error clearing messaging alarm:', chrome.runtime.lastError);
            } else {
                console.log('[scheduleNextMessaging] Messaging alarm cleared successfully');
            }
            if (!chrome.alarms || typeof chrome.alarms.create !== 'function') {
                console.warn('[alarms] API not available in this context');
                return;
            }
            console.log('[scheduleNextMessaging] Creating new messaging alarm for:', new Date(when));
            chrome.alarms.create('autoMessagingTick', { when: when }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[scheduleNextMessaging] Error creating messaging alarm:', chrome.runtime.lastError);
                } else {
                    console.log('[scheduleNextMessaging] Messaging alarm created successfully');
                }
            });
        });
    } catch (e) {
        console.error('Failed to schedule messaging alarm', e);
    }
    chrome.storage.local.set({ messagingNextFireTime });
    console.log('[scheduleNextMessaging] Saved messagingNextFireTime to storage:', messagingNextFireTime);
}

async function processRecords() {
    console.log('[processRecords] Called, current state:', { isRunning, forceStop, isProcessingTick });
    if (!isRunning || forceStop) {
        console.log('[processRecords] Service is stopped or force stopped, not processing');
        return;
    }

    // Check if we've reached the target count
    if (commentingCurrentCount >= commentingTargetCount) {
        console.log('[processRecords] Reached target count', commentingCurrentCount, 'of', commentingTargetCount, '- stopping commenting');
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
        return;
    }

    if (isProcessingTick) {
        console.log('[tick] already processing; skipping');
        return;
    }
    isProcessingTick = true;
    console.log('[processRecords] Starting to process records');
    // Clear any pending alarm to avoid re-entry while we work
    try { chrome.alarms.clear('autoCommentTick', () => void chrome.runtime.lastError); } catch {}
    if (!CONFIG) {
        await loadConfig();
        if (!CONFIG) return;
    }

    // If an active task exists and is still valid, skip starting a new one
    try {
        const active = await getActiveTask();
        if (active) {
            const age = Date.now() - (active.startedAt || 0);
            if (age < ACTIVE_TASK_TTL_MS) {
                if (active.tabId) {
                    const tab = await tabsGet(active.tabId);
                    if (tab) {
                        console.log('[tick] Active task in progress; skipping new open. URL:', active.postUrl);
                        scheduleNext(30 * 1000); // check again in 30s
                        isProcessingTick = false;
                        return;
                    }
                }
                // If tab missing but within TTL, still give it some time, then retry soon
                console.log('[tick] Active task lock present without tab; deferring');
                scheduleNext(20 * 1000);
                isProcessingTick = false;
                return;
            } else {
                // Stale lock
                await clearActiveTask();
            }
        }
    } catch (e) {
        console.warn('Active task check failed', e);
    }

    console.log('[processRecords] Fetching next pending record...');
    const record = await getNextPendingRecordNonDuplicate();
    console.log('[processRecords] Record fetched:', record ? 'Found record' : 'No record found');
    if (record) {
        console.log('[processRecords] Record details:', { id: record.id, postUrl: record.fields['Post URL'], commentText: record.fields['Generated Comment'] });
    }

    if (!record) {
        console.log("No pending records (or all were duplicates). Will check again later.");
        runStats.lastRun = Date.now();
        runStats.lastError = null;
        if (isRunning) {
            nextDelay = getRandomDelay(); // Random delay between 5 and 7 minutes
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
            isProcessingTick = false;
        } else {
            chrome.storage.local.set({ runStats });
            isProcessingTick = false;
        }
        return;
    }

    // Validate that the record has required fields
    const postUrl = record.fields["Post URL"];
    const commentText = record.fields["Generated Comment"];
    
    if (!postUrl || !commentText) {
        console.warn(`Record ${record.id} missing required fields:`, {
            hasPostUrl: !!postUrl,
            hasCommentText: !!commentText,
            fields: record.fields
        });
        
        // Mark this record as done to avoid getting stuck on it
        try {
            await markRecordDone(record.id, null);
            console.log(`Marked incomplete record ${record.id} as done to avoid getting stuck`);
        } catch (e) {
            console.error(`Failed to mark incomplete record ${record.id} as done:`, e);
        }
        
        // Schedule next attempt
        if (isRunning) {
            nextDelay = 30 * 1000; // Try again in 30 seconds
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
        }
        isProcessingTick = false;
        return;
    }

    console.log(`Processing LinkedIn post: ${postUrl}`);

    // Track attempts for this record and auto-skip after too many failures
    await loadRecordAttempts();
    const attempts = getAttemptCount(record.id) + 1;
    setAttemptCount(record.id, attempts);
    await saveRecordAttempts();
    console.log(`[attempts] Record ${record.id} attempt #${attempts}`);
    if (attempts > MAX_ATTEMPTS_PER_RECORD) {
        console.warn(`[attempts] Exceeded max attempts for ${record.id}. Marking as done and skipping.`);
        try {
            await markRecordDone(record.id, null);
        } catch (e) {
            console.warn('Failed to mark as done after max attempts', e);
        }
        clearAttemptCount(record.id);
        await saveRecordAttempts();
        if (isRunning) {
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ nextFireTime });
            scheduleNext(nextDelay);
        }
        isProcessingTick = false;
        return;
    }

    // Persist the active task immediately to avoid duplicate opens on SW restart
    await setActiveTask({ recordId: record.id, postUrl, startedAt: Date.now() });

    // First, try to post comment without opening a tab (background approach)
    console.log('[background] Attempting background comment posting for:', postUrl);
    
    // Try background approach first - inject content script into existing LinkedIn tab if available
    try {
        const existingTabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
        if (existingTabs.length > 0) {
            console.log('[background] Found existing LinkedIn tab, attempting background comment');
            const existingTab = existingTabs[0];
            
            // Try to inject content script into existing tab
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: existingTab.id },
                    files: ['src/content.js']
                });
                
                // Send message to existing tab
                chrome.tabs.sendMessage(existingTab.id, { action: "postComment", commentText });
                
                // Set up response listener
                const onResponse = function(message, senderInfo) {
                    if (!senderInfo.tab || senderInfo.tab.id !== existingTab.id) return;
                    if (message.action === "commentResult") {
                        chrome.runtime.onMessage.removeListener(onResponse);
                        if (message.success) {
                            console.log('[background] Background comment success (existing tab) for record:', record.id);
                            (async () => {
                                await handleCommentSuccess(record, postUrl);
                                // Do NOT close the user's existing tab
                            })();
                        } else {
                            console.warn('[background] Background comment failed (existing tab). Reason:', message.reason);
                            (async () => {
                                runStats.failures += 1;
                                runStats.lastRun = Date.now();
                                runStats.lastError = message.reason || 'comment_failed';
                                chrome.storage.local.set({ runStats });
                                await clearActiveTask();
                                if (isRunning) {
                                    nextDelay = getRandomDelay();
                                    nextFireTime = Date.now() + nextDelay;
                                    chrome.storage.local.set({ nextFireTime, runStats });
                                    scheduleNext(nextDelay);
                                }
                                isProcessingTick = false;
                            })();
                        }
                    }
                };
                chrome.runtime.onMessage.addListener(onResponse);
                
                // Set timeout for background approach
                setTimeout(async () => {
                    try {
                        const active = await getActiveTask();
                        if (active && active.recordId === record.id) {
                            console.log('[background] Background approach timed out, falling back to tab creation');
                            // Fall back to tab creation
                            createTabForComment(postUrl, record, commentText);
                        }
                    } catch (e) {
                        console.error('[background] Error in background timeout:', e);
                        createTabForComment(postUrl, record, commentText);
                    }
                }, 30000); // 30 second timeout for background approach
                
                return; // Exit early if background approach is attempted
            } catch (e) {
                console.log('[background] Failed to inject into existing tab, falling back to tab creation:', e);
            }
        }
    } catch (e) {
        console.log('[background] Error checking existing tabs, falling back to tab creation:', e);
    }
    
        // Fall back to tab creation if background approach fails
    createTabForComment(postUrl, record, commentText);
}

// Helper function to create tab for comment posting
function createTabForComment(postUrl, record, commentText) {
    console.log('[background] Creating tab for comment posting');
    
    chrome.tabs.create({ url: postUrl, active: false }, async (tab) => {
        // Update active task with tabId
        try {
            const active = await getActiveTask();
            if (active && active.postUrl === postUrl && !active.tabId) {
                active.tabId = tab && tab.id;
                await setActiveTask(active);
            }
        } catch {}
        
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

                // Add a 5-second delay before injecting the content script
                setTimeout(async () => {
                    // Give the tab minimal attention - brief activation then background
                    try {
                        // Brief activation to ensure LinkedIn loads properly
                        await chrome.tabs.update(tab.id, { active: true });
                        console.log('[background] Tab briefly activated for LinkedIn initialization');
                        
                        // Wait 3 seconds for LinkedIn to initialize
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Return to background
                        await chrome.tabs.update(tab.id, { 
                            active: false,  // Return to background
                            highlighted: false,  // Don't highlight
                            pinned: false  // Ensure not pinned
                        });
                        
                        console.log('[background] Tab returned to background for silent operation');
                    } catch (e) {
                        console.warn('[background] Error preparing tab:', e);
                    }
                    
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content.js']
                    }, () => {
                        console.log('[background] Content script injected, sending postComment message');
                        chrome.tabs.sendMessage(tab.id, { action: "postComment", commentText });

                        const onResponse = function(message, senderInfo) {
                            if (!senderInfo.tab || senderInfo.tab.id !== tab.id) return;
                            if (message.action === "commentResult") {
                                chrome.runtime.onMessage.removeListener(onResponse);
                                if (message.success) {
                                    console.log('[background] Comment success for tab', tab.id, 'record', record.id);
                                    (async () => {
                                        await handleCommentSuccess(record, postUrl);
                                        // Close the tab on success
                                        try {
                                            const tabExists = await tabsGet(tab.id);
                                            if (tabExists) chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
                                        } catch {}
                                    })();
                                } else {
                                    console.warn('[background] Comment failed for tab', tab.id, 'reason:', message.reason);
                                    // Failure path: close tab and schedule next
                                    (async () => {
                                        runStats.failures += 1;
                                        runStats.lastRun = Date.now();
                                        runStats.lastError = message.reason || 'comment_failed';
                                        chrome.storage.local.set({ runStats });
                                        try {
                                            const tabExists = await tabsGet(tab.id);
                                            if (tabExists) chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
                                        } catch {}
                                        await clearActiveTask();
                                        if (isRunning) {
                                            nextDelay = getRandomDelay();
                                            nextFireTime = Date.now() + nextDelay;
                                            chrome.storage.local.set({ nextFireTime, runStats });
                                            scheduleNext(nextDelay);
                                        }
                                        isProcessingTick = false;
                                    })();
                                }
                            }
                        };
                        chrome.runtime.onMessage.addListener(onResponse);
                        
                        // Add a timeout to handle cases where comment posting fails
                        setTimeout(async () => {
                            try {
                                const active = await getActiveTask();
                                if (active && active.recordId === record.id) {
                                    console.warn('[timeout] Comment posting timed out for record:', record.id);
                                    // Mark as failed and move on
                                    runStats.failures += 1;
                                    runStats.lastRun = Date.now();
                                    runStats.lastError = 'Comment posting timed out';
                                    chrome.storage.local.set({ runStats });
                                    
                                    // Close the tab
                                    const tabExists = await tabsGet(tab.id);
                                    if (tabExists) {
                                        chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
                                    }
                                    
                                    // Clear active task and schedule next
                                    await clearActiveTask();
                                    if (isRunning) {
                                        nextDelay = getRandomDelay();
                                        nextFireTime = Date.now() + nextDelay;
                                        chrome.storage.local.set({ nextFireTime, runStats });
                                        scheduleNext(nextDelay);
                                        console.log('[timeout] Scheduled next run in', nextDelay, 'ms');
                                    }
                                    isProcessingTick = false;
                                } else {
                                    console.log('[timeout] Active task not found or different record, skipping timeout handling');
                                }
                            } catch (e) {
                                console.error('[timeout] Error handling timeout:', e);
                            }
                        }, 90000); // 90 second timeout for tab approach
                    });
                }, 5000); // 5,000 ms = 5 seconds
            }
        });
    });
}

// Helper function to handle successful comment posting
async function handleCommentSuccess(record, postUrl) {
    try {
        console.log('[finalize] Immediately updating Airtable for record:', record.id);
        await markRecordDone(record.id, null);
        console.log('[finalize] Marked record as done in Airtable:', record.id);
        runStats.processed += 1;
        runStats.successes += 1;
        runStats.lastRun = Date.now();
        runStats.lastError = null;

        // Increment commenting current count
        commentingCurrentCount += 1;
        console.log('[finalize] Commenting progress:', commentingCurrentCount, 'of', commentingTargetCount);

        // Track the last successful post URL
        lastPostUrl = postUrl;
        todayCount += 1;
        lastCountAt = Date.now();
        chrome.storage.local.set({ todayCount, lastCountAt, lastPostUrl, commentingCurrentCount });
        
        // Clear active task on success
        await clearActiveTask();
        
        // Schedule next
        if (isRunning) {
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ nextFireTime, runStats });
            scheduleNext(nextDelay);
        }
        isProcessingTick = false;
        
        // Note: Tab closing is handled by the individual tab creation functions
        // since they have access to the tab ID
    } catch (err) {
        console.error('[finalize] Error in markRecordDone:', err);
        runStats.failures += 1;
        runStats.lastRun = Date.now();
        runStats.lastError = String(err && err.message ? err.message : err);
        chrome.storage.local.set({ runStats });
        isProcessingTick = false;
    }
}

async function processMessagingRecords() {
    console.log('[processMessagingRecords] Called, current state:', { isMessagingRunning, messagingForceStop, isMessagingProcessingTick });
    if (!isMessagingRunning || messagingForceStop) {
        console.log('[processMessagingRecords] Messaging service is stopped or force stopped, not processing');
        return;
    }
    if (isMessagingProcessingTick) {
        console.log('[messagingTick] already processing; skipping');
        return;
    }

    // Check if we've reached the target count
    if (messagingCurrentCount >= messagingTargetCount) {
        console.log('[processMessagingRecords] Reached target count', messagingCurrentCount, 'of', messagingTargetCount, '- stopping messaging');
        isMessagingRunning = false;
        messagingNextFireTime = null;
        messagingStartedAt = null;
        chrome.storage.local.set({ isMessagingRunning, messagingNextFireTime, messagingStartedAt });
        return;
    }

    isMessagingProcessingTick = true;
    console.log('[processMessagingRecords] Starting to process messaging records');

    // Clear any pending alarm to avoid re-entry while we work
    try { chrome.alarms.clear('autoMessagingTick', () => void chrome.runtime.lastError); } catch {}

    console.log('[processMessagingRecords] Fetching next pending message record...');

    // Define the function inline to avoid scoping issues
    const getNextPendingMessageRecordInline = async () => {
        console.log('[getNextPendingMessageRecordInline] Function called!');
        const params = new URLSearchParams();
        if (MESSAGING_AIRTABLE_VIEW_ID) params.set('view', MESSAGING_AIRTABLE_VIEW_ID);
        params.set('pageSize', '1');
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MESSAGING_AIRTABLE_TABLE_ID}?${params.toString()}`;
        console.log('[getNextPendingMessageRecordInline] Making API call...');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' } });
        const data = await response.json();
        console.log('[getNextPendingMessageRecordInline] API response received');

        if (!data.records) {
            console.error("[getNextPendingMessageRecordInline] No records in response");
            return null;
        }
        return data.records.length > 0 ? data.records[0] : null;
    };

    let record;
    try {
        record = await getNextPendingMessageRecordInline();
        console.log('[processMessagingRecords] Record fetched:', record ? record.id : 'null');
    } catch (fetchError) {
        console.error('[processMessagingRecords] Error fetching record:', fetchError);
        // Mark this as a failure and try again later
        messagingRunStats.failures += 1;
        messagingRunStats.lastRun = Date.now();
        messagingRunStats.lastError = `Fetch error: ${fetchError.message}`;

        // Schedule retry in 30 seconds
        messagingNextDelay = 30000;
        messagingNextFireTime = Date.now() + messagingNextDelay;
        chrome.storage.local.set({ messagingRunStats, messagingNextFireTime, messagingCurrentCount });
        scheduleNextMessaging(messagingNextDelay);

        isMessagingProcessingTick = false;
        return;
    }
    if (record) {
        console.log('[processMessagingRecords] Message record details:', { id: record.id, profileUrl: record.fields['LinkedinURL'], messageText: record.fields['Message'] });
    }

    if (!record) {
        console.log("No pending message records. Will check again later.");
        messagingRunStats.lastRun = Date.now();
        messagingRunStats.lastError = null;
        if (isMessagingRunning) {
            messagingNextDelay = getRandomDelay(); // Random delay between 5 and 7 minutes
            messagingNextFireTime = Date.now() + messagingNextDelay;
            chrome.storage.local.set({ messagingRunStats, messagingNextFireTime });
            scheduleNextMessaging(messagingNextDelay);
            isMessagingProcessingTick = false;
        } else {
            chrome.storage.local.set({ messagingRunStats });
            isMessagingProcessingTick = false;
        }
        return;
    }

    // Validate that the record has required fields
    const profileUrl = record.fields["LinkedinURL"];
    const messageText = record.fields["Message"];

    if (!profileUrl || !messageText) {
        console.warn(`Message record ${record.id} missing required fields:`, {
            hasProfileUrl: !!profileUrl,
            hasMessageText: !!messageText,
            fields: record.fields
        });

        // Mark this record as done to avoid getting stuck on it
        try {
            await markMessageRecordDone(record.id, MESSAGING_CONFIG);
            console.log(`Marked incomplete message record ${record.id} as done to avoid getting stuck`);
        } catch (e) {
            console.error(`Failed to mark incomplete message record ${record.id} as done:`, e);
        }

        // Schedule next attempt
        if (isMessagingRunning) {
            messagingNextDelay = 30 * 1000; // Try again in 30 seconds
            messagingNextFireTime = Date.now() + messagingNextDelay;
            chrome.storage.local.set({ messagingRunStats, messagingNextFireTime });
            scheduleNextMessaging(messagingNextDelay);
        }
        isMessagingProcessingTick = false;
        return;
    }

    console.log(`Processing LinkedIn profile for messaging: ${profileUrl}`);

    // Track attempts for this record and auto-skip after too many failures
    await loadMessagingRecordAttempts();
    const attempts = getMessagingAttemptCount(record.id) + 1;
    setMessagingAttemptCount(record.id, attempts);
    await saveMessagingRecordAttempts();
    console.log(`[messagingAttempts] Record ${record.id} attempt #${attempts}`);
    if (attempts > MAX_ATTEMPTS_PER_RECORD) {
        console.warn(`[messagingAttempts] Exceeded max attempts for ${record.id}. Marking as done and skipping.`);
        try {
            await markMessageRecordDone(record.id, MESSAGING_CONFIG);
        } catch (e) {
            console.warn('Failed to mark message as done after max attempts', e);
        }
        clearMessagingAttemptCount(record.id);
        await saveMessagingRecordAttempts();
        if (isMessagingRunning) {
            messagingNextDelay = getRandomDelay();
            messagingNextFireTime = Date.now() + messagingNextDelay;
            chrome.storage.local.set({ messagingNextFireTime });
            scheduleNextMessaging(messagingNextDelay);
        }
        isMessagingProcessingTick = false;
        return;
    }

    // Persist the active messaging task immediately to avoid duplicate opens on SW restart
    await setActiveMessagingTask({ recordId: record.id, profileUrl, startedAt: Date.now() });

    // First, try to send message by opening the profile in a new tab
    console.log('[messaging] Opening profile for messaging:', profileUrl);

    try {
        const tab = await chrome.tabs.create({
            url: profileUrl,
            active: false // Don't focus the tab
        });

        console.log('[messaging] Created tab for messaging:', tab.id, 'URL:', profileUrl);

        // Update the active task with tab ID
        await setActiveMessagingTask({ recordId: record.id, profileUrl, tabId: tab.id, startedAt: Date.now() });

        // Wait for page to load, then inject content script
        setTimeout(async () => {
            try {
                // Inject content script into the tab
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content.js']
                });

                // Send message to content script to handle messaging
                chrome.tabs.sendMessage(tab.id, {
                    action: "sendMessage",
                    messageText,
                    profileUrl
                });

                // Set up response listener
                const onResponse = (response, sender) => {
                    if (sender.tab && sender.tab.id === tab.id) {
                        chrome.runtime.onMessage.removeListener(onResponse);
                        handleMessagingResponse(response, record.id, tab.id);
                    }
                };
                chrome.runtime.onMessage.addListener(onResponse);

                // Set a timeout to handle cases where messaging fails
                setTimeout(async () => {
                    try {
                        const active = await getActiveMessagingTask();
                        if (active && active.tabId === tab.id && active.recordId === record.id) {
                            console.log('[messagingTimeout] Messaging timeout reached for tab', tab.id, 'record', record.id);
                            await handleMessagingResponse({ success: false, error: 'Timeout' }, record.id, tab.id);
                        } else {
                            console.log('[messagingTimeout] Active messaging task not found or different record, skipping timeout handling');
                        }
                    } catch (e) {
                        console.error('[messagingTimeout] Error handling timeout:', e);
                    }
                }, 60000); // 60 second timeout for messaging

            } catch (e) {
                console.error('[messaging] Error setting up messaging in tab:', e);
                await handleMessagingResponse({ success: false, error: String(e) }, record.id, tab.id);
            }
        }, 3000); // Wait 3 seconds for page load

    } catch (e) {
        console.error('[messaging] Error creating tab:', e);
        await handleMessagingResponse({ success: false, error: String(e) }, record.id, null);
    }
}

async function handleMessagingResponse(response, recordId, tabId) {
    console.log('[handleMessagingResponse] Response:', response, 'recordId:', recordId, 'tabId:', tabId);

    try {
        if (response && response.success) {
            console.log('[handleMessagingResponse] Messaging successful for record:', recordId);
            messagingRunStats.successes += 1;
            messagingCurrentCount += 1;
            messagingLastProfileUrl = response.profileUrl || null;

            // Mark record as done
            try {
                await markMessageRecordDone(recordId, MESSAGING_CONFIG);
                console.log('[handleMessagingResponse] Marked message record as done:', recordId);
            } catch (e) {
                console.error('[handleMessagingResponse] Error marking message record as done:', e);
            }

        } else {
            console.log('[handleMessagingResponse] Messaging failed for record:', recordId, 'error:', response?.error);
            messagingRunStats.failures += 1;
            messagingRunStats.lastError = response?.error || 'Unknown error';
        }

        messagingRunStats.processed += 1;
        messagingRunStats.lastRun = Date.now();

        // Clear the active task
        await clearActiveMessagingTask();

        // Close the tab
        if (tabId) {
            try {
                chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
                console.log('[handleMessagingResponse] Closed messaging tab:', tabId);
            } catch (e) {
                console.warn('[handleMessagingResponse] Error closing messaging tab:', e);
            }
        }

        // Schedule next messaging if still running and haven't reached target
        if (isMessagingRunning && messagingCurrentCount < messagingTargetCount) {
            // Use fixed 3-5 minute delay between messages
            messagingNextDelay = (3 + Math.random() * 2) * 60 * 1000; // 3-5 minutes in milliseconds
            messagingNextFireTime = Date.now() + messagingNextDelay;
            chrome.storage.local.set({ messagingRunStats, messagingNextFireTime, messagingCurrentCount });
            scheduleNextMessaging(messagingNextDelay);
            console.log(`[handleMessagingResponse] Scheduled next message in ${Math.round(messagingNextDelay/1000/60)} minutes`);
        } else {
            // Stop if we've reached the target or service was stopped
            isMessagingRunning = false;
            messagingNextFireTime = null;
            messagingStartedAt = null;
            chrome.storage.local.set({ isMessagingRunning, messagingNextFireTime, messagingStartedAt, messagingRunStats, messagingCurrentCount });
        }

    } catch (err) {
        console.error('[handleMessagingResponse] Error in response handling:', err);
        messagingRunStats.lastRun = Date.now();
        messagingRunStats.lastError = String(err && err.message ? err.message : err);
        chrome.storage.local.set({ messagingRunStats });
    }

    isMessagingProcessingTick = false;
}

// Only keep these ONCE at the end of your file:

// Normalize LinkedIn post URLs to a canonical form for comparison
function normalizePostUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return urlStr;
    try {
        const u = new URL(urlStr);
        // unify hostname (drop www)
        if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
        // strip query and hash
        u.search = '';
        u.hash = '';
        // trim trailing slash in pathname
        if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.toString();
    } catch (e) {
        // Fallback: strip after ? and # if present
        const noHash = urlStr.split('#')[0];
        return noHash.split('?')[0].replace(/\/+$/, '');
    }
}

// Fetch all Post URLs from the given Airtable view (paginated)
async function fetchSeenPostUrlsFromView(viewId) {
    const seen = new Set();
    try {
        let offset = undefined;
        do {
            const params = new URLSearchParams();
            params.set('view', viewId);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (data && Array.isArray(data.records)) {
                for (const r of data.records) {
                    const postUrl = r && r.fields && r.fields['Post URL'];
                    if (postUrl) seen.add(normalizePostUrl(postUrl));
                }
            }
            offset = data && data.offset;
        } while (offset);
    } catch (e) {
        console.warn('Failed to fetch seen Post URLs from view', viewId, e);
    }
    return seen;
}

// Fetch up to N pending records, mark duplicates as done, and return the first non-duplicate
async function getNextPendingRecordNonDuplicate(limit = 100) {
    const seen = AIRTABLE_DUPLICATE_VIEW_ID ? await fetchSeenPostUrlsFromView(AIRTABLE_DUPLICATE_VIEW_ID) : new Set();

    // Fetch a page of pending records
    const params = new URLSearchParams();
    if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
    params.set('pageSize', String(Math.max(1, Math.min(100, limit))));
    // Updated filter to use the actual field name from Airtable
    params.set('filterByFormula', 'NOT({Comment Done})');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
    let data = null;
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            console.warn('[airtable] Pending records fetch not ok:', response.status, errText);
            return null;
        }
        data = await response.json();
    } catch (e) {
        console.warn('[airtable] Failed to fetch pending records:', e);
        return null;
    }
    if (!data || !Array.isArray(data.records) || data.records.length === 0) return null;

    let firstNonDuplicate = null;
    for (const rec of data.records) {
        const postUrl = rec.fields && rec.fields['Post URL'];
        if (!postUrl) continue;
        const norm = normalizePostUrl(postUrl);
        if (seen.has(norm)) {
            // Mark duplicate as done (no tab open)
            try {
                console.log('[dedupe] Marking duplicate as done:', rec.id, postUrl);
                await markRecordDone(rec.id, null);
            } catch (e) {
                console.warn('[dedupe] Failed to mark duplicate as done:', rec.id, e);
            }
            continue;
        }
        if (!firstNonDuplicate) firstNonDuplicate = rec;
    }
    return firstNonDuplicate;
}

async function getNextPendingRecord() {
    const { AIRTABLE_API_KEY } = CONFIG || {};
    const params = new URLSearchParams();
    if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
    params.set('pageSize', '1');
    // Updated filter to use the actual field name from Airtable
    params.set('filterByFormula', 'NOT({Comment Done})');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`
        }
    });
    const data = await response.json();
    console.log("Fetched records from Airtable:", data);

    if (!data.records) {
        console.error("Airtable API error or misconfiguration:", data);
        return null;
    }
    return data.records.length > 0 ? data.records[0] : null;
}

// Function moved inline to avoid scoping issues

async function markRecordDone(recordId, tabId) {
    const { AIRTABLE_API_KEY } = CONFIG || {};
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
    
    console.log(`[markRecordDone] Updating record ${recordId} at ${url}`);
    
    // Try to update with all fields first
    const fields = { 
        "Comment Done": true, 
        "Comment By": COMMENT_BY,
        "Comment On": new Date().toISOString() 
    };
    
    try {
        console.log(`[markRecordDone] Attempting update with fields:`, fields);
        
        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields })
        });
        
        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            console.warn(`[markRecordDone] Airtable PATCH failed (${res.status}): ${errorText}`);
            
            // Try with just Comment Done and Comment On (Comment By might not exist yet)
            const fallbackFields = { 
                "Comment Done": true,
                "Comment On": new Date().toISOString()
            };
            console.log(`[markRecordDone] Retrying with fallback fields:`, fallbackFields);
            
            const res2 = await fetch(url, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields: fallbackFields })
            });
            
            if (!res2.ok) {
                const errorText2 = await res2.text().catch(() => 'Unknown error');
                console.warn(`[markRecordDone] Fallback PATCH failed (${res2.status}): ${errorText2}`);
                
                // Final attempt with just Comment Done
                const essentialFields = { "Comment Done": true };
                console.log(`[markRecordDone] Final attempt with essential fields:`, essentialFields);
                
                const res3 = await fetch(url, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: essentialFields })
                });
                
                if (!res3.ok) {
                    const errorText3 = await res3.text().catch(() => 'Unknown error');
                    throw new Error(`Airtable PATCH failed even with essential fields (${res3.status}): ${errorText3}`);
                }
                
                console.log(`[markRecordDone] Successfully updated with essential fields only`);
            } else {
                console.log(`[markRecordDone] Successfully updated with fallback fields`);
            }
        } else {
            console.log(`[markRecordDone] Successfully updated with all fields`);
        }
        
        console.log(`Successfully marked record ${recordId} as done in Airtable`);
    } catch (error) {
        console.error('[markRecordDone] Error marking record as done:', error);
        throw error;
    }
}

async function markMessageRecordDone(recordId) {
    console.log('[markMessageRecordDone] Marking record as done:', recordId);

    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MESSAGING_AIRTABLE_TABLE_ID}/${recordId}`;
        const now = new Date();

        console.log('[markMessageRecordDone] Updating record with Message Done and Message Sent Time');

        // Try different timestamp formats for Airtable compatibility
        const timestampFormats = [
            now.toISOString(),           // "2026-01-19T17:45:30.000Z"
            now.toISOString().slice(0, -1), // "2026-01-19T17:45:30.000" (without Z)
            now.toISOString().split('T')[0], // "2026-01-19" (date only)
            Math.floor(now.getTime() / 1000), // Unix timestamp in seconds
            now.getTime() // Unix timestamp in milliseconds
        ];

        let updateData;
        let success = false;

        // Try each timestamp format until one works
        for (let i = 0; i < timestampFormats.length; i++) {
            const timestamp = timestampFormats[i];
            console.log(`[markMessageRecordDone] Trying timestamp format ${i + 1}:`, timestamp);

            updateData = {
                fields: {
                    "Message Done": true,
                    "Message Sent Time": timestamp
                }
            };

            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                console.log(`[markMessageRecordDone] Success with format ${i + 1}:`, timestamp);
                success = true;
                break;
            } else {
                const errorText = await response.text();
                console.log(`[markMessageRecordDone] Format ${i + 1} failed:`, response.status, errorText);
                // Continue to next format
            }
        }

        if (!success) {
            console.error('[markMessageRecordDone] All timestamp formats failed');
            return false;
        }

        console.log('[markMessageRecordDone] Successfully marked record as done:', recordId);
        return true;

    } catch (error) {
        console.error('[markMessageRecordDone] Error marking record as done:', error);
        return false;
    }
}

    // Periodic timer validation to prevent corruption
    setInterval(() => {
        const now = Date.now();
        if (nextFireTime && typeof nextFireTime === 'number' && isFinite(nextFireTime)) {
            const timeDiff = nextFireTime - now;
            if (timeDiff > 24 * 60 * 60 * 1000) { // More than 24 hours in future
                console.error('[validation] CRITICAL: Runtime corrupted timer detected:', new Date(nextFireTime), 'resetting automatically');
                nextFireTime = now + 2000; // Reset to 2 seconds from now
                chrome.storage.local.set({ nextFireTime });
                chrome.alarms.clearAll(() => {
                    chrome.alarms.create('autoCommentTick', { when: nextFireTime });
                });
            }
        }
        
        // Debug: Log current timer state every 30 seconds
        console.log('[validation] Current timer state:', {
            nextFireTime: nextFireTime ? new Date(nextFireTime) : null,
            now: new Date(now),
            timeDiff: nextFireTime ? nextFireTime - now : null,
            isRunning,
            forceStop
        });
    }, 30000); // Check every 30 seconds

    // Handle the alarm tick to resume work even if the service worker was suspended
    console.log('[background] Setting up alarm listener...');
    chrome.alarms.onAlarm.addListener((alarm) => {
        console.log('[alarm] Alarm fired:', alarm.name, 'current state:', { isRunning, forceStop, isMessagingRunning, messagingForceStop });

        // Handle comment tick
        if (alarm && alarm.name === 'autoCommentTick') {
            if (!isRunning || forceStop) {
                console.log('[alarm] Ignoring comment alarm - service is stopped or force stopped');
                return;
            }
            console.log('[alarm] Processing comment records...');
            processRecords().catch(err => {
                console.error('processRecords error', err);
                // Only schedule next if still running and not force stopped
                if (isRunning && !forceStop) {
                    runStats.failures += 1;
                    runStats.lastRun = Date.now();
                    runStats.lastError = String(err && err.message ? err.message : err);
                    chrome.storage.local.set({ runStats });
                    // schedule a retry with a fresh delay to avoid tight loop
                    nextDelay = getRandomDelay();
                    nextFireTime = Date.now() + nextDelay;
                    chrome.storage.local.set({ nextFireTime });
                    scheduleNext(nextDelay);
                } else {
                    console.log('[alarm] Not scheduling next comment - service was stopped or force stopped');
                }
            });
        }

        // Handle messaging tick
        else if (alarm && alarm.name === 'autoMessagingTick') {
            if (!isMessagingRunning || messagingForceStop) {
                console.log('[alarm] Ignoring messaging alarm - service is stopped or force stopped');
                return;
            }
            console.log('[alarm] Processing messaging records...');
            processMessagingRecords().catch(err => {
                console.error('processMessagingRecords error', err);
                // Only schedule next if still running and not force stopped
                if (isMessagingRunning && !messagingForceStop && messagingCurrentCount < messagingTargetCount) {
                    messagingRunStats.failures += 1;
                    messagingRunStats.lastRun = Date.now();
                    messagingRunStats.lastError = String(err && err.message ? err.message : err);
                    chrome.storage.local.set({ messagingRunStats });
                    // schedule a retry with a fresh delay to avoid tight loop
                    messagingNextDelay = getRandomDelay();
                    messagingNextFireTime = Date.now() + messagingNextDelay;
                    chrome.storage.local.set({ messagingNextFireTime });
                    scheduleNextMessaging(messagingNextDelay);
                } else {
                    console.log('[alarm] Not scheduling next messaging - service was stopped, force stopped, or target reached');
                }
            });
        }
    });

