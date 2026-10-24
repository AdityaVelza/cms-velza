// In-process mock of the Strapi 5 Content API for tests (127.0.0.1 only).
// Entries are mutable so tests can simulate publish, edit, unpublish and delete. Like Strapi, the
// Content API only returns entries with publishedAt set (published), and honours the slug and region
// filters used by the website client.
import { createServer } from 'node:http';

export const blocks = (...paragraphs) => paragraphs.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] }));

let seq = 0;
export const makeEntry = (over = {}) => {
  seq += 1;
  return {
    id: seq,
    documentId: `doc${seq}`,
    title: `Entry ${seq}`,
    slug: `entry-${seq}`,
    excerpt: `Excerpt ${seq}`,
    summary: `Summary ${seq}`,
    content: blocks(`Intro paragraph ${seq}.`, `Second paragraph ${seq}.`),
    publicationDate: '2026-10-20T09:00:00.000Z',
    publishedAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    featuredImage: { url: `/uploads/featured_${seq}.jpg`, alternativeText: `Featured ${seq}`, formats: { medium: { url: `/uploads/medium_featured_${seq}.jpg` } } },
    gallery: [],
    author: null,
    category: null,
    regions: [{ slug: 'mock-hk', name: 'Mock HK' }],
    seo: { metaTitle: `SEO title ${seq}`, metaDescription: `SEO description ${seq}`, canonicalUrl: null, ogTitle: null, ogDescription: null, shareImage: null, noIndex: false },
    faqs: [],
    ...over,
  };
};

export const startMockStrapi = async () => {
  const state = { blogs: [], 'news-articles': [], fail: false, requests: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    state.requests.push(decodeURIComponent(url.pathname + url.search));
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin || '*' });
      res.end(JSON.stringify(body));
    };
    if (state.fail) return send(500, { data: null, error: { status: 500, name: 'InternalServerError', message: 'Mock failure' } });
    const m = /^\/api\/(blogs|news-articles)$/.exec(url.pathname);
    if (req.method !== 'GET' || !m) return send(404, { data: null, error: { status: 404, name: 'NotFoundError', message: 'Not Found' } });
    const slug = url.searchParams.get('filters[slug][$eq]');
    const region = url.searchParams.get('filters[regions][slug][$eq]');
    const pageSize = Math.min(Number(url.searchParams.get('pagination[pageSize]')) || 25, 100);
    const data = state[m[1]]
      .filter((e) => e.publishedAt) // Content API: published only
      .filter((e) => !slug || e.slug === slug)
      .filter((e) => !region || (e.regions || []).some((r) => r.slug === region))
      .sort((a, b) => String(b.publicationDate).localeCompare(String(a.publicationDate)));
    send(200, { data: data.slice(0, pageSize), meta: { pagination: { page: 1, pageSize, pageCount: 1, total: data.length } } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { state, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
};
