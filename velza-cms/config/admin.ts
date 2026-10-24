import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET')!,
  },
  apiToken: {
    salt: env('API_TOKEN_SALT')!,
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT')!,
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY')!,
  },
  // Content preview is not set up for the website. Disabling it explicitly removes the
  // "Set up preview" documentation link from the entry sidebar. Replace with a preview
  // handler configuration if live preview is introduced later.
  preview: {
    enabled: false,
    // Required by the config type; never called while preview is disabled.
    config: { handler: () => null },
  },
  flags: {
    nps: env.bool('FLAG_NPS', false),
    promoteEE: env.bool('FLAG_PROMOTE_EE', false),
    // White-label: hide the "Learn more on our documentation" (?) button in page headers.
    docLinks: env.bool('FLAG_DOC_LINKS', false),
  },
});

export default config;
