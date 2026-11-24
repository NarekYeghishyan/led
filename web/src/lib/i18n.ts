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
} satisfies Record<string, [string, string, string]>;

export type TKey = keyof typeof T;
const IDX: Record<Lang, number> = { hy: 0, ru: 1, en: 2 };
export const t = (lang: Lang, key: TKey) => T[key][IDX[lang]];

/** Pages that are still static templates (Design/site) — they read the language from localStorage `led-lang`. */
export const STATIC = {
  credit: '/credit.html', about: '/about.html', buy: '/how-to-buy.html', order: '/how-to-order.html', track: '/track-order.html',
  pay: '/how-to-pay.html', delivery: '/delivery.html', warranty: '/warranty.html', exchange: '/exchange.html',
  contacts: '/contacts.html', login: '/login.html', account: '/account.html', compare: '/compare.html',
  favorites: '/favorites.html', cart: '/cart.html', search: '/search.html',
} as const;
