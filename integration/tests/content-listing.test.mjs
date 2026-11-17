// Unit tests for the website's listing enhancement, using a tiny fake DOM.
// The module lives in the separate website repository; WEBSITE_ROOT overrides its location.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WEBSITE_ROOT = process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal';
const moduleUrl = (rel) => pathToFileURL(`${WEBSITE_ROOT}/shared/js/velza-cms/${rel}`).href;

globalThis.__VELZA_CMS_NO_AUTORUN__ = true;
const { toCardModel, decideView, buildCard, enhanceListings, LISTINGS, normalizeDetailHref, collectKnownDetailHrefs } = await import(moduleUrl('content-listing.js'));
const enhanceBlogListing = enhanceListings;

// ---- minimal DOM double -------------------------------------------------------------------
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.className = '';
    this.textContent = '';
    const self = this;
    this.classList = {
      add: (c) => { self.className = [...new Set(self.className.split(' ').filter(Boolean).concat(c))].join(' '); },
      remove: (c) => { self.className = self.className.split(' ').filter((x) => x && x !== c).join(' '); },
      contains: (c) => self.className.split(' ').includes(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { this.children.push(...cs); }
  replaceChildren(...cs) { this.children = cs; }
  find(pred) { // depth-first search helper for assertions
    for (const c of this.children) {
      if (pred(c)) return c;
      const hit = c.find && c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
  findAll(pred, acc = []) {
    for (const c of this.children) { if (pred(c)) acc.push(c); if (c.findAll) c.findAll(pred, acc); }
    return acc;
  }
  querySelectorAll(selector) { // only 'a[href]' is needed by the module
    if (selector !== 'a[href]') throw new Error(`fake DOM: unsupported selector ${selector}`);
    return this.findAll((n) => n.tagName === 'A' && n.getAttribute('href') !== null);
  }
}
const fakeDocument = (containers) => ({
  createElement: (t) => new FakeElement(t),
  querySelectorAll: () => containers,
});
// A listing container holding one static card per given static detail href (like the real pages).
const listContainer = (region, kind = 'blog-list', staticHrefs = []) => {
  const c = new FakeElement('div');
  c.setAttribute('data-cms', kind);
  c.setAttribute('data-cms-region', region);
  const staticCards = new FakeElement('div'); // stands in for the static cards
  for (const href of staticHrefs) {
    const a = new FakeElement('a');
    a.setAttribute('href', href);
    staticCards.appendChild(a);
  }
  c.appendChild(staticCards);
  return c;
};
const links = (node) => node.findAll((n) => n.tagName === 'A');
const fakeClientFactory = ({ items = [], fail = null } = {}) => {
  const calls = [];
  const factory = (opts) => ({
    listBlogs: async (q) => { calls.push({ method: 'listBlogs', opts, q }); if (fail) throw fail; return { items, pagination: {} }; },
    listNewsArticles: async (q) => { calls.push({ method: 'listNewsArticles', opts, q }); if (fail) throw fail; return { items, pagination: {} }; },
    mediaUrl: (m) => (m && m.url ? `http://cms.local${m.url}` : null),
  });
  factory.calls = calls;
  return factory;
};
const baseConfig = {
  baseUrl: 'http://127.0.0.1:1399', timeoutMs: 1000, pageSize: 12, imageFormat: 'medium',
  placeholderImage: '/shared/images/blog-hero-banner.webp', fallbackToStatic: true,
  listingMode: 'replace', // the original tests below describe replace mode; merge mode is tested separately
  regionSlugs: { hk: 'hk-test', ph: null, in: null },
};
const blog = (over = {}) => ({ documentId: 'd1', title: 'Hello World', slug: 'hello-world', featuredImage: { url: '/uploads/a.jpg', alternativeText: 'Alt' }, ...over });

// ---- pure functions -------------------------------------------------------------------------
test('toCardModel maps a Strapi 5 blog to card values', () => {
  const m = toCardModel(blog(), (x) => (x ? `http://cms.local${x.url}` : null), baseConfig);
  assert.deepEqual(m, { href: '/blogs/hello-world', title: 'HELLO WORLD', imageSrc: 'http://cms.local/uploads/a.jpg', imageAlt: 'Alt', imageWidth: null, imageHeight: null, usedPlaceholder: false });
});

test('toCardModel takes the intrinsic size of the media variant it uses', () => {
  const media = { url: '/uploads/a.jpg', width: 2000, height: 1000, formats: { medium: { url: '/uploads/m_a.jpg', width: 750, height: 375 } } };
  const resolve = (x) => (x ? `http://cms.local${x.url}` : null);
  const medium = toCardModel(blog({ featuredImage: media }), resolve, baseConfig);
  assert.deepEqual([medium.imageWidth, medium.imageHeight], [750, 375]);
  const original = toCardModel(blog({ featuredImage: { ...media, formats: {} } }), resolve, baseConfig);
  assert.deepEqual([original.imageWidth, original.imageHeight], [2000, 1000]);
  const placeholder = toCardModel(blog({ featuredImage: null }), () => null, baseConfig);
  assert.deepEqual([placeholder.imageWidth, placeholder.imageHeight], [null, null], 'no size for the placeholder');
  const bad = toCardModel(blog({ featuredImage: { url: '/uploads/a.jpg', width: '0', height: 'x' } }), resolve, baseConfig);
  assert.deepEqual([bad.imageWidth, bad.imageHeight], [null, null], 'invalid sizes are ignored');
});

test('buildCard sets intrinsic size and decoding only when the size is known', () => {
  const doc = fakeDocument([]);
  const sized = buildCard(doc, { href: '/blogs/x', title: 'X', imageSrc: '/i.jpg', imageAlt: 'a', imageWidth: 750, imageHeight: 375, linked: true })
    .find((n) => n.tagName === 'IMG');
  assert.equal(sized.getAttribute('width'), '750');
  assert.equal(sized.getAttribute('height'), '375');
  assert.equal(sized.getAttribute('decoding'), 'async');
  const unsized = buildCard(doc, { href: '/blogs/x', title: 'X', imageSrc: '/i.jpg', imageAlt: 'a', linked: true })
    .find((n) => n.tagName === 'IMG');
  assert.equal(unsized.getAttribute('width'), null);
  assert.equal(unsized.getAttribute('height'), null);
});

test('listings request only the card fields and the featured image', async () => {
  const c = listContainer('hk');
  const factory = fakeClientFactory({ items: [blog()] });
  await enhanceBlogListing(fakeDocument([c]), baseConfig, factory);
  const q = factory.calls[0].q;
  assert.deepEqual(q.fields, ['title', 'slug', 'publicationDate']);
  assert.deepEqual(q.populate, { featuredImage: true });
  assert.equal(q.region, 'hk-test');
});

test('toCardModel uses the placeholder image and title alt when media is missing', () => {
  const m = toCardModel(blog({ featuredImage: null }), () => null, baseConfig);
  assert.equal(m.imageSrc, '/shared/images/blog-hero-banner.webp');
  assert.equal(m.imageAlt, 'Hello World');
  assert.equal(m.usedPlaceholder, true);
});

test('toCardModel skips malformed entries and encodes slugs', () => {
  assert.equal(toCardModel({ title: '', slug: 'x' }, () => null, baseConfig), null);
  assert.equal(toCardModel({ title: 'x' }, () => null, baseConfig), null);
  assert.equal(toCardModel(blog({ slug: 'a b/c' }), () => null, baseConfig).href, '/blogs/a%20b%2Fc');
});

test('decideView covers cards, fallback, empty and error states', () => {
  assert.equal(decideView({ models: [{}], error: null, fallbackToStatic: true }), 'cards');
  assert.equal(decideView({ models: [], error: null, fallbackToStatic: true }), 'keep-static');
  assert.equal(decideView({ models: [], error: null, fallbackToStatic: false }), 'empty');
  assert.equal(decideView({ models: [], error: new Error('x'), fallbackToStatic: true }), 'keep-static');
  assert.equal(decideView({ models: [], error: new Error('x'), fallbackToStatic: false }), 'error');
});

test('buildCard mirrors the static markup and never parses CMS text as HTML', () => {
  const doc = fakeDocument([]);
  const card = buildCard(doc, { href: '/blogs/x', title: '<IMG SRC=X ONERROR=ALERT(1)>', imageSrc: '/i.jpg', imageAlt: 'a', linked: true });
  assert.equal(card.className, 'sk__blog-article-wrapper vg-cms-card');
  assert.ok(!card.className.includes('sk__fade-in'), 'no hidden fade-in class on dynamic cards');
  const link = card.find((n) => n.getAttribute && n.getAttribute('rel') === 'bookmark');
  assert.equal(link.textContent, '<IMG SRC=X ONERROR=ALERT(1)>');
  assert.equal(link.children.length, 0);
  const img = card.find((n) => n.tagName === 'IMG');
  assert.equal(img.getAttribute('class') ?? img.className, 'sk__in-content-post-image');
  assert.equal(img.getAttribute('loading'), 'lazy');
});

// ---- enhanceBlogListing --------------------------------------------------------------------
test('disabled CMS keeps static content without any request', async () => {
  const c = listContainer('hk');
  const factory = fakeClientFactory({ items: [blog()] });
  const r = await enhanceBlogListing(fakeDocument([c]), { ...baseConfig, baseUrl: null }, factory);
  assert.deepEqual(r, [{ kind: 'blog-list', region: 'hk', view: 'keep-static', reason: 'cms-disabled' }]);
  assert.equal(factory.calls.length, 0);
  assert.equal(c.children.length, 1);
});

test('unmapped region keeps static content without any request', async () => {
  const c = listContainer('ph');
  const factory = fakeClientFactory({ items: [blog()] });
  const r = await enhanceBlogListing(fakeDocument([c]), baseConfig, factory);
  assert.equal(r[0].reason, 'region-unmapped');
  assert.equal(factory.calls.length, 0);
});

test('published CMS blogs replace the static cards for the mapped region', async () => {
  const c = listContainer('hk');
  const factory = fakeClientFactory({ items: [blog(), blog({ slug: 'two', title: 'Two', featuredImage: null }), { title: 'bad' }] });
  const r = await enhanceBlogListing(fakeDocument([c]), baseConfig, factory);
  assert.equal(r[0].view, 'cards');
  assert.equal(r[0].count, 2, 'malformed entry skipped');
  assert.equal(c.children.length, 2);
  assert.equal(c.getAttribute('data-cms-state'), 'cards');
  assert.equal(c.getAttribute('aria-busy'), null, 'loading state cleared');
  assert.equal(factory.calls[0].q.region, 'hk-test');
  assert.equal(factory.calls[0].opts.token, undefined, 'no token in browser code');
});

test('CMS errors keep static content by default and show a message when fallback is off', async () => {
  const err = Object.assign(new Error('down'), { kind: 'network' });
  const warn = console.warn; console.warn = () => {};
  try {
    const keep = listContainer('hk');
    const r1 = await enhanceBlogListing(fakeDocument([keep]), baseConfig, fakeClientFactory({ fail: err }));
    assert.equal(r1[0].view, 'keep-static');
    assert.equal(keep.children.length, 1);

    const show = listContainer('hk');
    const r2 = await enhanceBlogListing(fakeDocument([show]), { ...baseConfig, fallbackToStatic: false }, fakeClientFactory({ fail: err }));
    assert.equal(r2[0].view, 'error');
    assert.equal(show.children[0].className, 'vg-cms-message');
  } finally { console.warn = warn; }
});

test('no published blogs: keep static by default, empty message when fallback is off', async () => {
  const keep = listContainer('hk');
  assert.equal((await enhanceBlogListing(fakeDocument([keep]), baseConfig, fakeClientFactory()))[0].view, 'keep-static');
  const show = listContainer('hk');
  const r = await enhanceBlogListing(fakeDocument([show]), { ...baseConfig, fallbackToStatic: false }, fakeClientFactory());
  assert.equal(r[0].view, 'empty');
  assert.match(show.children[0].textContent, /No articles/);
});

// ---- news listings and repository checks ---------------------------------------------------
test('news listings call listNewsArticles and link to /news/<slug>', async () => {
  const c = listContainer('hk', 'news-list', ['/news/press-release']);
  const factory = fakeClientFactory({ items: [blog({ slug: 'press-release', title: 'Press release' })] });
  const r = await enhanceListings(fakeDocument([c]), baseConfig, factory);
  assert.equal(r[0].kind, 'news-list');
  assert.equal(r[0].view, 'cards');
  assert.equal(factory.calls[0].method, 'listNewsArticles');
  const link = c.children[0].find((n) => n.getAttribute && n.getAttribute('rel') === 'bookmark');
  assert.equal(link.getAttribute('href'), '/news/press-release');
});

test('each region container uses its own region mapping', async () => {
  const hk = listContainer('hk'); const ph = listContainer('ph', 'news-list'); const inn = listContainer('in');
  const factory = fakeClientFactory({ items: [blog()] });
  const cfg = { ...baseConfig, regionSlugs: { hk: 'hk-test', ph: 'ph-test', in: 'in-test' } };
  const r = await enhanceListings(fakeDocument([hk, ph, inn]), cfg, factory);
  assert.deepEqual(r.map((x) => [x.kind, x.region, x.view]), [['blog-list', 'hk', 'cards'], ['news-list', 'ph', 'cards'], ['blog-list', 'in', 'cards']]);
  assert.deepEqual(factory.calls.map((c) => [c.method, c.q.region]), [['listBlogs', 'hk-test'], ['listNewsArticles', 'ph-test'], ['listBlogs', 'in-test']]);
});

test('LISTINGS covers exactly blog and news listings', () => {
  assert.deepEqual(Object.keys(LISTINGS).sort(), ['blog-list', 'news-list']);
});

test('website config is disabled by default and holds no token or real CMS URL', async () => {
  const { cmsConfig } = await import(moduleUrl('cms-config.js'));
  assert.equal(cmsConfig.baseUrl, null);
  assert.deepEqual(cmsConfig.regionSlugs, { hk: 'hk', ph: 'ph', in: 'in' });
  assert.equal(cmsConfig.fallbackToStatic, true);
  assert.equal(cmsConfig.listingMode, 'merge');
  assert.equal(cmsConfig.detailPages, false, 'detail pages stay off until server rendering is deployed');
  const text = readFileSync(new URL(moduleUrl('cms-config.js')), 'utf8');
  assert.doesNotMatch(text, /token\s*:/i, 'no token property in public config');
});

test('CMS environment is chosen per host; unknown hosts and non-https origins stay disabled', async () => {
  const { selectCmsEnvironment, CMS_ENVIRONMENTS } = await import(moduleUrl('cms-config.js'));
  const envs = {
    'www.example.test': { baseUrl: 'https://cms.example.test/', mediaBaseUrl: 'https://media.example.test' },
    'staging.example.test': { baseUrl: 'http://cms-staging.example.test' }, // not https -> refused
    'odd.example.test': { baseUrl: 'https://cms.example.test/api' }, // path -> refused (origin only)
  };
  assert.deepEqual(selectCmsEnvironment('www.example.test', envs), { baseUrl: 'https://cms.example.test', mediaBaseUrl: 'https://media.example.test' });
  assert.deepEqual(selectCmsEnvironment('WWW.EXAMPLE.TEST', envs).baseUrl, 'https://cms.example.test', 'hostname is case-insensitive');
  assert.equal(selectCmsEnvironment('staging.example.test', envs).baseUrl, null);
  assert.equal(selectCmsEnvironment('odd.example.test', envs).baseUrl, null);
  for (const host of ['localhost', '127.0.0.1', 'velzaglobal.com', '', undefined]) {
    assert.equal(selectCmsEnvironment(host, envs).baseUrl, null, `host ${host} must stay disabled`);
  }
  // The real table has only the production and staging hosts, and both are still placeholders (no hosted CMS yet).
  assert.deepEqual(Object.keys(CMS_ENVIRONMENTS).sort(), ['staging.velzaglobal.com', 'www.velzaglobal.com']);
  for (const host of Object.keys(CMS_ENVIRONMENTS)) assert.equal(selectCmsEnvironment(host).baseUrl, null);
  for (const env of Object.values(CMS_ENVIRONMENTS)) assert.doesNotMatch(String(env.baseUrl), /localhost|127\.0\.0\.1/);
});

test('website client copy is identical to the integration kit client', () => {
  const kit = readFileSync(new URL('../velza-cms-client.js', import.meta.url), 'utf8');
  const site = readFileSync(new URL(moduleUrl('velza-cms-client.js')), 'utf8');
  assert.equal(site, kit);
});

// ---- Phase 7B.3: detail-link safety -------------------------------------------------------
test('normalizeDetailHref accepts same-site paths only and strips .html, slashes, query and hash', () => {
  assert.equal(normalizeDetailHref('/blogs/a'), '/blogs/a');
  assert.equal(normalizeDetailHref('/blogs/a/'), '/blogs/a');
  assert.equal(normalizeDetailHref('/blogs/a.html?x=1#top'), '/blogs/a');
  assert.equal(normalizeDetailHref('https://evil.test/blogs/a'), null);
  assert.equal(normalizeDetailHref('//evil.test/blogs/a'), null);
  assert.equal(normalizeDetailHref(null), null);
});

test('collectKnownDetailHrefs reads only detail links of the listing type from static cards', () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/one', '/blogs/two.html', '/news/n', '/blogs', '/about-us', 'https://x.test/blogs/z']);
  assert.deepEqual([...collectKnownDetailHrefs(c, '/blogs/')].sort(), ['/blogs/one', '/blogs/two']);
});

test('a CMS entry with an existing static detail page keeps working links (image and title)', async () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/global-brand-partnership']);
  const r = await enhanceListings(fakeDocument([c]), baseConfig, fakeClientFactory({ items: [blog({ slug: 'global-brand-partnership', title: 'Global' })] }));
  assert.equal(r[0].linked, 1);
  const card = c.children[0];
  assert.ok(!card.className.includes('vg-cms-card--no-detail'));
  assert.deepEqual(links(card).map((a) => a.getAttribute('href')), ['/blogs/global-brand-partnership', '/blogs/global-brand-partnership']);
  assert.equal(links(card)[1].getAttribute('rel'), 'bookmark');
});

test('a CMS-only blog entry renders without any link (no 404 navigation)', async () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/global-brand-partnership']);
  const r = await enhanceListings(fakeDocument([c]), baseConfig, fakeClientFactory({ items: [blog({ slug: 'cms-only-post', title: 'CMS only' })] }));
  assert.equal(r[0].view, 'cards');
  assert.equal(r[0].linked, 0);
  const card = c.children[0];
  assert.match(card.className, /vg-cms-card--no-detail/);
  assert.equal(links(card).length, 0, 'no anchor elements at all');
  const title = card.find((n) => n.tagName === 'SPAN');
  assert.equal(title.textContent, 'CMS ONLY');
  assert.ok(card.find((n) => n.tagName === 'IMG'), 'image still shown');
});

