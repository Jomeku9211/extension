export function postCommentOnLinkedIn(editorSelector, commentText, submitSelector) {
    const editor = document.querySelector(editorSelector);
    if (!editor) {
        console.error('Comment editor not found.');
        return false;
    }
    editor.innerHTML = commentText;
    const event = new Event('input', { bubbles: true });
    editor.dispatchEvent(event);
    const postButton = submitSelector ? document.querySelector(submitSelector) : document.querySelector('.comments-comment-box__submit-button--cr');
    if (postButton) {
        postButton.click();
        return true;
    }
    console.error('Post button not found.');
    return false;
}

export function sendMessageOnLinkedIn(profileUrl, messageText) {
    // First, we need to navigate to the profile
    if (window.location.href !== profileUrl) {
        window.location.href = profileUrl;
        return 'navigating';
    }

    // Add some human-like scrolling behavior
    window.scrollTo({
        top: window.scrollY + Math.random() * 200 + 100,
        behavior: 'smooth'
    });

    // Wait a bit for page to load, then look for message button
    setTimeout(() => {
        // Try to find and click the message button
        const messageButtons = document.querySelectorAll('button[data-control-name="message"], button[aria-label*="Message"], button:contains("Message")');
        let messageButton = null;

        // Look for message button in various ways
        for (const button of messageButtons) {
            if (button.textContent.toLowerCase().includes('message') ||
                button.getAttribute('aria-label')?.toLowerCase().includes('message') ||
                button.getAttribute('data-control-name') === 'message') {
                messageButton = button;
                break;
            }
        }

        // Alternative selectors for message button
        if (!messageButton) {
            messageButton = document.querySelector('.pv-s-profile-actions__overflow button[data-control-name="message"]') ||
                           document.querySelector('.pv-top-card-v2-ctas .message-anywhere-button') ||
                           document.querySelector('[data-control-name="message"]');
        }

        if (messageButton) {
            messageButton.click();

            // Wait for message modal to open, then type message
            setTimeout(() => {
                const messageEditor = document.querySelector('.msg-form__contenteditable, .msg-form__message-texteditor, textarea[name="message"]');
                if (messageEditor) {
                    // Clear any existing content
                    if (messageEditor.tagName === 'TEXTAREA') {
                        messageEditor.value = messageText;
                        messageEditor.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        messageEditor.innerHTML = messageText;
                        messageEditor.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Wait a bit then click send
                    setTimeout(() => {
                        const sendButton = document.querySelector('button[type="submit"]:contains("Send"), button[data-control-name="send"], .msg-form__send-button');
                        if (sendButton) {
                            sendButton.click();
                            return true;
                        }
                    }, 1000 + Math.random() * 2000);
                }
            }, 2000 + Math.random() * 3000);
        } else {
            console.error('Message button not found on profile page');
            return false;
        }
    }, 3000 + Math.random() * 2000);

    return 'processing';
}