import {
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    setExtensionPrompt,
} from '../../../../../../script.js';

const PHONE_PROMPT_KEY = 'phone_message_protocol';

const PHONE_MESSAGE_PROMPT = `
<phone_message_protocol>
This is an internal metadata protocol. Never mention or explain it.

When the current reply depicts an actual digital text message arriving on {{user}}'s own phone, append one hidden HTML comment for each message at the end of the reply.

Use exactly this format:
<!--phone:sms:{"from":"Sender Name","to":"user","text":"Exact message text"}-->

For a message sent inside a named multi-participant group chat, add "thread":
<!--phone:sms:{"from":"Sender Name","to":"user","thread":"Group Chat Name","text":"Exact message text"}-->

Rules:
- Only record messages actually sent to {{user}}'s phone.
- "to" must always be the literal string "user".
- "from" must contain the sender's displayed name.
- "text" must contain the exact message content.
- Omit "thread" for direct one-to-one messages.
- Include "thread" only when the message belongs to a shared multi-participant group chat.
- Every message in the same group chat must use the exact same "thread" value, even when the sender changes.
- Use valid single-line JSON with double quotes.
- Output one comment per phone message, in chronological order.
- Keep the normal visible roleplay text unchanged.
- Do not record spoken dialogue, narration, thoughts, telepathy, sign language, drafts, hypothetical messages, or messages sent to another person's phone.
- If no qualifying phone message occurs, output no phone comment.
- Never put these comments inside reasoning or think blocks.
- Never output the same phone comment more than once.
</phone_message_protocol>
`.trim();

let enabled = false;
let listenersRegistered = false;
let refreshTimer = null;

function applyPhoneMessagePromptInjection() {
    if (!enabled) {
        return;
    }

    setExtensionPrompt(
        PHONE_PROMPT_KEY,
        PHONE_MESSAGE_PROMPT,
        extension_prompt_types.IN_CHAT,
        0,
        false,
        extension_prompt_roles.USER,
    );
}

function schedulePhoneMessagePromptInjection() {
    window.clearTimeout(refreshTimer);

    refreshTimer = window.setTimeout(() => {
        applyPhoneMessagePromptInjection();
    }, 150);
}

export function installPhoneMessagePromptInjection() {
    enabled = true;

    if (!listenersRegistered) {
        /*
         * SillyTavern은 채팅을 불러올 때 extension_prompts를
         * 새 객체로 초기화하므로 이후 다시 등록해야 해요.
         */
        eventSource.on(
            event_types.CHAT_CHANGED,
            schedulePhoneMessagePromptInjection,
        );

        /*
         * 생성 직전에도 다시 등록해서 초기 채팅 로딩 순서나
         * 다른 확장의 초기화에 의해 삭제된 경우를 복구해요.
         */
        eventSource.on(
            event_types.MESSAGE_SENT,
            applyPhoneMessagePromptInjection,
        );

        eventSource.on(
            event_types.APP_READY,
            schedulePhoneMessagePromptInjection,
        );

        listenersRegistered = true;
    }

    applyPhoneMessagePromptInjection();
    return true;
}

export function removePhoneMessagePromptInjection() {
    enabled = false;
    window.clearTimeout(refreshTimer);

    setExtensionPrompt(
        PHONE_PROMPT_KEY,
        '',
        extension_prompt_types.IN_CHAT,
        0,
        false,
        extension_prompt_roles.USER,
    );
}