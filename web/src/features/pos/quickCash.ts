/**
 * The quick-cash buttons on the payment screen: the notes a customer is likely
 * to hand over for this bill.
 *
 * They used to be fixed at 5,000, 10,000 and 20,000, all below a typical bill,
 * so a tap recorded a partial payment instead of the cash on the counter. Now
 * they are the next round amounts above what is due. The exact amount has its
 * own button ("المبلغ كامل") and is never repeated here.
 */
const STEPS = [5_000n, 10_000n, 50_000n];
const FILL_STEP = 50_000n;
const COUNT = 3;

function roundUp(due: bigint, step: bigint): bigint {
  const rounded = ((due + step - 1n) / step) * step;
  return rounded === due ? rounded + step : rounded;
}

export function quickCashOptions(due: bigint): bigint[] {
  if (due <= 0n) return [];
  const options = [...new Set(STEPS.map((step) => roundUp(due, step)))].sort((a, b) => (a < b ? -1 : 1));
  while (options.length < COUNT) options.push(options[options.length - 1]! + FILL_STEP);
  return options.slice(0, COUNT);
}
