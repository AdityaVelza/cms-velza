/**
 * English admin text overrides that replace Strapi product naming with Velza Global wording.
 * Plugin keys are prefixed with the plugin id (e.g. `content-type-builder.`), as Strapi expects.
 */
export const en: Record<string, string> = {
  // Login, registration and navigation
  'Auth.form.welcome.title': 'Welcome to Velza Global',
  'Auth.form.welcome.subtitle': 'Log in to your Velza Global CMS account',
  'Auth.form.register.subtitle':
    'Credentials are only used to authenticate in Velza Global CMS. All saved data will be stored in your database.',
  'Auth.form.button.login.strapi': 'Log in via Velza Global',
  'app.components.LeftMenu.navbrand.title': 'Velza Global',
  'app.components.LeftMenu.navbrand.workplace': 'CMS',
  'app.components.LeftMenu.logo.alt': 'Velza Global logo',

  // Settings
  'Settings.application.strapi-version': 'CMS version',
  'Settings.application.strapiVersion': 'CMS version',
  'Settings.application.support.subtitle.community': 'Ask a question or report a bug.',
  'Settings.application.support.subtitle.enterprise': 'Contact support or report a bug.',
  'Settings.application.support.support-portal.description': 'Open a support ticket',
  'Settings.license.status-tooltip':
    'The license status is checked every 12 hours and on every build.',
  'Settings.permissions.users.listview.header.subtitle':
    'All the users who have access to the Velza Global CMS admin panel',

  // Home page, tours and notifications
  'HomePage.header.subtitle': 'Welcome to Velza Global CMS',
  // Drops the {here} link to the Strapi documentation.
  'Settings.profile.form.section.experience.interfaceLanguageHelp':
    'Preference changes will apply only to you.',
  'app.components.BlockLink.blog.content': 'Read the latest platform news.',
  'app.components.BlockLink.cloud': 'Cloud hosting',
  'app.components.BlockLink.cloud.content': 'Fully-managed cloud hosting for your CMS project.',
  'app.components.BlockLink.tutorial.content':
    'Follow step-by-step instructions to use and customize the CMS.',
  'app.components.FreeTrialWelcomeModal.description1':
    'For the next 30 days, you will have full access to advanced features like Content History, Releases and Single Sign-On (SSO) – everything you need to explore the power of Velza Global CMS.',
  'app.components.NpsSurvey.banner-title':
    'How likely are you to recommend Velza Global CMS to a friend or colleague?',
  'components.AutoReloadBlocker.description': 'Run the CMS with one of the following commands:',
  'global.plugins.sentry.description': 'Send CMS error events to Sentry.',
  'notification.ee.warning.over-.message':
    "Add seats to {licenseLimitStatus, select, OVER_LIMIT {invite} AT_LIMIT {re-enable}} Users. If you already did it but it's not reflected in the CMS yet, make sure to restart your app.",
  'notification.version.update.message': 'A new version of the CMS platform is available!',
  'tours.overview.subtitle': 'Follow the guided tour to get the most out of Velza Global CMS.',
  'tours.overview.strapiCloud.label': 'Deploy your application',
  'tours.contentTypeBuilder.AIChat.content':
    '<p>If you have any questions about the Content-Type Builder or the CMS ask them here.</p><p>The AI assistant can generate schemas tailored to your needs. Ask for exactly what you want, for example:<ul><li>Date picker</li><li>Email and password fields</li><li>Media of any type</li><li>UIDs</li></ul></p><p>Don’t be shy, try it out !</p>',
  'HomePage.widget.deploy-now.description': 'Deploy your application',

  // Content-Type Builder plugin
  'content-type-builder.form.attribute.rename-type-change-warning.body':
    'You are renaming {oldName} to {newName} and changing it from {oldType} to {newType}. The CMS cannot preserve the existing data of this field when both change at once. The field will be recreated empty when you save.',
  'content-type-builder.migration.confirmation.description':
    'You renamed the fields below. The CMS can generate a migration to preserve existing data by renaming the underlying database columns. Untick a rename to let those fields start empty instead.',
  'content-type-builder.notification.info.autoreaload-disable':
    'The CMS is in production mode, editing content types is disabled. Please switch to development mode by starting your server with npm run develop.',
  'content-type-builder.chat.input.defaults.strapi': 'Tell me about this CMS',
  'content-type-builder.chat.input.thinking': 'The AI assistant is thinking...',
  'content-type-builder.chat.input.placeholder': 'Ask the AI assistant...',
  'content-type-builder.chat.input.strapi-ai-can-make-errors': 'The AI assistant can make mistakes.',

  // Internationalization and Email plugins
  'i18n.Settings.list.empty.description':
    'This is not a usual behavior, meaning that you have eventually modified the database manually. Make sure to have at least one locale saved in your database in order to be able to use the CMS correctly.',
  'email.Settings.email.plugin.placeholder.defaultFrom':
    'ex: Velza Global No-Reply <no-reply@example.com>',
  'email.Settings.email.plugin.placeholder.defaultReplyTo': 'ex: Velza Global <example@example.com>',
};
