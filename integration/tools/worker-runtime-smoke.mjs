// Smoke test for the website's Cloudflare Worker running in the Workers runtime under `wrangler dev`, against the
// local upstreams of tools/worker-runtime-upstream.mjs. Each pass-through check compares the Worker's response
// with the origin's own response to the same request. Local only (127.0.0.1). Exit code 1 if any check fails.
//   node tools/worker-runtime-smoke.mjs     (WORKER_URL, default http://127.0.0.1:8787)
const WORKER = (process.env.WORKER_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const ORIGIN = 'http://127.0.0.1:8098';
const CONTROL = 'http://127.0.0.1:8097';

const results = [];
const get = async (base, path, { country, method = 'GET' } = {}) => {
  const res = await fetch(base + path, { method, redirect: 'manual', headers: country ? { 'CF-IPCountry': country } : {} });
  return { status: res.status, headers: res.headers, text: method === 'HEAD' ? '' : await res.text() };
};
const control = (path) => fetch(CONTROL + path, { method: 'POST' });
const check = async (name, fn) => {
  try { await fn(); results.push([name, 'PASS', '']); } catch (e) { results.push([name, 'FAIL', e.message]); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const same = async (path, opts) => {
  const [w, o] = await Promise.all([get(WORKER, path, opts), get(ORIGIN, path, opts)]);
  expect(w.status === o.status, `status ${w.status} != origin ${o.status}`);
  expect(w.text === o.text, 'body differs from origin');
  expect(w.headers.get('location') === o.headers.get('location'), `location ${w.headers.get('location')} != ${o.headers.get('location')}`);
  expect(!w.headers.get('x-velza-source'), 'unexpected X-Velza-Source');
  return w;
};
const cmsPage = async (path, region, opts) => {
  const r = await get(WORKER, path, opts);
  expect(r.status === 200, `status ${r.status}`);
  expect(r.headers.get('x-velza-source') === 'cms', 'not a CMS page');
  expect(r.headers.get('x-velza-region') === region, `region ${r.headers.get('x-velza-region')} != ${region}`);
  return r;
};

await check('pages pass through unchanged (/, /about-us, /blogs, asset)', async () => {
  for (const p of ['/', '/about-us', '/blogs?_r=in', '/shared/js/velza-cms/cms-config.js']) await same(p);
});
await check('static article passes through unchanged', () => same('/blogs/global-brand-partnership?_r=hk'));
await check('redirects pass through, not followed (trailing slash, legacy root URL)', async () => {
  const a = await same('/blogs/runtime-hk-blog/?_r=hk'); expect(a.status === 301, `status ${a.status}`);
  const b = await same('/global-brand-partnership'); expect(b.status === 301, `status ${b.status}`);
});
await check('unrelated 404 and region error pages are the origin responses', async () => {
  for (const p of ['/no-such-page', '/404?_r=ph', '/regions/hk/blogs/runtime-hk-blog']) await same(p);
});
await check('CMS fallback for a missing article of the region (?_r=)', () => cmsPage('/blogs/runtime-hk-blog?_r=hk', 'hk'));
await check('CMS fallback chooses the region from CF-IPCountry like .htaccess', () => cmsPage('/news/runtime-in-news', 'in', { country: 'IN' }));
await check('region isolation: other regions get the origin 404', async () => {
  for (const [p, c] of [['/blogs/runtime-hk-blog?_r=in', undefined], ['/blogs/runtime-hk-blog', 'PH'], ['/news/runtime-in-news', 'HK']]) {
    const r = await same(p, { country: c }); expect(r.status === 404, `${p}: status ${r.status}`);
  }
});
await check('runtime Intl: dates in the region time zone (HK Oct 27, IN Oct 27, PH Oct 26)', async () => {
  expect(/Oct 27, 2026/.test((await cmsPage('/blogs/runtime-hk-blog?_r=hk', 'hk')).text), 'HK date');
  expect(/Oct 27, 2026/.test((await cmsPage('/news/runtime-in-news?_r=in', 'in')).text), 'IN date');
  expect(/Oct 26, 2026/.test((await cmsPage('/blogs/runtime-ph-blog?_r=ph', 'ph')).text), 'PH date');
});
await check('origin 403/500 on an article URL is not replaced', async () => {
  for (const status of [403, 500]) {
    await control(`/origin-status?path=/blogs/runtime-hk-blog&status=${status}`);
    try { const r = await same('/blogs/runtime-hk-blog?_r=hk'); expect(r.status === status, `status ${r.status}`); }
    finally { await control('/origin-status?path=/blogs/runtime-hk-blog&status=0'); }
  }
});
await check('HEAD on a CMS article: headers only', async () => {
  const r = await get(WORKER, '/blogs/runtime-hk-blog?_r=hk', { method: 'HEAD' });
  expect(r.status === 200 && r.headers.get('x-velza-source') === 'cms', `status ${r.status}`);
});
await check('CMS outage: missing article -> region 503 page; pages and static articles unaffected', async () => {
  await control('/cms-fail?on=1');
  try {
    const r = await get(WORKER, '/blogs/runtime-hk-blog?_r=hk');
    const page = await get(ORIGIN, '/503?_r=hk');
    expect(r.status === 503, `status ${r.status}`);
    expect(r.headers.get('retry-after') === '60', 'Retry-After');
    expect(r.text === page.text, 'body is not the region 503 page');
    for (const p of ['/about-us', '/blogs?_r=ph', '/blogs/global-brand-partnership?_r=hk', '/no-such-page']) await same(p);
  } finally { await control('/cms-fail?on=0'); }
});

const width = Math.max(...results.map(([n]) => n.length));
for (const [name, status, detail] of results) console.log(`${status}  ${name.padEnd(width)}  ${detail}`);
const failed = results.filter(([, s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${WORKER}`);
process.exit(failed ? 1 : 0);
