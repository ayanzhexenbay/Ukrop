/**
 * WhatsApp birthday notifications (port of Whapi_Whatsapp).
 *
 * Script Properties (Project settings → Script properties):
 *   WHAPI_TOKEN = <token from Whapi>
 *
 * Optional overrides (editable in Ukrop UI → ⚙️ WhatsApp, or Script properties):
 *   WHATSAPP_GROUP = 120363267961302181@g.us
 *   WHATSAPP_CONTACTS = 77778090088,77771835265
 */

var KZ_MONTHS = [
  'Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым',
  'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'
];

var DEFAULT_WHATSAPP_GROUP = '120363267961302181@g.us';
var DEFAULT_WHATSAPP_CONTACTS = ['77778090088', '77771835265'];
var WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
var TZ = 'Asia/Almaty';

function getWhapiToken_() {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty('WHAPI_TOKEN') || '').trim();
}

function getWhatsAppGroup_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('WHATSAPP_GROUP');
  if (raw === null) return DEFAULT_WHATSAPP_GROUP;
  return String(raw).trim();
}

function getWhatsAppContacts_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('WHATSAPP_CONTACTS');
  if (raw === null) return DEFAULT_WHATSAPP_CONTACTS.slice();
  return String(raw).split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function getWhatsAppSettings_() {
  return {
    group: getWhatsAppGroup_(),
    contacts: getWhatsAppContacts_()
  };
}

function saveWhatsAppSettings_(group, contacts) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WHATSAPP_GROUP', String(group || '').trim());
  var list = (contacts || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
  props.setProperty('WHATSAPP_CONTACTS', list.join(','));
  return getWhatsAppSettings_();
}

function nowInAlmaty_() {
  var s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function parseDateYmd_(value) {
  if (!value) return null;
  var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], iso: m[0] };
}

function formatDdMmYyyy_(dt) {
  var dd = ('0' + dt.getDate()).slice(-2);
  var mm = ('0' + (dt.getMonth() + 1)).slice(-2);
  return dd + '.' + mm + '.' + dt.getFullYear();
}

var WA_DATE_SEP = '∙';

function formatWaDateDots_(dt) {
  if (!dt) return '';
  var dd = ('0' + dt.getDate()).slice(-2);
  var mm = ('0' + (dt.getMonth() + 1)).slice(-2);
  return dd + WA_DATE_SEP + mm + WA_DATE_SEP + dt.getFullYear();
}

function formatBirthDatePerson_(p, year, includeAge) {
  if (p.isDeceased && p.dod) {
    return '[' + formatWaDateDots_(p.birthday) + ' - ' + formatWaDateDots_(p.dod) + ']';
  }
  var s = formatWaDateDots_(p.birthday);
  if (includeAge && !p.isDeceased && year && p.birthday) {
    s += '-' + (year - p.birthday.getFullYear()) + 'ж';
  }
  return s;
}

function findDescendantsByLocalName_(el, localName, out) {
  out = out || [];
  if (!el) return out;
  var kids = el.getChildren();
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c.getName() === localName) out.push(c);
    findDescendantsByLocalName_(c, localName, out);
  }
  return out;
}

function parseNodeUkrop_(nodeEl) {
  var data = { labelText: '', ukrop: null };
  var dataEls = nodeEl.getChildren();
  for (var i = 0; i < dataEls.length; i++) {
    var de = dataEls[i];
    if (de.getName() !== 'data') continue;
    var key = de.getAttribute('key') && de.getAttribute('key').getValue();
    if (key === 'd4') {
      var labels = findDescendantsByLocalName_(de, 'Label');
      if (labels.length) {
        var t = labels[0].getAttribute('Text');
        if (t) data.labelText = t.getValue() || '';
      }
    } else if (key === 'd6') {
      var jsonEls = findDescendantsByLocalName_(de, 'Json');
      if (jsonEls.length) {
        var raw = jsonEls[0].getText();
        if (raw && raw.trim()) {
          try {
            var root = JSON.parse(raw);
            data.ukrop = root.ukrop || null;
          } catch (err) { /* ignore */ }
        }
      }
    }
  }
  return data;
}

function calculateDepths_(parentByChild, rootId) {
  var childrenByParent = {};
  Object.keys(parentByChild).forEach(function (child) {
    var parent = parentByChild[child];
    if (!childrenByParent[parent]) childrenByParent[parent] = [];
    childrenByParent[parent].push(child);
  });

  var depths = {};
  depths[rootId] = 0;
  var queue = [rootId];
  while (queue.length) {
    var current = queue.shift();
    var kids = childrenByParent[current] || [];
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (depths[child] !== undefined) continue;
      depths[child] = depths[current] + 1;
      queue.push(child);
    }
  }
  return depths;
}

