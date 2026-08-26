const MOBILE_QUERY = '(max-width: 720px), (pointer: coarse) and (max-width: 1024px)';
let topZIndex = 30000;

function createIcon(className) {
    const icon = document.createElement('i');
    icon.className = `fa-solid ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createAppButton(app, compact = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = compact ? 'phone-ext__app-button phone-ext__app-button--dock' : 'phone-ext__app-button';
    button.dataset.phoneApp = app.id;
    button.setAttribute('aria-label', `Open ${app.name}`);
    button.style.setProperty('--phone-app-color', app.color);

    const iconBox = document.createElement('span');
    iconBox.className = 'phone-ext__app-icon';
    iconBox.appendChild(createIcon(app.icon));

    const label = document.createElement('span');
    label.className = 'phone-ext__app-label';
    label.textContent = app.name;

    button.append(iconBox, label);
    return button;
}

function formatStatusTime(date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function formatHomeDate(date) {
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

/**
 * Creates the Phone shell and its public controls.
 * @param {{
 *   id: string,
 *   apps: Array<{id:string,name:string,icon:string,color:string,location:string}>,
 *   settings: {window:{left:number|null,top:number|null}},
 *   onPositionChange: (position:{left:number,top:number}) => void,
 *   returnFocusTo: HTMLElement
 * }} options
 */
export function createPhoneShell(options) {
    const {
        id,
        apps,
        appRenderers = {},
        settings,
        onPositionChange,
        returnFocusTo,
    } = options;
    const appMap = new Map(apps.map((app) => [app.id, app]));
    const mediaQuery = window.matchMedia(MOBILE_QUERY);

    const panel = document.createElement('section');
    panel.id = id;
    panel.className = 'phone-ext';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Phone');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="phone-ext__window-bar" data-phone-drag-handle>
            <span class="phone-ext__window-title">
                <i class="fa-solid fa-grip-lines" aria-hidden="true"></i>
                Phone
            </span>
            <button type="button" class="phone-ext__window-close" data-phone-action="close" aria-label="Close Phone">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </div>
        <div class="phone-ext__device">
            <div class="phone-ext__screen">
                <header class="phone-ext__status-bar">
                    <time class="phone-ext__status-time"></time>
                    <div class="phone-ext__status-icons" aria-label="Network and battery status">
                        <i class="fa-solid fa-signal" aria-hidden="true"></i>
                        <i class="fa-solid fa-wifi" aria-hidden="true"></i>
                        <i class="fa-solid fa-battery-full" aria-hidden="true"></i>
                    </div>
                    <button type="button" class="phone-ext__mobile-close" data-phone-action="close" aria-label="Close Phone">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </header>
                <main class="phone-ext__content">
                    <section class="phone-ext__home" aria-label="Phone home screen">
                        <div class="phone-ext__home-heading">
                            <time class="phone-ext__home-time"></time>
                            <time class="phone-ext__home-date"></time>
                        </div>
                        <div class="phone-ext__app-grid" aria-label="Apps"></div>
                        <div class="phone-ext__dock" aria-label="Dock"></div>
                    </section>
                    <section class="phone-ext__app-view" hidden aria-live="polite">
                        <header class="phone-ext__app-header">
                            <button type="button" class="phone-ext__nav-button" data-phone-action="back" aria-label="Back to home">
                                <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                            </button>
                            <strong class="phone-ext__app-title"></strong>
                        </header>
                        <div class="phone-ext__app-content"></div>
                    </section>
                </main>
            </div>
        </div>
    `;

    const dragHandle = panel.querySelector('[data-phone-drag-handle]');
    const homeScreen = panel.querySelector('.phone-ext__home');
    const appView = panel.querySelector('.phone-ext__app-view');
    const appGrid = panel.querySelector('.phone-ext__app-grid');
    const dock = panel.querySelector('.phone-ext__dock');
    const appTitle = panel.querySelector('.phone-ext__app-title');
    const appContent = panel.querySelector('.phone-ext__app-content');
    const statusTime = panel.querySelector('.phone-ext__status-time');
    const homeTime = panel.querySelector('.phone-ext__home-time');
    const homeDate = panel.querySelector('.phone-ext__home-date');
    const screen = panel.querySelector('.phone-ext__screen');

    let clockTimer = null;
    let dragState = null;
    let activeAppController = null;

    for (const app of apps) {
        const target = app.location === 'dock' ? dock : appGrid;
        target.appendChild(createAppButton(app, app.location === 'dock'));
    }

    function bringToFront() {
        topZIndex += 1;
        panel.style.zIndex = String(topZIndex);
    }

    function updateClock() {
        const now = new Date();
        const time = formatStatusTime(now);
        statusTime.textContent = time;
        homeTime.textContent = time;
        homeDate.textContent = formatHomeDate(now);
        statusTime.dateTime = now.toISOString();
        homeTime.dateTime = now.toISOString();
        homeDate.dateTime = now.toISOString();
    }

    function startClock() {
        updateClock();
        window.clearInterval(clockTimer);
        clockTimer = window.setInterval(updateClock, 30000);
    }

    function stopClock() {
        window.clearInterval(clockTimer);
        clockTimer = null;
    }

    function destroyActiveApp() {
        activeAppController?.destroy?.();
        activeAppController = null;
    }

    function resetAppContent() {
        appContent.className = 'phone-ext__app-content';
        appContent.replaceChildren();
    }

    function showHome() {
        destroyActiveApp();
        homeScreen.hidden = false;
        appView.hidden = true;
        screen.classList.remove('phone-ext__screen--app-open');
        appTitle.textContent = '';
        resetAppContent();
    }

    function renderPlaceholder(app) {
        const iconBox = document.createElement('span');
        iconBox.className = 'phone-ext__placeholder-icon';
        iconBox.style.setProperty('--phone-app-color', app.color);
        iconBox.appendChild(createIcon(app.icon));

        const heading = document.createElement('strong');
        heading.textContent = app.name;

        const description = document.createElement('p');
        description.textContent =
            '이 앱은 다음 개발 단계에서 연결할 예정이에요.';

        appContent.className =
            'phone-ext__app-content phone-ext__placeholder';
        appContent.replaceChildren(
            iconBox,
            heading,
            description,
        );
    }

    function openApp(appId) {
        const app = appMap.get(appId);

        if (!app) {
            return;
        }

        destroyActiveApp();
        resetAppContent();

        appTitle.textContent = app.name;
        homeScreen.hidden = true;
        appView.hidden = false;
        screen.classList.add('phone-ext__screen--app-open');

        const renderer = appRenderers[appId];

        if (typeof renderer === 'function') {
            activeAppController = renderer({
                container: appContent,

                setTitle(title) {
                    appTitle.textContent = title || app.name;
                },
            }) ?? null;
        } else {
            renderPlaceholder(app);
        }

        appView
            .querySelector('[data-phone-action="back"]')
            ?.focus({ preventScroll: true });
    }

    function focusCloseButton() {
        panel.querySelector('.phone-ext__mobile-close')?.focus({ preventScroll: true });
    }

    function clampToViewport(left, top) {
        const rect = panel.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

        return {
            left: Math.min(Math.max(left, margin), maxLeft),
            top: Math.min(Math.max(top, margin), maxTop),
        };
    }

    function applyDesktopPosition() {
        if (mediaQuery.matches || !Number.isFinite(settings.window.left) || !Number.isFinite(settings.window.top)) {
            return;
        }

        const position = clampToViewport(settings.window.left, settings.window.top);
        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
        panel.style.transform = 'none';
    }

    function open() {
        if (!panel.hidden) {
            bringToFront();
            focusCloseButton();
            return;
        }

        showHome();
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        bringToFront();
        applyDesktopPosition();
        startClock();
        window.requestAnimationFrame(() => panel.classList.add('phone-ext--open'));
        focusCloseButton();
    }

    function close() {
        if (panel.hidden) {
            return;
        }

        panel.classList.remove('phone-ext--open');
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        stopClock();
        showHome();
        returnFocusTo?.focus?.({ preventScroll: true });
    }

    function startDrag(event) {
        if (mediaQuery.matches || event.button !== 0 || event.target.closest('button')) {
            return;
        }

        const rect = panel.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };

        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.transform = 'none';
        panel.classList.add('phone-ext--dragging');
        dragHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function moveDrag(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        const position = clampToViewport(
            event.clientX - dragState.offsetX,
            event.clientY - dragState.offsetY,
        );

        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
    }

    function endDrag(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        dragHandle.releasePointerCapture?.(event.pointerId);
        dragState = null;
        panel.classList.remove('phone-ext--dragging');

        const rect = panel.getBoundingClientRect();
        settings.window.left = rect.left;
        settings.window.top = rect.top;
        onPositionChange({ left: rect.left, top: rect.top });
    }

    panel.addEventListener('pointerdown', bringToFront);
    dragHandle.addEventListener('pointerdown', startDrag);
    dragHandle.addEventListener('pointermove', moveDrag);
    dragHandle.addEventListener('pointerup', endDrag);
    dragHandle.addEventListener('pointercancel', endDrag);

    panel.addEventListener('click', (event) => {
        const appButton = event.target.closest('[data-phone-app]');
        if (appButton) {
            openApp(appButton.dataset.phoneApp);
            return;
        }

        const actionButton = event.target.closest('[data-phone-action]');
        const action = actionButton?.dataset.phoneAction;
        if (action === 'close') {
            close();
        } else if (action === 'back') {
            if (activeAppController?.back?.()) {
                return;
            }

            showHome();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
            close();
        }
    });

    window.addEventListener('resize', () => {
        if (panel.hidden || mediaQuery.matches || panel.style.transform !== 'none') {
            return;
        }

        const rect = panel.getBoundingClientRect();
        const position = clampToViewport(rect.left, rect.top);
        panel.style.left = `${position.left}px`;
        panel.style.top = `${position.top}px`;
    });

    return {
        element: panel,
        open,
        close,
        showHome,
    };
}
