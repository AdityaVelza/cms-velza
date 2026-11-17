// Unit tests for the website's server-side CMS article renderer (server/cms in the website repository).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { startMockStrapi, makeEntry, blocks } from './helpers/mock-strapi.mjs';

const WEBSITE_ROOT = process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal';
const mod = (rel) => import(pathToFileURL(`${WEBSITE_ROOT}/server/cms/${rel}`).href);
const { renderArticle, buildRelated, buildNav, TYPES } = await mod('render-article.mjs');
const { renderBlocks, blocksToText } = await mod('blocks.mjs');
const { esc, jsonLd, safeHref, formatDate } = await mod('html.mjs');
const { extractTemplate, REGIONS, REFERENCE_PAGES, MARKERS, templatePath } = await mod('build-templates.mjs');

const template = (region, type) => readFileSync(templatePath(WEBSITE_ROOT, region, type), 'utf8');
const cfgFor = (baseUrl) => ({ baseUrl, regionSlugs: { hk: 'mock-hk', in: 'mock-in', ph: 'mock-ph' }, siteOrigin: 'https://site.test' });

// ---- helpers ---------------------------------------------------------------------------------
test('esc escapes HTML-significant characters', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('jsonLd cannot break out of a script element', () => {
  const out = jsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.deepEqual(JSON.parse(out), { headline: '</script><script>alert(1)</script>' });
});

test('safeHref allows http(s), mailto, tel, same-site paths; rejects javascript:, data: and protocol-relative', () => {
  assert.deepEqual(safeHref('https://x.test/a', 'https://site.test'), { href: 'https://x.test/a', external: true });
  assert.deepEqual(safeHref('https://site.test/a', 'https://site.test'), { href: 'https://site.test/a', external: false });
  assert.equal(safeHref('/contact-us').external, false);
  assert.equal(safeHref('mailto:a@b.test').href, 'mailto:a@b.test');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'vbscript:x', '']) assert.equal(safeHref(bad), null, bad);
});

test('formatDate gives the site date style in UTC', () => {
  assert.deepEqual(formatDate('2026-09-03T23:30:00.000Z'), { iso: '2026-09-03', label: 'Sep 03, 2026' });
  assert.equal(formatDate('not a date'), null);
});

const ZONES = { hk: 'Asia/Hong_Kong', in: 'Asia/Kolkata', ph: 'Asia/Manila' };

test('formatDate: a UTC timestamp shows the calendar date of each region at its midnight boundary', () => {
  // 27 Oct 2026 00:00 India time, as stored by Strapi (the live-test bug: shown as Oct 26 in UTC).
  assert.equal(formatDate('2026-10-26T18:30:00.000Z').label, 'Oct 26, 2026', 'no zone: UTC, unchanged');
  for (const tz of Object.values(ZONES)) assert.deepEqual(formatDate('2026-10-26T18:30:00.000Z', tz), { iso: '2026-10-27', label: 'Oct 27, 2026' }, tz);
  assert.equal(formatDate('2026-10-26T18:29:59.999Z', ZONES.in).iso, '2026-10-26', 'one ms before India midnight');
  // 27 Oct 2026 00:00 Hong Kong / Manila time (UTC+8).
  assert.equal(formatDate('2026-10-26T16:00:00.000Z', ZONES.hk).iso, '2026-10-27');
  assert.equal(formatDate('2026-10-26T16:00:00.000Z', ZONES.ph).iso, '2026-10-27');
  assert.equal(formatDate('2026-10-26T15:59:59.999Z', ZONES.hk).iso, '2026-10-26', 'one ms before Hong Kong midnight');
  assert.equal(formatDate('2026-10-26T15:59:59.999Z', ZONES.ph).iso, '2026-10-26', 'one ms before Manila midnight');
  assert.equal(formatDate('2026-10-26T16:00:00.000Z', ZONES.in).iso, '2026-10-26', 'same instant is still Oct 26 in India');
  // Month and year roll over in the zone, not in UTC.
  assert.deepEqual(formatDate('2026-12-31T16:30:00.000Z', ZONES.hk), { iso: '2027-01-01', label: 'Jan 01, 2027' });
  assert.equal(formatDate('2026-12-31T16:30:00.000Z', ZONES.in).iso, '2026-12-31');
});

