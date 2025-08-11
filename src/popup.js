document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    const processedEl = document.getElementById('stat-processed');
    const successesEl = document.getElementById('stat-successes');
    const failuresEl = document.getElementById('stat-failures');
        const startedAtEl = document.getElementById('stat-startedAt');

    let countdownId = null;
    let lastNextFireTime = null;

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

        function updateStatsUI(runStats, startedAt) {
        const rs = runStats || {};
        processedEl.textContent = rs.processed || 0;
        successesEl.textContent = rs.successes || 0;
        failuresEl.textContent = rs.failures || 0;
            if (startedAt) {
                const d = new Date(startedAt);
                startedAtEl.textContent = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            } else {
                startedAtEl.textContent = '--';
            }
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
            updateStatsUI(resp.runStats, resp.startedAt);
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
    }, 1000);
});