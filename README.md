# Phone

`Phone` is a basic virtual-phone shell for SillyTavern. Version 0.1.0 focuses only on navigation and responsive UI so that messaging and AI features can be added without rebuilding the foundation.

## Features

- Opens from the SillyTavern magic-wand Extensions menu as **Phone**
- Maintains a single Phone window instead of creating duplicates
- Draggable desktop phone window with a saved position
- Full-screen mobile layout with iPhone safe-area support
- Live status-bar and home-screen clock
- Home screen, dock, and placeholder apps
- Back, Home, Close, and Escape-key navigation
- Isolated, prefixed CSS that avoids changing the main SillyTavern UI
- No external assets, dependencies, or build step

## Included placeholder apps

- Phone
- Messages
- Contacts
- Gallery
- Notes

The placeholder apps do not yet connect to SillyTavern chats or AI generation.

## Installation

### From a Git repository

1. Upload this folder to a Git repository.
2. In SillyTavern, open **Extensions**.
3. Choose **Install Extension**.
4. Paste the repository URL and install it.
5. Reload SillyTavern if the menu entry does not appear immediately.

### Manual installation

Extract the `Phone` folder into:

`data/<user-handle>/extensions/Phone`

Then reload SillyTavern.

## Usage

1. Open the magic-wand Extensions menu.
2. Select **Phone**.
3. On desktop, drag the top `Phone` bar to move the window.
4. Select an app icon to open its placeholder screen.
5. Use Back, Home, the home indicator, or Close to navigate.

## Project structure

- `index.js`: SillyTavern menu integration and extension startup
- `style.css`: desktop and mobile shell styling
- `src/core/settings.js`: extension setting persistence
- `src/core/app-registry.js`: app definitions
- `src/ui/phone-shell.js`: phone shell rendering and interaction

## Current scope

This release intentionally does not include lock screen, notifications, messaging, contacts data, AI generation, calls, gallery storage, resizing, or minimization.
