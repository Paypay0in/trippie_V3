/**
 * Who gets the remainder in a 指定金額 / 百分比 split.
 *
 * 「這筆帳我要分帳，但我可能更清楚 Gina 的是多少錢 目前就會是只能先輸入我的金額
 * Gina 用總額扣掉 我希望是兩個都可以」.
 *
 * One member's box has to be the remainder: two free numbers that must add to a
 * fixed total is a form that can disagree with itself, and a traveller who
 * types 10,000 and 10,000 against a 19,000 bill has made a record nobody can
 * settle. So the remainder stays — it just stops being a fixed seat.
 *
 * It was hard-wired to the last beneficiary, which decided for the traveller
 * which half of the bill they were allowed to know. Often they know the other
 * half: 「她那件是 19,000」 read straight off the receipt. The remainder now
 * follows the typing instead — whichever box you are filling in is yours, and
 * somebody else carries the rest.
 */

export interface RemainderInput {
  /** Everyone sharing this bill, in the order the form lists them. */
  beneficiaries: string[];
  /** The box the traveller most recently typed into, if any. */
  lastEditedId?: string;
  /** Who is carrying the remainder now, so a settled form does not jump. */
  currentRemainderId?: string;
}

/**
 * The member whose number is derived rather than typed.
 *
 * Stable on purpose: it only moves when the traveller types into the box that
 * was carrying it. Recomputing from scratch on every keystroke would make the
 * 自動計算 label hop between rows while somebody is still typing.
 */
export const remainderMemberFor = ({
  beneficiaries,
  lastEditedId,
  currentRemainderId,
}: RemainderInput): string | undefined => {
  if (beneficiaries.length === 0) return undefined;
  // One person bears the whole bill; there is nothing to split and nothing to
  // type, so the single seat is the remainder.
  if (beneficiaries.length === 1) return beneficiaries[0];

  const held = currentRemainderId && beneficiaries.includes(currentRemainderId)
    ? currentRemainderId
    : undefined;
  if (held && held !== lastEditedId) return held;

  /*
    The traveller typed into the box that was carrying the remainder, so it has
    to move. It goes to the last of the others — the same seat it defaulted to
    before any of this, so a two-person split simply swaps.
  */
  const others = beneficiaries.filter(id => id !== lastEditedId);
  return others[others.length - 1] ?? beneficiaries[beneficiaries.length - 1];
};
