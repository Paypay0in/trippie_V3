import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import AppWordmark from './AppWordmark';
import { resendSignupConfirmation, signIn, signUp } from '../services/authService';
import { isValidEmail, normalizeEmail } from '../services/emailValidation';

interface Props { onBack: () => void; onSuccess: () => void; unavailable?: boolean; }

/*
  The matched substrings are Supabase's own English error text, not copy: they
  are what the service returns and must stay exactly as they are.
  i18n-data: `auth_unavailable`, `invalid login` and the rest are upstream
  values matched with `includes`.
*/
const messageFor = (error: unknown, t: TFunction) => {
  const text = error instanceof Error ? error.message.toLowerCase() : '';
  if (text.includes('auth_unavailable') || text.includes('fetch') || text.includes('network')) return t('auth.unavailable');
  if (text.includes('invalid login')) return t('auth.wrongCredentials');
  if (text.includes('already registered') || text.includes('user already exists')) return t('auth.alreadyRegistered');
  if (text.includes('password')) return t('auth.weakPassword');
  return t('auth.genericFailure');
};

const AuthScreen: React.FC<Props> = ({ onBack, onSuccess, unavailable }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resending, setResending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(''); setNotice(''); setVerificationEmail('');

    // Read what is actually in the fields, not what React last heard about.
    // A password manager filling the form does not always fire a change event,
    // so the visible email can be correct while state is empty or half-typed —
    // which is why logging in appeared to need the address twice.
    const form = new FormData(event.currentTarget);
    const typedEmail = String(form.get('email') ?? '') || email;
    const typedPassword = String(form.get('password') ?? '') || password;
    if (typedEmail !== email) setEmail(typedEmail);
    if (typedPassword !== password) setPassword(typedPassword);

    const normalizedEmail = normalizeEmail(typedEmail);
    /*
      Every empty field, not just the first one.

      「空白送出只提示 Email，沒有清楚指出密碼或其他必填欄位」 — a form that reports
      one missing field at a time makes somebody submit three times to learn
      three things it knew at the first press.
    */
    const missing = [
      !normalizedEmail ? 'Email' : '',
      !typedPassword ? t('auth.fieldPassword') : '',
      mode === 'signUp' && !displayName.trim() ? t('auth.fieldDisplayName') : '',
    ].filter(Boolean);
    if (missing.length > 0) { setError(t('auth.missingFields', { fields: missing.join(t('common.listSeparator')) })); return; }
    // Quoting what was actually received. "格式不正確" on an address that looks
    // perfect on screen is impossible to act on; seeing the string the form
    // really holds says immediately whether it is truncated, doubled, or fine.
    if (!isValidEmail(normalizedEmail)) { setError(t('auth.emailMalformed', { email: normalizedEmail })); return; }
    setBusy(true);
    try {
      const result = mode === 'signUp'
        ? await signUp({ email: normalizedEmail, password: typedPassword, displayName })
        : await signIn({ email: normalizedEmail, password: typedPassword });
      if (mode === 'signUp' && !result.session) {
        setVerificationEmail(normalizedEmail);
        setNotice(t('auth.verifyNotice'));
      } else onSuccess();
    } catch (reason) { setError(messageFor(reason, t)); } finally { setBusy(false); }
  };

  const resendVerification = async () => {
    if (!verificationEmail) return;
    setResending(true); setError('');
    try { await resendSignupConfirmation(verificationEmail); setNotice(t('auth.resentNotice')); }
    catch (reason) { setError(messageFor(reason, t)); }
    finally { setResending(false); }
  };

  /*
    「太滿版 也不好點」.

    This screen had no data-safe-top at all — a different cause from the two
    that set it to 0rem, with the same result: 返回 drawn at 24px from the top
    of the glass, inside the strip the clock owns and iOS takes the taps in.

    「登入這頁的 Logo 呢？」 — it was there, as a line of purple text with no
    plane, 24px where every other header is 28. The one screen somebody meets
    before they have an account was the one introducing the app in a typeface
    of its own.
  */
  return <main data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className="min-h-screen bg-[#f7f8fc] px-[var(--screen-pad)] pb-10 text-[#11183d] md:mx-auto md:max-w-2xl">
    <button type="button" onClick={onBack} className="-ml-2 mb-4 flex min-h-11 items-center px-2 text-sm font-bold text-violet-600">← {t('auth.back')}</button>
    <div className="rounded-[28px] bg-white p-6 shadow-sm">
      <div className="mb-6"><AppWordmark /><h1 className="mt-5 text-screen-title font-bold">{mode === 'signIn' ? t('auth.signInTitle') : t('auth.signUpTitle')}</h1><p className="mt-2 text-sm text-slate-500">{t('auth.blurb')}</p></div>
      {unavailable && <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">{t('auth.unavailable')}</p>}
      {error && <p className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      {notice && <div className="mb-4 rounded-2xl bg-violet-50 p-3 text-sm font-bold leading-6 whitespace-pre-line text-violet-700">{notice}{verificationEmail && <div className="mt-3 flex gap-2"><button type="button" onClick={() => { setMode('signIn'); setNotice(''); setVerificationEmail(''); }} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">{t('auth.goToSignIn')}</button><button type="button" onClick={resendVerification} disabled={resending} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-50">{resending ? t('auth.resending') : t('auth.resendVerification')}</button></div>}</div>}
      <form noValidate onSubmit={submit} className="space-y-4">
        {mode === 'signUp' && <label className="block text-sm font-bold">{t('auth.nameLabel')}<input value={displayName} onChange={e => setDisplayName(e.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>}
        <label className="block text-sm font-bold">Email<input type="text" inputMode="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="block text-sm font-bold">Password<input type="password" name="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <button type="submit" disabled={busy || !!unavailable} className="w-full rounded-2xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? t('auth.busy') : mode === 'signIn' ? t('auth.signIn') : t('auth.createAccount')}</button>
      </form>
      <button type="button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(''); setNotice(''); }} className="mt-5 w-full text-sm font-bold text-violet-600">{mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}</button>
    </div>
  </main>;
};

export default AuthScreen;