function getParentDisplayName_(parentNodeId, nodes) {
  if (!parentNodeId || !nodes[parentNodeId]) return '';
  var parent = nodes[parentNodeId];
  if (parent.ukrop && parent.ukrop.people && parent.ukrop.people.length) {
    var name = parent.ukrop.people[0].name;
    if (name) return String(name);
  }
  if (parent.labelText) {
    var parts = String(parent.labelText).split(' - ');
    if (parts.length) return parts[0].trim();
  }
  return '';
}

function parseFamilyTree_(xml) {
  var document = XmlService.parse(xml);
  var root = document.getRootElement();
  var ns = root.getNamespace();
  var graph = root.getChild('graph', ns) || root.getChild('graph');
  if (!graph) throw new Error('В GraphML нет graph');

  var nodes = {};
  var nodeEls = graph.getChildren('node', ns);
  if (!nodeEls.length) nodeEls = graph.getChildren('node');
  for (var i = 0; i < nodeEls.length; i++) {
    var ne = nodeEls[i];
    var idAttr = ne.getAttribute('id');
    if (!idAttr) continue;
    nodes[idAttr.getValue()] = parseNodeUkrop_(ne);
  }

  var parentByChild = {};
  var edgeEls = graph.getChildren('edge', ns);
  if (!edgeEls.length) edgeEls = graph.getChildren('edge');
  for (var e = 0; e < edgeEls.length; e++) {
    var ee = edgeEls[e];
    var src = ee.getAttribute('source');
    var tgt = ee.getAttribute('target');
    if (src && tgt) parentByChild[tgt.getValue()] = src.getValue();
  }

  var depths = calculateDepths_(parentByChild, 'n0');
  var people = [];

  Object.keys(nodes).forEach(function (nodeId) {
    var nd = nodes[nodeId];
    if (!nd.ukrop || !nd.ukrop.people || !nd.ukrop.people.length) return;
    var depth = depths[nodeId] !== undefined ? depths[nodeId] : 9999;
    var parentNodeId = parentByChild[nodeId] || null;
    var parentDisplayName = getParentDisplayName_(parentNodeId, nodes);
    var nodeType = nd.ukrop.type || '';

    nd.ukrop.people.forEach(function (person) {
      var bday = parseDateYmd_(person.birthday);
      var dod = parseDateYmd_(person.dod);
      people.push({
        nodeId: nodeId,
        name: person.name || '',
        gender: person.gender || '',
        birthday: bday ? new Date(bday.y, bday.m - 1, bday.d) : null,
        dod: dod ? new Date(dod.y, dod.m - 1, dod.d) : null,
        isDeceased: !!dod,
        nodeType: nodeType,
        depth: depth,
        parentNodeId: parentNodeId,
        parentDisplayName: parentDisplayName
      });
    });
  });

  return people;
}

function filterByDepth_(people, depth) {
  return people
    .filter(function (p) { return p.depth === depth; })
    .sort(function (a, b) {
      var ad = a.birthday.getDate();
      var bd = b.birthday.getDate();
      if (ad !== bd) return ad - bd;
      var ay = a.birthday.getFullYear();
      var by = b.birthday.getFullYear();
      if (ay !== by) return ay - by;
      return String(a.name).localeCompare(String(b.name), 'kk');
    });
}

function appendMonthlySection_(sb, title, people, year, includeParent, includeAgeForLiving) {
  if (!people.length) return;
  sb.push('');
  sb.push('_' + title + ':_');
  people.forEach(function (person) {
    var line = (person.isDeceased ? '> ' : '* ') + person.name;
    if (includeParent && person.parentDisplayName) {
      line += ' (' + person.parentDisplayName + ')';
    }
    line += ' - `' + formatBirthDatePerson_(person, year, includeAgeForLiving) + '`';
    sb.push(line);
  });
}

function appendDailySection_(sb, title, people, includeParent) {
  if (!people.length) return;
  sb.push('');
  sb.push('_' + title + '_:');
  people
    .slice()
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'kk'); })
    .forEach(function (person) {
      var line = (person.isDeceased ? '> _' : '* _') + person.name;
      if (includeParent && person.parentDisplayName) {
        line += ' (' + person.parentDisplayName + ')';
      }
      line += '_';
      sb.push(line);
    });
}

