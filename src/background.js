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

let isRunning = false;
let nextDelay = null;
let nextFireTime = null;
let startedAt = null;
let runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
let todayCount = 0;
let lastCountAt = 0;
const TODAY_COUNT_TTL_MS = 2 * 60 * 1000; // refresh every ~2 minutes
let isProcessingTick = false; // prevent overlapping runs
const ACTIVE_TASK_TTL_MS = 6 * 60 * 1000; // 6 minutes safety window

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

// Restore state on boot
chrome.storage.local.get(['isRunning','nextFireTime','runStats','startedAt','todayCount','lastCountAt'], (items) => {
    isRunning = !!items.isRunning;
    nextFireTime = items.nextFireTime || null;
    runStats = items.runStats || runStats;
    startedAt = items.startedAt || null;
    todayCount = typeof items.todayCount === 'number' ? items.todayCount : 0;
    lastCountAt = typeof items.lastCountAt === 'number' ? items.lastCountAt : 0;
    if (isRunning) {
        if (nextFireTime && Date.now() < nextFireTime) {
            const delayMs = Math.max(0, nextFireTime - Date.now());
            chrome.alarms.create('autoCommentTick', { when: Date.now() + delayMs });
        } else {
            // nextFireTime missing or in the past; trigger soon
            const soon = 1000;
            nextFireTime = Date.now() + soon;
            chrome.storage.local.set({ nextFireTime });
            chrome.alarms.create('autoCommentTick', { when: Date.now() + soon });
        }
    }
});

