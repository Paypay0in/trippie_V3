import { PassportProfile, TravelRules } from '../types';

export interface TravelRulesCurrentTrip {
  id?: string | null;
  destination?: string;
  startDate?: string;
  endDate?: string;
  travelRules?: TravelRules;
}

const text = (value?: string | null) => (value || '').trim();

export const isTravelRulesCurrent = (
  activeTrip: TravelRulesCurrentTrip | null | undefined,
  selectedPassport?: PassportProfile,
): boolean => {
  const context = activeTrip?.travelRules?.context;
  if (!activeTrip?.id || !activeTrip.travelRules || !context || !selectedPassport?.countryCode) return false;
  return context.tripId === activeTrip.id
    && text(context.destination) === text(activeTrip.destination)
    && context.passportCountryCode === selectedPassport.countryCode
    && text(context.startDate) === text(activeTrip.startDate)
    && text(context.endDate) === text(activeTrip.endDate);
};
