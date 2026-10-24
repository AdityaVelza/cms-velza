import { mergeConfig, type Plugin, type UserConfig } from 'vite';

// Keep in sync with BROWSER_TITLE in ./app.tsx, which keeps the title fixed after the app loads.
const BROWSER_TITLE = 'Velza Global | CMS';

const replaceTitle = (html: string) =>
  html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${BROWSER_TITLE}</title>`);

/**
 * Strapi 5.58 generates the admin index.html with a hardcoded "Strapi Admin" title, which shows
 * on every full page load before the app starts. Rewrite it in the served and built HTML.
 */
const velzaDocumentTitle = (): Plugin => ({
  name: 'velza-admin-document-title',
  enforce: 'post',
  // Development server: Strapi passes its template through vite.transformIndexHtml.
  transformIndexHtml: replaceTitle,
  // Production build: Strapi emits index.html as an asset during generateBundle.
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'asset' && file.fileName === 'index.html' && typeof file.source === 'string') {
        file.source = replaceTitle(file.source);
      }
    }
  },
});

export default (config: UserConfig) => {
  // Important: always return the modified config
  return mergeConfig(config, {
    plugins: [velzaDocumentTitle()],
  });
};
