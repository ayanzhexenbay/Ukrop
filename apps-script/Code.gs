/**
 * Google Apps Script — скопируйте в https://script.google.com
 * 
 * 1. Создайте новый проект Apps Script
 * 2. Вставьте этот код
 * 3. Укажите FILE_ID и ACCESS_CODE ниже
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Скопируйте URL в Ukrop/config.js → APPS_SCRIPT_URL
 */

// ID файла Укроп.graphml на Google Drive (из URL: drive.google.com/file/d/FILE_ID/...)
const FILE_ID = 'ВСТАВЬТЕ_ID_ФАЙЛА';

// Код доступа для семьи (придумайте свой)
const ACCESS_CODE = 'укроп2026';

function checkCode(code) {
  return code && String(code).trim() === ACCESS_CODE;
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const code = params.code;

  if (!checkCode(code)) {
    return jsonResponse({ ok: false, error: 'Неверный код доступа' });
  }

  if (params.action === 'load') {
    try {
      const file = DriveApp.getFileById(FILE_ID);
      const content = file.getBlob().getDataAsString('UTF-8');
      return ContentService
        .createTextOutput(content)
        .setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'Не удалось прочитать файл: ' + err.message });
    }
  }

  return jsonResponse({ ok: true, message: 'Ukrop API работает' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Неверный JSON' });
  }

  if (!checkCode(body.code)) {
    return jsonResponse({ ok: false, error: 'Неверный код доступа' });
  }

  if (body.action === 'save' && body.content) {
    try {
      const file = DriveApp.getFileById(FILE_ID);
      file.setContent(body.content);
      return jsonResponse({ ok: true, message: 'Сохранено на Google Drive' });
    } catch (err) {
      return jsonResponse({ ok: false, error: 'Ошибка сохранения: ' + err.message });
    }
  }

  return jsonResponse({ ok: false, error: 'Неизвестное действие' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
