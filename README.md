# Укроп — Родословное дерево

Интерактивное родословное дерево из файла `Укроп.graphml` на Google Drive.

**Сайт:** [https://ayanzhexenbay.github.io/Ukrop/](https://ayanzhexenbay.github.io/Ukrop/)

**Игра Лабиринт:** [https://ayanzhexenbay.github.io/Labyrinth/](https://ayanzhexenbay.github.io/Labyrinth/)

---

## Возможности

- Просмотр родословного дерева (GraphML)
- Доступ по **коду семьи** (не видно без кода)
- Редактирование имён родственников
- Добавление и изменение дней рождения
- Календарь ближайших дней рождения
- Сохранение обратно в `Укроп.graphml` на **Google Drive**

---

## Архитектура

| Компонент | Где |
|-----------|-----|
| Код сайта | Публичный репозиторий GitHub `Ukrop` |
| `Укроп.graphml` | Google Drive (не в Git) |
| Код доступа + API | Google Apps Script |
| Ссылка с игры | [Labyrinth](https://ayanzhexenbay.github.io/Labyrinth/) → «Укроп» |

---

## Настройка (один раз)

### 1. Файл на Google Drive

1. Загрузите `Укроп.graphml` на Google Drive
2. Скопируйте **ID файла** из URL:  
   `https://drive.google.com/file/d/ **FILE_ID** /view`

### 2. Google Apps Script

1. Откройте [script.google.com](https://script.google.com) → **Новый проект**
2. Скопируйте код из [`apps-script/Code.gs`](apps-script/Code.gs)
3. Укажите `FILE_ID` и `ACCESS_CODE` (код для семьи)
4. **Развернуть** → **Новое развёртывание** → тип **Веб-приложение**
   - Выполнять как: **Я**
   - Доступ: **Все**
5. Скопируйте URL веб-приложения

### 3. Конфиг сайта

В файле [`config.js`](config.js):

```javascript
window.UKROP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/ВАШ_ID/exec',
};
```

### 4. GitHub Pages

1. Репозиторий → **Settings** → **Pages**
2. Branch: `main`, папка `/ (root)` → **Save**

### 5. Ссылка с Лабиринта

Уже добавлена на [ayanzhexenbay.github.io/Labyrinth](https://ayanzhexenbay.github.io/Labyrinth/) → **Укроп**

---

## Использование

1. Откройте сайт Укроп
2. Введите **код доступа** (тот же, что в Apps Script)
3. Кликните на человека в дереве → измените имя и дату рождения
4. Нажмите **«Сохранить на Drive»**

Формат даты: `ГГГГ-ММ-ДД` (поле date в браузере)

---

## Безопасность

- Файл GraphML **не хранится** в публичном GitHub
- Без кода доступа дерево не загружается
- Код проверяется на сервере (Apps Script), не только в браузере
- Рекомендуется: файл на Drive доступен только вам
- Токен Whapi храните только в **Script properties**, не в Git

---

## WhatsApp: дни рождения (как Whapi_Whatsapp.exe)

Один GET делает оба режима:

1. **1-е число месяца** → месячный список → группа + 2 контакта  
2. **Каждый день** → кто сегодня именинник → 2 контакта  

### Настройка

1. В Apps Script добавьте файл [`BirthdayNotify.gs`](apps-script/BirthdayNotify.gs) рядом с `Code.gs`
2. **Project Settings → Script properties:**
   - `WHAPI_TOKEN` = токен из Whapi (как в `Whapi_Whatsapp`)
   - опционально: `WHATSAPP_GROUP`, `WHATSAPP_CONTACTS` (через запятую)
3. **Развернуть заново** веб-приложение (New version)
4. Один раз в редакторе запустите функцию `setupBirthdayNotifyTrigger`  
   (ежедневно ~08:00)

### Вызов вручную / cron

Превью без отправки:

```
GET {APPS_SCRIPT_URL}?action=birthday_notify&code=alasha&preview=1
```

Реальная отправка (как cron):

```
GET {APPS_SCRIPT_URL}?action=birthday_notify&code=alasha
```

Тест на дату:

```
…&preview=1&date=25.08.2026
…&force_monthly=1&preview=1
```

По умолчанию:
- группа `120363267961302181@g.us`
- контакты `77778090088`, `77771835265`

---

## Структура

```
Ukrop/
├── index.html           # Сайт
├── config.js            # URL Apps Script
├── apps-script/
│   ├── Code.gs          # API load/save + birthday_notify
│   └── BirthdayNotify.gs # Текст ДР + Whapi
└── README.md
```

---

## Автор

[ayanzhexenbay](https://github.com/ayanzhexenbay)
