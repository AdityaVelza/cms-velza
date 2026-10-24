// Opt-in test against a LOCAL Strapi instance. Skipped unless CMS_LIVE_TEST_URL is set.
// Refuses non-local URLs so it can never be pointed at staging or production by accident.
//   CMS_LIVE_TEST_URL=http://127.0.0.1:1337 [CMS_LIVE_TEST_TOKEN=<read-only token>] npm run test:live-local
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVelzaCmsClient, CmsError } from '../velza-cms-client.js';

const baseUrl = process.env.CMS_LIVE_TEST_URL;
const token = process.env.CMS_LIVE_TEST_TOKEN || undefined;
const isLocal = baseUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(baseUrl);
const skip = !baseUrl ? 'CMS_LIVE_TEST_URL not set' : !isLocal ? 'refusing non-local URL' : false;

test('every content endpoint answers with data or a permission error', { skip }, async () => {
  const client = createVelzaCmsClient({ baseUrl, token });
  const calls = {
    blogs: () => client.listBlogs(),
    newsArticles: () => client.listNewsArticles(),
    newsletterIssues: () => client.listNewsletterIssues(),
    authors: () => client.listAuthors(),
    categories: () => client.listCategories(),
    regions: () => client.listRegions(),
  };
  for (const [name, call] of Object.entries(calls)) {
    try {
      const result = await call();
      assert.ok(Array.isArray(result.items), `${name}: items array`);
      assert.ok(result.pagination.pageSize <= 100, `${name}: page size within maxLimit`);
    } catch (e) {
      // Without a token, a fresh instance has no Public permissions: 403 proves the route exists.
      assert.ok(e instanceof CmsError && e.kind === 'http' && e.status === 403, `${name}: unexpected ${e.kind} ${e.status}`);
    }
  }
});

test('populate and region filter queries are accepted by strictParams', { skip: skip || (!token && 'needs CMS_LIVE_TEST_TOKEN') }, async () => {
  const client = createVelzaCmsClient({ baseUrl, token });
  const blogs = await client.listBlogs({ region: 'any-region', pageSize: 5 });
  assert.ok(Array.isArray(blogs.items));
  const missing = await client.getBlogBySlug('slug-that-does-not-exist');
  assert.equal(missing, null);
  await client.listNewsArticles({ region: 'any-region' });
  await client.listNewsletterIssues({ region: 'any-region' });
});
