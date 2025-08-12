document.addEventListener('DOMContentLoaded', () => {
  // Safe stringify to avoid [object Object]
  function safeStringify(obj) {
    try {
      if (!obj) return '';
      if (typeof obj === 'string') return obj;
      if (obj && typeof obj.message === 'string') return obj.message;
      const seen = new WeakSet();
      return JSON.stringify(obj, (k, v) => {
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
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
  const acctHint = document.getElementById('acctHint');
  // Debug UI removed

  let countdownId = null;
  let lastNextFireTime = null;
  let lastStartedAt = null;
  let hasAccountSelected = false;
  let pollTick = 0;

  function updateStatusUI(isActive, lastError) {
    statusDiv.textContent = isActive ? 'Active' : 'Inactive';
    statusDiv.classList.toggle('status-active', !!isActive);
    statusDiv.classList.toggle('status-inactive', !isActive);
    // Toggle buttons
    startButton.classList.toggle('hidden', !!isActive);
    stopButton.classList.toggle('hidden', !isActive);
    stopButton.disabled = !isActive;
    // Disable Start if no account selected and toggle hint
    const shouldDisable = !hasAccountSelected || !!isActive;
    startButton.disabled = shouldDisable;
    // Only show hint when inactive (so user can still see Stop when active without selection)
    acctHint.style.display = (!hasAccountSelected && !isActive) ? 'block' : 'none';
  // Error display: show whenever an error exists (even if Active)
  if (lastError) {
      errorRow.style.display = 'block';
      const msg = safeStringify(lastError) || '';
      errorRow.textContent = `Reason: ${msg}`;
    } else {
      errorRow.style.display = 'none';
      errorRow.textContent = '';
    }
  }

  function checkAndShowLock(acct) {
    if (!acct) {
      lockRow.style.display = 'none';
      return;
    }
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
  lastNextFireTime = typeof nextFireTime === 'number' ? nextFireTime : null;
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

  function pollStatus(force = false) {
    const acct = getSelectedAccount();
    hasAccountSelected = !!acct;
    chrome.runtime.sendMessage({ action: 'getStatus', account: acct || undefined, force }, (resp) => {
      if (!resp) {
        updateStatusUI(false, null);
        updateTimerUI(null);
        updateStatsUI(null, null, null);
        checkAndShowLock(acct || null);
        return;
      }
      updateStatusUI(resp.isRunning, resp.runStats && resp.runStats.lastError);
      updateTimerUI(resp.nextFireTime);
      const showToday = (typeof resp.todayCount === 'number') ? resp.todayCount : null;
      updateStatsUI(resp.runStats, resp.startedAt, showToday);
      checkAndShowLock(acct || null);
    });
  }

  startButton.addEventListener('click', () => {
    const acct = getSelectedAccount();
    if (!acct) { startButton.disabled = true; return; }
    try { chrome.storage.local.set({ selectedAccount: acct }); } catch (_) {}
    chrome.runtime.sendMessage({ action: 'start', account: acct }, (resp) => {
      if (chrome.runtime.lastError) {
        updateStatusUI(false, `Start error: ${chrome.runtime.lastError.message || 'unknown'}`);
        pollStatus(true);
      }
    });
  // Optimistic UI: show Active state and start a 2s countdown immediately
  updateStatusUI(true, null);
  const optimisticNext = Date.now() + 2000;
  updateTimerUI(optimisticNext);
  // Give background a brief moment to acquire the lock and persist state
  setTimeout(() => pollStatus(true), 500);
  // Fallback check after 2500ms: if still not running, force refresh to capture Reason
  setTimeout(() => pollStatus(true), 2500);
    if (!countdownId) countdownId = setInterval(() => {
      if (lastNextFireTime) updateTimerUI(lastNextFireTime);
      // Occasionally poll to refresh stats and nextFireTime
      pollTick = (pollTick + 1) % 4;
      if (pollTick === 0) pollStatus(false);
    }, 1000);
    // Disable Start quickly to avoid double clicks
    startButton.disabled = true;
  });

  stopButton.addEventListener('click', () => {
  // Allow stopping regardless of account radio selection
  chrome.runtime.sendMessage({ action: 'stop' });
  // Clear selection after stop
  clearAccountSelection();
    try { chrome.storage.local.set({ selectedAccount: null }); } catch (_) {}
    pollStatus(true);
    if (countdownId) { clearInterval(countdownId); countdownId = null; }
    startButton.disabled = true;
  });

  // On load, restore previously selected account so today's count/lock show while running
  try {
    chrome.storage.local.get(['selectedAccount'], (items) => {
      const sel = items && items.selectedAccount;
      if (sel === 'A' || sel === 'D') {
        setSelectedAccount(sel);
        hasAccountSelected = true;
        startButton.disabled = false;
        acctHint.style.display = 'none';
        pollStatus(true);
      }
    });
  } catch (_) {}

  // Don’t preselect any account on load; require explicit user action
  hasAccountSelected = false;
  startButton.disabled = true;
  acctHint.style.display = 'block';
  pollStatus(true);

  // Local tick for timer and last-start display
  countdownId = setInterval(() => {
    if (lastNextFireTime) updateTimerUI(lastNextFireTime);
    renderStartedAt();
  }, 1000);

  // Listen for background status updates and refresh immediately
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'statusUpdated') {
      pollStatus(true);
    }
  });

  // Account selection handlers
  acctRadios.forEach(r => r.addEventListener('change', () => {
    const acct = getSelectedAccount();
    hasAccountSelected = !!acct;
    startButton.disabled = !hasAccountSelected;
    acctHint.style.display = !hasAccountSelected ? 'block' : 'none';
    if (acct) { try { chrome.storage.local.set({ selectedAccount: acct }); } catch (_) {} }
    pollStatus(true);
  }));

  // Debug UI removed

  function getSelectedAccount() {
    const sel = acctRadios.find(r => r.checked);
    return sel ? sel.value : null;
  }
  function setSelectedAccount(val) {
    acctRadios.forEach(r => r.checked = (r.value === val));
  }
  function clearAccountSelection() {
    acctRadios.forEach(r => r.checked = false);
    hasAccountSelected = false;
    startButton.disabled = true;
    acctHint.style.display = 'block';
  }
});