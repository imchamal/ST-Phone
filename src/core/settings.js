const MODULE_KEY = 'phone';
const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    window: {
        left: null,
        top: null,
    },
});

let memorySettings = cloneDefaults();

function cloneDefaults() {
    return {
        schemaVersion: DEFAULT_SETTINGS.schemaVersion,
        window: { ...DEFAULT_SETTINGS.window },
    };
}

function getContext() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function normalizeSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const sourceWindow = source.window && typeof source.window === 'object' ? source.window : {};

    return {
        schemaVersion: SCHEMA_VERSION,
        window: {
            left: Number.isFinite(sourceWindow.left) ? sourceWindow.left : null,
            top: Number.isFinite(sourceWindow.top) ? sourceWindow.top : null,
        },
    };
}

/**
 * Loads the extension's server-backed settings when SillyTavern exposes them.
 */
export function loadPhoneSettings() {
    const context = getContext();
    if (!context?.extensionSettings) {
        return memorySettings;
    }

    const hadSettings = Boolean(context.extensionSettings[MODULE_KEY]);
    const normalized = normalizeSettings(context.extensionSettings[MODULE_KEY]);
    context.extensionSettings[MODULE_KEY] = normalized;
    memorySettings = normalized;

    if (!hadSettings) {
        context.saveSettingsDebounced?.();
    }

    return normalized;
}

/**
 * Persists the last desktop position. Mobile layout intentionally ignores it.
 * @param {{left: number, top: number}} position
 */
export function saveWindowPosition(position) {
    if (!Number.isFinite(position?.left) || !Number.isFinite(position?.top)) {
        return;
    }

    memorySettings.window = {
        left: Math.round(position.left),
        top: Math.round(position.top),
    };

    const context = getContext();
    if (!context?.extensionSettings) {
        return;
    }

    const current = normalizeSettings(context.extensionSettings[MODULE_KEY]);
    current.window = { ...memorySettings.window };
    context.extensionSettings[MODULE_KEY] = current;
    context.saveSettingsDebounced?.();
}
