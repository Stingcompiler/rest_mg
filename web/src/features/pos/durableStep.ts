/**
 * Run a follow-up only once a write is safe.
 *
 * The till paints first and persists after, which is right for typing a bill.
 * It is wrong for a step that announces the bill to the world — a kitchen
 * ticket, a sync — because a failed save used to be logged and forgotten, and
 * the ticket printed for an order the device had not recorded. `afterSave`
 * resolves to whether the save landed, and reports a failure instead of
 * swallowing it.
 */
export async function afterSave(
  save: () => Promise<unknown>,
  then: () => void,
  failed: (error: unknown) => void,
): Promise<boolean> {
  try {
    await save();
  } catch (error) {
    failed(error);
    return false;
  }
  then();
  return true;
}
