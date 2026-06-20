/**
 * gdocs-sync — translate a source Google Doc into many languages, driven by a
 * Google Sheet registry. Each target doc is edited in place (or auto-created
 * once), so its document id and share link are stable forever.
 *
 * Entry points:
 *   setupRegistry()     — create the control Sheet (run once; logs its URL)
 *   syncAll()           — translate every row; write back target ids + share links
 *   openRegistry()      — log the registry Sheet URL
 *   enableNightlySync() — daily time-driven trigger for syncAll
 *   disableAutoSync()   — remove those triggers
 */

/** Create (or find) the control Sheet and ensure its schema. Migrates the sheet
 *  (clears + reseeds) if the header doesn't match the current columns. */
function setupRegistry() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const existing = props.getProperty('registry_id');
  if (existing) { try { ss = SpreadsheetApp.openById(existing); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SETTINGS.registrySheetName);
    props.setProperty('registry_id', ss.getId());
  }
  const sh = ss.getSheets()[0];
  const cols = SETTINGS.header.length;
  const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), cols)).getValues()[0] : [];
  const matches = cur.slice(0, cols).map(String).join('|') === SETTINGS.header.join('|');

  if (!matches) {                       // fresh sheet or schema change → (re)initialise
    sh.clearContents();
    sh.getRange(1, 1, 1, cols).setValues([SETTINGS.header]).setFontWeight('bold');
    if (SETTINGS.seed.length) {
      sh.getRange(2, 1, SETTINGS.seed.length, SETTINGS.seed[0].length).setValues(SETTINGS.seed);
    }
  } else {
    sh.getRange(1, 1, 1, cols).setValues([SETTINGS.header]).setFontWeight('bold');
  }
  sh.setFrozenRows(1);
  Logger.log('Registry sheet: ' + ss.getUrl());
}

/** Translate every row in the registry, writing back target id, link, status. */
function syncAll() {
  const ss = registry_();
  const sh = ss.getSheets()[0];
  const vals = sh.getDataRange().getValues();
  const H = headerIndex_(vals[0]);
  logEvent_('syncAll start (' + (vals.length - 1) + ' rows)');

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const srcId = extractId_(row[H.source_link]), to = row[H.to_lang], from = row[H.from] || 'en';
    const mode = String(row[H.mode] || 'once').trim().toLowerCase();
    if (!srcId || !to) continue;
    try {
      let tgtId = extractId_(row[H.target_link]);
      let action;
      if (!tgtId) {                              // no doc yet → create + translate
        tgtId = createTarget_(srcId, to, row[H.builder]);
        translateInto_(srcId, tgtId, from, to);
        action = 'created';
      } else if (mode === 'sync') {              // published translation → refresh
        translateInto_(srcId, tgtId, from, to);
        action = 'resynced';
      } else {                                   // mode=once + exists → leave builder's edits alone
        action = 'kept';
      }
      if (action === 'created') { shareTarget_(tgtId, row[H.email], row[H.access]); }
      else { setAccess_(tgtId, row[H.access]); }

      const link = 'https://docs.google.com/document/d/' + tgtId + '/edit';
      sh.getRange(r + 1, H.target_link + 1).setValue(link);
      sh.getRange(r + 1, H.last_synced + 1).setValue(new Date());
      sh.getRange(r + 1, H.status + 1).setValue(action);
      logEvent_(action + '  ' + row[H.builder] + ' ' + to);
    } catch (e) {
      sh.getRange(r + 1, H.status + 1).setValue('FAIL: ' + e);
      logEvent_('FAIL  ' + row[H.builder] + ' ' + to + ': ' + e);
    }
  }
  logEvent_('syncAll done');
}

/** Trash the target doc(s) and delete the registry row(s) for a builder. Returns count. */
function removeBuilder_(builder) {
  if (!builder) throw new Error('builder name required');
  const sh = registry_().getSheets()[0];
  const vals = sh.getDataRange().getValues();
  const H = headerIndex_(vals[0]);
  let removed = 0;
  for (let r = vals.length - 1; r >= 1; r--) {            // bottom-up so row indices stay valid
    if (String(vals[r][H.builder]) === String(builder)) {
      const id = extractId_(vals[r][H.target_link]);
      if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ } }
      sh.deleteRow(r + 1);
      removed++;
    }
  }
  return removed;
}

