// Local-only mock of the Strapi 5 Content API for browser testing of the website integration.
// It returns Strapi-5-shaped JSON (flat entries, documentId, meta.pagination) for GET /api/blogs,
// honours filters[regions][slug][$eq] and filters[slug][$eq], and answers CORS like Strapi does locally.
// MOCK_MODE=empty returns no items; MOCK_MODE=error returns HTTP 500. Binds 127.0.0.1 only.
//   node tools/mock-cms-server.mjs     (port 1398)
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 1398);
const MODE = process.env.MOCK_MODE || 'data';
const SITE = process.env.MOCK_SITE_ORIGIN || 'http://127.0.0.1:8099';

const blogs = [
  {
    id: 11, documentId: 'mockdoc1', title: 'Mock CMS post: market entry playbook', slug: 'global-brand-partnership',
    excerpt: 'Mock excerpt', publicationDate: '2026-10-20T09:00:00.000Z', publishedAt: '2026-10-20T09:00:00.000Z',
    featuredImage: {
      id: 1, documentId: 'img1', alternativeText: 'Mock featured image', url: `${SITE}/shared/images/Global Brand Partnership main.webp`,
      formats: { medium: { url: `${SITE}/shared/images/Global Brand Partnership main.webp` } },
    },
    regions: [{ id: 1, documentId: 'r1', name: 'Mock HK', slug: 'mock-hk' }],
  },
  {
    id: 12, documentId: 'mockdoc2', title: 'Mock CMS post without an image', slug: 'mock-post-without-image',
    excerpt: 'Mock excerpt', publicationDate: '2026-10-19T09:00:00.000Z', publishedAt: '2026-10-19T09:00:00.000Z',
    featuredImage: null,
    regions: [{ id: 1, documentId: 'r1', name: 'Mock HK', slug: 'mock-hk' }],
  },
  {
    id: 13, documentId: 'mockdoc3', title: 'Mock PH-only post', slug: 'mock-ph-only',
    publicationDate: '2026-10-18T09:00:00.000Z', publishedAt: '2026-10-18T09:00:00.000Z', featuredImage: null,
    regions: [{ id: 2, documentId: 'r2', name: 'Mock PH', slug: 'mock-ph' }],
  },
];

// One region-specific entry per site region, so each regional page shows distinct content.
for (const [code, name] of [['ph', 'Mock PH'], ['in', 'Mock IN']]) {
  blogs.push({
    id: 20 + blogs.length, documentId: `mock-${code}`, title: `Mock ${code.toUpperCase()} regional post`, slug: `mock-${code}-regional-post`,
    publicationDate: '2026-10-17T09:00:00.000Z', publishedAt: '2026-10-17T09:00:00.000Z',
    featuredImage: { id: 3, documentId: 'img3', alternativeText: `Mock ${code} image`, url: `${SITE}/shared/images/blog-hero-banner.webp` },
    regions: [{ id: 3, documentId: `r-${code}`, name, slug: `mock-${code}` }],
  });
}
const news = [
  {
    id: 31, documentId: 'mocknews1', title: 'Mock CMS news: partnership update', slug: 'tonino-lamborghini-velza-global-partnership-philippines',
    summary: 'Mock summary', publicationDate: '2026-10-21T09:00:00.000Z', publishedAt: '2026-10-21T09:00:00.000Z',
    featuredImage: { id: 4, documentId: 'img4', alternativeText: 'Mock news image', url: `${SITE}/shared/images/news-feed-image-01.webp` },
    regions: ['mock-hk', 'mock-ph', 'mock-in'].map((slug, i) => ({ id: i + 1, documentId: `r${i}`, name: slug, slug })),
  },
  {
    id: 32, documentId: 'mocknews2', title: 'Mock CMS news with a broken image URL', slug: 'mock-news-broken-image',
    summary: 'Mock summary', publicationDate: '2026-10-20T09:00:00.000Z', publishedAt: '2026-10-20T09:00:00.000Z',
    featuredImage: { id: 5, documentId: 'img5', alternativeText: 'Unsafe', url: 'javascript:alert(1)' },
    regions: [{ id: 1, documentId: 'r1', name: 'Mock HK', slug: 'mock-hk' }],
  },
];
const COLLECTIONS = { '/api/blogs': blogs, '/api/news-articles': news };

const send = (res, origin, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://local');
  console.log(`${req.method} ${url.pathname}${url.search ? ' ' + decodeURIComponent(url.search).slice(0, 160) : ''}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Accept' });
    return res.end();
  }
  const collection = COLLECTIONS[url.pathname];
  if (req.method !== 'GET' || !collection) {
    return send(res, origin, 404, { data: null, error: { status: 404, name: 'NotFoundError', message: 'Not Found' } });
  }
  if (MODE === 'error') return send(res, origin, 500, { data: null, error: { status: 500, name: 'InternalServerError', message: 'Mock failure' } });
  const region = url.searchParams.get('filters[regions][slug][$eq]');
  const slug = url.searchParams.get('filters[slug][$eq]');
  let data = MODE === 'empty' ? [] : collection;
  if (region) data = data.filter((b) => b.regions.some((r) => r.slug === region));
  if (slug) data = data.filter((b) => b.slug === slug);
  const pageSize = Math.min(Number(url.searchParams.get('pagination[pageSize]')) || 25, 100);
  send(res, origin, 200, { data: data.slice(0, pageSize), meta: { pagination: { page: 1, pageSize, pageCount: 1, total: data.length } } });
}).listen(PORT, '127.0.0.1', () => console.log(`mock CMS: http://127.0.0.1:${PORT}/api/blogs (mode=${MODE})`));
