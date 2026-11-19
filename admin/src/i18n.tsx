import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'ru' | 'en';
const KEY = 'led_admin_lang';

const ru = {
  'brand.sub': 'Computers',
  'nav.dashboard': 'Обзор',
  'nav.products': 'Товары',
  'nav.categories': 'Категории',
  'nav.sync': 'Синхронизация',
  'nav.import': 'Импорт CSV',
  'nav.logs': 'Журнал',
  'nav.tables': 'Таблицы Access',
  'tbl.title': 'Таблицы Access',
  'tbl.note': 'Полная копия всех таблиц базы Access. Обновляется каждые 30 секунд; каждое изменение любого поля записывается в журнал и хранится всегда.',
  'tbl.empty': 'Таблиц пока нет. Обновите агент синхронизации на сервере магазина до версии 0.4 — он загрузит все таблицы.',
  'tbl.name': 'Таблица',
  'tbl.rows': 'Строк',
  'tbl.changes': 'Изменений',
  'tbl.lastChange': 'Последнее изменение',
  'tbl.loading': 'загружается…',
  'tbl.search': 'Поиск по всем колонкам…',
  'tbl.deleted': 'показать удалённые',
  'tbl.history': 'История строки',
  'tbl.noHistory': 'Эта строка не менялась с момента загрузки.',
  'tbl.back': '← Все таблицы',
  'tbl.key': 'Ключ: {cols}',
  'tbl.noKey': 'У таблицы нет ключа: изменённая строка показывается как удаление + добавление.',
  'logs.allTables': 'Все таблицы Access',
  'logs.title': 'Журнал изменений',
  'logs.note': 'Каждое изменение, полученное из Access: что именно изменилось, было → стало. Хранится всегда.',
  'logs.search': 'Код или название…',
  'logs.allEntities': 'Все таблицы',
  'logs.allActions': 'Все действия',
  'logs.from': 'С',
  'logs.to': 'По',
  'logs.time': 'Время',
  'logs.table': 'Таблица',
  'logs.action': 'Действие',
  'logs.item': 'Запись',
  'logs.changes': 'Изменения',
  'logs.empty': 'Изменений пока нет. Измените что-нибудь в Access — запись появится здесь через несколько секунд.',
  'act.created': 'добавлен',
  'act.updated': 'изменён',
  'act.restored': 'восстановлен',
  'act.deleted': 'удалён',
  'nav.signout': 'Выйти',
  'nav.menu': 'Меню',
  'nav.close': 'Закрыть меню',
  'products.sortBy': 'Сортировка',
  'products.asc': 'по возрастанию',
  'products.desc': 'по убыванию',
  'theme.auto': 'Как в системе',
  'theme.light': 'Светлая тема',
  'theme.dark': 'Тёмная тема',

  'login.title': 'Панель управления',
  'login.email': 'Email',
  'login.password': 'Пароль',
  'login.submit': 'Войти',
  'login.busy': 'Вход…',
  'login.wrong': 'Неверный email или пароль',

  'common.loading': 'Загрузка…',
  'common.yes': 'Да',
  'common.no': 'Нет',
  'common.fromAccess': 'из Access',
  'common.prev': '← Назад',
  'common.next': 'Вперёд →',
  'common.page': 'Страница {page} из {pages}',
  'common.perPage': '{n} на странице',
  'common.nothing': 'Ничего не найдено',

  'ago.never': 'никогда',
  'ago.s': '{n} сек назад',
  'ago.m': '{n} мин назад',
  'ago.h': '{n} ч назад',
  'ago.d': '{n} дн назад',
  'sync.last': 'Последнее изменение: {ago}',
  'agent.online': 'Агент: в сети',
  'agent.offline': 'Агент: не в сети ({ago})',
  'agent.never': 'Агент: нет связи',
  'agent.error': 'Агент: ошибка',

  'dash.title': 'Обзор',
  'dash.products': 'Товаров',
  'dash.inStock': 'В наличии',
  'dash.outOfStock': 'Нет в наличии',
  'dash.categories': 'Категорий',
  'dash.deleted': 'Удалено в Access',
  'dash.note': 'Данные поступают из базы Microsoft Access магазина через агент синхронизации и обновляются автоматически.',

  'products.title': 'Товары',
  'products.search': 'Поиск по названию, штрихкоду, бренду или коду…',
  'products.allCategories': 'Все категории',
  'products.anyStock': 'Любой остаток',
  'products.inStock': 'В наличии',
  'products.outOfStock': 'Нет в наличии',
  'products.allActive': 'Активные и снятые',
  'products.activeOnly': 'Только активные',
  'products.discOnly': 'Только снятые с поставок',
  'products.showRemoved': 'Показать удалённые',
  'products.discontinued': 'снят с поставок',
  'col.code': 'Код',
  'col.name': 'Название',
  'col.barcode': 'Штрихкод',
  'col.category': 'Категория',
  'col.brand': 'Бренд',
  'col.price': 'Цена',
  'col.stock': 'Остаток',
  'col.updated': 'Обновлён',
  'col.products': 'Товаров',

  'product.back': '← Товары',
  'product.removed': 'удалён в Access {date}',
  'product.store': 'Данные магазина',
  'product.storeNote': 'Только чтение. Изменяйте эти данные в программе магазина — сайт обновится через несколько секунд.',
  'product.lastSynced': 'Синхронизирован: {synced} · впервые получен: {created}',
  'product.web': 'Данные сайта',
  'product.webNote': 'Фото, описание, SEO и видимость будут редактироваться здесь (CMS, следующий этап).',
  'product.visible': 'Показывать на сайте',
  'product.slug': 'URL (slug)',
  'product.images': 'Фото',
  'product.description': 'Описание',
  'f.code': 'Код (КодТовара)',
  'f.name': 'Название (Марка)',
  'f.barcode': 'Штрихкод (ШтрихКод)',
  'f.category': 'Категория (КодТипа)',
  'f.brand': 'Производитель',
  'f.unit': 'Единица измерения',
  'f.currency': 'Валюта',
  'f.price': 'Цена',
  'f.stock': 'Остаток (НаСкладе)',
  'f.priceList': 'В прайс-листе',
  'f.discontinued': 'Поставки прекращены',
  'f.weight': 'Вес',
  'f.volume': 'Объём',
  'f.note': 'Примечание',

  'cat.title': 'Категории',

  'syncp.title': 'Синхронизация',
  'syncp.note': 'Все пакеты, отправленные агентом магазина. Агент отправляет только изменённые строки, поэтому в спокойное время записей мало.',
  'syncp.time': 'Время',
  'syncp.table': 'Таблица',
  'syncp.updated': 'Обновлено',
  'syncp.removed': 'Удалено',
  'syncp.agent': 'Агент',
  'syncp.batch': 'Пакет',
  'syncp.empty': 'Синхронизаций пока не было. Запустите агент на сервере магазина.',
  'syncp.newer': '← Новее',
  'syncp.older': 'Старее →',
  'entity.products': 'товары',
  'entity.categories': 'категории',
  'entity.currencies': 'валюты',

  'imp.title': 'Импорт из CSV',
  'imp.note': 'Первичная загрузка данных из Access. На сервере магазина выполните {cmd}, затем загрузите три файла ниже в указанном порядке. Повторный импорт обновляет строки по коду и не создаёт дубликатов. После этого агент синхронизации будет поддерживать данные в актуальном состоянии автоматически.',
  'imp.categories': 'Категории',
  'imp.currencies': 'Валюты',
  'imp.products': 'Товары',
  'imp.file': 'Файл:',
  'imp.import': 'Импортировать',
  'imp.busy': 'Импорт…',
  'imp.done': 'Импортировано {imported} из {rows} строк.',
  'imp.columns': 'Колонка названия: {name}, колонка кода: {id}.',
  'imp.ignored': 'Пропущенные колонки: {cols}.',
};

