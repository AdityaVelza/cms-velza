# Velza Global CMS — Master Execution Status

No secrets are recorded in this file. Last updated: 2026-10-26.

| Stage | Status | Evidence | Blockers | Next action |
|---|---|---|---|---|
| 0 Discovery | PASS | See §0. Workspace, both repos, configs, tests and backups inspected read-only. | — | — |
| 1 Rev 4 file verification | PASS | Original and review copy: 727 lines, 49,154 bytes, SHA-256 `b5178f10354518f146e10e660da632cc9924647fc8b30658f392f909411afa16`, byte-identical; `node --check` passes. | — | — |
| 2 Independent security review | PASS | Rev 6 `03677c7e…7ae7` reviewed READY FOR CONTROLLED EXECUTION APPROVAL; no critical/high findings; review history §2. Static review only — runtime behaviour unproven until Stage 3. | Preconditions: no other admin activity; Public role `find` on Blog/News. | Owner decision on §3 plan. |
| 3 Controlled G5 test | INCONCLUSIVE / BLOCKED | Run 1 (Rev 6, 2026-10-26) cancelled at the hidden password prompt; no authenticated test executed; database and uploads unchanged (§3a). Rev 7 prompt fix prepared (§3b). | **Approval gate:** second execution needs explicit owner approval. | Owner approves the run-2 preflight and launch (§3b). |
| 4 Security and access validation | PARTIAL | Config evidence only (§4). No runtime evidence without the database or a running Strapi. | Runtime checks need Stage 3 or an approved read-only admin check. | Use Stage 3 results; prepare change plan for CORS/poweredBy. |
| 5 Website integration | PARTIAL | Listings + server-side article renderer implemented; 74/74 offline integration tests pass (mock CMS). | Region slugs (F6a), production CMS URL, canonical policy (F4b/F4c), detail-page hosting (Stage 6). | Stay disabled-by-default until decisions are made. |
| 6 Production architecture | PARTIAL | Recommendation drafted (§6). | Owner approval of architecture; CMS hosting not chosen. | Owner decision. |
| 7 Production CMS preparation | BLOCKED | Gaps listed (§7). | Stage 6 approval, hosting, confirmed domains. | — |
| 8 End-to-end QA | BLOCKED | — | Stages 3, 6, 7. | — |
| 9 Release readiness | NOT READY — BLOCKERS REMAIN | — | All of the above. | — |

## §0 Discovery (2026-10-26)

**Workspace `C:\Users\ADMIN\Desktop\cms_velza_new`** — git `main` @ `f73a22b` (single commit), no stashes. Untracked: `g5-stage3-review-copy.mjs`, this file. Ignored local material: `backups/` (16 backup sets, latest `g5-stage1-20261024-175035`), `phase-6*.md`, `swc-cache/`.

**CMS `velza-cms`** — Strapi 5.58.0 (`@strapi/strapi`, `@strapi/admin` 5.58.0). Content types: Blog, News Article, Newsletter Issue (draft & publish), Author, Category, Region; components `shared.seo`, `shared.faq-item`. Customisations: `published-only` route middleware (forces `status=published` on the Content API), upload extension marking `file.related` private, upload MIME allow/deny lists, admin white-labelling, Strapi Cloud plugin disabled. `src/index.ts` bootstrap is empty, so Public-role permissions live only in the database.

- `.env` (values not read): `DATABASE_CLIENT=postgres`, `HOST=127.0.0.1`, `PORT=1338`. The SQLite security-test instance is **not** the default: it was previously started with process-level overrides `DATABASE_CLIENT=sqlite`, `DATABASE_FILENAME=.tmp/manual-test.db`, `PORT=1337` (dotenv does not override variables already set).
- Local SQLite test database: `velza-cms/.tmp/manual-test.db` (1,380,352 bytes, last modified 2026-10-24 18:27). Not opened.
- `config/middlewares.ts`: default `strapi::cors` (reflects any origin) and `strapi::poweredBy` still present (known Phase 5 items M1).

**Integration kit `integration`** — browser/Node client, mock CMS, dev site server, article-renderer and e2e tests. `npm test`: **74/74 pass** (mock-based, localhost only; website repo unchanged afterwards).

**Website `C:\Users\ADMIN\Desktop\Velza Github\velzaglobal`** — branch `feature/strapi-blog-news-integration` @ `bb57d75` (listings commit). Uncommitted: `shared/js/velza-cms/cms-config.js`, `shared/js/velza-cms/content-listing.js`; untracked `server/cms/` (article renderer + generated templates). 3 stashes on other branches (preserved). `.cpanel.yml` deploys **unconditionally to production** (`/home/velzhsrg/public_html`) from whatever branch is checked out, and **excludes `server/`**. `cms-config.js` keeps `baseUrl: null`, `regionSlugs` null, `detailPages: false` — the CMS integration is disabled by default.

**Security-test status** — Stage 3A script Rev 4 prepared, never executed. Earlier stages (G5 Stage 1/2, two-role model) recorded in prior session backups; no fresh runtime evidence today.

**Architecture blockers**
1. Detail pages are rendered by `server/cms/` but cPanel never deploys `server/`.
2. No production CMS host, PostgreSQL instance, domain or HTTPS URL is evidenced.
3. Business decisions F2/F3 (news expiry/embargo), F4b/F4c (canonical URLs), F6a (region slugs) pending.

## §2 Stage 2 review history

| Rev | SHA-256 (first 16) | Lines | Reviewer verdict | Action |
|---|---|---|---|---|
| 4 | `b5178f10354518f1` | 727 | Ready; 5 LOW findings (one fails criterion 3: title-based attribution) | Fixed in Rev 5 |
| 5 | `2a4fe2db16ba210e` | 756 | Ready; all 5 fixes verified; exact-count DB3 matches Strapi 5.58 end state; 3 LOW findings | Fixed in Rev 6 |
| 6 | `03677c7e463ec83d` | 766 | READY FOR CONTROLLED EXECUTION APPROVAL; 3 fixes verified, no regression | Diff vs archived Rev 5 (`2a4fe2db…`) limited to 30 changed lines in the reviewed areas |

Rev 6 full SHA-256: `03677c7e463ec83dd6579eaab219b1719eb21026a9e6325d62986c736ca47ae7` (original and review copy byte-identical).

## §3 Stage 3 execution plan (draft — requires explicit approval)

- **Script:** original scratchpad `g5-stage3.mjs`, Rev 6 hash above (re-checked immediately before launch).
- **Target:** `BASE` is a constant `http://127.0.0.1:1337` with a host guard; no override exists.
- **Database:** `velza-cms/.tmp/manual-test.db`. Port 1337 currently has no listener; port 1338 is in use by another local process (the default `.env` instance on PostgreSQL) — it must not be touched.
- **Steps after approval:**
  1. Confirm no one else uses the admin panel or the test account.
  2. With no Strapi instance using `manual-test.db`, copy it and `velza-cms/public/uploads/` to `backups/g5-stage3-pre-<timestamp>/`; verify the copy by SHA-256 equality and `PRAGMA integrity_check` on the **copy**; confirm on the copy (read-only) that the Public role has `find` on Blog and News Article.
  3. Start a separate Strapi with process-level overrides `DATABASE_CLIENT=sqlite`, `DATABASE_FILENAME=.tmp/manual-test.db`, `PORT=1337`, `HOST=127.0.0.1`; confirm `GET /_health` = 204.
  4. Re-check the script hash.
  5. **The owner launches the script in their own terminal** (it requires a real TTY for hidden password input): `node "<script path>"`, then types the test account password at the hidden prompt. The password and session token never enter this session.
  6. Read the exit code and `g5-stage3-results.json` (no secrets, no row contents).
- **Expected changes:** 1 Blog draft + 1 News draft (stamped `G5 TEST – … <timestamp>`), each with 1 SEO component + link, 1 region link, 1 featured-image link; 1 `G5 TEST` file (+ its stored image under `public/uploads`); no session left; all pre-existing rows unchanged; nothing published at the end.
- **Stop conditions:** any halt, UNEXPECTED, DB1–DB3 failure, cleanup failure, `MANUAL CHECK REQUIRED`, or nonzero exit → stop, preserve the database, results file and console output; **no automatic restore**; report and wait.
- **Afterwards:** stop the 1337 instance; record results here; recommend disposition of the G5 records and test account (deletion needs separate approval).

