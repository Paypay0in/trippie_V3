/**
 * @vitest-environment jsdom
 *
 * 國內旅行／國外旅行 on the create-trip screen.
 *
 * The requirement that carries the risk is 「切換類型時，不得靜默清除已輸入資料」.
 * A toggle that rewrites the form is the same defect shape as a clamp that
 * turns a failure into something that renders: the screen still looks like it
 * worked, and the traveller discovers the loss later, somewhere else.
 *
 * The other one is the preselection. Residence is asked for and never
 * inferred, so most travellers have none, and a toggle that answers 國外 when
 * nobody said is a guess wearing an answer's clothes.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import CreateEditTripScreen from '../components/CreateEditTripScreen';

vi.mock('../services/destinationImageService', () => ({
  fetchDestinationImage: vi.fn(async () => null),
}));

const show = (props: Record<string, unknown> = {}) => {
  const onSubmit = vi.fn();
  render(
    <CreateEditTripScreen
      mode="create"
      initialDestination=""
      initialStartDate=""
      initialEndDate=""
      initialCompanions={[]}
      friends={[]}
      onBack={vi.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
};

const domestic = () => screen.getByTestId('trip-scope-domestic');
const international = () => screen.getByTestId('trip-scope-international');

afterEach(cleanup);

describe('the scope toggle', () => {
  it('preselects nothing when nobody said where the traveller lives', () => {
    show({ initialTravelCountry: '日本' });

    expect(domestic().getAttribute('aria-pressed')).toBe('false');
    expect(international().getAttribute('aria-pressed')).toBe('false');
  });

  it('preselects the derived answer when both countries are known', () => {
    show({ residenceCountryCode: 'TW', initialTravelCountry: '台灣' });

    expect(domestic().getAttribute('aria-pressed')).toBe('true');
  });

  it('prefers a scope already stored on the trip over the derivation', () => {
    show({ residenceCountryCode: 'TW', initialTravelCountry: '台灣', initialTripScope: 'international' });

    expect(international().getAttribute('aria-pressed')).toBe('true');
  });

  it('submits the chosen scope with the rest of the form', async () => {
    const user = userEvent.setup();
    const onSubmit = show({ residenceCountryCode: 'TW' });

    await user.click(international());
    await user.type(screen.getByLabelText(/目的地/), '日本');
    await user.click(screen.getByRole('button', { name: /建立旅程|Create/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tripScope: 'international', destination: '日本' }));
  });
});

describe('switching type keeps what was typed', () => {
  it('keeps destination, dates and budget across a switch', async () => {
    const user = userEvent.setup();
    show({ residenceCountryCode: 'TW' });

    const destination = screen.getByRole('textbox');
    await user.type(destination, '沖繩');
    const budget = screen.getByRole('spinbutton');
    await user.type(budget, '45000');

    await user.click(domestic());
    await user.click(international());

    expect((destination as HTMLInputElement).value).toBe('沖繩');
    expect((budget as HTMLInputElement).value).toBe('45000');
  });

  /*
    The currency is the one field the switch may move, and only while it is
    still the app's suggestion rather than the traveller's answer.
  */
  it('moves the currency suggestion, but never a currency somebody chose', async () => {
    const user = userEvent.setup();
    show({ residenceCountryCode: 'JP', initialCurrency: 'TWD' });

    await user.click(domestic());
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('JPY');

    await user.selectOptions(screen.getByRole('combobox'), 'USD');
    await user.click(international());
    await user.click(domestic());

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('USD');
  });
});

describe('what each type shows', () => {
  it('offers shortcuts inside the residence country on a domestic trip', async () => {
    const user = userEvent.setup();
    show({ residenceCountryCode: 'US' });

    await user.click(domestic());
    await user.click(await screen.findByTestId('popular-destination-us-sea'));

    expect((screen.getByLabelText(/目的地/) as HTMLInputElement).value).toBe('Seattle');
  });

  it('offers no shortcuts at all when the residence country is unknown', async () => {
    const user = userEvent.setup();
    show({});

    await user.click(domestic());

    expect(screen.queryByText('熱門目的地')).toBeNull();
  });

  it('shows the passport only on an international trip', async () => {
    const user = userEvent.setup();
    show({ residenceCountryCode: 'TW', passportLabel: '台灣護照', passportExpiry: '2030/05/20', passportValid: true });

    await user.click(domestic());
    expect(screen.queryByTestId('trip-passport-card')).toBeNull();

    await user.click(international());
    expect(screen.getByTestId('trip-passport-card')).toBeTruthy();
    expect(screen.getByText('有效')).toBeTruthy();
  });
});
