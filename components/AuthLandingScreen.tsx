import React, { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronRight, FileText, Mail, Users, WalletCards } from 'lucide-react';
import { fetchDestinationImage } from '../services/destinationImageService';

interface Props {
  onBack: () => void;
  onEmail: () => void;
  onUnavailableProvider: () => void;
}

const benefits = [
  { title: '規劃行程', description: '打造專屬旅程', icon: CalendarDays },
  { title: '記錄旅程', description: '珍藏每個回憶', icon: FileText },
  { title: '參與社群', description: '遇見喜歡的旅人', icon: Users },
  { title: '管理旅費', description: '聰明掌握花費', icon: WalletCards },
];

const AuthLandingScreen: React.FC<Props> = ({ onBack, onEmail, onUnavailableProvider }) => {
  const [heroImage, setHeroImage] = useState<string>();

  useEffect(() => {
    let active = true;
    fetchDestinationImage('Santorini').then(image => {
      if (active && image?.imageUrl) setHeroImage(image.imageUrl);
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-white px-5 pb-8 pt-5 text-[#11183d] md:mx-auto md:max-w-2xl">
      <div className="pointer-events-none absolute right-0 top-0 h-[330px] w-[72%] overflow-hidden rounded-bl-[100px]">
        {heroImage && <img src={heroImage} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white" />
      </div>

      <button type="button" onClick={onBack} aria-label="返回" className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#11183d] shadow-sm">
        <ArrowLeft size={20} />
      </button>

      <section className="relative z-10 max-w-[290px] pt-8">
        <div className="bg-gradient-to-r from-[#6d35d8] via-[#7b55e8] to-[#2f80ed] bg-clip-text text-3xl font-black tracking-[-0.06em] text-transparent">Trippie</div>
        <p className="mt-7 text-sm font-bold text-violet-600">嗨，旅人 👋</p>
        <h1 className="mt-2 text-[32px] font-black leading-[1.12] tracking-[-0.04em]">把你的旅行<br />真正留在 Trippie。</h1>
        <p className="mt-4 text-[14px] font-medium leading-6 text-slate-500">規劃、記錄、分享、管理旅費<br />一站完成，讓每一趟旅程更簡單。</p>
      </section>

      <section className="relative z-10 mt-[92px] grid grid-cols-4 gap-2">
        {benefits.map(({ title, description, icon: Icon }) => (
          <div key={title} className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-600"><Icon size={20} strokeWidth={2.2} /></div>
            <p className="mt-2 text-[11px] font-black leading-4">{title}</p>
            <p className="mt-1 text-[9px] leading-3 text-slate-400">{description}</p>
          </div>
        ))}
      </section>

      <section className="relative z-10 mt-8">
        <button type="button" onClick={onEmail} className="flex h-14 w-full items-center justify-between rounded-[18px] bg-gradient-to-r from-[#7139d8] to-[#9366f2] px-5 text-left font-black text-white shadow-[0_10px_24px_rgba(113,57,216,0.25)]">
          <span className="flex items-center gap-3"><Mail size={21} />使用 Email 登入 / 註冊</span>
          <ChevronRight size={21} />
        </button>
        <div className="my-6 flex items-center gap-3 text-[11px] font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />或使用其他方式繼續<span className="h-px flex-1 bg-slate-200" /></div>
        <div className="grid grid-cols-3 gap-3">
          {['Google', 'Apple', 'LINE'].map(provider => <button key={provider} type="button" onClick={onUnavailableProvider} className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-400 shadow-sm">{provider}</button>)}
        </div>
        <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">繼續即表示你同意 Trippie 的<br /><span className="font-bold text-violet-500">服務條款</span> 與 <span className="font-bold text-violet-500">隱私權政策</span></p>
      </section>
    </main>
  );
};

export default AuthLandingScreen;
