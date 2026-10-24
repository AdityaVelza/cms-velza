/**
 * Velza CMS - Content API hardening for the Upload (Media Library) plugin.
 *
 * The file content type has a polymorphic `related` relation pointing at every entry that uses
 * a file - including draft rows of draft & publish types. Marking it `private` removes it from
 * Content API responses, populate, filters and sort, so it cannot be used to read draft entries.
 * It changes no database column and no media record.
 */
type UploadPlugin = {
  contentTypes: {
    file: { schema: { attributes: { related?: Record<string, unknown> } } };
  };
};

export default <T extends UploadPlugin>(plugin: T): T => {
  const related = plugin.contentTypes.file.schema.attributes.related;

  if (!related) {
    // Fail closed: refuse to start rather than run without the guard if Strapi changes the schema.
    throw new Error('[velza] Upload plugin file.related attribute not found; draft-exposure guard not applied.');
  }

  related.private = true;
  return plugin;
};