test('formatDate: legitimate timestamps are not shifted, date-only values keep their calendar date', () => {
  for (const tz of [undefined, ...Object.values(ZONES)]) {
    assert.equal(formatDate('2026-10-27T06:00:00.000Z', tz).iso, '2026-10-27', `midday UTC, ${tz}`);
    assert.deepEqual(formatDate('2026-10-27', tz), { iso: '2026-10-27', label: 'Oct 27, 2026' }, `date-only, ${tz}`);
  }
  assert.equal(formatDate('2026-10-27T00:00:00+05:30', ZONES.in).iso, '2026-10-27', 'explicit offset');
  assert.equal(formatDate('2026-10-27T00:00:00+05:30').iso, '2026-10-26', 'explicit offset, UTC');
  assert.equal(formatDate('2026-10-26T18:30:00.000Z', 'Not/AZone').iso, '2026-10-26', 'unknown zone falls back to UTC');
  assert.equal(formatDate('2026-02-30'), null, 'impossible date-only value');
  assert.equal(formatDate(null, ZONES.hk), null);
});

test('article pages show the publication date in their region, on the page and in JSON-LD; meta times stay UTC', async () => {
  const cms = await startMockStrapi();
  try {
    const allRegions = [{ slug: 'mock-hk' }, { slug: 'mock-in' }, { slug: 'mock-ph' }];
    cms.state.blogs.push(
      makeEntry({ slug: 'india-midnight', regions: allRegions, publicationDate: '2026-10-26T18:30:00.000Z', updatedAt: '2026-10-26T18:30:00.000Z' }),
      makeEntry({ slug: 'utc8-midnight', regions: allRegions, publicationDate: '2026-10-26T16:00:00.000Z', updatedAt: '2026-10-26T16:00:00.000Z' }),
    );
    const expected = {
      'india-midnight': { hk: '2026-10-27', in: '2026-10-27', ph: '2026-10-27' },
      'utc8-midnight': { hk: '2026-10-27', in: '2026-10-26', ph: '2026-10-27' },
    };
    for (const [slug, byRegion] of Object.entries(expected)) {
      for (const [region, iso] of Object.entries(byRegion)) {
        const out = await renderArticle({ type: 'blogs', slug, region, template: template(region, 'blogs'), config: cfgFor(cms.url) });
        assert.equal(out.status, 200);
        const label = formatDate(iso).label;
        assert.match(out.body, new RegExp(`<time datetime="${iso}">${label}</time>`), `${slug} ${region} visible date`);
        assert.match(out.body, new RegExp(`"datePublished": "${iso}"`), `${slug} ${region} JSON-LD datePublished`);
        assert.match(out.body, new RegExp(`"dateModified": "${iso}"`), `${slug} ${region} JSON-LD dateModified`);
        const utc = cms.state.blogs.find((e) => e.slug === slug).publicationDate;
        assert.match(out.body, new RegExp(`property="article:published_time" content="${utc}"`), `${slug} ${region} meta time unchanged`);
      }
    }
  } finally {
    await cms.close();
  }
});

// ---- blocks ----------------------------------------------------------------------------------
test('blocks render headings, lists, quotes, code, images and inline marks with escaping', () => {
  const html = renderBlocks([
    { type: 'heading', level: 2, children: [{ type: 'text', text: 'Section <1>' }] },
    { type: 'heading', level: 3, children: [{ type: 'text', text: 'Sub' }] },
    { type: 'paragraph', children: [{ type: 'text', text: 'Bold', bold: true }, { type: 'text', text: ' & ' }, { type: 'text', text: 'it', italic: true }] },
    { type: 'list', format: 'ordered', children: [{ type: 'list-item', children: [{ type: 'text', text: 'one' }] }] },
    { type: 'list', format: 'unordered', children: [{ type: 'list-item', children: [{ type: 'text', text: 'a' }] }] },
    { type: 'quote', children: [{ type: 'text', text: 'Q' }] },
    { type: 'code', children: [{ type: 'text', text: '<b>x</b>' }] },
    { type: 'image', image: { url: '/uploads/i.jpg', alternativeText: 'Alt' } },
    { type: 'mystery', children: [] },
    { type: 'paragraph', children: [{ type: 'text', text: '' }] },
  ], { resolveMedia: (m) => `https://cms.test${m.url}`, altFor: (a) => `${a} - Velza Global Hong Kong` }).map((b) => b.html);
  assert.deepEqual(html, [
    '<h2 class="vg-look-h5">Section &lt;1&gt;</h2>',
    '<h3>Sub</h3>',
    '<p><strong>Bold</strong> &amp; <em>it</em></p>',
    '<ol><li>one</li></ol>',
    '<ul><li>a</li></ul>',
    '<blockquote><p>Q</p></blockquote>',
    '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>',
    '<img class="mt-6 mb-6" data-ds-anim="image-reveal" src="https://cms.test/uploads/i.jpg" alt="Alt - Velza Global Hong Kong" />',
  ]);
});

