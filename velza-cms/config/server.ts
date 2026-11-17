import type { Core } from '@strapi/strapi';

type Env = Core.Config.Shared.ConfigParams['env'];

/**
 * Public URL of the CMS (PUBLIC_URL), e.g. https://cms.example.com. Strapi uses it for absolute URLs
 * (admin panel, media, emails). Unset keeps Strapi's local default (http://localhost:<PORT>).
 * Behind a reverse proxy (IS_PROXIED=true) it is required and must be https.
 */
const publicUrl = (env: Env, proxied: boolean): string | undefined => {
  const value = env('PUBLIC_URL')?.trim();

  if (!value) {
    if (proxied) {
      throw new Error('PUBLIC_URL is required when IS_PROXIED=true (e.g. https://cms.example.com).');
    }
    return undefined;
  }

  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }

  if (!url || !['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error('PUBLIC_URL must be an absolute http(s) URL without query, fragment or credentials.');
  }

  if (proxied && url.protocol !== 'https:') {
    throw new Error('PUBLIC_URL must use https when IS_PROXIED=true.');
  }

  return value.replace(/\/+$/, '');
};

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => {
  // true only when Strapi is reachable solely through a trusted reverse proxy that overwrites
  // X-Forwarded-For / X-Forwarded-Proto / X-Forwarded-Host. Koa then trusts those headers for
  // ctx.secure (Secure admin cookies) and the client IP (login rate limiting).
  const proxied = env.bool('IS_PROXIED', false);
  const url = publicUrl(env, proxied);

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    ...(url ? { url } : {}),
    proxy: {
      koa: proxied,
      // Client IP = the last X-Forwarded-For entry, i.e. the address the proxy itself saw/appended.
      maxIpsCount: env.int('PROXY_MAX_IPS_COUNT', 1),
    },
    app: {
      keys: env.array('APP_KEYS')!,
    },
    webhooks: {
      populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
  };
};

export default config;
