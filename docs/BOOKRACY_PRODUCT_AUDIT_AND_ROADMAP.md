# Bookracy Comprehensive Product and Technical Audit & Roadmap

## 1. Executive Summary

Bookracy is a universal personal reading and book discovery platform designed to aggregate external book repositories, provide offline reading in the browser, convert EPUB documents to PDF, and support community uploads with multi-device cloud synchronization.

This audit evaluates the entire Bookracy codebase—comprising the Cloudflare Worker backend (`backend-worker`), the client-side EPUB-to-PDF conversion library (`epub-converter`), and the React 19 single-page application (`frontend`).

### Key Findings
1. **Multi-Tiered Backend Architecture [Verified]**: The backend (`backend-worker/src/index.ts`) implements resilient failover across multiple book sources (Library Genesis 5-mirror racing, Anna's Archive scraping, Standard Ebooks OPDS). A local SQLite/D1 database (`search_index_fts`) provides diacritic-insensitive FTS5 fallback when external providers fail. Downloaded files are cached in Cloudflare R2 and replicated via Cloudflare Queues into Telegram and Discord chunked backup storage (`backend-worker/src/storage/backup.ts`).
2. **EPUB-Centric Reading Experience [Verified]**: The in-app reader (`frontend/src/components/epub-reader/epub-reader.tsx`) uses `epubjs` and is strictly limited to EPUB files. Other formats (PDF, CBZ, CBR, TXT) have no in-app reading viewer; PDFs are opened in a browser new tab via `<OpenPdfButton>` (`frontend/src/components/books/open-pdf-button.tsx`).
3. **IndexedDB Offline Storage [Verified]**: The offline library (`frontend/src/lib/offline-books.ts`) stores book binary blobs and metadata records in browser IndexedDB (`bookracy-offline` v2). However, personal library organization lacks nested folders, tagging, full-text document search, and reading status tracking (Want to Read / Currently Reading / Finished).
4. **Security & Authentication Model [Verified]**: User sync accounts rely on a 64-character hex bearer token (`backend-worker/src/index.ts:genAccountId`). Accounts contain no email or password. Metadata blobs are stored unencrypted in Cloudflare KV (`SYNC` namespace); the backend does not provide zero-knowledge end-to-end encryption. Community uploads enforce server-side streaming MD5 checks and container magic-byte verification, but do not execute deep archive inspection (ZIP bomb detection) or antivirus scanning.
5. **Monorepo Build Coupling [Verified]**: `frontend/package.json` depends on `bookracy-convertor` via `file:../epub-converter`. Running `pnpm build` in `frontend` without first running `pnpm build` in `epub-converter` causes TypeScript compilation failures due to missing module declarations.

---

## 2. Existing Architecture

The repository is structured into three subprojects without a root workspace configuration:

```
bookracy/
├── backend-worker/     # Cloudflare Worker API & Edge Proxy
│   ├── src/            # Routing, scrapers, rate limiting, backups, search index
│   ├── migrations/     # Cloudflare D1 SQL schemas (community, moderation, FTS)
│   ├── scripts/        # Awards dataset builder and live provider tests
│   └── tests/          # Node.js built-in test runner test suite (148 tests)
├── epub-converter/     # Client-side EPUB-to-PDF conversion library
│   ├── src/            # jsPDF, JSZip, CSS/XML parsing, layout engine
│   └── tests/          # Node.js test runner unit tests with tsx (18 tests)
└── frontend/           # Modern React SPA
    ├── src/
    │   ├── api/        # TanStack Query options & ofetch client
    │   ├── components/ # Radix UI, Lucide icons, reader, bookshelf, community
    │   ├── hooks/      # SEO, reading pace, speech, layout
    │   ├── lib/        # IndexedDB offline store, sync engine, web worker
    │   ├── routes/     # TanStack Router file-based routes
    │   ├── stores/     # Zustand stores with localStorage persistence
    │   └── sw/         # Service worker for offline asset caching
    └── public/         # Manifest, icons, sitemaps, Noto Sans TTF fallback fonts
```

### Architectural Evidence & Verification Table

| Component | Repository Path / Evidence | Verification Status | Architectural & Product Impact |
| :--- | :--- | :--- | :--- |
| **Worker Routing & Limiting** | `backend-worker/src/index.ts`, `backend-worker/wrangler.toml` | **Verified** | Enforces 7 rate-limiting namespaces (`SEARCH`, `MD5`, `METADATA`, `COVER`, `ACCOUNT_CREATE`, `UPLOAD`, `RATE_LIMITER`). Disables `workers.dev` to require custom domain edge protections. |
| **Multi-Provider Search** | `backend-worker/src/index.ts` (`searchSources`), `backend-worker/src/parse.ts` | **Verified** | Scrapes Anna's Archive; falls back to Library Genesis 5-mirror racing; falls back to D1 FTS5 (`search_index_fts`); falls back to Standard Ebooks / Open Library. |
| **D1 Database Schema** | `backend-worker/migrations/0001` - `0004` | **Verified** | Tables: `users`, `uploads`, `search_index`, `search_index_fts` (FTS5 external content table with unicode61 diacritic folding). |
| **Chunked Backup Queue** | `backend-worker/src/storage/backup.ts`, `backend-worker/src/resumable.ts` | **Verified** | Consumer pipes R2 files into 10 MB chunks across Telegram and Discord storage; DLQ consumer writes permanent failures to `backup-failed:{md5}` ledger. |
| **Client EPUB Engine** | `frontend/src/components/epub-reader/epub-reader.tsx`, `epub-view.tsx` | **Verified** | Wraps `epubjs`; supports custom font size, font family, line height, themes (Light, Sepia, Dark, Slate), TOC sheet, and reading pace estimation. |
| **IndexedDB Offline Store** | `frontend/src/lib/offline-books.ts` | **Verified** | Database `bookracy-offline` (v2) stores metadata in `books` object store and binary payloads in `blobs` object store. Calls `navigator.storage.persist()`. |
| **EPUB to PDF Converter** | `epub-converter/src/buildPdf.ts`, `frontend/src/lib/epub-to-pdf.worker.ts` | **Verified** | Flate compression, font sniffing (TTF/OTF vs WOFF), outline bookmarks, Noto Sans fallback for non-Latin glyphs. Executed inside Web Worker. |
| **Cloud Sync Client** | `frontend/src/lib/sync/cloud.ts`, `frontend/src/stores/sync.ts` | **Verified** | Merges bookmarks, folders, reading progress, and settings to `/api/account` using 64-hex bearer key; unencrypted JSON payload in KV. |

---

## 3. Current Feature Inventory

The following classification reflects directly verified repository capabilities:
- **Implemented and working**: Fully functioning in code, backed by tests or verified logic.
- **Implemented but needs improvement**: Works, but has usability, scale, or UX gaps.
- **Partially implemented**: Basic primitives exist, but major features or flows are missing.
- **Missing**: No implementation exists in the repository.
- **Not currently practical**: Technically infeasible under current architectural boundaries.
- **Not recommended**: Counter to security, privacy, or product positioning.

| Feature Domain | Capability | Status | Implementation Evidence | Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Discovery & Search** | Keyword Search | **Implemented & working** | `backend-worker/src/index.ts:searchSources` | **Verified:** Scrapes AA, races LibGen, queries FTS5 index. |
| | Search Suggestions | **Implemented & working** | `backend-worker/src/apple.ts:searchHints` | **Verified:** Proxies Apple Books `MZSearchHints` with debounce. |
| | Faceted Filtering | **Implemented & working** | `backend-worker/src/index.ts:filterResults` | **Verified:** In-memory filtering by language and extension. |
| | Curated Booklists | **Implemented & working** | `frontend/src/routes/recommendations.*.tsx` | **Verified:** The Greatest Books, African Canon, 2000s, Marvel/DC reading orders. |
| | Nonfiction Awards | **Implemented & working** | `backend-worker/src/awards.ts` | **Verified:** Flat text dataset (`awards.dataset`) parsed into prize lists. |
| **Reader Experience** | In-Browser EPUB Reader | **Implemented & working** | `frontend/src/components/epub-reader/` | **Verified:** `epubjs` with themes, fonts, margins, TOC, progress. |
| | PDF In-Browser Reader | **Missing** | `frontend/src/components/books/open-pdf-button.tsx` | **Verified:** Only opens in a browser new tab; no in-app PDF viewer. |
| | Manga / Comic Reader | **Missing** | None (formats recognized in filters only) | **Verified:** No CBZ/CBR viewer exists in frontend. |
| | Plain Text (.txt) Reader | **Missing** | None | **Verified:** No text viewer exists in frontend. |
| | Highlights & Annotations | **Missing** | None | **Verified:** No highlight store or rendition annotation listeners. |
| | In-Book Full-Text Search | **Missing** | None | **Verified:** No spine search in reader component. |
| **EPUB Converter** | Client-Side PDF Generation | **Implemented & working** | `epub-converter/src/buildPdf.ts` | **Verified:** 18 passing tests; Flate compression, font sniffing. |
| | Batch Conversion | **Missing** | None | **Verified:** Only single-item conversion triggered from cards. |
| | Custom Page Geometry | **Partially implemented** | Hardcoded A4 in `buildPdf.ts` | **Verified:** Engine lacks user-configurable margins/sizes. |
| **Personal Library** | IndexedDB Offline Storage | **Implemented & working** | `frontend/src/lib/offline-books.ts` | **Verified:** v2 schema with separate `blobs` and `books` stores. |
| | Local File Ingestion | **Implemented & working** | `frontend/src/lib/import-local-book.ts` | **Verified:** Imports local EPUBs, computes MD5, extracts cover. |
| | Shelf Folders | **Implemented but needs improvement** | `frontend/src/stores/bookmarks.ts` | **Verified:** Single-level colored folders; no tags or nested shelves. |
| | Reading Status Triage | **Partially implemented** | `frontend/src/stores/progress.ts` | **Verified:** Tracks reading progress; no Want/Reading/Read shelves. |
| | Duplicate Detection | **Missing** | None | **Verified:** No duplicate checking during local file import. |
| | Metadata Editing | **Missing** | None | **Verified:** Users cannot edit title, author, or cover locally. |
| **Cloud Sync** | Device Synchronization | **Implemented & working** | `frontend/src/lib/sync/cloud.ts` | **Verified:** Syncs bookmarks, folders, progress to Cloudflare KV. |
| **Community** | Uploads & Leaderboard | **Implemented & working** | `backend-worker/src/community.ts` | **Verified:** D1 metadata, R2 storage, streaming MD5 checks. |
| | Content Moderation | **Implemented & working** | `backend-worker/src/index.ts:handleAdmin` | **Verified:** User bans, suspensions, upload deletions, takedowns. |
| **AI Capabilities** | AI Reading Assistant | **Missing** | None | **Verified:** No AI integrations in frontend or backend. |

---

## 4. Technical Audit

### Code Quality & Architecture
- **Modularity [Verified]**: Clean boundary separation between `backend-worker`, `epub-converter`, and `frontend`. The backend leverages structured submodules (`reliability.ts`, `concurrency.ts`, `searchindex.ts`, `storage/backup.ts`).
- **Concurrency & Resource Management [Verified]**: `backend-worker/src/concurrency.ts` implements bounded execution with concurrency pools, avoiding Cloudflare subrequest exhaustion.
- **Edge Cache Invalidation [Verified]**: Cache API keys (`coverCacheKey`, `METADATA_CACHE_VERSION`) isolate edge cache entries and permit atomic invalidation on updates.

### Type Safety & Build Tooling
- **Strict Typing [Verified]**: TypeScript strict mode enabled across subprojects. Cloudflare Worker environment variables and bindings are typed via `Env` interface. Zod schemas validate backend API responses.
- **Monorepo Dependency Risk [Verified]**: `frontend/package.json` references `file:../epub-converter`. Running `pnpm build` in `frontend` without building `epub-converter` produces type declaration missing errors (`Cannot find module 'bookracy-convertor'`).
- **Linter Deprecations [Verified]**: ESLint v9 flat configurations report deprecated package warnings in `epub-converter` and `frontend`. Non-component exports in `filters.tsx` and `button.tsx` trigger Fast Refresh warnings.

### Performance & Responsiveness
- **Edge Efficiency [Verified]**: R2 caching eliminates egress costs for repeated downloads and book covers. D1 FTS5 external content virtual table provides fast text search with diacritic folding (`search_index_fts`).
- **Frontend Bundle Size [Verified]**: Vite bundle analysis demonstrates code splitting:
  - Core app chunk: ~287 KB gzipped.
  - EPUB converter worker: 858 KB uncompressed (offloaded from main thread).
  - Service worker: 1.96 KB gzipped.
- **Client Large Library Scalability [Verified / Inferred Limitation]**: `OfflineLibrary` (`frontend/src/components/downloads/offline-library.tsx`) renders books in an unvirtualized DOM grid. Managing libraries with >500 books will degrade rendering performance without virtualization.

### Testing Coverage
- **Backend Worker [Verified]**: 148 automated tests passing (`node --test`). Comprehensive coverage of URL parsing, stream resumption, FTS5 operator sanitization, mirror backoff, and takedown sets.
- **EPUB Converter [Verified]**: 18 automated tests passing (`node --import tsx --test`). Covers line wrapping, font sniffing, outline bookmarks, fallback fonts, and abort signals.
- **Frontend [Verified / Limitation]**: Currently lacks automated component, unit, or Playwright end-to-end browser tests. Testing is limited to static analysis (`tsc --noEmit`, `eslint src/`).

---

## 5. UX/UI Audit Across Reader Personas

### 1. Casual Ebook Reader
- **Current Experience [Verified]**: High usability. Fast search, book covers, Apple Books ratings and summaries, one-click EPUB reading in-browser.
- **Gaps [Verified]**: Missing page-turn animations, one-click font presets, and reading goals.

### 2. Manga and Comic Reader
- **Current Experience [Verified]**: Incomplete. Formats `.cbz` and `.cbr` appear in search filters, but cannot be read in the application. Clicking open offers only raw file download.
- **Gaps [Verified]**: Missing canvas/image archive reader, right-to-left manga page flow, and zoom controls.

### 3. Student
- **Current Experience [Verified]**: Moderate. EPUB-to-PDF conversion enables exporting documents. Academic papers in PDF can be downloaded.
- **Gaps [Verified]**: No in-app PDF viewing, text highlighting, margin notes, or copy-with-citation features.

### 4. Technical Reader
- **Current Experience [Verified]**: Suboptimal. Code listings inside technical EPUBs suffer from improper wrapping or monospace formatting degradation.
- **Gaps [Verified]**: Missing monospace font selector, code block styling, and table viewing mode.

### 5. Document Manager (Hundreds or Thousands of Documents)
- **Current Experience [Verified]**: Severely constrained. Offline library supports manual single-file imports, but lacks batch operations.
- **Gaps [Verified]**: No bulk directory import, multi-select tagging, nested folders, or full-text client search across stored documents.

### 6. Power User with Large Digital Library
- **Current Experience [Verified]**: Basic. Cloud sync backs up bookmarks, shelves, and reading progress across devices.
- **Gaps [Verified]**: No duplicate detection on import, no smart dynamic collections, no reading statistics dashboard, and no OPDS server feed for external e-ink readers.

---

## 6. Security and Privacy Audit

### Authentication & Account Security [Verified]
- **Key Generation & Storage**: Accounts are created via `POST /api/account` (`backend-worker/src/index.ts:handleAccount`), which mints a cryptographically random 64-character hex token (`crypto.getRandomValues(32)`).
- **Bearer Credential**: The 64-hex string is the user's sole credential. It is transmitted in the HTTP `Authorization: Bearer <token>` header over TLS.
- **Not Zero-Knowledge**: The system does **not** employ zero-knowledge client-side encryption. While contributor IDs are stored in D1 as `sha256(token)` to prevent credential leakage from database dumps, the user's synchronization blob is stored in plaintext JSON in Cloudflare KV (`SYNC` namespace: `acct:<token>`). The server can read all synchronized bookmarks, folder names, and reading progress.
- **Account Recovery & Loss**: There is no email, password reset, or recovery mechanism. If the bearer key is lost, access cannot be restored. If stolen, an attacker has full read/write/delete access to the sync account.
- **Bot Gate**: Account creation is rate-limited (`ACCOUNT_CREATE_LIMITER`, 5/60s) and gated by Cloudflare Turnstile when `TURNSTILE_SECRET` is configured.

### File Upload & Download Security [Verified]
- **Server-Side Enforcement**: Security boundaries are enforced server-side in `handleUploadCreate` (`backend-worker/src/index.ts`):
  - **MIME & Extension Allowlists**: Enforces `UPLOAD_EXT_ALLOW` (`epub`, `pdf`, `mobi`, `azw3`, `cbz`, `cbr`, `djvu`, `fb2`, `txt`, `doc`, `docx`, `rtf`).
  - **Content Integrity**: Body is streamed through a hashing transform stream; the computed MD5 must match the declared MD5 query parameter.
  - **Magic-Byte Signature Verification**: `isAllowedBookBytes` inspects leading bytes (e.g. `PK\x03\x04` for EPUB/CBZ, `%PDF` for PDF, `Rar!` for CBR). Rejects known executable headers (`MZ`, `ELF`, Mach-O).
  - **Payload Limits**: Rejects payloads exceeding `MAX_UPLOAD_BYTES` (default 100 MB).
- **Security Limitations & Archive Vulnerabilities [Verified]**:
  - The backend does **not** decompress or inspect archive internals on upload. It does not verify ZIP compression ratios (ZIP bomb vulnerability) or scan for path traversal within archives (`../../`).
  - The backend does not run antivirus or malware analysis on uploaded binary files.
  - Malformed EPUBs or PDFs could exploit parser vulnerabilities in downstream client readers (`epubjs`, browser PDF viewers).
- **Takedown Enforcement**: `takedown.isTakenDown` checks MD5s and title/author patterns before consulting caches or sources. Takedown matches trigger `purgeTakedown` to purge R2, KV, D1, and backup queues.

### Privacy & Third-Party Data Flows [Verified]
- **Search Query Exposure**: Uncached search queries are transmitted directly to external search providers (Anna's Archive and Library Genesis mirrors) via Cloudflare Worker egress.
- **Apple Metadata Lookups**: Book title and author queries are sent to Apple Books APIs (`amp-api.books.apple.com`, `search.itunes.apple.com`).
- **Cloudflare Infrastructure**: All cached files, covers, sync data, and D1 databases reside on Cloudflare infrastructure subject to Cloudflare terms and privacy policies.
- **Durable Backup Providers**: Books enqueued for durable backup are chunked and transmitted to third-party Telegram Bot API and Discord Webhook/Channel endpoints.

---

## 7. Feature Gap Analysis

| Feature Domain | Master Specification Requirement | Current Implementation State | Gap Classification | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Reading Formats** | EPUB Reader | Full in-app reader (`epubjs`) | Implemented & working | Polish typography & theme options |
| | PDF Reader | Browser new tab only | **Missing** | Implement embedded PDF.js reader |
| | CBZ/CBR Comic Reader | Format filter only | **Missing** | Build canvas-based archive viewer |
| | Plain Text (.txt) Reader | None | **Missing** | Build virtualized text document viewer |
| **Reader Features** | Reading Themes & Typography | 4 themes, font size slider | Implemented but needs improvement | Add line-height, letter spacing, font options |
| | Highlights & Notes | None | **Missing** | Implement CFI-based highlight engine |
| | In-Book Full-Text Search | None | **Missing** | Integrate `epubjs` spine text search |
| | Reading Progress & Pace | Measured pace, saves CFI | Implemented & working | Preserve stats in library view |
| **Personal Library** | Custom Shelves / Folders | Single-level colored folders | Implemented but needs improvement | Add nested folders & multi-tagging |
| | Reading Status Triage | Progress tracking only | Partially implemented | Add Want to Read / Finished shelves |
| | Bulk Ingestion | Single file import only | Partially implemented | Add folder drag-and-drop batch import |
| | Duplicate Detection | None | **Missing** | Detect duplicate MD5s and similar titles |
| | Metadata Management | None | **Missing** | Enable local editing of book metadata |
| **Conversion Engine** | Client EPUB to PDF | Web Worker jsPDF converter | Implemented & working | Add page geometry presets |
| | Batch Conversion | None | **Missing** | Queue multiple document conversions |
| **Offline & Sync** | IndexedDB Storage | v2 schema with blob store | Implemented & working | Add storage quota dashboard |
| | Multi-Device Cloud Sync | KV sync with bearer key | Implemented & working | Add optional client-side encryption |
| **AI Capabilities** | AI Reading Assistant | None | **Missing** | Design grounded client LLM API integration |
| **Community** | Uploads & Leaderboard | D1 metadata & R2 storage | Implemented & working | Add archive safety checks & reporting |

---

## 8. Prioritized Roadmap

Complexity Scale:
- **XS**: Very small (< 1 day)
- **S**: Small (1–3 days)
- **M**: Medium (1–2 weeks)
- **L**: Large (2–4 weeks)
- **XL**: Very large / architectural (> 4 weeks)

### Phase P0 — Critical Reliability, Security & Developer Foundation
*Objective: Solidify build tooling, eliminate developer friction, and harden external provider resilience.*

#### P0.1 Monorepo Build Orchestration & Dependency Alignment
- **Problem**: Building `frontend` fails on clean clones if `epub-converter` has not been compiled first, due to local `file:../epub-converter` dependency linkage.
- **User Value**: Ensures deterministic builds, eliminates CI/CD failures, simplifies developer onboarding.
- **Technical Complexity**: **S**
- **Dependencies**: None.
- **Prerequisite For**: All subsequent frontend and converter milestones.
- **Risks**: Package manager workspace compatibility.
- **Acceptance Criteria**: Running `pnpm run build` from repository root builds `epub-converter` before `frontend`; clean-clone build succeeds without errors.
- **Testing Requirements**: Automated build script verification on clean clone.

#### P0.2 Upstream Provider Outage UX & Degradation Signaling
- **Problem**: When external search mirrors (LibGen / AA) encounter CAPTCHAs or timeouts, users receive generic errors without clear context.
- **User Value**: Explains search degradation and automatically offers remembered FTS5 results.
- **Technical Complexity**: **M**
- **Dependencies**: Backend search endpoints.
- **Prerequisite For**: Search enhancements.
- **Risks**: Caching transient error responses.
- **Acceptance Criteria**: Frontend displays informative status banner when live providers fail; seamlessly presents cached/FTS5 results.
- **Testing Requirements**: Mocked 5xx/429 upstream tests; UI degradation verification.

#### P0.3 Server-Side Upload Archive Safety & Zip Bomb Guardrails
- **Problem**: Community uploads only check leading magic bytes. Archives are not inspected for path traversal or malicious decompression ratios.
- **User Value**: Protects the community library and user devices from corrupted or malicious archive payloads.
- **Technical Complexity**: **M**
- **Dependencies**: `handleUploadCreate`.
- **Prerequisite For**: Community expansion.
- **Risks**: Execution timeout within Cloudflare Worker 50ms CPU limits.
- **Acceptance Criteria**: Worker inspects ZIP central directory headers; rejects compression ratios > 100:1 and archive paths with `../`.
- **Testing Requirements**: Automated integration tests with malformed ZIPs and path traversal archives.

---

### Phase P1 — Core Reading Experience
*Objective: Make Bookracy an exceptional everyday reader across major reading formats.*

#### P1.1 Embedded PDF Reader with Progress Tracking
- **Problem**: PDFs currently open in a generic browser new tab via `<OpenPdfButton>`, losing reading position, theme consistency, and offline reader integration.
- **User Value**: Read PDFs inside Bookracy with page persistence, zoom, and consistent styling across desktop and mobile.
- **Technical Complexity**: **L**
- **Dependencies**: `pdfjs-dist`.
- **Prerequisite For**: Document annotations and AI reading assistant.
- **Risks**: High memory usage of large scanned PDF files on mobile browsers.
- **Acceptance Criteria**: In-app PDF reader modal/route supporting continuous scroll, page navigation, zoom, and IndexedDB progress persistence.
- **Testing Requirements**: Unit tests for PDF loader; cross-browser mobile rendering tests.

#### P1.2 Highlights, Annotations, and Reader Drawer
- **Problem**: Students and technical readers cannot highlight passages or record notes.
- **User Value**: Annotate text selections; review, export, and search personal notes.
- **Technical Complexity**: **M**
- **Dependencies**: `epubjs` rendition annotations API; P1.1 for PDF annotations.
- **Prerequisite For**: AI study notes and flashcard generation.
- **Risks**: CFI position drift across screen resizes or font changes.
- **Acceptance Criteria**: Text selection displays annotation menu; highlights persist in IndexedDB and synchronize via Cloud Sync.
- **Testing Requirements**: Annotation persistence tests; CFI stability tests.

#### P1.3 In-Book Full-Text Search
- **Problem**: Readers cannot search for characters, terms, or quotes within the active book.
- **User Value**: Fast navigation to relevant passages within long books.
- **Technical Complexity**: **M**
- **Dependencies**: Active reader component (`epubjs` spine / PDF.js text layer).
- **Prerequisite For**: None.
- **Risks**: Performance lag during client-side indexing of large books.
- **Acceptance Criteria**: Search bar in reader TOC sheet displays search results with surrounding excerpt snippets; clicking navigates directly.
- **Testing Requirements**: Benchmarks on 1000-page EPUB search.

#### P1.4 Reader Typography & Ergonomic Customization
- **Problem**: Limited typography options for users with dyslexia, astigmatism, or specific formatting preferences.
- **User Value**: Highly comfortable, accessible reading tailored to user needs.
- **Technical Complexity**: **S**
- **Dependencies**: `reader.ts` store.
- **Prerequisite For**: None.
- **Risks**: Style collisions with publisher-specified CSS.
- **Acceptance Criteria**: Sliders for line spacing, paragraph margins, letter spacing; font options including OpenDyslexic, Literata, and Fira Code.
- **Testing Requirements**: Appearance store state persistence unit tests.

---

### Phase P2 — Personal Library & Document Management
*Objective: Provide Calibre-grade organization, curation, and bulk management for large collections.*

#### P2.1 Reading Status Shelves (Want to Read / Currently Reading / Finished)
- **Problem**: Bookmarks only support folder assignment; users cannot triage reading state or track finished books.
- **User Value**: Structured reading management and goal tracking.
- **Technical Complexity**: **S**
- **Dependencies**: `bookmarks.ts` store schema migration.
- **Prerequisite For**: Reading statistics dashboard.
- **Risks**: Breaking backward compatibility with existing synced bookmark payloads.
- **Acceptance Criteria**: Formal reading status field; dedicated library views; automatic status transition when progress reaches 100%.
- **Testing Requirements**: Sync schema backward-compatibility migration tests.

#### P2.2 Bulk Document Import & Folder Ingestion
- **Problem**: Users with hundreds of existing ebooks must import them one by one.
- **User Value**: Effortless library migration from Calibre or local folders.
- **Technical Complexity**: **M**
- **Dependencies**: File System Access API / HTML directory input.
- **Prerequisite For**: Large-library document management.
- **Risks**: Browser memory exhaustion during mass file reads.
- **Acceptance Criteria**: Drag-and-drop folder import; sequential queue processing; progress bar with cancellation support.
- **Testing Requirements**: Batch import tests with 100+ files.

#### P2.3 Duplicate Detection & Metadata Editor
- **Problem**: Repeated downloads or imports create duplicate records; downloaded books often have incorrect titles or missing covers.
- **User Value**: Clean, uncluttered library catalog; ability to fix inaccurate metadata.
- **Technical Complexity**: **M**
- **Dependencies**: `offline-books.ts`.
- **Prerequisite For**: Smart collections.
- **Risks**: Divergence between local metadata and remote search index.
- **Acceptance Criteria**: Flags duplicate MD5s or high title/author similarity; edit dialog allows modifying title, author, and cover.
- **Testing Requirements**: String similarity matching unit tests; IndexedDB update tests.

#### P2.4 Tagging, Virtualized Lists & Smart Collections
- **Problem**: UI performance degrades with hundreds of books in DOM; single-level folders prevent flexible classification.
- **User Value**: Instant UI responsiveness in large libraries; multi-tag categorization; dynamic collections (e.g. "Unread Tech PDFs").
- **Technical Complexity**: **L**
- **Dependencies**: `@tanstack/react-virtual`.
- **Prerequisite For**: None.
- **Risks**: State synchronization complexity across filters.
- **Acceptance Criteria**: DOM virtualization renders 5,000+ items at 60fps; multi-tag assignment per book; dynamic smart filter queries.
- **Testing Requirements**: Rendering performance benchmarks with 2,000 synthetic items.

---

### Phase P3 — Advanced Reading Formats & Conversion
*Objective: Expand format support to manga, comics, text documents, and advanced PDF creation.*

#### P3.1 Comic & Manga Reader (CBZ & CBR)
- **Problem**: Comic fans cannot read `.cbz` or `.cbr` archives inside Bookracy.
- **User Value**: Native graphic novel and manga reading experience on mobile and desktop.
- **Technical Complexity**: **L**
- **Dependencies**: `jszip` (CBZ), unrar WebAssembly / pure JS (CBR).
- **Prerequisite For**: None.
- **Risks**: Memory footprint of uncompressed high-resolution comic pages.
- **Acceptance Criteria**: Image archive reader supporting Right-to-Left (manga) and Left-to-Right page turns, double-page landscape spreads, and fit-to-width scrolling.
- **Testing Requirements**: Memory leak profiling during 100-page archive paging.

#### P3.2 Plain Text (.txt) and Markdown (.md) Reader
- **Problem**: Documents in text or Markdown format cannot be opened in-app.
- **User Value**: Clean, distraction-free reading of notes, transcripts, and public domain text files.
- **Technical Complexity**: **S**
- **Dependencies**: Virtualized text display component.
- **Prerequisite For**: None.
- **Risks**: Large plain text files (>10 MB) blocking the main thread.
- **Acceptance Criteria**: In-app viewer with font and theme options, progress tracking, and text search.
- **Testing Requirements**: Large text file loading benchmarks.

#### P3.3 Advanced EPUB-to-PDF Conversion Profiles
- **Problem**: `bookracy-convertor` only generates fixed-dimension A4 PDFs with default margins.
- **User Value**: Create print-ready PDFs formatted specifically for e-ink readers (e.g., 6" screens) or paper printing.
- **Technical Complexity**: **M**
- **Dependencies**: `bookracy-convertor`.
- **Prerequisite For**: None.
- **Risks**: Pagination layout regressions across non-standard aspect ratios.
- **Acceptance Criteria**: Conversion modal offering presets (A4, A5, US Letter, 6-inch E-Reader), custom margins, and font scaling.
- **Testing Requirements**: Visual regression test comparing output across conversion profiles.

---

### Phase P4 — Bookracy AI Reading Assistant
*Objective: Context-grounded comprehension, learning, and research tools.*

#### P4.1 Privacy-First Passage Explanation & Vocabulary Lookup
- **Problem**: Technical and academic readers frequently encounter unfamiliar terminology or archaic passages.
- **User Value**: Instant contextual explanations without breaking reading immersion.
- **Technical Complexity**: **M**
- **Dependencies**: Reader selection toolbar; LLM provider (Cloudflare Workers AI or BYO API Key).
- **Prerequisite For**: Chapter summarization.
- **Risks**: Exposing book text to third parties; hallucinations.
- **Acceptance Criteria**: Selected text offers "Explain with AI"; prompt strictly grounds answer in excerpt context; supports user-configured API keys.
- **Testing Requirements**: Mocked LLM response tests; privacy opt-in verification.

#### P4.2 Chapter Summarization & Study Note Generator
- **Problem**: Students and readers returning to a book struggle to recall prior events or key arguments.
- **User Value**: Concise recaps of completed chapters; exportable study notes.
- **Technical Complexity**: **L**
- **Dependencies**: P4.1; EPUB text extraction.
- **Prerequisite For**: Cross-library knowledge search.
- **Risks**: Token limit overflow on long chapters.
- **Acceptance Criteria**: Generates chapter summaries with source passage citations; exportable as Markdown notes.
- **Testing Requirements**: Chunking and token truncation tests.

#### P4.3 Cross-Library Knowledge Search ("Ask Your Books")
- **Problem**: Readers cannot query factual knowledge across their collected books and papers.
- **User Value**: Powerful personal research assistant synthesizing information across a private digital library.
- **Technical Complexity**: **XL**
- **Dependencies**: Vector embeddings engine (Cloudflare Vectorize or local vector index).
- **Prerequisite For**: None.
- **Risks**: High storage and compute costs; indexing latency.
- **Acceptance Criteria**: Natural language questions return synthesized answers with direct citations linking to book passages.
- **Testing Requirements**: Precision and recall evaluation on test reference corpus.

---

### Phase P5 — Community & Ecosystem
*Objective: Expand community sharing, metadata curation, and external e-reader integrations.*

#### P5.1 Community Public Collections & Curated Lists
- **Problem**: Users cannot share their reading lists or discover lists curated by other readers.
- **User Value**: Rich community discovery and social recommendations.
- **Technical Complexity**: **M**
- **Dependencies**: Cloudflare D1 community schema additions.
- **Prerequisite For**: None.
- **Risks**: Spam and abuse in public collection titles/descriptions.
- **Acceptance Criteria**: Users can publish curated collections with custom notes; community browse route with search.
- **Testing Requirements**: D1 migration tests and moderation integration tests.

#### P5.2 Community Metadata Corrections
- **Problem**: Public domain or uploaded books often have incorrect titles, authors, or missing covers.
- **User Value**: Crowdsourced accuracy for the collective book catalog.
- **Technical Complexity**: **M**
- **Dependencies**: D1 moderation pipeline.
- **Prerequisite For**: None.
- **Risks**: Vandalism or malicious metadata overwriting.
- **Acceptance Criteria**: Contributors can propose edits; edits require admin review or trusted contributor status.
- **Testing Requirements**: Audit log and rollback tests.

#### P5.3 Authenticated OPDS Catalog Server
- **Problem**: Readers cannot browse their Bookracy cloud library from external dedicated e-readers (KOReader, Moon+ Reader).
- **User Value**: Access personal Bookracy books directly from dedicated e-ink hardware.
- **Technical Complexity**: **M**
- **Dependencies**: Backend Worker routing; user bearer authentication.
- **Prerequisite For**: None.
- **Risks**: Authentication leak over plaintext HTTP on older e-readers.
- **Acceptance Criteria**: Serves OPDS XML catalog of saved bookmarks and uploads, authenticated via bearer token.
- **Testing Requirements**: OPDS feed XML validation against KOReader client.

---

## 9. Recommended Technical Improvements

1. **Root-Level Workspace Orchestration**:
   Introduce a root `pnpm-workspace.yaml` and root `package.json` with coordinated build scripts:
   ```yaml
   packages:
     - 'backend-worker'
     - 'epub-converter'
     - 'frontend'
   ```
2. **Unified Reader Engine Architecture**:
   Refactor `EpubReader` into a decoupled reader harness (`ReaderShell`) with pluggable format engines:
   - `EpubEngine` (`epubjs`)
   - `PdfEngine` (`pdfjs-dist`)
   - `ComicEngine` (Canvas / WebGL image archive renderer)
   - `TextEngine` (Virtualized text renderer)
   Normalize reading position into `{ format, cfiOrPage, percentage, timestamp }`.
3. **DOM Virtualization for Offline Library**:
   Implement `@tanstack/react-virtual` in `frontend/src/components/downloads/offline-library.tsx` to ensure smooth scrolling and low memory usage when displaying hundreds of downloaded books.
4. **End-to-End Test Automation**:
   Deploy Playwright test harness in `frontend` covering reader loading, page turning, offline library persistence, and sync workflows.

---

## 10. Implementation Sequence & Milestones (P0 through P5)

```
+-------------------------------------------------------------------------+
| Milestone 1 (Foundation): P0 Build Orchestration & Safety               |
| - Root workspace build & test scripts                                   |
| - Upstream outage UX fallback alerts                                    |
| - Server-side upload archive safety (ZIP bomb / traversal checks)       |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Milestone 2 (Core Reading): P1 Multi-Format Reader & Annotations        |
| - Embedded PDF.js reader with progress tracking                         |
| - Text highlights, personal notes, and reader drawer                    |
| - In-book full-text search & typography controls                        |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Milestone 3 (Library): P2 Personal Library Management                   |
| - Reading status triage (Want to Read / Currently Reading / Finished)   |
| - Bulk folder import with batch queue                                   |
| - Duplicate detection, metadata editor & DOM virtualization             |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Milestone 4 (Comics & Formats): P3 Graphic Novels & Conversion          |
| - CBZ/CBR manga/comic viewer with RTL & double-page modes               |
| - Plain text / Markdown viewer                                          |
| - EPUB-to-PDF configurable page geometry profiles                       |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Milestone 5 (Intelligence): P4 AI Reading Assistant                     |
| - Passage explanation & contextual vocabulary                           |
| - Chapter summarization & study note generation                         |
| - Cross-library semantic search prototype                               |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Milestone 6 (Ecosystem): P5 Community & Integrations                    |
| - Public community collections & shared booklists                       |
| - Crowdsourced metadata correction pipeline                             |
| - Authenticated OPDS catalog server for external e-readers              |
+-------------------------------------------------------------------------+
```

### Detailed Milestone Specifications

#### Milestone 1: P0 Foundation & Safety
- **Objective**: Establish unified build infrastructure, upstream error transparency, and server-side upload safety.
- **Deliverables**: Root workspace build scripts; frontend error status banner for upstream outages; server-side ZIP header validation in `handleUploadCreate`.
- **Prerequisites**: None.
- **Exit Criteria**: Clean clone builds with `pnpm run build` without manual sequence steps; 100% of existing backend and converter tests pass.
- **Verification**: Clean clone verification; archive upload security integration tests.

#### Milestone 2: P1 Core Reading Experience
- **Objective**: Deliver in-app PDF reading and study annotation tools.
- **Deliverables**: Embedded PDF.js reader component; highlight and note storage in IndexedDB; in-book search sheet.
- **Prerequisites**: Milestone 1.
- **Exit Criteria**: Users can read EPUBs and PDFs with saved reading positions; annotations persist across browser sessions.
- **Verification**: Cross-format reading regression tests; mobile viewport testing.

#### Milestone 3: P2 Personal Library Management
- **Objective**: Enable seamless organization, bulk importing, and high-performance management for large libraries.
- **Deliverables**: Reading status triage shelves; bulk file import modal; metadata editor; virtualized library grid.
- **Prerequisites**: Milestone 2.
- **Exit Criteria**: 2,000-book libraries render at 60fps; bulk imports handle 100+ files without browser crashes.
- **Verification**: Benchmark rendering tests; duplicate detection unit tests.

#### Milestone 4: P3 Advanced Formats & Conversion
- **Objective**: Support graphic novels, plain text documents, and print-ready PDF generation.
- **Deliverables**: CBZ/CBR manga reader with RTL support; text document viewer; configurable EPUB-to-PDF conversion dialog.
- **Prerequisites**: Milestone 3.
- **Exit Criteria**: Comic archives render smoothly with double-page spread support; custom PDF profiles match target dimensions.
- **Verification**: Memory profiling on comic archive paging; PDF output geometry inspection.

#### Milestone 5: P4 Bookracy AI Reading Assistant
- **Objective**: Provide grounded reading comprehension and study tools.
- **Deliverables**: Passage explanation popover; chapter summarizer; optional BYO-API key configuration in Settings.
- **Prerequisites**: Milestone 2, Milestone 4.
- **Exit Criteria**: AI responses cite exact source excerpts; zero user data sent to external AI without explicit consent.
- **Verification**: Prompt grounding evaluation; privacy opt-in automated tests.

#### Milestone 6: P5 Community & Ecosystem
- **Objective**: Expand discovery, community curation, and external hardware connectivity.
- **Deliverables**: Community public booklists; metadata edit review pipeline; OPDS feed endpoint.
- **Prerequisites**: Milestone 3.
- **Exit Criteria**: External e-readers (KOReader) connect and download books via OPDS; community collections display on community page.
- **Verification**: OPDS feed validator; admin moderation integration tests.

---

## 11. Testing & Verification Strategy

### Existing Test Suites [Verified]
- **Backend Worker**: 148 automated unit and integration tests executing via Node.js test runner (`backend-worker/tests/`).
  - Covers LibGen search parsing, 5-mirror backoff, AA slow-download countdown extraction, chunked backup storage, FTS5 operator sanitization, and takedown sets.
  - Executed and passing: `pnpm test` in `backend-worker`.
- **EPUB Converter**: 18 automated unit tests executing via `tsx` and Node.js test runner (`epub-converter/tests/`).
  - Covers multi-page PDF generation, line wrapping, font sniffing, outline bookmarks, fallback font rendering, and abort signals.
  - Executed and passing: `pnpm test` in `epub-converter`.

### Recommended Future Testing Strategy
1. **Frontend Unit & Component Testing**:
   - Introduce Vitest and React Testing Library for store logic (`progress.ts`, `bookmarks.ts`, `sync.ts`) and reader utility functions.
2. **End-to-End Browser Testing**:
   - Implement Playwright test suite for critical user flows:
     - Search -> download -> open reader -> page turn -> save bookmark.
     - Offline persistence: verify books in IndexedDB load and render when browser network is disabled.
3. **Upload & Archive Security Testing**:
   - Create automated test cases submitting malformed ZIPs, excessive compression ratios (ZIP bombs), and path traversal payloads to `handleUploadCreate`.
4. **Large-Library Performance Testing**:
   - Automated benchmark loading 2,000 synthetic books into IndexedDB and measuring scroll FPS and memory retention.
5. **Accessibility Testing**:
   - Axe-core automated accessibility audits covering color contrast, keyboard navigation, and ARIA attributes in reader modals.

---

## 12. Risks and Dependencies Matrix

| Risk / Dependency | Impact | Probability | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **External Mirror Instability / Bot Challenges** | High | High | Multi-mirror racing, D1 FTS5 offline cache fallback, circuit breaking with exponential backoff, transparent UI degradation notices. |
| **IndexedDB Quota & Safari Eviction** | Medium | Medium | Proactive `navigator.storage.persist()` on first save; storage meter alerting user of quota usage. |
| **Archive Security & Malformed Payloads** | High | Medium | Server-side ZIP central directory validation; decompression ratio limits; MIME allowlisting. |
| **Large File Memory Spikes on Mobile** | High | Medium | Web Worker offloading for conversions and comic rendering; image tiling; DOM virtualization. |
| **Cloudflare Worker Execution Limits** | Medium | Low | Streaming bodies via `TransformStream`; offloading heavy background replication to Queues. |
| **Copyright & DMCA Ingestion Risks** | Critical | Low | Maintain strict takedown MD5 sets, hash verification, administrative ban tools, zero commercial distribution. |

---

## 13. Definition of Success (Proposed Product Targets)

The following measurable targets represent **proposed product goals** for future development milestones, rather than current performance benchmarks:

1. **Build & Development Reliability**:
   - Clean-clone installation and build succeeds in a single root command (`pnpm run build`) in < 60 seconds without manual ordering steps.
   - 100% TypeScript type check and linter passing with zero warnings across all subprojects.
2. **Reader Responsiveness**:
   - In-app EPUB, PDF, and comic readers open within < 1.0 second for cached books on desktop and modern mobile devices.
   - Zero layout reflow or reading position loss when changing font size, theme, or screen orientation.
3. **Offline Reliability**:
   - 100% of books saved to IndexedDB remain readable with network connectivity disabled.
   - Reading progress and annotations persist offline and reconcile automatically upon reconnecting.
4. **Large-Library Scalability**:
   - Offline library smoothly virtualizes collections containing 2,000+ documents, maintaining 60fps scrolling and memory usage under 150 MB.
5. **Security & Data Integrity**:
   - 100% of community uploads pass server-side MD5 integrity and archive safety checks.
   - Zero sensitive sync data or admin keys leaked via client-side bundles or unauthenticated responses.