const en: Record<keyof typeof ru, string> = {
  'brand.sub': 'Computers',
  'nav.dashboard': 'Dashboard',
  'nav.products': 'Products',
  'nav.categories': 'Categories',
  'nav.sync': 'Sync',
  'nav.import': 'Import CSV',
  'nav.logs': 'Logs',
  'nav.tables': 'Access tables',
  'tbl.title': 'Access tables',
  'tbl.note': 'A full copy of every table in the Access database. Updated every 30 seconds; every change of any field is logged and kept forever.',
  'tbl.empty': 'No tables yet. Update the sync agent on the store server to version 0.4 and it will upload every table.',
  'tbl.name': 'Table',
  'tbl.rows': 'Rows',
  'tbl.changes': 'Changes',
  'tbl.lastChange': 'Last change',
  'tbl.loading': 'loading…',
  'tbl.search': 'Search all columns…',
  'tbl.deleted': 'show deleted',
  'tbl.history': 'Row history',
  'tbl.noHistory': 'This row has not changed since it was loaded.',
  'tbl.back': '← All tables',
  'tbl.key': 'Key: {cols}',
  'tbl.noKey': 'This table has no key: a changed row shows as deleted + added.',
  'logs.allTables': 'All Access tables',
  'logs.title': 'Change log',
  'logs.note': 'Every change received from Access: exactly what changed, old → new. Kept forever.',
  'logs.search': 'Code or name…',
  'logs.allEntities': 'All tables',
  'logs.allActions': 'All actions',
  'logs.from': 'From',
  'logs.to': 'To',
  'logs.time': 'Time',
  'logs.table': 'Table',
  'logs.action': 'Action',
  'logs.item': 'Item',
  'logs.changes': 'Changes',
  'logs.empty': 'No changes yet. Change something in Access and it will appear here within seconds.',
  'act.created': 'created',
  'act.updated': 'updated',
  'act.restored': 'restored',
  'act.deleted': 'deleted',
  'nav.signout': 'Sign out',
  'nav.menu': 'Menu',
  'nav.close': 'Close menu',
  'products.sortBy': 'Sort by',
  'products.asc': 'ascending',
  'products.desc': 'descending',
  'theme.auto': 'Match system',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',

  'login.title': 'Admin panel',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.busy': 'Signing in…',
  'login.wrong': 'Wrong email or password',

  'common.loading': 'Loading…',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.fromAccess': 'from Access',
  'common.prev': '← Prev',
  'common.next': 'Next →',
  'common.page': 'Page {page} of {pages}',
  'common.perPage': '{n} / page',
  'common.nothing': 'Nothing found',

  'ago.never': 'never',
  'ago.s': '{n} s ago',
  'ago.m': '{n} min ago',
  'ago.h': '{n} h ago',
  'ago.d': '{n} days ago',
  'sync.last': 'Last change: {ago}',
  'agent.online': 'Agent: online',
  'agent.offline': 'Agent: offline ({ago})',
  'agent.never': 'Agent: not connected',
  'agent.error': 'Agent: error',

  'dash.title': 'Dashboard',
  'dash.products': 'Products',
  'dash.inStock': 'In stock',
  'dash.outOfStock': 'Out of stock',
  'dash.categories': 'Categories',
  'dash.deleted': 'Removed in Access',
  'dash.note': "Data comes from the store's Microsoft Access database through the sync agent and refreshes automatically.",

  'products.title': 'Products',
  'products.search': 'Search name, barcode, brand or code…',
  'products.allCategories': 'All categories',
  'products.anyStock': 'Any stock',
  'products.inStock': 'In stock',
  'products.outOfStock': 'Out of stock',
  'products.allActive': 'Active + discontinued',
  'products.activeOnly': 'Active only',
  'products.discOnly': 'Discontinued only',
  'products.showRemoved': 'Show removed',
  'products.discontinued': 'discontinued',
  'col.code': 'Code',
  'col.name': 'Name',
  'col.barcode': 'Barcode',
  'col.category': 'Category',
  'col.brand': 'Brand',
  'col.price': 'Price',
  'col.stock': 'Stock',
  'col.updated': 'Updated',
  'col.products': 'Products',

  'product.back': '← Products',
  'product.removed': 'removed in Access {date}',
  'product.store': 'Store data',
  'product.storeNote': 'Read-only. Change these in the store program; the website updates within seconds.',
  'product.lastSynced': 'Last synced: {synced} · first seen: {created}',
  'product.web': 'Website data',
  'product.webNote': 'Images, description, SEO and visibility will be editable here (CMS, next step).',
  'product.visible': 'Visible on site',
  'product.slug': 'Slug',
  'product.images': 'Images',
  'product.description': 'Description',
  'f.code': 'Code (КодТовара)',
  'f.name': 'Name (Марка)',
  'f.barcode': 'Barcode (ШтрихКод)',
  'f.category': 'Category (КодТипа)',
  'f.brand': 'Brand (Производитель)',
  'f.unit': 'Unit (ЕдиницаИзмерения)',
  'f.currency': 'Currency',
  'f.price': 'Price (Цена)',
  'f.stock': 'Stock (НаСкладе)',
  'f.priceList': 'In price list (Прайс-Лист)',
  'f.discontinued': 'Discontinued (ПоставкиПрекращены)',
  'f.weight': 'Weight (Вес)',
  'f.volume': 'Volume (Объем)',
  'f.note': 'Note (Примечание)',

  'cat.title': 'Categories',

  'syncp.title': 'Sync',
  'syncp.note': 'Every batch the store agent sent. The agent only sends rows that changed, so a quiet store means few entries.',
  'syncp.time': 'Time',
  'syncp.table': 'Table',
  'syncp.updated': 'Updated',
  'syncp.removed': 'Removed',
  'syncp.agent': 'Agent',
  'syncp.batch': 'Batch',
  'syncp.empty': 'No sync yet. Start the agent on the store server.',
  'syncp.newer': '← Newer',
  'syncp.older': 'Older →',
  'entity.products': 'products',
  'entity.categories': 'categories',
  'entity.currencies': 'currencies',

  'imp.title': 'Import from CSV',
  'imp.note': 'First load of the Access data. On the store server run {cmd}, then upload the three files below in this order. Importing again updates rows by their code and never creates duplicates. After this, the sync agent keeps everything up to date automatically.',
  'imp.categories': 'Categories',
  'imp.currencies': 'Currencies',
  'imp.products': 'Products',
  'imp.file': 'File:',
  'imp.import': 'Import',
  'imp.busy': 'Importing…',
  'imp.done': 'Imported {imported} of {rows} rows.',
  'imp.columns': 'Name column: {name}, code column: {id}.',
  'imp.ignored': 'Ignored columns: {cols}.',
};

export type TKey = keyof typeof ru;
const DICTS: Record<Lang, Record<TKey, string>> = { ru, en };

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ru' || v === 'en') return v;
  } catch { /* ignore */ }
  return 'ru';
}

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>) {
  let s = DICTS[lang][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  locale: string;
}
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  document.documentElement.lang = lang;
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  };
  const value: I18n = {
    lang, setLang,
    t: (key, vars) => translate(lang, key, vars),
    locale: lang === 'ru' ? 'ru-RU' : 'en-GB',
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang">
      {(['ru', 'en'] as Lang[]).map((l) => (
        <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}