test('a CMS-only news entry renders without any link', async () => {
  const c = listContainer('hk', 'news-list', ['/news/tonino-lamborghini-velza-global-partnership-philippines']);
  await enhanceListings(fakeDocument([c]), baseConfig, fakeClientFactory({ items: [blog({ slug: 'cms-only-news', title: 'News only' })] }));
  assert.equal(links(c).length, 0);
});

test('a static blog link does not make a same-slug news entry linkable (paths are per type)', async () => {
  const c = listContainer('hk', 'news-list', ['/blogs/shared-slug']);
  await enhanceListings(fakeDocument([c]), baseConfig, fakeClientFactory({ items: [blog({ slug: 'shared-slug' })] }));
  assert.equal(links(c).length, 0);
});

test('mixed results link only entries with known detail pages', async () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/known']);
  const r = await enhanceListings(fakeDocument([c]), baseConfig, fakeClientFactory({ items: [blog({ slug: 'known', title: 'K' }), blog({ slug: 'unknown', title: 'U' })] }));
  assert.equal(r[0].count, 2);
  assert.equal(r[0].linked, 1);
  assert.deepEqual(c.children.map((card) => links(card).length), [2, 0]);
});

test('each region shows only the entries the CMS returns for that region', async () => {
  const byRegion = { 'hk-test': [blog({ slug: 'hk-post', title: 'HK' })], 'ph-test': [blog({ slug: 'ph-post', title: 'PH' })], 'in-test': [blog({ slug: 'in-post', title: 'IN' })] };
  const factory = () => ({
    listBlogs: async (q) => ({ items: byRegion[q.region] || [], pagination: {} }),
    listNewsArticles: async (q) => ({ items: byRegion[q.region] || [], pagination: {} }),
    mediaUrl: () => null,
  });
  const cfg = { ...baseConfig, regionSlugs: { hk: 'hk-test', ph: 'ph-test', in: 'in-test' } };
  const containers = ['hk', 'ph', 'in'].map((r) => listContainer(r));
  await enhanceListings(fakeDocument(containers), cfg, factory);
  assert.deepEqual(containers.map((c) => c.children.map((card) => card.find((n) => n.tagName === 'SPAN').textContent)), [['HK'], ['PH'], ['IN']]);
});