test('block links are sanitised: unsafe URLs keep their text only, external links open safely', () => {
  const [p] = renderBlocks([{ type: 'paragraph', children: [
    { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', text: 'bad' }] },
    { type: 'text', text: ' ' },
    { type: 'link', url: 'https://example.test', children: [{ type: 'text', text: 'ext' }] },
    { type: 'text', text: ' ' },
    { type: 'link', url: '/blogs/x', children: [{ type: 'text', text: 'int' }] },
  ] }], { siteOrigin: 'https://site.test' });
  assert.equal(p.html, '<p>bad <a href="https://example.test" target="_blank" rel="noopener noreferrer">ext</a> <a href="/blogs/x">int</a></p>');
});

test('blocksToText flattens nested text', () => {
  assert.equal(blocksToText(blocks('One', 'Two')), 'One\nTwo');
});

// ---- templates -------------------------------------------------------------------------------
test('every template reproduces its live reference page byte-for-byte outside the CMS markers', () => {
  for (const region of REGIONS) {
    for (const [type, rel] of Object.entries(REFERENCE_PAGES)) {
      const page = readFileSync(`${WEBSITE_ROOT}/regions/${region}/${rel}`, 'utf8');
      const { template: expected, slices } = extractTemplate(page);
      const tpl = template(region, type);
      assert.equal(tpl, expected, `${region}/${type} template is up to date`);
      let rebuilt = tpl;
      for (const k of Object.keys(MARKERS)) rebuilt = rebuilt.replace(MARKERS[k], slices[k]);
      assert.equal(rebuilt, page, `${region}/${type} parity`);
      assert.doesNotMatch(tpl, /tonino|lamborghini|global brand partnership/i, `${region}/${type} has no article-specific text`);
    }
  }
});

// ---- renderArticle: status codes ---------------------------------------------------------------
test('status codes: 200 published, 404 for invalid/unknown/draft/other-region/disabled, 503 on CMS failure', async () => {
  const cms = await startMockStrapi();
  try {
    cms.state.blogs.push(
      makeEntry({ slug: 'live-post', title: 'Live post' }),
      makeEntry({ slug: 'draft-post', publishedAt: null }),
      makeEntry({ slug: 'in-only', regions: [{ slug: 'mock-in' }] }),
    );
    const go = (slug, region = 'hk', config = cfgFor(cms.url), type = 'blogs') => renderArticle({ type, slug, region, template: template(region, type), config });
    assert.equal((await go('live-post')).status, 200);
    assert.equal((await go('draft-post')).reason, 'not-found');
    assert.equal((await go('in-only')).status, 404, 'assigned to another region');
    assert.equal((await go('in-only', 'in')).status, 200, 'visible in its own region');
    assert.equal((await go('missing')).status, 404);
    for (const bad of ['Upper', '../x', 'a b', 'x--y', '-x', '']) assert.equal((await go(bad)).reason, 'invalid-path', bad);
    assert.equal((await go('live-post', 'hk', { ...cfgFor(cms.url), baseUrl: null })).reason, 'cms-disabled');
    assert.equal((await go('live-post', 'hk', { ...cfgFor(cms.url), regionSlugs: { hk: null } })).reason, 'region-unmapped');
    assert.equal((await renderArticle({ type: 'blogs', slug: 'live-post', region: 'hk', template: '<html></html>', config: cfgFor(cms.url) })).status, 500);
    cms.state.fail = true;
    const down = await go('live-post');
    assert.equal(down.status, 503);
    assert.equal(down.body, null, 'never serves content when the CMS fails');
  } finally { await cms.close(); }
  const unreachable = await renderArticle({ type: 'blogs', slug: 'x', region: 'hk', template: template('hk', 'blogs'), config: { ...cfgFor('http://127.0.0.1:9'), timeoutMs: 2000 } });
  assert.equal(unreachable.status, 503);
});

test('a result whose region or slug does not match is rejected even if the API returned it', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [makeEntry({ slug: 'other', regions: [{ slug: 'mock-in' }] })] }) });
  const out = await renderArticle({ type: 'blogs', slug: 'other', region: 'hk', template: template('hk', 'blogs'), config: cfgFor('http://cms.test'), fetch: fakeFetch });
  assert.equal(out.status, 404);
});

