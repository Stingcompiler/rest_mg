# أدلة المراجعة

المستودع: https://github.com/Stingcompiler/rest_mg — النسخة `0c87bc0b1c272d4622fcdaface113dd9f105ac0e`، المراجعة بتاريخ ٢ أكتوبر ٢٠٢٦.

## البيئة والنتائج

استُخدمت قاعدة PostgreSQL 16 تجريبية على المنفذ 55439، وPython 3.12.14 داخل virtualenv منفصل. فشل تثبيت الاعتماديات المقيدة على Python 3.14 بسبب توفر إصدار psycopg-binary المقيد؛ لذلك استُخدمت بيئة متوافقة دون تغيير requirements. بيئة الواجهة Node محلية، ونسخ الحزم من package-lock بعد npm ci. واجهة Next صدّرت إلى web/out وخدمها Django محليًا. بيانات المطعم والموظفين والطلبات المعروضة وهمية أنشئت للمراجعة.

| الفحص | النتيجة | السجل |
|---|---|---|
| npm run typecheck | ناجح | [typecheck](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/typecheck.log) |
| npm run guardrails | ناجح، دون تحذيرات lint | [lint](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/lint.log) |
| npm test | ٢٥ ملفًا، ١٩٨ اختبارًا ناجحًا | [web-tests](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/web-tests.log) |
| npm run build | ناجح، static export | [build](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/build.log) |
| Django tests بعد بناء الواجهة | ١٩٢ اختبارًا ناجحًا على PostgreSQL | [api-tests](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/api-tests-after-build.log) |
| اختبارات التدقيق الأولى | ١٠ حالات: ٩ توقعات لم تتحقق، وملاحظة تشغيلية واحدة | [api-probes](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/api-probes.log) |
| تدقيق التسوية والوسائط | توقعان لم يتحققا | [finance-probes](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/finance-probes.log) |
| سباق المزامنة | التوقع لم يتحقق: التحديث الأحدث حُذف من الطابور | [race-probe](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/logs/race-probe.log) |

بعض توقعات التدقيق تعبّر عن سياسة مقترحة، مثل انتظار تأكيد موظف الصالة قبل التحضير، وليست قواعد عالمية لكل مطعم. كذلك إرسال طلبين متطابقين قد يكون مقصودًا؛ اختبار التكرار يكشف غياب وسيلة لتمييز إعادة محاولة نفس الطلب عن طلب جديد. لا تساوي أعداد التوقعات الفاشلة عدد ثغرات مستقلة.

اختبار معرض الواجهة في Django يحتاج web/out؛ قبل البناء فشلت حالة واحدة لغيابه، وبعد البناء نجحت المجموعة كلها. لم تُغيّر اختبارات المشروع الأصلية. اختبار السباق المؤقت أزيل من src بعد حفظه هنا بصيغة txt.

## إعادة إنتاج الاختبارات الإضافية

ابدأ PostgreSQL تجريبيًا واضبط DATABASE_URL الفعلي. الأوامر التالية تُنفذ من api بعد تثبيت requirements في Python متوافق، وتستخدم Django test لإنشاء قاعدة اختبارات مؤقتة؛ لا تشغّلها على قاعدة إنتاج.

```sh
PYTHONPATH=../docs/review-evidence DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test rest_mg_review_probes rest_mg_review_finance --noinput --verbosity 2
```

مصدر الاختبارات: [التحقق من العزل ودورة الطلب](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/rest_mg_review_probes.py)، [التسوية ونوع الوسائط](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/rest_mg_review_finance.py).

لتكرار سباق المزامنة، انسخ محتوى [outbox-race.test.ts.txt](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/outbox-race.test.ts.txt) مؤقتًا إلى web/src/sync/__tests__/review-race.test.ts، ثم شغّل من web:

```sh
npm test -- src/sync/__tests__/review-race.test.ts
```

