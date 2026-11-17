// Cloudflare Worker (website server/cloudflare-worker.js) for CMS article routes, run in Node.
// The origin is tests/helpers/origin-sim.mjs: the website repository's files behind a model of its
// .htaccess rules (region rules parsed from the real file). The CMS is the in-process mock Strapi.
// Only 127.0.0.1 is contacted. Passing here does not prove Cloudflare runtime behaviour.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startMockStrapi, makeEntry } from './helpers/mock-strapi.mjs';
import { createOriginSim } from './helpers/origin-sim.mjs';

const WEBSITE_ROOT = resolve(process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal');
const SITE = 'https://www.velzaglobal.com';
const { default: worker } = await import(pathToFileURL(join(WEBSITE_ROOT, 'server', 'cloudflare-worker.js')).href);
const { regionFor } = await import(pathToFileURL(join(WEBSITE_ROOT, 'server', 'cms', 'region.mjs')).href);

const sim = createOriginSim(WEBSITE_ROOT);
// esbuild comes with the CMS's admin tooling (Vite); used only to check the bundled Worker.
const CMS_PACKAGE = resolve(process.env.CMS_ROOT || fileURLToPath(new URL('../../velza-cms', import.meta.url)), 'package.json');
const esbuildPath = existsSync(CMS_PACKAGE) && (() => { try { return createRequire(CMS_PACKAGE).resolve('esbuild') && CMS_PACKAGE; } catch { return null; } })();
let cms; let env; let cmsRequests; let clientPaths; const realFetch = globalThis.fetch;

before(async () => {
  cms = await startMockStrapi();
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    if (new URL(req.url).origin === SITE) return sim.handle(req);
    cmsRequests.push({ url: req.url, authorization: req.headers.get('authorization') });
    return realFetch(req);
  };
});
after(async () => { globalThis.fetch = realFetch; await cms?.close(); });
beforeEach(() => {
  cms.state.blogs.length = 0; cms.state['news-articles'].length = 0; cms.state.fail = false;
  cmsRequests = []; clientPaths = new Set(); sim.requests.length = 0; sim.overrides.clear();
  env = { CMS_BASE_URL: cms.url, SITE_ORIGIN: SITE };
});
afterEach(() => {
  // Requests the Worker makes itself (anything other than the visitor's own URL) never target /regions/.
  const own = sim.requests.filter((r) => !clientPaths.has(r.path));
  assert.ok(own.every((r) => !/^\/+regions\//i.test(decodeURIComponent(r.path))), 'the Worker never requests /regions/ from the origin');
});

const request = (path, { method = 'GET', country } = {}) =>
  new Request(SITE + path, { method, headers: country ? { 'CF-IPCountry': country } : {} });
const read = async (res) => ({ status: res.status, headers: res.headers, text: await res.text() });
const call = async (path, { workerEnv = env, ...opts } = {}) => {
  clientPaths.add(new URL(SITE + path).pathname);
  return read(await worker.fetch(request(path, opts), workerEnv));
};
const direct = async (path, opts = {}) => read(await sim.handle(request(path, opts)));
const hkBlog = (over = {}) => makeEntry({ slug: 'cms-only-blog', title: 'CMS only blog', regions: [{ slug: 'hk', name: 'Hong Kong' }], ...over });
const regionFile = (region, name) => readFile(join(WEBSITE_ROOT, 'regions', region, name), 'utf8');

const assertSame = (got, want, label) => {
  assert.equal(got.status, want.status, label);
  assert.equal(got.text, want.text, `${label}: body`);
  for (const [name, value] of want.headers) assert.equal(got.headers.get(name), value, `${label}: ${name}`);
  assert.equal(got.headers.get('x-velza-source'), null, label);
};

// --- Region selection mirrors .htaccess section 9 ---------------------------------------------

test('region selection matches the .htaccess rules (parsed from the real file) for queries and countries', () => {
  assert.deepEqual(sim.rules.map((r) => `${r.kind}:${r.region}`), ['query:in', 'query:ph', 'query:hk', 'country:in', 'country:ph', 'fallback:hk'],
    '.htaccess section 9 changed: update the Worker region rules to match');
  const queries = ['', '_r=hk', '_r=in', '_r=ph', '_r=IN', '_R=ph', '_r=xx', '_r=in&_r=ph', '_r=hk&_r=in', 'utm=a&_r=ph', '_r=ph&utm=a',
    'x_r=in', '_r=inx', '_r=%69n', '_r=', 'a=1'];
  const countries = ['', 'IN', 'in', 'PH', 'HK', 'US', 'XX', 'T1'];
  for (const q of queries) {
    for (const c of countries) {
      const req = request(`/blogs/x${q ? `?${q}` : ''}`, { country: c || undefined });
      assert.equal(regionFor(req), sim.regionOf(q, c), `query "${q}", country "${c}"`);
    }
  }
});

// --- Unrelated routes and existing content are untouched -------------------------------------

test('ordinary pages, listings, assets and root files pass through unchanged; the CMS is not called', async () => {
  for (const [path, country] of [['/', undefined], ['/about-us', 'IN'], ['/blogs', 'PH'], ['/news?_r=in', undefined],
    ['/shared/js/velza-cms/cms-config.js', undefined], ['/robots.txt', undefined]]) {
    assertSame(await call(path, { country }), await direct(path, { country }), path);
  }
  assert.equal(cmsRequests.length, 0);
});

test('regional error pages and unrelated 404s are the origin responses, never CMS pages', async () => {
  cms.state.blogs.push(hkBlog());
  for (const path of ['/404?_r=in', '/503?_r=ph', '/no-such-page', '/blogs/cms-only-blog/extra', '/regions/hk/blogs/cms-only-blog', '/.env']) {
    assertSame(await call(path), await direct(path), path);
  }
  assert.equal(cmsRequests.length, 0);
});

test('static article files always win; the CMS is not consulted', async () => {
  cms.state.blogs.push(hkBlog({ slug: 'global-brand-partnership', title: 'CMS copy that must not be shown' }));
  for (const region of ['hk', 'in', 'ph']) {
    const r = await call(`/blogs/global-brand-partnership?_r=${region}`);
    assertSame(r, await direct(`/blogs/global-brand-partnership?_r=${region}`), region);
    assert.doesNotMatch(r.text, /CMS copy that must not be shown/);
  }
  assert.equal(cmsRequests.length, 0);
});

test('redirects pass through unchanged (trailing slash, .html, legacy root URLs); nothing is followed', async () => {
  cms.state.blogs.push(hkBlog());
  for (const [path, location] of [['/blogs/cms-only-blog/?_r=hk', '/blogs/cms-only-blog?_r=hk'],
    ['/blogs/global-brand-partnership.html', '/blogs/global-brand-partnership'], ['/global-brand-partnership', '/blogs/global-brand-partnership']]) {
    const r = await call(path);
    assert.equal(r.status, 301, path);
    assert.equal(r.headers.get('location'), location, path);
  }
  assert.equal(cmsRequests.length, 0);
});

test('origin 403 and 5xx on an article URL are returned as-is, never replaced by a CMS article', async () => {
  cms.state.blogs.push(hkBlog());
  for (const status of [403, 500, 502, 503]) {
    sim.overrides.set('/blogs/cms-only-blog', () => new Response(`origin ${status}`, { status, headers: { 'X-Origin': 'yes' } }));
    const r = await call('/blogs/cms-only-blog?_r=hk');
    assert.equal(r.status, status);
    assert.equal(r.text, `origin ${status}`);
    assert.equal(r.headers.get('x-origin'), 'yes');
    assert.equal(r.headers.get('x-velza-source'), null);
  }
  assert.equal(cmsRequests.length, 0);
});

test('the request reaches the origin once, unchanged: same path, query, method and country header', async () => {
  cms.state.blogs.push(hkBlog());
  await call('/blogs/cms-only-blog?utm_source=x&_r=hk', { country: 'IN' });
  const articleRequests = sim.requests.filter((q) => q.path === '/blogs/cms-only-blog');
  assert.deepEqual(articleRequests, [{ path: '/blogs/cms-only-blog', query: 'utm_source=x&_r=hk', country: 'IN', method: 'GET' }]);
});

// --- CMS fallback on a genuine article 404 ----------------------------------------------------

test('feature is off without CMS_BASE_URL: CMS-only URL keeps the origin 404 and the CMS is not called', async () => {
  cms.state.blogs.push(hkBlog());
  const r = await call('/blogs/cms-only-blog?_r=hk', { workerEnv: {} });
  assertSame(r, await direct('/blogs/cms-only-blog?_r=hk'), 'off');
  assert.equal(cmsRequests.length, 0);
});

test('published entry of the region renders through the existing template with CMS and origin policy headers', async () => {
  cms.state.blogs.push(hkBlog({ seo: { metaTitle: 'CMS meta', metaDescription: 'CMS description', canonicalUrl: null, ogTitle: null, ogDescription: null, shareImage: null, noIndex: false } }));
  const r = await call('/blogs/cms-only-blog?_r=hk');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-velza-source'), 'cms');
  assert.equal(r.headers.get('x-velza-region'), 'hk');
  assert.match(r.headers.get('cache-control'), /private, no-cache/);
  for (const name of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) {
    assert.ok(r.headers.get(name), `origin policy header ${name}`);
  }
  assert.match(r.text, /<title>CMS meta \| Velza Global<\/title>/);
  assert.match(r.text, /<link rel="canonical" href="https:\/\/www\.velzaglobal\.com\/blogs\/cms-only-blog" \/>/);
  assert.match(r.text, /og:locale" content="en_HK"/);
  assert.match(r.text, /<footer class="dark-shade-2-bg position-relative">/, 'existing page shell');
  assert.ok(cmsRequests.length > 0);
  assert.ok(cmsRequests.every((q) => decodeURIComponent(q.url).includes('filters[regions][slug][$eq]=hk')), 'every CMS query is region-filtered');
});

test('news articles render as NewsArticle pages', async () => {
  cms.state['news-articles'].push(makeEntry({ slug: 'cms-only-news', title: 'CMS only news', regions: [{ slug: 'ph', name: 'Philippines' }] }));
  const r = await call('/news/cms-only-news?_r=ph');
  assert.equal(r.status, 200);
  assert.match(r.text, /"@type": "NewsArticle"/);
  assert.match(r.text, /og:locale" content="en_PH"/);
});

test('the region follows the visitor country like .htaccess; ?_r= overrides it for that request', async () => {
  cms.state.blogs.push(makeEntry({ slug: 'india-post', title: 'India post', regions: [{ slug: 'in', name: 'India' }] }));
  const fromIndia = await call('/blogs/india-post', { country: 'IN' });
  assert.equal(fromIndia.status, 200);
  assert.equal(fromIndia.headers.get('x-velza-region'), 'in');
  for (const [path, country] of [['/blogs/india-post', 'PH'], ['/blogs/india-post', 'US'], ['/blogs/india-post', undefined], ['/blogs/india-post?_r=hk', 'IN']]) {
    const r = await call(path, { country });
    assert.equal(r.status, 404, `${path} from ${country}`);
    assert.equal(r.headers.get('x-velza-source'), null);
  }
  assert.equal((await call('/blogs/india-post?_r=hk&_r=in', { country: 'PH' })).headers.get('x-velza-region'), 'in', '.htaccess rule order: in before hk');
});

test('region isolation: another region gets the origin 404, whether chosen by ?_r= or by country', async () => {
  cms.state.blogs.push(hkBlog());
  for (const [path, country] of [['/blogs/cms-only-blog?_r=in', undefined], ['/blogs/cms-only-blog?_r=ph', undefined],
    ['/blogs/cms-only-blog', 'IN'], ['/blogs/cms-only-blog', 'PH']]) {
    const r = await call(path, { country });
    assertSame(r, await direct(path, { country }), `${path} ${country}`);
  }
});

test('a published entry with no region is not rendered in any region', async () => {
  cms.state.blogs.push(hkBlog({ regions: [] }));
  for (const region of ['hk', 'in', 'ph']) {
    const r = await call(`/blogs/cms-only-blog?_r=${region}`);
    assert.equal(r.status, 404, region);
    assert.equal(r.headers.get('x-velza-source'), null, region);
  }
});

test('unknown, malformed and unpublished slugs keep the origin 404 page', async () => {
  cms.state.blogs.push(hkBlog({ slug: 'draft-only', publishedAt: null }));
  for (const path of ['/blogs/no-such-post?_r=hk', '/blogs/Bad_Slug!?_r=hk', '/blogs/draft-only?_r=hk', '/news/a/b?_r=hk']) {
    assertSame(await call(path), await direct(path), path);
  }
});

test('query parameters cannot request drafts or extra data', async () => {
  cms.state.blogs.push(hkBlog({ slug: 'draft-only', publishedAt: null }));
  const r = await call('/blogs/draft-only?_r=hk&status=draft&publicationState=preview&populate=*');
  assert.equal(r.status, 404);
  assert.ok(cmsRequests.every((q) => !/status=draft|publicationState|populate=\*/.test(decodeURIComponent(q.url))), 'visitor query is never forwarded');
});

// --- CMS unavailable --------------------------------------------------------------------------

test('CMS failure: a missing article gets the region 503 page (via its public URL) with Retry-After, never stale content', async () => {
  cms.state.fail = true;
  const r = await call('/blogs/cms-only-blog?_r=in');
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('retry-after'), '60');
  assert.equal(r.headers.get('x-velza-region'), 'in');
  assert.match(r.headers.get('cache-control'), /no-cache/);
  assert.equal(r.text, await regionFile('in', '503.html'));
  assert.ok(sim.requests.some((q) => q.path === '/503' && q.query === '_r=in'), 'error page fetched as /503?_r=in');
});

test('CMS failure does not affect pages, listings, static articles or other errors', async () => {
  cms.state.fail = true;
  for (const path of ['/', '/about-us?_r=ph', '/blogs?_r=in', '/blogs/global-brand-partnership?_r=hk', '/no-such-page']) {
    assertSame(await call(path), await direct(path), path);
  }
});

test('CMS unreachable (connection refused) also returns the region 503 page, not a hang or crash', async () => {
  const r = await call('/news/cms-only-news?_r=ph', { workerEnv: { CMS_BASE_URL: 'http://127.0.0.1:9', SITE_ORIGIN: SITE } });
  assert.equal(r.status, 503);
  assert.equal(r.text, await regionFile('ph', '503.html'));
});

// --- Safety -----------------------------------------------------------------------------------

test('CMS text is escaped: markup in titles and body cannot inject elements or handlers', async () => {
  const evil = 'INTEGRATION <img src=x onerror="alert(1)"> <script>alert(2)</script>';
  cms.state.blogs.push(hkBlog({ title: evil, excerpt: evil, content: [{ type: 'paragraph', children: [{ type: 'text', text: evil }] }],
    seo: { metaTitle: evil, metaDescription: evil, canonicalUrl: 'javascript:alert(3)', ogTitle: null, ogDescription: null, shareImage: null, noIndex: false } }));
  const r = await call('/blogs/cms-only-blog?_r=hk');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /<img src=x onerror/i);
  assert.doesNotMatch(r.text, /<script>alert\(2\)<\/script>/);
  assert.doesNotMatch(r.text, /href="javascript:/i);
  assert.match(r.text, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('missing featured image falls back safely; no token is ever sent to the CMS', async () => {
  cms.state.blogs.push(hkBlog({ featuredImage: null }));
  const r = await call('/blogs/cms-only-blog?_r=hk');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /src="null"|src="undefined"/);
  assert.ok(cmsRequests.length > 0);
  assert.ok(cmsRequests.every((q) => q.authorization === null), 'no Authorization header');
});

test('HEAD gets headers only; other methods are the origin response and never rendered', async () => {
  cms.state.blogs.push(hkBlog());
  const head = await call('/blogs/cms-only-blog?_r=hk', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
  assert.equal(head.headers.get('x-velza-source'), 'cms');
  const before = cmsRequests.length;
  const post = await call('/blogs/cms-only-blog?_r=hk', { method: 'POST' });
  assert.equal(post.status, 404);
  assert.equal(post.headers.get('x-velza-source'), null);
  assert.equal(cmsRequests.length, before, 'POST does not consult the CMS');
});

// --- Staging configuration and the bundled artifact -------------------------------------------

const readJsonc = (file) => JSON.parse(readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n'));

test('wrangler.jsonc is staging-only: article routes only, no production host, CMS off by default, no secrets', () => {
  const cfg = readJsonc(join(WEBSITE_ROOT, 'server', 'wrangler.jsonc'));
  assert.equal(cfg.main, 'cloudflare-worker.js');
  assert.equal(cfg.workers_dev, false, 'no *.workers.dev URL');
  assert.equal(cfg.preview_urls, false, 'no preview URLs');
  assert.match(cfg.name, /staging/);
  assert.ok(Array.isArray(cfg.routes) && cfg.routes.length === 2);
  const paths = cfg.routes.map((r) => r.pattern.slice(r.pattern.indexOf('/'))).sort();
  assert.deepEqual(paths, ['/blogs/*', '/news/*'], 'only the article route families');
  for (const r of cfg.routes) {
    const host = r.pattern.slice(0, r.pattern.indexOf('/')).toLowerCase();
    assert.ok(!['www.velzaglobal.com', 'velzaglobal.com', '*velzaglobal.com', '*.velzaglobal.com'].includes(host), `production host in route: ${host}`);
    assert.ok(!host.includes('*'), `wildcard host: ${host}`);
  }
  assert.deepEqual(Object.keys(cfg.vars).sort(), ['CMS_BASE_URL', 'CMS_MEDIA_BASE_URL', 'SITE_ORIGIN']);
  assert.equal(cfg.vars.CMS_BASE_URL, '', 'CMS rendering off until a confirmed staging CMS URL is set');
  assert.ok(!/token|secret|password|api[_-]?key/i.test(JSON.stringify(cfg)), 'no secret-like keys or values');
  for (const key of ['env', 'kv_namespaces', 'd1_databases', 'r2_buckets', 'services', 'secrets']) assert.equal(cfg[key], undefined, key);
});

test('bundled Worker (esbuild, as Wrangler bundles it) behaves like the source on the key routing cases', { skip: !esbuildPath && 'esbuild not installed in velza-cms' }, async () => {
  const esbuild = createRequire(esbuildPath)('esbuild');
  const dir = await mkdtemp(join(tmpdir(), 'velza-worker-'));
  const outfile = join(dir, 'worker.mjs');
  try {
    const result = await esbuild.build({ entryPoints: [join(WEBSITE_ROOT, 'server', 'cloudflare-worker.js')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile, metafile: true, logLevel: 'silent' });
    assert.deepEqual(Object.values(result.metafile.outputs)[0].exports, ['default'], 'only a default export (no extra entrypoints)');
    assert.doesNotMatch(readFileSync(outfile, 'utf8'), /from ["']node:|require\(/, 'no Node built-ins in the bundle');
    const { default: bundled } = await import(pathToFileURL(outfile).href);
    const run = async (path, opts = {}) => read(await bundled.fetch(request(path, opts), env));

    cms.state.blogs.push(hkBlog());
    clientPaths.add('/about-us'); clientPaths.add('/blogs/global-brand-partnership'); clientPaths.add('/blogs/cms-only-blog');
    assertSame(await run('/about-us', { country: 'IN' }), await direct('/about-us', { country: 'IN' }), 'page');
    assertSame(await run('/blogs/global-brand-partnership?_r=ph'), await direct('/blogs/global-brand-partnership?_r=ph'), 'static article');
    const page = await run('/blogs/cms-only-blog?_r=hk');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-velza-source'), 'cms');
    assertSame(await run('/blogs/cms-only-blog', { country: 'IN' }), await direct('/blogs/cms-only-blog', { country: 'IN' }), 'isolation');
    cms.state.fail = true;
    assert.equal((await run('/blogs/cms-only-blog?_r=hk')).status, 503);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
