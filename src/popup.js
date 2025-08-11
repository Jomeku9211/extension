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
                todayEl.textContent = typeof todayCount === 'number' ? todayCount : (todayEl.textContent || 0);
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
                    return `${hh}.${mm} ${ampm}`;
                }

                    function formatMinutesAgo(ms) {
                        const mins = Math.max(0, Math.floor(ms / 60000));
                        return `${mins}m ago`;
                    }

            function renderStartedAt() {
                if (!lastStartedAt) {
                    startedAtEl.textContent = '--';
                    return;
                }
                const d = new Date(lastStartedAt);
                const label = formatHHmmAmPm(d);
                const ago = formatMinutesAgo(Date.now() - d.getTime());
                startedAtEl.textContent = `${label} - (${ago})`;
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
        pollStatus();
        if (countdownId) { clearInterval(countdownId); countdownId = null; }
        startButton.disabled = false;
    });

        // Options removed – API key and IDs are fixed in code.

    // Initial poll and ticking
    pollStatus();
    countdownId = setInterval(() => {
        if (lastNextFireTime) updateTimerUI(lastNextFireTime);
        renderStartedAt();
    }, 1000);
});