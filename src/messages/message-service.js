import {
    parsePhoneMessages,
    parseUserPhoneReplies,
} from './message-parser.js';

const MESSAGE_EXTRA_KEY = 'phoneMessages';
const CHAT_METADATA_KEY = 'phoneMessages';
const SCHEMA_VERSION = 3;

const EMPTY_SNAPSHOT = Object.freeze({
    chatId: null,
    conversations: [],
    contacts: [],
    totalUnread: 0,
});

function getContext() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function createId(context) {
    if (typeof context?.uuidv4 === 'function') {
        return context.uuidv4();
    }

    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return `phone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeContactId(name) {
    return String(name || 'Unknown')
        .trim()
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ');
}

function getTimestamp(context, value) {
    const momentValue = context?.timestampToMoment?.(value)?.valueOf?.();

    if (Number.isFinite(momentValue)) {
        return momentValue;
    }

    const parsed = value instanceof Date
        ? value.getTime()
        : Date.parse(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function getCharacterAvatar(context, character) {
    const avatar = character?.avatar;

    if (!avatar || avatar === 'none') {
        return null;
    }

    return context?.getThumbnailUrl?.('avatar', avatar) ?? avatar;
}

function resolveContact(context, message, senderToken) {
    const useCurrentSender = !senderToken
        || /^(?:char|character)$/i.test(senderToken);

    const senderName = useCurrentSender
        ? (message.name || context?.name2 || 'Unknown')
        : senderToken;

    const matchingCharacter = context?.characters?.find?.(
        (character) => character?.name === senderName,
    );

    let avatar = null;

    if (useCurrentSender && message.force_avatar) {
        avatar = message.force_avatar;
    } else if (matchingCharacter) {
        avatar = getCharacterAvatar(context, matchingCharacter);
    } else if (useCurrentSender && message.original_avatar) {
        avatar = context?.getThumbnailUrl?.(
            'avatar',
            message.original_avatar,
        ) ?? message.original_avatar;
    } else if (
        useCurrentSender
        && context?.characterId !== undefined
    ) {
        avatar = getCharacterAvatar(
            context,
            context.characters?.[context.characterId],
        );
    }

    return {
        id: normalizeContactId(senderName),
        name: String(senderName).trim() || 'Unknown',
        avatar,
    };
}

function resolveConversation(contact, threadToken) {
    const threadName = String(threadToken ?? '').trim();

    if (threadName) {
        return {
            id: `thread:${normalizeContactId(threadName)}`,
            name: threadName,
            avatar: null,
            isGroup: true,
        };
    }

    return {
        id: contact.id,
        name: contact.name,
        avatar: contact.avatar,
        isGroup: false,
    };
}

function isPhoneSourceMessage(message) {
    return Boolean(message)
        && message.is_system !== true
        && message.extra?.isSmallSys !== true
        && message.extra?.type !== 'narrator';
}

function syncCurrentSwipeExtra(message) {
    const swipeId = Number(message?.swipe_id);
    const swipeInfo = message?.swipe_info?.[swipeId];

    if (
        !Number.isInteger(swipeId)
        || !swipeInfo
        || typeof swipeInfo !== 'object'
    ) {
        return;
    }

    swipeInfo.extra = structuredClone(message.extra ?? {});
}

function updateStoredEvents(
    context,
    message,
    previous,
    events,
) {
    if (events.length === 0) {
        if (!previous) {
            return false;
        }

        delete message.extra[MESSAGE_EXTRA_KEY];
        syncCurrentSwipeExtra(message);
        return true;
    }

    message.extra ??= {};

    const next = {
        schemaVersion: SCHEMA_VERSION,
        sourceId:
            previous?.sourceId ||
            createId(context),
        sourceSwipeId: Number.isInteger(message.swipe_id)
            ? message.swipe_id
            : 0,
        events,
    };

    if (JSON.stringify(previous) === JSON.stringify(next)) {
        return false;
    }

    message.extra[MESSAGE_EXTRA_KEY] = next;
    syncCurrentSwipeExtra(message);

    return true;
}

function syncCharacterMessage(context, message) {
    const parsedMessages = parsePhoneMessages(message.mes);
    const previous =
        message.extra?.[MESSAGE_EXTRA_KEY];

    const previousEvents = Array.isArray(previous?.events)
        ? previous.events
        : [];

    const sentAt = getTimestamp(
        context,
        message.send_date,
    );

    const events = parsedMessages.map(
        (parsed, order) => {
            const contact = resolveContact(
                context,
                message,
                parsed.sender,
            );

            const conversation = resolveConversation(
                contact,
                parsed.thread,
            );

            return {
                id:
                    previousEvents[order]?.id ||
                    createId(context),

                direction: 'incoming',

                conversationId: conversation.id,
                conversationName: conversation.name,
                isGroup: conversation.isGroup,

                contactId: contact.id,
                senderName: contact.name,
                avatar: contact.avatar,

                thread: parsed.thread,
                text: parsed.text,
                sentAt,
                order,
            };
        },
    );

    return updateStoredEvents(
        context,
        message,
        previous,
        events,
    );
}

/**
 * 바로 앞 캐릭터 응답의 문자방을 답장 대상으로 사용해요.
 *
 * 하나의 응답에 서로 다른 대화방이 섞여 있으면
 * 답장 대상을 확정할 수 없으므로 null을 반환해요.
 */
function getReplyTarget(context, messageIndex) {
    const previousMessage =
        context.chat?.[messageIndex - 1];

    if (
        !isPhoneSourceMessage(previousMessage) ||
        previousMessage.is_user === true
    ) {
        return null;
    }

    const previousEvents =
        previousMessage.extra?.[MESSAGE_EXTRA_KEY]?.events;

    if (!Array.isArray(previousEvents)) {
        return null;
    }

    const incomingEvents = previousEvents.filter(
        (event) => event?.direction !== 'outgoing',
    );

    const conversationIds = new Set(
        incomingEvents
            .map((event) => (
                event?.conversationId ||
                event?.contactId
            ))
            .filter(Boolean),
    );

    /*
     * 직전 응답에 문자방이 정확히 하나일 때만
     * 유저 인라인 코드를 답장으로 기록해요.
     */
    if (conversationIds.size !== 1) {
        return null;
    }

    const [conversationId] = conversationIds;

    const targetEvent = [...incomingEvents]
        .reverse()
        .find((event) => (
            event?.conversationId ||
            event?.contactId
        ) === conversationId);

    if (!targetEvent) {
        return null;
    }

    const isGroup =
        targetEvent.isGroup === true ||
        Boolean(targetEvent.thread);

    const conversationName =
        targetEvent.conversationName ||
        targetEvent.thread ||
        targetEvent.senderName ||
        'Unknown';

    return {
        conversationId,
        conversationName,
        isGroup,

        thread: targetEvent.thread || null,

        contactId:
            targetEvent.contactId ||
            conversationId,

        recipientName: isGroup
            ? conversationName
            : (
                targetEvent.senderName ||
                conversationName
            ),
    };
}

function syncUserMessage(
    context,
    message,
    messageIndex,
) {
    const previous =
        message.extra?.[MESSAGE_EXTRA_KEY];

    const target = getReplyTarget(
        context,
        messageIndex,
    );

    /*
     * 답장 대상을 확정할 수 있을 때만
     * 유저의 인라인 코드를 파싱해요.
     */
    const parsedReplies = target
        ? parseUserPhoneReplies(message.mes)
        : [];

    const previousEvents = Array.isArray(previous?.events)
        ? previous.events
        : [];

    const sentAt = getTimestamp(
        context,
        message.send_date,
    );

    const senderName = String(
        message.name ||
        context?.name1 ||
        'You',
    ).trim() || 'You';

    const events = parsedReplies.map(
        (parsed, order) => ({
            id:
                previousEvents[order]?.id ||
                createId(context),

            direction: 'outgoing',

            conversationId: target.conversationId,
            conversationName: target.conversationName,
            isGroup: target.isGroup,

            contactId: target.contactId,
            senderName,
            recipientName: target.recipientName,
            avatar: null,

            thread: target.thread,
            text: parsed.text,
            sourceCodeIndex: parsed.sourceCodeIndex,

            sentAt,
            order,
        }),
    );

    return updateStoredEvents(
        context,
        message,
        previous,
        events,
    );
}

function syncMessage(
    context,
    message,
    messageIndex,
) {
    if (!isPhoneSourceMessage(message)) {
        return false;
    }

    if (message.is_user === true) {
        return syncUserMessage(
            context,
            message,
            messageIndex,
        );
    }

    return syncCharacterMessage(
        context,
        message,
    );
}

function getMetadataState(context) {
    const source = context?.chatMetadata?.[CHAT_METADATA_KEY];

    return {
        schemaVersion: SCHEMA_VERSION,
        initialized: source?.initialized === true,
        readEventIds: Array.isArray(source?.readEventIds)
            ? source.readEventIds.filter(
                (id) => typeof id === 'string',
            )
            : [],
    };
}

function writeMetadataState(context, state) {
    if (!context?.chatMetadata) {
        return;
    }

    context.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: SCHEMA_VERSION,
        initialized: state.initialized === true,
        readEventIds: [...new Set(state.readEventIds)],
    };
}

function buildSnapshot(context) {
    if (!context?.chatId || !Array.isArray(context.chat)) {
        return EMPTY_SNAPSHOT;
    }

    const metadata = getMetadataState(context);
    const readIds = new Set(metadata.readEventIds);
    const conversations = new Map();
    const contacts = new Map();

    context.chat.forEach((message, sourceMessageIndex) => {
        const storedEvents =
            message?.extra?.[MESSAGE_EXTRA_KEY]?.events;

        if (!Array.isArray(storedEvents)) {
            return;
        }

        storedEvents.forEach((event, sourceOrder) => {
            /*
             * 신규 이벤트는 conversationId를 사용해요.
             * 기존 개인 문자 데이터는 contactId로 호환해요.
             */
            const conversationId =
                event?.conversationId || event?.contactId;

            if (!event?.id || !conversationId || !event?.text) {
                return;
            }

            let conversation = conversations.get(
                conversationId,
            );

            if (!conversation) {
                const isGroup =
                    event.isGroup === true ||
                    Boolean(event.thread);

                conversation = {
                    id: conversationId,
                    name:
                        event.conversationName ||
                        event.thread ||
                        event.senderName ||
                        'Unknown',
                    avatar: isGroup
                        ? null
                        : (event.avatar || null),
                    isGroup,
                    messages: [],
                    unreadCount: 0,
                    lastMessage: null,
                };

                conversations.set(
                    conversationId,
                    conversation,
                );
            }

            /*
            * 기존 이벤트에는 direction이 없으므로
            * 기본값을 incoming으로 취급해요.
            */
            const direction =
                event.direction === 'outgoing'
                    ? 'outgoing'
                    : 'incoming';

            const sentAt = Number.isFinite(event.sentAt)
                ? event.sentAt
                : null;

            /*
            * 연락처는 캐릭터가 보낸 문자에서만 파생해요.
            * 내가 보낸 답장과 단체방 자체는 연락처로 만들지 않아요.
            */
            if (
                direction === 'incoming' &&
                event.contactId
            ) {
                const contactId = String(event.contactId);
                const isGroup =
                    event.isGroup === true ||
                    Boolean(event.thread);

                let contact = contacts.get(contactId);

                if (!contact) {
                    contact = {
                        id: contactId,
                        name: event.senderName || 'Unknown',
                        avatar: event.avatar || null,
                        firstSeenAt: sentAt,
                        lastSeenAt: sentAt,
                        messageCount: 0,
                        directConversationId: null,
                        groups: new Map(),
                    };

                    contacts.set(contactId, contact);
                }

                /*
                * 뒤쪽 메시지일수록 최신 이름과 아바타를 사용해요.
                */
                contact.name =
                    event.senderName || contact.name;
                contact.avatar =
                    event.avatar || contact.avatar;
                contact.messageCount += 1;

                if (Number.isFinite(sentAt)) {
                    contact.firstSeenAt = Number.isFinite(
                        contact.firstSeenAt,
                    )
                        ? Math.min(contact.firstSeenAt, sentAt)
                        : sentAt;

                    contact.lastSeenAt = Number.isFinite(
                        contact.lastSeenAt,
                    )
                        ? Math.max(contact.lastSeenAt, sentAt)
                        : sentAt;
                }

                if (isGroup) {
                    const groupId =
                        event.conversationId ||
                        `thread:${normalizeContactId(event.thread)}`;

                    contact.groups.set(groupId, {
                        id: groupId,
                        name:
                            event.conversationName ||
                            event.thread ||
                            'Group',
                    });
                } else {
                    contact.directConversationId =
                        event.conversationId || contactId;
                }
            }

            const item = {
                id: event.id,
                text: event.text,
                direction,

                sentAt,

                sourceMessageIndex,
                sourceOrder,

                senderName:
                    event.senderName || 'Unknown',

                avatar:
                    event.avatar || null,

                /*
                * 내가 보낸 문자는 항상 읽은 상태예요.
                */
                isRead:
                    direction === 'outgoing' ||
                    readIds.has(event.id),
            };

            /*
             * 단체방 이름은 thread를 유지하고,
             * 개인방 이름만 발신자 이름으로 갱신해요.
             */
            conversation.name =
                event.conversationName ||
                event.thread ||
                (
                    conversation.isGroup
                        ? conversation.name
                        : event.senderName
                ) ||
                conversation.name;

            if (!conversation.isGroup) {
                conversation.avatar =
                    event.avatar || conversation.avatar;
            }

            conversation.messages.push(item);
            conversation.lastMessage = item;

            if (
                item.direction === 'incoming' &&
                !item.isRead
            ) {
                conversation.unreadCount += 1;
            }
        });
    });

    const sortedConversations = [
        ...conversations.values(),
    ].sort((a, b) => {
        const aLast = a.lastMessage;
        const bLast = b.lastMessage;

        return (
            bLast?.sourceMessageIndex -
            aLast?.sourceMessageIndex
        ) || (
            bLast?.sourceOrder -
            aLast?.sourceOrder
        );
    });

    const sortedContacts = [...contacts.values()]
    .map((contact) => ({
        ...contact,
        groups: [...contact.groups.values()].sort(
            (a, b) => a.name.localeCompare(
                b.name,
                undefined,
                { sensitivity: 'base' },
            ),
        ),
    }))
    .sort((a, b) => a.name.localeCompare(
        b.name,
        undefined,
        { sensitivity: 'base' },
    ));

    return {
        chatId: context.chatId,
        conversations: sortedConversations,
        contacts: sortedContacts,
        totalUnread: sortedConversations.reduce(
            (total, conversation) => (
                total + conversation.unreadCount
            ),
            0,
        ),
    };
}



export function createMessageService() {
    const subscribers = new Set();

    let currentSnapshot = EMPTY_SNAPSHOT;
    let syncTimer = null;
    let saveTimer = null;
    let started = false;

    function publish(snapshot) {
        currentSnapshot = snapshot;

        for (const subscriber of subscribers) {
            subscriber(snapshot);
        }
    }

    function scheduleChatSave(chatId) {
        window.clearTimeout(saveTimer);

        saveTimer = window.setTimeout(async () => {
            const context = getContext();

            if (!context || context.chatId !== chatId) {
                return;
            }

            await context.saveChat?.();
        }, 350);
    }

    function initializeReadState(context, snapshot) {
        const state = getMetadataState(context);

        if (state.initialized) {
            return false;
        }

        /*
         * 확장 설치 전에 이미 존재하던 과거 문자는
         * 사용자가 읽은 기록으로 취급해요.
         */
        state.initialized = true;
        state.readEventIds = snapshot.conversations.flatMap(
            (conversation) => (
                conversation.messages.map(
                    (message) => message.id,
                )
            ),
        );

        writeMetadataState(context, state);
        context.saveMetadataDebounced?.();

        return true;
    }

    async function syncCurrentChat() {
        const context = getContext();

        if (!context?.chatId || !Array.isArray(context.chat)) {
            publish(EMPTY_SNAPSHOT);
            return EMPTY_SNAPSHOT;
        }

        let changed = false;

        for (
            let messageIndex = 0;
            messageIndex < context.chat.length;
            messageIndex += 1
        ) {
            changed = syncMessage(
                context,
                context.chat[messageIndex],
                messageIndex,
            ) || changed;
        }

        let snapshot = buildSnapshot(context);

        if (initializeReadState(context, snapshot)) {
            snapshot = buildSnapshot(context);
        }

        if (changed) {
            scheduleChatSave(context.chatId);
        }

        publish(snapshot);
        return snapshot;
    }

    function scheduleSync() {
        window.clearTimeout(syncTimer);

        syncTimer = window.setTimeout(() => {
            syncCurrentChat().catch((error) => {
                console.error(
                    '[Phone] Message sync failed.',
                    error,
                );
            });
        }, 0);
    }

    function start() {
        if (started) {
            return;
        }

        started = true;

        const context = getContext();
        const eventSource = context?.eventSource;
        const eventTypes =
            context?.eventTypes ?? context?.event_types;

        if (!eventSource || !eventTypes) {
            console.warn(
                '[Phone] SillyTavern events are unavailable.',
            );

            scheduleSync();
            return;
        }

        const eventNames = [
            'MESSAGE_SENT',
            'MESSAGE_RECEIVED',
            'MESSAGE_EDITED',
            'MESSAGE_UPDATED',
            'MESSAGE_DELETED',
            'MESSAGE_SWIPED',
            'CHAT_CHANGED',
            'CHAT_LOADED',
            'CHARACTER_EDITED',
        ];

        for (const eventName of eventNames) {
            const eventType = eventTypes[eventName];

            if (eventType) {
                eventSource.on(eventType, scheduleSync);
            }
        }

        scheduleSync();
    }

    function subscribe(callback) {
        subscribers.add(callback);
        callback(currentSnapshot);

        return () => subscribers.delete(callback);
    }

    function markConversationRead(conversationId) {
        const context = getContext();

        if (!context?.chatId) {
            return;
        }

        const snapshot = buildSnapshot(context);
        const conversation = snapshot.conversations.find(
            (item) => item.id === conversationId,
        );

        if (!conversation) {
            return;
        }

        const state = getMetadataState(context);
        const readIds = new Set(state.readEventIds);

        for (const message of conversation.messages) {
            readIds.add(message.id);
        }

        state.initialized = true;
        state.readEventIds = [...readIds];

        writeMetadataState(context, state);
        context.saveMetadataDebounced?.();
        publish(buildSnapshot(context));
    }

    return {
        start,
        subscribe,
        syncCurrentChat,
        markConversationRead,
        getSnapshot: () => currentSnapshot,
    };
}