## §3a Stage 3 run 1 — Rev 6 (2026-10-26) — INCONCLUSIVE / BLOCKED

| Item | Record |
|---|---|
| Script | Rev 6, SHA-256 `03677c7e463ec83dd6579eaab219b1719eb21026a9e6325d62986c736ca47ae7` (verified before launch; archived as `g5-stage3.rev6-03677c7e.mjs` next to the original) |
| Pre-run backup | `backups/g5-stage3-pre-20261026-130916/` — `manual-test.db` SHA-256 `17dc7ed3d0b8a62527545ea48a4c669b78cb4f696ba82c8d4fc91d11fddf8d1e` (identical to live), `uploads/` identical; on the copy: `integrity_check` ok, `quick_check` ok, 0 FK violations; test account id 2 active with only "Velza Content Manager" (role id 7); Public role has `find` on Blog and News Article; 0 API tokens; no prior G5 rows |
| Isolation | Port-1338 Strapi (PID 18860) stopped with owner authorisation; test Strapi started with process-level overrides only, bound to `127.0.0.1:1337`, reported `sqlite` / `.tmp\manual-test.db`, `/_health` 204, database unchanged by startup |
| What happened | Preflight and before-snapshot (59 tables) OK; **U1–U4 PASS** (401). The script then waited at the hidden password prompt, which was invisible because the prompt had no trailing newline and output was piped through PowerShell 5.1 `Tee-Object`. While it waited, Claude Code stopped the background test server under low system memory. The operator pressed Ctrl+C at the prompt → `STOPPED: Cancelled`. |
| Finalization | No session, so no cleanup/logout needed. **H1 failed** (`fetch failed`) because the test server was no longer running. DB comparison ran: DB1–DB3 PASS, 0 problems, no table changed. |
| Result | Results JSON written: VERDICT FAIL, EXIT=1, `finalizationErrors: ["H1: fetch failed"]`, `created: {}` |
| Verified afterwards | Live `manual-test.db` byte-identical to the backup (mtime unchanged, no journal); `public/uploads` identical; no test records, sessions or files; no node processes running |
| Classification | **INCONCLUSIVE / BLOCKED** (operational). No authenticated or permission test was executed. **No security vulnerability demonstrated.** |
| Preserved | Backup, console log (`backups/g5-stage3-pre-20261026-130916/g5-stage3-console.log`), results JSON, test account |

## §3b Run 2 preparation — Rev 7

- Rev 7 = Rev 6 plus one functional change: the hidden password prompt is written with a trailing newline (line 301), plus the revision label (lines 1, 472). Input handling unchanged (raw mode, no echo, Ctrl+C cancels).
- SHA-256 `aab0f09c81c01d75e0014ffe3754a14bf948ad45e790a635657422c1a3e7bd4a`, 766 lines, 52,385 bytes; review copy byte-identical; `node --check` passes.
- Independent static review of Rev 7: **READY FOR CONTROLLED EXECUTION APPROVAL**. Real diff vs archived Rev 6 = exactly lines 1, 301, 472; password, input handling, auth, HTTP, cleanup, DB comparison, verdict and exit code unchanged.
- Operator rule: **never press Ctrl+C after the password has been entered** — the script then has no SIGINT handler, so Ctrl+C would kill Node and skip safety unpublish, logout, DB comparison and the results file. Every request has a 20 s timeout, so a stalled run ends by itself.
- Test server to run in the owner's own PowerShell terminal (not a Claude background shell, which can be stopped under memory pressure).

## §C Content-cleanup task — Phase A (read-only discovery, 2026-10-26) — STOPPED: database target ambiguous

- No Strapi process is running. The port-1338 instance (stopped earlier with owner authorisation) ran with the default `.env` → PostgreSQL `velza_cms2` @ 127.0.0.1:5433 (PostgreSQL 18.6); Super Admin admin sessions were created there today 04:37–07:13 UTC.
- **PostgreSQL `velza_cms2`:** only `ZZTEST` content (2 Blog documents / 4 rows, 1 "ZZTEST Region", 1 file); roles Super Admin/Editor/Author only — **no Velza Content Manager role**; Public role has **no `find`** on content; **registration enabled**; **2 API tokens** (Read Only, Full Access). Latest pg_dump backup: 2026-10-23 17:58 — older than today's activity.
- **SQLite `.tmp/manual-test.db`:** the configured setup — Velza Content Manager role (15 permissions), Regions Hong Kong / India / Philippines, Public `find` on Blog/News/Region, registration disabled, 0 API tokens, G5 test account; content: Blog "NEW" (`global-brand`), News "Velza Global Strengthens Its Focus on Regional Brand Development", 2 files (1 unreferenced). Backup verified today.
- `public/uploads` is shared: 15 files, each referenced by exactly one database (5 by PostgreSQL, 10 by SQLite); none orphaned, none missing.
- No records modified. Owner decision required on which database is "the existing CMS" before any cleanup proposal is final.
- **Owner decision (2026-10-26): PostgreSQL `velza_cms2` is the active CMS.** SQLite `manual-test.db` is preserved as a G5 test artifact.

### §C2 PostgreSQL alignment — plan prepared, nothing changed (approval gate)

- Target verified read-only: `velza_cms2` / `velza_cms2_app` / `127.0.0.1` / `5433`, PostgreSQL 18.6.
- Fresh backup: owner runs the existing `backups/n2-retry-script.ps1` (identity check, unique folder, `pg_dump -Fc -W`); Claude verifies with `pg_restore --list` (offline). **Done — verified (below).**

#### PostgreSQL backup 2026-10-26 — VERIFIED (offline, no database connection)

| Check | Result |
|---|---|
| File | `backups/n2-retry-20261026-144840/velza_cms2_20261026_144840.dump` |
| Script report | identity `velza_cms2\|velza_cms2_app\|127.0.0.1\|5433`, `pg_dump` exit 0, custom format (-Fc), schema and data |
| Size | 280,401 bytes (matches the script report) |
| SHA-256 | `a087519e06aa25068c5997b8ae8fa1530a553f192766987568a59b97f3769733` |
| Header | `PGDMP`; created 2026-10-26 14:48:40; dbname `velza_cms2`; format CUSTOM, gzip; dump version 1.16-0; server and pg_dump 18.6 |
| `pg_restore --list` | exit 0, no warnings; 691 TOC entries: 59 TABLE, 59 TABLE DATA, 59 SEQUENCE / SEQUENCE OWNED / SEQUENCE SET / DEFAULT, 85 CONSTRAINT, 95 FK CONSTRAINT, 150 INDEX, 1 ACL |
| Full decode (`pg_restore -f -`, output counted, not stored) | exit 0, no stderr; 59 `CREATE TABLE`, 59 `COPY` blocks, 59 terminators — every data block decompresses |
| Row spot check | `blogs` 4, `regions` 1, `admin_roles` 3, `strapi_api_tokens` 2 — matches the read-only inventory |
| Not done | Restore test into a scratch database (would need a new database; not authorised) |
- Proposed deletions (pending approval): Blog documents `egkymjsalmp3zapet237us1g` (rows 1, 4) and `n4chr9y7pnqz7edhsj3dymw6` (rows 3, 5) with SEO components 1/3/4/5, `blogs_cmps` 1/5/7/9, `blogs_regions_lnk` 1/3/4/5, `files_related_mph` 5–8; Region `bjqzn5d654ev1imoqgv5w1zu` (row 1). File 1 and all upload files kept.
- Configuration gap: no Velza Content Manager role; Public has no content `find`; registration enabled; two default API tokens with unlimited lifespan (Full Access never used).
- Region slugs: no approved values (F6a pending; website `regionSlugs` all `null`). **Proposed:** Hong Kong `hk`, India `in`, Philippines `ph` (matches website routing `regions/<code>/`) — awaiting owner confirmation; no region records created.
- WhatsApp image (file 1) and all upload files: kept untouched (owner instruction).

