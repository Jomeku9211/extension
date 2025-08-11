// Airtable credentials are loaded from chrome.storage (set in options page)
let CONFIG = null;

let isRunning = false;
let intervalId = null;
let nextDelay = null;
let nextFireTime = null;

setInterval(() => {
    if (isRunning) {
        console.log("Auto-commenting is active... (heartbeat every 10 seconds)");
    }
}, 10000);

function getRandomDelay() {
    // Random delay between 7 and 10 minutes
    return (7 + Math.random() * 3) * 60 * 1000;
}

async function loadConfig() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            'AIRTABLE_API_KEY',
            'AIRTABLE_BASE_ID',
            'AIRTABLE_TABLE_ID',
            'AIRTABLE_VIEW_ID'
        ], (items) => {
            const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID } = items || {};
            if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
                console.warn('Airtable config missing. Open the extension options to configure.');
                CONFIG = null;
                return resolve(null);
            }
            CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID };
            resolve(CONFIG);
        });
    });
}



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        if (isRunning) return;
        loadConfig().then((cfg) => {
            if (!cfg) {
                // Do not start without config
                isRunning = false;
                nextFireTime = null;
                return;
            }
            isRunning = true;
            nextDelay = getRandomDelay();
            nextFireTime = Date.now() + nextDelay;
            startAutoCommenting();
        });
    } 
    else if (request.action === "stop") {
        isRunning = false;
        if (intervalId) clearTimeout(intervalId);
        intervalId = null;
        nextFireTime = null;
    }
    else if (request.action === "getStatus") {
        sendResponse({ isRunning, nextFireTime });
        // No need to return true, since sendResponse is synchronous here
    }
});

function startAutoCommenting() {
    if (!isRunning) return;
    processRecords();
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
        console.log("No more pending records.");
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
                                if (isRunning) {
                                    nextDelay = getRandomDelay();
                                    nextFireTime = Date.now() + nextDelay;
                                    setTimeout(() => {
                                        processRecords();
                                    }, nextDelay);
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
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID } = CONFIG || {};
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
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = CONFIG || {};
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
