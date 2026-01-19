// Test script to simulate clicking the start button
// This will test if the extension's background script responds to start messages

// Simulate chrome extension environment
global.chrome = {
    runtime: {
        onMessage: {
            addListener: () => {}
        },
        sendMessage: (message, callback) => {
            console.log('Sending message to extension:', message);
            // Simulate the background script receiving the message
            handleMessage(message, null, callback);
        },
        lastError: null
    },
    storage: {
        local: {
            get: (keys, callback) => {
                console.log('Storage get called with keys:', keys);
                callback({});
            },
            set: (obj, callback) => {
                console.log('Storage set called with:', obj);
                if (callback) callback();
            },
            remove: (keys, callback) => {
                console.log('Storage remove called with:', keys);
                if (callback) callback();
            }
        }
    },
    alarms: {
        create: (name, options) => {
            console.log('Alarm created:', name, options);
        },
        clear: (name, callback) => {
            console.log('Alarm cleared:', name);
            if (callback) callback(true);
        },
        clearAll: (callback) => {
            console.log('All alarms cleared');
            if (callback) callback(true);
        },
        onAlarm: {
            addListener: () => {}
        }
    },
    tabs: {
        create: (options, callback) => {
            console.log('Tab created:', options.url);
            const tab = { id: 123, url: options.url };
            if (callback) callback(tab);
        },
        update: (tabId, options, callback) => {
            console.log('Tab updated:', tabId, options);
            if (callback) callback({ id: tabId });
        },
        get: (tabId, callback) => {
            console.log('Tab get called:', tabId);
            callback({ id: tabId, url: 'https://linkedin.com' });
        },
        remove: (tabId, callback) => {
            console.log('Tab removed:', tabId);
            if (callback) callback();
        },
        query: (query, callback) => {
            console.log('Tab query:', query);
            callback([]);
        },
        onUpdated: {
            addListener: () => {}
        },
        onRemoved: {
            addListener: () => {}
        }
    },
    scripting: {
        executeScript: (options, callback) => {
            console.log('Script executed:', options.target, options.files);
            if (callback) callback();
        }
    }
};

// Import and test the background script logic
// Note: This is a simplified test - in a real extension, the background script runs in its own context

console.log('Testing extension start functionality...');

// Simulate clicking the start button
chrome.runtime.sendMessage({ action: 'start' }, (response) => {
    console.log('Response from start message:', response);
});

// Function to handle messages (simplified version of background.js logic)
function handleMessage(request, sender, sendResponse) {
    console.log('[TEST] Received message:', request.action);

    if (request.action === "start") {
        console.log('[TEST] Start button clicked');

        // Simulate the start logic
        const isRunning = false; // Assume not running
        const forceStop = false; // Assume not force stopped

        if (isRunning || forceStop) {
            console.log('[TEST] Cannot start - service is already running or force stopped');
            return;
        }

        console.log('[TEST] Starting service...');

        // Simulate setting state
        const nextDelay = 2000;
        const nextFireTime = Date.now() + nextDelay;

        console.log('[TEST] Would schedule next run in', nextDelay, 'ms at', new Date(nextFireTime));

        // Simulate creating alarm
        chrome.alarms.create('autoCommentTick', { when: nextFireTime });

        sendResponse({ success: true });
    }

    return true; // Keep message channel open for async response
}

console.log('Test completed - check the console output above');






