function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function formatListTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return '';
    }

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    return new Intl.DateTimeFormat(
        undefined,
        isToday
            ? { hour: '2-digit', minute: '2-digit' }
            : { month: 'numeric', day: 'numeric' },
    ).format(date);
}

function formatMessageTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return '';
    }

    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}

function createAvatar(conversation, size = 'normal') {
    const avatar = createElement(
        'span',
        `phone-ext__contact-avatar phone-ext__contact-avatar--${size}`,
    );

    const fallback = createElement(
        'span',
        'phone-ext__contact-avatar-fallback',
        conversation.name?.slice(0, 1) || '?',
    );

    avatar.appendChild(fallback);

    if (conversation.avatar) {
        const image = document.createElement('img');
        image.src = conversation.avatar;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => image.remove(), {
            once: true,
        });
        avatar.appendChild(image);
    }

    return avatar;
}

function renderEmpty(container) {
    container.className = [
        'phone-ext__app-content',
        'phone-ext__messages',
        'phone-ext__messages--empty',
    ].join(' ');

    const icon = createElement(
        'span',
        'phone-ext__messages-empty-icon',
    );
    const iconGlyph = createElement(
        'i',
        'fa-solid fa-comment-dots',
    );
    iconGlyph.setAttribute('aria-hidden', 'true');
    icon.appendChild(iconGlyph);

    const heading = createElement(
        'strong',
        null,
        '아직 수집된 문자가 없어요',
    );
    const description = createElement(
        'p',
        null,
        'RP에서 캐릭터가 보낸 문자가 감지되면 여기에 표시돼요.',
    );

    container.replaceChildren(icon, heading, description);
}

function renderConversationList(
    container,
    snapshot,
    openConversation,
) {
    container.className =
        'phone-ext__app-content phone-ext__messages';

    const list = createElement('div', 'phone-ext__thread-list');
    list.setAttribute('role', 'list');

    for (const conversation of snapshot.conversations) {
        const button = createElement(
            'button',
            'phone-ext__thread',
        );
        button.type = 'button';
        button.setAttribute('role', 'listitem');
        button.addEventListener(
            'click',
            () => openConversation(conversation.id),
        );

        const content = createElement(
            'span',
            'phone-ext__thread-content',
        );
        const name = createElement(
            'strong',
            'phone-ext__thread-name',
            conversation.name,
        );
        const preview = createElement(
            'span',
            'phone-ext__thread-preview',
            conversation.lastMessage?.text || '',
        );
        content.append(name, preview);

        const meta = createElement(
            'span',
            'phone-ext__thread-meta',
        );
        const time = createElement(
            'time',
            'phone-ext__thread-time',
            formatListTime(conversation.lastMessage?.sentAt),
        );
        meta.appendChild(time);

        if (conversation.unreadCount > 0) {
            const unread = createElement(
                'span',
                'phone-ext__thread-unread',
                String(Math.min(conversation.unreadCount, 99)),
            );
            unread.setAttribute(
                'aria-label',
                `${conversation.unreadCount} unread messages`,
            );
            meta.appendChild(unread);
        } else {
            const chevron = createElement(
                'i',
                'fa-solid fa-chevron-right phone-ext__thread-chevron',
            );
            chevron.setAttribute('aria-hidden', 'true');
            meta.appendChild(chevron);
        }

        button.append(
            createAvatar(conversation),
            content,
            meta,
        );
        list.appendChild(button);
    }

    container.replaceChildren(list);
}

function renderConversation(container, conversation) {
    container.className = [
        'phone-ext__app-content',
        'phone-ext__messages',
        'phone-ext__conversation',
    ].join(' ');

    const identity = createElement(
        'div',
        'phone-ext__conversation-identity',
    );
    identity.append(
        createAvatar(conversation, 'large'),
        createElement('strong', null, conversation.name),
    );

    const messages = createElement(
        'div',
        'phone-ext__message-history',
    );
    messages.setAttribute(
        'aria-label',
        `Messages from ${conversation.name}`,
    );

    for (const message of conversation.messages) {
        const row = createElement(
            'div',
            'phone-ext__message-row phone-ext__message-row--incoming',
        );
        const bubble = createElement(
            'div',
            'phone-ext__message-bubble',
            message.text,
        );
        const time = createElement(
            'time',
            'phone-ext__message-time',
            formatMessageTime(message.sentAt),
        );

        row.append(bubble, time);
        messages.appendChild(row);
    }

    const readOnly = createElement(
        'div',
        'phone-ext__messages-readonly',
    );
    const eye = createElement('i', 'fa-solid fa-eye');
    eye.setAttribute('aria-hidden', 'true');

    readOnly.append(
        eye,
        document.createTextNode(
            ' RP에서 감지된 메시지만 표시해요',
        ),
    );

    container.replaceChildren(identity, messages, readOnly);

    window.requestAnimationFrame(() => {
        messages.scrollTop = messages.scrollHeight;
    });
}

export function createMessagesAppRenderer(messageService) {
    return ({ container, setTitle }) => {
        let currentView = 'list';
        let conversationId = null;
        let snapshot = messageService.getSnapshot();

        function render() {
            if (currentView === 'conversation') {
                const conversation = snapshot.conversations.find(
                    (item) => item.id === conversationId,
                );

                if (conversation) {
                    setTitle(conversation.name);
                    renderConversation(container, conversation);
                    return;
                }

                currentView = 'list';
                conversationId = null;
            }

            setTitle('Messages');

            if (snapshot.conversations.length === 0) {
                renderEmpty(container);
            } else {
                renderConversationList(
                    container,
                    snapshot,
                    openConversation,
                );
            }
        }

        function openConversation(id) {
            currentView = 'conversation';
            conversationId = id;

            messageService.markConversationRead(id);
            snapshot = messageService.getSnapshot();
            render();
        }

        const unsubscribe = messageService.subscribe(
            (nextSnapshot) => {
                snapshot = nextSnapshot;
                render();
            },
        );

        messageService.syncCurrentChat();

        return {
            back() {
                if (currentView !== 'conversation') {
                    return false;
                }

                currentView = 'list';
                conversationId = null;
                render();
                return true;
            },

            destroy() {
                unsubscribe();
            },
        };
    };
}