test('fallback leaves the static cards and their links untouched (disabled, empty, unavailable)', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const cases = [
      [{ ...baseConfig, baseUrl: null }, fakeClientFactory({ items: [blog()] })],
      [baseConfig, fakeClientFactory({ items: [] })],
      [baseConfig, fakeClientFactory({ fail: Object.assign(new Error('down'), { kind: 'network' }) })],
    ];
    for (const [cfg, factory] of cases) {
      const c = listContainer('hk', 'blog-list', ['/blogs/global-brand-partnership']);
      const before = c.children[0];
      const r = await enhanceListings(fakeDocument([c]), cfg, factory);
      assert.equal(r[0].view, 'keep-static');
      assert.equal(c.children[0], before, 'same static node kept');
      assert.deepEqual(links(c).map((a) => a.getAttribute('href')), ['/blogs/global-brand-partnership']);
    }
  } finally { console.warn = warn; }
});

test('link semantics and keyboard access: real links are focusable anchors; unlinked cards add no fake controls', () => {
  const doc = fakeDocument([]);
  const linked = buildCard(doc, { href: '/blogs/a', title: 'A', imageSrc: '/i.jpg', imageAlt: 'Alt A', linked: true });
  for (const a of links(linked)) {
    assert.match(a.getAttribute('href'), /^\/blogs\/a$/);
    assert.equal(a.getAttribute('tabindex'), null, 'native anchors stay in the tab order');
  }
  assert.ok(links(linked)[1].textContent.length > 0, 'title link has an accessible name');
  assert.equal(links(linked)[0].find((n) => n.tagName === 'IMG').getAttribute('alt'), 'Alt A', 'image link named by alt text');

  const unlinked = buildCard(doc, { href: '/blogs/b', title: 'B', imageSrc: '/i.jpg', imageAlt: 'Alt B', linked: false });
  assert.equal(links(unlinked).length, 0);
  const interactive = unlinked.findAll((n) => n.getAttribute && (n.getAttribute('tabindex') !== null || n.getAttribute('role') === 'link' || n.getAttribute('onclick') !== null));
  assert.equal(interactive.length, 0, 'no focusable or link-like non-anchor elements');
});

