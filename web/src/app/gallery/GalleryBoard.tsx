/* eslint-disable sudan-pos/no-raw-strings -- dev-only component gallery; labels
   are developer-facing scaffolding, not product copy. */
'use client';

/**
 * The component gallery. Renders the whole library so every piece can be seen in
 * both themes and both directions at once — the phase-6 "done when". Not part of
 * the product; a bench for looking at the design system.
 */
import { useState } from 'react';
import { Search, ArrowLeft, TriangleAlert, LayoutGrid, ListOrdered, Utensils } from 'lucide-react';

import {
  AmountRow,
  Badge,
  BarChart,
  Button,
  CalloutPanel,
  CartAction,
  CartActionBar,
  CartLine,
  CartTabs,
  CategoryTab,
  ConfirmDialog,
  CountBadge,
  DenominationRow,
  Divider,
  EmptyState,
  ErrorState,
  FavouriteChip,
  IconButton,
  Keypad,
  KpiCard,
  KpiStrip,
  LoadingList,
  MenuItemCard,
  MenuManagementRow,
  NavRail,
  NavRailItem,
  Numeric,
  OrderCard,
  PaymentMethodCard,
  ProgressBar,
  QtyStepper,
  QuickCashButton,
  RailStatus,
  SearchField,
  SegmentedControl,
  StackedShareBar,
  StatusChip,
  TextField,
  Toggle,
  TotalsBlock,
} from '@/components';
import { AppHeader } from '@/components/layout/layout';

const KEYPAD = ['٧', '٨', '٩', '٤', '٥', '٦', '١', '٢', '٣', '٠', '٠٠٠', '⌫'].map((k) => ({
  label: k,
  value: k,
}));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-12">
      <h3 className="text-la-sm font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <div className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-12">{children}</div>;
}

