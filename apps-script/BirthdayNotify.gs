/**
 * WhatsApp birthday notifications (port of Whapi_Whatsapp).
 *
 * Script Properties (Project settings → Script properties):
 *   WHAPI_TOKEN = <token from Whapi>
 *
 * Optional overrides (comma-separated phones / group id):
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
  return String(props.getProperty('WHATSAPP_GROUP') || DEFAULT_WHATSAPP_GROUP).trim();
}

function getWhatsAppContacts_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('WHATSAPP_CONTACTS');
  if (!raw) return DEFAULT_WHATSAPP_CONTACTS.slice();
  return String(raw).split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
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

function formatBirthDatePerson_(p) {
  var birth = formatDdMmYyyy_(p.birthday);
  if (p.dod) {
    return '[' + birth + ' - ' + formatDdMmYyyy_(p.dod) + ']';
  }
  return birth;
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
  sb.push(title + ':');
  people.forEach(function (person) {
    var line = (person.isDeceased ? '> ' : '* ') + person.name;
    if (includeParent && person.parentDisplayName) {
      line += ' (' + person.parentDisplayName + ')';
    }
    line += ' - ' + formatBirthDatePerson_(person);
    if (includeAgeForLiving && !person.isDeceased) {
      line += ' - ' + (year - person.birthday.getFullYear()) + 'жас';
    }
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
  sb.push(year + ' ' + KZ_MONTHS[month - 1] + ' айындағы туған күндер:');
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
  sb.push('*' + formatDdMmYyyy_(date) + '* Бүгінгі туған күн иелерін құттықтаймыз:');
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

/**
 * Main entry: monthly (1st) + daily.
 * params: preview, force_monthly, date (dd.MM.yyyy)
 */
function runBirthdayNotify_(params) {
  params = params || {};
  var preview = String(params.preview || '') === '1' || String(params.preview || '').toLowerCase() === 'true';
  var forceMonthly = String(params.force_monthly || '') === '1'
    || String(params.force_monthly || '').toLowerCase() === 'true';

  var now = nowInAlmaty_();
  if (params.date) {
    var parts = String(params.date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!parts) {
      return { ok: false, error: 'date должен быть dd.MM.yyyy' };
    }
    now = new Date(+parts[3], +parts[2] - 1, +parts[1]);
  }

  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  var monthKey = year + '-' + ('0' + month).slice(-2);

  var file = DriveApp.getFileById(FILE_ID);
  var xml = file.getBlob().getDataAsString('UTF-8');
  var people = parseFamilyTree_(xml);

  var monthlyBody = generateMonthlyMessage_(people, year, month);
  var dailyBody = generateDailyMessage_(people, now);

  var group = getWhatsAppGroup_();
  var contacts = getWhatsAppContacts_();
  var props = PropertiesService.getScriptProperties();
  var lastMonthly = props.getProperty('LAST_MONTHLY_SENT') || '';

  var shouldMonthly = ((day === 1 && lastMonthly !== monthKey) || forceMonthly);
  if (forceMonthly) shouldMonthly = true;

  var result = {
    ok: true,
    action: 'birthday_notify',
    date: formatDdMmYyyy_(now),
    preview: preview,
    monthly: {
      planned: day === 1 || forceMonthly,
      willSend: shouldMonthly,
      alreadySentThisMonth: lastMonthly === monthKey,
      body: monthlyBody,
      recipients: [group].concat(contacts),
      results: []
    },
    daily: {
      planned: true,
      willSend: !!dailyBody,
      body: dailyBody || null,
      recipients: contacts.slice(),
      results: [],
      skipped: !dailyBody ? 'Нет именинников сегодня' : null
    }
  };

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

  if (shouldMonthly && monthlyBody) {
    result.monthly.results = sendToMany_([group].concat(contacts), monthlyBody, token);
    props.setProperty('LAST_MONTHLY_SENT', monthKey);
  }

  if (dailyBody) {
    result.daily.results = sendToMany_(contacts, dailyBody, token);
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
