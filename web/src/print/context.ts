/**
 * Builds a PrintContext from the current locale and numeral settings, using the
 * pure i18n functions (no React hook), so a receipt prints in the same language
 * and numerals the cashier is using. Kept out of the templates so they stay
 * about layout, not translation.
 */
import {
  direction,
  formatInteger,
  formatDate,
  formatMoney,
  formatTime,
  translate,
  type Locale,
  type Numerals,
} from '@/i18n';
import type { PrintContext } from './document';

export function buildPrintContext(locale: Locale, numerals: Numerals): PrintContext {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return {
    dir: direction(locale),
    formatMoney: (minor) => formatMoney(minor, numerals),
    formatQty: (qty) => formatInteger(qty, numerals),
    formatTime: (date) => formatTime(date),
    formatDate: (date) => formatDate(date),
    labels: {
      kitchen: t('print.kitchen'),
      receipt: t('print.restaurantName'),
      order: t('print.order'),
      table: t('print.table'),
      subtotal: t('pos.cart.subtotal'),
      discount: t('pos.cart.discount'),
      total: t('pos.cart.total'),
      change: t('pos.payment.change'),
      paid: t('pos.payment.recorded'),
      thanks: t('print.thanks'),
      restaurantName: t('print.restaurantName'),
      shiftReport: t('pos.shift.reportTitle'),
      expectedCash: t('pos.shift.expectedCash'),
      countedCash: t('pos.shift.counted'),
      shortfall: t('pos.shift.shortfall'),
      surplus: t('pos.shift.surplus'),
      orderCount: t('pos.shift.orderCount'),
      varianceReason: t('pos.shift.reasonLabel'),
      notInDrawer: t('pos.shift.notInDrawer'),
      invoice: t('print.invoice'),
      totalSales: t('print.totalSales'),
      salesSection: t('print.salesSection'),
      drawerSection: t('print.drawerSection'),
      cashier: t('print.cashier'),
      shift: t('print.shift'),
      signature: t('print.signature'),
      orderType: {
        dine_in: t('pos.orderType.dineIn'),
        takeaway: t('pos.orderType.takeaway'),
        delivery: t('pos.orderType.delivery'),
      },
      paymentMethod: {
        cash: t('pos.payment.cash'),
        bank: t('pos.payment.bank'),
        wallet: t('pos.payment.wallet'),
        credit: t('pos.payment.credit'),
      },
    },
  };
}
