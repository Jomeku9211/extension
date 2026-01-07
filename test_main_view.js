// Test script to check the main view for total prospects count
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';

async function testMainView() {
    console.log('Testing main view:', AIRTABLE_VIEW_ID);
    console.log('URL:', `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?view=${AIRTABLE_VIEW_ID}&pageSize=5`);

    try {
        let count = 0;
        let offset = undefined;
        let page = 0;

        do {
            page++;
            const params = new URLSearchParams();
            params.set('view', AIRTABLE_VIEW_ID);
            params.set('pageSize', '100');
            if (offset) params.set('offset', offset);
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`;

            console.log(`Page ${page}: Fetching...`);
            const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
            const data = await res.json();

            if (!res.ok) {
                console.error('API Error:', res.status, data);
                return;
            }

            if (data && Array.isArray(data.records)) {
                const batchCount = data.records.length;
                count += batchCount;
                console.log(`Page ${page}: Found ${batchCount} records (total: ${count})`);

                if (data.records.length > 0) {
                    console.log('Sample record fields:', Object.keys(data.records[0].fields));
                }
            }

            offset = data && data.offset;
        } while (offset);

        console.log(`✅ Total records in main view: ${count}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testMainView();
