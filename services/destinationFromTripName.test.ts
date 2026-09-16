import { describe, expect, it } from 'vitest';
import {
  destinationLabel,
  detectDestinationFromTripName,
} from './destinationFromTripName';

describe('destination from a trip name', () => {
  it('reads the city and its country out of a normal trip name', () => {
    expect(detectDestinationFromTripName('韓國釜山之旅')).toEqual({
      country: '韓國',
      city: '釜山',
    });
  });

  it('takes the country alone when no city is named', () => {
    expect(detectDestinationFromTripName('日本畢業旅行')).toEqual({ country: '日本' });
  });

  it('recognises a city without its country beside it', () => {
    expect(detectDestinationFromTripName('東京五天四夜')).toEqual({
      country: '日本',
      city: '東京',
    });
  });

  it('reads English and simplified spellings', () => {
    expect(detectDestinationFromTripName('Osaka food trip')).toEqual({
      country: '日本',
      city: '大阪',
    });
    expect(detectDestinationFromTripName('首尔购物')).toEqual({
      country: '韓國',
      city: '首爾',
    });
  });

  it('says nothing rather than guessing', () => {
    // A wrong guess silently drives tax and visa lookups for the wrong country,
    // so an unrecognised name must produce no destination at all.
    expect(detectDestinationFromTripName('畢業旅行')).toBeNull();
    expect(detectDestinationFromTripName('')).toBeNull();
    expect(detectDestinationFromTripName('   ')).toBeNull();
  });

  it('labels with the city when there is one, otherwise the country', () => {
    expect(destinationLabel({ country: '韓國', city: '釜山' })).toBe('釜山');
    expect(destinationLabel({ country: '韓國' })).toBe('韓國');
  });
});
