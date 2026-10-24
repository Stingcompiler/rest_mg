/**
 * What Orderak's own page says (batch 67).
 *
 * Written to the Design Reference's landing rules (LANDING.md): a headline of
 * ten words at most that says what it does and for whom, short sentences, one
 * action repeated, and no claim without evidence. Every sentence here is
 * something the product was seen to do. There are no logos, counts,
 * testimonials, prices or «most popular» labels, because there is nothing yet
 * to back them; when there is, they are added here with their source.
 *
 * Both languages are written by hand, not translated by machine.
 */
import type { Locale } from '@/i18n';

/**
 * The page's one action. Until a WhatsApp number or a form is chosen it leads
 * to Sting Systems' own site, the same address the footer credits. Change it
 * here, in one place.
 */
export const PRODUCT_CONTACT = {
  href: 'https://stingdev.pro',
} as const;

export interface ProductFeature {
  id: 'till' | 'kitchen' | 'deliveries' | 'dashboard' | 'customers';
  title: string;
  body: string;
  /** Under /public, a screenshot of the product with sample data. */
  image: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductContent {
  nav: { features: string; how: string; faq: string };
  cta: string;
  switchLabel: string;
  hero: { headline: string; subhead: string; image: string; alt: string; width: number; height: number; exampleLabel: string };
  /** Things the product is, stated as facts: the only «evidence» the page has so far. */
  facts: string[];
  featuresTitle: string;
  features: ProductFeature[];
  shotsNote: string;
  howTitle: string;
  steps: { title: string; body: string }[];
  pricing: { title: string; body: string };
  faqTitle: string;
  faq: { q: string; a: string }[];
  closing: { title: string; body: string };
  footer: { poweredBy: string; rights: string };
}

const SHOT = { width: 1280 } as const;

export const PRODUCT_CONTENT: Record<Locale, ProductContent> = {
  ar: {
    nav: { features: 'المزايا', how: 'كيف يعمل', faq: 'أسئلة' },
    cta: 'تحدّث إلينا',
    switchLabel: 'English',
    hero: {
      headline: 'نظام طلبات وكاشير ومطبخ لمطعمك، يعمل حتى بلا إنترنت',
      subhead: 'يستقبل الطلبات من الموقع والكاشير ويرسلها إلى المطبخ. ويرصد المبيعات والذمم في مكان واحد.',
      image: '/orderak/till.webp',
      alt: 'شاشة الكاشير في اوردراك: ثلاثة أصناف في الفاتورة، والإجمالي، وزرا الدفع والإرسال للمطبخ',
      ...SHOT,
      height: 800,
      exampleLabel: 'شاهد صفحة مطعم حقيقية',
    },
    facts: ['يعمل من المتصفح بلا تثبيت', 'عربي وإنجليزي', 'ثيم فاتح وداكن', 'يعمل على الهاتف واللوحي', 'بالجنيه السوداني'],
    featuresTitle: 'ما يفعله في مطعمك',
    features: [
      {
        id: 'till',
        title: 'كاشير يعمل بلا إنترنت',
        body: 'تُحفظ كل فاتورة على الجهاز. وتُرسَل إلى الخادم تلقائيًا حين يعود الاتصال.',
        image: '/orderak/sync.webp',
        alt: 'شاشة بانتظار المزامنة: ثلاث فواتير محفوظة على الجهاز، لكل منها حد متقطع وشارة بانتظار الإرسال',
        ...SHOT,
        height: 450,
      },
      {
        id: 'kitchen',
        title: 'مطبخ يرى كل طلب',
        body: 'تصل التذكرة إلى شاشة المطبخ فورًا. وينتقل الطلب من الانتظار إلى التسليم بنقرة. وينبّه الصوت عند وصول طلب جديد.',
        image: '/orderak/kitchen.webp',
        alt: 'شاشة المطبخ الداكنة: تذاكر الطلبات بحالاتها، وزر لكل خطوة، وزمن الانتظار على كل تذكرة',
        ...SHOT,
        height: 800,
      },
      {
        id: 'deliveries',
        title: 'طلبات الموقع والتوصيل في مكان واحد',
        body: 'يطلب الزبون من صفحة مطعمك للتوصيل أو الاستلام. وتؤكد أنت الطلب وتتابعه حتى التسليم.',
        image: '/orderak/deliveries.webp',
        alt: 'شاشة طلبات التوصيل: بطاقات الطلبات بحالاتها، مع العنوان والملاحظات وزرا التأكيد والإلغاء',
        ...SHOT,
        height: 800,
      },
      {
        id: 'dashboard',
        title: 'أرقام واضحة لصاحب المطعم',
        body: 'الإيراد المحصَّل منفصل عن الآجل. وترى ما لم يكتمل بعد. وتقارن اليوم بالفترة السابقة.',
        image: '/orderak/dashboard.webp',
        alt: 'لوحة المدير: الإيراد المحصَّل وعدد الطلبات ومتوسط الفاتورة والذمم المفتوحة، وتوزيع طرق الدفع',
        ...SHOT,
        height: 800,
      },
      {
        id: 'customers',
        title: 'ذمم العملاء بكشف حساب',
        body: 'سجّل ما على كل عميل من دين. وسجّل السداد نقدًا أو بتحويل أو بمحفظة. ويحفظ كشف الحساب كل حركة.',
        image: '/orderak/customers.webp',
        alt: 'شاشة الذمم والعملاء: قائمة بالعملاء وما على كل واحد منهم، وزر كشف الحساب',
        ...SHOT,
        height: 590,
      },
    ],
    shotsNote: 'اللقطات من النظام نفسه، ببيانات تجريبية.',
    howTitle: 'من الإعداد إلى الأرقام',
    steps: [
      { title: 'ضع قائمتك', body: 'أضف الأصناف والفئات والأسعار.' },
      { title: 'استقبل الطلب', body: 'من الكاشير أو من صفحة مطعمك.' },
      { title: 'تابع أرقامك', body: 'المبيعات والذمم وسجل النشاط.' },
    ],
    pricing: {
      title: 'السعر حسب مطعمك',
      body: 'نعرف حجم مطعمك أولًا. ثم نعطيك سعرًا واضحًا.',
    },
    faqTitle: 'أسئلة يسألها أصحاب المطاعم',
    faq: [
      {
        q: 'هل يعمل بلا إنترنت؟',
        a: 'نعم. الكاشير يحفظ كل شيء على الجهاز ويرسله حين يعود الاتصال. أما طلبات الموقع فتحتاج إلى إنترنت.',
      },
      { q: 'هل أحتاج إلى تثبيت برنامج؟', a: 'لا. يعمل من المتصفح على الحاسوب واللوحي والهاتف.' },
      {
        q: 'هل يدخل الآجل في الإيراد؟',
        a: 'لا. يُسجَّل على العميل منفصلًا، ولا يُحسب إيرادًا محصَّلًا حتى يُسدَّد.',
      },
      {
        q: 'من يستطيع فعل ماذا؟',
        a: 'لكل شخص حساب بدور: مالك أو مدير أو كاشير أو مطبخ. ولكل دور شاشاته.',
      },
      {
        q: 'هل لزبائني صفحة للطلب؟',
        a: 'نعم. صفحة عامة بقائمتك وطلب للتوصيل أو الاستلام. ويمكنك إغلاق الطلب منها متى شئت.',
      },
      { q: 'كيف أبدأ؟', a: 'تواصل معنا، ونحدد معك ما يناسب مطعمك.' },
    ],
    closing: { title: 'هل تريد اوردراك في مطعمك؟', body: 'تواصل معنا، ونحدد معك الخطوة التالية.' },
    footer: { poweredBy: 'مدعوم من ستينج سيستم', rights: 'جميع الحقوق محفوظة' },
  },
  en: {
    nav: { features: 'Features', how: 'How it works', faq: 'Questions' },
    cta: 'Talk to us',
    switchLabel: 'عربي',
    hero: {
      headline: 'Orders, till and kitchen for your restaurant, even offline',
      subhead: 'It takes orders from your site and till, and sends them to the kitchen. Sales and credit stay together.',
      image: '/orderak/till.webp',
      alt: 'The Orderak till: three dishes on the bill, the total, and the pay and send-to-kitchen buttons',
      ...SHOT,
      height: 800,
      exampleLabel: 'See a real restaurant page',
    },
    facts: ['Runs in the browser, nothing to install', 'Arabic and English', 'Light and dark', 'Works on phone and tablet', 'In Sudanese pounds'],
    featuresTitle: 'What it does in your restaurant',
    features: [
      {
        id: 'till',
        title: 'A till that works offline',
        body: 'Every bill is saved on the device. It goes to the server by itself when the line returns.',
        image: '/orderak/sync.webp',
        alt: 'The waiting-to-sync screen: three bills saved on the device, each with a dashed line and a waiting badge',
        ...SHOT,
        height: 450,
      },
      {
        id: 'kitchen',
        title: 'A kitchen that sees every order',
        body: 'The ticket reaches the kitchen screen at once. An order moves from waiting to handed over with one tap. A sound tells the kitchen when a new one arrives.',
        image: '/orderak/kitchen.webp',
        alt: 'The dark kitchen screen: order tickets by state, a button for each step, and the waiting time on each',
        ...SHOT,
        height: 800,
      },
      {
        id: 'deliveries',
        title: 'Website and delivery orders together',
        body: 'Customers order from your restaurant page, for delivery or pickup. You confirm the order and follow it to the door.',
        image: '/orderak/deliveries.webp',
        alt: 'The delivery orders screen: order cards by state, with address, notes, and confirm and cancel buttons',
        ...SHOT,
        height: 800,
      },
      {
        id: 'dashboard',
        title: 'Clear numbers for the owner',
        body: 'Collected revenue is kept apart from credit. You see what is not complete yet. You compare today with the period before.',
        image: '/orderak/dashboard.webp',
        alt: 'The manager overview: collected revenue, orders, average bill and open credit, and the payment mix',
        ...SHOT,
        height: 800,
      },
      {
        id: 'customers',
        title: 'Customer credit, with statements',
        body: 'Record what each customer owes. Record repayment in cash, by transfer or by wallet. The statement keeps every entry.',
        image: '/orderak/customers.webp',
        alt: 'The credit and customers screen: a list of customers and what each owes, with a statement button',
        ...SHOT,
        height: 590,
      },
    ],
    shotsNote: 'Screenshots are of the product itself, with sample data.',
    howTitle: 'From set-up to numbers',
    steps: [
      { title: 'Set your menu', body: 'Add dishes, categories and prices.' },
      { title: 'Take the order', body: 'From the till or from your restaurant page.' },
      { title: 'Follow your numbers', body: 'Sales, credit and the activity log.' },
    ],
    pricing: {
      title: 'The price depends on your restaurant',
      body: 'We learn the size of your restaurant first. Then we give you a clear price.',
    },
    faqTitle: 'What restaurant owners ask',
    faq: [
      {
        q: 'Does it work offline?',
        a: 'Yes. The till saves everything on the device and sends it when the line returns. Website orders do need the internet.',
      },
      { q: 'Do I need to install anything?', a: 'No. It runs in the browser on a computer, a tablet or a phone.' },
      {
        q: 'Does credit count as revenue?',
        a: 'No. It is recorded against the customer, apart from revenue, and is not counted as collected until it is repaid.',
      },
      {
        q: 'Who can do what?',
        a: 'Everyone has an account with a role: owner, manager, cashier or kitchen. Each role has its own screens.',
      },
      {
        q: 'Do my customers get an ordering page?',
        a: 'Yes. A public page with your menu, and ordering for delivery or pickup. You can close ordering from it whenever you like.',
      },
      { q: 'How do I start?', a: 'Talk to us, and we will work out with you what suits your restaurant.' },
    ],
    closing: { title: 'Want Orderak in your restaurant?', body: 'Talk to us, and we will agree the next step with you.' },
    footer: { poweredBy: 'Powered by Sting Systems', rights: 'All rights reserved' },
  },
};
