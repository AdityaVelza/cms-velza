// Local upstreams for testing the website's Cloudflare Worker in the real Workers runtime (`wrangler dev`)
// before any staging route exists. Binds 127.0.0.1 only; nothing leaves this machine.
//   origin   http://127.0.0.1:8098  the website files behind the .htaccess model (tests/helpers/origin-sim.mjs),
//                                   including the /regions/ guard and CF-IPCountry region selection
//   CMS      http://127.0.0.1:1399  mock Strapi Content API with one published entry per region
//   control  http://127.0.0.1:8097  POST /cms-fail?on=1|0, POST /origin-status?path=/x&status=500 (status=0 clears)
// Then, in the website's server/ folder:  npm run dev:local   (wrangler dev --local-upstream 127.0.0.1:8098 ...)
// and here:                               node tools/worker-runtime-smoke.mjs
//   node tools/worker-runtime-upstream.mjs     (WEBSITE_ROOT overrides the website path)
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createOriginSim } from '../tests/helpers/origin-sim.mjs';
import { startMockStrapi, makeEntry } from '../tests/helpers/mock-strapi.mjs';

const WEBSITE_ROOT = resolve(process.env.WEBSITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal');
const ORIGIN_PORT = 8098;
const CMS_PORT = 1399;
const CONTROL_PORT = 8097;

// Publication times at the regional midnight boundary, so the runtime's Intl time-zone data is exercised.
const RUNTIME_ENTRIES = {
  blogs: [
    { slug: 'runtime-hk-blog', title: 'Runtime HK blog', region: 'hk', publicationDate: '2026-10-26T16:00:00.000Z' }, // Oct 27 in HK
    { slug: 'runtime-ph-blog', title: 'Runtime PH blog', region: 'ph', publicationDate: '2026-10-26T15:59:59.000Z' }, // Oct 26 in PH
  ],
  'news-articles': [
    { slug: 'runtime-in-news', title: 'Runtime IN news', region: 'in', publicationDate: '2026-10-26T18:30:00.000Z' }, // Oct 27 in IN
  ],
};

const sim = createOriginSim(WEBSITE_ROOT);
const cms = await startMockStrapi({ port: CMS_PORT });
for (const [collection, entries] of Object.entries(RUNTIME_ENTRIES)) {
  for (const e of entries) {
    cms.state[collection].push(makeEntry({ slug: e.slug, title: e.title, publicationDate: e.publicationDate, regions: [{ slug: e.region, name: e.region.toUpperCase() }] }));
  }
}

const readBody = (req) => new Promise((r) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => r(Buffer.concat(chunks))); });

createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    const out = await sim.handle(new Request(`http://127.0.0.1:${ORIGIN_PORT}${req.url}`, { method: req.method, headers, body }));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await out.arrayBuffer()));
    console.log(`origin ${req.method} ${req.url} cf-ipcountry=${req.headers['cf-ipcountry'] || '-'} -> ${out.status}`);
  } catch (e) {
    res.writeHead(500); res.end('origin stub error'); console.error(e);
  }
}).listen(ORIGIN_PORT, '127.0.0.1');

createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (req.method === 'POST' && url.pathname === '/cms-fail') cms.state.fail = url.searchParams.get('on') === '1';
  else if (req.method === 'POST' && url.pathname === '/origin-status') {
    const path = url.searchParams.get('path'); const status = Number(url.searchParams.get('status'));
    if (!status) sim.overrides.delete(path);
    else sim.overrides.set(path, () => new Response(`origin override ${status}`, { status, headers: { 'X-Origin-Override': String(status) } }));
  } else { res.writeHead(404); return res.end(); }
  res.writeHead(204); res.end();
}).listen(CONTROL_PORT, '127.0.0.1');

console.log(`origin  http://127.0.0.1:${ORIGIN_PORT}  (website ${WEBSITE_ROOT}, .htaccess model)`);
console.log(`cms     http://127.0.0.1:${CMS_PORT}  (mock Strapi, entries: ${Object.values(RUNTIME_ENTRIES).flat().map((e) => `${e.slug}[${e.region}]`).join(', ')})`);
console.log(`control http://127.0.0.1:${CONTROL_PORT}`);
