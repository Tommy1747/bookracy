# Bookracy Comprehensive Product and Technical Audit & Roadmap

## 1. Executive Summary

Bookracy is a universal personal reading and book discovery platform. It provides users with multi-source book search, metadata enrichment, direct and proxied downloading, local browser-based offline storage, an in-browser EPUB reader, an EPUB-to-PDF conversion engine, community-driven uploads, and multi-device cloud synchronization.

This audit evaluates the entire Bookracy codebase—comprising the Cloudflare Worker backend (`backend-worker`), the client-side EPUB-to-PDF conversion library (`epub-converter`), and the React 19/TanStack single-page application (`frontend`).

### Key Findings
1. **Strong Foundational Architecture**: The application demonstrates thoughtful distributed systems engineering. The backend incorporates multi-mirror failover (Library Genesis, Anna's Archive, Standard Ebooks), SQLite/D1 full-text search fallback (`search_index_fts`), edge caching via Cloudflare R2 and KV, and a durable Telegram/Discord chunked backup queue.
2. **Specialized E-Reader Focus**: The built-in reader is currently restricted strictly to EPUB files via `epubjs`. Format support for PDF, CBZ/CBR, MOBI, and plain text documents does not have in-app reading capabilities (PDFs currently delegate to standard browser new-tab viewing).
3. **Library and Power-User Constraints**: The offline library relies on browser IndexedDB, persisting book blobs and metadata locally. However, advanced library management features (nested collections, tagging, full-text document search, multi-format reading progress, bulk batch metadata editing) are missing or rudimentary.
4. **Resilience and Stability Gaps**: Upstream scrapers are inherently fragile against upstream HTML changes, CAPTCHAs, and mirror IP bans. While the backend implements backoff and deduplication, frontend client handling of transient upstream errors requires more informative state signaling.
5. **Monorepo Dependency Linkage**: `epub-converter` is consumed as a local `file:../epub-converter` dependency in `frontend/package.json`. If `epub-converter` is not built prior to frontend typecheck/build, TypeScript compilation fails due to missing declarations.

The accompanying roadmap outlines a phased evolution from core reliability (P0) to unified reading experiences (P1), personal library management (P2), advanced comic/manga/document workflows (P3), AI assistance (P4), and community features (P5).

---

## 2. Existing Architecture

The repository is structured into three decoupled subprojects without a root `package.json`:

```
bookracy/
├── backend-worker/     # Cloudflare Worker API & Edge Proxy
│   ├── src/            # Routing, scrapers, rate limiting, backups, search index
│   ├── migrations/     # Cloudflare D1 SQL schemas (community, moderation, FTS)
│   ├── scripts/        # Awards data builder and live provider tests
│   └── tests/          # Node.js built-in test runner test suite
├── epub-converter/     # EPUB-to-PDF client conversion library
│   ├── src/            # jsPDF, JSZip, CSS/XML parsing, layout engine
│   └── tests/          # Node.js test runner unit tests with tsx
└── frontend/           # Modern React SPA
    ├── src/
    │   ├── api/        # TanStack Query options & fetchers
    │   ├── components/ # Radix UI, Lucide icons, reader, bookshelf, community
    │   ├── hooks/      # SEO, reading pace, speech, layout
    │   ├── lib/        # IndexedDB offline store, sync engine, web worker
    │   ├── routes/     # TanStack Router file-based routes
    │   ├── stores/     # Zustand stores with localStorage persistence
    │   └── sw/         # Service worker for offline asset caching
    └── public/         # Manifest, icons, sitemaps, Noto Sans TTF fallback fonts
```

### Backend Architecture (`backend-worker`)
- **Runtime**: Cloudflare Workers (compatibility date `2026-06-21`, `workerd`).
- **Storage & Caching**:
  - Cloudflare R2 bucket (`bookracy-books`) for caching downloaded books and book covers.
  - Cloudflare KV (`SYNC` for user account metadata blobs; `BACKUPS` for chunked storage manifests; Cache API for Apple JWTs).
  - Cloudflare D1 (`bookracy-meta` SQLite database) with tables: `users`, `uploads`, `search_index`, and `search_index_fts`.
  - Cloudflare Queues (`book-backup` producer/consumer and `book-backup-dlq` consumer) managing chunked replication into Telegram channels and Discord storage channels.
- **Upstream Integrations & Aggregation**:
  - Anna's Archive (search scraper and slow-partner download link parser).
  - Library Genesis (5 mirror rotators with transient retry logic and ads/get link resolution).
  - Apple Books Catalog (amp-api tokenized catalog search, marketing RSS feed, and autocomplete hints).
  - Standard Ebooks (OPDS/Atom feed parsing with direct epub/kepub downloads).
  - The Greatest Books & Five Books (curated recommendation feeds and reading orders).
- **Edge Protections**: Custom domain routing (`api.bookracy.com`), per-IP Cloudflare Rate Limiters (`RATE_LIMITER`, `ACCOUNT_CREATE_LIMITER`, `COVER_LIMITER`, `SEARCH_LIMITER`, `UPLOAD_LIMITER`, `METADATA_LIMITER`, `MD5_LIMITER`).

### Conversion Engine (`epub-converter`)
- **Core Technology**: `jspdf`, `jszip`, `@xmldom/xmldom`, `css-tree`, `html-to-text`.
- **Key Capabilities**: Converts EPUB archives into readable PDF documents client-side. Handles Flate compression, font sniffing (TTF/OTF vs WOFF), inline styling extraction, multi-word layout wrapping, table of contents outline mapping, and fallback font rendering using Noto Sans for non-Latin characters.
- **Execution**: Can run in the main browser thread or offloaded to a Web Worker (`frontend/src/lib/epub-to-pdf.worker.ts`).

### Frontend Architecture (`frontend`)
- **Framework**: React 19, Vite 6, TypeScript 5.9, Tailwind CSS v4 with Radix UI primitives.
- **Routing & State**: TanStack Router with code splitting, TanStack Query v5 for server state caching and deduplication, Zustand v5 with local storage persistence for client state (bookmarks, reader appearance, download queue, offline library metadata).
- **Offline & Persistence**: IndexedDB database (`bookracy-offline` v2) separating metadata records from binary book blobs (`blobs` store). PWA service worker caching static assets.
- **Kindle Integration**: Generates shell script installers (`/kindle/install.sh` and `/kindle/bookracy.sh`) allowing jailbroken Kindle e-ink devices to query the API and download books directly.

---

## 3. Current Feature Inventory

| Functional Area | Feature / Capability | Implementation Status | Quality / Verification Notes |
| :--- | :--- | :--- | :--- |
| **Discovery & Search** | Keyword Search (Title/Author) | **Implemented & Working** | Aggregates AA, LibGen, Standard Ebooks; handles diacritics via SQLite FTS5 fallback. |
| | ISBN Search | **Implemented & Working** | Queries LibGen and Apple Books metadata endpoints. |
| | Search Autocomplete / Suggestions | **Implemented & Working** | Apple Books `MZSearchHints` proxy with debounce. |
| | Source & Format Filtering | **Implemented & Working** | Filter chips for EPUB, PDF, MOBI, AZW3, CBR, CBZ, and language/extension facets. |
| | Trending & Curated Lists | **Implemented & Working** | Apple Bestsellers, The Greatest Books, 2000s, African literature, Women authors, Marvel/DC reading orders. |
| | Nonfiction Awards Catalog | **Implemented & Working** | Compressed text dataset (`awards.dataset`) lazy-parsed into prize winners/finalists. |
| **Reader Experience** | In-Browser EPUB Reader | **Implemented & Working** | `epubjs` rendition; supports font size, font family, line height, margins, and themes (Light, Sepia, Dark, Slate). |
| | Reading Progress & Pace Tracking | **Implemented & Working** | Estimates words-per-minute, remaining chapter/book reading time, and saves CFI positions. |
| | Table of Contents & Bookmarks | **Implemented & Working** | Sheet-based TOC navigation; location bookmarking in reader. |
| | In-Browser PDF Reader | **Missing** | PDFs delegate to native browser viewer via `<OpenPdfButton>` in a new tab; no reading progress or bookmarking. |
| | Comic / Manga Reader (CBZ/CBR) | **Missing** | Filter recognizes format; no reader component exists for image archives. |
| | Plain Text (.txt) Reader | **Missing** | No in-app text file parser or viewer. |
| **EPUB Converter** | Client-side EPUB to PDF | **Implemented & Working** | Worker-based `bookracy-convertor` produces compressed PDFs with outline bookmarks and fallback fonts. |
| | Batch Conversion | **Missing** | Only single-item conversion triggerable from book cards. |
| | Custom Page Layout / Margins | **Partially Implemented** | Fixed A4 layout in engine; no user-facing configuration dialog for margins or page sizes. |
| **Library & Storage** | IndexedDB Offline Library | **Implemented & Working** | Blobs stored in `bookracy-offline`; metadata persists across sessions; offline filter view available. |
| | Local File Import | **Implemented & Working** | Allows importing local EPUBs into IndexedDB with locally computed MD5 and extracted cover image. |
| | Bookmark Folders / Shelves | **Implemented & Working** | Users can create colored folders and assign saved bookmarks. |
| | Multi-Device Cloud Sync | **Implemented & Working** | Zero-knowledge token sync via Cloudflare KV; hashes account ID with SHA-256 on backend. |
| | Bulk Management & Batch Actions | **Partially Implemented** | Bulk download queue exists; bulk metadata editing, mass tagging, and bulk shelf assignment are missing. |
| | Reading Statistics & History | **Partially Implemented** | Basic reading pace hook; no historical reading logs, completed books tracker, or reading goal charts. |
| **Community & Ecosystem** | Community Uploads | **Implemented & Working** | Users can upload files up to limit; extracted cover stored in R2, metadata in D1. |
| | Contributor Profiles & Leaderboard | **Implemented & Working** | Tracks upload counts and download counts; supports anonymous or chosen username. |
| | Admin & Moderation | **Implemented & Working** | Endpoints for banning users, suspending uploads, removing listings, and taking down MD5s. |
| | Durable Cloud Backups | **Implemented & Working** | Cloudflare Queue pipes books from R2 to Telegram channels and Discord storage; DLQ error ledger. |
| | Jailbroken Kindle Client | **Implemented & Working** | Dedicated shell scripts served for CLI Kindle search and direct download. |
| **AI Capabilities** | Grounded Q&A / Summaries | **Missing** | Not yet implemented in frontend or backend. |

---

## 4. Technical Audit

### Code Quality & Architecture
- **Modularity**: Separation between `backend-worker`, `epub-converter`, and `frontend` is clean. The frontend separates data fetching (TanStack Query), state management (Zustand), UI components (Radix primitives), and page routes (TanStack Router).
- **Backend Concurrency**: `backend-worker/src/concurrency.ts` implements bounded parallel execution with semaphore controls, preventing subrequest exhaustion in Cloudflare Workers.
- **Resilient Fallbacks**: Search implements multi-tiered fallbacks. If live providers fail, the backend degrades gracefully to SQLite FTS5 index queries on previously indexed books.

### Type Safety
- TypeScript is enforced across all subprojects with strict compiler options.
- The backend types Cloudflare Worker environment bindings (`Env`, D1Database, R2Bucket, KVNamespace, RateLimiter).
- Frontend queries are validated with Zod schemas (`frontend/src/api/backend/types.ts`).
- **Build Order Sensitivity**: `frontend` depends on `bookracy-convertor` via local file reference. Running `pnpm build` in `frontend` without first running `pnpm build` in `epub-converter` produces type declaration errors. A monorepo build script or root workspace orchestration is needed.

### Performance & Scalability
- **Bundle Optimization**: Frontend Vite build splits vendor chunks (Radix, Lucide, epubjs, jszip, html2canvas). Gzipped core bundle is ~287 KB, and the service worker is 1.96 KB.
- **Edge Efficiency**:
  - Cloudflare R2 serves cached covers and books with zero egress fees.
  - Rate limiting is separated into distinct namespaces (`SEARCH_LIMITER`, `MD5_LIMITER`, `METADATA_LIMITER`, `COVER_LIMITER`) to prevent bulk bookshelf hydration from starving search quotas.
  - Lazily parsed datasets (`awards.dataset` text format) avoid JSON parse overhead on Worker cold starts.
- **Memory Management in Converter**: jsPDF Flate compression and streaming chunking keep memory usage predictable during conversion.

### Testing Coverage
- **Backend Worker**: 148 automated unit and integration tests passing (`pnpm test` via Node test runner). Covers mirror backoff, stream resumption, FTS query sanitization, filename cleaning, and takedown sets.
- **EPUB Converter**: 18 unit tests passing (`pnpm test` via `tsx`). Validates line wrapping, font sniffing, outline bookmarks, fallback fonts, and abort signals.
- **Frontend**: Currently lacks automated component and end-to-end browser tests. Testing is limited to TypeScript type checking (`tsc --noEmit`) and ESLint.

### Technical Debt & Maintenance Concerns
1. **ESLint Deprecation Warnings**: ESLint v9 flat config in `epub-converter` and `frontend` triggers deprecation warnings for specific plugins.
2. **Fast Refresh Export Warnings**: `frontend/src/components/books/filters.tsx`, `button.tsx`, and `main.tsx` export non-component constants triggering Vite React Refresh warnings.
3. **Monorepo Build Coupling**: Lack of root-level build tooling requires manual sequential building of `epub-converter` before frontend builds.

---

## 5. UX/UI Audit Across Reader Personas

### 1. Casual Ebook Reader
- **Current Experience**: Seamless. Users can search for a title, view book details and ratings from Apple Books, download an EPUB with a single click, and read immediately in the responsive browser reader.
- **Gaps**: Reader lacks page curl/transition animations, customizable line-spacing presets, and one-click font switching between common serif/sans-serif standards.

### 2. Manga and Comic Reader
- **Current Experience**: Poor. While search filters allow filtering by `.cbz` and `.cbr` formats, opening a comic file provides no in-app reading viewer. Users are forced to download the raw archive and use third-party software.
- **Opportunities**: Implement a canvas/WebGL image archive reader supporting right-to-left manga page flow, dual-page landscape mode, and pinch-to-zoom.

### 3. Student
- **Current Experience**: Moderate. Students can find textbooks and papers in PDF or EPUB. EPUB-to-PDF conversion enables exporting readable PDFs for external annotation.
- **Gaps**: No in-app text highlighting, note-taking, passage copy with academic citations, or exportable reading summaries. PDF documents cannot be annotated inside Bookracy.

### 4. Technical Reader
- **Current Experience**: Suboptimal. Code blocks in technical EPUBs often suffer from clumsy line breaking or formatting degradation in the reader.
- **Opportunities**: Monospace font support, code block syntax styling, and integrated table viewing.

### 5. Document Manager (Hundreds or Thousands of Documents)
- **Current Experience**: Restricted. The IndexedDB offline library can store dozens of files, but managing hundreds of documents degrades UI responsiveness due to unvirtualized lists and lack of multi-level taxonomy.
- **Gaps**: No multi-select batch tag assignment, nested subfolders, bulk export/backup, or full-text client document search.

### 6. Power User with a Large Digital Library
- **Current Experience**: Functional but basic. Cloud sync backs up bookmarks, folders, and reading progress across devices via a bearer account ID.
- **Gaps**: No duplicate detection on import, no smart collections (e.g., "Unread EPUBs added this month"), no reading statistics dashboard, and no integration with Calibre or OPDS library feeds.

---

## 6. Security and Privacy Audit

### Authentication & Identification
- Bookracy employs a privacy-first, zero-knowledge account architecture:
  - User accounts have no email, password, or PII.
  - Accounts are identified solely by a high-entropy client-generated bearer key.
  - The backend stores and keys records by `sha256(accountId)`, ensuring a database leak cannot reverse-engineer user credentials.

### File Handling & Upload Validation
- Community uploads are validated on the backend:
  - File extension and MIME type allowlists.
  - Size enforcement bounded to Worker payload limits.
  - Content MD5 hash verification matches uploaded bytes.
  - Content moderation capabilities allow administrators to hide or ban abusers and purge malicious files.

### Edge Rate Limiting & Denial of Service Protection
- Cloudflare rate limits protect backend endpoints against scraping and DDoS:
  - Dedicated limiter for free-text search (30 req/min).
  - Dedicated limiter for account creation (5 req/min).
  - Dedicated limiter for community uploads (10 req/min).
  - Generous burst limiters for cover caching and MD5 bookmark lookups.

### Takedown Compliance
- `backend-worker/src/takedown.ts` maintains an explicit set of blocked MD5s and title/author patterns. Blocked items are rejected at download resolution, cover rendering, and background queue ingest.

---

## 7. Feature Gap Analysis

| Feature Domain | Master Specification Requirement | Current State | Gap Classification | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Reading Formats** | EPUB reader | Implemented | Working | Enhance typography & themes |
| | PDF reader | Browser new tab only | **Missing** | Embed PDF.js reader with progress |
| | CBZ/CBR manga reader | None | **Missing** | Build image-archive viewer |
| | TXT document reader | None | **Missing** | Implement clean text reader |
| **Reader Features** | Reading themes & typography | 4 themes, font size slider | Needs Improvement | Add line-height, letter spacing, margins |
| | Highlights & Notes | None | **Missing** | Implement CFI-based highlight store |
| | Full-text search in reader | None | **Missing** | Integrate epubjs spine search |
| | Reading progress & pace | Implemented | Working | Preserve and expose stats |
| **Personal Library** | Custom collections & folders | Single-level colored folders | Needs Improvement | Add nested tags & smart collections |
| | Reading status (Want/Reading/Read) | Reading progress only | Partially Implemented | Add formal status triaging |
| | Bulk import & management | Single local file import | Partially Implemented | Support folder drag-and-drop & bulk actions |
| | Duplicate detection | None | **Missing** | Match MD5 and title similarity on import |
| | Metadata editor | None | **Missing** | Allow local editing of title/author/cover |
| **Document Processing**| EPUB to PDF conversion | Client worker conversion | Working | Add page size & margin options |
| | Batch conversion | None | **Missing** | Queue multiple conversions |
| **Offline & Sync** | IndexedDB storage | v2 schema with blob separation | Working | Add storage quota dashboard |
| | Cloud sync | KV metadata sync | Working | Extend sync schema for notes/tags |
| **AI Capabilities** | Grounded reading assistant | None | **Missing** | Design privacy-first client LLM API integration |
| **Community** | Community uploads & Leaderboard | Implemented in D1/R2 | Working | Add content reporting & preview |

---

## 8. Prioritized Roadmap

### Phase P0 — Critical Reliability, Security & Developer Foundation
*Objective: Solidify existing systems, eliminate build fragility, and reinforce upstream resilience.*

1. **Monorepo Build Orchestration & Dependency Alignment**
   - *User Value*: Guarantees consistent builds, eliminates CI/CD failures.
   - *Technical Complexity*: Low.
   - *Dependencies*: None.
   - *Risks*: Build script discrepancies across environments.
   - *Acceptance Criteria*: Root build command (`pnpm run build`) builds `epub-converter` before `frontend`; typechecks pass cleanly on clean clone.

2. **Upstream Failure & Degradation Hardening**
   - *User Value*: Clearer feedback when external providers (LibGen/AA) suffer outages.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Backend rate limiters.
   - *Risks*: Over-caching stale error states.
   - *Acceptance Criteria*: Frontend displays helpful fallback alerts when live sources are down, offering FTS-indexed results seamlessly.

3. **Client-Side Upload Validation & Malware Guardrails**
   - *User Value*: Protects community library against corrupt or malicious files.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Community upload endpoints.
   - *Risks*: False positives on unusual EPUB formats.
   - *Acceptance Criteria*: Client validates EPUB/PDF archive integrity and structure before initiating upload.

---

### Phase P1 — Core Reading Experience
*Objective: Transform Bookracy into a first-class reading application.*

1. **Embedded PDF Reader with Progress Tracking**
   - *User Value*: Read PDFs directly in Bookracy on mobile and desktop without opening external tabs; save reading position.
   - *Technical Complexity*: High.
   - *Dependencies*: `pdfjs-dist`.
   - *Risks*: Memory footprint of large PDF documents on mobile browsers.
   - *Acceptance Criteria*: In-app modal/page viewer for PDFs with page navigation, zoom, thumbnail sidebar, and local progress persistence.

2. **Highlights, Annotations, and Reader Bookmarks**
   - *User Value*: Highlight passages in EPUBs, attach personal notes, and review annotations in a unified drawer.
   - *Technical Complexity*: Medium.
   - *Dependencies*: `epubjs` rendition annotations API.
   - *Risks*: CFI synchronization across varying screen dimensions.
   - *Acceptance Criteria*: Text selection triggers annotation toolbar; highlights persist in IndexedDB and sync across devices.

3. **In-Book Full-Text Search**
   - *User Value*: Find terms, quotes, or character names instantly within the currently open book.
   - *Technical Complexity*: Medium.
   - *Dependencies*: `epubjs` search API.
   - *Risks*: Search performance on large books (>500 pages).
   - *Acceptance Criteria*: Search input inside reader sheet yields navigable excerpt results with direct navigation.

4. **Typography & Layout Customization Expansion**
   - *User Value*: Comfortable reading tailored to dyslexia, low-vision, or aesthetic preference.
   - *Technical Complexity*: Low.
   - *Dependencies*: Reader store.
   - *Risks*: CSS specificity conflicts with publisher styles.
   - *Acceptance Criteria*: Controls for line height, paragraph spacing, letter spacing, margin width, and dyslexia-friendly fonts (OpenDyslexic).

---

### Phase P2 — Personal Library & Document Management
*Objective: Calibre-grade organization and personal library curation.*

1. **Reading Status & Triage System (Want to Read / Currently Reading / Finished)**
   - *User Value*: Readers can categorize their catalog and track reading achievements.
   - *Technical Complexity*: Low.
   - *Dependencies*: `bookmarks.ts` store.
   - *Risks*: Data migration for existing bookmarks.
   - *Acceptance Criteria*: Filterable shelves for reading states with automatic status transition when reaching 100% progress.

2. **Bulk Document Import & Folder Ingestion**
   - *User Value*: Drag-and-drop entire folders of documents into Bookracy.
   - *Technical Complexity*: Medium.
   - *Dependencies*: File System Access API / webkitdirectory.
   - *Risks*: Browser memory exhaustion when importing hundreds of files.
   - *Acceptance Criteria*: Batch importer processes files sequentially with progress modal, extracting metadata and covers.

3. **Duplicate Detection & Metadata Management**
   - *User Value*: Avoid duplicate files; correct erroneous titles, authors, or covers.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Offline library store.
   - *Risks*: Local metadata divergence from backend index.
   - *Acceptance Criteria*: System flags identical MD5s or similar title/author pairs; inline dialog allows editing metadata.

4. **Tagging & Smart Filter Collections**
   - *User Value*: Flexible organization beyond single-parent folders.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Zustand store.
   - *Risks*: Complex query performance on large client libraries.
   - *Acceptance Criteria*: Multi-tag support per book; dynamic smart views (e.g. "Unfinished PDFs added >30 days ago").

---

### Phase P3 — Advanced Reading Formats & Conversion
*Objective: Comic/Manga support and advanced document conversion.*

1. **Manga & Comic Viewer (CBZ / CBR)**
   - *User Value*: Native reading experience for manga, comics, and graphic novels.
   - *Technical Complexity*: High.
   - *Dependencies*: `jszip` (CBZ), client unrar (CBR).
   - *Risks*: Decompression memory overhead on low-memory mobile devices.
   - *Acceptance Criteria*: Canvas/image reader supporting Right-to-Left (Manga) and Left-to-Right reading, double-page spreads, and vertical webtoon scrolling.

2. **Plain Text (.txt) and Markdown (.md) Reader**
   - *User Value*: Clean, distraction-free reading of notes, transcripts, and public domain text files.
   - *Technical Complexity*: Low.
   - *Dependencies*: Virtualized text renderer.
   - *Risks*: Large text file layout virtualization.
   - *Acceptance Criteria*: Opens .txt and .md with matching typography settings and progress tracking.

3. **Advanced EPUB-to-PDF Conversion Profiles**
   - *User Value*: Produce customized printable PDFs tailored for specific e-readers or print formats.
   - *Technical Complexity*: Medium.
   - *Dependencies*: `bookracy-convertor`.
   - *Risks*: Pagination inconsistencies across custom page dimensions.
   - *Acceptance Criteria*: Conversion dialog offering presets (A4, A5, US Letter, Kindle 6 inch), custom margins, and font scaling.

---

### Phase P4 — Bookracy AI Assistant
*Objective: Intelligent reading, comprehension, and learning tools.*

1. **Passage Explanation & Contextual Definitions**
   - *User Value*: Instant explanation of complex terms, foreign phrases, or archaic language without leaving the reading view.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Cloudflare Workers AI or BYO-API key (OpenAI/Anthropic).
   - *Risks*: Privacy leakage, latency.
   - *Acceptance Criteria*: Selecting text exposes "Explain with AI" popup; respects user privacy settings; grounded strictly in excerpt context.

2. **Chapter Summarization & Study Notes**
   - *User Value*: Quickly recap prior chapters before resuming reading.
   - *Technical Complexity*: High.
   - *Dependencies*: In-browser chunking and backend AI worker.
   - *Risks*: Context window limits, hallucinations.
   - *Acceptance Criteria*: Generates concise chapter summaries with citations; exportable to Markdown.

3. **Library Knowledge Search (Ask Your Books)**
   - *User Value*: Ask questions across your personal collection of books and documents.
   - *Technical Complexity*: Very High.
   - *Dependencies*: Vector embeddings (Cloudflare Vectorize) or client-side vector store.
   - *Risks*: Storage limits and compute cost.
   - *Acceptance Criteria*: Natural language queries return relevant passage snippets across personal books.

---

### Phase P5 — Community & Ecosystem
*Objective: Expand community library features, curation, and integrations.*

1. **Community Collections & Public Booklists**
   - *User Value*: Discover curated reading lists created by other community members.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Cloudflare D1 community tables.
   - *Risks*: Moderation workload.
   - *Acceptance Criteria*: Users can publish public reading lists with titles and notes; browse community-curated collections.

2. **Metadata Corrections & Community Reviews**
   - *User Value*: Crowdsource fixes for broken titles, missing authors, and incorrect covers.
   - *Technical Complexity*: Medium.
   - *Dependencies*: D1 moderation pipeline.
   - *Risks*: Vandalism or spam.
   - *Acceptance Criteria*: Logged-in/trusted contributors can submit metadata edits subject to admin moderation.

3. **OPDS Feed Server**
   - *User Value*: Connect third-party e-readers (KOReader, Moon+ Reader) directly to the user's Bookracy library.
   - *Technical Complexity*: Medium.
   - *Dependencies*: Cloudflare Worker OPDS endpoint.
   - *Risks*: Authentication handling over OPDS.
   - *Acceptance Criteria*: OPDS catalog endpoint authenticated with account key.

---

## 9. Recommended Technical Improvements

1. **Implement Root-Level Build & Script Orchestration**
   - Add a root `package.json` with pnpm workspaces or workspace scripts:
     ```json
     {
       "name": "bookracy-monorepo",
       "private": true,
       "scripts": {
         "build:converter": "pnpm --filter bookracy-convertor build",
         "build:frontend": "pnpm --filter bookracy build",
         "build:all": "pnpm --filter bookracy-convertor build && pnpm --filter bookracy build",
         "test:all": "pnpm --filter bookracy-api test && pnpm --filter bookracy-convertor test",
         "typecheck:all": "pnpm --filter bookracy-api typecheck && pnpm --filter bookracy-convertor build && pnpm --filter bookracy typecheck"
       }
     }
     ```
2. **Virtualize Large Lists in Frontend**
   - Adopt `@tanstack/react-virtual` for offline library lists and download history when handling hundreds of records to prevent DOM bloat.
3. **Decouple Reader from Specific Format Providers**
   - Refactor `EpubReader` into a unified `ReaderModal` / `ReaderView` that routes based on file MIME type:
     - `application/epub+zip` -> `EpubEngine`
     - `application/pdf` -> `PdfEngine`
     - `application/vnd.comicbook+zip` -> `ComicEngine`
     - `text/plain` -> `TextEngine`
   - Unify reading position state: `{ format, position: string | number, percentage: number }`.
4. **Automated Frontend Testing**
   - Introduce Playwright for browser integration and reader regression testing.

---

## 10. Implementation Sequence & Milestones

```
+-------------------------------------------------------------+
| Milestone 1 (Foundation): P0 Build & Upstream Hardening      |
| - Root workspace build scripts                              |
| - Upstream outage UX fallback notifications                 |
| - Fast-refresh and lint warning cleanups                    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Milestone 2 (Reading Core): P1 In-App PDF & Reader Upgrades  |
| - Integrated PDF.js reader component                        |
| - Reader annotations & highlight store                      |
| - In-book search sheet                                      |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Milestone 3 (Library): P2 Personal Library Management       |
| - Reading status triage (Want/Reading/Finished)             |
| - Bulk import with batch progress                           |
| - Local duplicate detection and metadata editor             |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Milestone 4 (Comics & Formats): P3 CBZ/CBR & Text Support    |
| - Manga/comic canvas viewer with RTL support                |
| - Plain text / Markdown reader                              |
| - EPUB converter page-size configuration dialog             |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Milestone 5 (Intelligence): P4 AI Reading Assistant          |
| - Privacy-first passage explanation                         |
| - Chapter summarization pipeline                            |
+-------------------------------------------------------------+
```

---

## 11. Testing & Verification Strategy

- **Unit Testing**:
  - Backend Worker: Retain existing Node test suite (`148 tests`); expand tests for any new routing or schema changes.
  - EPUB Converter: Retain Node/tsx test suite (`18 tests`); write tests for custom page sizing and margin parameters.
- **Frontend Type & Lint Verification**:
  - Automated `tsc --noEmit` and `eslint src/` checks run across all PRs.
- **End-to-End Verification**:
  - Playwright test suite for critical reader paths: opening EPUB, paging forward/backward, creating bookmarks, verifying IndexedDB storage retention offline.
- **Offline Reliability Verification**:
  - Simulate offline network conditions in browser devtools; confirm that downloaded books in IndexedDB load and render without network calls.

---

## 12. Risks and Dependencies Matrix

| Risk / Dependency | Impact | Probability | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Upstream Mirror Blocking / Anti-Bot** | High | High | Multi-mirror racing, Cloudflare FTS5 offline fallback cache, user-agent rotation, transparent user error messaging. |
| **IndexedDB Quota Limits & Safari Eviction** | Medium | Medium | Proactive `navigator.storage.persist()` request on first save; storage meter alerting user of quota usage. |
| **Large File Memory Spikes on Mobile** | High | Medium | Chunked streaming, Web Worker offloading for conversions and comic rendering, unvirtualized canvas management. |
| **Cloudflare Worker D1 & KV Quotas** | Medium | Low | FTS query indexing, edge caching with Cache API, denormalized metadata storage. |
| **Copyright & DMCA Ingest Risks** | Critical | Low | Maintain strict takedown MD5 sets, hash verification, administrative ban tools, zero unauthorized commercial distribution. |

---

## 13. Definition of Success

Bookracy achieves its architectural vision when:
1. **Universal Reading**: Users can open and read EPUBs, PDFs, CBZ/CBR comics, and text documents in one unified, distraction-free interface with persistent progress across devices.
2. **Reliable Anywhere**: The application functions seamlessly offline without network connectivity for all stored content.
3. **Calibre-Grade Library Power**: Users can effortlessly organize, search, tag, and curate collections containing thousands of books.
4. **Rock-Solid Stability**: Builds are deterministic, automated test suites pass across all subprojects, and edge failovers shield readers from external upstream outages.
