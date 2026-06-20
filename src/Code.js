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

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const srcId = extractId_(row[H.source_link]), to = row[H.to_lang], from = row[H.from] || 'en';
    if (!srcId || !to) continue;
    try {
      let tgtId = extractId_(row[H.target_link]);
      if (!tgtId) { tgtId = createTarget_(srcId, to); }
      translateInto_(srcId, tgtId, from, to);
      if (String(row[H.access]).trim().toLowerCase() === 'link') { setLinkSharing_(tgtId); }

      const link = 'https://docs.google.com/document/d/' + tgtId + '/edit';
      sh.getRange(r + 1, H.target_link + 1).setValue(link);
      sh.getRange(r + 1, H.last_synced + 1).setValue(new Date());
      sh.getRange(r + 1, H.status + 1).setValue('ok');
      Logger.log('OK   ' + row[H.name] + ' ' + to + ' → ' + link);
    } catch (e) {
      sh.getRange(r + 1, H.status + 1).setValue('FAIL: ' + e);
      Logger.log('FAIL ' + row[H.name] + ' ' + to + ': ' + e);
    }
  }
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
  syncAll();
  return text_('sync ok');
}

function text_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }

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
function createTarget_(sourceId, lang) {
  const f = DriveApp.getFileById(sourceId);
  const title = f.getName() + ' [' + String(lang).toUpperCase() + ']';
  const parents = f.getParents();
  const copy = parents.hasNext() ? f.makeCopy(title, parents.next()) : f.makeCopy(title);
  return copy.getId();
}

function translateInto_(sourceId, targetId, from, to) {
  const src = DocumentApp.openById(sourceId);
  const dst = DocumentApp.openById(targetId);
  copyBody_(src.getBody(), dst.getBody());
  translateContainer_(dst.getBody(), from, to);
  dst.saveAndClose();
}

function setLinkSharing_(id) {
  DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
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