function getRandomDelay() {
    // Random delay between 7 and 10 minutes
    return (7 + Math.random() * 3) * 60 * 1000;
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

function refreshTodayCountIfStale() {
    if (!AIRTABLE_TODAY_VIEW_ID) return;
    if (Date.now() - lastCountAt > TODAY_COUNT_TTL_MS) fetchTodayCount();
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        if (isRunning) return;
        loadConfig().then(() => {
            isRunning = true;
            // Reset session stats on Start
            runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
            // Run soon (2 seconds) for immediate feedback
            nextDelay = 2000;
            nextFireTime = Date.now() + nextDelay;
            startedAt = Date.now();
            chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
            refreshTodayCountIfStale();
            scheduleNext(nextDelay);
        });
    } 
    else if (request.action === "stop") {
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        chrome.alarms.clear('autoCommentTick');
        // Reset stats on Stop as requested
        runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
    }
    else if (request.action === "getStatus") {
        refreshTodayCountIfStale();
        sendResponse({ isRunning, nextFireTime, runStats, startedAt, todayCount });
        // No need to return true, since sendResponse is synchronous here
    }
    else if (request.action === "getTodayNow") {
        // Respond after fetching to provide an immediate, accurate value
        fetchTodayCount()
            .then((cnt) => sendResponse({ todayCount: cnt }))
            .catch(() => sendResponse({ todayCount }));
        return true; // keep the message channel open for async response
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
    if (!isRunning) return;
    const safeDelay = (typeof delayMs === 'number' && isFinite(delayMs) && delayMs >= 0) ? delayMs : 2000;
    const when = Date.now() + safeDelay;
    nextFireTime = when;
    try {
        chrome.alarms.clear('autoCommentTick', () => {
            if (chrome.runtime.lastError) {/* ignore */}
            if (!chrome.alarms || typeof chrome.alarms.create !== 'function') {
                console.warn('[alarms] API not available in this context');
                return;
            }
            chrome.alarms.create('autoCommentTick', { when });
        });
    } catch (e) {
        console.error('Failed to schedule alarm', e);
    }
    chrome.storage.local.set({ nextFireTime });
}

async function processRecords() {
    if (!isRunning) return;
    if (isProcessingTick) {
        console.log('[tick] already processing; skipping');
        return;
    }
    isProcessingTick = true;
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

    const record = await getNextPendingRecordNonDuplicate();
    console.log("Processing record:", record);

    if (!record) {
        console.log("No pending records (or all were duplicates). Will check again later.");
        runStats.lastRun = Date.now();
        runStats.lastError = null;
        if (isRunning) {
            nextDelay = getRandomDelay(); // Random delay between 7 and 10 minutes
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

    console.log(`Opening LinkedIn post: ${postUrl}`);

    // Persist the active task immediately to avoid duplicate opens on SW restart
    await setActiveTask({ recordId: record.id, postUrl, startedAt: Date.now() });

    chrome.tabs.create({ url: postUrl, active: true }, async (tab) => {
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

                // Add a 10-second delay before injecting the content script
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content.js']
                    }, () => {
                        chrome.tabs.sendMessage(tab.id, { action: "postComment", commentText });

                        const onResponse = function(message, senderInfo) {
                            if (message.action === "commentPosted" && senderInfo.tab && senderInfo.tab.id === tab.id) {
                                console.log('[background] Received commentPosted for tab', tab.id, 'record', record.id);
                                chrome.runtime.onMessage.removeListener(onResponse);
                                
                                // Start Airtable update immediately
                                const finalizePromise = (async () => {
                                    try {
                                        console.log('[finalize] Immediately updating Airtable for record:', record.id);
                                        await markRecordDone(record.id, null); // Do not close tab in markRecordDone
                                        console.log('[finalize] Marked record as done in Airtable:', record.id);
                                        runStats.processed += 1;
                                        runStats.successes += 1;
                                        runStats.lastRun = Date.now();
                                        runStats.lastError = null;
                                        // Optimistically bump today counter
                                        todayCount += 1;
                                        lastCountAt = Date.now();
                                        chrome.storage.local.set({ todayCount, lastCountAt });
                                        // Clear active task on success
                                        await clearActiveTask();
                                    } catch (err) {
                                        console.error('[finalize] Error in markRecordDone:', err);
                                        runStats.failures += 1;
                                        runStats.lastRun = Date.now();
                                        runStats.lastError = String(err && err.message ? err.message : err);
                                        chrome.storage.local.set({ runStats });
                                    }
                                })();
                                
                                // In parallel, wait 5s then close the tab
                                (async () => {
                                    await new Promise(res => setTimeout(res, 5000));
                                    try {
                                        console.log(`[finalize] Attempting to close tab ${tab.id}`);
                                        const tabExists = await tabsGet(tab.id);
                                        if (tabExists) {
                                            chrome.tabs.remove(tab.id, () => {
                                                if (chrome.runtime.lastError) {
                                                    console.warn('[finalize] Tab close error:', chrome.runtime.lastError.message);
                                                } else {
                                                    console.log('[finalize] Successfully closed tab:', tab.id);
                                                }
                                            });
                                        } else {
                                            console.log('[finalize] Tab already closed or not found:', tab.id);
                                        }
                                    } catch (e) {
                                        console.warn('[finalize] Failed to close tab:', tab.id, e);
                                    }
                                })();
                                
                                // After both, schedule next
                                (async () => {
                                    await finalizePromise;
                                    if (isRunning) {
                                        nextDelay = getRandomDelay();
                                        nextFireTime = Date.now() + nextDelay;
                                        chrome.storage.local.set({ nextFireTime, runStats });
                                        scheduleNext(nextDelay);
                                    }
                                    isProcessingTick = false;
                                })();
                            }
                        };
                        chrome.runtime.onMessage.addListener(onResponse);
                    });
                }, 10000); // 10,000 ms = 10 seconds
            }
        });
    });
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
    const response = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const data = await response.json();
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
    // Handle the alarm tick to resume work even if the service worker was suspended
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm && alarm.name === 'autoCommentTick') {
            if (!isRunning) return;
            processRecords().catch(err => {
                console.error('processRecords error', err);
                runStats.failures += 1;
                runStats.lastRun = Date.now();
                runStats.lastError = String(err && err.message ? err.message : err);
                chrome.storage.local.set({ runStats });
                // schedule a retry with a fresh delay to avoid tight loop
                nextDelay = getRandomDelay();
                nextFireTime = Date.now() + nextDelay;
                chrome.storage.local.set({ nextFireTime });
                scheduleNext(nextDelay);
            });
        }
    });

