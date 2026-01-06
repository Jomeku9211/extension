// This helper intentionally avoids storing secrets in source control.
// You can pass config explicitly, or call with useStorage=true to read from chrome.storage.

const FIXED_CFG = {
    AIRTABLE_API_KEY: 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982',
    AIRTABLE_BASE_ID: 'appD9VxZrOhiQY9VB',
    AIRTABLE_TABLE_ID: 'tblyhMPmCt87ORo3t',
    AIRTABLE_VIEW_ID: 'viwiRzf62qaMKGQoG'
};

export async function getNextPendingRecord(cfg) {
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID } = cfg || FIXED_CFG;
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

export async function markRecordDone(recordId, cfg) {
    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID } = cfg || FIXED_CFG;
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID || !recordId) return false;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Comment Done': true } })
    });
    return response.ok;
}