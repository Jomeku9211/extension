// Prevent multiple injections
if (window.linkedinCommenterLoaded) {
    console.log("Content script already loaded, skipping");
} else {
    window.linkedinCommenterLoaded = true;
    
    console.log("Content script loaded");

    let commentPosted = false; // guard against duplicates
    let postingInFlight = false;

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "postComment" && request.commentText) {
            console.log('[content] Received postComment message with text:', request.commentText.substring(0, 50) + '...');
            if (postingInFlight || commentPosted) return;
            postingInFlight = true;
            waitForEditorAndTypeComment(request.commentText)
                .finally(() => { postingInFlight = false; });
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
}