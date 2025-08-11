// Airtable config: fixed and constant
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
let CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID };

let isRunning = false;
let nextDelay = null;
let nextFireTime = null;
let startedAt = null;
let runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };

// Restore state on boot
chrome.storage.local.get(['isRunning','nextFireTime','runStats','startedAt'], (items) => {
    isRunning = !!items.isRunning;
    nextFireTime = items.nextFireTime || null;
    runStats = items.runStats || runStats;
    startedAt = items.startedAt || null;
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



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        loadConfig().then(() => {
            // Always treat Start as a fresh session
            isRunning = true;
            runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
            startedAt = Date.now();
            // Immediate kickoff
            nextDelay = 2000;
            nextFireTime = Date.now() + nextDelay;
            chrome.alarms.clear('autoCommentTick', () => {
                chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
                scheduleNext(nextDelay);
            });
        });
    } 
    else if (request.action === "stop") {
        isRunning = false;
        nextFireTime = null;
        startedAt = null;
        chrome.alarms.clear('autoCommentTick');
    runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
    chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats });
    }
    else if (request.action === "getStatus") {
        sendResponse({ isRunning, nextFireTime, runStats, startedAt });
        // No need to return true, since sendResponse is synchronous here
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

    const record = await getNextPendingRecord();
    console.log("Processing record:", record);

    if (!record) {
        console.log("No pending records. Will check again later.");
        runStats.lastRun = Date.now();
        runStats.lastError = null;
        if (isRunning) {
                nextDelay = getRandomDelay(); // Random delay between 7 and 10 minutes
            nextFireTime = Date.now() + nextDelay;
            chrome.storage.local.set({ runStats, nextFireTime });
            scheduleNext(nextDelay);
        } else {
            chrome.storage.local.set({ runStats });
        }
        return;
    }

    const postUrl = record.fields["Post URL"];
    const commentText = record.fields["Generated Comment"];
    console.log(`Opening LinkedIn post: ${postUrl}`);


chrome.tabs.create({ url: postUrl, active: true }, (tab) => {
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
                            chrome.runtime.onMessage.removeListener(onResponse);
                            markRecordDone(record.id, tab.id).then(() => {
                                console.log("Marked record as done in Airtable:", record.id);
                                runStats.processed += 1;
                                runStats.successes += 1;
                                runStats.lastRun = Date.now();
                                runStats.lastError = null;
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
                });
            }, 10000); // 10,000 ms = 10 seconds
        }
    });
});

// Only keep these ONCE at the end of your file:
}

async function getNextPendingRecord() {
    const { AIRTABLE_API_KEY } = CONFIG || {};
    const params = new URLSearchParams();
    if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
    params.set('pageSize', '1');
    // Optional filter to only fetch records not marked as done
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

