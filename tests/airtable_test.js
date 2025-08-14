// Test script to verify Airtable connection and field names
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';

async function testAirtableConnection() {
    console.log('Testing Airtable connection...');
    
    try {
        // Test 1: Fetch a single record to see field names
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?pageSize=1`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Connection successful');
        console.log('Sample record fields:', data.records?.[0]?.fields || 'No records found');
        
        // Test 2: Check for required fields
        if (data.records && data.records.length > 0) {
            const fields = data.records[0].fields;
            console.log('\n🔍 Checking for required fields:');
            
            const requiredFields = [
                'Post URL',
                'Generated Comment', 
                'Comment Done',
                'Comment By',
                'Comment On'
            ];
            
            requiredFields.forEach(fieldName => {
                if (fields[fieldName] !== undefined) {
                    console.log(`✅ ${fieldName}: ${fields[fieldName]}`);
                } else {
                    console.log(`❌ ${fieldName}: NOT FOUND`);
                }
            });
            
            // Also check for any fields that might contain "Comment" in the name
            console.log('\n🔍 Looking for Comment-related fields:');
            Object.keys(fields).forEach(fieldName => {
                if (fieldName.toLowerCase().includes('comment')) {
                    console.log(`📝 ${fieldName}: ${fields[fieldName]}`);
                }
            });
            
            // Test 3: Try to update a test field (this will fail but show field validation)
            if (data.records && data.records.length > 0) {
                const testRecordId = data.records[0].id;
                console.log(`\n🧪 Testing field update on record: ${testRecordId}`);
                
                // Try different field name variations
                const testFields = { "Comment Done": true };
                const updateResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${testRecordId}`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: testFields })
                });
                
                if (updateResponse.ok) {
                    console.log('✅ Field update successful');
                } else {
                    const errorText = await updateResponse.text();
                    console.log(`⚠️ Field update failed (${updateResponse.status}): ${errorText}`);
                }
                
                // Test 3b: Try to add Comment By field
                console.log(`\n🧪 Testing Comment By field creation on record: ${testRecordId}`);
                const commentByFields = { "Comment By": "Dheeraj" };
                const commentByResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${testRecordId}`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: commentByFields })
                });
                
                if (commentByResponse.ok) {
                    console.log('✅ Comment By field creation successful');
                } else {
                    const errorText = await commentByResponse.text();
                    console.log(`⚠️ Comment By field creation failed (${commentByResponse.status}): ${errorText}`);
                }
            }
        }
        
        // Test 4: Check the specific view for pending comments
        console.log('\n🔍 Testing the main view for pending comments:');
        const viewUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?view=viwiRzf62qaMKGQoG&pageSize=5`;
        const viewResponse = await fetch(viewUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        
        if (viewResponse.ok) {
            const viewData = await viewResponse.json();
            console.log(`✅ View accessible, found ${viewData.records?.length || 0} records`);
            if (viewData.records && viewData.records.length > 0) {
                console.log('Sample record from view:', viewData.records[0].fields);
            }
        } else {
            console.log(`❌ View access failed: ${viewResponse.status}`);
        }
        
        // Test 4b: Check the today's view (Comment form view)
        console.log('\n🔍 Testing the today\'s view (Comment form view):');
        const todayViewUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?view=viwjzxpzCC24wtkfc&pageSize=5`;
        const todayViewResponse = await fetch(todayViewUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        
        if (todayViewResponse.ok) {
            const todayViewData = await todayViewResponse.json();
            console.log(`✅ Today's view accessible, found ${todayViewData.records?.length || 0} records`);
            if (todayViewData.records && todayViewData.records.length > 0) {
                console.log('Sample record from today\'s view:', todayViewData.records[0].fields);
            }
        } else {
            console.log(`❌ Today's view access failed: ${todayViewResponse.status}`);
        }
        
        // Test 5: Find records ready for commenting
        console.log('\n🔍 Finding records ready for commenting:');
        const readyUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=AND({Post URL}!='',{Generated Comment}!='',NOT({Comment Done}))&pageSize=10`;
        const readyResponse = await fetch(readyUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        
        if (readyResponse.ok) {
            const readyData = await readyResponse.json();
            console.log(`✅ Found ${readyData.records?.length || 0} records ready for commenting`);
            if (readyData.records && readyData.records.length > 0) {
                readyData.records.forEach((record, index) => {
                    console.log(`\nRecord ${index + 1}:`);
                    console.log(`  ID: ${record.id}`);
                    console.log(`  Post URL: ${record.fields['Post URL']}`);
                    console.log(`  Generated Comment: ${record.fields['Generated Comment']}`);
                    console.log(`  Comment Done: ${record.fields['Comment Done'] || false}`);
                });
            }
        } else {
            console.log(`❌ Ready records query failed: ${readyResponse.status}`);
        }
        
        // Test 6: Test the exact logic the extension will use
        console.log('\n🧪 Testing extension logic:');
        const extensionUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?view=viwiRzf62qaMKGQoG&filterByFormula=AND({Post URL}!='',{Generated Comment}!='',NOT({Comment Done}))&pageSize=1`;
        const extensionResponse = await fetch(extensionUrl, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        
        if (extensionResponse.ok) {
            const extensionData = await extensionResponse.json();
            console.log(`✅ Extension query successful, found ${extensionData.records?.length || 0} records`);
            if (extensionData.records && extensionData.records.length > 0) {
                const testRecord = extensionData.records[0];
                console.log('\n📋 Test record for extension:');
                console.log(`  ID: ${testRecord.id}`);
                console.log(`  Post URL: ${testRecord.fields['Post URL']}`);
                console.log(`  Generated Comment: ${testRecord.fields['Generated Comment']}`);
                console.log(`  Comment Done: ${testRecord.fields['Comment Done'] || false}`);
                
                // Test if we can update this record
                console.log('\n🧪 Testing record update (this will mark it as done):');
                const updateFields = { 
                    "Comment Done": true, 
                    "Comment By": "Dheeraj",
                    "Comment On": new Date().toISOString() 
                };
                
                const updateResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${testRecord.id}`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: updateFields })
                });
                
                if (updateResponse.ok) {
                    console.log('✅ Record update successful - extension should work!');
                } else {
                    const errorText = await updateResponse.text();
                    console.log(`❌ Record update failed: ${updateResponse.status} - ${errorText}`);
                }
            }
        } else {
            console.log(`❌ Extension query failed: ${extensionResponse.status}`);
        }
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    }
}

// Run the test
testAirtableConnection();
