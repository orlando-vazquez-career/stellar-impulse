# Public browser deployment

The web client runs on Vercel and connects directly to the Colyseus server on
Railway over HTTPS and WebSocket Secure. Keep the workspace root as the build
context for both services; the apps import the shared packages.

## Frontend

`vercel.json` builds `@impulso/web` and publishes `apps/web/dist`. Use the Node 24
runtime supported by the repository and the pnpm version in `package.json`.
Set `VITE_SERVER_URL` to the public HTTPS URL of the Railway service before
building. This variable is embedded into the browser bundle.

The production URL must be publicly accessible. `/visual` opens the same app as
`/`. No custom domain or browser extension is required to train against the AI.
The optional wallet action requires Freighter.

## Backend

`railway.json` defines the build, start command and `/health` health check.
Configure one replica and these service variables:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | `2567` |
| `WEB_ORIGIN` | Exact public frontend origin, without a trailing slash |
| `AUTH_DATA_FILE` | `/data/users.json` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the project's Postgres service) |
| `RAILPACK_NODE_VERSION` | `24.19.0` |
| `RAILPACK_DEPLOY_APT_PACKAGES` | `openssl libatomic1` |

`RAILPACK_DEPLOY_APT_PACKAGES` replaces the runtime packages Railpack would
install, it does not add to them. Prisma needs `openssl`, and the pnpm 11 binary
that starts the server needs `libatomic1`, which Railpack installs by default.
Keep both in the list. Without `libatomic1` the container exits before the
server starts (`pnpm: error while loading shared libraries: libatomic.so.1`) and
restarts in a loop. Railway's edge then answers every request with 502
`Application failed to respond`, without CORS headers, and the browser reports
login and registration failures as CORS errors. This happened from 8 to
9 October 2026, after `openssl` was added for Prisma.

Pending review: Railway marked those deployments as successful about eight
seconds after the container started, although the server never listened. The
service configuration in Railway showed no health check path, while
`railway.json` defines `/health`. The service also sets `RAILPACK_BUILD_CMD`
and `RAILPACK_START_CMD` in the dashboard. Check which source Railway applies
before relying on the health check to stop a broken deployment.

### Accounts in Postgres

With `DATABASE_URL` set, accounts, XP, achievements (challenges and merit emblems),
best marks and every match result live in Postgres. The start command runs
`prisma migrate deploy` before the server listens. On the first start against an
empty database the server imports the accounts in `AUTH_DATA_FILE`, progress
included, and logs `[accounts] imported N accounts`; later starts skip the import.
`/health` then reports `storage: "postgres"`. Keep the `/data` volume until that
import has been checked; afterwards the file is no longer written.

Mount a persistent Railway volume at `/data` before creating accounts. The file
contains salted password hashes, never plaintext passwords. The server keeps the
previous version next to it as `/data/users.json.bak` and loads it if the main
file is unreadable; back up both files together. `/health` reports
`persistent: true` when `AUTH_DATA_FILE` is set. Keep the volume
attached during redeployments. Match state and session tokens are held in memory;
restarting the server ends matches and requires users to sign in again.

When a new deployment replaces the previous one, Railway sends SIGTERM to the old
container's PID 1: pnpm, running `pnpm --filter @impulso/server start`. pnpm
forwards it to the server, which closes its rooms (clients receive close code
4001) and exits with code 0. Two settings keep that chain intact; keep both.
`shellEmulator: true` in `pnpm-workspace.yaml` makes pnpm start the server
directly: with `sh -c` (dash) in between, the shell died on the signal, pnpm
exited 1 and Railway marked the old deployment as failed. The start script uses
`node --import tsx` because the tsx CLI kills the server with SIGKILL when it
does not acknowledge a forwarded signal within 30 ms.

## Accounts

The account identifier is an email address. Provision demo accounts through
`POST /auth/register` with a JSON body containing `email` and `password`. A new
password needs 8 to 128 characters, a lowercase letter, an uppercase letter and
a symbol (any character that is not a letter, accent mark or digit); otherwise
registration answers `400 { "error": "weak_password" }`. Login does not apply
the rule, so accounts created before it keep signing in. Keep
credentials outside the repository and deployment bundle. The browser signs in
through `/auth/login`, restores sessions through `/auth/me`, and revokes them
through `/auth/logout`.

Guest training remains available. The visible room-code lobby is still a local
prototype; account login does not turn that screen into the private campaign
multiplayer client.

## Release verification

Run `pnpm check` and `pnpm test:e2e` before release. After deploying, check the
public frontend without provider authentication, verify `/health`, sign in with
a demo account, reload, launch an Espiral training match, build a ship and sign
out. Verify accounts survive a backend restart while old sessions are rejected.
