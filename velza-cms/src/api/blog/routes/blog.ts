import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::blog.blog', {
  only: ['find', 'findOne'],
  config: {
    find: { middlewares: ['global::published-only'] },
    findOne: { middlewares: ['global::published-only'] },
  },
});
