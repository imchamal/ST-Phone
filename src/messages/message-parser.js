const HTML_COMMENT_PATTERN = /<!--([\s\S]*?)-->/g;
const PHONE_SMS_PREFIX = 'phone:sms:';

function stripReasoningBlocks(source) {
    return String(source ?? '')
        .replace(
            /<(think|thinking|reasoning|analysis|reflection)\b[^>]*>[\s\S]*?<\/\1>/gi,
            '',
        )
        .replace(
            /<(think|thinking|reasoning|analysis|reflection)\b[^>]*>[\s\S]*$/gi,
            '',
        );
}

function parsePhonePayload(rawPayload) {
    try {
        const parsed = JSON.parse(rawPayload);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

export function parsePhoneMessages(source) {
    const content = stripReasoningBlocks(source);
    const results = [];

    HTML_COMMENT_PATTERN.lastIndex = 0;

    for (const match of content.matchAll(HTML_COMMENT_PATTERN)) {
        const comment = match[1].trim();

        if (!comment.toLowerCase().startsWith(PHONE_SMS_PREFIX)) {
            continue;
        }

        const rawPayload = comment.slice(PHONE_SMS_PREFIX.length).trim();
        const payload = parsePhonePayload(rawPayload);

        if (!payload) {
            continue;
        }

        const sender = String(payload.from ?? '').trim();
        const text = String(payload.text ?? '').trim();
        const recipient = String(payload.to ?? 'user').trim().toLowerCase();

        if (!sender || !text) {
            continue;
        }

        if (recipient !== 'user' && recipient !== '{{user}}') {
            continue;
        }

        results.push({
            sender,
            text,
        });
    }

    return results;
}