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