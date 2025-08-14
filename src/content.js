console.log("Content script loaded");

let commentPosted = false; // guard against duplicates
let postingInFlight = false;

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "postComment" && request.commentText) {
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

    if (document.readyState !== "complete") {
        await new Promise(res => window.addEventListener('load', res, { once: true }));
    }

    // Pre-scroll to look human
    await preScrollJitter(3000 + Math.random() * 2000);

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
                break;
            }
        }
        if (foundEditor) break;
        await sleep(500);
    }

    if (!foundEditor || !editor) {
        console.warn('Comment editor not found, marking as posted to continue');
        if (!commentPosted) {
            commentPosted = true;
            chrome.runtime.sendMessage({ action: 'commentPosted' });
        }
        return;
    }

    // Focus and type with human-like behavior
    try { editor.click(); } catch {}
    await typeHumanLike(editor, commentText);
    await sleep(1200 + Math.random() * 1500);

    // Try multiple button selectors
    const buttonSelectors = [
        '.comments-comment-box__submit-button--cr',
        '.comments-comment-box__submit-button',
        'button[type="submit"]',
        '.artdeco-button--primary'
    ];
    
    let postButton = null;
    for (const selector of buttonSelectors) {
        postButton = document.querySelector(selector);
        if (postButton) break;
    }

    if (postButton && !commentPosted) {
        dispatchHover(postButton);
        await sleep(400 + Math.random() * 800);
        commentPosted = true;
        postButton.click();
        
        // Wait 5 seconds before notifying background to close tab
        await sleep(5000);
        console.log('[content] Sending commentPosted message for', location.href);
        
        // Send message multiple times to ensure delivery
        chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        
        // Fallback: resend after 3s if not acknowledged
        setTimeout(() => {
            console.log('[content] Fallback: resending commentPosted for', location.href);
            chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        }, 3000);
        
        return;
    }

    // If no button found, still notify after delay to allow background to proceed
    if (!commentPosted) {
        commentPosted = true;
        await sleep(5000);
        console.log('[content] Sending commentPosted message for', location.href);
        chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        
        setTimeout(() => {
            console.log('[content] Fallback: resending commentPosted for', location.href);
            chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        }, 3000);
    }
}