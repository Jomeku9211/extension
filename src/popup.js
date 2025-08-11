document.addEventListener('DOMContentLoaded', () => {
    // Robust stringify to avoid [object Object] and handle Error objects/circular refs
    function safeStringify(obj) {
        try {
            if (!obj) return '';
            if (typeof obj === 'string') return obj;
            if (obj && typeof obj.message === 'string') return obj.message;
            const seen = new WeakSet();
            return JSON.stringify(obj, (k, v) => {
                if (v instanceof Error) {
                    return { name: v.name, message: v.message, stack: v.stack };
                }
                if (typeof v === 'object' && v !== null) {
                    if (seen.has(v)) return '[Circular]';
                    seen.add(v);
                }
                return v;
            });
        } catch {
            return String(obj);
        }
    }

    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const statusDiv = document.getElementById('status');
    const timerDiv = document.getElementById('timer');
    const processedEl = document.getElementById('stat-processed');
    const successesEl = document.getElementById('stat-successes');
    const failuresEl = document.getElementById('stat-failures');
    const todayEl = document.getElementById('stat-today');
        const startedAtEl = document.getElementById('stat-startedAt');
    const acctRadios = Array.from(document.querySelectorAll('input[name="acct"]'));
    const errorRow = document.getElementById('errorRow');
    const lockRow = document.getElementById('lockRow');

    let countdownId = null;
    let lastNextFireTime = null;
        let lastStartedAt = null;
    let hasAccountSelected = false;

    function updateStatusUI(isActive, lastError) {
        statusDiv.textContent = isActive ? 'Active' : 'Inactive';
        statusDiv.classList.toggle('status-active', !!isActive);
        statusDiv.classList.toggle('status-inactive', !isActive);
        // Toggle buttons
        document.getElementById('start-button').classList.toggle('hidden', !!isActive);
        const stopBtn = document.getElementById('stop-button');
        stopBtn.classList.toggle('hidden', !isActive);
        stopBtn.disabled = !isActive;
        // Disable Start if no account selected
        startButton.disabled = !hasAccountSelected || !!isActive;
        // Error display
        if (!isActive && lastError) {
            errorRow.style.display = 'block';
            const msg = safeStringify(lastError) || '';
            errorRow.textContent = `Reason: ${msg}`;
        } else {
            errorRow.style.display = 'none';
            errorRow.textContent = '';
        }
    }

    async function checkAndShowLock(acct) {
        if (!acct) { lockRow.style.display = 'none'; return; }
        chrome.runtime.sendMessage({ action: 'checkLock', account: acct }, (resp) => {
            if (resp && resp.isLockedByOther) {
                lockRow.style.display = 'block';
                startButton.disabled = true;
            } else {
                lockRow.style.display = 'none';
                startButton.disabled = !hasAccountSelected;
            }
        });
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
                todayEl.textContent = hasAccountSelected && typeof todayCount === 'number' ? todayCount : '--';
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
        const acct = getSelectedAccount();
        hasAccountSelected = !!acct;
        // If no account, show placeholders and bail
        if (!hasAccountSelected) {
            updateStatusUI(false, null);
            updateTimerUI(null);
            updateStatsUI({ processed: 0, successes: 0, failures: 0 }, null, null);
            checkAndShowLock(null);
            return;
        }
        chrome.runtime.sendMessage({ action: 'getStatus', account: acct }, (resp) => {
            if (!resp) {
                updateStatusUI(false, null);
                updateTimerUI(null);
                updateStatsUI(null, null, null);
                checkAndShowLock(acct);
                return;
            }
            updateStatusUI(resp.isRunning, resp.runStats && resp.runStats.lastError);
            updateTimerUI(resp.nextFireTime);
            updateStatsUI(resp.runStats, resp.startedAt, resp.todayCount);
            checkAndShowLock(acct);
        });
    }

    startButton.addEventListener('click', () => {
        const acct = getSelectedAccount();
        if (!acct) { startButton.disabled = true; return; }
        chrome.runtime.sendMessage({ action: 'start', account: acct });
        pollStatus();
        if (!countdownId) countdownId = setInterval(() => {
            if (lastNextFireTime) updateTimerUI(lastNextFireTime);
            // Also occasionally poll to refresh stats
        }, 1000);
        // Disable Start quickly to avoid double clicks
        startButton.disabled = true;
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop', account: getSelectedAccount() });
        pollStatus();
        if (countdownId) { clearInterval(countdownId); countdownId = null; }
        startButton.disabled = false;
    });

        // Options removed – API key and IDs are fixed in code.

    // Initial poll and ticking
    // Load saved account (do not default; require explicit user selection)
    chrome.storage.local.get(['selectedAccount'], (it) => {
        const val = (it.selectedAccount === 'A' || it.selectedAccount === 'D') ? it.selectedAccount : null;
        if (val) setSelectedAccount(val);
        hasAccountSelected = !!val;
        startButton.disabled = !hasAccountSelected;
        pollStatus();
    });
    countdownId = setInterval(() => {
        if (lastNextFireTime) updateTimerUI(lastNextFireTime);
        renderStartedAt();
    }, 1000);

    // account selection handlers
    acctRadios.forEach(r => r.addEventListener('change', () => {
        const acct = getSelectedAccount();
        hasAccountSelected = !!acct;
        chrome.storage.local.set({ selectedAccount: acct || null });
        startButton.disabled = !hasAccountSelected;
        pollStatus();
    }));

    function getSelectedAccount() {
        const sel = acctRadios.find(r => r.checked);
        return sel ? sel.value : null;
    }
    function setSelectedAccount(val) {
        acctRadios.forEach(r => r.checked = (r.value === val));
    }
});