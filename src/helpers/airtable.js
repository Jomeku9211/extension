// This helper intentionally avoids storing secrets in source control.
// You can pass config explicitly, or call with useStorage=true to read from chrome.storage.

async function readConfigFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['AIRTABLE_API_KEY'], (items) => {
            const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
            const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
            const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
            resolve({ ...items, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID });
        });
    });
}

export async function getNextPendingRecord(cfg, useStorage = false) {
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID } = useStorage ? await readConfigFromStorage() : (cfg || {});
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) return null;
    const params = new URLSearchParams();
    if (AIRTABLE_VIEW_ID) params.set('view', AIRTABLE_VIEW_ID);
    params.set('pageSize', '1');
    params.set('filterByFormula', 'NOT({Comment Done})');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' } });
    const data = await response.json();
    return data && Array.isArray(data.records) && data.records.length > 0 ? data.records[0] : null;
}

export async function markRecordDone(recordId, cfg, useStorage = false) {
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = useStorage ? await readConfigFromStorage() : (cfg || {});
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID || !recordId) return false;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Comment Done': true } })
    });
    return response.ok;
}