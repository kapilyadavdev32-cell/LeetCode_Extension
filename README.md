# LeetCode Sidekick

A Chrome Manifest V3 side-panel coding assistant. It detects the current LeetCode problem, lets you choose which code snapshot to share, and uses the Mistral Conversations API directly from the extension. The Mistral API key, chat messages, and Mistral conversation IDs are stored in `chrome.storage.local` in this browser. Chat history is not synced between devices.

## Requirements

- Chrome 116 or later.
- A Mistral API key with API access. Create one in [Mistral Studio](https://console.mistral.ai/api-keys).

## Install and configure

1. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
2. Select this project folder.
3. Open **Settings**, paste your Mistral API key, and choose **Save key**. Use **Test key** to verify it against Mistral's Models API.
4. Open a LeetCode problem and click the extension icon.

## Extension files

These are the project files that make up or support the Chrome extension. Backend and `vendor/` files are not listed here.

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension configuration: permissions, LeetCode and Mistral access, the background service worker, side panel, and settings page. Chrome reads this file when loading the extension. |
| `background.js` | Runs as the extension service worker. Configures the side panel to open when the toolbar icon is clicked. |
| `content.js` | Runs on LeetCode pages. Reads the visible problem details, editor language, code, and submission output, then responds to requests from the side panel. |
| `sidepanel.html` | Defines the side panel interface and loads its styles, scripts, and locally bundled Markdown, math, and code-highlighting libraries. |
| `sidepanel.css` | Styles the chat interface, message list, controls, and responsive layout. |
| `sidepanel.js` | Implements chat behavior: loads and switches chats, sends prompts, selects code context, renders answers, and handles chat actions. |
| `chat-store.js` | Saves and retrieves chat transcripts, metadata, shared code snapshots, and conversation IDs in Chrome local storage. |
| `mistral.js` | Handles Mistral API requests, API-key storage, conversation creation and deletion, and key checks. |
| `options.html` | Markup for the extension's settings page. |
| `options.css` | Styles the settings page. |
| `options.js` | Saves, tests, and removes the Mistral API key through the settings page. |
| `package.json` | Defines the local development test command and metadata for rendering-library dependencies. |
| `package-lock.json` | Locks dependency versions for repeatable local installs. |
| `test/chat-store.test.js` | Tests chat storage behavior using a mocked Chrome storage API. |
| `test/markdown-rendering.test.js` | Tests Markdown, math, and code rendering behavior used by the side panel. |
| `README.md` | Project overview, setup instructions, feature notes, and this file guide. |

The extension uses the official [Conversations API](https://docs.mistral.ai/api/endpoint/beta/conversations) with the `mistral-medium-latest` model and does not create Agents. Request and response shapes follow Mistral's [TypeScript SDK](https://docs.mistral.ai/resources/sdks).

## Chat features

- Custom Chat, Debug Code, Hint on Code, Full Solution, Complexity Analysis, and additional coding quick actions.
- Separate persistent Mistral conversations per local chat. A conversation is created on the first message; its ID is stored with that chat and reused on later messages.
- New Chat, Clear Chat, Forget Code, Delete Chat, saved-chat switching, and restoration from Chrome storage after the side panel or browser restarts.
- Code sharing choices: Previously Shared Code, Updated Code, or No Code. Unchanged code is identified by SHA-256 hash; prompt context is updated when the LeetCode problem changes.
- Problem title, URL, description, editor language, visible code, and visible submission output detection. Hidden tests and internal LeetCode data are not accessible.

Clearing or deleting a chat also deletes its Mistral conversation. Forget Code deletes the Mistral conversation and clears the saved code snapshot while retaining the visible transcript; the next request starts a new AI conversation and does not replay that transcript.

Chat history stored by an older backend installation is not imported automatically. Existing backend files are not needed to run the extension.

## Development checks

Run `npm test` for the extension tests. Extension scripts can be syntax-checked with `node --check <file>`.

AI responses can be inaccurate; verify and test suggested code.
