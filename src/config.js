/**
 * Sync jobs — one entry per doc pair. THIS is the reusable bit:
 * add a pair below, run `mise run gdoc:push`, and the same standalone script
 * now syncs it too. No code changes, no new project.
 *
 * Apps Script shares one global scope across files, so `JOBS` is visible in Code.js.
 *
 * Fields:
 *   name : label for logs
 *   src  : source doc id          to  : target doc id
 *   from : source language code   to_lang : target language code  (ISO, e.g. 'en','th')
 */
const JOBS = [
  {
    name: 'main',
    src: '1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM',
    dst: '17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A',
    from: 'en',
    to_lang: 'th',
  },
  // Add more pairs here, e.g.:
  // { name: 'handbook', src: '<EN_ID>', dst: '<FR_ID>', from: 'en', to_lang: 'fr' },
];
