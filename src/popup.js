document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    const processedEl = document.getElementById('stat-processed');
    const successesEl = document.getElementById('stat-successes');
    const failuresEl = document.getElementById('stat-failures');
    const lastRunEl = document.getElementById('stat-lastRun');
    const lastErrorEl = document.getElementById('stat-lastError');
    const openOptions = document.getElementById('open-options');

    let countdownId = null;
    let lastNextFireTime = null;

    function updateStatusUI(isActive) {
        statusDiv.textContent = isActive ? 'Active' : 'Inactive';
        statusDiv.style.color = isActive ? 'green' : 'red';
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

    function updateStatsUI(runStats) {
        const rs = runStats || {};
        processedEl.textContent = rs.processed || 0;
        successesEl.textContent = rs.successes || 0;
        failuresEl.textContent = rs.failures || 0;
        lastRunEl.textContent = rs.lastRun ? new Date(rs.lastRun).toLocaleString() : '--';
        lastErrorEl.textContent = rs.lastError || '--';
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
            updateStatsUI(resp.runStats);
        });
    }

    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start' });
        pollStatus();
        if (!countdownId) countdownId = setInterval(() => {
            if (lastNextFireTime) updateTimerUI(lastNextFireTime);
            // Also occasionally poll to refresh stats
        }, 1000);
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop' });
        pollStatus();
        if (countdownId) { clearInterval(countdownId); countdownId = null; }
    });

    openOptions.addEventListener('click', (e) => {
        e.preventDefault();
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open('options.html');
        }
    });

    // Initial poll and ticking
    pollStatus();
    countdownId = setInterval(() => {
        if (lastNextFireTime) updateTimerUI(lastNextFireTime);
    }, 1000);
});