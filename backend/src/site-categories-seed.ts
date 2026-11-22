/** Catalog tree of the static site (Design/site/index.html CAT) on 2026-11-22 — seed for site_categories. */
export interface SeedCat { slug: string; name: [string, string, string]; icon?: string; promo?: [string, string, string]; children?: SeedCat[] }

export const SITE_CATEGORIES_SEED: SeedCat[] = [
 {
  "icon": "tower",
  "name": [
   "Компьютеры",
   "Համակարգիչներ",
   "Computers"
  ],
  "promo": [
   "Игровые ПК со скидкой до 12%",
   "Խաղային համակարգիչներ՝ մինչև 12% զեղչով",
   "Gaming PCs up to 12% off"
  ],
  "children": [
   {
    "name": [
     "AIO",
     "AIO (Մոնոբլոկներ)",
     "AIO (All-in-ones)"
    ],
    "children": [],
    "slug": "aio-all-in-ones"
   },
   {
    "name": [
     "Mini-PC",
     "Mini-PC",
     "Mini-PC"
    ],
    "children": [],
    "slug": "mini-pc"
   },
   {
    "name": [
     "Для дома",
     "Տան համար",
     "Home"
    ],
    "children": [],
    "slug": "home"
   },
   {
    "name": [
     "Офисные",
     "Գրասենյակային",
     "Office"
    ],
    "children": [],
    "slug": "office"
   },
   {
    "name": [
     "Дизайнерские",
     "Դիզայներական",
     "Designer"
    ],
    "children": [],
    "slug": "designer"
   },
   {
    "name": [
     "Игровые",
     "Խաղային",
     "Gaming"
    ],
    "children": [],
    "slug": "gaming"
   },
   {
    "name": [
     "Для разработчиков",
     "Ծրագրավորողների համար",
     "For developers"
    ],
    "children": [],
    "slug": "for-developers"
   }
  ],
  "slug": "computers"
 },
 {
  "icon": "laptop",
  "name": [
   "Ноутбуки",
   "Նոութբուքեր",
   "Laptops"
  ],
  "promo": [
   "Ноутбуки для дома и работы",
   "Նոութբուքեր տան և աշխատանքի համար",
   "Laptops for home and work"
  ],
  "children": [
   {
    "name": [
     "Для дома",
     "Տան համար",
     "Home"
    ],
    "children": [],
    "slug": "home"
   },
   {
    "name": [
     "Офисные",
     "Գրասենյակային",
     "Office"
    ],
    "children": [],
    "slug": "office"
   },
   {
    "name": [
     "Игровые",
     "Խաղային",
     "Gaming"
    ],
    "children": [],
    "slug": "gaming"
   },
   {
    "name": [
     "Сумки",
     "Պայուսակներ",
     "Bags"
    ],
    "children": [],
    "slug": "bags"
   },
   {
    "name": [
     "Подставки и охладители",
     "Տակդիրներ և հովացուցիչներ",
     "Stands & coolers"
    ],
    "children": [],
    "slug": "stands-and-coolers"
   },
   {
    "name": [
     "Зарядные устройства",
     "Լիցքավորիչներ",
     "Chargers"
    ],
    "children": [],
    "slug": "chargers"
   },
   {
    "name": [
     "Блоки питания",
     "Սնուցման բլոկներ",
     "Power adapters"
    ],
    "children": [],
    "slug": "power-adapters"
   },
   {
    "name": [
     "Аккумуляторы",
     "Մարտկոցներ",
     "Batteries"
    ],
    "children": [],
    "slug": "batteries"
   }
  ],
  "slug": "laptops"
 },
 {
  "icon": "cpu",
  "name": [
   "Комплектующие",
   "Համալրող սարքեր",
   "Components"
  ],
  "promo": [
   "Соберите ПК в конфигураторе",
   "Հավաքեք համակարգիչը կոնֆիգուրատորում",
   "Build a PC in the configurator"
  ],
  "children": [
   {
    "name": [
     "Процессоры",
     "Պրոցեսորներ",
     "Processors"
    ],
    "children": [
     {
      "name": [
       "Сокет 1151/1151v2",
       "Սոկետ 1151/1151v2",
       "Socket 1151/1151v2"
      ],
      "slug": "socket-1151-1151v2"
     },
     {
      "name": [
       "Сокет 1200",
       "Սոկետ 1200",
       "Socket 1200"
      ],
      "slug": "socket-1200"
     },
     {
      "name": [
       "Сокет 1700",
       "Սոկետ 1700",
       "Socket 1700"
      ],
      "slug": "socket-1700"
     },
     {
      "name": [
       "Сокет AM4",
       "Սոկետ AM4",
       "Socket AM4"
      ],
      "slug": "socket-am4"
     },
     {
      "name": [
       "Сокет AM5",
       "Սոկետ AM5",
       "Socket AM5"
      ],
      "slug": "socket-am5"
     }
    ],
    "slug": "processors"
   },
   {
    "name": [
     "Материнские платы",
     "Մայրական սալիկներ",
     "Motherboards"
    ],
    "children": [
     {
      "name": [
       "Сокет 1151/1151v2",
       "Սոկետ 1151/1151v2",
       "Socket 1151/1151v2"
      ],
      "slug": "socket-1151-1151v2"
     },
     {
      "name": [
       "Сокет 1200",
       "Սոկետ 1200",
       "Socket 1200"
      ],
      "slug": "socket-1200"
     },
     {
      "name": [
       "Сокет 1700",
       "Սոկետ 1700",
       "Socket 1700"
      ],
      "slug": "socket-1700"
     },
     {
      "name": [
       "Сокет AM4",
       "Սոկետ AM4",
       "Socket AM4"
      ],
      "slug": "socket-am4"
     },
     {
      "name": [
       "Сокет AM5",
       "Սոկետ AM5",
       "Socket AM5"
      ],
      "slug": "socket-am5"
     }
    ],
    "slug": "motherboards"
   },
   {
    "name": [
     "Охлаждение",
     "Հովացում",
     "Cooling"
    ],
    "children": [
     {
      "name": [
       "Универсальные для процессоров",
       "Ունիվերսալ պրոցեսորների համար",
       "Universal CPU coolers"
      ],
      "slug": "universal-cpu-coolers"
     },
     {
      "name": [
       "Для процессоров сокет 1155/1156/K8",
       "Սոկետ 1155/1156/K8 պրոցեսորների համար",
       "For socket 1155/1156/K8 CPUs"
      ],
      "slug": "for-socket-1155-1156-k8-cpus"
     },
     {
      "name": [
       "Для корпусов",
       "Իրանների համար",
       "Case fans"
      ],
      "slug": "case-fans"
     },
     {
      "name": [
       "Для жестких дисков",
       "Կոշտ սկավառակների համար",
       "For hard drives"
      ],
      "slug": "for-hard-drives"
     },
     {
      "name": [
       "Термопаста",
       "Ջերմամածուկ",
       "Thermal paste"
      ],
      "slug": "thermal-paste"
     },
     {
      "name": [
       "Термопрокладки",
       "Ջերմատակդիրներ",
       "Thermal pads"
      ],
      "slug": "thermal-pads"
     },
     {
      "name": [
       "Для прочих устройств",
       "Այլ սարքերի համար",
       "For other devices"
      ],
      "slug": "for-other-devices"
     }
    ],
    "slug": "cooling"
   },
   {
    "name": [
     "Модули памяти",
     "Հիշողության մոդուլներ",
     "Memory modules"
    ],
    "children": [
     {
      "name": [
       "Для ПК",
       "Համակարգչի համար",
       "For PC"
      ],
      "slug": "for-pc"
     },
     {
      "name": [
       "Для ноутбуков",
       "Նոութբուքի համար",
       "For laptops"
      ],
      "slug": "for-laptops"
     },
     {
      "name": [
       "Для серверов",
       "Սերվերների համար",
       "For servers"
      ],
      "slug": "for-servers"
     }
    ],
    "slug": "memory-modules"
   },
   {
    "name": [
     "Накопители SSD",
     "SSD կրիչներ",
     "SSD drives"
    ],
    "children": [
     {
      "name": [
       "2.5″",
       "2.5″",
       "2.5″"
      ],
      "slug": "25"
     },
     {
      "name": [
       "1.8″",
       "1.8″",
       "1.8″"
      ],
      "slug": "18"
     },
     {
      "name": [
       "M.2",
       "M.2",
       "M.2"
      ],
      "slug": "m2"
     },
     {
      "name": [
       "SSD карты",
       "SSD քարտեր",
       "SSD cards"
      ],
      "slug": "ssd-cards"
     },
     {
      "name": [
       "Аксессуары для SSD",
       "SSD աքսեսուարներ",
       "SSD accessories"
      ],
      "slug": "ssd-accessories"
     },
     {
      "name": [
       "Прочие",
       "Այլ",
       "Other"
      ],
      "slug": "other"
     }
    ],
    "slug": "ssd-drives"
   },
   {
    "name": [
     "Жесткие диски",
     "Կոշտ սկավառակներ",
     "Hard drives"
    ],
    "children": [
     {
      "name": [
       "Для ПК SATA 3.5″",
       "Համակարգչի համար SATA 3.5″",
       "PC SATA 3.5″"
      ],
      "slug": "pc-sata-35"
     },
     {
      "name": [
       "Внешний корпус",
       "Արտաքին իրան",
       "External enclosure"
      ],
      "slug": "external-enclosure"
     },
     {
      "name": [
       "Для ноутбуков SATA 2.5″",
       "Նոութբուքի համար SATA 2.5″",
       "Laptop SATA 2.5″"
      ],
      "slug": "laptop-sata-25"
     },
     {
      "name": [
       "Внешние USB",
       "Արտաքին USB",
       "External USB"
      ],
      "slug": "external-usb"
     },
     {
      "name": [
       "Прочие",
       "Այլ",
       "Other"
      ],
      "slug": "other"
     }
    ],
    "slug": "hard-drives"
   },
   {
    "name": [
     "Дисководы",
     "Սկավառակակիրներ",
     "Optical drives"
    ],
    "children": [
     {
      "name": [
       "Для ПК",
       "Համակարգչի համար",
       "For PC"
      ],
      "slug": "for-pc"
     },
     {
      "name": [
       "Для ноутбуков",
       "Նոութբուքի համար",
       "For laptops"
      ],
      "slug": "for-laptops"
     },
     {
      "name": [
       "Внешние",
       "Արտաքին",
       "External"
      ],
      "slug": "external"
     }
    ],
    "slug": "optical-drives"
   },
   {
    "name": [
     "Звуковые карты",
     "Ձայնային քարտեր",
     "Sound cards"
    ],
    "children": [
     {
      "name": [
       "PCI-E",
       "PCI-E",
       "PCI-E"
      ],
      "slug": "pci-e"
     },
     {
      "name": [
       "PCI",
       "PCI",
       "PCI"
      ],
      "slug": "pci"
     },
     {
      "name": [
       "USB",
       "USB",
       "USB"
      ],
      "slug": "usb"
     },
     {
      "name": [
       "Аксессуары для звуковых карт",
       "Ձայնային քարտերի աքսեսուարներ",
       "Sound card accessories"
      ],
      "slug": "sound-card-accessories"
     },
     {
      "name": [
       "Любительские",
       "Սիրողական",
       "Amateur"
      ],
      "slug": "amateur"
     },
     {
      "name": [
       "Профессиональные",
       "Պրոֆեսիոնալ",
       "Professional"
      ],
      "slug": "professional"
     }
    ],
    "slug": "sound-cards"
   },
   {
    "name": [
     "Видеокарты",
     "Վիդեոքարտեր",
     "Graphics cards"
    ],
    "children": [
     {
      "name": [
       "Обычные",
       "Սովորական",
       "Standard"
      ],
      "slug": "standard"
     },
     {
      "name": [
       "Игровые",
       "Խաղային",
       "Gaming"
      ],
      "slug": "gaming"
     }
    ],
    "slug": "graphics-cards"
   },
   {
    "name": [
     "Блоки питания",
     "Սնուցման բլոկներ",
     "Power supplies"
    ],
    "children": [
     {
      "name": [
       "ATX",
       "ATX",
       "ATX"
      ],
      "slug": "atx"
     },
     {
      "name": [
       "SFX",
       "SFX",
       "SFX"
      ],
      "slug": "sfx"
     },
     {
      "name": [
       "TFX",
       "TFX",
       "TFX"
      ],
      "slug": "tfx"
     },
     {
      "name": [
       "Flex ATX",
       "Flex ATX",
       "Flex ATX"
      ],
      "slug": "flex-atx"
     },
     {
      "name": [
       "MINING",
       "MINING",
       "MINING"
      ],
      "slug": "mining"
     },
     {
      "name": [
       "Игровые",
       "Խաղային",
       "Gaming"
      ],
      "slug": "gaming"
     },
     {
      "name": [
       "Серверные",
       "Սերվերային",
       "Server"
      ],
      "slug": "server"
     }
    ],
    "slug": "power-supplies"
   },
   {
    "name": [
     "Корпуса",
     "Իրաններ",
     "Cases"
    ],
    "children": [
     {
      "name": [
       "Mini ATX",
       "Mini ATX",
       "Mini ATX"
      ],
      "slug": "mini-atx"
     },
     {
      "name": [
       "Mini ITX",
       "Mini ITX",
       "Mini ITX"
      ],
      "slug": "mini-itx"
     },
     {
      "name": [
       "ATX",
       "ATX",
       "ATX"
      ],
      "slug": "atx"
     },
     {
      "name": [
       "Аксессуары для корпусов",
       "Իրանների աքսեսուարներ",
       "Case accessories"
      ],
      "slug": "case-accessories"
     },
     {
      "name": [
       "Прочие",
       "Այլ",
       "Other"
      ],
      "slug": "other"
     },
     {
      "name": [
       "Обычные",
       "Սովորական",
       "Standard"
      ],
      "slug": "standard"
     },
     {
      "name": [
       "Игровые",
       "Խաղային",
       "Gaming"
      ],
      "slug": "gaming"
     },
     {
      "name": [
       "Серверные",
       "Սերվերային",
       "Server"
      ],
      "slug": "server"
     }
    ],
    "slug": "cases"
   },
   {
    "name": [
     "Контроллеры",
     "Կոնտրոլերներ",
     "Controllers"
    ],
    "children": [
     {
      "name": [
       "Bluetooth",
       "Bluetooth",
       "Bluetooth"
      ],
      "slug": "bluetooth"
     },
     {
      "name": [
       "USB/COM/LPT",
       "USB/COM/LPT",
       "USB/COM/LPT"
      ],
      "slug": "usb-com-lpt"
     },
     {
      "name": [
       "IDE/SATA/SCSI",
       "IDE/SATA/SCSI",
       "IDE/SATA/SCSI"
      ],
      "slug": "ide-sata-scsi"
     }
    ],
    "slug": "controllers"
   },
   {
    "name": [
     "ТВ-тюнеры",
     "TV թյուներներ",
     "TV tuners"
    ],
    "children": [
     {
      "name": [
       "Цифровые",
       "Թվային",
       "Digital"
      ],
      "slug": "digital"
     },
     {
      "name": [
       "Аналоговые",
       "Անալոգային",
       "Analog"
      ],
      "slug": "analog"
     }
    ],
    "slug": "tv-tuners"
   }
  ],
  "slug": "components"
 },
 {
  "icon": "monitor",
  "name": [
   "Периферия",
   "Համալրող պարագաներ",
   "Peripherals"
  ],
  "promo": [
   "Мониторы 165 Гц для игр и работы",
   "165 Հց մոնիտորներ խաղի և աշխատանքի համար",
   "165 Hz monitors for work and play"
  ],
  "children": [
   {
    "name": [
     "Мониторы",
     "Մոնիտորներ",
     "Monitors"
    ],
    "children": [],
    "slug": "monitors"
   },
   {
    "name": [
     "Телевизоры",
     "Հեռուստացույցներ",
     "TVs"
    ],
    "children": [],
    "slug": "tvs"
   },
   {
    "name": [
     "Проекторы и экраны",
     "Պրոյեկտորներ և էկրաններ",
     "Projectors & screens"
    ],
    "children": [],
    "slug": "projectors-and-screens"
   },
   {
    "name": [
     "Принтеры и сканеры",
     "Տպիչներ և սկաներներ",
     "Printers & scanners"
    ],
    "children": [],
    "slug": "printers-and-scanners"
   },
   {
    "name": [
     "ИБП и питание",
     "ԱԱՍ և սնուցում",
     "UPS & power"
    ],
    "children": [],
    "slug": "ups-and-power"
   },
   {
    "name": [
     "Программное обеспечение",
     "Ծրագրային ապահովում",
     "Software"
    ],
    "children": [],
    "slug": "software"
   },
   {
    "name": [
     "Офисная мебель",
     "Գրասենյակային կահույք",
     "Office furniture"
    ],
    "children": [],
    "slug": "office-furniture"
   },
   {
    "name": [
     "POS-оборудование",
     "POS սարքավորումներ",
     "POS equipment"
    ],
    "children": [],
    "slug": "pos-equipment"
   },
   {
    "name": [
     "Видеонаблюдение",
     "Տեսահսկում",
     "Video surveillance"
    ],
    "children": [],
    "slug": "video-surveillance"
   },
   {
    "name": [
     "Графические планшеты",
     "Գրաֆիկական պլանշետներ",
     "Drawing tablets"
    ],
    "children": [],
    "slug": "drawing-tablets"
   },
   {
    "name": [
     "Планшеты",
     "Պլանշետներ",
     "Tablets"
    ],
    "children": [
     {
      "name": [
       "Планшеты",
       "Պլանշետներ",
       "Tablets"
      ],
      "slug": "tablets"
     },
     {
      "name": [
       "Планшеты для рисования",
       "Նկարչական պլանշետներ",
       "Drawing tablets"
      ],
      "slug": "drawing-tablets"
     },
     {
      "name": [
       "Аксессуары для планшетов",
       "Պլանշետի աքսեսուարներ",
       "Tablet accessories"
      ],
      "slug": "tablet-accessories"
     }
    ],
    "slug": "tablets"
   },
   {
    "name": [
     "Смартфоны",
     "Սմարթֆոններ",
     "Smartphones"
    ],
    "children": [
     {
      "name": [
       "Смартфоны",
       "Սմարթֆոններ",
       "Smartphones"
      ],
      "slug": "smartphones"
     },
     {
      "name": [
       "Телефоны",
       "Հեռախոսներ",
       "Phones"
      ],
      "slug": "phones"
     },
     {
      "name": [
       "Аксессуары для смартфонов",
       "Սմարթֆոնի աքսեսուարներ",
       "Smartphone accessories"
      ],
      "slug": "smartphone-accessories"
     }
    ],
    "slug": "smartphones"
   },
   {
    "name": [
     "Гаджеты",
     "Գաջեթներ",
     "Gadgets"
    ],
    "children": [
     {
      "name": [
       "Смарт-часы",
       "Խելացի ժամացույցներ",
       "Smartwatches"
      ],
      "slug": "smartwatches"
     },
     {
      "name": [
       "Цифровые браслеты",
       "Թվային ապարանջաններ",
       "Fitness bands"
      ],
      "slug": "fitness-bands"
     },
     {
      "name": [
       "Аксессуары для гаджетов",
       "Գաջեթների աքսեսուարներ",
       "Gadget accessories"
      ],
      "slug": "gadget-accessories"
     }
    ],
    "slug": "gadgets"
   }
  ],
  "slug": "peripherals"
 },
 {
  "icon": "head",
  "name": [
   "Аксессуары",
   "Աքսեսուարներ",
   "Accessories"
  ],
  "promo": [
   "Игровые периферия и аксессуары",
   "Խաղային աքսեսուարներ",
   "Gaming gear and accessories"
  ],
  "children": [
   {
    "name": [
     "Клавиатуры",
     "Ստեղնաշարեր",
     "Keyboards"
    ],
    "children": [
     {
      "name": [
       "Обычные проводные",
       "Սովորական լարային",
       "Wired"
      ],
      "slug": "wired"
     },
     {
      "name": [
       "Обычные беспроводные",
       "Սովորական անլար",
       "Wireless"
      ],
      "slug": "wireless"
     },
     {
      "name": [
       "Игровые",
       "Խաղային",
       "Gaming"
      ],
      "slug": "gaming"
     },
     {
      "name": [
       "Комплекты (Клавиатура+мышь)",
       "Հավաքածուներ (ստեղնաշար+մկնիկ)",
       "Keyboard + mouse sets"
      ],
      "slug": "keyboard-mouse-sets"
     },
     {
      "name": [
       "Прочие",
       "Այլ",
       "Other"
      ],
      "slug": "other"
     }
    ],
    "slug": "keyboards"
   },
   {
    "name": [
     "Мышки",
     "Մկնիկներ",
     "Mice"
    ],
    "children": [
     {
      "name": [
       "Обычные",
       "Սովորական",
       "Standard"
      ],
      "slug": "standard"
     },
     {
      "name": [
       "Игровые",
       "Խաղային",
       "Gaming"
      ],
      "slug": "gaming"
     },
     {
      "name": [
       "Коврики",
       "Գորգիկներ",
       "Mouse pads"
      ],
      "slug": "mouse-pads"
     }
    ],
    "slug": "mice"
   },
   {
    "name": [
     "Колонки",
     "Բարձրախոսներ",
     "Speakers"
    ],
    "children": [
     {
      "name": [
       "2.0",
       "2.0",
       "2.0"
      ],
      "slug": "20"
     },
     {
      "name": [
       "2.1",
       "2.1",
       "2.1"
      ],
      "slug": "21"
     },
     {
      "name": [
       "5.1",
       "5.1",
       "5.1"
      ],
      "slug": "51"
     },
     {
      "name": [
       "7.1",
       "7.1",
       "7.1"
      ],
      "slug": "71"
     }
    ],
    "slug": "speakers"
   },
   {
    "name": [
     "Карты памяти и флешки",
     "Հիշողության քարտեր և ֆլեշներ",
     "Memory cards & USB drives"
    ],
    "children": [
     {
      "name": [
       "USB флэшки",
       "USB ֆլեշներ",
       "USB flash drives"
      ],
      "slug": "usb-flash-drives"
     },
     {
      "name": [
       "Карты памяти SD/Mini SD/Micro SD",
       "SD/Mini SD/Micro SD քարտեր",
       "SD/Mini SD/Micro SD cards"
      ],
      "slug": "sd-mini-sd-micro-sd-cards"
     }
    ],
    "slug": "memory-cards-and-usb-drives"
   },
   {
    "name": [
     "Наушники и микрофоны",
     "Ականջակալներ և խոսափողներ",
     "Headphones & mics"
    ],
    "children": [
     {
      "name": [
       "Наушники",
       "Ականջակալներ",
       "Headphones"
      ],
      "slug": "headphones"
     },
     {
      "name": [
       "Микрофоны",
       "Խոսափողներ",
       "Microphones"
      ],
      "slug": "microphones"
     }
    ],
    "slug": "headphones-and-mics"
   },
   {
    "name": [
     "Карт ридеры и хабы",
     "Քարտ-ընթերցիչներ և հաբեր",
     "Card readers & hubs"
    ],
    "children": [
     {
      "name": [
       "Внутренние",
       "Ներքին",
       "Internal"
      ],
      "slug": "internal"
     },
     {
      "name": [
       "Внешние",
       "Արտաքին",
       "External"
      ],
      "slug": "external"
     },
     {
      "name": [
       "USB Хабы",
       "USB հաբեր",
       "USB hubs"
      ],
      "slug": "usb-hubs"
     }
    ],
    "slug": "card-readers-and-hubs"
   },
   {
    "name": [
     "Манипуляторы",
     "Մանիպուլյատորներ",
     "Controllers"
    ],
    "children": [
     {
      "name": [
       "Презентеры",
       "Պրեզենտերներ",
       "Presenters"
      ],
      "slug": "presenters"
     },
     {
      "name": [
       "Аксессуары",
       "Աքսեսուարներ",
       "Accessories"
      ],
      "slug": "accessories"
     },
     {
      "name": [
       "Джойстики",
       "Ջոյստիկներ",
       "Joysticks"
      ],
      "slug": "joysticks"
     },
     {
      "name": [
       "Рули",
       "Ղեկեր",
       "Wheels"
      ],
      "slug": "wheels"
     }
    ],
    "slug": "controllers"
   },
   {
    "name": [
     "Веб камеры",
     "Վեբ-տեսախցիկներ",
     "Webcams"
    ],
    "children": [],
    "slug": "webcams"
   },
   {
    "name": [
     "Внешние корпуса",
     "Արտաքին իրաններ",
     "External enclosures"
    ],
    "children": [],
    "slug": "external-enclosures"
   },
   {
    "name": [
     "Кабели и переходники",
     "Մալուխներ և ադապտերներ",
     "Cables & adapters"
    ],
    "children": [
     {
      "name": [
       "Кабельный ввод",
       "Մալուխային մուտք",
       "Cable entry"
      ],
      "slug": "cable-entry"
     },
     {
      "name": [
       "Кабели",
       "Մալուխներ",
       "Cables"
      ],
      "slug": "cables"
     },
     {
      "name": [
       "Переходники",
       "Ադապտերներ",
       "Adapters"
      ],
      "slug": "adapters"
     }
    ],
    "slug": "cables-and-adapters"
   },
   {
    "name": [
     "Разное",
     "Այլ",
     "Miscellaneous"
    ],
    "children": [
     {
      "name": [
       "Док-станция",
       "Դոկ-կայան",
       "Docking stations"
      ],
      "slug": "docking-stations"
     },
     {
      "name": [
       "Чистящие средства",
       "Մաքրող միջոցներ",
       "Cleaning supplies"
      ],
      "slug": "cleaning-supplies"
     }
    ],
    "slug": "miscellaneous"
   }
  ],
  "slug": "accessories"
 },
 {
  "icon": "wifi",
  "name": [
   "Сетевое оборудование",
   "Ցանցային սարքավորումներ",
   "Network equipment"
  ],
  "promo": [
   "Wi-Fi 6 для дома и офиса",
   "Wi-Fi 6 տան և գրասենյակի համար",
   "Wi-Fi 6 for home and office"
  ],
  "children": [
   {
    "name": [
     "Сетевое оборудование",
     "Ցանցային սարքավորումներ",
     "Network equipment"
    ],
    "children": [
     {
      "name": [
       "Сетевые кабели UTP/FTP",
       "UTP/FTP ցանցային մալուխներ",
       "UTP/FTP network cables"
      ],
      "slug": "utp-ftp-network-cables"
     },
     {
      "name": [
       "Коммутаторы",
       "Կոմուտատորներ",
       "Switches"
      ],
      "slug": "switches"
     },
     {
      "name": [
       "Точки доступа",
       "Մուտքի կետեր",
       "Access points"
      ],
      "slug": "access-points"
     },
     {
      "name": [
       "Роутеры",
       "Ռաութերներ",
       "Routers"
      ],
      "slug": "routers"
     },
     {
      "name": [
       "Wifi усилители",
       "Wi-Fi ուժեղացուցիչներ",
       "Wi-Fi extenders"
      ],
      "slug": "wi-fi-extenders"
     },
     {
      "name": [
       "Принт-серверы",
       "Տպման սերվերներ",
       "Print servers"
      ],
      "slug": "print-servers"
     },
     {
      "name": [
       "Сетевые антенны",
       "Ցանցային ալեհավաքներ",
       "Network antennas"
      ],
      "slug": "network-antennas"
     },
     {
      "name": [
       "Трансиверы",
       "Տրանսիվերներ",
       "Transceivers"
      ],
      "slug": "transceivers"
     },
     {
      "name": [
       "Сетевые экраны",
       "Ցանցային էկրաններ",
       "Firewalls"
      ],
      "slug": "firewalls"
     },
     {
      "name": [
       "VOIP оборудование",
       "VoIP սարքավորումներ",
       "VoIP equipment"
      ],
      "slug": "voip-equipment"
     },
     {
      "name": [
       "Медиа-конвертеры",
       "Մեդիափոխարկիչներ",
       "Media converters"
      ],
      "slug": "media-converters"
     },
     {
      "name": [
       "Сетевые инструменты",
       "Ցանցային գործիքներ",
       "Network tools"
      ],
      "slug": "network-tools"
     },
     {
      "name": [
       "Коннекторы",
       "Միակցիչներ",
       "Connectors"
      ],
      "slug": "connectors"
     },
     {
      "name": [
       "Сетевые карты",
       "Ցանցային քարտեր",
       "Network cards"
      ],
      "slug": "network-cards"
     },
     {
      "name": [
       "Прочее",
       "Այլ",
       "Other"
      ],
      "slug": "other"
     }
    ],
    "slug": "network-equipment"
   }
  ],
  "slug": "network-equipment"
 }
];