#### Phase 1 reconfirmation (2026-10-26, read-only) — no discrepancy

- `.env` still selects `postgres` / `127.0.0.1:5433` / `velza_cms2` / schema `public`; no node or Strapi process running; no listener on 1337/1338; no established connections to 5433.
- Backup still 280,401 bytes, SHA-256 `a087519e…9733`.
- Re-run of the planning queries: **identical** to the recorded evidence (records, relation IDs, SEO components, file 1, tokens, roles, Public permissions, advanced settings).
- Baseline fingerprint for post-cleanup verification: 59 tables / 359 rows (per-row SHA-256) + 16 upload files (per-file SHA-256), saved as hashes only in the session scratchpad (`pg-baseline-pre-cleanup.json`, SHA-256 `11f812c9…6006`).
- Git: workspace untracked files only (status file, review copy), 0 stashes; website branch, 2 modified files, untracked `server/cms/`, 3 stashes — unchanged.

#### Pre-deletion verification gate (2026-10-26 ~09:27 UTC, read-only) — PASSED

- Strapi PID 15016 (`strapi.js start` via `npm run start`, started 14:55:53 local) listening on `127.0.0.1:1338`; `/_health` 204.
- Database connection: one read-only public request (`GET /api/regions` → 403, Public has no `find`) opened a pool connection from PID 15016 (client port 60665); `pg_stat_activity` shows that port on `velza_cms2` as `velza_cms2_app`. Startup banner text not seen by Claude (not pasted); identity proven via `pg_stat_activity` instead.
- Targets by document ID + title: Blog `egkymjsalmp3zapet237us1g` rows 1 (draft) + 4 (published); Blog `n4chr9y7pnqz7edhsj3dymw6` rows 3 + 5; Region `bjqzn5d654ev1imoqgv5w1zu` row 1 "ZZTEST Region" (`zztest`).
- Backup unchanged (280,401 bytes, `a087519e…9733`).
- Full snapshot after startup vs pre-cleanup baseline: **no row or upload change** (59 tables / 359 rows / 16 files).
- No deletion performed; awaiting separate authorisation.

#### Post-deletion audit (2026-10-26 09:33 UTC, read-only) — **FAIL: unexpected deletion of the protected media record and files**

