import { EntryActionType, EntryActionableItem, ShoppingItem, TravelRuleTaskState } from '../types';

export interface ComposedTravelRuleTask {
  action: EntryActionableItem;
  key: string;
  completed: boolean;
}

const knownActionTypes: EntryActionType[] = [
  'visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration',
  'arrival_form', 'required_documents', 'onward_travel',
];

export const travelRuleTaskKey = (action: EntryActionableItem): string =>
  action.actionType === 'other'
    ? `other:${action.title.trim().toLowerCase()}`
    : action.actionType;

export const classifyLegacyTravelRuleAction = (name: string): EntryActionType | undefined => {
  const normalized = name.trim().toLowerCase();
  if (/k[- ]?eta|esta|\beta\b|簽證|免簽|豁免|visa waiver|visa exemption/.test(normalized)) return 'visa_or_eta';
  if (/q[- ]?code|qcode|檢疫|健康申報|health declaration|quarantine declaration/.test(normalized)) return 'health_declaration';
  if (/護照效期|護照有效|passport validity|passport expiry/.test(normalized)) return 'passport_validity';
  if (/海關申報|customs declaration|customs form/.test(normalized)) return 'customs_declaration';
  if (/入境卡|入境申報|arrival form|arrival card/.test(normalized)) return 'arrival_form';
  return undefined;
};

export const composeTravelRuleTasks = (
  actions: EntryActionableItem[] | undefined,
  state: TravelRuleTaskState | undefined,
): ComposedTravelRuleTask[] => {
  const seen = new Set<string>();
  return (actions || []).filter(action => {
    if (!action?.title?.trim()) return false;
    const key = travelRuleTaskKey(action);
    if (action.actionType !== 'other' && !knownActionTypes.includes(action.actionType)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(action => {
    const key = travelRuleTaskKey(action);
    return { action, key, completed: state?.[key]?.completed === true };
  });
};
