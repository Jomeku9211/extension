document.addEventListener('DOMContentLoaded', () => {
  const apiKeyEl = document.getElementById('apiKey');
  const msgEl = document.getElementById('msg');
  const outEl = document.getElementById('testOut');

  function setMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.style.color = ok ? 'green' : 'red';
  }

  chrome.storage.local.get(['AIRTABLE_API_KEY'], (items) => {
    apiKeyEl.value = items.AIRTABLE_API_KEY || '';
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const AIRTABLE_API_KEY = apiKeyEl.value.trim();
    if (!AIRTABLE_API_KEY) {
      setMsg('Please fill API key.', false);
      return;
    }

    chrome.storage.local.set({ AIRTABLE_API_KEY }, () => {
      setMsg('Saved!', true);
    });
  });

  document.getElementById('testBtn').addEventListener('click', async () => {
    outEl.textContent = 'Testing...';
    const { AIRTABLE_API_KEY } = await new Promise((resolve) => {
      chrome.storage.local.get(['AIRTABLE_API_KEY'], resolve);
    });

    if (!AIRTABLE_API_KEY) {
      outEl.textContent = 'Missing config.';
      return;
    }

    try {
      const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
      const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
      const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
      const params = new URLSearchParams();
      params.set('view', AIRTABLE_VIEW_ID);
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
