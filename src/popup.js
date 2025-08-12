document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    const processedEl = document.getElementById('stat-processed');
    const successesEl = document.getElementById('stat-successes');
    const failuresEl = document.getElementById('stat-failures');
    const todayEl = document.getElementById('stat-today');
        const startedAtEl = document.getElementById('stat-startedAt');

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
        lastNextFireTime = nextFireTime || null;
        if (!nextFireTime) {
            timerDiv.textContent = 'Next: --:--';
            return;
        }
        const msLeft = nextFireTime - Date.now();
        const min = Math.max(0, Math.floor(msLeft / 60000));
        const sec = Math.max(0, Math.floor((msLeft % 60000) / 1000));
        timerDiv.textContent = `Next: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

            function updateStatsUI(runStats, startedAt, todayCount) {
        const rs = runStats || {};
        processedEl.textContent = rs.processed || 0;
        successesEl.textContent = rs.successes || 0;
        failuresEl.textContent = rs.failures || 0;
                if (typeof todayCount === 'number') todayEl.textContent = todayCount;
                lastStartedAt = startedAt || null;
                renderStartedAt();
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

    function pollStatus() {
        chrome.runtime.sendMessage({ action: 'getStatus' }, (resp) => {
            if (!resp) {
                updateStatusUI(false);
                updateTimerUI(null);
                updateStatsUI(null);
                return;
            }
            updateStatusUI(resp.isRunning);
            updateTimerUI(resp.nextFireTime);
            updateStatsUI(resp.runStats, resp.startedAt, resp.todayCount);
        });
    }

    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start' });
        pollStatus();
        if (!countdownId) countdownId = setInterval(() => {
            if (lastNextFireTime) updateTimerUI(lastNextFireTime);
            // Also occasionally poll to refresh stats
        }, 1000);
        // Disable Start quickly to avoid double clicks
        startButton.disabled = true;
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

        // Options removed – API key and IDs are fixed in code.

    // Initial poll and ticking
    pollStatus();
    // Kick an immediate today count fetch for freshness
    chrome.runtime.sendMessage({ action: 'getTodayNow' }, (resp) => {
        if (resp && typeof resp.todayCount === 'number') {
            todayEl.textContent = resp.todayCount;
        }
    });
    countdownId = setInterval(() => {
        if (lastNextFireTime) updateTimerUI(lastNextFireTime);
        renderStartedAt();
        // Periodically refresh full status so async todayCount fetch reflects in UI
        const now = Date.now();
        if (now - lastPollAt > 5000) { // every 5s
            lastPollAt = now;
            pollStatus();
        }
    }, 1000);
});