/** Create a builder's translated copy and append a (mode=once) row. Returns its link. */
function addBuilder_(builder, email, lang, srcUrl) {
  if (!builder) throw new Error('builder name required');
  srcUrl = srcUrl || SETTINGS.master;
  const srcId = extractId_(srcUrl);
  if (!srcId) throw new Error('bad source link');
  lang = lang || 'th';

  logEvent_('add "' + builder + '" (' + lang + ') — copying + translating…');
  const tgtId = createTarget_(srcId, lang, builder);
  translateInto_(srcId, tgtId, 'en', lang);
  shareTarget_(tgtId, email, '');   // global editors + the builder's own email
  const link = 'https://docs.google.com/document/d/' + tgtId + '/edit';
  logEvent_('add "' + builder + '" done → ' + link);

  const sh = registry_().getSheets()[0];
  const H = headerIndex_(sh.getDataRange().getValues()[0]);
  const arr = new Array(SETTINGS.header.length).fill('');
  arr[H.builder] = builder; arr[H.email] = email || ''; arr[H.source_link] = srcUrl;
  arr[H.from] = 'en'; arr[H.to_lang] = lang; arr[H.mode] = 'once';
  arr[H.target_link] = link; arr[H.last_synced] = new Date(); arr[H.status] = 'created';
  sh.appendRow(arr);
  return link;
}

/** Append a timestamped line to the run log (Script Property, last ~60 lines). */
function logEvent_(msg) {
  const props = PropertiesService.getScriptProperties();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss');
  let log = (props.getProperty('runlog') || '') + now + '  ' + msg + '\n';
  const lines = log.split('\n');
  if (lines.length > 60) { log = lines.slice(lines.length - 60).join('\n'); }
  props.setProperty('runlog', log);
  Logger.log(msg);
}

/** Pull the doc id out of a full Google Docs URL (or return '' if none). */
function extractId_(url) {
  if (!url) return '';
  const m = String(url).match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function openRegistry() { Logger.log('Registry sheet: ' + registry_().getUrl()); }

/**
 * Token-gated web entry point so the sync can be triggered programmatically
 * (e.g. `mise run gdoc:run`). Deployed as a web app; gated by a secret token
 * stored in Script Properties (set by setupApi), so the URL alone does nothing.
 *   GET <webapp-url>/exec?token=<token>           → syncAll()
 *   GET <webapp-url>/exec?token=<token>&fn=setup  → setupRegistry()
 */
function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('api_token');
  const given = e && e.parameter ? e.parameter.token : '';
  if (!token || given !== token) {
    return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  const fn = (e.parameter.fn || 'sync');
  if (fn === 'setup') { setupRegistry(); return text_('setup ok'); }
  if (fn === 'add') {
    const link = addBuilder_(e.parameter.builder, e.parameter.email, e.parameter.lang, e.parameter.src);
    return text_(link);
  }
  if (fn === 'remove') {
    return text_('removed ' + removeBuilder_(e.parameter.builder));
  }
  if (fn === 'share') {
    return text_('shared ' + shareAll_());
  }
  if (fn === 'log') {
    return text_(PropertiesService.getScriptProperties().getProperty('runlog') || '(no log yet)');
  }
  if (fn === 'clearlog') {
    PropertiesService.getScriptProperties().deleteProperty('runlog');
    return text_('log cleared');
  }
  if (fn === 'status') {
    return ContentService.createTextOutput(JSON.stringify(statusJson_(), null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
  syncAll();
  return text_('sync ok');
}

function text_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }

/** Registry rows as plain objects (for the status endpoint). */
function statusJson_() {
  const sh = registry_().getSheets()[0];
  const vals = sh.getDataRange().getValues();
  const H = headerIndex_(vals[0]);
  const out = [];
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (!row[H.source_link]) continue;
    out.push({
      builder: row[H.builder], to: row[H.to_lang], mode: row[H.mode],
      target_link: row[H.target_link], last_synced: String(row[H.last_synced]),
      status: row[H.status],
    });
  }
  return out;
}

/** Generate (once) and print the API token used to call the web app. */
function setupApi() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('api_token');
  if (!t) { t = Utilities.getUuid().replace(/-/g, ''); props.setProperty('api_token', t); }
  Logger.log('API token: ' + t);
}

function enableNightlySync() {
  disableAutoSync();
  ScriptApp.newTrigger('syncAll').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Nightly auto-sync enabled (~03:00 ' + Session.getScriptTimeZone() + ').');
}

function disableAutoSync() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncAll'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Auto-sync disabled.');
}

