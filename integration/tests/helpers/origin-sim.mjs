// Stand-in for the cPanel origin (Apache + the website's .htaccess files), for Worker tests in Node.
// It models the .htaccess behaviour a /blogs/* or /news/* Worker can meet: the /regions/ guard (section 2),
// legacy blog/news redirects (5), .html stripping (6), trailing-slash redirects (7), shared paths and
// root files (8), region selection (9), error documents (10) and the security/caching headers (12, 14).
// The region rules of section 9 are parsed from the real root .htaccess, so a change there that the
// Worker does not mirror fails the tests. This is a model, not Apache: it proves the contract, not
// Apache or LiteSpeed behaviour.
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

/** Section 9 of the root .htaccess as ordered [{ kind: 'query'|'country'|'fallback', re, region }]. */
export const parseRegionRules = (htaccess) => {
  const rules = [];
  const lines = htaccess.split(/\r?\n/);
  let cond = null;
  for (const line of lines) {
    const c = /^RewriteCond\s+%\{(QUERY_STRING|HTTP:CF-IPCountry)\}\s+(\S+)\s+\[NC\]\s*$/.exec(line.trim());
    if (c) { cond = { kind: c[1] === 'QUERY_STRING' ? 'query' : 'country', re: new RegExp(c[2], 'i') }; continue; }
    const r = /^RewriteRule\s+\^\(\.\*\)\$\s+\/regions\/(hk|in|ph)\/\$1\s+\[L\]\s*$/.exec(line.trim());
    if (r) { rules.push(cond ? { ...cond, region: r[1] } : { kind: 'fallback', region: r[1] }); cond = null; continue; }
    if (line.trim().startsWith('Rewrite')) cond = null;
  }
  return rules;
};

export const createOriginSim = (websiteRoot) => {
  const root = resolve(websiteRoot);
  const rules = parseRegionRules(readFileSync(join(root, '.htaccess'), 'utf8'));
  if (!rules.some((r) => r.kind === 'fallback')) throw new Error('origin-sim: no fallback region rule found in .htaccess');
  const overrides = new Map(); // pathname -> () => Response, to simulate origin 403/5xx
  const requests = [];

  const regionOf = (query, country) => {
    for (const rule of rules) {
      if (rule.kind === 'query' && rule.re.test(query)) return rule.region;
      if (rule.kind === 'country' && rule.re.test(country)) return rule.region;
      if (rule.kind === 'fallback') return rule.region;
    }
    return null;
  };

  const policyHeaders = (headers, type) => {
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    headers.set('Strict-Transport-Security', 'max-age=31536000');
    if (type) headers.set('Content-Type', type);
    if (type && type.startsWith('text/html')) headers.set('Cache-Control', 'private, no-cache, must-revalidate');
    return headers;
  };
  const html = async (file, status) => new Response(await readFile(file), { status, headers: policyHeaders(new Headers(), 'text/html; charset=utf-8') });
  const redirect = (location) => new Response(null, { status: 301, headers: policyHeaders(new Headers({ Location: location })) });
  const errorDoc = (region, status) => html(join(root, 'regions', region, `${status}.html`), status);

  const handle = async (request) => {
    const url = new URL(request.url);
    const query = url.search.slice(1);
    const country = request.headers.get('CF-IPCountry') || '';
    const region = regionOf(query, country);
    const path = decodeURIComponent(url.pathname);
    requests.push({ path: url.pathname, query, country, method: request.method });

    if (overrides.has(url.pathname)) return overrides.get(url.pathname)();
    // 1. hidden files; 2. internal region folders
    if (/(^|\/)\.(?!well-known(?:\/|$))/.test(path.slice(1))) return errorDoc(region, 403);
    if (/^\/+regions\//i.test(path)) return errorDoc(region, 404);
    // 5. blog/news posts that moved from the root
    const legacy = /^\/(global-brand-partnership|from-market-opportunity-to-global-expansion|premium-fmcg-product-experience|international-beverage-brands-growing-appeal)(?:\.html?)?$/i.exec(path);
    if (legacy) return redirect(`/blogs/${legacy[1]}${url.search}`);
    // 6. strip .html when the page exists (regions/hk is the oracle)
    const dotHtml = /^\/(.+?)\.html?$/i.exec(path);
    if (dotHtml && await isFile(join(root, 'regions', 'hk', `${dotHtml[1]}.html`))) return redirect(`/${dotHtml[1]}${url.search}`);
    // 7. trailing slash
    if (path.length > 1 && path.endsWith('/')) return redirect(`${path.slice(0, -1)}${url.search}`);
    // 8. shared paths and root files are never region-rewritten
    if (/^\/(shared|routing|events|server)\//.test(path) || (path !== '/' && await isFile(join(root, path)))) {
      const file = resolve(root, `.${path}`);
      if (file.startsWith(root + sep) && await isFile(file)) return new Response(await readFile(file), { status: 200, headers: policyHeaders(new Headers()) });
      return errorDoc(region, 404);
    }
    // 9 + regions/<code>/.htaccess: file, or file.html, inside the selected region
    const base = resolve(root, 'regions', region, `.${path === '/' ? '/index' : path}`);
    if (!base.startsWith(join(root, 'regions', region) + sep)) return errorDoc(region, 404);
    for (const p of [base, `${base}.html`]) if (await isFile(p)) return html(p, 200);
    return errorDoc(region, 404);
  };

  return { handle, regionOf, rules, overrides, requests };
};
