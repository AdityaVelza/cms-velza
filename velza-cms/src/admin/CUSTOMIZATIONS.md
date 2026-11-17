# Velza Global CMS — admin panel customizations

White-labeling of the Strapi 5.58.0 admin panel. Nothing in `node_modules` is modified; no
content types, permissions, plugins or database records are changed by these customizations.
Re-check this list after every Strapi upgrade (`npm run build`, then the checks below).

| Element | Change | Method | File |
|---|---|---|---|
| Menu and login logos | Velza Global logos | Official: `config.menu.logo`, `config.auth.logo` | `app.tsx`, `extensions/*.png` |
| Favicon | Velza "V" | Official: `strapi::favicon` middleware serves `favicon.png` (project root) at `/favicon.ico` | `favicon.png` |
| Browser tab title | "Velza Global \| CMS" | Workaround: Vite plugin rewrites the HTML title; observer keeps it fixed (Strapi hardcodes it) | `vite.config.ts`, `app.tsx` |
| Colours and font | Monochrome theme, Poppins | Official: `config.theme`; CSS for the font family | `app.tsx`, `extensions/velza.css` |
| Stylesheet loading | `velza.css` imported with `?inline` and added as a `<style>` element | Workaround: Strapi's generated `index.html` does not link Vite's extracted CSS in production builds | `app.tsx` |
| Strapi wording | Replaced with Velza Global wording | Official: `config.translations` | `extensions/translations.ts` |
| Home subtitle | "Welcome to Velza Global CMS" | Official: translation `HomePage.header.subtitle` | `extensions/translations.ts` |
| Profile language help | Link to Strapi docs removed | Official: translation without `{here}` | `extensions/translations.ts` |
| Page header "?" documentation button | Hidden everywhere | Official: `flags.docLinks: false` (env `FLAG_DOC_LINKS`) | `config/admin.ts` |
| Entry sidebar "Set up preview" documentation link | Removed | Official: `preview.enabled: false` (preview is not set up for the website) | `config/admin.ts` |
| Content Manager sidebar order | "Website Content" folder with Blog, News Article, Region (in that order) above the other collection types | Official: Content-Type Builder folders (`groups.json`; also editable in the builder's folder UI) | `src/content-structure/groups.json` |
| Newsletter Issue in the Content Manager | Hidden until newsletters are introduced; the type, its table, data, API routes and permissions are unchanged. Re-enable by removing the option | Official: `pluginOptions['content-manager'].visible: false` | `src/api/newsletter-issue/content-types/newsletter-issue/schema.json` |
| NPS survey, Enterprise promotions | Off | Official: `flags.nps`, `flags.promoteEE` | `config/admin.ts` |
| Release notifications | Off | Official: `config.notifications.releases: false` | `app.tsx` |
| Strapi Cloud nav link, page, home widget | Removed | Official: `'strapi-cloud': { enabled: false }` | `config/plugins.ts` |
| Guided tour (home panel, tooltips) | Off | Workaround: sets `enabled: false` in Strapi's `STRAPI_GUIDED_TOUR` browser storage (`config.tutorials` is ignored in 5.58) | `app.tsx` |
| Marketplace nav link | Hidden | Workaround: CSS on `href="https://market.strapi.io"` (hardcoded link; Super Admin always has the permission) | `extensions/velza.css` |
| Settings > Overview: Plan card | Hidden | Workaround: CSS `:has()` on the Strapi pricing/billing link | `extensions/velza.css` |
| Settings > Overview: Support card and Generate snapshot | Hidden | Workaround: CSS `:has()` on the `https://docs.strapi.io` tile | `extensions/velza.css` |
| Media Library "new Media Library" banner | Hidden | Workaround: CSS `:has()` on its Strapi blog link | `extensions/velza.css` |

Retained on purpose: Settings > Overview "Details" (version) and "Customization" (logo upload),
Settings > Plugins (installed plugin list), all content, media, builder, user, role and token pages.
Note that a logo uploaded in Settings > Overview > Customization overrides the logos in `app.tsx`.

## Upgrade risks

- CSS rules depend on Strapi's markup depth and its own URLs. If the markup changes, the element
  reappears (fail-safe); nothing else is hidden because every rule is anchored on a Strapi URL.
- The Plan and Support cards can show their titles for a moment while Strapi checks the licence.
- The guided-tour workaround depends on Strapi's storage key and state shape. Profile >
  "Reset guided tours" only lasts until the next page load.
- The title workaround depends on Strapi's generated `index.html`.

## Check after an upgrade

Main navigation (no Marketplace), any list page header (no "?" button), Settings > Overview
(Details and Customization only), Home (no guided tour), Media Library (no banner), Profile.
