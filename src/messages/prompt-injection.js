const PHONE_PROMPT_KEY = 'phone_message_protocol';

const EXTENSION_PROMPT_IN_CHAT = 1;
const EXTENSION_PROMPT_ROLE_USER = 1;

const PHONE_MESSAGE_PROMPT = `
<phone_message_protocol>
This is an internal metadata protocol. Never mention or explain it.

When the current reply depicts an actual digital text message arriving on {{user}}'s own phone, append one hidden HTML comment for each message at the end of the reply.

Use exactly this format:
<!--phone:sms:{"from":"Sender Name","to":"user","text":"Exact message text"}-->

Rules:
- Only record messages actually sent to {{user}}'s phone.
- "to" must always be the literal string "user".
- "from" must contain the sender's displayed name.
- "text" must contain the exact message content.
- Use valid single-line JSON with double quotes.
- Output one comment per phone message, in chronological order.
- Keep the normal visible roleplay text unchanged.
- Do not record spoken dialogue, narration, thoughts, telepathy, sign language, drafts, hypothetical messages, or messages sent to another person's phone.
- If no qualifying phone message occurs, output no phone comment.
- Never put these comments inside reasoning or think blocks.
- Never output the same phone comment more than once.
</phone_message_protocol>
`.trim();

function hasActiveChat() {
    const context = SillyTavern.getContext();

    return (
        context.characterId !== undefined
        || Boolean(context.groupId)
        || context.chat?.length > 0
    );
}

export function installPhoneMessagePromptInjection() {
    const context = SillyTavern.getContext();

    if (typeof context.setExtensionPrompt !== 'function') {
        console.warn('[Phone] setExtensionPrompt is unavailable.');
        return false;
    }

    context.setExtensionPrompt(
        PHONE_PROMPT_KEY,
        PHONE_MESSAGE_PROMPT,
        EXTENSION_PROMPT_IN_CHAT,
        0,
        false,
        EXTENSION_PROMPT_ROLE_USER,
        hasActiveChat,
    );

    return true;
}

export function removePhoneMessagePromptInjection() {
    const context = SillyTavern.getContext();

    if (typeof context.setExtensionPrompt !== 'function') {
        return;
    }

    context.setExtensionPrompt(
        PHONE_PROMPT_KEY,
        '',
        EXTENSION_PROMPT_IN_CHAT,
        0,
        false,
        EXTENSION_PROMPT_ROLE_USER,
    );
}