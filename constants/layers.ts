/**
 * Stacking order for full-screen overlays.
 *
 * Every overlay used to hard-code its own z-index, so the ladder only existed
 * in whoever last edited a component's head. That is how an expense form ended
 * up rendering underneath the settlement sheet it was opened from.
 *
 * The rule is the order of this object: something opened *from* another layer
 * must sit on a later rung. Add a rung rather than inventing a number.
 */
export const OVERLAY = {
  /** Panels that take over the screen but are still "a place": settlement. */
  sheet: 'z-[70]',
  /** Ordinary modals opened from a screen. */
  modal: 'z-[80]',
  /** Reading surfaces opened from a modal: the dispute thread. */
  thread: 'z-[85]',
  /** Forms, which are always opened from one of the above. */
  form: 'z-[90]',
  /** Confirmations, which must be able to cover a form. */
  confirm: 'z-[95]',
  /** Alerts and share sheets that interrupt everything. */
  alert: 'z-[100]',
  /** Development-only tools, above the product entirely. */
  devTools: 'z-[110]',
} as const;

export type OverlayLayer = keyof typeof OVERLAY;
