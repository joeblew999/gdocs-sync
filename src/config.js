/**
 * Settings. The real control panel is a Google Sheet (your "CSV"), created by
 * setupRegistry(). One row per (source doc × target language):
 *
 *   name | source_id | from | to_lang | target_id | share_link | access | last_synced | status
 *
 * Fill source_id + to_lang. Leave target_id blank → a translated doc is
 * auto-created and its id is written back (stable forever, so its share link
 * never changes). Put "link" in the access column to make that target viewable
 * by anyone with the link. Run syncAll() to translate every row and fill in links.
 *
 * Apps Script shares one global scope across files, so SETTINGS is visible in Code.js.
 */
const SETTINGS = {
  registrySheetName: 'gdocs-sync registry',

  // Header row written into the sheet.
  header: ['name', 'source_id', 'from', 'to_lang', 'target_id', 'share_link', 'access', 'last_synced', 'status'],

  // Seed row written when the sheet is first created (your existing EN→TH pair).
  seed: [
    ['main', '1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM', 'en', 'th',
     '17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A', '', '', '', ''],
  ],
};
