/**
 * Settings. The control panel is a Google Sheet (created by setupRegistry).
 * One row per (source doc × target language). You work entirely with full Google
 * Doc LINKS — paste a link as the source, and each target's link is written back
 * so you can click straight through to any doc from the sheet.
 *
 *   name | source_link | from | to_lang | target_link | access | last_synced | status
 *
 * Fill source_link + to_lang. Leave target_link blank → a translated doc is
 * auto-created and its link written back (stable forever — the share link never
 * changes on later runs). Put "link" in access to make that target viewable by
 * anyone with the link. Run syncAll() to translate every row.
 *
 * Apps Script shares one global scope across files, so SETTINGS is visible in Code.js.
 */
const SETTINGS = {
  registrySheetName: 'gdocs-sync registry',

  header: ['name', 'source_link', 'from', 'to_lang', 'target_link', 'access', 'last_synced', 'status'],

  // Seed row written when the sheet is first created (your existing EN→TH pair).
  seed: [
    ['main',
     'https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit',
     'en', 'th',
     'https://docs.google.com/document/d/17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A/edit',
     '', '', ''],
  ],
};
