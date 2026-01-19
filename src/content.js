// Prevent multiple injections
if (window.linkedinCommenterLoaded) {
    console.log("Content script already loaded, skipping");
} else {
    window.linkedinCommenterLoaded = true;

    console.log("Content script loaded");

    let commentPosted = false; // guard against duplicates
    let postingInFlight = false;
    let messageSent = false; // guard against duplicate messaging
    let messagingInFlight = false;

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "postComment" && request.commentText) {
            console.log('[content] Received postComment message with text:', request.commentText.substring(0, 50) + '...');
            if (postingInFlight || commentPosted) return;
            postingInFlight = true;
            waitForEditorAndTypeComment(request.commentText)
                .finally(() => { postingInFlight = false; });
        }
        else if (request.action === "sendMessage" && request.messageText) {
            console.log('[content] Received sendMessage request with text:', request.messageText.substring(0, 50) + '...');
            if (messagingInFlight || messageSent) return;
            messagingInFlight = true;
            sendMessageToProfile(request.messageText, request.profileUrl)
                .finally(() => { messagingInFlight = false; });
        }
    });

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function dispatchHover(el) {
        try {
            const rect = el.getBoundingClientRect();
            const x = rect.left + Math.random() * rect.width;
            const y = rect.top + Math.random() * rect.height;
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
            el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 2, clientY: y + 2 }));
        } catch {}
    }

    async function preScrollJitter(totalMs = 3000) {
        const start = Date.now();
        while (Date.now() - start < totalMs) {
            const dy = (Math.random() - 0.5) * 300; // up/down
            window.scrollBy({ top: dy, behavior: 'smooth' });
            await sleep(300 + Math.random() * 500);
        }
    }

    async function typeHumanLike(editable, text) {
        editable.focus();
        try { editable.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        dispatchHover(editable);
        await sleep(500 + Math.random() * 1000);
        
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            // Prefer execCommand for contenteditable typing
            try { document.execCommand('insertText', false, ch); } catch {}
            editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
            
            let delay = 40 + Math.random() * 120;
            if (ch === '.' || ch === '!' || ch === '?') delay += 200 + Math.random() * 300;
            if (i && i % 8 === 0) delay += 150 + Math.random() * 400;
            await sleep(delay);
            
            // Occasional scroll during typing
            if (Math.random() < 0.1) {
                window.scrollBy({ top: (Math.random() - 0.5) * 100, behavior: 'smooth' });
            }
        }
    }

    async function waitForEditorAndTypeComment(commentText) {
        if (commentPosted) return;
        console.log('[content] Starting comment posting process for:', location.href);

        // Wait for page to be fully loaded
        if (document.readyState !== "complete") {
            console.log('[content] Page not fully loaded, waiting...');
            await new Promise(res => window.addEventListener('load', res, { once: true }));
        }
        
        // Smart wait based on whether we're in a background or active tab
        const isActiveTab = document.hasFocus() || document.activeElement === document.body;
        if (isActiveTab) {
            console.log('[content] Active tab detected, shorter wait for LinkedIn initialization');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Shorter wait for active tabs
        } else {
            console.log('[content] Background tab detected, longer wait for LinkedIn initialization');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Longer wait for background tabs
        }

        // Pre-scroll to look human and ensure page is interactive
        console.log('[content] Starting pre-scroll to activate page...');
        await preScrollJitter(4000 + Math.random() * 2000); // Increased scroll time

        // Small natural delay before searching editor
        await sleep(1500 + Math.random() * 1500);

        let foundEditor = false;
        const start = Date.now();
        let editor = null;
        
        // Try multiple selectors for LinkedIn comment editor
        const editorSelectors = [
            '.ql-editor',
            '.ql-editor.ql-blank',
            '[contenteditable="true"]',
            '.comments-comment-box__input',
            '.artdeco-text-input__input'
        ];
        
        while (!foundEditor && Date.now() - start < 20000) {
            for (const selector of editorSelectors) {
                editor = document.querySelector(selector);
                if (editor) {
                    foundEditor = true;
                    console.log('[content] Found editor with selector:', selector);
                    break;
                }
            }
            if (foundEditor) break;
            await sleep(500);
        }

        if (!foundEditor || !editor) {
            console.warn('Comment editor not found after 20 seconds in background tab');
            console.log('Page URL:', location.href);
            console.log('Page title:', document.title);
            console.log('Available elements:', {
                qlEditor: document.querySelectorAll('.ql-editor').length,
                contentEditable: document.querySelectorAll('[contenteditable="true"]').length,
                commentBox: document.querySelectorAll('.comments-comment-box__input').length,
                textInput: document.querySelectorAll('.artdeco-text-input__input').length
            });
            
            // Try one more time with a longer wait for background tabs
            console.log('[content] Retrying with longer wait for background tab...');
            await sleep(3000);
            
            // Final attempt to find editor
            for (const selector of editorSelectors) {
                editor = document.querySelector(selector);
                if (editor) {
                    foundEditor = true;
                    console.log('[content] Found editor on retry with selector:', selector);
                    break;
                }
            }
            
            if (!foundEditor || !editor) {
                console.warn('[content] Editor still not found after retry, marking as posted to continue');
                if (!commentPosted) {
                    commentPosted = true;
                    chrome.runtime.sendMessage({ action: 'commentPosted' });
                }
                return;
            }
        }

        // Focus and type with human-like behavior for background tab
        console.log('[content] Attempting to focus editor in background tab...');
        try { 
            editor.click(); 
            editor.focus();
            console.log('[content] Editor clicked and focused');
        } catch (e) {
            console.warn('[content] Failed to click/focus editor:', e);
        }
        
        // Ensure the editor is properly focused with multiple attempts
        let focusAttempts = 0;
        while (document.activeElement !== editor && focusAttempts < 3) {
            try {
                editor.focus();
                await sleep(1000); // Longer wait for background tabs
                focusAttempts++;
                console.log(`[content] Focus attempt ${focusAttempts}, active element:`, document.activeElement);
            } catch (e) {
                console.warn(`[content] Focus attempt ${focusAttempts} failed:`, e);
                focusAttempts++;
            }
        }
        
        if (document.activeElement !== editor) {
            console.warn('[content] Could not focus editor after multiple attempts, proceeding anyway');
        } else {
            console.log('[content] Editor successfully focused');
        }
        
        console.log('[content] Starting to type comment...');
        await typeHumanLike(editor, commentText);
        console.log('[content] Comment typed, waiting before posting...');
        await sleep(1200 + Math.random() * 1500);

        // Try multiple button selectors
        const buttonSelectors = [
            '.comments-comment-box__submit-button--cr',
            '.comments-comment-box__submit-button',
            'button[type="submit"]',
            '.artdeco-button--primary',
            '.comments-comment-box__form button',
            'button[aria-label*="post" i]',
            'button[aria-label*="comment" i]'
        ];
        
        let postButton = null;
        for (const selector of buttonSelectors) {
            postButton = document.querySelector(selector);
            if (postButton) break;
        }

        if (postButton && !commentPosted) {
            console.log('[content] Found post button, clicking to post comment...');
            dispatchHover(postButton);
            await sleep(400 + Math.random() * 800);
            commentPosted = true;
            postButton.click();
            
            // Wait 3 seconds before notifying background
            await sleep(3000);
            console.log('[content] Sending commentPosted message for', location.href);
            
            // Send success result
            chrome.runtime.sendMessage({ action: 'commentResult', success: true, postUrl: location.href });
            
            // Fallback: resend after 2s if not acknowledged
            setTimeout(() => {
                console.log('[content] Fallback: resending success result for', location.href);
                chrome.runtime.sendMessage({ action: 'commentResult', success: true, postUrl: location.href });
            }, 2000);
            
            return;
        }

        // If no button found, try Enter key fallback
        if (!commentPosted) {
            console.warn('[content] No post button found, trying Enter key fallback');
            try {
                const press = (type) => editor.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
                press('keydown');
                press('keypress');
                press('keyup');
                await sleep(1500);
            } catch {}
            // Check if comment posted (heuristic: editor cleared or presence of new comment element nearby)
            const editorCleared = editor && (editor.textContent || '').trim().length === 0;
            if (editorCleared && !commentPosted) {
                commentPosted = true;
                chrome.runtime.sendMessage({ action: 'commentResult', success: true, postUrl: location.href });
                setTimeout(() => chrome.runtime.sendMessage({ action: 'commentResult', success: true, postUrl: location.href }), 2000);
                return;
            }
            console.warn('[content] Enter key fallback did not confirm posting, reporting failure');
            chrome.runtime.sendMessage({ action: 'commentResult', success: false, reason: 'post_button_not_found', postUrl: location.href });
        }
    }

    async function sendMessageToProfile(messageText, profileUrl) {
        if (messageSent) return;
        console.log('[content] Starting message sending process for:', profileUrl || location.href);

        // Wait for page to be fully loaded
        if (document.readyState !== "complete") {
            console.log('[content] Page not fully loaded, waiting...');
            await new Promise(res => window.addEventListener('load', res, { once: true }));
        }

        // Smart wait based on whether we're in a background or active tab
        const isActiveTab = document.hasFocus() || document.activeElement === document.body;
        if (isActiveTab) {
            console.log('[content] Active tab detected, shorter wait for LinkedIn initialization');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Shorter wait for active tabs
        } else {
            console.log('[content] Background tab detected, longer wait for LinkedIn initialization');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Longer wait for background tabs
        }

        // Pre-scroll to look human and ensure page is interactive (similar to commenting)
        console.log('[content] Starting pre-scroll to activate profile page...');
        await preScrollJitter(4000 + Math.random() * 2000); // Increased scroll time like commenting

        // Additional human-like behavior on profile page
        console.log('[content] Simulating profile browsing behavior...');

        // Random scrolling behavior to simulate reading the profile
        for (let i = 0; i < 3 + Math.random() * 3; i++) { // 3-6 scroll actions
            const scrollAmount = (Math.random() - 0.3) * 400; // Mix of up and down scrolling
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            await sleep(1000 + Math.random() * 2000); // 1-3 seconds between scrolls
        }

        // Random pause to simulate reading
        await sleep(2000 + Math.random() * 3000);

        // Small natural delay before searching for message button
        console.log('[content] Preparing to find message button...');
        await sleep(1500 + Math.random() * 1500);

        let foundMessageButton = false;
        const start = Date.now();
        let messageButton = null;

        // Try multiple selectors for LinkedIn message button
        // Priority: User's specific selectors first, then generic fallbacks
        const messageButtonSelectors = [
            // User's specific selectors
            'button.artdeco-button.artdeco-button--2.artdeco-button--primary.ember-view.tIfIpICKCPAOgokEHvmMoUDEBFbknuM',
            'button#ember401',
            'button[aria-label*="Message"]',
            'div.entry-point.LYvVwwlIHDAMuxaUavzTREuqXrntTALUM button',
            // Generic fallbacks
            'button[data-control-name="message"]',
            'button[aria-label*="Message" i]',
            'button[aria-label*="Send message" i]',
            '.pv-s-profile-actions__overflow button[data-control-name="message"]',
            '.pv-top-card-v2-ctas .message-anywhere-button',
            '[data-control-name="message"]',
            'button:contains("Message")'
        ];

        while (!foundMessageButton && Date.now() - start < 15000) {
            for (const selector of messageButtonSelectors) {
                if (selector.includes(':contains')) {
                    // Handle contains selector
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        if (button.textContent.toLowerCase().includes('message')) {
                            messageButton = button;
                            break;
                        }
                    }
                } else {
                    messageButton = document.querySelector(selector);
                }
                if (messageButton) {
                    foundMessageButton = true;
                    console.log('[content] Found message button with selector:', selector);
                    console.log('[content] Message button classes:', messageButton.className);
                    console.log('[content] Message button aria-label:', messageButton.getAttribute('aria-label'));
                    console.log('[content] Message button id:', messageButton.id);
                    break;
                }
            }
            if (foundMessageButton) break;
            await sleep(500);
        }

        if (!foundMessageButton || !messageButton) {
            console.warn('[content] Message button not found after 15 seconds');
            console.log('Page URL:', location.href);
            console.log('Page title:', document.title);

            // Try one more time with longer wait
            console.log('[content] Retrying with longer wait...');
            await sleep(3000);

            for (const selector of messageButtonSelectors) {
                if (selector.includes(':contains')) {
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        if (button.textContent.toLowerCase().includes('message')) {
                            messageButton = button;
                            break;
                        }
                    }
                } else {
                    messageButton = document.querySelector(selector);
                }
                if (messageButton) {
                    foundMessageButton = true;
                    console.log('[content] Found message button on retry');
                    break;
                }
            }

            if (!foundMessageButton || !messageButton) {
                console.warn('[content] Message button still not found, reporting failure');
                chrome.runtime.sendMessage({
                    action: 'messageResult',
                    success: false,
                    reason: 'message_button_not_found',
                    profileUrl: profileUrl || location.href
                });
                return;
            }
        }

        // Click the message button
        console.log('[content] Clicking message button...');
        dispatchHover(messageButton);
        await sleep(400 + Math.random() * 800);
        messageButton.click();

        // Wait for message modal to appear
        console.log('[content] Waiting for message modal...');
        await sleep(2000 + Math.random() * 2000);

        let foundMessageEditor = false;
        let messageEditor = null;
        const editorStart = Date.now();

        // Try multiple selectors for message editor
        // Priority: User's specific selectors first, then generic fallbacks
        const messageEditorSelectors = [
            // User's specific selectors
            '[role="textbox"]',
            'div.flex-grow-1.relative [role="textbox"]',
            'div.flex-grow-1.relative div[contenteditable="true"]',
            '.msg-form__contenteditable.t-14.t-black--light.t-normal.flex-grow-1.full-height.notranslate',
            // Generic fallbacks
            '.msg-form__contenteditable',
            '.msg-form__message-texteditor',
            'textarea[name="message"]',
            '.msg-form__contenteditable[contenteditable="true"]',
            '.artdeco-text-input__input'
        ];

        while (!foundMessageEditor && Date.now() - editorStart < 10000) {
            for (const selector of messageEditorSelectors) {
                messageEditor = document.querySelector(selector);
                if (messageEditor) {
                    foundMessageEditor = true;
                    console.log('[content] Found message editor with selector:', selector);
                    console.log('[content] Message editor classes:', messageEditor.className);
                    console.log('[content] Message editor tag:', messageEditor.tagName);
                    console.log('[content] Message editor role:', messageEditor.getAttribute('role'));
                    console.log('[content] Message editor contenteditable:', messageEditor.getAttribute('contenteditable'));
                    console.log('[content] Message editor name:', messageEditor.getAttribute('name'));
                    break;
                }
            }
            if (foundMessageEditor) break;
            await sleep(500);
        }

        if (!foundMessageEditor || !messageEditor) {
            console.warn('[content] Message editor not found after message button click');
            chrome.runtime.sendMessage({
                action: 'messageResult',
                success: false,
                reason: 'message_editor_not_found',
                profileUrl: profileUrl || location.href
            });
            return;
        }

        // Focus and type message
        console.log('[content] Focusing message editor...');
        try {
            messageEditor.click();
            messageEditor.focus();
            console.log('[content] Message editor focused');
        } catch (e) {
            console.warn('[content] Failed to focus message editor:', e);
        }

        // Ensure the editor is properly focused
        let focusAttempts = 0;
        while (document.activeElement !== messageEditor && focusAttempts < 3) {
            try {
                messageEditor.focus();
                await sleep(1000);
                focusAttempts++;
            } catch (e) {
                focusAttempts++;
            }
        }

        console.log('[content] Starting to type message...');
        if (messageEditor.tagName === 'TEXTAREA') {
            // For textarea elements
            messageEditor.value = messageText;
            messageEditor.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // For contenteditable elements
            await typeHumanLike(messageEditor, messageText);
        }

        console.log('[content] Message typed, waiting before sending...');
        await sleep(1200 + Math.random() * 1500);

        // Find and click send button
        const sendButtonSelectors = [
            'button[type="submit"]:contains("Send")',
            'button[data-control-name="send"]',
            '.msg-form__send-button',
            'button[aria-label*="Send" i]',
            '.artdeco-button--primary'
        ];

        let sendButton = null;
        for (const selector of sendButtonSelectors) {
            if (selector.includes(':contains')) {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    if (button.textContent.toLowerCase().includes('send')) {
                        sendButton = button;
                        break;
                    }
                }
            } else {
                sendButton = document.querySelector(selector);
            }
            if (sendButton) break;
        }

        if (sendButton && !messageSent) {
            console.log('[content] Found send button, clicking to send message...');
            dispatchHover(sendButton);
            await sleep(400 + Math.random() * 800);
            messageSent = true;
            sendButton.click();

            // Wait before notifying background
            await sleep(3000);
            console.log('[content] Sending messageResult success for', profileUrl || location.href);

            chrome.runtime.sendMessage({
                action: 'messageResult',
                success: true,
                profileUrl: profileUrl || location.href
            });

            // Fallback: resend after 2s
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    action: 'messageResult',
                    success: true,
                    profileUrl: profileUrl || location.href
                });
            }, 2000);

            return;
        }

        // If no send button found, try Enter key
        if (!messageSent) {
            console.warn('[content] No send button found, trying Enter key fallback');
            try {
                const press = (type) => messageEditor.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
                press('keydown');
                press('keypress');
                press('keyup');
                await sleep(1500);
            } catch {}

            // Check if message was sent (heuristic)
            const editorCleared = messageEditor && (
                (messageEditor.tagName === 'TEXTAREA' && messageEditor.value === '') ||
                (messageEditor.textContent || '').trim().length === 0
            );

            if (editorCleared && !messageSent) {
                messageSent = true;
                chrome.runtime.sendMessage({
                    action: 'messageResult',
                    success: true,
                    profileUrl: profileUrl || location.href
                });
                setTimeout(() => chrome.runtime.sendMessage({
                    action: 'messageResult',
                    success: true,
                    profileUrl: profileUrl || location.href
                }), 2000);
                return;
            }

            console.warn('[content] Enter key fallback did not confirm sending, reporting failure');
            chrome.runtime.sendMessage({
                action: 'messageResult',
                success: false,
                reason: 'send_button_not_found',
                profileUrl: profileUrl || location.href
            });
        }
    }
}