// Singleton guard to avoid duplicate script behavior
if (window.__CF_CS_LOADED) {
    console.log("Content script already loaded - skipping init");
} else {
window.__CF_CS_LOADED = true;
console.log("Content script loaded");

let postingInFlight = false;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "postComment" && request.commentText) {
        if (postingInFlight || commentPosted) return; // ignore duplicate triggers
        postingInFlight = true;
        waitForEditorAndTypeComment(request.commentText, request.postUrl || null).finally(() => {
            // allow next after we have either posted or timed out (commentPosted prevents duplicates anyway)
            postingInFlight = false;
        });
    }
});

let commentPosted = false;  // guard against double posting

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function typeHumanLike(editable, text) {
    editable.focus();
    // Small random pre-type hover and scroll
    try {
        editable.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
    dispatchHover(editable);
    await sleep(300 + Math.random() * 800);

    // Prefer execCommand for contenteditable typing
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        document.execCommand('insertText', false, ch);
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
        // Random keystroke delay 30-120ms, with occasional pauses
        let delay = 30 + Math.random() * 90;
        if (ch === '.' || ch === '!' || ch === '?') delay += 150 + Math.random() * 300;
        if (i % 10 === 0 && i !== 0) delay += 150 + Math.random() * 300; // pause every ~10 chars
        await sleep(delay);
        if (Math.random() < 0.06) {
            // tiny scroll jitter sometimes
            window.scrollBy({ top: (Math.random() - 0.5) * 60, behavior: 'smooth' });
        }
    }
}

function dispatchHover(el) {
    try {
        const rect = el.getBoundingClientRect();
        const x = rect.left + Math.random() * rect.width;
        const y = rect.top + Math.random() * rect.height;
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 2, clientY: y + 2 }));
    } catch {}
}

async function waitForEditorAndTypeComment(commentText, postUrl) {
    if (commentPosted) return;

    // Ensure DOM is ready, then wait with jitter
    if (document.readyState !== "complete") {
        await new Promise(res => window.addEventListener('load', res, { once: true }));
    }
    await sleep(6000 + Math.random() * 6000); // 6-12s jittered delay

    let foundEditor = false;
    const started = Date.now();
    while (!foundEditor && Date.now() - started < 15000) {
        const qlEditor = document.querySelector('.ql-editor');
        if (qlEditor) {
            foundEditor = true;
            // Bring into view and pause
            try { qlEditor.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
            await sleep(800 + Math.random() * 800);
            qlEditor.click();
            // Human-like typing
            await typeHumanLike(qlEditor, commentText);
            // Short pause before finding button
            await sleep(1200 + Math.random() * 1200);
            const postButton = document.querySelector('.comments-comment-box__submit-button--cr');
            if (postButton && !commentPosted) {
                dispatchHover(postButton);
                await sleep(300 + Math.random() * 900);
                commentPosted = true;
                postButton.click();
                console.log('Comment posted with human-like behavior');
                // Try to find a comment id after posting
                await sleep(2000 + Math.random() * 4000);
                const commentId = findNewestCommentIdNearEditor(qlEditor) || null;
                await sleep(3000 + Math.random() * 4000);
                chrome.runtime.sendMessage({ action: 'commentPosted', postUrl, commentId });
            }
            break;
        }
        await sleep(300);
    }

    if (!foundEditor && !commentPosted) {
        commentPosted = true; // give up this attempt to avoid looping
        chrome.runtime.sendMessage({ action: 'commentPosted', postUrl: postUrl || null, commentId: null });
    }
}

function findNewestCommentIdNearEditor(qlEditor) {
    try {
        // Heuristic: find recent comment items near the editor
        const containers = document.querySelectorAll('[data-urn^="urn:li:comment"], [data-id^="urn:li:comment"], li.comments-comment-item');
        if (!containers || containers.length === 0) return null;
        const el = containers[0];
        const urn = el.getAttribute('data-urn') || el.getAttribute('data-id');
        if (urn) return urn;
        // fallback: look for anchors that link to a comment
        const a = el.querySelector('a[href*="comment"]');
        return a ? a.getAttribute('href') : null;
    } catch {
        return null;
    }
}
}