// Strapi configuration (velza-cms/config/server.ts and middlewares.ts), checked against the installed
// Strapi 5.58 code: the TypeScript config is transpiled with the CMS's own TypeScript, evaluated with
// Strapi's env helper, and fed to Strapi's real CORS middleware, URL resolution and Koa app factory.
// No Strapi instance or database is started; servers bind 127.0.0.1 only. No .env value is printed.
// Skipped when the CMS dependencies are not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CMS_ROOT = resolve(process.env.CMS_ROOT || fileURLToPath(new URL('../../velza-cms', import.meta.url)));
const cmsRequire = createRequire(join(CMS_ROOT, 'package.json'));
const core = (p) => cmsRequire(join(CMS_ROOT, 'node_modules', '@strapi', 'core', 'dist', p));

let deps = null;
try {
  deps = {
    ts: cmsRequire('typescript'),
    Koa: cmsRequire('koa'),
    env: cmsRequire('@strapi/utils').env,
    cors: core('middlewares/cors.js').cors,
    urls: core('configuration/urls.js'),
    createKoaApp: core('services/server/koa.js'),
  };
} catch {
  deps = null;
}
const skip = deps ? false : 'velza-cms dependencies are not installed';

const VARS = ['NODE_ENV', 'HOST', 'PORT', 'APP_KEYS', 'CORS_ORIGINS', 'PUBLIC_URL', 'IS_PROXIED', 'PROXY_MAX_IPS_COUNT'];
const BASE = { APP_KEYS: 'test-key-1,test-key-2', PORT: '1338' };

