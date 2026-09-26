/**
 * The component library — every reusable piece the screens are built from.
 *
 * Rules that hold across all of them:
 *   - no literal colour or size; only token classes (guarded by lint);
 *   - logical direction utilities only, so Arabic and English mirror for free;
 *   - user-facing text arrives as props, already translated; money and counts
 *     arrive pre-formatted and render through `Numeric`;
 *   - every interactive control is a real focusable element clearing 44px.
 */
export * from './primitives/controls';
export * from './primitives/indicators';
export * from './primitives/pager';
export * from './feedback/feedback';
export * from './layout/layout';
export * from './menu/menu';
export * from './cart/cart';
export * from './payment/payment';
export * from './shift/shift';
export * from './report/report';
export * from './orders/orders';
export * from './media/media';
export * from './settings/SettingsMenu';
