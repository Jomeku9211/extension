document.addEventListener('DOMContentLoaded', () => {
  const apiKeyEl = document.getElementById('apiKey');
  const baseIdEl = document.getElementById('baseId');
  const tableIdEl = document.getElementById('tableId');
  const viewIdEl = document.getElementById('viewId');
  const msgEl = document.getElementById('msg');
  const outEl = document.getElementById('testOut');

  function setMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.style.color = ok ? 'green' : 'red';
  }

  chrome.storage.local.get(['AIRTABLE_API_KEY','AIRTABLE_BASE_ID','AIRTABLE_TABLE_ID','AIRTABLE_VIEW_ID'], (items) => {
    apiKeyEl.value = items.AIRTABLE_API_KEY || '';
    baseIdEl.value = items.AIRTABLE_BASE_ID || '';
    tableIdEl.value = items.AIRTABLE_TABLE_ID || '';
    viewIdEl.value = items.AIRTABLE_VIEW_ID || '';
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const AIRTABLE_API_KEY = apiKeyEl.value.trim();
    const AIRTABLE_BASE_ID = baseIdEl.value.trim();
    const AIRTABLE_TABLE_ID = tableIdEl.value.trim();
    const AIRTABLE_VIEW_ID = viewIdEl.value.trim();

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
      setMsg('Please fill API key, Base ID and Table ID.', false);
      return;
    }

    chrome.storage.local.set({ AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID }, () => {
      setMsg('Saved!', true);
    });
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    outEl.textContent = 'Testing...';
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID } = await new Promise((resolve) => {
      chrome.storage.local.get(['AIRTABLE_API_KEY','AIRTABLE_BASE_ID','AIRTABLE_TABLE_ID','AIRTABLE_VIEW_ID'], resolve);
    });

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
      outEl.textContent = 'Missing config.';
      return;
    }

    try {
      const params = new URLSearchParams();
      if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
      params.set('pageSize', '1');
      params.set('filterByFormula', 'NOT({Comment Done})');
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const data = await res.json();
      outEl.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      outEl.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
    }
  });
});
