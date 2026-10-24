import type { Core } from '@strapi/strapi';

/**
 * Query parameters that select draft versions through the Content API in Strapi 5.58
 * (declared for draft & publish types in @strapi/core core-api route validation).
 */
const DRAFT_QUERY_PARAMS = ['status', 'publicationFilter', 'hasPublishedVersion'] as const;

/**
 * Forces published-only reads for every Content API caller - public, authenticated end users
 * and API tokens alike. There is deliberately no bypass (no preview mode in this phase).
 *
 * Strapi runs route middlewares after authentication/authorization and before the controller
 * validates and sanitizes the query. `ctx.query` is the parsed query object Strapi caches for
 * the request's query string, so the controller receives exactly the values set here.
 *
 * Admin editing is unaffected: the Content Manager uses its own admin routes, not these.
 */
const publishedOnly: Core.MiddlewareFactory = () => {
  return async (ctx, next) => {
    const query = ctx.query as Record<string, unknown>;

    for (const param of DRAFT_QUERY_PARAMS) {
      if (Object.prototype.hasOwnProperty.call(query, param)) {
        delete query[param];
      }
    }

    query.status = 'published';

    await next();
  };
};

export default publishedOnly;
