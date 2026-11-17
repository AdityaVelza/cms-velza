# Velza CMS — Website Integration Kit (Phase 7A)

Dependency-free client, tests and integration plan for reading published content from the Velza Strapi 5 CMS.
Nothing here changes the CMS project, its database or any live website.

| File | Purpose |
|---|---|
| `velza-cms-client.js` | ES module client (browser + Node 18+): queries, region/slug filters, populate, pagination, media URLs, errors, timeouts |
| `cms-config.example.js` | Placeholder configuration — no domains, URLs or tokens are confirmed |
| `tests/client.test.mjs` | Mock-based unit tests (`npm test`, no installs) |
| `tests/live-local.test.mjs` | Opt-in test against a **local** Strapi only (`CMS_LIVE_TEST_URL=http://127.0.0.1:<port> npm run test:live-local`) |

## 0. Phase 7B additions

- **Website source (original, untouched):** `C:\Users\ADMIN\Desktop\Velza Github\velzaglobal` — git clone of `github.com/itisatharva/velzaglobal`, branch `main`, HEAD `02e9c5f` (2026-10-15). Static HTML + jQuery/Bootstrap on Apache (`.htaccess` routing) behind Cloudflare; per-region copies in `regions/{hk,in,ph}`; blog/news content is hardcoded HTML.
- **Projects are separate (Phase 7B.1):** website = `C:\Users\ADMIN\Desktop\Velza Github\velzaglobal`; CMS = `C:\Users\ADMIN\Desktop\cms_velza_new\velza-cms`; this kit = `C:\Users\ADMIN\Desktop\cms_velza_new\integration`. Their only runtime link is the Strapi REST API.
- **Website changes** live on branch `feature/strapi-blog-news-integration` (from `main` @ `02e9c5f`), uncommitted, not pushed:
  - `shared/js/velza-cms/velza-cms-client.js` (identical copy of this kit's client — a test enforces parity)
  - `shared/js/velza-cms/cms-config.js` (**disabled by default**, placeholders)
  - `shared/js/velza-cms/content-listing.js` (progressive enhancement of blog and news listings)
  - `regions/{hk,in,ph}/{blogs,news}.html` (+6 lines each: wrapper `data-cms` attributes and one module script tag)
- **Tools (localhost only):** `tools/dev-site-server.mjs` (serves the website repo's checked-out branch with region routing; optional `DEV_CMS_URL` override), `tools/mock-cms-server.mjs` (Strapi-5-shaped `/api/blogs` and `/api/news-articles`). Worker runtime test: `tools/worker-runtime-upstream.mjs` (origin with the `.htaccess` model on :8098, seeded mock CMS on :1399) for `wrangler dev --local-upstream`, and `tools/worker-runtime-smoke.mjs` (11 checks against the Worker on :8787; see the website's `server/cms/README.md`).
- **Tests:** `tests/content-listing.test.mjs` (15 tests; reads the website repo via `WEBSITE_ROOT`, default above).
- **Fallback (intentional):** with `fallbackToStatic: true` (default) the existing static cards remain whenever the CMS is disabled, unreachable, returns an error, or has no published entries for the region.
- **Detail links (Phase 7B.3):** a CMS card links to `/blogs/<slug>` or `/news/<slug>` only if the page's own static cards already link there (a static detail page is known to exist). Other CMS cards render without links (`vg-cms-card--no-detail`, title in a `<span>`), so no visitor is sent to a 404.
- **Not yet done:** detail pages for CMS-only posts (needs a routing/canonical decision, F4b/F4c); newsletter pages (none exist on the site).

## 1. Current state (evidence as of 2026-10-24)

| Question | Finding | Status |
|---|---|---|
| Frontend source in workspace | None in `C:\Users\ADMIN\Desktop\cms_velza_new` (no HTML/JS site, no `fetch`/axios calls to Strapi) | NOT IMPLEMENTED (in workspace) |
| Live website connected to Strapi | Cannot be determined from available evidence; the live site's code and hosting are not in the workspace | UNKNOWN |
| Frontend API base URL config | No file exists in the workspace; `cms-config.example.js` here is a placeholder | NOT IMPLEMENTED |
| CMS hosting | No deployment/CI/hosting config in the project; only local `127.0.0.1:5433` database evidence | UNKNOWN (no hosted instance evidenced) |
| Strapi content API | Blog, News Article, Newsletter Issue (find/findOne), Author, Category, Region (full CRUD routes) | VERIFIED (local smoke test) |

## 2. Request flow

```
Browser (regional site HK / PH / IN)
   │  HTTPS GET /api/<type>?filters[regions][slug][$eq]=<region>&populate=…
   ▼
Strapi REST API  ──(published-only middleware, strictParams, maxLimit 100)──►  PostgreSQL
   │
   └─ media URLs in responses: "/uploads/<file>"  →  browser loads <CMS or media origin>/uploads/<file>
```

- **Direct REST vs server-side layer:** no server-side layer exists in the evidence. For a static HTML/CSS/JS site the default is **direct browser calls without a token**, relying on Public-role `find`/`findOne` permissions. A server-side layer (or build-time fetch) is needed only if a token must be used — never ship tokens to browsers.
- **Media path:** the local upload provider serves `/uploads/*` without authentication; the client resolves relative URLs against `mediaBaseUrl` (defaults to the CMS origin). A CDN/media origin is a placeholder until confirmed.
- **Regional content:** filter by the `regions` relation slug. Region slugs/codes are pending decision F6a; canonical URLs pending F4b/F4c.
- **Permissions:** Public role must be granted `find`/`findOne` on the read types only (admin action; Phase 5 checklist). Write routes on Author/Category/Region must not be public (Phase 5 M2).
- **CORS:** exact-origin allow-list from `CORS_ORIGINS` (`config/middlewares.ts`), no credentials, GET/HEAD/OPTIONS only; unset = no cross-origin access; `*` or malformed entries stop startup. Local `.env` lists the dev site only. Staging/production values are pending the confirmed site origins (B2). `X-Powered-By` is removed.
- **HTTPS:** required for CMS and media origins in production. `PUBLIC_URL` (server `url`) and `IS_PROXIED` (Koa proxy trust) are configured in `config/server.ts`; values are set per environment once the CMS domain is decided.
- **Environment config:** per-environment `baseUrl`/`mediaBaseUrl` in the frontend; CMS-side `.env` unchanged.

## 3. Content mapping (website pages are UNVERIFIED — fill in once the site source is available)

| Website page/section (placeholder) | Strapi type | Endpoint | Client call |
|---|---|---|---|
| `<BLOG_LISTING_PAGE>` per region | Blog | `GET /api/blogs` | `listBlogs({ region, page, pageSize })` |
| `<BLOG_DETAIL_PAGE>` | Blog | `GET /api/blogs?filters[slug][$eq]=…` | `getBlogBySlug(slug, { region })` |
| `<NEWS_LISTING_PAGE>` | News Article | `GET /api/news-articles` | `listNewsArticles({ region })` |
| `<NEWS_DETAIL_PAGE>` | News Article | `GET /api/news-articles?filters[slug][$eq]=…` | `getNewsArticleBySlug(slug)` |
| `<NEWSLETTER_ARCHIVE_PAGE>` | Newsletter Issue | `GET /api/newsletter-issues` | `listNewsletterIssues({ region })` |
| `<NEWSLETTER_ISSUE_PAGE>` | Newsletter Issue | `GET /api/newsletter-issues?filters[slug][$eq]=…` | `getNewsletterIssueBySlug(slug)` |
| `<AUTHOR_BYLINES / AUTHOR_PAGE>` | Author | `GET /api/authors` (or populated on blog/news) | `listAuthors()` |
| `<CATEGORY_FILTERS>` | Category | `GET /api/categories` | `listCategories()` |
| `<REGION_SWITCHER>` | Region | `GET /api/regions` | `listRegions()` |
| Page `<head>` SEO | `seo` component on Blog/News/Newsletter | populated with each item | `item.seo.metaTitle`, `metaDescription`, `canonicalUrl`, `shareImage` |
| Images | Media fields | `/uploads/*` | `client.mediaUrl(item.featuredImage, { format: 'medium' })` → `null` when missing |

Behaviour **not** implemented on purpose (pending Phase 6 decisions): hiding expired news (F2), embargo of future-dated items (F3), canonical construction per region (F4b/F4c).

## 4. Usage (browser, no token)

```html
<script type="module">
  import { createVelzaCmsClient, CmsError } from './velza-cms-client.js';
  import { cmsConfig, regionSlugs } from './cms-config.js';
  const cms = createVelzaCmsClient(cmsConfig);
  try {
    const { items, pagination } = await cms.listBlogs({ region: regionSlugs.hongKong, page: 1 });
    if (!items.length) { /* render empty state */ }
    for (const blog of items) {
      const img = cms.mediaUrl(blog.featuredImage, { format: 'medium' }); // null → placeholder image
    }
  } catch (e) {
    if (e instanceof CmsError) { /* render error state; e.kind: network | timeout | http | parse */ }
  }
</script>
```

## 5. Live-integration gate (ordered)

| # | Group | Task | Prerequisite | Evidence to mark complete | Can be done now? |
|---|---|---|---|---|---|
| A1 | Local | Client + unit tests | — | `npm test` passes | **Done** (19/19) |
| A2 | Local | Local API smoke test on throwaway SQLite | — | Smoke results | **Done** |
| A3 | Local | Wire the client into a **copy** of the website source | Website source supplied | Pages render CMS data locally | No — source not in workspace |
| B1 | Business | Sign-off pack (F2/F3 behaviour, F4 canonical/URLs, F6 region codes) | — | Signed `phase-6i-business-signoff-pack.md` | No — pending owner |
| B2 | Business | Confirm production domains/base URLs per region | — | Values in sign-off pack §5 | No — pending owner |
| C1 | Admin | N4 restore test (role + `pg_hba.conf`) | Admin action | N4 PASS report | No — blocked |
| C2 | Admin | Users & Permissions review: registration off/limited; Public = find/findOne on read types only | Admin access | Admin confirmation / read-only check | No — pending approval |
| C3 | Admin | Create real region records (codes per F6a) and content | B1, C2 | Records visible via API | No |
| D1 | Deploy | Host Strapi over HTTPS (`url`, `proxy`, `NODE_ENV=production`, `strapi start`) | Hosting access, C1 | Reachable HTTPS CMS URL | No — no hosting evidence |
| D2 | Deploy | Set `CORS_ORIGINS` to the confirmed site origins (code done: allow-list, `poweredBy` removed) | B2 | Live preflight rejects unlisted origins | No — origins pending |
| D3 | Deploy | Media origin/CDN decision and `mediaBaseUrl` | B2, E4 decision | Images load from final origin | No |
| D4 | Deploy | Deploy the website build that uses the client, per region | A3, D1–D3 | Staging site renders CMS content | No |
| E1 | Release | Staging end-to-end: listings, details, regions, SEO tags, images, errors | D4 | Phase 7B/8 test report | No |
| E2 | Release | Production cut-over and monitoring | E1, owner approval | Phase 8 release sign-off | No |

**When the live connection happens:** only after D4 deploys a website build configured with a confirmed HTTPS CMS URL (D1) whose CORS (D2) and Public permissions (C2) allow it — which in turn needs business sign-off (B1/B2) and N4 (C1). No date can be estimated from current evidence.
