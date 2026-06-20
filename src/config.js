/**
 * Settings. The control panel is a Google Sheet (created by setupRegistry).
 * One row per OUTPUT DOC. Builder docs are immutable + version-stamped:
 *
 *   builder | email | source_link | from | to_lang | version | mode | target_link | access | updated | status
 *
 * Versioning (the quotation history):
 *   - The master has a version number (starts at 1). When you change the master
 *     after builder feedback, run gdoc:bump → version becomes 2, 3, …
 *   - gdoc:add / gdoc:revise stamp the doc with the CURRENT master version.
 *   - gdoc:revise "<Builder>" makes a NEW version doc from the updated master,
 *     marks the builder's previous row 'superseded' (KEPT, never edited), and
 *     adds a new 'open' row. So every quote a builder made — spec + their price —
 *     stays frozen and visible in the registry.
 *
 * mode: sync = re-translated each run (the published shared copy);
 *       once = created then NEVER overwritten (builder copies — protects quotes).
 *
 * How builders edit: builders here use LINE (no Google email), so new builder
 * docs default to access=edit (anyone-with-link can edit). Or put their email in
 * the email column to add them as a named editor instead.
 *
 * Apps Script shares one global scope across files, so SETTINGS is visible in Code.js.
 */
const SETTINGS = {
  registrySheetName: 'gdocs-sync registry',

  // Default source (the master spec) used when gdoc:add doesn't specify one.
  master: 'https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit',

  // EDITOR on every created target doc (e.g. an internal reviewer).
  editors: ['phimphi.b123@gmail.com'],
  // VIEWER (read-only) on the registry SHEET itself.
  registryViewers: ['phimphi.b123@gmail.com'],
  // Default link access for new builder docs (LINE builders, no Google account).
  builderAccess: 'edit',

  header: ['builder', 'email', 'source_link', 'from', 'to_lang', 'version', 'mode', 'target_link', 'access', 'updated', 'status'],

  // Seed: the published EN→TH shared translation (always-current, not versioned).
  seed: [
    ['published', '',
     'https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit',
     'en', 'th', 'live', 'sync',
     'https://docs.google.com/document/d/17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A/edit',
     '', '', ''],
  ],
};
