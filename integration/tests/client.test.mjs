// Mock-based unit tests for velza-cms-client.js. No network, no dependencies: `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVelzaCmsClient, encodeQuery, buildQuery, mediaUrl, CmsError } from '../velza-cms-client.js';

const BASE = 'http://cms.test';

// Minimal fetch double that records calls and returns a scripted response.
const mockFetch = (respond) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  fn.calls = calls;
  return fn;
};
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const decodedQuery = (url) => decodeURIComponent(url.split('?')[1] || '');

test('encodeQuery produces Strapi bracket notation', () => {
  // `$` is percent-encoded as %24 (valid; Strapi decodes it), so compare the decoded form.
  assert.equal(decodeURIComponent(encodeQuery({ filters: { slug: { $eq: 'a b' } } })), 'filters[slug][$eq]=a b');
  assert.equal(encodeQuery({ sort: ['x:desc', 'y:asc'] }), 'sort[0]=x%3Adesc&sort[1]=y%3Aasc');
  assert.equal(encodeQuery({ a: null, b: undefined, c: false }), 'c=false');
});

test('buildQuery adds region and slug filters, default sort and populate', () => {
  const q = buildQuery('blogs', { region: 'hk', slug: 'hello' });
  assert.deepEqual(q.filters, { slug: { $eq: 'hello' }, regions: { slug: { $eq: 'hk' } } });
  assert.deepEqual(q.sort, ['publicationDate:desc']);
  assert.equal(q.populate.seo.populate.shareImage, true);
  assert.equal(q.populate.author.populate.avatar, true);
});

test('buildQuery clamps page size to the server maximum and fixes bad pages', () => {
  assert.equal(buildQuery('blogs', { pageSize: 1000 }).pagination.pageSize, 100);
  assert.equal(buildQuery('blogs', { pageSize: 0 }).pagination.pageSize, 1);
  assert.equal(buildQuery('blogs', { page: -3 }).pagination.page, 1);
  assert.equal(buildQuery('blogs').pagination.pageSize, 12);
});

test('buildQuery rejects a region filter on types without regions', () => {
  assert.throws(() => buildQuery('authors', { region: 'hk' }), (e) => e instanceof CmsError && e.kind === 'config');
});

test('buildQuery omits populate for types without media or relations', () => {
  assert.equal(buildQuery('regions').populate, undefined);
  assert.equal(buildQuery('categories').populate, undefined);
});

test('client requires an absolute baseUrl', () => {
  assert.throws(() => createVelzaCmsClient({ baseUrl: 'cms.test', fetch: async () => {} }), (e) => e.kind === 'config');
  assert.throws(() => createVelzaCmsClient({ fetch: async () => {} }), (e) => e.kind === 'config');
});

test('listBlogs calls the blogs endpoint and normalises pagination', async () => {
  const fetch = mockFetch(() => jsonResponse(200, {
    data: [{ documentId: 'd1', title: 'One' }],
    meta: { pagination: { page: 2, pageSize: 1, pageCount: 5, total: 5 } },
  }));
  const client = createVelzaCmsClient({ baseUrl: `${BASE}/`, fetch });
  const result = await client.listBlogs({ region: 'ph', page: 2, pageSize: 1 });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 1, pageCount: 5, total: 5 });
  const { url, init } = fetch.calls[0];
  assert.ok(url.startsWith(`${BASE}/api/blogs?`), url);
  assert.match(decodedQuery(url), /filters\[regions\]\[slug\]\[\$eq\]=ph/);
  assert.match(decodedQuery(url), /pagination\[page\]=2/);
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.Authorization, undefined, 'no token header without a token');
});

test('empty data yields an empty list rather than an error', async () => {
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: mockFetch(() => jsonResponse(200, { data: [], meta: {} })) });
  const result = await client.listNewsArticles();
  assert.deepEqual(result.items, []);
  assert.equal(result.pagination.total, 0);
});

test('getBlogBySlug filters by slug and returns null when nothing matches', async () => {
  const fetch = mockFetch(() => jsonResponse(200, { data: [], meta: { pagination: { total: 0 } } }));
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch });
  assert.equal(await client.getBlogBySlug('missing'), null);
  assert.match(decodedQuery(fetch.calls[0].url), /filters\[slug\]\[\$eq\]=missing/);
  assert.match(decodedQuery(fetch.calls[0].url), /pagination\[pageSize\]=1/);
});

test('getBlogBySlug returns the first match', async () => {
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: mockFetch(() => jsonResponse(200, { data: [{ slug: 'a' }] })) });
  assert.deepEqual(await client.getBlogBySlug('a'), { slug: 'a' });
});

test('slug is required for slug lookups', async () => {
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: mockFetch(() => jsonResponse(200, {})) });
  await assert.rejects(client.getNewsArticleBySlug(''), (e) => e.kind === 'config');
});

test('token is sent as a bearer header when configured', async () => {
  const fetch = mockFetch(() => jsonResponse(200, { data: [] }));
  const client = createVelzaCmsClient({ baseUrl: BASE, token: 'test-token', fetch });
  await client.listRegions();
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer test-token');
});

