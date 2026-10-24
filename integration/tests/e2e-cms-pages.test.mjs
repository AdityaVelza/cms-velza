// End-to-end lifecycle test: tools/dev-site-server.mjs (serving the website repository) + the website's
// server/cms renderer + an in-process mock Strapi whose entries the test publishes, edits, unpublishes
// and deletes. Exercises real HTTP status codes and pages on 127.0.0.1 only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startMockStrapi, makeEntry, blocks } from './helpers/mock-strapi.mjs';

const WEBSITE_ROOT = process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal';
const PORT = 18000 + Math.floor(Math.random() * 1000);
const SITE = `http://127.0.0.1:${PORT}`;
let cms; let server;

const get = async (path) => {
  const res = await fetch(SITE + path, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, text: await res.text() };
};
const titleOf = (html) => (/<title>([^<]*)<\/title>/.exec(html) || [])[1];

before(async () => {
  cms = await startMockStrapi();
  server = spawn(process.execPath, [fileURLToPath(new URL('../tools/dev-site-server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), SITE_ROOT: WEBSITE_ROOT, DEV_CMS_URL: cms.url, DEV_CMS_DETAIL: 'true',
      DEV_CMS_REGION_HK: 'mock-hk', DEV_CMS_REGION_IN: 'mock-in', DEV_CMS_REGION_PH: 'mock-ph' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 100; i += 1) {
    try { await fetch(`${SITE}/robots.txt`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('dev site did not start');
});
after(async () => { server?.kill(); await cms?.close(); });

test('two published blogs give two working article pages with their own content', async () => {
  cms.state.blogs.push(
    makeEntry({ slug: 'first-cms-blog', title: 'First CMS blog', seo: { metaTitle: 'First meta', metaDescription: 'First description' } }),
    makeEntry({ slug: 'second-cms-blog', title: 'Second CMS blog', seo: { metaTitle: 'Second meta', metaDescription: 'Second description' } }),
  );
  const a = await get('/blogs/first-cms-blog');
  const b = await get('/blogs/second-cms-blog');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.headers.get('x-velza-source'), 'cms');
  assert.equal(titleOf(a.text), 'First meta | Velza Global');
  assert.equal(titleOf(b.text), 'Second meta | Velza Global');
  assert.match(a.text, /<strong>FIRST CMS BLOG<\/strong>/);
  assert.match(a.text, /href="\/blogs\/second-cms-blog"/, 'related links to the other blog');
  assert.match(a.text, /<footer class="dark-shade-2-bg position-relative">/, 'existing footer');
});

test('news behaves the same way', async () => {
  cms.state['news-articles'].push(
    makeEntry({ slug: 'first-cms-news', title: 'First CMS news' }),
    makeEntry({ slug: 'second-cms-news', title: 'Second CMS news' }),
  );
  for (const slug of ['first-cms-news', 'second-cms-news']) {
    const r = await get(`/news/${slug}`);
    assert.equal(r.status, 200, slug);
    assert.match(r.text, /"@type": "NewsArticle"/);
    assert.match(r.text, /BACK TO NEWS/);
  }
});

test('edits to title, image, body and SEO are reflected on the next request', async () => {
  const e = makeEntry({ slug: 'editable', title: 'Before title', content: blocks('Old body.'), seo: { metaTitle: 'Old meta', metaDescription: 'Old desc' } });
  cms.state.blogs.push(e);
  assert.match((await get('/blogs/editable')).text, /Old body\./);
  Object.assign(e, {
    title: 'After title', content: blocks('New body.'),
    featuredImage: { url: '/uploads/new-image.jpg', alternativeText: 'New image' },
    seo: { metaTitle: 'New meta', metaDescription: 'New desc', noIndex: true },
    updatedAt: '2026-10-25T08:00:00.000Z',
  });
  const r = await get('/blogs/editable');
  assert.equal(titleOf(r.text), 'New meta | Velza Global');
  assert.match(r.text, /<strong>AFTER TITLE<\/strong>/);
  assert.match(r.text, /New body\./);
  assert.doesNotMatch(r.text, /Old body\./);
  assert.match(r.text, /uploads\/new-image\.jpg/);
  assert.match(r.text, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(r.text, /"dateModified": "2026-10-25"/);
});

test('unpublishing and deleting return a real 404 with the region 404 page, never stale content', async () => {
  const e = makeEntry({ slug: 'lifecycle', title: 'Lifecycle post' });
  cms.state.blogs.push(e);
  assert.equal((await get('/blogs/lifecycle')).status, 200);
  e.publishedAt = null; // unpublish
  const unpublished = await get('/blogs/lifecycle');
  assert.equal(unpublished.status, 404);
  assert.match(unpublished.text, /404 – Page Not Found \| Velza Global/);
  assert.doesNotMatch(unpublished.text, /LIFECYCLE POST/);
  e.publishedAt = '2026-10-20T09:00:00.000Z'; // re-publish
  assert.equal((await get('/blogs/lifecycle')).status, 200);
  cms.state.blogs.splice(cms.state.blogs.indexOf(e), 1); // delete
  const deleted = await get('/blogs/lifecycle');
  assert.equal(deleted.status, 404);
  assert.doesNotMatch(deleted.text, /LIFECYCLE POST/);
});

test('drafts are never public', async () => {
  cms.state.blogs.push(makeEntry({ slug: 'secret-draft', title: 'Secret draft', publishedAt: null }));
  const r = await get('/blogs/secret-draft');
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.text, /SECRET DRAFT|Secret draft/);
});

test('region assignment is enforced on detail URLs for all three regions', async () => {
  cms.state.blogs.push(makeEntry({ slug: 'india-only', title: 'India only', regions: [{ slug: 'mock-in' }] }));
  cms.state['news-articles'].push(makeEntry({ slug: 'hk-and-ph', title: 'HK and PH', regions: [{ slug: 'mock-hk' }, { slug: 'mock-ph' }] }));
  assert.equal((await get('/blogs/india-only?_r=in')).status, 200);
  assert.equal((await get('/blogs/india-only?_r=hk')).status, 404);
  assert.equal((await get('/blogs/india-only?_r=ph')).status, 404);
  assert.equal((await get('/news/hk-and-ph?_r=hk')).status, 200);
  assert.equal((await get('/news/hk-and-ph?_r=ph')).status, 200);
  assert.equal((await get('/news/hk-and-ph?_r=in')).status, 404);
  const inPage = await get('/blogs/india-only?_r=in');
  assert.match(inPage.text, /og:locale" content="en_IN"/);
  assert.match(inPage.text, /Velza Global India/);
});

test('existing static article pages are served unchanged, even if the CMS has the same slug', async () => {
  cms.state.blogs.push(makeEntry({ slug: 'global-brand-partnership', title: 'CMS copy must not win' }));
  for (const region of ['hk', 'in', 'ph']) {
    for (const rel of ['blogs/global-brand-partnership', 'news/tonino-lamborghini-velza-global-partnership-philippines']) {
      const r = await get(`/${rel}?_r=${region}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-velza-source'), null);
      assert.equal(r.text, readFileSync(`${WEBSITE_ROOT}/regions/${region}/${rel}.html`, 'utf8'), `${region}/${rel} byte-identical`);
    }
  }
});

test('unknown and malformed slugs return 404; CMS outage returns 503', async () => {
  assert.equal((await get('/blogs/does-not-exist')).status, 404);
  assert.equal((await get('/news/does-not-exist')).status, 404);
  assert.equal((await get('/blogs/Bad_Slug')).status, 404);
  assert.equal((await get('/blogs/a/b')).status, 404);
  cms.state.blogs.push(makeEntry({ slug: 'during-outage' }));
  cms.state.fail = true;
  try {
    const r = await get('/blogs/during-outage');
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('retry-after'), '60');
  } finally { cms.state.fail = false; }
  assert.equal((await get('/blogs/during-outage')).status, 200, 'recovers once the CMS is back');
});

test('listing pages still serve their static markup and the integration markers', async () => {
  for (const region of ['hk', 'in', 'ph']) {
    for (const page of ['blogs', 'news']) {
      const r = await get(`/${page}?_r=${region}`);
      assert.equal(r.status, 200);
      assert.match(r.text, new RegExp(`data-cms-region="${region}"`));
      assert.match(r.text, /content-listing\.js/);
    }
  }
  const cfg = await get('/shared/js/velza-cms/cms-config.js');
  assert.match(cfg.text, /"detailPages": true/, 'local override enables CMS card links');
});
