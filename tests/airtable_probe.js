/*
 Simple Airtable connectivity probe for the extension’s configured base/table/views.
 Read-only: uses GET requests to verify counts and first record fields.
*/

const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
const AIRTABLE_TODAY_VIEW_ID_D = 'viwjzxpzCC24wtkfc';
const AIRTABLE_TODAY_VIEW_ID_A = 'viwX2GldbNBTv1ho3';
const AIRTABLE_DUPLICATE_VIEW_ID = 'viwhyoCkHret6DqWe';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, statusText: res.statusText, data };
}

async function countView(viewId) {
  let count = 0; let offset; let pages = 0;
  do {
    const params = new URLSearchParams();
    if (viewId) params.set('view', viewId);
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
    const { ok, status, statusText, data } = await fetchJson(url);
    if (!ok) return { ok: false, count: 0, error: (data && data.error && (data.error.message || data.error.type)) || `${status} ${statusText}`, url };
    const recs = Array.isArray(data.records) ? data.records : [];
    count += recs.length; pages += 1; offset = data.offset;
  } while (offset && pages < 50);
  return { ok: true, count };
}

async function queryWithFormula(viewId, formula) {
  const params = new URLSearchParams();
  if (viewId) params.set('view', viewId);
  params.set('pageSize', '1');
  if (formula) params.set('filterByFormula', formula);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;
  const { ok, status, statusText, data } = await fetchJson(url);
  if (!ok) return { ok: false, count: 0, url, formula, error: (data && data.error && (data.error.message || data.error.type)) || `${status} ${statusText}` };
  const recs = Array.isArray(data.records) ? data.records : [];
  const first = recs[0] && recs[0].fields ? recs[0].fields : null;
  return { ok: true, count: recs.length, url, formula, sampleFields: first ? Object.keys(first) : [] };
}

async function main() {
  const excludeLock = "AND(NOT({Post URL}='LOCK_A'), NOT({Post URL}='LOCK_D'))";
  const strict = await queryWithFormula(AIRTABLE_VIEW_ID, `AND(NOT({Comment Done}), NOT({In Progress}), ${excludeLock})`);
  const fallback = await queryWithFormula(AIRTABLE_VIEW_ID, `AND(NOT({Comment Done}), ${excludeLock})`);
  const todayA = await countView(AIRTABLE_TODAY_VIEW_ID_A);
  const todayD = await countView(AIRTABLE_TODAY_VIEW_ID_D);
  const dup = await countView(AIRTABLE_DUPLICATE_VIEW_ID);
  const out = { view: AIRTABLE_VIEW_ID, strict, fallback, todayA, todayD, dup };
  console.log(JSON.stringify(out, null, 2));
  if (!strict.ok && !fallback.ok) process.exitCode = 2;
}

main().catch(e => { console.error('Probe failed', e && e.message ? e.message : e); process.exit(1); });
