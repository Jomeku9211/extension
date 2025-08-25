# LinkedIn Airtable Commenter - Acceptance Criteria & Flow Guide

## Project Overview
**Extension Name:** CoderFarm Commenter  
**Purpose:** Automatically comment on LinkedIn posts using data from Airtable  
**Current Version:** 1.1  

## 🎯 Acceptance Criteria Template

### 1. User Authentication & Setup
- [ ] **Airtable Configuration**
  - [ ] API key is properly configured
  - [ ] Base ID is correct
  - [ ] Table ID is specified
  - [ ] View ID is set
  - [ ] Field mappings are correct (URL, Comment Text, Status fields)

- [ ] **LinkedIn Authentication**
  - [ ] User is logged into LinkedIn
  - [ ] Extension has proper permissions
  - [ ] Content script loads on LinkedIn feed pages

### 2. Extension Interface
- [ ] **Popup UI Elements**
  - [ ] Status badge shows "Inactive" by default
  - [ ] Timer displays "Next: --:--" when stopped
  - [ ] Statistics grid shows all required metrics
  - [ ] Start button is visible and functional
  - [ ] Stop button is hidden initially

- [ ] **Statistics Display**
  - [ ] Processed count starts at 0
  - [ ] Successes count starts at 0
  - [ ] Failures count starts at 0
  - [ ] Today's count starts at 0
  - [ ] Started at timestamp shows "--" initially

### 3. Core Functionality Flow

#### 3.1 Start Process
- [ ] **Button State Changes**
  - [ ] Start button becomes hidden
  - [ ] Stop button becomes visible
  - [ ] Status badge changes to "Active"

- [ ] **Initialization**
  - [ ] Extension fetches records from Airtable
  - [ ] Filters records using `NOT({Comment Done})`
  - [ ] Records are queued for processing

#### 3.2 Commenting Process
- [ ] **Record Processing**
  - [ ] Each record contains LinkedIn post URL
  - [ ] Each record contains comment text
  - [ ] Extension navigates to LinkedIn post
  - [ ] Comment is posted successfully
  - [ ] Airtable record is marked as "Comment Done"

- [ ] **Timing & Delays**
  - [ ] Random delay between 7-10 minutes between comments
  - [ ] Timer shows countdown to next comment
  - [ ] Process continues until all records are processed

#### 3.3 Error Handling
- [ ] **Failed Comments**
  - [ ] Failed attempts are logged
  - [ ] Failure count increments
  - [ ] Process continues with next record
  - [ ] Error details are captured

- [ ] **Network Issues**
  - [ ] Airtable API failures are handled gracefully
  - [ ] LinkedIn page loading failures are handled
  - [ ] Extension retries failed operations

### 4. Data Management

#### 4.1 Airtable Integration
- [ ] **Data Fetching**
  - [ ] API calls use correct authentication
  - [ ] Rate limiting is respected
  - [ ] Data is parsed correctly
  - [ ] Empty or invalid records are filtered

- [ ] **Data Updates**
  - [ ] Successful comments mark records as done
  - [ ] Status updates are atomic
  - [ ] Failed updates are retried

#### 4.2 LinkedIn Integration
- [ ] **Page Navigation**
  - [ ] Extension opens LinkedIn posts in new tabs
  - [ ] Content script injects properly
  - [ ] Comment form is located and filled
  - [ ] Submit button is clicked

- [ ] **Comment Validation**
  - [ ] Comment text is properly escaped
  - [ ] Character limits are respected
  - [ ] Post is actually commented on

### 5. User Experience

#### 5.1 Real-time Updates
- [ ] **Statistics Updates**
  - [ ] Processed count increments in real-time
  - [ ] Success/failure counts update immediately
  - [ ] Today's count resets daily
  - [ ] Started at timestamp shows actual start time

- [ ] **Status Feedback**
  - [ ] Current operation is visible
  - [ ] Progress indicators are shown
  - [ ] Error messages are user-friendly

#### 5.2 Control & Safety
- [ ] **Stop Functionality**
  - [ ] Stop button immediately halts process
  - [ ] Current operation completes safely
  - [ ] Status returns to "Inactive"
  - [ ] Statistics are preserved

- [ ] **Session Management**
  - [ ] Extension remembers state across browser restarts
  - [ ] Statistics persist between sessions
  - [ ] Settings are saved locally

### 6. Performance & Reliability

#### 6.1 Resource Usage
- [ ] **Memory Management**
  - [ ] Extension doesn't cause memory leaks
  - [ ] Background processes are efficient
  - [ ] Tabs are closed after processing

- [ ] **CPU Usage**
  - [ ] Extension doesn't consume excessive CPU
  - [ ] Delays prevent overwhelming LinkedIn
  - [ ] Background tasks are optimized

#### 6.2 Stability
- [ ] **Long-running Sessions**
  - [ ] Extension runs for hours without issues
  - [ ] No crashes or freezes
  - [ ] Automatic recovery from errors

- [ ] **Browser Compatibility**
  - [ ] Works with current Chrome version
  - [ ] Compatible with Chromium-based browsers
  - [ ] Manifest V3 compliance

### 7. Security & Privacy

#### 7.1 Data Protection
- [ ] **API Keys**
  - [ ] Airtable API key is secure
  - [ ] No keys are logged or exposed
  - [ ] Permissions are minimal required

- [ ] **User Data**
  - [ ] LinkedIn credentials are not accessed
  - [ ] Personal data is not collected
  - [ ] Extension only reads specified Airtable data

### 8. Testing Scenarios

#### 8.1 Happy Path
1. User clicks extension icon
2. User clicks "Start" button
3. Extension fetches 5 records from Airtable
4. Extension comments on 5 LinkedIn posts
5. All records are marked as "Comment Done"
6. Statistics show 5 processed, 5 successes, 0 failures

#### 8.2 Error Scenarios
1. **Airtable API failure**
   - Extension shows error message
   - Process stops gracefully
   - User can retry

2. **LinkedIn page not found**
   - Record is marked as failed
   - Process continues with next record
   - Failure count increments

3. **Comment posting failure**
   - Error is logged
   - Record is not marked as done
   - Process continues

#### 8.3 Edge Cases
1. **Empty Airtable table**
   - Extension shows "No records to process"
   - Process stops automatically

2. **All records already commented**
   - Extension shows "All records processed"
   - Process stops automatically

3. **Browser crash during process**
   - Extension resumes from last known state
   - Statistics are preserved

## 📝 Instructions for AI Assistant

**Use this document to:**
1. **Understand the complete flow** - Every step from start to finish
2. **Validate implementation** - Check each acceptance criteria
3. **Test functionality** - Run through all scenarios
4. **Debug issues** - Use criteria to identify problems
5. **Plan improvements** - Identify gaps or enhancements

**When providing feedback:**
- Reference specific acceptance criteria by number
- Describe expected vs actual behavior
- Include screenshots or error messages
- Specify browser version and environment

**For new features:**
- Add new acceptance criteria sections
- Update existing criteria as needed
- Maintain version control of this document

---

**Document Version:** 1.0  
**Last Updated:** [Current Date]  
**Maintained By:** [Your Name/Team]  
**Next Review:** [Date]
