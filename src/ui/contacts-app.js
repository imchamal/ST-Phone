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

function createAvatar(contact, size = 'normal') {
    const avatar = createElement(
        'span',
        `phone-ext__contact-avatar phone-ext__contact-avatar--${size}`,
    );

    avatar.appendChild(createElement(
        'span',
        'phone-ext__contact-avatar-fallback',
        contact.name?.slice(0, 1) || '?',
    ));

    if (contact.avatar) {
        const image = document.createElement('img');
        image.src = contact.avatar;
        image.alt = '';
        image.loading = 'lazy';

        image.addEventListener(
            'error',
            () => image.remove(),
            { once: true },
        );

        avatar.appendChild(image);
    }

    return avatar;
}

function getContactSummary(contact) {
    const parts = [`문자 ${contact.messageCount}개`];

    if (contact.groups.length > 0) {
        parts.push(`단체방 ${contact.groups.length}개`);
    }

    return parts.join(' · ');
}

function renderEmpty(container) {
    container.className = [
        'phone-ext__app-content',
        'phone-ext__contacts',
        'phone-ext__contacts--empty',
    ].join(' ');

    const icon = createElement(
        'span',
        'phone-ext__contacts-empty-icon',
    );

    const glyph = createElement(
        'i',
        'fa-solid fa-address-book',
    );

    glyph.setAttribute('aria-hidden', 'true');
    icon.appendChild(glyph);

    container.replaceChildren(
        icon,
        createElement(
            'strong',
            null,
            '아직 등록된 연락처가 없어요',
        ),
        createElement(
            'p',
            null,
            '캐릭터가 문자를 보내면 자동으로 연락처에 등록돼요.',
        ),
    );
}

function renderContactList(
    container,
    snapshot,
    openContact,
) {
    container.className =
        'phone-ext__app-content phone-ext__contacts';

    const list = createElement(
        'div',
        'phone-ext__contact-list',
    );

    list.setAttribute('role', 'list');

    for (const contact of snapshot.contacts) {
        const button = createElement(
            'button',
            'phone-ext__contact-row',
        );

        button.type = 'button';
        button.setAttribute('role', 'listitem');

        button.addEventListener(
            'click',
            () => openContact(contact.id),
        );

        const content = createElement(
            'span',
            'phone-ext__contact-row-content',
        );

        content.append(
            createElement(
                'strong',
                'phone-ext__contact-row-name',
                contact.name,
            ),
            createElement(
                'span',
                'phone-ext__contact-row-summary',
                getContactSummary(contact),
            ),
        );

        const chevron = createElement(
            'i',
            [
                'fa-solid',
                'fa-chevron-right',
                'phone-ext__contact-row-chevron',
            ].join(' '),
        );

        chevron.setAttribute('aria-hidden', 'true');

        button.append(
            createAvatar(contact),
            content,
            chevron,
        );

        list.appendChild(button);
    }

    container.replaceChildren(list);
}

function renderContact(container, contact) {
    container.className = [
        'phone-ext__app-content',
        'phone-ext__contacts',
        'phone-ext__contact-detail',
    ].join(' ');

    const hero = createElement(
        'section',
        'phone-ext__contact-hero',
    );

    hero.append(
        createAvatar(contact, 'profile'),
        createElement('h2', null, contact.name),
        createElement(
            'p',
            null,
            contact.directConversationId
                ? '개인 대화 연락처'
                : '단체방에서 등록된 연락처',
        ),
    );

    const stats = createElement(
        'section',
        'phone-ext__contact-stats',
    );

    const messageStat = createElement(
        'div',
        'phone-ext__contact-stat',
    );

    messageStat.append(
        createElement(
            'strong',
            null,
            String(contact.messageCount),
        ),
        createElement('span', null, '받은 문자'),
    );

    const groupStat = createElement(
        'div',
        'phone-ext__contact-stat',
    );

    groupStat.append(
        createElement(
            'strong',
            null,
            String(contact.groups.length),
        ),
        createElement('span', null, '단체방'),
    );

    stats.append(messageStat, groupStat);

    const sections = [hero, stats];

    if (contact.groups.length > 0) {
        const groupSection = createElement(
            'section',
            'phone-ext__contact-groups',
        );

        groupSection.appendChild(createElement(
            'h3',
            null,
            '함께 있는 단체방',
        ));

        for (const group of contact.groups) {
            const row = createElement(
                'div',
                'phone-ext__contact-group',
            );

            const icon = createElement(
                'span',
                'phone-ext__contact-group-icon',
            );

            const glyph = createElement(
                'i',
                'fa-solid fa-user-group',
            );

            glyph.setAttribute('aria-hidden', 'true');
            icon.appendChild(glyph);

            row.append(
                icon,
                createElement('span', null, group.name),
            );

            groupSection.appendChild(row);
        }

        sections.push(groupSection);
    }

    container.replaceChildren(...sections);
}

export function createContactsAppRenderer(messageService) {
    return ({ container, setTitle }) => {
        let currentView = 'list';
        let contactId = null;
        let snapshot = messageService.getSnapshot();

        function render() {
            if (currentView === 'detail') {
                const contact = snapshot.contacts.find(
                    (item) => item.id === contactId,
                );

                if (contact) {
                    setTitle(contact.name);
                    renderContact(container, contact);
                    return;
                }

                currentView = 'list';
                contactId = null;
            }

            setTitle('Contacts');

            if (snapshot.contacts.length === 0) {
                renderEmpty(container);
            } else {
                renderContactList(
                    container,
                    snapshot,
                    openContact,
                );
            }
        }

        function openContact(id) {
            currentView = 'detail';
            contactId = id;
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
                if (currentView !== 'detail') {
                    return false;
                }

                currentView = 'list';
                contactId = null;
                render();

                return true;
            },

            destroy() {
                unsubscribe();
            },
        };
    };
}