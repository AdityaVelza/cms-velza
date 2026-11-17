import type { Core } from '@strapi/strapi';

type Env = Core.Config.Shared.ConfigParams['env'];

/**
 * Website origins allowed to read the Content API from a browser, from CORS_ORIGINS: a comma-separated
 * list of exact origins (scheme, host, optional port), e.g. "https://www.example.com". Each environment
 * sets its own list in its own environment (local .env, staging, production); nothing is shared or
 * defaulted. Unset or empty means no cross-origin browser access. "*", paths, trailing slashes and other
 * malformed entries stop startup rather than silently widening or breaking access. With NODE_ENV=production
 * every origin must use https.
 * Only variable names and the offending entry are reported, never other configuration values.
 */
const corsOrigins = (env: Env): string[] => {
  const production = env('NODE_ENV') === 'production';
  const origins = (env('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let url: URL | null = null;
    try {
      url = new URL(origin);
    } catch {
      url = null;
    }

    if (!url || origin.includes('*') || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(
        `CORS_ORIGINS entry "${origin}" is not an exact origin. Use scheme, host and optional port only, ` +
          'e.g. https://www.example.com (no "*", path or trailing slash).'
      );
    }

    if (production && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS entry "${origin}" must use https when NODE_ENV=production.`);
    }
  }

  return [...new Set(origins)];
};

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      // Exact-match allow-list; any other origin gets no CORS headers, so browsers block the response.
      origin: corsOrigins(env),
      // The website only reads published content and sends no cookies or tokens. The admin panel is
      // served from the CMS's own origin and does not depend on CORS.
      credentials: false,
      methods: ['GET', 'HEAD', 'OPTIONS'],
      // No Content-Type: browsers treat POST as a safelisted method, so allowing Content-Type would let a
      // cross-origin JSON POST pass the preflight (Strapi still refuses it; this stops it in the browser).
      headers: ['Accept', 'Origin'],
      maxAge: 3600,
    },
  },
  // strapi::poweredBy is omitted on purpose: no X-Powered-By header.
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
