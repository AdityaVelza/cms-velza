import type { StrapiApp } from '@strapi/strapi/admin';

import loginLogo from './extensions/velza-logo-login.png';
import menuLogo from './extensions/velza-mark.png';
import { en } from './extensions/translations';
// Imported as text: Strapi 5.58 writes its own index.html for production builds and does not link
// the stylesheet Vite extracts, so a plain CSS import only applies under `strapi develop`.
import velzaStyles from './extensions/velza.css?inline';

// Keep in sync with BROWSER_TITLE in ./vite.config.ts, which sets the title in the HTML document.
const BROWSER_TITLE = 'Velza Global | CMS';

// Strapi 5.58 reads the stored interface mode from this key when the admin store is created,
// which happens after `register` runs. The Profile page writes the same key when a user saves
// their own choice (light, dark or system).
const THEME_STORAGE_KEY = 'STRAPI_THEME';

// Strapi 5.58 ignores `config.tutorials`; the guided tour (with its "Deploy your application"
// and documentation steps) is controlled by this stored state, read when the admin mounts.
const GUIDED_TOUR_STORAGE_KEY = 'STRAPI_GUIDED_TOUR';

// Monochrome palettes. Status colours (success, warning, danger) keep Strapi's defaults so
// their meaning is preserved; only their dark-mode tints are made neutral.
const lightColors = {
  neutral0: '#ffffff',
  neutral100: '#f5f5f5',
  neutral150: '#e5e5e5',
  neutral200: '#949494',
  neutral300: '#a3a3a3',
  neutral400: '#8a8a8a',
  neutral500: '#666666',
  neutral600: '#525252',
  neutral700: '#404040',
  neutral800: '#262626',
  neutral900: '#171717',
  neutral1000: '#0a0a0a',
  primary100: '#e5e5e5',
  primary200: '#d4d4d4',
  primary500: '#404040',
  primary600: '#171717',
  primary700: '#000000',
  buttonPrimary500: '#404040',
  buttonPrimary600: '#171717',
  buttonNeutral0: '#ffffff',
  secondary100: '#f5f5f5',
  secondary200: '#d4d4d4',
  secondary500: '#8a8a8a',
  secondary600: '#404040',
  secondary700: '#262626',
  alternative100: '#f5f5f5',
  alternative200: '#d4d4d4',
  alternative500: '#8a8a8a',
  alternative600: '#404040',
  alternative700: '#262626',
};

const darkColors = {
  neutral0: '#0a0a0a',
  neutral100: '#030303',
  neutral150: '#171717',
  neutral200: '#666666',
  neutral300: '#666666',
  neutral400: '#8a8a8a',
  neutral500: '#a3a3a3',
  neutral600: '#b3b3b3',
  neutral700: '#e5e5e5',
  neutral800: '#f5f5f5',
  neutral900: '#ffffff',
  neutral1000: '#ffffff',
  primary100: '#262626',
  primary200: '#404040',
  primary500: '#d4d4d4',
  primary600: '#ffffff',
  primary700: '#ffffff',
  buttonPrimary500: '#d4d4d4',
  buttonPrimary600: '#f5f5f5',
  buttonNeutral0: '#0a0a0a',
  secondary100: '#171717',
  secondary200: '#404040',
  secondary500: '#a3a3a3',
  secondary600: '#d4d4d4',
  secondary700: '#e5e5e5',
  alternative100: '#171717',
  alternative200: '#404040',
  alternative500: '#a3a3a3',
  alternative600: '#d4d4d4',
  alternative700: '#e5e5e5',
  success100: '#171717',
  success200: '#404040',
  warning100: '#171717',
  warning200: '#404040',
  danger100: '#171717',
  danger200: '#404040',
};

/**
 * Default new browsers to dark mode. A stored value means the user (or a previous visit)
 * already has a preference, which is never overwritten.
 */
const applyDefaultDarkTheme = () => {
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === null) {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    }
  } catch {
    // Storage unavailable (e.g. blocked): Strapi falls back to the system theme.
  }
};

/**
 * Add the Velza stylesheet (fonts and white-label rules) to the document once.
 */
const injectStyles = () => {
  const id = 'velza-admin-styles';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = velzaStyles;
  document.head.appendChild(style);
};

/**
 * Keep the guided tour switched off. Only the `enabled` flag is changed; tour progress is kept,
 * and Strapi fills in missing tour data itself. Profile > "Reset guided tours" therefore only
 * lasts until the next page load.
 */
const disableGuidedTour = () => {
  try {
    const raw = window.localStorage.getItem(GUIDED_TOUR_STORAGE_KEY);
    const state = raw === null ? {} : JSON.parse(raw);
    if (state && typeof state === 'object' && state.enabled !== false) {
      window.localStorage.setItem(
        GUIDED_TOUR_STORAGE_KEY,
        JSON.stringify({ ...state, enabled: false })
      );
    }
  } catch {
    // Storage unavailable or unreadable: Strapi shows its default guided tour.
  }
};

/**
 * Strapi 5.58 hardcodes "Strapi Admin" in the HTML document and sets "<page> | Strapi" on
 * navigation, with no configuration option. Keep the tab title fixed by watching <head>.
 */
const enforceBrowserTitle = () => {
  const globalWindow = window as typeof window & { __velzaTitleObserver?: MutationObserver };
  if (globalWindow.__velzaTitleObserver) return;

  const apply = () => {
    if (document.title !== BROWSER_TITLE) {
      document.title = BROWSER_TITLE;
    }
  };

  apply();
  globalWindow.__velzaTitleObserver = new MutationObserver(apply);
  globalWindow.__velzaTitleObserver.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

export default {
  config: {
    auth: { logo: loginLogo },
    menu: { logo: menuLogo },
    theme: {
      light: { colors: lightColors },
      dark: { colors: darkColors },
    },
    translations: { en },
    tutorials: false,
    notifications: { releases: false },
  },
  register(_app: StrapiApp) {
    injectStyles();
    applyDefaultDarkTheme();
    disableGuidedTour();
    enforceBrowserTitle();
  },
  bootstrap(_app: StrapiApp) {},
};
