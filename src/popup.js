document.addEventListener('DOMContentLoaded', () => {
    // Tab management
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Commenting tab elements
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    const totalProspectsEl = document.getElementById('stat-total-prospects');
    const processedEl = document.getElementById('stat-processed');
    const successesEl = document.getElementById('stat-successes');
    const failuresEl = document.getElementById('stat-failures');
    const todayEl = document.getElementById('stat-today');
    const startedAtEl = document.getElementById('stat-startedAt');
    const lastPostButton = document.getElementById('last-post-button');
    const lastPostText = document.getElementById('last-post-text');
    const forceResetTimerButton = document.getElementById('force-reset-timer');
    const activityBadge = document.getElementById('activity');
    const attemptBadge = document.getElementById('attempt');
    const commentCountInput = document.getElementById('comment-count-input');

    // Messaging tab elements
    const messagingStartButton = document.getElementById('messaging-start-button');
    const messagingStopButton = document.getElementById('messaging-stop-button');
    const messagingStatusDiv = document.getElementById('messaging-status');
    const messagingTimerDiv = document.getElementById('messaging-timer');
    const messagingTotalProspectsEl = document.getElementById('messaging-stat-total-prospects');
    const messagingProcessedEl = document.getElementById('messaging-stat-processed');
    const messagingSuccessesEl = document.getElementById('messaging-stat-successes');
    const messagingFailuresEl = document.getElementById('messaging-stat-failures');
    const messagingTodayEl = document.getElementById('messaging-stat-today');
    const messagingStartedAtEl = document.getElementById('messaging-stat-startedAt');
    const messagingLastProfileButton = document.getElementById('messaging-last-profile-button');
    const messagingLastProfileText = document.getElementById('messaging-last-profile-text');
    const messagingActivityBadge = document.getElementById('messaging-activity');
    const messagingAttemptBadge = document.getElementById('messaging-attempt');
    const messageCountInput = document.getElementById('message-count-input');


    let countdownId = null;
    let lastPollAt = 0;
    let lastNextFireTime = null;
        let lastStartedAt = null;

    // Messaging variables
    let messagingCountdownId = null;
    let messagingLastPollAt = 0;
    let messagingLastNextFireTime = null;
    let messagingLastStartedAt = null;

    // Tab switching functionality
    function switchTab(tabName) {
        // Update tab buttons
        tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });

        // Update tab content
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // If switching to messaging tab, refresh the count if it's still showing loading
        if (tabName === 'messaging') {
            if (messagingTotalProspectsEl && messagingTotalProspectsEl.textContent === '...') {
                chrome.runtime.sendMessage({ action: 'getTotalMessageProspectsNow' }, (resp) => {
                    if (resp && typeof resp.totalMessageProspects === 'number') {
                        messagingTotalProspectsEl.textContent = resp.totalMessageProspects;
                        messagingTotalProspectsEl.style.color = 'var(--accent)';
                    }
                });
            }
        }
    }

    // Tab event listeners
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabName);
        });
    });

    function updateStatusUI(isActive) {
        statusDiv.textContent = isActive ? 'Active' : 'Inactive';
        statusDiv.classList.toggle('status-active', !!isActive);
        statusDiv.classList.toggle('status-inactive', !isActive);
        // Toggle buttons
        document.getElementById('start-button').classList.toggle('hidden', !!isActive);
        const stopBtn = document.getElementById('stop-button');
        stopBtn.classList.toggle('hidden', !isActive);
        stopBtn.disabled = !isActive;
    }

    function updateTimerUI(nextFireTime) {
        console.log('[updateTimerUI] nextFireTime:', nextFireTime, 'type:', typeof nextFireTime);
        lastNextFireTime = nextFireTime || null;
        if (!nextFireTime) {
            timerDiv.textContent = 'Next: --:--';
            console.log('[updateTimerUI] No nextFireTime, showing --:--');
            return;
        }
        const msLeft = nextFireTime - Date.now();
        
        // Handle negative values (past due)
        if (msLeft <= 0) {
            timerDiv.textContent = 'Next: Due now';
            console.log('[updateTimerUI] Timer is past due, msLeft:', msLeft);
            return;
        }
        
        const min = Math.floor(msLeft / 60000);
        const sec = Math.floor((msLeft % 60000) / 1000);
        const displayText = `Next: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        timerDiv.textContent = displayText;
        console.log('[updateTimerUI] Updated timer:', displayText, 'msLeft:', msLeft);
    }

            function updateStatsUI(runStats, startedAt, todayCount, lastPostUrl, totalProspects, commentingTargetCount, commentingCurrentCount) {
        const rs = runStats || {};
        if (typeof totalProspects === 'number') totalProspectsEl.textContent = totalProspects;
        processedEl.textContent = rs.processed || 0;
        successesEl.textContent = rs.successes || 0;
        failuresEl.textContent = rs.failures || 0;
                if (typeof todayCount === 'number') todayEl.textContent = todayCount;
                lastStartedAt = startedAt || null;
                renderStartedAt();
                updateLastPostButton(lastPostUrl);

                // Update commenting progress display
                if (commentingTargetCount && commentingCurrentCount !== undefined) {
                    // Update button text to show progress
                    const startButton = document.getElementById('start-button');
                    if (commentingTargetCount > 0) {
                        startButton.textContent = `Commenting (${commentingCurrentCount}/${commentingTargetCount})`;
                    } else {
                        startButton.textContent = 'Start Commenting';
                    }
                }
    }

            function formatHHmmAmPm(date) {
                let h = date.getHours();
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                if (h === 0) h = 12;
                const hh = h.toString().padStart(2, '0');
                const mm = date.getMinutes().toString().padStart(2, '0');
                return `${hh}:${mm} ${ampm}`;
            }

            function formatAgo(ms) {
                if (ms <= 0) return '0s ago';
                const s = Math.floor(ms / 1000);
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = s % 60;
                const parts = [];
                if (h) parts.push(`${h}h`);
                if (m) parts.push(`${m}m`);
                parts.push(`${sec}s`);
                return parts.join(' ') + ' ago';
            }

            function renderStartedAt() {
                if (!lastStartedAt) {
                    startedAtEl.textContent = '--';
                    return;
                }
                const d = new Date(lastStartedAt);
                const label = formatHHmmAmPm(d);
                const ago = formatAgo(Date.now() - d.getTime());
                startedAtEl.textContent = `${label} (${ago})`;
            }

            function updateLastPostButton(lastPostUrl) {
                console.log('[updateLastPostButton] lastPostUrl:', lastPostUrl);
                if (lastPostUrl) {
                    lastPostButton.style.display = 'block';
                    lastPostText.textContent = 'View Last Post';
                    lastPostButton.onclick = () => {
                        chrome.tabs.create({ url: lastPostUrl, active: false });
                    };
                    lastPostButton.disabled = false;
                    console.log('[updateLastPostButton] Button enabled with URL:', lastPostUrl);
                } else {
                    lastPostButton.style.display = 'block';
                    lastPostText.textContent = 'No Posts Yet';
                    lastPostButton.onclick = null;
                    lastPostButton.disabled = true;
                    console.log('[updateLastPostButton] Button disabled - no URL');
                }
            }

    // Messaging-specific functions
    function updateMessagingStatusUI(isActive) {
        messagingStatusDiv.textContent = isActive ? 'Active' : 'Inactive';
        messagingStatusDiv.classList.toggle('status-active', !!isActive);
        messagingStatusDiv.classList.toggle('status-inactive', !isActive);
        messagingStartButton.classList.toggle('hidden', !!isActive);
        const stopBtn = messagingStopButton;
        stopBtn.classList.toggle('hidden', !isActive);
        stopBtn.disabled = !isActive;
    }

    function updateMessagingTimerUI(nextFireTime) {
        messagingLastNextFireTime = nextFireTime || null;
        if (!nextFireTime) {
            messagingTimerDiv.textContent = 'Next: --:--';
            return;
        }
        const msLeft = nextFireTime - Date.now();
        if (msLeft <= 0) {
            messagingTimerDiv.textContent = 'Next: Due now';
            return;
        }
        const min = Math.floor(msLeft / 60000);
        const sec = Math.floor((msLeft % 60000) / 1000);
        const displayText = `Next: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        messagingTimerDiv.textContent = displayText;
    }

    function updateMessagingStatsUI(runStats, startedAt, todayCount, lastProfileUrl, totalProspects) {
        const rs = runStats || {};
        if (typeof totalProspects === 'number') messagingTotalProspectsEl.textContent = totalProspects;
        messagingProcessedEl.textContent = rs.processed || 0;
        messagingSuccessesEl.textContent = rs.successes || 0;
        messagingFailuresEl.textContent = rs.failures || 0;
        if (typeof todayCount === 'number') messagingTodayEl.textContent = todayCount;
        messagingLastStartedAt = startedAt || null;
        renderMessagingStartedAt();
        updateMessagingLastProfileButton(lastProfileUrl);
    }

    function renderMessagingStartedAt() {
        if (!messagingLastStartedAt) {
            messagingStartedAtEl.textContent = '--';
            return;
        }
        const d = new Date(messagingLastStartedAt);
        const label = formatHHmmAmPm(d);
        const ago = formatAgo(Date.now() - d.getTime());
        messagingStartedAtEl.textContent = `${label} (${ago})`;
    }

    function updateMessagingLastProfileButton(lastProfileUrl) {
        if (lastProfileUrl) {
            messagingLastProfileButton.style.display = 'block';
            messagingLastProfileText.textContent = 'View Last Profile';
            messagingLastProfileButton.onclick = () => {
                chrome.tabs.create({ url: lastProfileUrl, active: false });
            };
            messagingLastProfileButton.disabled = false;
        } else {
            messagingLastProfileButton.style.display = 'block';
            messagingLastProfileText.textContent = 'No Profiles Yet';
            messagingLastProfileButton.onclick = null;
            messagingLastProfileButton.disabled = true;
        }
    }

    function pollStatus() {
        console.log('[pollStatus] Sending getStatus message');
        chrome.runtime.sendMessage({ action: 'getStatus' }, (resp) => {
            console.log('[pollStatus] Response:', resp);
            if (resp && typeof resp.totalProspects === 'number') {
                console.log('[pollStatus] Updating total prospects from pollStatus:', resp.totalProspects);
            }
            console.log('[pollStatus] nextFireTime from response:', resp?.nextFireTime, 'type:', typeof resp?.nextFireTime);
            if (!resp) {
                updateStatusUI(false);
                updateTimerUI(null);
                updateStatsUI(null);
                if (activityBadge) activityBadge.textContent = 'Idle';
                if (attemptBadge) attemptBadge.textContent = 'Attempt: 0';
                return;
            }
            updateStatusUI(resp.isRunning);
            updateTimerUI(resp.nextFireTime);
            updateStatsUI(resp.runStats, resp.startedAt, resp.todayCount, resp.lastPostUrl, resp.totalProspects, resp.commentingTargetCount, resp.commentingCurrentCount);
            // Activity and attempts
            if (activityBadge) activityBadge.textContent = resp.isProcessingTick ? 'Working…' : 'Idle';
            if (attemptBadge) attemptBadge.textContent = `Attempt: ${resp.currentAttempt || 0}`;
        });
    }

    function pollMessagingStatus() {
        chrome.runtime.sendMessage({ action: 'getMessagingStatus' }, (resp) => {
            if (resp && typeof resp.totalMessageProspects === 'number') {
                console.log('[pollMessagingStatus] Updating total message prospects:', resp.totalMessageProspects);
            }
            if (!resp) {
                updateMessagingStatusUI(false);
                updateMessagingTimerUI(null);
                updateMessagingStatsUI(null);
                if (messagingActivityBadge) messagingActivityBadge.textContent = 'Idle';
                if (messagingAttemptBadge) messagingAttemptBadge.textContent = 'Attempt: 0';
                return;
            }
            updateMessagingStatusUI(resp.isMessagingRunning);
            updateMessagingTimerUI(resp.messagingNextFireTime);
            updateMessagingStatsUI(resp.messagingRunStats, resp.messagingStartedAt, resp.messagingTodayCount, resp.messagingLastProfileUrl, resp.totalMessageProspects);
            if (messagingActivityBadge) messagingActivityBadge.textContent = resp.isMessagingProcessingTick ? 'Working…' : 'Idle';
            if (messagingAttemptBadge) messagingAttemptBadge.textContent = `Attempt: ${resp.messagingCurrentAttempt || 0}`;
        });
    }

    startButton.addEventListener('click', () => {
        const commentCount = parseInt(commentCountInput.value) || 10;
        console.log('[popup] Start button clicked with count:', commentCount);
        chrome.runtime.sendMessage({ action: 'start', commentCount }, (response) => {
            console.log('[popup] Start message response:', response);
        });
        console.log('[popup] Calling pollStatus after start');
        pollStatus();
        // Disable Start quickly to avoid double clicks
        startButton.disabled = true;

        // Immediately reset UI stats to 0 on start
        processedEl.textContent = '0';
        successesEl.textContent = '0';
        failuresEl.textContent = '0';

        // Fetch fresh today count
        chrome.runtime.sendMessage({ action: 'getTodayNow' }, (resp) => {
            if (resp && typeof resp.todayCount === 'number') {
                todayEl.textContent = resp.todayCount;
            }
        });
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop' });
        // Optimistically reset UI stats to 0 immediately
        processedEl.textContent = '0';
        successesEl.textContent = '0';
        failuresEl.textContent = '0';
        // Reset button text
        startButton.textContent = 'Start Commenting';
        pollStatus();
        if (countdownId) { clearInterval(countdownId); countdownId = null; }
        startButton.disabled = false;
    });

    forceResetTimerButton.addEventListener('click', () => {
        console.log('[popup] Force reset timer button clicked');
        chrome.runtime.sendMessage({ action: 'forceResetTimer' }, (response) => {
            if (response && response.success) {
                console.log('[popup] Timer reset successfully');
                // Refresh the status to show the new timer
                pollStatus();
            } else {
                console.error('[popup] Failed to reset timer');
            }
        });
    });

    // Messaging event listeners
    messagingStartButton.addEventListener('click', () => {
        const messageCount = parseInt(messageCountInput.value) || 10;
        console.log('[messaging] Start button clicked with count:', messageCount);
        chrome.runtime.sendMessage({ action: 'startMessaging', messageCount }, (response) => {
            console.log('[messaging] Start message response:', response);
        });
        pollMessagingStatus();
        messagingStartButton.disabled = true;

        // Reset messaging UI stats to 0 on start
        messagingProcessedEl.textContent = '0';
        messagingSuccessesEl.textContent = '0';
        messagingFailuresEl.textContent = '0';

        // Fetch fresh messaging today count
        chrome.runtime.sendMessage({ action: 'getMessagingTodayNow' }, (resp) => {
            if (resp && typeof resp.messagingTodayCount === 'number') {
                messagingTodayEl.textContent = resp.messagingTodayCount;
            }
        });
    });

    messagingStopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopMessaging' });
        messagingProcessedEl.textContent = '0';
        messagingSuccessesEl.textContent = '0';
        messagingFailuresEl.textContent = '0';
        pollMessagingStatus();
        if (messagingCountdownId) { clearInterval(messagingCountdownId); messagingCountdownId = null; }
        messagingStartButton.disabled = false;
    });




        // Options removed – API key and IDs are fixed in code.

    // Initialize last post button as hidden
    updateLastPostButton(null);

    // Initialize messaging last profile button as hidden
    updateMessagingLastProfileButton(null);

    // Initial poll and ticking
    pollStatus();
    pollMessagingStatus(); // Initialize messaging status

    // Kick an immediate today count fetch for freshness
    chrome.runtime.sendMessage({ action: 'getTodayNow' }, (resp) => {
        if (resp && typeof resp.todayCount === 'number') {
            todayEl.textContent = resp.todayCount;
        }
    });

    // Kick an immediate messaging today count fetch for freshness
    chrome.runtime.sendMessage({ action: 'getMessagingTodayNow' }, (resp) => {
        if (resp && typeof resp.messagingTodayCount === 'number') {
            messagingTodayEl.textContent = resp.messagingTodayCount;
        }
    });

    // Fetch total prospects count
    console.log('[popup] Fetching total prospects count...');
    chrome.runtime.sendMessage({ action: 'getTotalProspectsNow' }, (resp) => {
        console.log('[popup] Total prospects response:', resp);
        if (resp && typeof resp.totalProspects === 'number') {
            totalProspectsEl.textContent = resp.totalProspects;
            console.log('[popup] Updated total prospects display to:', resp.totalProspects);
        } else {
            console.warn('[popup] Invalid total prospects response:', resp);
        }
    });

    // Fetch total messaging prospects count
    if (messagingTotalProspectsEl) {
        messagingTotalProspectsEl.textContent = '...';
        messagingTotalProspectsEl.style.color = 'var(--muted)';
    }

    chrome.runtime.sendMessage({ action: 'getTotalMessageProspectsNow' }, (resp) => {
        if (messagingTotalProspectsEl) {
            messagingTotalProspectsEl.style.color = 'var(--accent)';
        }

        if (resp && typeof resp.totalMessageProspects === 'number') {
            if (messagingTotalProspectsEl) {
                messagingTotalProspectsEl.textContent = resp.totalMessageProspects;
            }
        } else {
            if (messagingTotalProspectsEl) {
                messagingTotalProspectsEl.textContent = '0';
            }
        }
    });

    countdownId = setInterval(() => {
        // Update timer every second if we have a nextFireTime
        if (lastNextFireTime) {
            updateTimerUI(lastNextFireTime);
        }
        if (messagingLastNextFireTime) {
            updateMessagingTimerUI(messagingLastNextFireTime);
        }
        renderStartedAt();
        renderMessagingStartedAt();
        // Periodically refresh full status so async todayCount fetch reflects in UI
        const now = Date.now();
        if (now - lastPollAt > 5000) { // every 5s
            lastPollAt = now;
            pollStatus();
            pollMessagingStatus();
        }
    }, 1000);
});