/** Evaluates a config/*.ts file with exactly `vars` as the relevant environment, then restores it. */
const loadConfig = (name, vars) => {
  const source = readFileSync(join(CMS_ROOT, 'config', `${name}.ts`), 'utf8');
  const { outputText } = deps.ts.transpileModule(source, { compilerOptions: { module: deps.ts.ModuleKind.CommonJS, target: deps.ts.ScriptTarget.ES2019, esModuleInterop: true } });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(cmsRequire, mod, mod.exports);
  const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  try {
    for (const k of VARS) delete process.env[k];
    Object.assign(process.env, vars);
    return mod.exports.default({ env: deps.env });
  } finally {
    for (const k of VARS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
};

const corsConfig = (vars) => loadConfig('middlewares', { ...BASE, ...vars }).find((m) => typeof m === 'object' && m.name === 'strapi::cors').config;

/** Starts a Koa app on 127.0.0.1 with the given middleware; returns { url, close }. */
const serve = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return { port: server.address().port, close: () => new Promise((r) => server.close(r)) };
};
const send = (port, { method = 'GET', path = '/api/blogs', headers = {} } = {}) => new Promise((resolveRes, reject) => {
  const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolveRes({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
  req.end();
});
const withCorsApp = async (vars, fn) => {
  const app = new deps.Koa();
  app.use(deps.cors(corsConfig(vars)));
  app.use((ctx) => { ctx.body = { data: [] }; });
  const srv = await serve(app);
  try { await fn(srv.port); } finally { await srv.close(); }
};

// --- server.ts --------------------------------------------------------------------------------

test('server: local development keeps Strapi defaults (no public URL, no proxy trust, http://localhost:<PORT>)', { skip }, () => {
  const server = loadConfig('server', BASE);
  assert.equal(server.url, undefined);
  assert.equal(server.proxy.koa, false);
  assert.equal(server.port, 1338);
  assert.equal(deps.urls.getAbsoluteServerUrl({ server, admin: {}, environment: 'development' }), 'http://localhost:1338');
  assert.equal(deps.urls.getAbsoluteAdminUrl({ server, admin: {}, environment: 'development' }), 'http://localhost:1338/admin');
});

test('server and middlewares: the local .env (non-secret keys only) produces a valid configuration', { skip: skip || (!existsSync(join(CMS_ROOT, '.env')) && 'no local .env') }, () => {
  const keys = ['HOST', 'PORT', 'CORS_ORIGINS', 'PUBLIC_URL', 'IS_PROXIED', 'PROXY_MAX_IPS_COUNT'];
  const vars = { APP_KEYS: BASE.APP_KEYS };
  for (const line of readFileSync(join(CMS_ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && keys.includes(m[1])) vars[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  const server = loadConfig('server', vars);
  assert.equal(server.proxy.koa, false, 'local .env does not trust proxy headers');
  assert.doesNotThrow(() => corsConfig(vars));
  assert.ok(corsConfig(vars).origin.every((o) => /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o)), 'local .env allows local origins only');
});

test('server: behind a reverse proxy the public https URL is used and forwarded headers are trusted', { skip }, async () => {
  const server = loadConfig('server', { ...BASE, NODE_ENV: 'production', HOST: '127.0.0.1', IS_PROXIED: 'true', PUBLIC_URL: 'https://cms.example.test/' });
  assert.equal(server.url, 'https://cms.example.test');
  assert.equal(server.proxy.koa, true);
  assert.equal(server.proxy.maxIpsCount, 1);
  const urlConfig = { server, admin: {}, environment: 'production' };
  assert.equal(deps.urls.getAbsoluteServerUrl(urlConfig), 'https://cms.example.test');
  assert.equal(deps.urls.getAbsoluteAdminUrl(urlConfig), 'https://cms.example.test/admin');

  // Strapi's own Koa factory, given the values Strapi reads (server.proxy.koa / maxIpsCount).
  for (const [proxied, expectSecure, expectIp] of [[true, true, '203.0.113.9'], [false, false, '127.0.0.1']]) {
    const cfg = loadConfig('server', { ...BASE, IS_PROXIED: String(proxied), PUBLIC_URL: 'https://cms.example.test' });
    const app = deps.createKoaApp({ proxy: cfg.proxy.koa, maxIpsCount: cfg.proxy.maxIpsCount, keys: cfg.app.keys });
    app.use((ctx) => { ctx.body = { secure: ctx.secure, ip: ctx.ip.replace(/^::ffff:/, ''), host: ctx.host }; });
    const srv = await serve(app);
    try {
      const res = await send(srv.port, { path: '/', headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '198.51.100.1, 203.0.113.9', 'X-Forwarded-Host': 'cms.example.test' } });
      const seen = JSON.parse(res.body);
      assert.equal(seen.secure, expectSecure, `proxied=${proxied}: ctx.secure`);
      assert.equal(seen.ip, expectIp, `proxied=${proxied}: client IP is the proxy-appended entry, never a client-supplied one`);
    } finally { await srv.close(); }
  }
});

test('server: invalid public URL / proxy combinations stop startup', { skip }, () => {
  for (const vars of [
    { IS_PROXIED: 'true' },
    { IS_PROXIED: 'true', PUBLIC_URL: 'http://cms.example.test' },
    { PUBLIC_URL: 'cms.example.test' },
    { PUBLIC_URL: 'https://cms.example.test/?x=1' },
    { PUBLIC_URL: 'https://user:pass@cms.example.test' },
    { PUBLIC_URL: 'ftp://cms.example.test' },
  ]) {
    assert.throws(() => loadConfig('server', { ...BASE, ...vars }), /PUBLIC_URL/, JSON.stringify(vars));
  }
});

// --- middlewares.ts ---------------------------------------------------------------------------

test('middlewares: no X-Powered-By middleware; CORS is read-only, credential-free and never a wildcard', { skip }, () => {
  const list = loadConfig('middlewares', { ...BASE, CORS_ORIGINS: 'https://www.example.test' });
  assert.ok(!list.includes('strapi::poweredBy'));
  for (const required of ['strapi::errors', 'strapi::security', 'strapi::query', 'strapi::body', 'strapi::session', 'strapi::public']) {
    assert.ok(list.includes(required), required);
  }
  const cors = corsConfig({ CORS_ORIGINS: ' https://www.example.test , https://www.example.test,https://staging.example.test ' });
  assert.deepEqual(cors.origin, ['https://www.example.test', 'https://staging.example.test']);
  assert.equal(cors.credentials, false);
  assert.deepEqual(cors.methods, ['GET', 'HEAD', 'OPTIONS']);
  assert.ok(!cors.headers.includes('Authorization'));
  assert.ok(!cors.headers.includes('Content-Type'), 'no cross-origin JSON bodies');
  assert.deepEqual(corsConfig({}).origin, [], 'unset: no cross-origin access');
});

test('middlewares: wildcard, malformed and (in production) non-https origins stop startup', { skip }, () => {
  for (const value of ['*', 'https://*.example.test', 'https://www.example.test/', 'https://www.example.test/blogs', 'www.example.test',
    'ftp://www.example.test', 'https://WWW.example.test', 'https://www.example.test:443', 'null']) {
    assert.throws(() => corsConfig({ CORS_ORIGINS: value }), /CORS_ORIGINS/, value);
  }
  assert.throws(() => corsConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'http://www.example.test' }), /https/);
  assert.doesNotThrow(() => corsConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://www.example.test' }));
  assert.doesNotThrow(() => corsConfig({ NODE_ENV: 'development', CORS_ORIGINS: 'http://127.0.0.1:8099' }));
});

test('CORS (Strapi middleware): listed origins are allowed, others and look-alikes get no CORS headers', { skip }, async () => {
  await withCorsApp({ CORS_ORIGINS: 'https://www.example.test,http://127.0.0.1:8099' }, async (port) => {
    for (const origin of ['https://www.example.test', 'http://127.0.0.1:8099']) {
      const res = await send(port, { headers: { Origin: origin } });
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], origin);
      assert.equal(res.headers['access-control-allow-credentials'], undefined, 'never with credentials');
      assert.match(res.headers.vary || '', /Origin/);
    }
    for (const origin of ['https://evil.example', 'https://www.example.test.evil.example', 'http://www.example.test', 'https://example.test', 'null']) {
      const res = await send(port, { headers: { Origin: origin } });
      assert.equal(res.headers['access-control-allow-origin'], undefined, origin);
      assert.equal(res.headers['access-control-allow-credentials'], undefined, origin);
    }
  });
});

test('CORS (Strapi middleware): no Origin header gets "*" without credentials (Strapi behaviour, not a browser cross-origin read)', { skip }, async () => {
  await withCorsApp({ CORS_ORIGINS: 'https://www.example.test' }, async (port) => {
    const res = await send(port);
    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
  });
});

test('CORS (Strapi middleware): preflight allows listed origins for reads only; others get no CORS headers', { skip }, async () => {
  await withCorsApp({ CORS_ORIGINS: 'https://www.example.test' }, async (port) => {
    const ok = await send(port, { method: 'OPTIONS', headers: { Origin: 'https://www.example.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'accept' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers['access-control-allow-origin'], 'https://www.example.test');
    assert.equal(ok.headers['access-control-allow-methods'], 'GET,HEAD,OPTIONS');
    assert.equal(ok.headers['access-control-allow-headers'], 'Accept,Origin');
    assert.equal(ok.headers['access-control-max-age'], '3600');
    assert.equal(ok.headers['access-control-allow-credentials'], undefined);

    const write = await send(port, { method: 'OPTIONS', headers: { Origin: 'https://www.example.test', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization' } });
    assert.doesNotMatch(write.headers['access-control-allow-methods'] || '', /DELETE|POST|PUT|PATCH/);
    assert.doesNotMatch(write.headers['access-control-allow-headers'] || '', /authorization/i);

    // POST is a CORS-safelisted method, so only the header list can stop a cross-origin JSON write.
    const jsonPost = await send(port, { method: 'OPTIONS', headers: { Origin: 'https://www.example.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.doesNotMatch(jsonPost.headers['access-control-allow-headers'] || '', /content-type/i);

    const evil = await send(port, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(evil.headers['access-control-allow-origin'], undefined);
    assert.equal(evil.headers['access-control-allow-methods'], undefined);
  });
});

test('CORS (Strapi middleware): with CORS_ORIGINS unset every browser origin is refused', { skip }, async () => {
  await withCorsApp({}, async (port) => {
    for (const origin of ['https://www.example.test', 'http://127.0.0.1:8099']) {
      const res = await send(port, { headers: { Origin: origin } });
      assert.equal(res.headers['access-control-allow-origin'], undefined, origin);
    }
  });
});
