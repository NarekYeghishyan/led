/**
 * Languages and the site chrome texts (top bar, header, catalog popup, footer). Product data comes from the API.
 * URLs: Armenian has no prefix (/catalog/...), Russian /ru/..., English /en/... (docs/PROJECT_PLAN.md section 11).
 */
export const LANGS = ['hy', 'ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'hy';
export const isLang = (v: unknown): v is Lang => (LANGS as readonly string[]).includes(String(v));

/** Path inside the Next.js app for a language: href('ru', '/catalog/laptops') → '/ru/catalog/laptops'. */
export const href = (lang: Lang, path: string) => (lang === DEFAULT_LANG ? path : `/${lang}${path === '/' ? '' : path}`);

/** The API sends names as [ru, hy, en]. */
export const pick = (names: string[] | undefined, lang: Lang) =>
  (names?.[{ ru: 0, hy: 1, en: 2 }[lang]] || names?.[0] || '').trim();

/** 385700 → "385 700 ֏" (non-breaking spaces, like the templates). */
export const money = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ֏`;

const T = {
  store: ['Համակարգչային խանութ Երևանում', 'Компьютерный магазин в Ереване', 'Computer store in Yerevan'],
  credit: ['Ապառիկ', 'Рассрочка', 'Instalments'],
  about: ['Մեր մասին', 'О нас', 'About us'],
  help: ['Օգնություն', 'Помощь', 'Help'],
  buy: ['Ինչպես գնել', 'Как купить', 'How to buy'],
  order: ['Ինչպես պատվիրել', 'Как заказать', 'How to order'],
  track: ['Պատվերի կարգավիճակ', 'Отследить заказ', 'Track order'],
  pay: ['Ինչպես վճարել', 'Как оплатить', 'How to pay'],
  delivery: ['Առաքում', 'Доставка', 'Delivery'],
  warranty: ['Երաշխիք', 'Гарантия', 'Warranty'],
  exchange: ['Փոխանակում', 'Обмен и возврат', 'Exchange & returns'],
  contacts: ['Կոնտակտներ', 'Контакты', 'Contacts'],
  language: ['Լեզու', 'Язык', 'Language'],
  catalog: ['Կատալոգ', 'Каталог', 'Catalog'],
  search: ['Որոնել ապրանքներ, բրենդներ և մոդելներ…', 'Поиск товаров, брендов и моделей…', 'Search products, brands and models…'],
  find: ['Որոնել', 'Найти', 'Search'],
  account: ['Անձնական էջ', 'Кабинет', 'Account'],
  compare: ['Համեմատել', 'Сравнение', 'Compare'],
  favorites: ['Ընտրյալներ', 'Избранное', 'Wishlist'],
  cart: ['Զամբյուղ', 'Корзина', 'Cart'],
  allProducts: ['Բոլոր ապրանքները →', 'Все товары →', 'All products →'],
  subcats: ['ենթաբաժին', 'подкатегорий', 'subcategories'],
  offer: ['Առաջարկ', 'Предложение', 'Offer'],
  view: ['Դիտել', 'Смотреть', 'View'],
  popular: ['Հանրաճանաչ', 'Популярное', 'Popular'],
  brands: ['Բրենդներ', 'Бренды', 'Brands'],
  close: ['Փակել', 'Закрыть', 'Close'],
  call: ['Զանգահարել', 'Позвонить', 'Call us'],
  contact: ['Կապվել', 'Связаться', 'Contact'],
  news: ['Առաջինն իմացեք ակցիաների և զեղչերի մասին', 'Узнавайте об акциях и скидках первыми', 'Be first to hear about deals and discounts'],
  email: ['Ձեր e‑mail‑ը', 'Ваш e‑mail', 'Your e‑mail'],
  subscribe: ['Բաժանորդագրվել', 'Подписаться', 'Subscribe'],
  tagline: ['Համակարգչային տեխնիկա և սարքավորումներ տան, գրասենյակի և բիզնեսի համար Հայաստանում։',
    'Компьютерная техника и оборудование для дома, офиса и бизнеса в Армении.', 'Computers and hardware for home, office and business in Armenia.'],
  customers: ['Գնորդներին', 'Покупателям', 'Customers'],
  deliveryPay: ['Առաքում և վճարում', 'Доставка и оплата', 'Delivery & payment'],
  warrantyRet: ['Երաշխիք և վերադարձ', 'Гарантия и возврат', 'Warranty & returns'],
  contactsH: ['Կապ', 'Контакты', 'Contacts'],
  address: ['Երևան, Կիևյան փ. 11‑34', 'Ереван, ул. Киевяна 11‑34', '11‑34 Kievyan St, Yerevan'],
  hours: ['Երկ–Շբթ 10:00–19:00', 'Пн–Сб 10:00–19:00', 'Mon–Sat 10:00–19:00'],
  legal: ['© 2026 LED Computers։ Բոլոր գները ներառում են ԱԱՀ։', '© 2026 LED Computers. Все цены указаны с НДС.', '© 2026 LED Computers. All prices include VAT.'],
  home: ['Գլխավոր', 'Главная', 'Home'],
  products: ['ապրանք', 'товаров', 'products'],
  inStock: ['առկա է', 'в наличии', 'in stock'],
  notFound: ['Էջը չի գտնվել', 'Страница не найдена', 'Page not found'],
  notFoundText: ['Հնարավոր է՝ հղումը հնացել է։ Փորձեք կատալոգից։', 'Возможно, ссылка устарела. Попробуйте найти в каталоге.',
    'The link may be out of date. Try the catalog.'],
  categories: ['Բաժիններ', 'Категории', 'Categories'],
  filters: ['Ֆիլտրեր', 'Фильтры', 'Filters'],
  reset: ['Մաքրել', 'Сбросить', 'Reset'],
  price: ['Գին, ֏', 'Цена, ֏', 'Price, ֏'],
  priceFrom: ['սկսած', 'от', 'from'],
  priceTo: ['մինչև', 'до', 'to'],
  apply: ['Կիրառել', 'Применить', 'Apply'],
  brand: ['Բրենդ', 'Бренд', 'Brand'],
  sortBy: ['Դասավորել՝', 'Сортировка:', 'Sort:'],
  sortDefault: ['Առաջարկվող', 'Рекомендуемые', 'Recommended'],
  sortCheap: ['Նախ՝ էժան', 'Сначала дешевле', 'Price: low to high'],
  sortExpensive: ['Նախ՝ թանկ', 'Сначала дороже', 'Price: high to low'],
  sortNew: ['Նորույթներ', 'Новинки', 'Newest'],
  sortName: ['Ըստ անվանման', 'По названию', 'By name'],
  show: ['Ցույց տալ', 'Показать', 'Show'],
  compareBtn: ['Համեմատել', 'Сравнить', 'Compare'],
  details: ['Մանրամասն', 'Подробнее', 'Details'],
  inStockLong: ['Առկա է', 'В наличии', 'In stock'],
  lastN: ['Մնացել է {n} հատ', 'Осталось {n} шт.', 'Only {n} left'],
  empty: ['Այս ֆիլտրերով ապրանքներ չկան', 'По этим фильтрам товаров нет', 'No products match these filters'],
  emptyCat: ['Այս բաժնում դեռ առկա ապրանքներ չկան', 'В этом разделе пока нет товаров в наличии', 'No products in stock in this category yet'],
  addedCart: ['Ավելացվեց զամբյուղ', 'Добавлено в корзину', 'Added to cart'],
  go: ['Անցնել', 'Перейти', 'View'],
  favOn: ['Ավելացվեց ընտրյալներում', 'Добавлено в избранное', 'Saved to wishlist'],
  favOff: ['Հեռացվեց ընտրյալներից', 'Убрано из избранного', 'Removed from wishlist'],
  cmpOn: ['Ավելացվեց համեմատման', 'Добавлено к сравнению', 'Added to compare'],
  cmpOff: ['Հեռացվեց համեմատումից', 'Убрано из сравнения', 'Removed from compare'],
  inCompare: ['Համեմատման մեջ՝', 'В сравнении:', 'In compare:'],
  pageN: ['էջ {n}', 'страница {n}', 'page {n}'],
  buyIn: ['գնել Երևանում', 'купить в Ереване', 'buy in Yerevan'],
  catDesc: ['{name} LED Computers-ում՝ {n} ապրանք առկա է։ Պաշտոնական երաշխիք, առաքում ամբողջ Հայաստանում, ապառիկ։',
    '{name} в LED Computers: {n} товаров в наличии. Официальная гарантия, доставка по Армении, рассрочка.',
    '{name} at LED Computers: {n} products in stock. Official warranty, delivery across Armenia, instalments.'],
  spScreen: ['Էկրան', 'Экран', 'Screen'],
  spCpu: ['Պրոցեսոր', 'Процессор', 'Processor'],
  spRam: ['Հիշողություն', 'Память', 'Memory'],
  spDisk: ['Կուտակիչ', 'Накопитель', 'Storage'],
  spGpu: ['Վիդեոքարտ', 'Видеокарта', 'Graphics'],
  spOs: ['ՕՀ', 'ОС', 'OS'],
  spSocket: ['Սոկետ', 'Сокет', 'Socket'],
  spOther: ['Բնութագիր', 'Характеристика', 'Feature'],
  spBrand: ['Բրենդ', 'Бренд', 'Brand'],
  spCode: ['Կոդ', 'Код', 'Code'],
  addCart: ['Ավելացնել զամբյուղ', 'В корзину', 'Add to cart'],
  callOrder: ['Պատվիրել զանգով', 'Заказать по телефону', 'Order by phone'],
  toFav: ['Ընտրյալներ', 'В избранное', 'Wishlist'],
  inStockN: ['· {n} հատ պահեստում', '· {n} шт. на складе', '· {n} pcs in stock'],
  pkDelivery: ['Առաքում', 'Доставка', 'Delivery'],
  pkDeliveryT: ['Երևանում և ամբողջ Հայաստանում', 'По Еревану и всей Армении', 'In Yerevan and across Armenia'],
  pkPickup: ['Վերցնել խանութից', 'Самовывоз', 'Pick-up'],
  pkPickupT: ['Կիևյան 11‑34, 10:00–19:00', 'Киевяна 11‑34, 10:00–19:00', '11‑34 Kievyan St, 10:00–19:00'],
  pkWarranty: ['Պաշտոնական երաշխիք', 'Официальная гарантия', 'Official warranty'],
  pkWarrantyT: ['Արտադրողի երաշխիք', 'Гарантия производителя', 'Manufacturer warranty'],
  pkPay: ['Վճարում', 'Оплата', 'Payment'],
  pkPayT: ['Կանխիկ, քարտ, Idram, անկանխիկ, ապառիկ', 'Наличные, карта, Idram, безнал, рассрочка', 'Cash, card, Idram, bank transfer, instalments'],
  specsH: ['Բնութագրեր', 'Характеристики', 'Specifications'],
  descH: ['Նկարագրություն', 'Описание', 'Description'],
  similarH: ['Նմանատիպ ապրանքներ', 'Похожие товары', 'Similar products'],
  allSimilar: ['Ամբողջ բաժինը →', 'Весь раздел →', 'Whole category →'],
  spBarcode: ['Մոդելի կոդ', 'Артикул', 'Part number'],
  spWeight: ['Քաշ', 'Вес', 'Weight'],
  spUnit: ['Միավոր', 'Единица', 'Unit'],
  prodDesc: ['{name}՝ {price}, առկա է LED Computers-ում։ Պաշտոնական երաշխիք, առաքում Հայաստանում, ապառիկ։',
    '{name} — {price}, в наличии в LED Computers. Официальная гарантия, доставка по Армении, рассрочка.',
    '{name} — {price}, in stock at LED Computers. Official warranty, delivery across Armenia, instalments.'],
} satisfies Record<string, [string, string, string]>;

export type TKey = keyof typeof T;
const IDX: Record<Lang, number> = { hy: 0, ru: 1, en: 2 };
export const t = (lang: Lang, key: TKey, vars?: Record<string, string | number>) =>
  vars ? T[key][IDX[lang]].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : T[key][IDX[lang]];

/** Pages that are still static templates (Design/site) — they read the language from localStorage `led-lang`. */
export const STATIC = {
  credit: '/credit.html', about: '/about.html', buy: '/how-to-buy.html', order: '/how-to-order.html', track: '/track-order.html',
  pay: '/how-to-pay.html', delivery: '/delivery.html', warranty: '/warranty.html', exchange: '/exchange.html',
  contacts: '/contacts.html', login: '/login.html', account: '/account.html', compare: '/compare.html',
  favorites: '/favorites.html', cart: '/cart.html', search: '/search.html',
} as const;