function generateMonthlyMessage_(people, year, month) {
  var monthPeople = people.filter(function (p) {
    return p.birthday && (p.birthday.getMonth() + 1) === month;
  });

  var grandparents = filterByDepth_(monthPeople, 0);
  var elders = filterByDepth_(monthPeople, 1);
  var youngTumar = filterByDepth_(monthPeople, 2);
  var children = monthPeople
    .filter(function (p) { return p.depth >= 3; })
    .sort(function (a, b) {
      var ad = a.birthday.getDate();
      var bd = b.birthday.getDate();
      if (ad !== bd) return ad - bd;
      var ay = a.birthday.getFullYear();
      var by = b.birthday.getFullYear();
      if (ay !== by) return ay - by;
      return String(a.name).localeCompare(String(b.name), 'kk');
    });

  var sb = [];
  sb.push('*' + year + ' ' + KZ_MONTHS[month - 1] + ' айындағы туған күндер:*');
  appendMonthlySection_(sb, 'Ата-әже буыны', grandparents, year, false, false);
  appendMonthlySection_(sb, 'Үлкендер буыны', elders, year, false, false);
  appendMonthlySection_(sb, 'Жас Тумалар буыны', youngTumar, year, false, false);
  appendMonthlySection_(sb, 'Бала-шаға буыны', children, year, true, true);
  return sb.join('\n').replace(/\s+$/, '');
}

function generateDailyMessage_(people, date) {
  var dayPeople = people.filter(function (p) {
    return p.birthday
      && (p.birthday.getMonth() + 1) === (date.getMonth() + 1)
      && p.birthday.getDate() === date.getDate();
  });
  if (!dayPeople.length) return '';

  var grandparents = filterByDepth_(dayPeople, 0);
  var elders = filterByDepth_(dayPeople, 1);
  var youngTumar = filterByDepth_(dayPeople, 2);
  var children = dayPeople
    .filter(function (p) { return p.depth >= 3; })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'kk'); });

  var sb = [];
  sb.push('*' + formatWaDateDots_(date) + '* Бүгінгі туған күн иелерін құттықтаймыз:');
  appendDailySection_(sb, 'Ата-әже буыны', grandparents, false);
  appendDailySection_(sb, 'Үлкендер буыны', elders, false);
  appendDailySection_(sb, 'Жас Тумалар буыны', youngTumar, false);
  appendDailySection_(sb, 'Бала-шаға буыны', children, true);
  return sb.join('\n').replace(/\s+$/, '');
}

