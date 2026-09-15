import React, { useState } from 'react';
import { resendSignupConfirmation, signIn, signUp } from '../services/authService';
import { isValidEmail, normalizeEmail } from '../services/emailValidation';

interface Props { onBack: () => void; onSuccess: () => void; unavailable?: boolean; }

const messageFor = (error: unknown) => {
  const text = error instanceof Error ? error.message.toLowerCase() : '';
  if (text.includes('auth_unavailable') || text.includes('fetch') || text.includes('network')) return '目前無法連線帳號服務';
  if (text.includes('invalid login')) return 'Email 或密碼錯誤';
  if (text.includes('already registered') || text.includes('user already exists')) return '這個 Email 已有帳號，請直接登入。';
  if (text.includes('password')) return '密碼長度不足或格式不符合要求';
  return '目前無法完成操作，請稍後再試';
};

const AuthScreen: React.FC<Props> = ({ onBack, onSuccess, unavailable }) => {
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
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) { setError('請輸入 Email'); return; }
    if (!isValidEmail(normalizedEmail)) { setError('Email 格式不正確'); return; }
    setBusy(true);
    try {
      const result = mode === 'signUp' ? await signUp({ email: normalizedEmail, password, displayName }) : await signIn({ email: normalizedEmail, password });
      if (mode === 'signUp' && !result.session) {
        setVerificationEmail(normalizedEmail);
        setNotice('請查看信箱完成驗證。\n如果你已經有 Trippie 帳號，請直接登入。');
      } else onSuccess();
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  };

  const resendVerification = async () => {
    if (!verificationEmail) return;
    setResending(true); setError('');
    try { await resendSignupConfirmation(verificationEmail); setNotice('驗證信已重新寄出，請查看信箱。\n如果你已經有 Trippie 帳號，請直接登入。'); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setResending(false); }
  };

  return <main className="min-h-screen bg-[#f7f8fc] px-4 pb-10 pt-6 text-[#11183d] md:mx-auto md:max-w-2xl">
    <button type="button" onClick={onBack} className="mb-6 text-sm font-bold text-violet-600">← 返回</button>
    <div className="rounded-[28px] bg-white p-6 shadow-sm">
      <div className="mb-6"><div className="text-2xl font-black text-violet-600">Trippie</div><h1 className="mt-6 text-2xl font-black">{mode === 'signIn' ? '登入 Trippie' : '建立 Trippie 帳號'}</h1><p className="mt-2 text-sm text-slate-500">保留你的創作者身份，未來也能跨裝置同步旅行資料。</p></div>
      {unavailable && <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">目前無法連線帳號服務</p>}
      {error && <p className="mb-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
      {notice && <div className="mb-4 rounded-2xl bg-violet-50 p-3 text-sm font-bold leading-6 whitespace-pre-line text-violet-700">{notice}{verificationEmail && <div className="mt-3 flex gap-2"><button type="button" onClick={() => { setMode('signIn'); setNotice(''); setVerificationEmail(''); }} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">前往登入</button><button type="button" onClick={resendVerification} disabled={resending} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-50">{resending ? '寄送中…' : '重新寄送驗證信'}</button></div>}</div>}
      <form noValidate onSubmit={submit} className="space-y-4">
        {mode === 'signUp' && <label className="block text-sm font-bold">名稱<input value={displayName} onChange={e => setDisplayName(e.target.value)} required className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>}
        <label className="block text-sm font-bold">Email<input type="text" inputMode="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="block text-sm font-bold">Password<input type="password" name="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <button type="submit" disabled={busy || !!unavailable} className="w-full rounded-2xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? '處理中…' : mode === 'signIn' ? '登入' : '建立帳號'}</button>
      </form>
      <button type="button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(''); setNotice(''); }} className="mt-5 w-full text-sm font-bold text-violet-600">{mode === 'signIn' ? '還沒有帳號？建立帳號' : '已有帳號？登入'}</button>
    </div>
  </main>;
};

export default AuthScreen;
