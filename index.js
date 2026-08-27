import { getPhoneApps } from './src/core/app-registry.js';
import { loadPhoneSettings, saveWindowPosition } from './src/core/settings.js';
import { createPhoneShell } from './src/ui/phone-shell.js';
import { createMessageService } from './src/messages/message-service.js';
import { installPhoneMessagePromptInjection } from './src/messages/prompt-injection.js';
import { createMessagesAppRenderer } from './src/ui/messages-app.js';
import { createContactsAppRenderer } from './src/ui/contacts-app.js';

const EXTENSION_NAME = 'Phone';
const MENU_ITEM_ID = 'phone-extension-menu-item';
const PANEL_ID = 'phone-extension-panel';

let phoneShell = null;
let messageService = null;

/**
 * Waits for a SillyTavern UI element that may not exist when the extension script first loads.
 * @param {string} selector
 * @param {number} timeout
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeout = 15000) {
    const existing = document.querySelector(selector);
    if (existing) {
        return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (!element) {
                return;
            }

            observer.disconnect();
            clearTimeout(timer);
            resolve(element);
        });

        const timer = window.setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    });
}

/**
 * Creates the entry shown in SillyTavern's magic-wand Extensions menu.
 * @param {Element} menuContainer
 * @returns {HTMLDivElement}
 */
function createMenuItem(menuContainer) {
    const existing = document.getElementById(MENU_ITEM_ID);
    if (existing) {
        return existing;
    }

    const menuItem = document.createElement('div');
    menuItem.id = MENU_ITEM_ID;
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;
    menuItem.setAttribute('role', 'button');
    menuItem.setAttribute('aria-label', `Open ${EXTENSION_NAME}`);
    menuItem.innerHTML = `
        <i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>
        <span>${EXTENSION_NAME}</span>
    `;

    const openPhone = () => phoneShell?.open();
    menuItem.addEventListener('click', openPhone);
    menuItem.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openPhone();
    });

    menuContainer.appendChild(menuItem);
    return menuItem;
}

async function initializePhone() {
    installPhoneMessagePromptInjection();

    if (document.getElementById(PANEL_ID)) {
        return;
    }

    const [menuContainer, movingDivs] = await Promise.all([
        waitForElement('#extensionsMenu'),
        waitForElement('#movingDivs'),
    ]);

    if (!menuContainer) {
        console.error('[Phone] Could not find the SillyTavern Extensions menu.');
        return;
    }

    const menuItem = createMenuItem(menuContainer);
    const settings = loadPhoneSettings();
    const apps = getPhoneApps();

    messageService = createMessageService();
    messageService.start();

    const appRenderers = {
        contacts: createContactsAppRenderer(messageService),
        messages: createMessagesAppRenderer(messageService),
    };

    phoneShell = createPhoneShell({
        id: PANEL_ID,
        apps,
        appRenderers,
        settings,
        onPositionChange: saveWindowPosition,
        returnFocusTo: menuItem,
    });

    (movingDivs ?? document.body).appendChild(phoneShell.element);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePhone, { once: true });
} else {
    initializePhone();
}
