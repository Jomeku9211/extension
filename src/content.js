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

async function preScrollJitter(totalMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < totalMs) {
        const dy = (Math.random() - 0.5) * 400; // up/down
        window.scrollBy({ top: dy, behavior: 'smooth' });
        await sleep(250 + Math.random() * 400);
    }
}

async function typeHumanLike(editable, text) {
    editable.focus();
    try { editable.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    dispatchHover(editable);
    await sleep(400 + Math.random() * 800);
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        // Prefer execCommand for contenteditable typing
        try { document.execCommand('insertText', false, ch); } catch {}
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
        let delay = 35 + Math.random() * 110;
        if (ch === '.' || ch === '!' || ch === '?') delay += 150 + Math.random() * 250;
        if (i && i % 10 === 0) delay += 120 + Math.random() * 300;
        await sleep(delay);
        if (Math.random() < 0.08) {
            window.scrollBy({ top: (Math.random() - 0.5) * 80, behavior: 'smooth' });
        }
    }
}

async function waitForEditorAndTypeComment(commentText) {
    if (commentPosted) return;

    if (document.readyState !== "complete") {
        await new Promise(res => window.addEventListener('load', res, { once: true }));
    }

    // Pre-scroll to look human
    await preScrollJitter(2500 + Math.random() * 1500);

    // Small natural delay before searching editor
    await sleep(1200 + Math.random() * 1200);

    let foundEditor = false;
    const start = Date.now();
    let editor = null;
    while (!foundEditor && Date.now() - start < 15000) {
        editor = document.querySelector('.ql-editor') || document.querySelector('.ql-editor.ql-blank');
        if (editor) {
            foundEditor = true;
            break;
        }
        await sleep(300);
    }

    if (!foundEditor || !editor) {
        if (!commentPosted) {
            commentPosted = true;
            chrome.runtime.sendMessage({ action: 'commentPosted' });
        }
        return;
    }

    // Focus and type with human-like behavior
    try { editor.click(); } catch {}
    await typeHumanLike(editor, commentText);
    await sleep(1000 + Math.random() * 1200);

    const postButton = document.querySelector('.comments-comment-box__submit-button--cr');

    if (postButton && !commentPosted) {
        dispatchHover(postButton);
        await sleep(300 + Math.random() * 700);
        commentPosted = true;
        postButton.click();
        // Dwell 5s before notifying background to close tab
        await sleep(5000);
        console.log('[content] Sending commentPosted message for', location.href);
        chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href }, (resp) => {
            if (chrome.runtime.lastError) {
                console.warn('[content] Message send error:', chrome.runtime.lastError.message);
            } else {
                console.log('[content] Message sent, response:', resp);
            }
        });
        // Fallback: resend after 10s if not acknowledged
        setTimeout(() => {
            console.log('[content] Fallback: resending commentPosted for', location.href);
            chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        }, 10000);
        return;
    }

    // If no button found, still notify after delay to allow background to proceed
    if (!commentPosted) {
        commentPosted = true;
        await sleep(5000);
        console.log('[content] Sending commentPosted message for', location.href);
        chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href }, (resp) => {
            if (chrome.runtime.lastError) {
                console.warn('[content] Message send error:', chrome.runtime.lastError.message);
            } else {
                console.log('[content] Message sent, response:', resp);
            }
        });
        setTimeout(() => {
            console.log('[content] Fallback: resending commentPosted for', location.href);
            chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: location.href });
        }, 10000);
    }
}