// ── internals ────────────────────────────────────────────────────────────────

function registry_() {
  const id = PropertiesService.getScriptProperties().getProperty('registry_id');
  if (!id) throw new Error('No registry — run setupRegistry() first.');
  return SpreadsheetApp.openById(id);
}

function headerIndex_(hdr) {
  const m = {};
  hdr.forEach(function (h, i) { m[String(h).trim()] = i; });
  return m;
}

/** Create a translated doc by copying the source (kept in the source's folder). */
function createTarget_(sourceId, lang, label) {
  const f = DriveApp.getFileById(sourceId);
  let title = f.getName() + ' [' + String(lang).toUpperCase() + ']';
  if (label) { title += ' — ' + label; }
  const parents = f.getParents();
  const copy = parents.hasNext() ? f.makeCopy(title, parents.next()) : f.makeCopy(title);
  return copy.getId();
}

/** Full sharing for one target: global editors + this row's builder email + link access. */
function shareTarget_(id, email, access) {
  applyEditors_(id);                                   // global SETTINGS.editors
  if (email) {                                         // the builder edits their own doc
    try { DriveApp.getFileById(id).addEditor(String(email).trim()); }
    catch (e) { logEvent_('addEditor ' + email + ' failed on ' + id + ': ' + e); }
  }
  setAccess_(id, access);
}

/** Grant the configured global editors edit access (idempotent; never edits content). */
function applyEditors_(id) {
  (SETTINGS.editors || []).forEach(function (email) {
    if (!email) return;
    try { DriveApp.getFileById(id).addEditor(email); }
    catch (e) { logEvent_('addEditor ' + email + ' failed on ' + id + ': ' + e); }
  });
}

/** Link sharing per the access column: 'edit' = anyone-with-link EDIT, 'view'/'link' = VIEW. */
function setAccess_(id, access) {
  const a = String(access || '').trim().toLowerCase();
  const f = DriveApp.getFileById(id);
  if (a === 'edit') { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); }
  else if (a === 'view' || a === 'link') { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
}

/** Apply full sharing (editors + builder email + access) to every target doc. */
function shareAll_() {
  const sh = registry_().getSheets()[0];
  const vals = sh.getDataRange().getValues();
  const H = headerIndex_(vals[0]);
  let n = 0;
  for (let r = 1; r < vals.length; r++) {
    const id = extractId_(vals[r][H.target_link]);
    if (id) { shareTarget_(id, vals[r][H.email], vals[r][H.access]); n++; }
  }
  logEvent_('shared ' + n + ' docs');
  return n;
}

function translateInto_(sourceId, targetId, from, to) {
  const src = DocumentApp.openById(sourceId);
  const dst = DocumentApp.openById(targetId);
  copyBody_(src.getBody(), dst.getBody());
  translateContainer_(dst.getBody(), from, to);
  dst.saveAndClose();
}

/** Replace the destination body with copies of the source body's elements. */
function copyBody_(fromBody, toBody) {
  toBody.clear();
  for (let i = 0; i < fromBody.getNumChildren(); i++) {
    const el = fromBody.getChild(i).copy();
    const type = el.getType();
    try {
      if (type === DocumentApp.ElementType.PARAGRAPH)      toBody.appendParagraph(el.asParagraph());
      else if (type === DocumentApp.ElementType.LIST_ITEM) toBody.appendListItem(el.asListItem());
      else if (type === DocumentApp.ElementType.TABLE)     toBody.appendTable(el.asTable());
    } catch (e) {
      Logger.log('skipped element type ' + type + ': ' + e);
    }
  }
  if (toBody.getNumChildren() > 1) {
    const first = toBody.getChild(0);
    if (first.getType() === DocumentApp.ElementType.PARAGRAPH &&
        first.asParagraph().getText() === '') {
      toBody.removeChild(first);
    }
  }
}

/** Recursively translate paragraphs, list items, and table cells in place. */
function translateContainer_(container, from, to) {
  for (let i = 0; i < container.getNumChildren(); i++) {
    const el = container.getChild(i);
    const type = el.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      const text = el.editAsText().getText();
      if (text && text.trim().length) {
        el.editAsText().setText(LanguageApp.translate(text, from, to));
      }
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = el.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          translateContainer_(row.getCell(c), from, to);
        }
      }
    }
  }
}
