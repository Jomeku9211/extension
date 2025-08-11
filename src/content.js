console.log("Content script loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "postComment" && request.commentText) {
        waitForEditorAndTypeComment(request.commentText);
    }
});

var commentPosted = false;  // Add this at the top of your file

function waitForEditorAndTypeComment(commentText) {
    if (commentPosted) return; // Prevent double posting

    // Wait for DOM to load, then wait 10 seconds before proceeding
    if (document.readyState !== "complete") {
        window.addEventListener("load", () => {
            setTimeout(() => waitForEditorAndTypeComment(commentText), 10000); // 10s delay after DOM load
        }, { once: true });
        return;
    }

    // If DOM is already loaded, wait 10 seconds before proceeding
    setTimeout(() => {
        let foundEditor = false;
        const interval = setInterval(() => {
            const qlEditor = document.querySelector('.ql-editor.ql-blank');
            if (qlEditor) {
                foundEditor = true;
                clearInterval(interval);

                // Scroll down to the comment box and wait 1-2 seconds before typing
                qlEditor.scrollIntoView({ behavior: "smooth", block: "center" });
                const humanDelay = 1000 + Math.random() * 1000; // 1-2 seconds

                setTimeout(() => {
                    // Focus the editor
                    qlEditor.click();

                    // Find the <p> inside the editor
                    const p = qlEditor.querySelector('p');
                    if (p) {
                        // Set the comment text
                        p.innerHTML = commentText;

                        // Dispatch input event so LinkedIn detects the change
                        const event = new Event('input', { bubbles: true });
                        qlEditor.dispatchEvent(event);

                        // Wait 5 seconds before trying to find and click the Post button
                        setTimeout(() => {
                            const postButton = document.querySelector('.comments-comment-box__submit-button--cr');
                            if (postButton && !commentPosted) {
                                commentPosted = true; // Prevent double post
                                postButton.click();
                                console.log('Comment posted:', commentText);

                                // Wait 10 seconds before notifying background.js
                                setTimeout(() => {
                                    chrome.runtime.sendMessage({ action: "commentPosted" });
                                }, 10000); // 10s after clicking post
                            }
                        }, 5000); // 5s after writing comment
                    }
                }, humanDelay);
            }
        }, 300);

        // If editor is not found after 10 seconds, mark as done/skipped in Airtable
        setTimeout(() => {
            if (!foundEditor && !commentPosted) {
                clearInterval(interval);
                commentPosted = true; // Prevent further attempts
                chrome.runtime.sendMessage({ action: "commentPosted" }); // Or "commentSkipped"
            }
        }, 10000);
    }, 10000); // 10s after DOM ready
}