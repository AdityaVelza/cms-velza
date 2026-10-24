// Example configuration for the Velza CMS client. Copy to cms-config.js and fill in VERIFIED values only.
// Every value below is a placeholder: no production domain, URL or token has been confirmed.
// Never put an API token in code that is served to browsers.

export const cmsConfig = {
  // CMS origin. Local development example only; replace per environment once confirmed.
  baseUrl: 'http://127.0.0.1:1337', // PLACEHOLDER (local). Staging: <STAGING_CMS_URL>. Production: <PRODUCTION_CMS_URL>
  // Origin for relative /uploads media URLs (defaults to baseUrl). Set separately only if media is served elsewhere.
  mediaBaseUrl: undefined, // PLACEHOLDER: <MEDIA_BASE_URL> if different
  timeoutMs: 10000,
};

// Region slugs as stored in the CMS. The Region schema describes intended slugs "hk, ph, in",
// but region records and codes are unverified and pending decision F6a.
export const regionSlugs = {
  hongKong: '<HK_REGION_SLUG>',
  philippines: '<PH_REGION_SLUG>',
  india: '<IN_REGION_SLUG>',
};
