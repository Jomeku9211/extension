// Airtable config: fixed and constant
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
// Per-account "today" views
const AIRTABLE_TODAY_VIEW_ID_D = 'viwjzxpzCC24wtkfc';
const AIRTABLE_TODAY_VIEW_ID_A = 'viwX2GldbNBTv1ho3';
const AIRTABLE_DUPLICATE_VIEW_ID = 'viwhyoCkHret6DqWe';
let CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID };

let isRunning = false;
let nextDelay = null;
let nextFireTime = null;
let startedAt = null;
let runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
let currentAccount = 'A';
let instanceId = null;
let todayCountA = 0;
let todayCountD = 0;
let lastCountAtA = 0;
let lastCountAtD = 0;
const TODAY_COUNT_TTL_MS = 2 * 60 * 1000; // 2 minutes
// Today posts cache
let todayPostsA = [];
let todayPostsD = [];
let lastPostsAtA = 0;
let lastPostsAtD = 0;

// Duplicate prevention cache
let duplicateUrls = new Set();
let duplicateCommentIds = new Set();
let dupLastRefreshed = 0;
const DUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------- Error formatting helpers ----------
function safeStringify(obj) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (value instanceof Error) {
                return { name: value.name, message: value.message, stack: value.stack };
            }
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        });
    } catch {
        return String(obj);
    }
}
function formatErr(e, fallback = 'Unexpected error') {
    if (!e) return fallback;
    if (typeof e === 'string') return e;
    // Handle Fetch Response objects
    if (typeof Response !== 'undefined' && e instanceof Response) {
        return `HTTP ${e.status} ${e.statusText}`;
    }
    if (e && typeof e.message === 'string') return e.message;
    const s = safeStringify(e);
    return s && s !== '{}"' ? s : String(e);
}
function formatAirtable(json, fallback = 'Airtable error') {
    if (!json) return fallback;
    const err = json.error;
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.type) return err.type;
    try { return safeStringify(err); } catch { return String(err); }
}

// Fetch the count of records in the "today" view (paginates until all rows counted)
async function fetchTodayCount(acct) {
    try {
        let count = 0;
        let offset = undefined;
        do {
            const params = new URLSearchParams();
            const viewId = acct === 'D' ? AIRTABLE_TODAY_VIEW_ID_D : AIRTABLE_TODAY_VIEW_ID_A;
            params.set('view', viewId);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (!res.ok) {
                const msg = formatAirtable(data, res.statusText);
                runStats.lastError = `Airtable Today view error: ${msg}`;
                chrome.storage.local.set({ runStats });
                break;
            }
            if (data && Array.isArray(data.records)) {
                count += data.records.length;
            }
            offset = data && data.offset;
        } while (offset);
        if (acct === 'D') {
            todayCountD = count;
            lastCountAtD = Date.now();
        } else {
            todayCountA = count;
            lastCountAtA = Date.now();
        }
        chrome.storage.local.set({ todayCountA, todayCountD, lastCountAtA, lastCountAtD });
        return count;
    } catch (e) {
        console.warn('Failed to fetch today count', e);
        return acct === 'D' ? todayCountD : todayCountA;
    }
}

function refreshTodayCount(acct) {
    // Debounce frequent fetches using TTL
    const last = acct === 'D' ? lastCountAtD : lastCountAtA;
    if (Date.now() - last < 10 * 1000) return; // 10s safety
    fetchTodayCount(acct);
}