function Board() {
  const [seg, setSeg] = useState('dine_in');
  const [toggle, setToggle] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const qty = (
    <QtyStepper qty="٢" decrementLabel="less" incrementLabel="more" />
  );

  return (
    <div className="flex flex-col gap-24 bg-bg p-24 text-text">
      <AppHeader
        title="مطعم وسام الشام"
        trailing={
          <>
            <StatusChip label="غير متصل" tone="warning" dot />
            <StatusChip label="بانتظار المزامنة" tone="neutral" count="١٢" />
            <Numeric className="text-num-base">14:32</Numeric>
          </>
        }
        leading={<IconButton label="back"><ArrowLeft size={22} /></IconButton>}
      />

      <div className="flex gap-24">
        <NavRail footer={<RailStatus label="غير متصل" />}>
          <NavRailItem icon={<LayoutGrid size={24} />} label="الطلب" active />
          <NavRailItem icon={<ListOrdered size={24} />} label="الطلبات" />
          <NavRailItem icon={<Utensils size={24} />} label="القائمة" />
        </NavRail>

        <div className="flex flex-1 flex-col gap-24">
          <Section title="Buttons">
            <Row>
              <Button variant="primary">دفع</Button>
              <Button variant="secondary">إرسال للمطبخ</Button>
              <Button variant="danger">إلغاء الطلب</Button>
              <Button variant="credit">آجل — ذمم</Button>
              <Button variant="accentOutline">طباعة</Button>
              <Button variant="primary" disabled>
                دفع
              </Button>
            </Row>
          </Section>

          <Section title="Inputs & controls">
            <div className="flex flex-col gap-12">
              <TextField label="اسم الصنف" placeholder="كبدة إسكندراني" />
              <TextField label="السعر" error="السعر مطلوب" defaultValue="غير صحيح" />
              <Row>
                <SegmentedControl
                  ariaLabel="order type"
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: 'dine_in', label: 'صالة' },
                    { value: 'takeaway', label: 'سفري' },
                    { value: 'delivery', label: 'توصيل' },
                  ]}
                />
                <Toggle checked={toggle} onChange={setToggle} label="availability" />
                <SearchField icon={<Search size={20} />} placeholder="ابحث عن صنف…" />
              </Row>
            </div>
          </Section>

          <Section title="Indicators">
            <Row>
              <StatusChip label="مُزامن" tone="success" dot />
              <StatusChip label="غير مُزامن" tone="warning" dot />
              <Badge label="مُزامن" tone="success" />
              <Badge label="غير مُزامن" tone="warning" />
              <CountBadge count="٢" />
            </Row>
            <ProgressBar percent={75} />
            <ProgressBar percent={40} tone="warning" size="thin" />
            <Divider />
          </Section>

          <Section title="Menu">
            <Row>
              <CategoryTab label="مشاوي" count="١٢" active />
              <CategoryTab label="مشروبات" count="١١" />
              <FavouriteChip name="شاورما لحم" price="١٢٬٥٠٠" />
            </Row>
            <div className="grid grid-cols-4 gap-12">
              <MenuItemCard name="شاورما لحم" sub="عادي · حار" price="١٢٬٥٠٠" inCart="٢" />
              <MenuItemCard name="كبدة إسكندراني" sub="حارة أو عادية" price="١٥٬٠٠٠" />
              <MenuItemCard name="سمك مقلي" sub="نفد اليوم" price="٢٥٬٠٠٠" available={false} flag="غير متاح" />
              <MenuItemCard name="شاي" sub="بالحليب" price="٢٬٠٠٠" />
            </div>
            <MenuManagementRow
              name="شاورما لحم"
              price="١٢٬٥٠٠"
              stateLabel="متاح"
              available
              toggleLabel="availability"
            />
          </Section>

          <Section title="Cart">
            <CartTabs
              tabs={[
                { id: 't4', label: 'طاولة ٤', total: '٤٩٬٥٠٠' },
                { id: 't1', label: 'طاولة ١', total: '١٩٬٥٠٠' },
              ]}
              activeId="t4"
              onSelect={() => {}}
              addLabel="cart جديد"
            />
            <CartLine name="شاورما لحم" modifiers="حار · بدون بصل" total="٢٥٬٠٠٠" stepper={qty} />
            <CartActionBar>
              <CartAction label="خصم" />
              <CartAction label="ملاحظة" />
              <CartAction label="تقسيم" />
              <CartAction label="تعليق" />
            </CartActionBar>
            <TotalsBlock
              rows={[
                { label: 'المجموع الفرعي', value: '٥٥٬٠٠٠' },
                { label: 'خصم ١٠٪', value: '−٥٬٥٠٠', tone: 'success' },
              ]}
              totalLabel="الإجمالي"
              totalValue="٤٩٬٥٠٠"
            />
          </Section>

          <Section title="Payment">
            <div className="grid grid-cols-2 gap-10">
              <PaymentMethodCard label="نقدًا" hint="الأكثر استخدامًا" tone="accent" />
              <PaymentMethodCard label="تحويل بنكي" hint="بنكك · أوكاش" />
              <PaymentMethodCard label="آجل — ذمم" hint="ليس إيرادًا" tone="credit" />
            </div>
            <Row>
              <QuickCashButton label="٥٬٠٠٠" />
              <QuickCashButton label="١٠٬٠٠٠" />
              <QuickCashButton label="٢٠٬٠٠٠" />
            </Row>
            <div className="max-w-md">
              <Keypad keys={KEYPAD} onPress={() => {}} />
            </div>
            <AmountRow label="نقدًا" note="مرجع ٤٤٨٢" amount="٢٠٬٠٠٠" />
            <AmountRow label="آجل — ذمم" note="على العميل" amount="١٤٠٬٠٠٠" tone="credit" />
          </Section>

          <Section title="Shift & callout">
            <DenominationRow note="٥٠٠٠" stepper={qty} sum="٤٩٠٬٠٠٠" />
            <CalloutPanel
              title="عجز في النقد"
              amount="−١٢٬٥٠٠"
              detail="المتوقع ٦٤٨٬٠٠٠ · المعدود ٦٣٥٬٥٠٠."
              icon={<TriangleAlert size={30} />}
            />
          </Section>

          <Section title="Reports">
            <KpiStrip columns={4}>
              <KpiCard lead label="الإيراد المحصّل" value="١٬٠٤٩٬٠٠٠" sub="بدون الذمم" tone="success" />
              <KpiCard label="عدد الطلبات" value="٧٤" />
              <KpiCard label="متوسط الفاتورة" value="١٤٬١٧٦" />
              <KpiCard label="ذمم مفتوحة" value="١٤٠٬٠٠٠" tone="credit" />
            </KpiStrip>
            <div className="h-item-card">
              <BarChart
                bars={[18, 26, 52, 78, 96, 70, 44, 58].map((h, i) => ({
                  height: h,
                  label: `${8 + i}`,
                }))}
              />
            </div>
            <StackedShareBar
              segments={[
                { percent: 52, colorClass: 'bg-chart-1', label: 'نقدًا', value: '٥٢٪' },
                { percent: 26, colorClass: 'bg-chart-2', label: 'تحويل', value: '٢٦٪' },
                { percent: 11, colorClass: 'bg-chart-3', label: 'محفظة', value: '١١٪' },
                { percent: 11, colorClass: 'bg-chart-4', label: 'ذمم', value: '١١٪' },
              ]}
            />
          </Section>

          <Section title="Open orders">
            <div className="grid grid-cols-3 gap-14">
              <OrderCard
                id="رقم ١٠٤٨"
                typeLabel="صالة · طاولة ٤"
                total="٤٩٬٥٠٠"
                items="شاورما لحم ×٢، كبدة، عصير مانجو، شاي ×٤"
                age="قبل ٤ دقائق"
                agePercent={14}
                ageTone="success"
                synced={false}
                syncedLabel="مُزامن"
                unsyncedLabel="غير مُزامن"
                resumeLabel="استئناف"
                cancelLabel="إلغاء"
              />
              <OrderCard
                id="رقم ١٠٤٤"
                typeLabel="سفري"
                total="٤٥٬٠٠٠"
                items="سمك مقلي، أرز باللحم"
                age="قبل ٤١ دقيقة"
                agePercent={92}
                ageTone="danger"
                synced
                syncedLabel="مُزامن"
                unsyncedLabel="غير مُزامن"
                resumeLabel="استئناف"
                cancelLabel="إلغاء"
              />
            </div>
          </Section>

          <Section title="Feedback states">
            <EmptyState title="لا طلبات مفتوحة" hint="ابدأ طلبًا جديدًا" icon={<ListOrdered size={30} />} />
            <LoadingList rows={2} />
            <ErrorState title="تعذّر التحميل" detail="حدث خطأ ما" retryLabel="إعادة المحاولة" onRetry={() => {}} icon={<TriangleAlert size={30} />} />
            <Button variant="danger" onClick={() => setConfirm(true)}>
              إلغاء الطلب
            </Button>
            <ConfirmDialog
              open={confirm}
              title="إلغاء الطلب؟"
              body="لا يمكن التراجع عن هذا الإجراء."
              confirmLabel="نعم، إلغاء"
              cancelLabel="رجوع"
              onConfirm={() => setConfirm(false)}
              onCancel={() => setConfirm(false)}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

export function GalleryBoard() {
  return (
    <div className="flex flex-col gap-32 p-24">
      <h1 className="text-la-2xl font-bold text-text">Component gallery</h1>
      <div className="grid grid-cols-1 gap-32 xl:grid-cols-2">
        <div data-theme="light" dir="rtl" className="overflow-hidden rounded-xl bg-bg">
          <Board />
        </div>
        <div data-theme="dark" dir="rtl" className="overflow-hidden rounded-xl bg-bg">
          <Board />
        </div>
        <div data-theme="light" dir="ltr" className="overflow-hidden rounded-xl bg-bg">
          <Board />
        </div>
        <div data-theme="dark" dir="ltr" className="overflow-hidden rounded-xl bg-bg">
          <Board />
        </div>
      </div>
    </div>
  );
}
