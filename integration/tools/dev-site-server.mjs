// Local-only server for the website repository (PHP is not installed, so the repo's
// deployment/local-dev-server.php cannot be used). Reproduces just enough of the production routing:
//   /shared/, /routing/, /events/ and root files are served as-is;
//   everything else maps to regions/<region>/… with region = ?_r=<hk|ph|in>, else DEV_DEFAULT_REGION
//   (stands in for the visitor's country; default "hk");
//   extensionless paths resolve to .html (e.g. /blogs -> blogs.html, /blogs/x -> blogs/x.html);
//   anything else is a real 404 served with the region's own 404.html.
//
// Optional CMS settings (all localhost only, nothing is written to the website repository):
//   DEV_CMS_URL                 local Strapi origin, e.g. http://127.0.0.1:1337
//   DEV_CMS_REGION_<HK|PH|IN>   CMS region slug for each site region
//   DEV_CMS_FALLBACK=false      show empty/error messages instead of keeping static cards
//   DEV_CMS_LISTING=replace     listing mode (default merge)
//   DEV_CMS_DETAIL=true         serve CMS article pages for /blogs/<slug> and /news/<slug> without a
//                               static file, using the website's server/cms renderer (static files win)
//
//   node tools/dev-site-server.mjs            (port 8099, binds 127.0.0.1 only)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Default: the separate website repository (serves whatever branch is checked out there).
const ROOT = resolve(process.env.SITE_ROOT || 'C:/Users/ADMIN/Desktop/Velza Github/velzaglobal');
const PORT = Number(process.env.PORT || 8099);
const REGIONS = ['hk', 'ph', 'in'];
const DEFAULT_REGION = REGIONS.includes(process.env.DEV_DEFAULT_REGION) ? process.env.DEV_DEFAULT_REGION : 'hk';
const PASS_THROUGH = ['/shared/', '/routing/', '/events/'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml',
};

const cmsUrl = process.env.DEV_CMS_URL;
if (cmsUrl && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(cmsUrl)) {
  console.error('DEV_CMS_URL must be a localhost URL (no staging/production).');
  process.exit(1);
}
const regionSlugs = Object.fromEntries(REGIONS.map((r) => [r, process.env[`DEV_CMS_REGION_${r.toUpperCase()}`] || null]));
const detailPages = Boolean(cmsUrl) && process.env.DEV_CMS_DETAIL === 'true';
const configOverride = cmsUrl && `// LOCAL DEV OVERRIDE served by tools/dev-site-server.mjs — not a committed file.
export const cmsConfig = ${JSON.stringify({
  baseUrl: cmsUrl, mediaBaseUrl: undefined, timeoutMs: 8000, pageSize: 12, imageFormat: 'medium',
  placeholderImage: '/shared/images/blog-hero-banner.webp',
  fallbackToStatic: process.env.DEV_CMS_FALLBACK !== 'false',
  listingMode: process.env.DEV_CMS_LISTING === 'replace' ? 'replace' : 'merge',
  detailPages,
  regionSlugs,
}, null, 2)};
`;

const safeJoin = (...parts) => {
  const p = resolve(join(ROOT, ...parts));
  return p === ROOT || p.startsWith(ROOT + sep) ? p : null; // block path traversal
};

const tryFile = async (p) => {
  if (!p) return null;
  try { return (await stat(p)).isFile() ? p : null; } catch { return null; }
};

let renderer = null; // lazily imported from the website repository
const renderCmsArticle = async (type, slug, region) => {
  renderer ||= await import(pathToFileURL(join(ROOT, 'server', 'cms', 'render-article.mjs')).href);
  const template = await readFile(join(ROOT, 'server', 'cms', 'templates', region, `${type}.html`), 'utf8');
  return renderer.renderArticle({
    type, slug, region, template,
    config: { baseUrl: cmsUrl, regionSlugs, siteOrigin: `http://127.0.0.1:${PORT}` },
  });
};

const sendErrorPage = async (res, region, status, extraHeaders = {}) => {
  const page = await tryFile(safeJoin('regions', region, `${status}.html`));
  res.writeHead(status, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(page ? await readFile(page) : `${status}`);
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const path = decodeURIComponent(url.pathname);
  if (configOverride && path === '/shared/js/velza-cms/cms-config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end(configOverride);
  }
  const r = url.searchParams.get('_r');
  const region = REGIONS.includes(r) ? r : DEFAULT_REGION;
  let file = null;
  if (PASS_THROUGH.some((p) => path.startsWith(p)) || /^\/[^/]+\.[a-z0-9]+$/i.test(path) && await tryFile(safeJoin(path))) {
    file = await tryFile(safeJoin(path));
  } else {
    const rel = path === '/' ? '/index.html' : path.replace(/\/+$/, '');
    file = (await tryFile(safeJoin('regions', region, rel))) || (await tryFile(safeJoin('regions', region, `${rel}.html`)));
    // Static files win. Only then may a CMS article page answer /blogs/<slug> or /news/<slug>.
    const m = !file && detailPages && /^\/(blogs|news)\/([^/]+)$/.exec(rel);
    if (m) {
      try {
        const out = await renderCmsArticle(m[1], m[2], region);
        if (out.status === 200) {
          res.writeHead(200, { ...out.headers, 'X-Velza-Region': region, 'X-Velza-Source': 'cms' });
          return res.end(out.body);
        }
        console.log(`cms ${m[1]}/${m[2]} (${region}) -> ${out.status} ${out.reason || ''}`);
        return sendErrorPage(res, region, out.status === 503 ? 503 : out.status === 500 ? 500 : 404, out.status === 503 ? { 'Retry-After': '60' } : {});
      } catch (e) {
        console.error('cms render failed:', e.message);
        return sendErrorPage(res, region, 500);
      }
    }
  }
  if (!file) return sendErrorPage(res, region, 404);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(await readFile(file));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`dev site: http://127.0.0.1:${PORT}/  (root ${ROOT}, default region ${DEFAULT_REGION})${cmsUrl ? `  CMS override -> ${cmsUrl}${detailPages ? ' (+ detail pages)' : ''}` : '  CMS disabled (committed config)'}`);
});