- Identity/health: Strapi PID 15016 on `127.0.0.1:1338`, `/_health` 204; `pg_stat_activity` shows its connection (client port 58205) on `velza_cms2` as `velza_cms2_app`. Backup unchanged (`a087519e…9733`). Baseline file unchanged (`11f812c9…6006`).
- Deletions performed by the operator in the Admin Panel (Claude's browser had no authenticated session; Claude made no deletion).
- Target documents: Blog `egkymjsalmp3zapet237us1g` — 0 rows (was 1 draft + 4 published) **absent**; Blog `n4chr9y7pnqz7edhsj3dymw6` — 0 rows (was 3 + 5) **absent**; Region `bjqzn5d654ev1imoqgv5w1zu` — **absent**.
- Snapshot now: 59 tables, 338 rows (was 359), 11 upload files (was 16). Per-table differences vs baseline:

| Table | Before → after | Rows | Explanation |
|---|---|---|---|
| `blogs` | 4 → 0 | −1, 3, 4, 5 | approved: both blog documents (draft + published) |
| `blogs_cmps` | 4 → 0 | −1, 5, 7, 9 | Strapi cascade: component links of those rows |
| `components_shared_seos` | 4 → 0 | −1, 3, 4, 5 | Strapi cascade: their SEO components |
| `blogs_regions_lnk` | 4 → 0 | −1, 3, 4, 5 | Strapi cascade: their region links |
| `files_related_mph` | 4 → 0 | −5, 6, 7, 8 | Strapi cascade: their featured-image links |
| `regions` | 1 → 0 | −1 | approved: ZZTEST Region |
| `strapi_sessions` | 5 → 6 | +32 | expected: operator's Admin Panel sign-in |
| **`files`** | **1 → 0** | **−1** | **NOT approved: WhatsApp media record (protected)** |
| **`public/uploads`** | **16 → 11 files** | 5 removed | **NOT approved:** `Whats_App_Image_…_29cc006ec0.jpeg` and its `large_`/`medium_`/`small_`/`thumbnail_` formats |

- Unchanged: all other 51 tables (admin users, roles, permissions, API tokens, core store, Users & Permissions, etc.); the 11 remaining upload files are byte-identical to the baseline (including all files referenced by the SQLite test database).
- Assessment: document deletion in Strapi 5.58 removes only the media *link* rows, never the `files` record or the physical files; their removal indicates a Media Library deletion of that asset. Not repaired.
- Recovery evidence (no action taken): the `files` row is in the verified dump (`files` 1 row, `files_related_mph` 4 rows); byte-identical copies of all 5 removed files exist in `backups/g5-stage3-pre-20261026-130916/uploads/` and `backups/n3-uploads-20261023-180809/uploads/`.
- Git (both projects) unchanged. No SQL writes, scripts, commits, pushes or deployments.

#### Media discrepancy — owner decision (2026-10-26)

The owner does not want the test images retained, so the unapproved removal of file record 1 and its 5 files is **accepted; no restore**. Recovery evidence (dump row + verified copies in two backup folders) stays preserved.

#### Clean start and role repair (2026-10-26, ~10:00 UTC)

| Check | Result | Evidence |
|---|---|---|
| Root cause of the "missing" Content Manager role | Identified | PostgreSQL had only Super Admin / Editor / Author; `admin_roles_id_seq` was still 3, so no role insert had ever reached PostgreSQL (sequences are not rolled back). `up_roles_id_seq` still 2 (not created in Users & Permissions either). SQLite `manual-test.db` unchanged since 24 Oct (hash = backup). The only existing "Velza Content Manager" is the 24 Oct one in the SQLite G5 test database. Admin Panel role list matched PostgreSQL (3 roles) — not a display or visibility problem. |
| Corrective action | PASS | Created through the Admin Panel (Settings → Administration Panel → Roles → Add new role) using the owner's existing Super Admin browser session; no credentials handled. Role id 4 `Velza Content Manager` (code `velza-content-manager-mvp2niqf`), description as approved. |
| Permissions | PASS | 15 permissions, compared read-only with the approved model: 0 missing, 0 extra (same actions, subjects, field lists, no conditions). Blog/News: create, read, update, publish — no delete. Author, Category, Region: read. Media: access, create (upload), download, copy link — no update/delete, no configure-view. No Settings, users/roles, tokens, Content-Type Builder, Users & Permissions or Newsletter access. |
| Visible and assignable | PASS | Listed in Settings → Roles (0 users); offered in the "Invite new user" role list (dialog closed without submitting; no user created). |
| Database change scope | PASS | Only `admin_roles` +1, `admin_permissions` +15, `admin_permissions_role_lnk` +15; all other tables and all 11 upload files unchanged. |
| Super Admin | PASS | User 1, Super Admin, active, unchanged (role 1, 112 permissions). |
| Content state | PASS (already clean) | PostgreSQL: 0 Blogs, News, Regions, Authors, Categories, Newsletter issues, files, SEO components. Nothing further deleted. |
| Media | PASS | 0 media records in PostgreSQL. The 10 remaining image files in `public/uploads` (+ `.gitkeep`) are referenced only by the preserved SQLite G5 test database — kept, flagged for a later decision. |
| Health / identity | PASS | `/_health` 204; Strapi PID 15016 on `127.0.0.1:1338` connected to `velza_cms2` as `velza_cms2_app`. |
| Backup / Git | PASS | Backup unchanged (`a087519e…9733`); both repositories unchanged (website: 2 modified, `server/cms/` untracked, 3 stashes). |
| Not done (separate approval) | — | Public `find` permissions, registration off, API tokens, regions `hk`/`in`/`ph`, assigning a real user. |

#### Phase 5 — Public API security and regional readiness (2026-10-26) — PASS

Changes were made through the Admin Panel (owner's existing Super Admin session), plus one website config line and one test expectation.

| Check | Result | Evidence |
|---|---|---|
| Preflight | PASS | `velza_cms2`/`velza_cms2_app`/5433, health 204, backup `a087519e…9733`, no change since the previous audit; Region schema = `name` (required, unique) + `slug` (uid, required), no draft & publish |
| Public role | PASS | Added `find` only on Blog, News Article, Region (`up_permissions` 14–16); the 8 existing `auth.*` kept. `findOne` not granted — the client resolves slugs through the collection endpoint (`velza-cms-client.js:201`) |
| Registration | PASS | Advanced settings "Enable sign-ups" = false (`strapi_core_store_settings` row 27 = `plugin_users-permissions_advanced`); requirement C2 in `integration/README.md` |
| Anonymous access | PASS | 200: `GET /api/blogs`, `/api/news-articles`, `/api/regions`; `?status=draft` returns no drafts (published-only middleware; no draft content exists to test exposure further). 403: findOne on blogs/regions, authors, categories, newsletter-issues, users, `POST/PUT/DELETE /api/regions`, `POST /api/upload`. 405: `POST /api/blogs` (route not exposed). 400 "Register action is currently disabled". 401: `/admin/users`, `/admin/roles` |
| Regions | PASS | Hong Kong `hk` (`noxiogqo42wlgm3ae68fgcw4`, id 2), India `in` (`scxk4db3okie0fc4a8ruik10`, id 3), Philippines `ph` (`boof09yqwv01cvpnceof9x1v`, id 4); each returned anonymously by `GET /api/regions?filters[slug][$eq]=<slug>` |
| Website config | PASS | `shared/js/velza-cms/cms-config.js`: `regionSlugs: { hk: 'hk', ph: 'ph', in: 'in' }` (only that line; `baseUrl` still `null`, so the integration stays disabled and the live pages are unchanged; the line-24 "PLACEHOLDER … pending F6a" comment left as is per instruction) |
| Route resolution | PASS | Site client + site config against the local CMS: `data-cms-region` hk/in/ph → slug → the matching Region; blog/news region-filter and populate queries accepted (0 items); unknown slug → null. `test:live-local`: 1 pass, 1 skip (token-only test) |
| Tests | PASS | `npm test` 74/74 after updating one expectation in `integration/tests/content-listing.test.mjs` (line 214: `regionSlugs` now the approved slugs; the disabled-by-default `baseUrl: null` assertion unchanged) |
| Database scope | PASS | vs pre-Phase-5 snapshot: `regions` +3; `up_permissions` +3; `up_permissions_role_lnk` +3; `up_roles` row 2 re-saved; core-store row 27 (advanced settings) changed. Nothing else; uploads unchanged |
| Content Manager role | PASS | Unchanged: 15 permissions, exact match with the approved model |
| Branding / Strapi code | PASS | No file under `velza-cms/` changed |
| Git | PASS | Workspace: `integration/tests/content-listing.test.mjs` modified (1 line) + 2 untracked files. Website: `cms-config.js` (now including the slug line) and `content-listing.js` modified, `server/cms/` untracked, 3 stashes. No commit, push or deployment |

**API tokens (no change):** "Read Only" (read-only, unlimited, last used 2026-10-23 11:02 UTC) and "Full Access" (full-access, unlimited, never used). No code uses either: browser code is tokenless by design (the client throws if a token is used in a browser), the integration kit only reads an optional `CMS_LIVE_TEST_TOKEN` env var, and `server/cms/render-article.mjs` accepts an optional server-side `token` that is not configured — with Public `find` it works without one. **Recommendation (needs approval):** delete "Full Access"; delete "Read Only" too (nothing needs it), or, if a server-side token is wanted later, replace it with a new *custom* token limited to `find` on Blog/News/Region with a 90-day lifespan, stored only in server configuration.

#### Phase 6 — Token assessment and integration readiness (2026-10-26) — ASSESSMENT COMPLETE, no changes

**1. API tokens (unchanged; deletion awaits explicit approval).** Admin Panel and database agree: "Read Only" (read-only, unlimited, last used 2026-10-23 11:02 UTC) and "Full Access" (full-access, unlimited, never used). No reference in website code, `server/cms/`, `deployment/`, the integration kit (only an optional `CMS_LIVE_TEST_TOKEN` env var for an opt-in test) or the CMS project; the website has no `.env`, CI, Wrangler or hosting config; no Windows scheduled task mentions Strapi/Velza/CMS. External callers cannot be ruled out from local evidence, but none is evidenced. **Recommendation:** delete both through Settings → API Tokens. If a server-side token is needed later: one custom token, `find` on Blog/News Article/Region only, 90-day lifespan, stored only in server configuration.

**2. Integration architecture (as implemented).**
- Static site (Apache `.htaccess` regional routing, Cloudflare). Static pages: all region pages, including `regions/<hk|in|ph>/blogs.html`, `news.html` and static articles in `regions/<r>/blogs/*.html`, `regions/<r>/news/*.html`.
- Listings: `content-listing.js` enhances `[data-cms="blog-list"|"news-list"][data-cms-region="hk|in|ph"]`; `regionSlugs[region]` → `GET /api/blogs|news-articles?filters[regions][slug][$eq]=<slug>&sort=publicationDate:desc&pagination[pageSize]=12&populate=…` (no token). Merge mode, fallback to static cards on error/empty; cards built with `textContent`/attributes (no HTML parsing).
- Client: `velza-cms-client.js` (list + slug lookup via the list endpoint, `pageSize=1`; 8–10 s timeout; typed `CmsError`; refuses tokens in browsers; `mediaUrl()` prefixes `/uploads/…` with `mediaBaseUrl`/`baseUrl`, rejects non-http(s) and protocol-relative URLs, falls back to placeholder).
- Drafts: never requested; CMS `published-only` middleware forces `status=published`; renderer re-checks `publishedAt`.
- Detail pages: `server/cms/render-article.mjs` (runtime-agnostic, `fetch` only) renders `/blogs/<slug>` and `/news/<slug>` into templates built from the live article shell; static files take precedence; region re-checked; unknown/draft/other-region → 404, CMS failure → 503; escapes all text, sanitises links, safe JSON-LD; SEO from the `seo` component (metaTitle/metaDescription/canonicalUrl/ogTitle/ogDescription/shareImage/noIndex) with fallbacks; related = newest entries in the same region. Needs a **server-side execution point** (Worker or build step) — cPanel excludes `server/`.
- Config: listings need only `baseUrl` (+ `regionSlugs`, `detailPages`); detail pages additionally need `siteOrigin` in the renderer config.

**3. Configuration strategy.** Local: no file edits — `integration/tools/dev-site-server.mjs` overrides the config in memory (`DEV_CMS_URL` must be localhost; `DEV_CMS_REGION_HK/IN/PH`; `DEV_CMS_DETAIL=true`). Production: committed `cms-config.js` keeps `baseUrl: null` until the HTTPS CMS origin, CORS allow-list and hosting are approved; then set `baseUrl` (and `mediaBaseUrl` if a CDN is used). No token in browser code.

**4. Detail-page plan.** Keep Public `find` only (list endpoint + slug filter is sufficient; `findOne` stays off). Run `renderArticle` in a Cloudflare Worker bound to `/blogs/*` and `/news/*` that serves the origin's static file first and renders CMS pages on a static 404 (recommended §6), or generate static files on publish. Then set `detailPages: true` and `siteOrigin`.

**5. Tests run (this phase).** `npm test` 74/74 (mock CMS: escaping, media fallback, timeouts/network errors, empty/error states, region isolation, 404/503, static precedence, no token in config). `test:live-local` 1 pass / 1 skip. Live smoke via dev-site server against `127.0.0.1:1338`: `/blogs?_r=hk` 200, `/news?_r=in` 200, unknown CMS slugs (hk, ph) 404, malformed slug 404, existing static article 200; dev server stopped. Database and uploads unchanged (59 tables / 378 rows / 11 files).

**6. Gaps / decisions.**
- **Author and Category are hidden from anonymous readers**: the client populates them, but Strapi strips relations whose target the role cannot `find` (`@strapi/utils` `remove-restricted-relations.js`; media fields are not affected). Bylines/category labels and JSON-LD author/section will be missing. Options: grant Public `find` on Author and Category (needs approval), or accept the omission.
- Functional tests with real content need temporary fixtures (approval: clearly labelled Blog/News drafts+published in `velza_cms2`, created and deleted by the Content Manager role).
- Pending business decisions: canonical/site origin (F4b/F4c), news expiry/embargo (F2/F3), production domains; CORS allow-list and `poweredBy` (Phase 5 M1); CMS hosting; detail-page hosting (Worker vs build); `cms-config.js` line-24 comment still says "PLACEHOLDER … F6a".

**7. Ordered plan.** (a) Token deletion [approval]. (b) Author/Category public `find` decision [approval]. (c) Approved fixtures → live functional run of the test matrix → fixtures removed [approval]. (d) Hosting/domain/CORS decisions → production CMS on HTTPS [approval]. (e) Worker for detail pages, `siteOrigin`, `detailPages: true` [approval]. (f) Set production `baseUrl`, staging check, release [approval]. Risks: CORS/HTTPS misconfiguration, cPanel deploying the integration branch to production, Cloudflare cache on `/shared/` (purge needed), missing bylines if (b) is declined.

#### Phase 7 — Local integration, fixtures, Worker detail pages (2026-10-26) — PASS (production still disabled)

**Preflight — PASS.** Health 204; `velza_cms2`; backup `a087519e…9733`; database unchanged since Phase 6; content clean (0 blogs/news/authors/categories/files; 3 regions); Public = `find` on Blog/News/Region only; registration off; both tokens present; Content Manager role exact (15); `cms-config.js` `baseUrl: null`, slugs `hk/ph/in`; Git state as recorded, 3 stashes.

**Implementation (website repo; pre-change copy of `server/cms/` and the Worker archived in the session scratchpad `website-pre-phase7/`):**
- `server/cms/markers.mjs` (new): the template markers without Node imports.
- `server/cms/build-templates.mjs`: imports/re-exports `MARKERS`; also writes `templates/index.mjs` (templates as strings for the Worker). Re-run: the 6 HTML templates are byte-identical to before.
- `server/cms/templates/index.mjs` (generated, 208 KB).
- `server/cms/render-article.mjs`: imports `MARKERS` from `markers.mjs`; **security fix** — editor `seo.canonicalUrl` used only if absolute `http(s)` (found by the new tests: `javascript:` was emitted into `<link rel="canonical">`/`og:url`; the CMS field's own regex also rejects it).
- `server/cloudflare-worker.js`: after the origin answers **404** for `/blogs/<slug>` or `/news/<slug>` (GET/HEAD) and only when `env.CMS_BASE_URL` is set, calls `renderArticle` with the visitor's region, `cms-config.js` `regionSlugs`, `SITE_ORIGIN`, optional `CMS_MEDIA_BASE_URL`; 200 → `X-Velza-Source: cms`; CMS failure → region 503 page + `Retry-After: 60`; anything else keeps the origin 404. No token. Static files always win.
- `server/cms/README.md`: documents the above.
- Workspace: `integration/tests/worker.test.mjs` (new, 11 tests) and `integration/package.json` (adds it to `npm test`).

**Fixtures (created and published through the Admin Panel; all deleted again):**

| Fixture | Document ID | Region | State |
|---|---|---|---|
| INTEGRATION_TEST_ONLY_BLOG_HK (title/excerpt/body/SEO contain harmless markup) | `duc5l5kzfo4wuod5hvgqlymr` | hk | published |
| INTEGRATION_TEST_ONLY_BLOG_IN | `e0o6aiyqm4yj93rhw8we33s4` | in | published |
| INTEGRATION_TEST_ONLY_BLOG_PH | `jl9b43xiapph90xig0wrwoxp` | ph | published |
| INTEGRATION_TEST_ONLY_BLOG_HK_DRAFT | `r648kvoio1mtnuq2170itbwi` | hk | draft only |
| INTEGRATION_TEST_ONLY_NEWS_HK / _IN / _PH | `jacjvs25wccssbhzrrg6cjrt` / `fue63yq1b04a916kl0hh1pn0` / `ewca8thrh6g8wn2ufz1tn0fi` | hk / in / ph | published |
| `integration-test-only-image.png` (generated 200×120 PNG, required featured image) | file id 2 | — | — |

**Test matrix (all executed):**

| Test | Result | Evidence |
|---|---|---|
| HK / IN / PH Blog listing | PASS | API + browser (dev server, real CMS): exactly one own-region card each; `pageSize=12`, `publicationDate:desc` |
| News listing per region | PASS | same, three regions |
| Cross-region lookup | PASS | API slug+other region → 0; Worker/dev-server detail from another region → 404 |
| Published detail by slug | PASS | Worker (live, Node) 200 `X-Velza-Source: cms` for all 6; dev server 200 |
| Unknown slug | PASS | 404 (origin/region 404 page) |
| Existing static detail URL | PASS | `/blogs/global-brand-partnership` served from the static file; CMS not consulted (offline test) |
| Unpublished content | PASS | draft-only fixture: API 0 results (also with `?status=draft`), detail 404 (also with `?status=draft&populate=*`) |
| Author / Category anonymously | PASS | 403; populated relations absent from Blog/News responses |
| Blog/News write anonymously | PASS | POST/PUT/DELETE 405 (routes not exposed) |
| Admin endpoint anonymously | PASS | 401 |
| Missing image | PASS (offline) / N/A live | featured image is required by the schema, so a published entry cannot lack one; offline tests verify the placeholder |
| CMS unavailable | PASS | listing keeps static cards (`error: network`); Worker → region 503 + `Retry-After: 60` |
| Empty result | PASS | listing keeps static cards |
| Malicious HTML content | PASS | browser DOM: no `on*` attributes, no injected `<img>`, markup shown as text; `<title>`/meta escaped; JSON-LD `application/ld+json` with `<`; no console execution |
| No token or secret | PASS | Worker: 24 CMS calls, 0 `Authorization` headers; browser requests are plain GETs (client refuses tokens in browsers); config has no token |
| Regional route resolution | PASS | `data-cms-region` hk/in/ph → slugs → Region docs; Worker region from `?_r=` |
| Query parameters cannot bypass filters | PASS | visitor parameters never forwarded; every CMS query region-filtered |
| Caching | PASS | all HTML responses `private, no-cache, must-revalidate` |
| Offline suite | PASS | `npm test` 85/85 (74 existing + 11 Worker) |

**Cleanup — PASS.** Admin Panel bulk delete of the 4 Blog and 3 News documents (rows verified by title/ID first) and Media Library delete of file 2. Audit vs the pre-fixture snapshot: only `strapi_sessions` (+1, 1 updated — the admin sign-in used for this work); 0 blogs/news/files/SEO components; 3 regions intact; `public/uploads` byte-identical (11 files); both tokens unchanged (Read Only last used 2026-10-23, Full Access never); Author/Category still private; Public and registration unchanged; Content Manager role exact; SQLite G5 file and backup unchanged. Dev servers stopped; browser tab closed.

**Production prerequisites (nothing changed):** HTTPS CMS host and `baseUrl`; CORS allow-list (currently any origin); `poweredBy` removal; `SITE_ORIGIN` / canonical policy (F4b/F4c); media origin (`CMS_MEDIA_BASE_URL` or CMS); Worker deployment (no `wrangler` config exists; routes `/blogs/*`, `/news/*` or the existing router route; `cms-config.js` is bundled, so regionSlugs come from it); `.cpanel.yml` deploys any checked-out branch to production and excludes `server/` (Worker must ship via Cloudflare, not cPanel); Cloudflare purge for `/shared/` changes; staging run of this matrix; rollback = unset `CMS_BASE_URL` (Worker reverts to routing only) and `baseUrl: null`. Bylines/category labels will not appear while Author/Category stay private (accepted).

#### Phase 8 — Production architecture, security and release readiness (2026-10-26) — PLANNING COMPLETE; nothing provisioned, deployed or changed

**Re-verified:** health 204 (PID 15016, `velza_cms2`); backup `a087519e…9733`; workspace and website Git state unchanged since Phase 7 (website branch `feature/strapi-blog-news-integration`, modified `server/cloudflare-worker.js`, `cms-config.js`, `content-listing.js`, untracked `server/cms/`, 3 stashes; workspace: `integration/package.json`, `content-listing.test.mjs` modified, `worker.test.mjs`/status file/review copy untracked); Phase 7 archive intact. Only this file was edited.

| Assessment | Status |
|---|---|
| A. Current architecture | PASS |
| B. Hosting model | PASS (recommendation) — BLOCKED on provider confirmation and owner choice |
| C. Hostname, CORS, environment, secrets | PASS (design) — BLOCKED on domain approval |
| D. URL, SEO and media policy | PASS (documented) — open decisions listed |
| E. Worker deployment | PASS — bundle verified offline; no Cloudflare action taken |
| F. cPanel risk and release controls | PASS (documented) |
| G. Staging matrix | PREPARED — NOT RUN |
| H. Rollback plan | PASS (documented) — NOT exercised |

**A. Current architecture (evidence).** Website: static HTML on cPanel shared hosting (`/home/velzhsrg/public_html`), Apache `.htaccess` regional routing (Route A, Cloudflare proxy + `CF-IPCountry`), canonical host forced to `https://www.velzaglobal.com` (`.htaccess` lines 55–57) and HTTPS; one URL per page for all regions, region from country or `?_r=`. Every static article's canonical/`og:url` is `https://www.velzaglobal.com/<blogs|news>/<slug>` (14/14). CMS: Strapi 5.58.0 locally on PostgreSQL 18 (`velza_cms2`); `config/server.ts` has no `url`/`proxy`; `config/middlewares.ts` uses default `strapi::cors` (any origin) and `strapi::poweredBy`; upload provider = local disk (`public/uploads`). Integration: browser listings (tokenless, `baseUrl: null` = off); Worker detail rendering (`CMS_BASE_URL` unset = off).

**B. Hosting.** The cPanel plan is evidenced only as PHP/Apache static hosting with a MySQL-style `private_config`; nothing shows a persistent Node.js process or PostgreSQL — treat it as **unsuitable for Strapi** unless the provider confirms otherwise.
- **Recommended:** Strapi on a Node.js host that runs a persistent process (small VPS with a process manager, or a container PaaS) + **managed PostgreSQL** (automated backups, point-in-time recovery, TLS) + **object storage for media** (S3-compatible, e.g. Cloudflare R2, via an official Strapi upload provider — a new dependency, needs approval) or a persistent volume; fronted by Cloudflare (proxied DNS, TLS), Strapi `url` set and `proxy: true`.
- **Fallback:** Strapi Cloud (Strapi's managed hosting: Node, PostgreSQL and media included); less control, vendor pricing.
- **Not recommended:** cPanel "Setup Node.js App" — only if the provider confirms Node 20/22, a persistent process with enough memory, outbound PostgreSQL and process restarts.
- **Confirm with providers:** Node version and memory, persistent process/restart policy, PostgreSQL version (≥ 14; local is 18) and backup/PITR retention, media storage and egress, log retention, health checks, TLS, region/latency to HK/IN/PH, cost. No prices recorded (no reliable evidence gathered).

**C. Hostname, CORS, environment, secrets (proposals, not resources).**
- Proposed CMS hostnames: `cms.velzaglobal.com` (production) and `cms-staging.velzaglobal.com` (staging) — **proposals only**; DNS not created.
- Origins needing browser access: `https://www.velzaglobal.com` (evidenced canonical host; apex redirects to it) and, for staging, `https://staging.velzaglobal.com` (documented in DEPLOY.md, existence not verified). Both to be confirmed by the owner.
- CORS (future code change, approval needed): replace `'strapi::cors'` with `{ name: 'strapi::cors', config: { origin: [<approved origins>], methods: ['GET', 'HEAD', 'OPTIONS'], credentials: false } }` per environment. The Admin Panel is same-origin with the CMS, so it is unaffected.
- **Worker → CMS is server-to-server: no CORS involved.** Only the browser listing requests need the allow-list.
- `poweredBy`: remove `'strapi::poweredBy'` from `config/middlewares.ts` (supported middleware list) — approval needed.
- Strapi environment (host secret store, never Git): `NODE_ENV=production`, `HOST`, `PORT`, public URL for `url`, `APP_KEYS`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_CLIENT=postgres`, `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD`, `DATABASE_SSL=true` (+ CA), upload-provider credentials. New production secrets — never reuse local ones.
- Worker environment: `CMS_BASE_URL`, `SITE_ORIGIN`, optional `CMS_MEDIA_BASE_URL` — all **non-secret plain vars**; no secret needed (tokenless). Browser: only `baseUrl` (and optional `mediaBaseUrl`) in `cms-config.js` — public by design; tokens are refused in browsers by the client.
- Admin protection (recommended): Cloudflare Access (or IP allow-list) in front of `/admin` on the CMS host, plus strong passwords/SSO; keep registration off.

**D. URL, SEO and media policy.**
- `SITE_ORIGIN = https://www.velzaglobal.com` (matches all existing canonicals; staging: its own origin with `noindex` already sent by `.htaccess`).
- Detail routes: `/blogs/<slug>`, `/news/<slug>` (no `.html`, no trailing slash — Worker accepts an optional trailing slash; static pages keep their existing `.htaccess` behaviour). Slugs must match `^[a-z0-9]+(-[a-z0-9]+)*$`, otherwise 404.
- Canonical: editor `seo.canonicalUrl` if absolute `http(s)` (Phase 7 fix; the CMS field regex also validates), else `SITE_ORIGIN + path`. Restricting canonicals to approved domains = decision F5. `og:url` = canonical; `og:locale` per region; `og:image` = share image or featured image.
- Unknown, draft, unpublished, deleted, other-region or malformed slugs → the region's own 404 page (status 404); CMS failure → region 503 page + `Retry-After: 60`; static files always win.
- Media: absolute URLs built from `CMS_MEDIA_BASE_URL`/`mediaBaseUrl` or the CMS origin; production must serve media over HTTPS from the CMS or a CDN/R2 domain; missing featured image → placeholder `/shared/images/blog-hero-banner.webp`; non-http(s) media URLs rejected.
- **SEO limitations to decide:** (1) one URL serves all regions and search crawlers are routed to the default region (HK), so a CMS post assigned only to India or the Philippines returns 404 to such crawlers and will not be indexed — editorial rule (include HK for indexable posts) or a regional-URL policy (F4b/F4c); (2) CMS listing cards are added client-side, so crawlers see the static cards on listing pages; (3) no `hreflang` today.
- **Bylines/categories:** hidden while Author/Category stay private (Strapi strips the relations). Options (no change made): keep omitted (current); grant Public `find` on Author/Category; give only the Worker a narrowly scoped read token (Worker secret) so detail pages show bylines while browsers stay tokenless; or add a plain byline text field (schema change).

**E. Worker deployment (nothing created).** Entry `server/cloudflare-worker.js`; ES module; no `nodejs_compat` needed. Offline bundle check (esbuild 0.28.2, output only in the session scratchpad): 8 inputs, **0 `node:` imports, 0 unresolved imports**, 231,577 bytes / 37,283 gzipped, bundle loads. Proposed config (not created): `name`, `main = "server/cloudflare-worker.js"`, `compatibility_date` set at deploy time, `[vars] SITE_ORIGIN`, `CMS_BASE_URL` left unset for the first deploy; routes limited to `www.velzaglobal.com/blogs/*` and `www.velzaglobal.com/news/*` (the Worker's origin subrequests go to `/regions/<r>/…`, outside those routes, so no loop; `.htaccess` routing stays in charge of everything else). Build step: `node server/cms/build-templates.mjs` whenever the article shell changes (templates must be regenerated before bundling). To verify on staging: the origin returns real 404 status codes for missing files; region detection matches `.htaccess`; 503 page and `Retry-After`; HTML `private, no-cache`. Worker request volume counts against the Cloudflare plan's limits — confirm the plan.

**F. cPanel risk and release controls.** `.cpanel.yml` publishes whatever branch the cPanel repo has checked out to production, without `--delete`, excluding `server/` (correct — the Worker ships through Cloudflare, not cPanel). Safeguards:
1. Environments: local (dev server) → staging (`staging.velzaglobal.com` from a separate cPanel repo on a long-lived staging branch whose manifest targets `/home/velzhsrg/staging`, per DEPLOY.md; staging CMS + staging Worker route) → production (cPanel repo pinned to `main`).
2. Only reviewed pull requests merge to `main`; the integration work (currently uncommitted, `server/cms/` untracked) first goes into a reviewed commit/PR.
3. Before "Deploy HEAD Commit": in cPanel confirm branch = `main` and HEAD = the reviewed commit hash; review `git diff <previous-release>..<release>`.
4. Run `npm test` (85) against the release commit, plus the staging matrix (G).
5. Read the deploy log's first line (`PUBLISHING branch … LIVE -> …`).
6. Purge Cloudflare only for changed `/shared/` URLs (e.g. `/shared/js/velza-cms/cms-config.js`, `content-listing.js`, `velza-cms-client.js`) after confirming the zone.

**G. Staging matrix (prepared, NOT RUN).** Start from the existing tests: `npm test` (85 offline), `test:live-local` with `CMS_LIVE_TEST_URL=<staging CMS>`, the Phase 7 Worker harness pointed at staging, and browser checks.
- CMS/security: TLS certificate valid; `/_health` 204; DB connectivity; CORS — `Origin: https://staging.velzaglobal.com` gets `Access-Control-Allow-Origin`, an unlisted origin gets none; anonymous `find` on Blog/News/Region 200; `findOne`, Author, Category, users 403; writes 403/405; `/admin/*` API 401; registration disabled; `?status=draft` returns published only; no `X-Powered-By`; no token in browser requests or bundles.
- Website/Worker: Blog/News listings for hk/in/ph show only own-region published content; detail pages 200 with `X-Velza-Source: cms`; static pages win; unknown/draft/other-region 404; CMS outage → listing keeps static cards, Worker 503 + `Retry-After`; media over HTTPS; placeholder on missing image; canonical/`og:url` = `https://staging.velzaglobal.com/...` on staging; HTML-injection and `javascript:` URL fixtures rendered inert; HTML `private, no-cache`; `/shared/` assets cached and refreshed after purge.
- Release: bundle reproducible from the release commit; Worker first deployed with `CMS_BASE_URL` unset and the site unchanged; approval checkpoint immediately before setting `CMS_BASE_URL` and before the cPanel production deploy; post-release health checks.

**H. Rollback (not exercised).** Worker: unset `CMS_BASE_URL` (instant; the Worker then only proxies to the origin) or roll back to the previous Worker version / remove the routes. Website: redeploy the previous `main` commit via cPanel (no `--delete`, so new files remain — remove manually if needed) or hotfix `baseUrl: null`; purge the changed `/shared/` URLs. CMS: database restore from the latest verified backup into a new database (never over the live one without approval); media from object-storage versioning or backups.

**Remaining approvals and external dependencies:** hosting provider and model; CMS hostnames and DNS; approved website origins; CORS/`poweredBy`/`url`/`proxy` code changes; production secrets and database; media storage (provider dependency); admin access protection; content migration approach (fresh install + reconfiguration vs restoring the `velza_cms2` dump — it contains the admin user, roles, Public permissions, regions and the two unused API tokens); bylines decision; regional SEO policy (F4b/F4c/F5) and news expiry/embargo (F2/F3); Worker config, routes and Cloudflare plan; staging environment; committing the integration work through a reviewed PR; release date.

#### Phase 9 — Hosting/domain decisions, migration design, pre-staging preparation (2026-10-26) — ASSESSMENT COMPLETE; nothing provisioned or changed

**Re-verified:** health 204; backup `a087519e…9733`; database unchanged since the Phase 7 clean-state audit (59 tables / 379 rows / 11 upload files); both repositories, the 3 stashes and the Phase 7 archive unchanged. Only this file was edited. Local runtime: Node v22.13.1, PostgreSQL 18.6, `package.json` engines `node >=20 <=26`.

**1. Hosting comparison** (V = verified in official docs / project evidence; A = assumption; Q = ask the provider)

| Criterion | Option 1: Node host + managed PostgreSQL + object storage (recommended) | Option 2: Strapi Cloud (fallback) | Option 3: existing cPanel |
|---|---|---|---|
| Strapi runtime | V: Strapi needs Node active/maintenance LTS 22/24/26, min 1 core/2 GB RAM, recommended 2+ cores/4 GB; Q: plan size | V: Strapi's own platform | Q: Node 22+? V (third-party guides): Node selector runs apps under Passenger, which starts/stops processes by traffic; per-account process limits can break builds |
| PostgreSQL | V: Strapi supports PG 14+ (17 recommended); A: managed PG offers 17/18; Q: version 18 available (dump made by pg_dump 18) | Q: database engine/version not stated on the pricing page | A: none evidenced (site config is MySQL-style); Q |
| Backup/restore | Q: automated backups, point-in-time recovery, retention | V: Starter none; Pro weekly + manual (1 month); Business daily + manual (1 month) | Q |
| Media | V: official S3 provider supports Cloudflare R2 (endpoint, `region: 'auto'`, no ACL; CSP `img-src`/`media-src` must allow the bucket host); or a persistent disk with the local provider | V: assets included (Starter 50 GB storage/50 GB bandwidth; Pro 250/500; Business 1,000/1,000) | Q: persistent disk; A: local provider on account storage |
| HTTPS / custom domain | A: via Cloudflare proxy + host TLS | V: custom domain on all plans | V: site already proxied by Cloudflare |
| Env vars / secrets | A: platform secret store | A: dashboard env vars | Q: Node selector env vars |
| Logs / monitoring / recovery | Q: log retention, health checks on `/_health` (V: returns 204), auto-restart | A: platform-managed | Q / A: limited |
| Operations | Medium (we manage Strapi, upgrades, backups policy) | Low | High risk, uncertain |
| Cost | Q: obtain quotes (no reliable figures gathered) | V: Starter $35, Pro $90, Business $450 per project per month (yearly up to 17% less) | Q |

**Recommendation:** Option 1 with Node 22 LTS (matches local), managed **PostgreSQL 18** (same major as the dump; if only 17 is available, prove the restore on staging first), Cloudflare R2 for media via the official S3 provider, Cloudflare-proxied hostname. **Fallback:** Strapi Cloud Pro (weekly backups) if self-management is not wanted. Option 3 only if the provider confirms all Q items in writing.

**Provider questions:** Node version and persistent-process policy; RAM/CPU; PostgreSQL major version, TLS, private networking, backup frequency/PITR/retention, restore procedure; disk persistence; environment-secret storage; health checks and auto-restart; log retention; regions/latency to HK/IN/PH; pricing.

**2. Hostname and CORS proposal (not applied).** `cms.velzaglobal.com` (production) and `cms-staging.velzaglobal.com` (staging) — proposals. Origins: `https://www.velzaglobal.com` (verified canonical host) and `https://staging.velzaglobal.com` (documented in DEPLOY.md, not verified to exist).
- Strapi `config/middlewares.ts` (approval needed): `{ name: 'strapi::cors', config: { origin: env.array('CORS_ORIGINS'), methods: ['GET', 'HEAD', 'OPTIONS'], headers: ['Content-Type', 'Accept', 'Origin'], credentials: false } }`; remove `'strapi::poweredBy'` (the documented way: only middlewares present in the list run); when R2 is used, extend `strapi::security` CSP `img-src`/`media-src` with the media host.
- Strapi `config/server.ts` (approval needed): `url: env('PUBLIC_URL')` (absolute https), `proxy: { koa: true, maxIpsCount: 1, ipHeader: 'CF-Connecting-IP' }` when behind Cloudflare only (or `X-Forwarded-For` for a single platform proxy).
- Browser CORS applies only to listing requests from the website; the Worker's CMS requests are server-to-server and need no CORS. Browser stays tokenless; Author/Category stay private; registration stays off. Secrets only in the host secret store; `CORS_ORIGINS`, `PUBLIC_URL` and the Worker's `CMS_BASE_URL`/`SITE_ORIGIN` are non-secret.

**3. Database migration — recommendation: B (restore the verified dump into a new, isolated database).**
- A (fresh): clean, but the Super Admin, Velza Content Manager role (15 field-scoped permissions), Public `find` permissions, disabled registration and the three regions must be recreated by hand and re-verified.
- B (restore): reproduces the configured state exactly. **Correction (verified offline):** the verified 14:48 dump predates the Phase 3–5 changes — it holds roles Super Admin/Editor/Author only (no Velza Content Manager), region `ZZTEST Region` only, the 4 ZZTEST blog rows and file 1, Public without content `find`, `allow_register: true`, and the two API tokens. It is the right rollback point for 14:48 but **not** a migration source. A **new dump of the current `velza_cms2`** (Super Admin, 4 roles incl. Velza Content Manager with 15 permissions, Public `find` ×3, registration off, regions hk/in/ph, 0 content, 2 API-token records, admin sessions, core-store settings) must be taken and verified first.
- Sequence: (1) confirm target PG version/capacity; (2) **take a new pg_dump** with the existing procedure and verify it (hash, `pg_restore --list`, full decode); (3) restore into a new empty database on the target (never `velza_cms2`); (4) validate schema and row counts against the source snapshot; (5) review admin accounts (Super Admin only; old sessions become invalid with new secrets); (6) API tokens: records restore but stop working with a new `API_TOKEN_SALT` — decide retain/delete (unchanged in this phase); (7) verify Public = `find` on Blog/News/Region and registration off; (8) verify regions hk/in/ph and 0 content documents; (9) media; (10) run the staging matrix before any hostname or integration switch. Use Strapi 5.58.0 with the same code so no schema migration runs.

**4. Media migration.** PostgreSQL currently has **0 media records** — nothing to migrate. Steps: choose storage (R2 recommended), add the official S3 provider (new dependency, approval), configure CSP, upload a labelled test asset on staging, verify HTTPS delivery and thumbnails, delete it. The 10 images in local `public/uploads` belong only to the SQLite G5 test database — do not migrate.

**5. Worker rollout and rollback.** Stage 1: deploy the existing Worker (verified bundle) on `www.velzaglobal.com/blogs/*` and `/news/*` with `SITE_ORIGIN` set and `CMS_BASE_URL` unset; verify static pages, regional routing, 404s and headers are unchanged. Stage 2 (separate approval): set `CMS_BASE_URL` to the verified HTTPS CMS on staging first, run the matrix, then production. Website release via reviewed PR → `main` → cPanel production repo pinned to `main`, verify branch/commit/diff, `npm test`, purge only the changed `/shared/js/velza-cms/*` URLs. Rollback: unset `CMS_BASE_URL` (instant) or previous Worker version/remove routes; redeploy previous `main`; `baseUrl: null` hotfix; CMS restore into a new database. Recommended GitHub controls: protect `main` (reviews required, no direct pushes), staging long-lived branch for the staging cPanel repo.

**6. Content and SEO decisions still required.** Bylines/categories (keep hidden / Public `find` / Worker-only scoped token / byline text field); canonical policy F5 (restrict editor canonicals to approved domains?); `SITE_ORIGIN = https://www.velzaglobal.com` (evidenced) and regional URLs F4b/F4c — with one URL for all regions, posts not assigned to HK are invisible to crawlers routed to HK; media host (CMS vs R2 custom domain); news expiry/embargo F2/F3; schema sufficiency — fields exist for SEO, FAQ, gallery, source, expiry; gaps only if bylines need text or a region `code` (F6a) is wanted.

**7. Staging prerequisites.** Approved hosting + staging CMS host (TLS); target PG; fresh verified dump; staging secrets; R2 bucket (if chosen); staging website (`staging.velzaglobal.com`, separate cPanel repo/branch, proxied DNS); Worker staging route; approved CORS origins; reviewed PR containing the integration work.

**8. Approval gates (in order).** G1 hosting model + provider answers → G2 CMS hostnames/DNS and website origins → G3 config code changes (CORS, poweredBy, `url`/`proxy`, upload provider, CSP) → G4 fresh dump + restore into the new staging database → G5 token/admin/session decisions on the restored copy → G6 staging website + Worker Stage 1 → G7 staging matrix sign-off → G8 production CMS → G9 Worker Stage 1 production → G10 `CMS_BASE_URL` + website `baseUrl`/`detailPages` release → G11 post-release checks. Content/SEO decisions (§6) before G7.

### §C3 Proposed configuration (not applied — owner approval required)

**Velza Content Manager** (new role; description as in the approved model: "Manages Blogs and News: read, create, update, publish and unpublish. No delete. Regions read-only. Media read, upload, download and copy link; no media update/delete. No Newsletter, no system administration."). No conditions on any permission. No user assigned unless approved.

| Subject | Actions | Fields |
|---|---|---|
| Blog | Create, Read, Update, Publish (publish also unpublishes) — **no Delete** | title, slug, excerpt, content, featuredImage, gallery, author, category, regions, publicationDate, seo (metaTitle, metaDescription, canonicalUrl, ogTitle, ogDescription, shareImage, noIndex), faqs (question, answer) |
| News Article | Create, Read, Update, Publish — **no Delete** | title, slug, summary, content, featuredImage, author, category, regions, publicationDate, expiryDate, sourceName, sourceUrl, seo (same 7 fields) |
| Author | Read only | name, slug, jobTitle, bio, avatar |
| Category | Read only | name, slug, description |
| Region | Read only | name, slug |
| Newsletter Issue | none | — |
| Media Library | Access (`plugin::upload.read`), Create/upload, Download, Copy link — **no Update, no Delete, no settings/configure-view** | — |
| Settings, Users & Roles, API/transfer tokens, webhooks, Content-Type Builder, plugins, view configuration | none | — |

**Public role (Users & Permissions):** add `find` on Blog, News Article, Region; keep the existing `auth.*` actions; nothing else.

**Users & Permissions → Advanced settings:** "Enable sign-ups" off (`allow_register: false`); other advanced settings unchanged.

**Verification after applying (read-only):** Content Manager role has exactly these 15 permissions with the listed fields and no conditions; Public has exactly the 3 `find` actions plus the 8 existing `auth.*`; `allow_register` false; Super Admin role and user unchanged.

**API tokens:** reviewed (§C2 report); unchanged pending decision.

## §4 Security configuration evidence (no runtime verification)

| Control | Evidence | Status |
|---|---|---|
| Draft exposure via Content API | `published-only` middleware forces published reads; tested by integration mocks only | Config present |
| Media `related` draft leak | Upload extension marks `file.related` private; fails closed if missing | Config present |
| Upload types | Allow-list + SVG/executables denied | Config present |
| CORS | Default (any origin) | **Open — must restrict before production** |
| `poweredBy` header | Enabled | Remove before production |
| Roles, Public permissions, registration, API tokens | Stored in DB only | Unverified today |

## §6 Architecture recommendation (draft, pending approval)

**Recommended: keep cPanel for the static site, render CMS-only detail pages in a Cloudflare Worker, host Strapi separately on a Node.js host with PostgreSQL.**

- The site is already proxied by Cloudflare, and `server/cms/render-article.mjs` is runtime-agnostic (`fetch` only). A Worker bound only to the blog/news detail routes can serve the static file first and render CMS pages on a static 404, without deploying `server/` through cPanel.
- Alternatives: (a) move the whole site to a Node host — larger change, risks the existing `.htaccess` regional routing; (b) static generation on publish — needs a build pipeline, and cPanel deploys straight to production, so automated deploys would bypass review.
- Strapi needs its own Node.js host regardless (cPanel shared hosting is not evidenced to run it) with PostgreSQL, HTTPS, `url`/`proxy` settings, CORS limited to the regional origins, and backups.
- Approval needed for: Worker deployment and routes, CMS host, DNS, CORS origins.

## §7 Production preparation gaps (known now)

CORS allow-list; remove `poweredBy`; `url` + `proxy` for HTTPS; production secrets distinct from development; PostgreSQL backup/restore (earlier N4 restore test blocked); Public role limited to `find`/`findOne` on read types; registration disabled; admin access protection (MFA/access gateway); monitoring; reviewed content migration plan.
