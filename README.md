# Prism

A local API client for HTTP, gRPC, MCP, and OpenAI-compatible services, with a React interface and Go backend.

## Run

Use Go 1.26 or newer and Node.js 22.18 or newer.

```sh
npm install
npm run build
go run ./cmd/prism -server
```

Open the local address printed by the server (normally `http://localhost:9999`). Omit `-server` to open the browser automatically. For frontend development, run `task run:server` and `task run:client` (the Vite dev server) in separate terminals.

The desktop app can be built with `task build:app` and launched with `task run:app`; `task --list` shows the run, test, install and release tasks. The tracked `dist` directory contains the frontend embedded into Go builds, so rebuild it after frontend changes.

## Requests

- Requests autosave independently of execution history. Name and switch between drafts in the Requests sidebar; each send creates a separate history entry.
- Click the Send icon, press Enter in the address bar, or use Cmd/Ctrl+Enter. The button becomes Cancel while that request runs. Other drafts can run independently.
- HTTP requests time out after 30 seconds by default. Change the timeout in the request options; `0` keeps the request open until completion or cancellation. Streaming responses appear as data arrives.
- The URL and Params editor stay synchronized, including duplicate keys and disabled parameters. Switching body formats preserves their contents.
- Binary and multipart attachments up to 8 MiB each are saved with the request. Larger attachments can be sent, but must be reattached after reloading. Missing attachments block sending. Following redirects requires buffering the request body, limited to 64 MiB; disable redirect following for larger bodies.
- The backend executes the selected HTTP method, including OPTIONS and GET requests with bodies. Cookies are kept in an upstream cookie jar for the running server session, and Set-Cookie headers appear in the response inspector. Restarting the server clears the jar.

## Local storage

Drafts, history, and workspace selection are stored in `~/.local/share/prism`. Set `PRISM_DATA_DIR` to use another directory.

Saved data, including credentials across all protocols, is encrypted with AES-256-GCM using a workspace key in `.key`. Files use owner-only permissions (`0600`) and directories use `0700` on systems supporting Unix permissions. Existing plaintext JSON is migrated when loaded. This is local file encryption; the key is stored alongside the data.

Back up the entire workspace directory, including `.key`. Encrypted requests cannot be recovered without that key. Save failures appear in the interface; Retry save retries failed drafts and execution records without sending the requests again.

## Checks

```sh
npm run lint
npm test
npm run build
go test ./...
npx playwright install chromium
npm run test:browser
```

The browser tests build the frontend and run against a temporary workspace and local upstream fixtures. They do not use personal saved requests or external API credentials.