// Restore state on boot
chrome.storage.local.get(['isRunning','nextFireTime','runStats','startedAt','todayCountA','todayCountD','lastCountAtA','lastCountAtD','duplicateUrls','duplicateCommentIds','dupLastRefreshed','selectedAccount','instanceId'], (items) => {
    isRunning = !!items.isRunning;
    nextFireTime = items.nextFireTime || null;
    runStats = items.runStats || runStats;
    startedAt = items.startedAt || null;
    currentAccount = items.selectedAccount === 'D' ? 'D' : 'A';
    instanceId = items.instanceId || `${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    chrome.storage.local.set({ instanceId });
        if (!isRunning) {
        // Ensure clean slate when idle
        runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
        startedAt = null;
        chrome.storage.local.set({ runStats, startedAt });
    }
    todayCountA = typeof items.todayCountA === 'number' ? items.todayCountA : 0;
    todayCountD = typeof items.todayCountD === 'number' ? items.todayCountD : 0;
    lastCountAtA = typeof items.lastCountAtA === 'number' ? items.lastCountAtA : 0;
    lastCountAtD = typeof items.lastCountAtD === 'number' ? items.lastCountAtD : 0;
    // restore duplicates
    if (Array.isArray(items.duplicateUrls)) duplicateUrls = new Set(items.duplicateUrls);
    if (Array.isArray(items.duplicateCommentIds)) duplicateCommentIds = new Set(items.duplicateCommentIds);
    dupLastRefreshed = typeof items.dupLastRefreshed === 'number' ? items.dupLastRefreshed : 0;
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
    // Warm up today's counts
    refreshTodayCount('A');
    refreshTodayCount('D');
    }
        else {
            // idle: ensure UI shows zeros and not stale counts
            chrome.storage.local.set({ runStats, startedAt, todayCountA, todayCountD, lastCountAtA, lastCountAtD });
        }
});

function getRandomDelay() {
    // Random delay between 7 and 10 minutes
    return (7 + Math.random() * 3) * 60 * 1000;
}

async function loadConfig() { return CONFIG; }



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        if (request.account === 'D' || request.account === 'A') {
            currentAccount = request.account;
            chrome.storage.local.set({ selectedAccount: currentAccount });
        }
        loadConfig().then(() => {
            // Acquire cross-browser lock before starting
            acquireAccountLock(currentAccount).then(async (locked) => {
                if (!locked) {
                    // Distinguish between real cross-browser lock vs config/API error
                    try {
                        const lockState = await checkAccountLock(currentAccount);
                        if (lockState && lockState.isLockedByOther) {
                            runStats.lastError = `Account ${currentAccount} is active on another browser`;
                        } else {
                            runStats.lastError = runStats.lastError || 'Failed to acquire lock. Ensure Airtable fields exist and Picked By is a text field.';
                        }
                    } catch (_) {
                        runStats.lastError = runStats.lastError || 'Failed to acquire lock. Please verify Airtable config and network.';
                    }
                    isRunning = false;
                    chrome.storage.local.set({ runStats, isRunning });
                    return;
                }
            // Always treat Start as a fresh session
            isRunning = true;
            runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
            startedAt = Date.now();
            console.log('Starting auto-commenter for account:', currentAccount);
            // Immediate kickoff: set nextFireTime first so popup can show it instantly
            nextDelay = 2000;
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
            chrome.alarms.clear('autoCommentTick', () => {
                scheduleNext(nextDelay);
            });
            refreshTodayCount(currentAccount);
            });
        });
    } 
    else if (request.action === "stop") {
        if (request.account === 'D' || request.account === 'A') {
            currentAccount = request.account;
            chrome.storage.local.set({ selectedAccount: currentAccount });
        }
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        chrome.alarms.clear('autoCommentTick');
    runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
    chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
    releaseAccountLock(currentAccount).catch(()=>{});
    }
    else if (request.action === 'checkLock') {
        const acct = (request.account === 'D' || request.account === 'A') ? request.account : currentAccount;
        checkAccountLock(acct).then((res) => {
            sendResponse(res);
        }).catch((e) => {
            sendResponse({ isLockedByOther: false, heldBySelf: false, error: String(e && e.message ? e.message : e) });
        });
        return true; // async
    }
    else if (request.action === "getStatus") {
        if (request.account === 'D' || request.account === 'A') {
            currentAccount = request.account;
        }
        const acct = currentAccount;
        const last = acct === 'D' ? lastCountAtD : lastCountAtA;
        const force = !!request.force;
        // If forced or stale, fetch fresh count before responding so UI shows it immediately
        if (force || Date.now() - last > TODAY_COUNT_TTL_MS) {
            (async () => {
                await fetchTodayCount(acct).catch(()=>{});
                const countNow = acct === 'D' ? todayCountD : todayCountA;
                sendResponse({ isRunning, nextFireTime, runStats, startedAt, todayCount: countNow });
            })();
            return true; // async response
        } else {
            const count = acct === 'D' ? todayCountD : todayCountA;
            sendResponse({ isRunning, nextFireTime, runStats, startedAt, todayCount: count });
            // synchronous response
        }
    }
    else if (request.action === 'refreshTodayCount') {
        const acct = (request.account === 'D' || request.account === 'A') ? request.account : currentAccount;
        refreshTodayCount(acct);
        sendResponse({ ok: true });
    }
    else if (request.action === 'getTodayPosts') {
        const acct = (request.account === 'D' || request.account === 'A') ? request.account : currentAccount;
        getTodayPosts(acct).then((posts) => {
            sendResponse({ posts });
        }).catch((e) => {
            sendResponse({ posts: [], error: formatErr(e) });
        });
        return true; // async
    }
});

function scheduleNext(delayMs) {
    if (!isRunning) return;
    chrome.alarms.create('autoCommentTick', { when: Date.now() + delayMs });
}

async function processRecords() {
    if (!isRunning) return;
    if (!CONFIG) {
        await loadConfig();
        if (!CONFIG) return;
    }

    // Atomically claim a record for this account to avoid both accounts picking the same
    const claim = await claimNextRecord(currentAccount);
    console.log("Processing claim:", claim);

    if (!claim || claim.status === 'no-record') {
        console.log("No pending records in Airtable. Stopping.");
        runStats.lastRun = Date.now();
        runStats.lastError = 'No records in Airtable';
        // Stop the worker and clear next alarm
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        chrome.alarms.clear('autoCommentTick');
        chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
        releaseAccountLock(currentAccount).catch(()=>{});
        return;
    }
    if (claim.status !== 'ok') {
        console.log('Claim failed or conflicted; will retry later');
        runStats.lastRun = Date.now();
        if (isRunning) {
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
        } else {
            chrome.storage.local.set({ runStats });
        }
        return;
    }
    const record = claim.record;

    // Verify we still own this record after claiming (race protection)
    const owns = await verifyOwnership(record.id, currentAccount);
    if (!owns) {
        console.log('Lost claim to another worker, skipping record:', record.id);
        runStats.lastRun = Date.now();
        if (isRunning) {
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
        } else {
            chrome.storage.local.set({ runStats });
        }
        return;
    }

    const postUrl = record.fields["Post URL"];
    // Check duplicates after claiming
    await refreshDuplicatesIfStale();
    if (isDuplicate(postUrl)) {
        console.log('Duplicate detected for URL, skipping:', postUrl);
        // Mark as done and clear in-progress to avoid reprocessing by either account
        await finalizeRecord(record.id, currentAccount, null);
        runStats.processed += 1;
        runStats.lastRun = Date.now();
        runStats.lastError = null;
        if (isRunning) {
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
        } else {
            chrome.storage.local.set({ runStats });
        }
        return;
    }
    const commentText = record.fields["Generated Comment"];
    console.log(`Opening LinkedIn post: ${postUrl}`);


chrome.tabs.create({ url: postUrl, active: true }, (tab) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);

            // Add a 10-second delay before messaging the content script
            setTimeout(() => {
                // Try to send message; if it fails due to missing CS, inject once and retry
                let completed = false;
                let watchdogTimer = null;
                const scheduleFailure = (reason) => {
                    runStats.failures += 1;
                    runStats.lastRun = Date.now();
                    runStats.lastError = reason || 'Posting failed';
                    chrome.storage.local.set({ runStats });
                    if (isRunning) {
                        nextDelay = getRandomDelay();
                        nextFireTime = Date.now() + nextDelay;
                        chrome.storage.local.set({ nextFireTime });
                        scheduleNext(nextDelay);
                    } else {
                        chrome.storage.local.set({ runStats });
                    }
                };
                const cleanupAndFail = (reason) => {
                    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
                    try { chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError); } catch {}
                    scheduleFailure(reason);
                };
                const sendPost = () => chrome.tabs.sendMessage(tab.id, { action: "postComment", commentText, postUrl }, () => {
                    if (chrome.runtime.lastError) {
                        // Fallback: inject once (ensure lowercase chrome)
                        try {
                            chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] }, () => {
                                if (chrome.runtime.lastError) {
                                    const injMsg = chrome.runtime.lastError.message || 'unknown injection error';
                                    console.warn('Content script injection failed:', injMsg);
                                    cleanupAndFail(`Content script injection failed: ${injMsg}`);
                                    return;
                                }
                                chrome.tabs.sendMessage(tab.id, { action: "postComment", commentText, postUrl });
                            });
                        } catch (e) {
                            const injErr = (e && e.message) ? e.message : String(e);
                            console.warn('chrome.scripting.executeScript threw', injErr);
                            cleanupAndFail(`Content script injection error: ${injErr}`);
                        }
                    }
                });
                sendPost();

                const onResponse = function(message, senderInfo) {
                        if (message.action === "commentPosted" && senderInfo.tab && senderInfo.tab.id === tab.id) {
                            chrome.runtime.onMessage.removeListener(onResponse);
                            completed = true;
                            if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
                            // Record duplicates (post URL and optional commentId)
                            if (message.postUrl) duplicateUrls.add(message.postUrl);
                            if (message.commentId) duplicateCommentIds.add(message.commentId);
                            chrome.storage.local.set({
                                duplicateUrls: Array.from(duplicateUrls),
                                duplicateCommentIds: Array.from(duplicateCommentIds)
                            });
                            finalizeRecord(record.id, currentAccount, tab.id).then(() => {
                                console.log("Marked record as done in Airtable:", record.id);
                                runStats.processed += 1;
                                runStats.successes += 1;
                                runStats.lastRun = Date.now();
                                runStats.lastError = null;
                                // Optimistically increment today's count for this account
                                if (currentAccount === 'D') {
                                    todayCountD += 1;
                                    lastCountAtD = Date.now();
                                } else {
                                    todayCountA += 1;
                                    lastCountAtA = Date.now();
                                }
                                chrome.storage.local.set({ todayCountA, todayCountD, lastCountAtA, lastCountAtD });
                                if (isRunning) {
                                    nextDelay = getRandomDelay();
                                    nextFireTime = Date.now() + nextDelay;
                                    chrome.storage.local.set({ nextFireTime, runStats });
                                    scheduleNext(nextDelay);
                                }
                            });
                        }
                };
                chrome.runtime.onMessage.addListener(onResponse);
                // Watchdog: if no response within 60s after messaging, consider it a failure
                watchdogTimer = setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(onResponse);
                    if (!completed) {
                        console.warn('Watchdog timeout: no commentPosted message received');
                        cleanupAndFail('Timed out waiting for comment to post');
                    }
                }, 60000);
            }, 10000); // 10,000 ms = 10 seconds
        }
    });
});

// Only keep these ONCE at the end of your file:
}

async function getNextPendingRecord() {
    const { AIRTABLE_API_KEY } = CONFIG || {};
    async function fetchWithFormula(formula) {
        const params = new URLSearchParams();
        if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
        params.set('pageSize', '1');
        if (formula) params.set('filterByFormula', formula);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const json = await res.json();
    if (!res.ok) {
        const msg = formatAirtable(json, `${res.status} ${res.statusText}`);
        console.warn('Airtable query failed:', msg);
        runStats.lastError = `Airtable list error: ${msg}`;
        chrome.storage.local.set({ runStats });
    }
    return { ok: res.ok, json };
    }

    // Try strict formula first (requires In Progress field); then fallback
    try {
        const excludeLock = "AND(NOT({Post URL}='LOCK_A'), NOT({Post URL}='LOCK_D'))";
        let { ok, json } = await fetchWithFormula(`AND(NOT({Comment Done}), NOT({In Progress}), ${excludeLock})`);
        if (!ok || !json.records) {
            console.warn('Strict formula failed or no records; falling back', formatAirtable(json, 'no records'));
            ({ ok, json } = await fetchWithFormula(`AND(NOT({Comment Done}), ${excludeLock})`));
        }
        console.log('Fetched records from Airtable:', json);
        if (!json || !json.records) return null;
        return json.records.length > 0 ? json.records[0] : null;
    } catch (e) {
    const msg = formatErr(e);
    console.error('Airtable fetch error', msg);
    runStats.lastError = `Airtable list error: ${msg}`;
    chrome.storage.local.set({ runStats });
        return null;
    }
}

async function markRecordDone(recordId, tabId) {
    const { AIRTABLE_API_KEY } = CONFIG || {};
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fields: {
                "Comment Done": true
            }
        })
    });
    // Close the tab after marking as done
    if (tabId) {
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
    }
}

// Attempt to claim a record for the current account by marking In Progress and Picked By
// Returns { status: 'ok'|'no-record'|'claim-failed'|'claim-error', record }
async function claimNextRecord(acct) {
    const rec = await getNextPendingRecord();
    if (!rec) return { status: 'no-record', record: null };
    const id = rec.id;
    try {
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${id}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: { 'In Progress': true, 'Picked By': acct } })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = `Claim failed: ${formatAirtable(j, res.statusText)}`;
            console.warn(msg);
            runStats.lastError = msg;
            chrome.storage.local.set({ runStats });
            return { status: 'claim-failed', record: null };
        }
        return { status: 'ok', record: rec };
    } catch (e) {
        const msg = formatErr(e);
        console.warn('Failed to claim record; another worker may have it', msg);
        runStats.lastError = msg;
        chrome.storage.local.set({ runStats });
        return { status: 'claim-error', record: null };
    }
}

// Mark the record as done and stamp the account that posted it; clear in-progress
async function finalizeRecord(recordId, acct, tabId) {
    const commenter = acct === 'D' ? 'Dheeraj' : 'Abhilasha';
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: { 'Comment Done': true, 'In Progress': false, 'Picked By': acct, 'Comment By': commenter } })
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        runStats.lastError = `Finalize failed: ${formatAirtable(j, res.statusText)}`;
        chrome.storage.local.set({ runStats });
    }
    if (tabId) {
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
    }
}

// Verify that this account still owns the record (Picked By matches and In Progress is true)
async function verifyOwnership(recordId, acct) {
    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        const data = await res.json();
        const fields = data && data.fields ? data.fields : {};
        return fields['In Progress'] === true && fields['Picked By'] === acct;
    } catch (e) {
        console.warn('verifyOwnership failed', e);
        return false;
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
                runStats.lastError = formatErr(err);
                chrome.storage.local.set({ runStats });
                // schedule a retry with a fresh delay to avoid tight loop
                nextDelay = getRandomDelay();
                nextFireTime = Date.now() + nextDelay;
                chrome.storage.local.set({ nextFireTime });
                scheduleNext(nextDelay);
            });
            // Heartbeat the lock while active
            heartbeatAccountLock(currentAccount).catch(()=>{});

        }
    });

// ---------- Duplicate helpers ----------
async function fetchDuplicateUrlsFromAirtable() {
    try {
        let urls = new Set();
        let offset;
        do {
            const params = new URLSearchParams();
            params.set('view', AIRTABLE_DUPLICATE_VIEW_ID);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (!res.ok) {
        const msg = formatAirtable(data, res.statusText);
        console.warn('Duplicate view fetch failed:', msg);
        runStats.lastError = `Airtable duplicate view error: ${msg}`;
        chrome.storage.local.set({ runStats });
                break;
            }
            if (data && Array.isArray(data.records)) {
                for (const r of data.records) {
                    const u = r.fields && r.fields['Post URL'];
                    if (u) urls.add(u);
                }
            }
            offset = data && data.offset;
        } while (offset);
        return urls;
    } catch (e) {
    const msg = formatErr(e);
    console.warn('Failed to fetch duplicate URLs', msg);
    runStats.lastError = `Airtable duplicate view error: ${msg}`;
    chrome.storage.local.set({ runStats });
        return null;
    }
}

async function refreshDuplicatesIfStale() {
    const now = Date.now();
    if (now - dupLastRefreshed < DUP_TTL_MS) return;
    const urls = await fetchDuplicateUrlsFromAirtable();
    if (urls) {
        // Merge remote URLs with local ones
        for (const u of urls) duplicateUrls.add(u);
        dupLastRefreshed = now;
        chrome.storage.local.set({
            duplicateUrls: Array.from(duplicateUrls),
            dupLastRefreshed
        });
    }
}

function isDuplicate(postUrl) {
    if (!postUrl) return false;
    return duplicateUrls.has(postUrl);
}

// ---------- Today's posts helpers ----------
async function fetchTodayPosts(acct) {
    try {
        const posts = [];
        let offset;
        const viewId = acct === 'D' ? AIRTABLE_TODAY_VIEW_ID_D : AIRTABLE_TODAY_VIEW_ID_A;
        do {
            const params = new URLSearchParams();
            params.set('view', viewId);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();
            if (!res.ok) {
                const msg = formatAirtable(data, res.statusText);
                runStats.lastError = `Airtable Today view error: ${msg}`;
                chrome.storage.local.set({ runStats });
                break;
            }
            if (data && Array.isArray(data.records)) {
                for (const r of data.records) {
                    const f = r.fields || {};
                    const urlField = f['Post URL'];
                    if (urlField) posts.push({ id: r.id, url: urlField, by: f['Comment By'] || null });
                }
            }
            offset = data && data.offset;
        } while (offset);
        return posts;
    } catch (e) {
        const msg = formatErr(e);
        runStats.lastError = `Airtable Today view error: ${msg}`;
        chrome.storage.local.set({ runStats });
        return [];
    }
}

async function getTodayPosts(acct) {
    const now = Date.now();
    const last = acct === 'D' ? lastPostsAtD : lastPostsAtA;
    const cached = acct === 'D' ? todayPostsD : todayPostsA;
    if (now - last < TODAY_COUNT_TTL_MS && Array.isArray(cached) && cached.length >= 0) {
        return cached;
    }
    const posts = await fetchTodayPosts(acct);
    if (acct === 'D') {
        todayPostsD = posts;
        lastPostsAtD = now;
    } else {
        todayPostsA = posts;
        lastPostsAtA = now;
    }
    chrome.storage.local.set({ todayPostsA, todayPostsD, lastPostsAtA, lastPostsAtD });
    return posts;
}

// ---------- Cross-browser Account Lock using existing fields (In Progress / Picked By) ----------
function lockKeyFor(acct) { return acct === 'D' ? 'LOCK_D' : 'LOCK_A'; }

async function getOrCreateLockRecord(acct) {
    const key = lockKeyFor(acct);
    const findParams = new URLSearchParams();
    findParams.set('filterByFormula', `{Post URL}='${key}'`);
    findParams.set('pageSize', '1');
    const findUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${findParams.toString()}`;
    const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' };
    const res = await fetch(findUrl, { headers });
    const data = await res.json();
    if (data && Array.isArray(data.records) && data.records.length > 0) return data.records[0];
    // Create a lock record (assumes fields 'Post URL', 'In Progress', 'Picked By' exist)
    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;
    const body = { records: [{ fields: { 'Post URL': key, 'In Progress': false, 'Picked By': '' } }] };
    const cres = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const cjson = await cres.json();
    return cjson && Array.isArray(cjson.records) ? cjson.records[0] : null;
}

function parsePickedBy(pickedBy) {
    // format: `${instanceId}:${timestamp}`
    if (!pickedBy || typeof pickedBy !== 'string') return { holder: '', ts: 0 };
    const [holder, tsStr] = pickedBy.split(':');
    const ts = parseInt(tsStr, 10);
    return { holder: holder || '', ts: Number.isFinite(ts) ? ts : 0 };
}

async function acquireAccountLock(acct) {
    try {
        const rec = await getOrCreateLockRecord(acct);
        if (!rec) return false;
        const fields = rec.fields || {};
        const active = !!fields['In Progress'];
        const { holder, ts } = parsePickedBy(fields['Picked By']);
        const now = Date.now();
        const stale = !ts || now - ts > 2 * 60 * 1000; // 2 min stale
        if (active && holder !== instanceId && !stale) {
            return false; // held by someone else
        }
        const newPickedBy = `${instanceId}:${Date.now()}`;
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'In Progress': true, 'Picked By': newPickedBy } })
        });
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            const msg = `Lock update failed: ${formatAirtable(j, res.statusText)}`;
            console.warn(msg);
            runStats.lastError = msg;
            chrome.storage.local.set({ runStats });
            return false;
        }
        return true;
    } catch (e) {
        const msg = formatErr(e);
        console.warn('acquireAccountLock failed', msg);
        runStats.lastError = `Acquire lock error: ${msg}`;
        chrome.storage.local.set({ runStats });
        return false;
    }
}

