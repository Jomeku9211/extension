# LinkedIn Airtable Commenter

This Chrome extension automates the process of commenting on LinkedIn posts using data fetched from Airtable. It allows users to efficiently manage their commenting tasks without manual intervention once started.

## Features

- Fetches LinkedIn post URLs and comment texts from Airtable.
- Automatically comments on LinkedIn posts.
- Marks records in Airtable as "Comment Done" after successful posting.
- Configurable to run only when the user clicks the "Start" button.

## Project Structure

```
linkedin-airtable-commenter
├── src
│   ├── background.js        # Main logic for background processing
│   ├── content.js           # DOM manipulation for LinkedIn posts
│   ├── helpers
│   │   ├── airtable.js      # Airtable helper functions
│   │   └── linkedin.js      # LinkedIn helper functions
│   ├── popup.html           # HTML for the extension's popup
│   └── popup.js             # Popup functionality control
├── manifest.json            # Chrome extension configuration
└── README.md                # Project documentation
```

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd linkedin-airtable-commenter
   ```

2. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable "Developer mode" in the top right corner.
   - Click on "Load unpacked" and select the `linkedin-airtable-commenter` directory.

3. **Airtable setup is preconfigured:**
   - API key, Base, Table, and View IDs are hardcoded per your setup.

## Usage

1. Click on the extension icon in the Chrome toolbar.
2. Press the "Start" button to begin the commenting process.
3. The extension will automatically fetch records from Airtable and comment on the specified LinkedIn posts.

## Notes

- Ensure you're logged in to LinkedIn in the same Chrome profile where the extension is installed.
- Records are filtered using `NOT({Comment Done})`; adjust your Airtable fields accordingly.
- A random delay of 7 to 10 minutes is introduced between comments.

## Contributing

Feel free to submit issues or pull requests for any improvements or bug fixes.