// ---- Phase 7B.7: merge mode and CMS detail pages -----------------------------------------------
test('merge mode adds CMS cards before the static cards and keeps static cards not superseded', async () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/static-one']);
  const second = new FakeElement('div'); const a2 = new FakeElement('a'); a2.setAttribute('href', '/blogs/static-two'); second.appendChild(a2);
  c.appendChild(second);
  const r = await enhanceListings(fakeDocument([c]), { ...baseConfig, listingMode: 'merge' },
    fakeClientFactory({ items: [blog({ slug: 'cms-a', title: 'A' }), blog({ slug: 'cms-b', title: 'B' })] }));
  assert.equal(r[0].view, 'cards');
  assert.equal(c.children.length, 4, '2 CMS + 2 static');
  assert.ok(c.children[0].className.includes('vg-cms-card') && c.children[1].className.includes('vg-cms-card'));
  assert.deepEqual(links(c.children[2]).map((a) => a.getAttribute('href')), ['/blogs/static-one']);
  assert.deepEqual(links(c.children[3]).map((a) => a.getAttribute('href')), ['/blogs/static-two']);
});

test('merge mode: a CMS entry replaces the static card with the same URL (no duplicate card)', async () => {
  const c = listContainer('hk', 'blog-list', ['/blogs/global-brand-partnership']);
  await enhanceListings(fakeDocument([c]), { ...baseConfig, listingMode: 'merge' },
    fakeClientFactory({ items: [blog({ slug: 'global-brand-partnership', title: 'Global' })] }));
  assert.equal(c.children.length, 1);
  assert.ok(c.children[0].className.includes('vg-cms-card'));
  assert.equal(links(c).length, 2, 'image and title link to the existing page');
});

