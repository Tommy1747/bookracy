# Bookracy

Bookracy is a universal personal reading platform that enables users to discover books and documents across sources, read in-app or offline, convert EPUB documents to PDF, and manage a personal library.

## Repository Architecture

The monorepo contains three subprojects managed via a `pnpm` workspace:

- `backend-worker/`: Cloudflare Worker API providing book search, metadata, and backup infrastructure.
- `epub-converter/`: TypeScript EPUB-to-PDF conversion engine (`bookracy-convertor`).
- `frontend/`: React 19 / Vite single-page application and offline reader.

The frontend consumes `bookracy-convertor` locally via `file:../epub-converter`. Because TypeScript declaration files for the converter are emitted to `epub-converter/dist`, the converter must be built before compiling the frontend.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or higher required; e.g. `wrangler`, `miniflare`, and `@cloudflare/kv-asset-handler` require Node >= 22.0.0)
- [pnpm](https://pnpm.io/) (v10 or higher recommended)

## Dependency Installation

To install dependencies across all workspace subprojects from the root directory:

```bash
pnpm install
```

For strict CI / clean environments:

```bash
pnpm install --frozen-lockfile
```

## Root Orchestration Commands

The root `package.json` coordinates all tasks across subprojects in the required dependency order:

- **Build**:
  ```bash
  pnpm run build
  ```
  Builds `epub-converter` first (emitting bundles and TypeScript declarations to `dist/`), then compiles `frontend` (including the service worker), and validates `backend-worker` type safety.

- **Test**:
  ```bash
  pnpm test
  ```
  Runs the unit test suites for `epub-converter` and `backend-worker`.

- **Type-Check**:
  ```bash
  pnpm run typecheck
  ```
  Executes TypeScript checks (`tsc --noEmit` / build check) across all subprojects.

- **Lint**:
  ```bash
  pnpm run lint
  ```
  Runs ESLint across `epub-converter` and `frontend`.

## Running Subprojects Individually

You can work inside individual subproject folders as needed:

### Frontend (`frontend/`)

```bash
cd frontend
pnpm dev         # Start Vite local development server
pnpm build       # Build production web bundle (requires epub-converter built)
pnpm typecheck   # Typecheck frontend code
pnpm lint        # Run ESLint on frontend
```

### EPUB Converter (`epub-converter/`)

```bash
cd epub-converter
pnpm dev         # Start local preview server
pnpm build       # Compile library and generate TypeScript declarations
pnpm test        # Run unit tests
pnpm lint        # Run ESLint
```

### Backend Worker (`backend-worker/`)

```bash
cd backend-worker
pnpm dev         # Start local Cloudflare Worker development with Wrangler
pnpm test        # Run API unit tests
pnpm typecheck   # Typecheck backend code
pnpm deploy      # Deploy Worker to Cloudflare
```