function sendWhapiText_(to, body, token) {
  var payload = { to: to, body: body };
  var resp = UrlFetchApp.fetch(WHAPI_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  return {
    to: to,
    ok: code >= 200 && code < 300,
    status: code,
    response: text
  };
}

function sendToMany_(recipients, body, token) {
  return recipients.map(function (to) {
    return sendWhapiText_(to, body, token);
  });
}

function parseSendRecipients_(sendParam) {
  if (!sendParam) return null;
  return String(sendParam).split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function monthKey_(year, month) {
  return year + '-' + ('0' + month).slice(-2);
}

function addMonths_(year, month, delta) {
  var d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function emptyMonthlySlot_(kind) {
  return {
    kind: kind,
    planned: false,
    willSend: false,
    alreadySent: false,
    targetMonth: null,
    body: null,
    recipients: [],
    results: []
  };
}

/**
 * Main entry: monthly (1st + 25th advance) + daily.
 * params:
 *   preview=1
 *   force_monthly=1
 *   date=29.08.2026        — день (ежедневное сообщение; с send — только оно)
 *   month=08.2026          — месяц (месячный список; с send — только оно)
 *   send=77778090088       — отправить только на этот номер (или через запятую)
 */
function runBirthdayNotify_(params) {
  params = params || {};
  var preview = String(params.preview || '') === '1' || String(params.preview || '').toLowerCase() === 'true';
  var forceMonthly = String(params.force_monthly || '') === '1'
    || String(params.force_monthly || '').toLowerCase() === 'true';
  var sendOverride = parseSendRecipients_(params.send);
  var mode = 'auto';

  var now = nowInAlmaty_();
  if (params.month) {
    var mp = String(params.month).match(/^(\d{1,2})\.(\d{4})$/);
    if (!mp) {
      return { ok: false, error: 'month должен быть MM.yyyy' };
    }
    var monthNum = +mp[1];
    if (monthNum < 1 || monthNum > 12) {
      return { ok: false, error: 'month: месяц должен быть 01–12' };
    }
    now = new Date(+mp[2], monthNum - 1, 1);
    mode = 'monthly_only';
    forceMonthly = true;
  } else if (params.date) {
    var parts = String(params.date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!parts) {
      return { ok: false, error: 'date должен быть dd.MM.yyyy' };
    }
    now = new Date(+parts[3], +parts[2] - 1, +parts[1]);
    if (sendOverride) mode = 'daily_only';
  }

  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  var currentMonthKey = monthKey_(year, month);

  var file = DriveApp.getFileById(FILE_ID);
  var xml = file.getBlob().getDataAsString('UTF-8');
  var people = parseFamilyTree_(xml);

  var monthlyBody = generateMonthlyMessage_(people, year, month);
  var dailyBody = generateDailyMessage_(people, now);

  var nextMonth = addMonths_(year, month, 1);
  var nextMonthKey = monthKey_(nextMonth.year, nextMonth.month);
  var monthlyAdvanceBody = generateMonthlyMessage_(people, nextMonth.year, nextMonth.month);

  var group = getWhatsAppGroup_();
  var contacts = getWhatsAppContacts_();
  var defaultMonthlyRecipients = (group ? [group] : []).concat(contacts);
  var monthlyRecipients = sendOverride || defaultMonthlyRecipients;
  var dailyRecipients = sendOverride || contacts.slice();

  var props = PropertiesService.getScriptProperties();
  var lastMonthly = props.getProperty('LAST_MONTHLY_SENT') || '';
  var lastAdvance = props.getProperty('LAST_MONTHLY_ADVANCE_SENT') || '';

  var shouldMonthlyCurrent = mode === 'monthly_only'
    || (mode === 'auto' && day === 1 && lastMonthly !== currentMonthKey)
    || (forceMonthly && mode === 'auto');
  var shouldMonthlyAdvance = mode === 'auto'
    && day === 25
    && lastAdvance !== nextMonthKey;

  var shouldDaily = mode === 'daily_only' || mode === 'auto';
  var updateMonthlyCurrentFlag = shouldMonthlyCurrent && !preview && !sendOverride && mode === 'auto' && day === 1;
  var updateMonthlyAdvanceFlag = shouldMonthlyAdvance && !preview && !sendOverride && mode === 'auto';

  var result = {
    ok: true,
    action: 'birthday_notify',
    mode: mode,
    date: formatDdMmYyyy_(now),
    preview: preview,
    sendOverride: sendOverride,
    monthly: {
      kind: 'current',
      planned: mode !== 'daily_only' && (mode === 'monthly_only' || day === 1 || forceMonthly),
      willSend: shouldMonthlyCurrent && mode !== 'daily_only' && !!monthlyBody,
      alreadySent: lastMonthly === currentMonthKey,
      targetMonth: currentMonthKey,
      body: monthlyBody,
      recipients: mode === 'daily_only' ? [] : monthlyRecipients,
      results: []
    },
    monthlyAdvance: {
      kind: 'advance',
      planned: mode === 'auto' && day === 25,
      willSend: shouldMonthlyAdvance && mode === 'auto' && !!monthlyAdvanceBody,
      alreadySent: lastAdvance === nextMonthKey,
      targetMonth: nextMonthKey,
      body: monthlyAdvanceBody,
      recipients: mode === 'auto' ? monthlyRecipients : [],
      results: []
    },
    daily: {
      planned: mode !== 'monthly_only',
      willSend: shouldDaily && mode !== 'monthly_only' && !!dailyBody,
      body: dailyBody || null,
      recipients: mode === 'monthly_only' ? [] : dailyRecipients,
      results: [],
      skipped: mode === 'monthly_only'
        ? 'Режим month=MM.yyyy'
        : (!dailyBody ? 'Нет именинников сегодня' : null)
    }
  };

  if (mode === 'daily_only') {
    result.monthlyAdvance = emptyMonthlySlot_('advance');
  }
  if (mode === 'monthly_only') {
    result.monthlyAdvance = emptyMonthlySlot_('advance');
  }

  if (preview) {
    return result;
  }

  var token = getWhapiToken_();
  if (!token) {
    return {
      ok: false,
      error: 'WHAPI_TOKEN не задан. Project Settings → Script properties → WHAPI_TOKEN'
    };
  }

  if (shouldMonthlyCurrent && monthlyBody && mode !== 'daily_only') {
    result.monthly.results = sendToMany_(monthlyRecipients, monthlyBody, token);
    if (updateMonthlyCurrentFlag) props.setProperty('LAST_MONTHLY_SENT', currentMonthKey);
  }

  if (shouldMonthlyAdvance && monthlyAdvanceBody && mode === 'auto') {
    result.monthlyAdvance.results = sendToMany_(monthlyRecipients, monthlyAdvanceBody, token);
    if (updateMonthlyAdvanceFlag) props.setProperty('LAST_MONTHLY_ADVANCE_SENT', nextMonthKey);
  }

  if (shouldDaily && dailyBody && mode !== 'monthly_only') {
    result.daily.results = sendToMany_(dailyRecipients, dailyBody, token);
  }

  return result;
}

/** Run once in Apps Script editor to create daily trigger (08:00 Almaty ≈ UTC+5). */
function setupBirthdayNotifyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledBirthdayNotify') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('scheduledBirthdayNotify')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(5)
    .create();
  return 'OK: daily trigger at ~08:00';
}

function scheduledBirthdayNotify() {
  runBirthdayNotify_({});
}