test('HTTP errors become CmsError with status and Strapi message', async () => {
  const client = createVelzaCmsClient({
    baseUrl: BASE,
    fetch: mockFetch(() => jsonResponse(403, { error: { status: 403, name: 'ForbiddenError', message: 'Forbidden' } })),
  });
  await assert.rejects(client.listBlogs(), (e) => e instanceof CmsError && e.kind === 'http' && e.status === 403 && e.message === 'Forbidden');
});

test('HTTP error without JSON body still reports the status', async () => {
  const client = createVelzaCmsClient({
    baseUrl: BASE,
    fetch: async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }),
  });
  await assert.rejects(client.listBlogs(), (e) => e.kind === 'http' && e.status === 502);
});

test('non-JSON success response is a parse error', async () => {
  const client = createVelzaCmsClient({
    baseUrl: BASE,
    fetch: async () => ({ ok: true, status: 200, json: async () => { throw new Error('html'); } }),
  });
  await assert.rejects(client.listBlogs(), (e) => e.kind === 'parse');
});

test('network failures become CmsError(kind=network)', async () => {
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(client.listBlogs(), (e) => e.kind === 'network');
});

test('slow responses time out', async () => {
  const hanging = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: hanging, timeoutMs: 20 });
  await assert.rejects(client.listBlogs(), (e) => e.kind === 'timeout');
});

test('a body that stalls after the headers also times out', async () => {
  // Headers arrive at once; the JSON body never completes and ignores the abort signal.
  const stalledBody = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: stalledBody, timeoutMs: 20 });
  const started = Date.now();
  await assert.rejects(client.listBlogs(), (e) => e instanceof CmsError && e.kind === 'timeout');
  assert.ok(Date.now() - started < 2000, 'rejects promptly at the deadline');
});

test('a fast response is not affected by the timeout after it completes', async () => {
  const client = createVelzaCmsClient({ baseUrl: BASE, fetch: mockFetch(() => jsonResponse(200, { data: [], meta: {} })), timeoutMs: 20 });
  assert.deepEqual((await client.listBlogs()).items, []);
  await new Promise((r) => setTimeout(r, 40)); // the deadline firing later must not throw an unhandled rejection
});

test('buildQuery accepts fields and a populate override; defaults are unchanged', () => {
  const q = buildQuery('blogs', { region: 'hk', fields: ['title', 'slug'], populate: { featuredImage: true } });
  assert.deepEqual(q.fields, ['title', 'slug']);
  assert.deepEqual(q.populate, { featuredImage: true });
  assert.equal(q.filters.regions.slug.$eq, 'hk');
  const d = buildQuery('blogs');
  assert.equal(d.fields, undefined);
  assert.equal(d.populate.seo.populate.shareImage, true);
  assert.equal(buildQuery('blogs', { populate: null }).populate, undefined, 'null disables populate');
});

test('mediaUrl resolves relative, absolute, format and missing media', () => {
  const media = { url: '/uploads/a.jpg', formats: { small: { url: '/uploads/small_a.jpg' } } };
  assert.equal(mediaUrl(media, { mediaBaseUrl: 'http://cms.test/' }), 'http://cms.test/uploads/a.jpg');
  assert.equal(mediaUrl(media, { mediaBaseUrl: 'http://cms.test', format: 'small' }), 'http://cms.test/uploads/small_a.jpg');
  assert.equal(mediaUrl(media, { mediaBaseUrl: 'http://cms.test', format: 'large' }), 'http://cms.test/uploads/a.jpg');
  assert.equal(mediaUrl({ url: 'https://cdn.test/x.jpg' }, { mediaBaseUrl: 'http://cms.test' }), 'https://cdn.test/x.jpg');
  assert.equal(mediaUrl(null), null);
  assert.equal(mediaUrl({}), null);
});

test('mediaUrl rejects non-http schemes and protocol-relative URLs', () => {
  assert.equal(mediaUrl({ url: 'javascript:alert(1)' }, { mediaBaseUrl: 'http://cms.test' }), null);
  assert.equal(mediaUrl({ url: 'data:image/png;base64,AAAA' }, { mediaBaseUrl: 'http://cms.test' }), null);
  assert.equal(mediaUrl({ url: '//evil.test/x.jpg' }, { mediaBaseUrl: 'http://cms.test' }), null);
  assert.equal(mediaUrl({ url: 'uploads/c.jpg' }, { mediaBaseUrl: 'http://cms.test' }), 'http://cms.test/uploads/c.jpg');
});

test('a token is refused when running in a browser', () => {
  globalThis.window = {};
  globalThis.document = {};
  try {
    assert.throws(() => createVelzaCmsClient({ baseUrl: BASE, token: 'secret', fetch: async () => {} }), (e) => e.kind === 'config');
    assert.doesNotThrow(() => createVelzaCmsClient({ baseUrl: BASE, fetch: async () => {} }));
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('client.mediaUrl defaults to the CMS origin', () => {
  const client = createVelzaCmsClient({ baseUrl: 'http://cms.test/', fetch: async () => {} });
  assert.equal(client.mediaUrl({ url: '/uploads/b.png' }), 'http://cms.test/uploads/b.png');
  const separate = createVelzaCmsClient({ baseUrl: 'http://cms.test', mediaBaseUrl: 'http://media.test', fetch: async () => {} });
  assert.equal(separate.mediaUrl({ url: '/uploads/b.png' }), 'http://media.test/uploads/b.png');
});
