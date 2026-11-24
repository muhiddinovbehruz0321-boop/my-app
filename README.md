# Breachline

Breachline is an original tactical-FPS prototype. Its visual identity, Ardent District blockout, weapon names, and interface are original; no Counter-Strike assets or code are used.

## What is implemented

- React + TypeScript + Vite command interface with Operations, Armory, Operator Profile, After Action, and Settings screens.
- A playable first-person 3D blockout in Three.js / React Three Fiber / Drei: mouse look with pointer lock on desktop, touch joystick/look/fire/action controls on phones, WASD, sprint, crouch, jump, boundary/cover collision, cover-occluded hitscan, four original bots, four distinct weapons, recoil, muzzle flashes, HUD, and plant/defuse objectives.
- A Capacitor Android project with original launcher branding. The same responsive web build serves desktop browsers and the Android WebView.
- Local preferences and a cosmetic finish selection persisted in browser storage.
- Express + TypeScript API foundation with Zod input checks, bcrypt password hashing, rate-limited registration/login, short-lived JWT bearer sessions, profile and explicitly **unverified local** match-record endpoints, and Prisma/PostgreSQL models.
- Authenticated Socket.IO lobby creation/joining and server-stepped movement snapshots with bounded inputs and alternating teams.
- Docker Compose PostgreSQL service and environment template.

This is a playable **vertical slice**, not a completed AAA game. Online mode cards clearly report that matchmaking is unavailable; the current 3D match is local practice and is not connected to the lobby simulation. The server-side socket lobby is a foundation, not a production authoritative match server.

## Architecture

```text
src/App.tsx                 Menu, settings, profile, inventory and match-history UI
src/game/Arena.tsx          R3F renderer, Ardent District, FPS controls, bots and HUD
src/services/api.ts         Typed browser API client
server/src/index.ts         Express REST API and authenticated Socket.IO lobby service
prisma/schema.prisma        PostgreSQL user and match models
docker-compose.yml          Local PostgreSQL
```

### Implementation plan and status

1. **Foundation — done:** TypeScript/Vite, React, R3F/Drei, Express, Socket.IO, Zod, Prisma, PostgreSQL Compose, and environment configuration.
2. **Menu and account UI — partial:** responsive navigation, settings, armory preview, profile/auth forms, and history page; account/history require a configured database.
3. **FPS controls — prototype done:** desktop pointer lock and keyboard controls, mobile virtual movement/look/actions, camera, jumping, crouch/sprint, map bounds, and cover collision.
4. **First map — blockout done:** original Ardent District with two marked sites, street surfaces, procedural sky, facade details, and route cover; still not production-quality 3D art.
5. **Combat — partial:** four selectable original weapons (carbine, sidearm, SMG, shotgun), separate magazines/reserves, reloads, spread, recoil, hitscan, muzzle flash, cover-aware hits, and HUD; no armor or game-audio pipeline.
6. **Bots — prototype partial:** four bots with line-of-sight checks, cover-aware movement, strafing, attacks, and firing effects; no navmesh, squad tactics, difficulty selection, or bomb behavior.
7. **Backend accounts/stats — implemented, unverified against a live DB:** registration, login, profile and local match history endpoints with Prisma/PostgreSQL. Client-reported practice results are never counted as trusted wins or rating.
8. **Multiplayer — foundation only:** authenticated lobby events and server-clamped movement snapshots; no client lobby UI, live player rendering, authoritative combat/rounds, matchmaking, reconnect flow, or anti-cheat system.
9. **Inventory/audio — partial:** local original finish selection and volume preference; persistent database inventory and game audio are not implemented.
10. **Verification — web build and Android asset sync pass:** a native Gradle build, device playtest, live PostgreSQL migration, and multi-client network test still need to be run in their target environments.

## Requirements

- Node.js 20.19+ for the web build (Node 22 recommended); Capacitor Android commands require Node 22+
- Docker Desktop with Compose, or a separately running PostgreSQL 16 instance
- Android Studio and its Android SDK are only needed for native Android builds

## Local setup (PowerShell)

Run commands from this project directory (`my-app`):

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace `JWT_SECRET` with a random value of at least 32 characters. To generate one:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start PostgreSQL, install packages, generate Prisma Client, and apply the initial migration:

```powershell
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
```

The checked-in initial migration creates the account and match tables. For an existing managed PostgreSQL database, set `DATABASE_URL` in `.env` and run the same Prisma commands without Docker.

Start both Vite and the API:

```powershell
npm run dev:all
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). To run only one process, use `npm run dev` for the frontend or `npm run dev:server` for the API. The frontend proxies `/api` and `/socket.io` to `http://localhost:3001` in development.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | Private signing secret; use a unique random 32+ character value |
| `PORT` | API port (default `3001`) |
| `FRONTEND_URL` | Allowed browser origin for API and Socket.IO CORS |
| `VITE_API_URL` | Optional API origin override; leave empty to use the Vite development proxy |

Never commit `.env`. `.env.example` contains development-only database credentials and a placeholder JWT secret; replace the secret before exposing the API.

## Controls

- **W / A / S / D:** move; **mouse:** aim; **left click:** fire
- **Shift:** sprint; **C** or **Ctrl:** crouch; **Space:** jump
- **R:** reload; **1–4:** equip carbine/sidearm/SMG/shotgun; **E:** plant at a nearby site; **F:** hold to defuse at the planted site
- **Phone:** left virtual joystick to move, drag the right side to aim, and use the on-screen action buttons
- Click **Leave Match** or press **Escape** to release pointer lock.

Training disables bot damage and the objective. Practice is a local round against four bots.

## Android build (pre-release)

The Android wrapper uses the provisional application ID `com.breachline.tactical`. Confirm the final ID before publishing because Play Store application IDs cannot be changed after release.

```powershell
npm install
npm run android:sync
npm run android:open
```

In Android Studio, install the Android SDK required by the generated Gradle project, then build and test on a real phone. This environment has no Java/Android SDK, so a native APK/AAB build has not been verified here. A Play Store release also needs a developer account, a securely managed upload key, store listing assets, a privacy/data-safety declaration, and a production API if account features are to be enabled. Do not commit signing keys or send them in chat.

## Build and verification

```powershell
npm run build
npm run lint
npm run typecheck:server
npm test
npx prisma validate
```

`npm run build` type-checks and builds the browser app and compiles the API to `dist-server`. Start the compiled API with `npm run start:server` after setting production environment variables and applying migrations. Serve the generated `dist` directory with a static web server; configure `VITE_API_URL` to the API origin at build time when not using the development proxy.

## Known gaps

- Competitive, casual and deathmatch matchmaking are intentionally unavailable in this slice.
- Android touch input and Capacitor asset sync are implemented, but device testing, signed AAB generation, and Play Console submission are still outstanding.
- No complete round/team system, player armor, additional maps, game sound assets, player inventory persistence, Redis, or production anti-cheat.
- The Socket.IO lobby does not yet feed the rendered game; movement snapshots are not equivalent to a complete authoritative FPS simulation.
- PostgreSQL connection, Prisma migration, registration/login persistence, and multi-client synchronization require running their respective local services and have not been claimed as tested here. Local match reports are explicitly unverified and do not update trusted profile stats.
