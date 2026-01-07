document.addEventListener('DOMContentLoaded', () => {
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


    let countdownId = null;
    let lastPollAt = 0;
    let lastNextFireTime = null;
        let lastStartedAt = null;

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

            function updateStatsUI(runStats, startedAt, todayCount, lastPostUrl, totalProspects) {
        const rs = runStats || {};
        if (typeof totalProspects === 'number') totalProspectsEl.textContent = totalProspects;
        processedEl.textContent = rs.processed || 0;
        successesEl.textContent = rs.successes || 0;
        failuresEl.textContent = rs.failures || 0;
                if (typeof todayCount === 'number') todayEl.textContent = todayCount;
                lastStartedAt = startedAt || null;
                renderStartedAt();
                updateLastPostButton(lastPostUrl);
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
            updateStatsUI(resp.runStats, resp.startedAt, resp.todayCount, resp.lastPostUrl, resp.totalProspects);
            // Activity and attempts
            if (activityBadge) activityBadge.textContent = resp.isProcessingTick ? 'Working…' : 'Idle';
            if (attemptBadge) attemptBadge.textContent = `Attempt: ${resp.currentAttempt || 0}`;
        });
    }

    startButton.addEventListener('click', () => {
        console.log('[popup] Start button clicked, sending start message');
        chrome.runtime.sendMessage({ action: 'start' }, (response) => {
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



        // Options removed – API key and IDs are fixed in code.

    // Initialize last post button as hidden
    updateLastPostButton(null);
    
    // Initial poll and ticking
    pollStatus();
    // Kick an immediate today count fetch for freshness
    chrome.runtime.sendMessage({ action: 'getTodayNow' }, (resp) => {
        if (resp && typeof resp.todayCount === 'number') {
            todayEl.textContent = resp.todayCount;
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
    countdownId = setInterval(() => {
        // Update timer every second if we have a nextFireTime
        if (lastNextFireTime) {
            updateTimerUI(lastNextFireTime);
        }
        renderStartedAt();
        // Periodically refresh full status so async todayCount fetch reflects in UI
        const now = Date.now();
        if (now - lastPollAt > 5000) { // every 5s
            lastPollAt = now;
            pollStatus();
        }
    }, 1000);
});