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

/** Create (or find) the control Sheet, write the header, seed a first row. */
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
  sh.getRange(1, 1, 1, SETTINGS.header.length).setValues([SETTINGS.header]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (sh.getLastRow() < 2 && SETTINGS.seed.length) {
    sh.getRange(2, 1, SETTINGS.seed.length, SETTINGS.seed[0].length).setValues(SETTINGS.seed);
  }
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
    const source = row[H.source_id], to = row[H.to_lang], from = row[H.from] || 'en';
    if (!source || !to) continue;
    try {
      let targetId = row[H.target_id];
      if (!targetId) { targetId = createTarget_(source, to); }
      translateInto_(source, targetId, from, to);
      if (String(row[H.access]).trim().toLowerCase() === 'link') { setLinkSharing_(targetId); }

      const link = 'https://docs.google.com/document/d/' + targetId + '/edit';
      sh.getRange(r + 1, H.target_id + 1).setValue(targetId);
      sh.getRange(r + 1, H.share_link + 1).setValue(link);
      sh.getRange(r + 1, H.last_synced + 1).setValue(new Date());
      sh.getRange(r + 1, H.status + 1).setValue('ok');
      Logger.log('OK   ' + row[H.name] + ' ' + to + ' → ' + link);
    } catch (e) {
      sh.getRange(r + 1, H.status + 1).setValue('FAIL: ' + e);
      Logger.log('FAIL ' + row[H.name] + ' ' + to + ': ' + e);
    }
  }
}

function openRegistry() { Logger.log('Registry sheet: ' + registry_().getUrl()); }

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