test('merge mode with an empty or failing CMS keeps exactly the static cards', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    for (const factory of [fakeClientFactory({ items: [] }), fakeClientFactory({ fail: Object.assign(new Error('x'), { kind: 'network' }) })]) {
      const c = listContainer('hk', 'blog-list', ['/blogs/static-one']);
      const before = c.children[0];
      const r = await enhanceListings(fakeDocument([c]), { ...baseConfig, listingMode: 'merge' }, factory);
      assert.equal(r[0].view, 'keep-static');
      assert.equal(c.children.length, 1);
      assert.equal(c.children[0], before);
    }
  } finally { console.warn = warn; }
});

test('detailPages: true links every CMS card (blog and news) to its own detail URL', async () => {
  for (const [kind, path] of [['blog-list', '/blogs/'], ['news-list', '/news/']]) {
    const c = listContainer('hk', kind, []);
    const r = await enhanceListings(fakeDocument([c]), { ...baseConfig, detailPages: true },
      fakeClientFactory({ items: [blog({ slug: 'one', title: 'One' }), blog({ slug: 'two', title: 'Two' })] }));
    assert.equal(r[0].linked, 2);
    assert.deepEqual(c.children.map((card) => links(card)[1].getAttribute('href')), [`${path}one`, `${path}two`]);
  }
});

test('detailPages: false (default) keeps CMS-only cards unlinked', async () => {
  const c = listContainer('hk', 'blog-list', []);
  const r = await enhanceListings(fakeDocument([c]), { ...baseConfig, detailPages: false }, fakeClientFactory({ items: [blog({ slug: 'one' })] }));
  assert.equal(r[0].linked, 0);
  assert.equal(links(c).length, 0);
});