async function heartbeatAccountLock(acct) {
    try {
        const rec = await getOrCreateLockRecord(acct);
        if (!rec) return;
        const fields = rec.fields || {};
        const { holder } = parsePickedBy(fields['Picked By']);
        if (holder !== instanceId) return;
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'In Progress': true, 'Picked By': `${instanceId}:${Date.now()}` } })
        });
    } catch (e) {
        console.warn('heartbeatAccountLock failed', e);
    }
}

async function releaseAccountLock(acct) {
    try {
        const rec = await getOrCreateLockRecord(acct);
        if (!rec) return;
        const fields = rec.fields || {};
        const { holder } = parsePickedBy(fields['Picked By']);
        if (holder && holder !== instanceId) return; // don't release others
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'In Progress': false, 'Picked By': '' } })
        });
    } catch (e) {
        console.warn('releaseAccountLock failed', e);
    }
}

async function checkAccountLock(acct) {
    try {
        const rec = await getOrCreateLockRecord(acct);
        if (!rec) return { isLockedByOther: false, heldBySelf: false };
        const fields = rec.fields || {};
        const active = !!fields['In Progress'];
        const { holder, ts } = parsePickedBy(fields['Picked By']);
        const now = Date.now();
        const stale = !ts || now - ts > 2 * 60 * 1000;
        const heldBySelf = active && holder === instanceId && !stale;
        const isLockedByOther = active && holder !== instanceId && !stale;
        return { isLockedByOther, heldBySelf };
    } catch (e) {
        return { isLockedByOther: false, heldBySelf: false, error: String(e && e.message ? e.message : e) };
    }
}

