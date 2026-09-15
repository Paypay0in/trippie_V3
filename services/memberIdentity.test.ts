import { describe, it, expect } from 'vitest';
import {
  isOwnerIdentity,
  normalizeMemberIds,
  normalizeMemberAmountRecord,
  normalizeOwnerMemberId,
} from './memberIdentity';

const OWNER = 'trip-1:owner';
const OLD_OWNER = 'trip-old:owner';
const GINA = 'companion-gina';
const V = 'companion-v';

describe('isOwnerIdentity', () => {
  it('accepts the legacy literal and well-formed owner ids', () => {
    expect(isOwnerIdentity('me')).toBe(true);
    expect(isOwnerIdentity(OWNER)).toBe(true);
    expect(isOwnerIdentity(OLD_OWNER)).toBe(true);
    expect(isOwnerIdentity('draft-9f3a:owner')).toBe(true);
  });

  it('rejects malformed and unrelated ids', () => {
    expect(isOwnerIdentity(':owner')).toBe(false);
    expect(isOwnerIdentity(' :owner')).toBe(false);
    expect(isOwnerIdentity('')).toBe(false);
    expect(isOwnerIdentity('owner')).toBe(false);
    expect(isOwnerIdentity('owner:trip-1')).toBe(false);
    expect(isOwnerIdentity('companion-owner')).toBe(false);
    expect(isOwnerIdentity(GINA)).toBe(false);
  });
});

describe('beneficiary normalization', () => {
  it('collapses legacy "me" and a foreign owner id onto the active owner', () => {
    expect(normalizeOwnerMemberId('me', OWNER)).toBe(OWNER);
    expect(normalizeOwnerMemberId(OLD_OWNER, OWNER)).toBe(OWNER);
    expect(normalizeOwnerMemberId(GINA, OWNER)).toBe(GINA);
    expect(normalizeOwnerMemberId(':owner', OWNER)).toBe(':owner');
  });

  it('never leaves both "me" and the owner id in beneficiaries', () => {
    expect(normalizeMemberIds(['me', OWNER, GINA], OWNER)).toEqual([OWNER, GINA]);
  });

  it('preserves unrelated member ids and their order', () => {
    expect(normalizeMemberIds([GINA, 'me', V], OWNER)).toEqual([GINA, OWNER, V]);
  });

  it('acceptance: 6500 split between 我 and Gina is 3250 each', () => {
    const beneficiaries = normalizeMemberIds(['me', OWNER, GINA], OWNER);
    expect(beneficiaries).toHaveLength(2);
    expect(6500 / beneficiaries.length).toBe(3250);

    const withV = normalizeMemberIds([...beneficiaries, V], OWNER);
    expect(withV).toHaveLength(3);
    expect(normalizeMemberIds(withV.filter(id => id !== V), OWNER)).toHaveLength(2);
  });
});

describe('normalizeMemberAmountRecord', () => {
  it('A: a single legacy alias keeps its amount', () => {
    const { values, conflicts } = normalizeMemberAmountRecord({ me: 3250 }, OWNER);
    expect(values).toEqual({ [OWNER]: 3250 });
    expect(conflicts).toEqual([]);
  });

  it('B: a foreign owner alias keeps its amount', () => {
    const { values, conflicts } = normalizeMemberAmountRecord({ [OLD_OWNER]: 3250 }, OWNER);
    expect(values).toEqual({ [OWNER]: 3250 });
    expect(conflicts).toEqual([]);
  });

  it('C: equal duplicate representations are counted once, never summed', () => {
    const { values, conflicts } = normalizeMemberAmountRecord({ me: 3250, [OWNER]: 3250 }, OWNER);
    expect(values).toEqual({ [OWNER]: 3250 });
    expect(values[OWNER]).not.toBe(6500);
    expect(conflicts).toEqual([]);
  });

  it('D: a zero alias never displaces the canonical amount', () => {
    expect(normalizeMemberAmountRecord({ [OWNER]: 3250, me: 0 }, OWNER).values).toEqual({ [OWNER]: 3250 });
    expect(normalizeMemberAmountRecord({ me: 0, [OWNER]: 3250 }, OWNER).values).toEqual({ [OWNER]: 3250 });
    expect(normalizeMemberAmountRecord({ me: 0, [OWNER]: 0 }, OWNER).values).toEqual({ [OWNER]: 0 });
  });

  it('E: conflicting non-zero amounts are reported, not summed or guessed', () => {
    const { values, conflicts } = normalizeMemberAmountRecord({ me: 3000, [OWNER]: 3250 }, OWNER);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].memberId).toBe(OWNER);
    expect(conflicts[0].entries).toEqual([
      { rawId: 'me', amount: 3000 },
      { rawId: OWNER, amount: 3250 },
    ]);
    // Provisional value only — callers must refuse to persist a conflict.
    expect(values[OWNER]).not.toBe(6250);
  });

  it('payerAllocations: duplicate owner payers are not double-credited', () => {
    const { values, conflicts } = normalizeMemberAmountRecord(
      { me: 6500, [OWNER]: 6500, [GINA]: 0 },
      OWNER,
    );
    expect(values).toEqual({ [OWNER]: 6500, [GINA]: 0 });
    expect(conflicts).toEqual([]);
  });

  it('splitAllocations: duplicate owner shares are not double-charged', () => {
    const { values, conflicts } = normalizeMemberAmountRecord(
      { [OLD_OWNER]: 3250, me: 3250, [GINA]: 3250 },
      OWNER,
    );
    expect(values).toEqual({ [OWNER]: 3250, [GINA]: 3250 });
    expect(Object.values(values).reduce((a, b) => a + b, 0)).toBe(6500);
    expect(conflicts).toEqual([]);
  });

  it('leaves unrelated members and malformed ids untouched', () => {
    const { values, conflicts } = normalizeMemberAmountRecord(
      { [GINA]: 1000, [V]: 500, ':owner': 250 },
      OWNER,
    );
    expect(values).toEqual({ [GINA]: 1000, [V]: 500, ':owner': 250 });
    expect(conflicts).toEqual([]);
  });
});