// ---- renderArticle: content ------------------------------------------------------------------
test('blog page: SEO block, JSON-LD, body order, gallery, FAQs, related and navigation', async () => {
  const cms = await startMockStrapi();
  try {
    const entry = makeEntry({
      slug: 'cms-blog', title: 'CMS <Blog>', excerpt: 'Lead text',
      content: [
        { type: 'heading', level: 2, children: [{ type: 'text', text: 'Introduction' }] },
        ...blocks('First paragraph.', 'Second paragraph.'),
      ],
      gallery: [{ url: '/uploads/g1.jpg', alternativeText: 'Gallery one' }],
      author: { name: 'Jane Writer' },
      category: { name: 'Insights' },
      faqs: [{ question: 'Why?', answer: blocks('Because.') }],
      seo: { metaTitle: 'Meta title', metaDescription: 'Meta description', canonicalUrl: null, ogTitle: null, ogDescription: null, shareImage: null, noIndex: false },
    });
    cms.state.blogs.push(entry, makeEntry({ slug: 'older', title: 'Older', publicationDate: '2026-01-01T00:00:00.000Z' }));
    cms.state['news-articles'].push(makeEntry({ slug: 'news-one', title: 'News one', publicationDate: '2026-09-01T00:00:00.000Z' }), makeEntry({ slug: 'news-ph', regions: [{ slug: 'mock-ph' }] }));
    const out = await renderArticle({ type: 'blogs', slug: 'cms-blog', region: 'hk', template: template('hk', 'blogs'), config: cfgFor(cms.url) });
    assert.equal(out.status, 200);
    const html = out.body;
    assert.ok(!Object.values(MARKERS).some((m) => html.includes(m)), 'all markers replaced');
    assert.match(html, /<title>Meta title \| Velza Global<\/title>/);
    assert.match(html, /<meta name="description" content="Meta description" \/>/);
    assert.match(html, /<meta name="author" content="Jane Writer" \/>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/blogs\/cms-blog" \/>/);
    assert.match(html, /<meta property="og:locale" content="en_HK" \/>/);
    assert.match(html, new RegExp(`<meta property="og:image" content="${cms.url}/uploads/featured_\\d+\\.jpg" />`));
    assert.match(html, /<meta name="robots" content="index, follow/);
    const ld = JSON.parse(/<script type="application\/ld\+json">\n([\s\S]*?)\n\s*<\/script>/.exec(html.slice(html.indexOf('<!-- SEO / Social Metadata -->')))[1]);
    const types = ld['@graph'].map((g) => g['@type']);
    assert.deepEqual(types, ['BreadcrumbList', 'Article', 'FAQPage']);
    const article = ld['@graph'][1];
    assert.equal(article.headline, 'CMS <Blog>');
    assert.equal(article.datePublished, '2026-10-20');
    assert.equal(article.dateModified, '2026-10-21');
    assert.deepEqual(article.author, { '@type': 'Person', name: 'Jane Writer' });
    assert.equal(article.articleSection, 'Insights');
    assert.equal(article.image.length, 2, 'featured + gallery');
    // Body order: date, title, intro heading, first paragraph, featured image, second paragraph, gallery, FAQ, CTA.
    const body = html.slice(html.indexOf('<div class="post-content pb-5">'), html.indexOf('</article>'));
    const order = ['<p class="post-date"><time datetime="2026-10-20">Oct 20, 2026</time></p>', '<h1 class="h2-large"><strong>CMS &lt;BLOG&gt;</strong></h1>',
      '<h2 class="vg-look-h5">Introduction</h2>', '<p>First paragraph.</p>', 'featured_', '<p>Second paragraph.</p>', 'g1.jpg',
      '<div class="sk__faq-accordion"', 'class="btn btn-outline-light mt-3" href="/contact-us"'];
    let last = -1;
    for (const piece of order) { const i = body.indexOf(piece); assert.ok(i > last, `order: ${piece}`); last = i; }
    assert.match(body, /alt="Featured \d+ - Velza Global Hong Kong"/);
    assert.match(body, /<span class="sk__faq-question">Why\?<\/span>/);
    // Related: newest same-region entries of both types, never itself, never other regions.
    const related = html.slice(html.indexOf('<section class="vg-related"'), html.indexOf('</section>', html.indexOf('<section class="vg-related"')));
    assert.match(related, /href="\/news\/news-one"/);
    assert.match(related, /href="\/blogs\/older"/);
    assert.doesNotMatch(related, /cms-blog|news-ph/);
    assert.match(related, /News &middot; Sep 01, 2026/);
    assert.match(html, /BACK TO BLOGS[\s\S]*All Velza Global Blogs/);
  } finally { await cms.close(); }
});

test('news page: NewsArticle, no FAQ section, safe source link, region locale, canonical/noindex overrides', async () => {
  const cms = await startMockStrapi();
  try {
    cms.state['news-articles'].push(makeEntry({
      slug: 'cms-news', title: 'CMS news', regions: [{ slug: 'mock-ph' }], sourceName: 'Wire <Service>', sourceUrl: 'https://wire.test/a',
      seo: { metaTitle: 'Velza Global news', metaDescription: 'D', canonicalUrl: 'https://canonical.test/x', ogTitle: 'OG title', ogDescription: 'OG desc', shareImage: { url: '/uploads/share.jpg', alternativeText: 'Share' }, noIndex: true },
    }));
    const out = await renderArticle({ type: 'news', slug: 'cms-news', region: 'ph', template: template('ph', 'news'), config: cfgFor(cms.url) });
    assert.equal(out.status, 200);
    const html = out.body;
    assert.match(html, /<title>Velza Global news<\/title>/, 'no duplicate suffix');
    assert.match(html, /<link rel="canonical" href="https:\/\/canonical\.test\/x" \/>/);
    assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
    assert.match(html, /<meta property="og:locale" content="en_PH" \/>/);
    assert.match(html, /<meta property="og:title" content="OG title" \/>/);
    assert.match(html, new RegExp(`<meta property="og:image" content="${cms.url}/uploads/share\\.jpg" />`));
    assert.match(html, /"@type": "NewsArticle"/);
    assert.doesNotMatch(html, /"@type": "FAQPage"|sk__faq-accordion/);
    assert.match(html, /Source: <a href="https:\/\/wire\.test\/a" target="_blank" rel="noopener noreferrer">Wire &lt;Service&gt;<\/a>/);
    assert.match(html, /BACK TO NEWS[\s\S]*All Velza Global News/);
    assert.doesNotMatch(html, /<section class="vg-related"/, 'no related section when nothing else is published');
  } finally { await cms.close(); }
});

test('unsafe sourceUrl is not linked and missing images do not break the page', async () => {
  const cms = await startMockStrapi();
  try {
    cms.state['news-articles'].push(makeEntry({ slug: 'plain', sourceName: 'Src', sourceUrl: 'javascript:alert(1)', featuredImage: null, content: [] }));
    const out = await renderArticle({ type: 'news', slug: 'plain', region: 'hk', template: template('hk', 'news'), config: cfgFor(cms.url) });
    assert.equal(out.status, 200);
    assert.match(out.body, /<p class="vg-cms-source">Source: Src<\/p>/);
    assert.doesNotMatch(out.body, /javascript:alert/);
    assert.doesNotMatch(out.body.slice(out.body.indexOf('<div class="post-content pb-5">'), out.body.indexOf('</article>')), /<img/);
  } finally { await cms.close(); }
});

test('buildRelated and buildNav produce the existing markup', () => {
  assert.equal(buildRelated([]), '');
  const r = buildRelated([{ href: '/blogs/a', title: 'A & B', label: 'Blog', date: 'Sep 01, 2026', image: '/i.jpg' }]);
  assert.match(r, /<a class="vg-related-card" href="\/blogs\/a">\n<img src="\/i\.jpg" alt="" loading="lazy" decoding="async" \/>\n<span class="vg-related-meta">Blog &middot; Sep 01, 2026<\/span>\n<h3 class="vg-related-title">A &amp; B<\/h3>/);
  assert.match(buildNav('blogs'), /<a href="\/blogs" class="article-nav article-prev">/);
  assert.deepEqual(Object.keys(TYPES), ['blogs', 'news']);
});
