/**
 * Settings. The control panel is a Google Sheet (created by setupRegistry).
 * One row per output doc. Two kinds of row, set by the `mode` column:
 *
 *   mode = sync  → target is re-translated from the source on every run
 *                  (use for a published shared translation)
 *   mode = once  → target is created once, then NEVER overwritten
 *                  (use for a builder's own copy — they write quotes into it)
 *
 * Columns:
 *   builder | email | source_link | from | to_lang | mode | target_link | access | last_synced | status
 *
 * Fill builder + source_link + to_lang (+ mode). Leave target_link blank → a doc
 * is created (copy of the source, translated) and its link written back, stable
 * forever. Put "link" in access to make it viewable by anyone with the link.
 *
 * Add a builder fast with: mise run gdoc:add "<Builder Name>" --lang th --email a@b.com
 *
 * Apps Script shares one global scope across files, so SETTINGS is visible in Code.js.
 */
const SETTINGS = {
  registrySheetName: 'gdocs-sync registry',

  // Default source (the master spec) used when gdoc:add doesn't specify one.
  master: 'https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit',

  header: ['builder', 'email', 'source_link', 'from', 'to_lang', 'mode', 'target_link', 'access', 'last_synced', 'status'],

  // Seed: the existing published EN→TH shared translation.
  seed: [
    ['published', '',
     'https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit',
     'en', 'th', 'sync',
     'https://docs.google.com/document/d/17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A/edit',
     '', '', ''],
  ],
};
