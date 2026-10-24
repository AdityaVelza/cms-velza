import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::newsletter-issue.newsletter-issue', {
  only: ['find', 'findOne'],
  config: {
    find: { middlewares: ['global::published-only'] },
    findOne: { middlewares: ['global::published-only'] },
  },
});
