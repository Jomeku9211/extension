document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    let countdownId = null;

    function updateStatusUI(isActive) {
        statusDiv.textContent = isActive ? 'Active' : 'Inactive';
        statusDiv.style.color = isActive ? 'green' : 'red';
    }

    function updateTimerUI(nextFireTime) {
        if (!nextFireTime) {
            timerDiv.textContent = 'Next comment in: --:--';
            return;
        }
        const msLeft = nextFireTime - Date.now();
        if (msLeft <= 0) {
            timerDiv.textContent = 'Next comment in: 00:00';
            return;
        }
        const min = Math.floor(msLeft / 60000);
        const sec = Math.floor((msLeft % 60000) / 1000);
        timerDiv.textContent = `Next comment in: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

   function pollStatus() {
    chrome.runtime.sendMessage({ action: "getStatus" }, (resp) => {
        if (!resp) {
            updateStatusUI(false);
            updateTimerUI(null);
            return;
        }
        updateStatusUI(resp.isRunning);
        updateTimerUI(resp.nextFireTime);
    });
}

    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start' });
        pollStatus();
        if (!countdownId) {
            countdownId = setInterval(pollStatus, 1000);
        }
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop' });
        pollStatus();
        if (countdownId) {
            clearInterval(countdownId);
            countdownId = null;
        }
    });

    // Initial poll
    pollStatus();
    countdownId = setInterval(pollStatus, 1000);
});