احذف النسخة المؤقتة بعد التحقق. الاختبار يحجز رد النقل، ويعدّل الطلب أثناء انتظار الرد، ثم يثبت أن طابور المزامنة يجب أن يحتفظ بالتحديث الأحدث.

## أدلة التوقيت والتباين

استُدعي periodRange بنفس اللحظة مع TZ=UTC وTZ=Africa/Khartoum بعد تجميع web/src/features/manager/period.ts إلى CommonJS باستخدام esbuild وalias @ إلى web/src. [النتائج](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/timezone-results.json) تثبت اختلاف حدود اليوم بساعتين بحسب بيئة المتصفح، رغم أن تاريخ اليوم يُحسب أولًا بتوقيت الخرطوم.

[لوحات الألوان](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/design-palettes.svg) تصور اقتراحين للهوية، ولم تُطبّق على المنتج. [حساب التباين](/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/palette-contrast.json) يستخدم luminance وفق صيغة WCAG للألوان الصلبة؛ لا يثبت تباين نص فوق صورة أو كل الحالات التفاعلية.

## لقطات الفحص

| اللقطة | ما توثقه |
|---|---|
| landing-desktop.png / landing-mobile.png | صفحة العميل، دون شعار أو صور في البيانات التجريبية |
| cart-mobile.png / order-confirmation-mobile.png | السلة ونهاية إرسال طلب الموقع |
| pos-mobile-initial.png | ظهور منيو تجريبي تلقائيًا قبل تحديث الشاشة |
| pos-mobile-cart.png / pos-mobile-sheet.png | منيو الخادم بعد إعادة التحميل مع بقاء فئات تجريبية؛ ملاحظات وتقسيم حساب معطلان |
| payment-bank-mobile.png | تسجيل تحويل ومرجع مولد آليًا |
| shift-with-open-order.png | شاشة الإغلاق مع بقاء طلب في الكاشير؛ قابلية الإغلاق تحققت أيضًا من DOM |
| shift-surplus-no-reason.png | زيادة نقدية تمنع الإغلاق وتطلب سببًا دون حقل لإدخاله |
| manager-desktop.png / manager-dark.png | الوضعان الفاتح والداكن وملخص إيراد الطلب المغلق مقابل الطلب العام غير المحصل |
| profile-editor.png | حدود التخصيص الفعلية من الإدارة |
| kitchen-desktop.png / deliveries-desktop.png | وصول الطلب العام للمطبخ والتوصيل |
| pos-tablet.png | تجاوز السعر حدود بطاقة الصنف عند 1024×768 |

مسار اللقطات: `/Users/macbookairm1/Desktop/rest_mg/docs/review-evidence/screenshots/`.

قياس DOM لبطاقة «عصيدة بالتقلية» في التابلت: ارتفاع البطاقة 112px، حدها السفلي y=258، والحد السفلي للسعر y=278.19؛ أي تجاوز يقارب 20px. عُرضت الشاشات أيضًا عند 390×844 و1280×800، وعُرضت الصفحة العامة عند 1280×720. تغيير اللغة إلى الإنجليزية أعاد عناوين الإدارة بشكل صحيح؛ بيانات المنيو وصفحة العميل تحتاج معالجة منفصلة.

## حدود الأدلة

لا توجد بيانات عملاء حقيقية أو معاملات دفع خارجية في هذه الأدلة. لم تُجرَ اختبارات تحميل أو اختراق شاملة، أو اختبار جهازين فعليين أو طابعة حرارية أو بوابة دفع أو انقطاع كهرباء. سلوك التخزين والطابور اختُبر برمجيًا؛ إقلاع PWA دون شبكة عبر جميع المسارات وتحديث إصدارها على أجهزة حقيقية لم يُعتمد. لا تتضمن المراجعة تدقيقًا قانونيًا أو ضريبيًا أو مسحًا ميدانيًا لسوق المطاعم.
