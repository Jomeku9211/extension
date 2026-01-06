# LinkedIn Comment Automation Extension

This Chrome extension automatically comments on LinkedIn posts using data from Airtable. It fetches pending comment records, opens LinkedIn tabs, posts comments in a human-like manner, and updates Airtable with completion status.

## Features

- **Automated Commenting**: Opens LinkedIn posts and places comments automatically
- **Human-like Behavior**: Includes realistic scrolling, typing delays, and natural movements
- **Airtable Integration**: Fetches records from Airtable and updates completion status
- **Duplicate Prevention**: Avoids commenting on the same post multiple times
- **Queue Management**: Processes records with configurable delays (7-10 minutes)
- **Progress Tracking**: Shows processed, successful, and failed comment counts

## Setup

1. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this folder

2. **Configure Airtable**:
   - The extension uses a fixed Airtable configuration
   - Base ID: `appD9VxZrOhiQY9VB`
   - Table ID: `tblyhMPmCt87ORo3t`
   - Main View: `viwiRzf62qaMKGQoG` (for pending comments)
   - Today's View: `viwhyoCkHret6DqWe` (for comment form)

3. **Required Airtable Fields**:
   - `Post URL`: LinkedIn post URL to comment on
   - `Generated Comment`: The comment text to post
   - `Comment Done`: Boolean field to mark completion
   - `Comment By`: Text field for commenter name
   - `Comment On`: Date field for comment timestamp

## Usage

1. **Start Automation**:
   - Click the extension icon
   - Click "Start" to begin processing
   - The extension will fetch today's comment count and reset counters

2. **Monitor Progress**:
   - View real-time statistics (processed, successes, failures)
   - See countdown timer for next comment
   - Track today's comment count

3. **Stop Automation**:
   - Click "Stop" to halt processing
   - All counters will reset to 0

## How It Works

1. **Record Fetching**: Gets next pending record from Airtable
2. **Tab Opening**: Opens LinkedIn post in new tab
3. **Human Simulation**: Scrolls, waits, and types naturally
4. **Comment Posting**: Submits comment and waits 5 seconds
5. **Airtable Update**: Marks record as done with metadata
6. **Tab Closing**: Closes tab after 5-second dwell time
7. **Next Record**: Waits 7-10 minutes before processing next record

## Troubleshooting

### Common Issues

1. **Airtable Not Updating**:
   - Check browser console for error messages
   - Verify field names match exactly (case-sensitive)
   - Run `tests/airtable_test.js` to test connection

2. **Tabs Not Closing**:
   - Check if LinkedIn page is fully loaded
   - Verify content script injection
   - Check console for tab close errors

3. **Duplicate Comments**:
   - Ensure duplicate view is properly configured
   - Check if records are being marked as done
   - Verify URL normalization is working

### Debug Mode

- Open Chrome DevTools
- Go to Console tab
- Look for messages starting with `[background]`, `[content]`, `[finalize]`
- Check for any error messages or warnings

### Testing Airtable Connection

Run the test script to verify connectivity:

```bash
node tests/airtable_test.js
```

This will test:
- API key validity
- Base and table access
- Field update permissions

## File Structure

```
linkedin-extension/
├── manifest.json          # Extension configuration
├── src/
│   ├── background.js      # Service worker (main logic)
│   ├── content.js         # LinkedIn page automation
│   ├── popup.html         # Extension popup UI
│   └── popup.js           # Popup functionality
├── tests/
│   └── airtable_test.js   # Airtable connection test
└── README.md              # This file
```

## Permissions

- `tabs`: To open and manage LinkedIn tabs
- `scripting`: To inject content scripts
- `storage`: To persist extension state
- `alarms`: To schedule comment processing
- `https://www.linkedin.com/*`: To access LinkedIn
- `https://api.airtable.com/*`: To access Airtable API

## Safety Features

- **Rate Limiting**: 7-10 minute delays between comments
- **Human Simulation**: Realistic delays and movements
- **Error Handling**: Graceful fallbacks for failures
- **Duplicate Prevention**: Avoids commenting on same post
- **Tab Management**: Automatic cleanup of opened tabs

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify Airtable configuration and field names
3. Test Airtable connection using the test script
4. Ensure LinkedIn page structure hasn't changed