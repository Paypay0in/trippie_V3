
import React from 'react';
import { VisaInfo } from '../types';
import { FileText, Globe, ExternalLink, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface Props {
  visaInfo: VisaInfo;
}

const TravelAdvisoryWidget: React.FC<Props> = ({ visaInfo }) => {
  const isVisaFree = visaInfo.requirement === 'VISA_FREE';
  const hasEntryForm = visaInfo.entryFormLink && visaInfo.entryFormLink.length > 0;
  
  // Status Color Logic
  const statusColor = isVisaFree 
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : visaInfo.requirement === 'E_VISA' 
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-red-50 border-red-200 text-red-800';

  const StatusIcon = isVisaFree ? CheckCircle : AlertTriangle;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden mb-4 animate-fade-in-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center gap-2 text-white">
            <Globe size={18} className="animate-pulse-slow" />
            <h3 className="font-bold text-sm tracking-wide">
                {visaInfo.destination} 旅遊提示 ({visaInfo.origin} 出發)
            </h3>
        </div>
        
        <div className="p-4 space-y-4">
            
            {/* 1. Visa Status Block */}
            <div className={`rounded-lg p-3 border flex items-start gap-3 ${statusColor}`}>
                <StatusIcon size={20} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                    <div className="font-bold text-sm mb-1">
                        簽證需求: {visaInfo.visaName || (isVisaFree ? '免簽證' : '需申請簽證')}
                    </div>
                    {!isVisaFree && visaInfo.visaLink && (
                        <a 
                            href={visaInfo.visaLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold underline decoration-dotted hover:decoration-solid mt-1"
                        >
                            <ExternalLink size={12} /> 前往申請頁面
                        </a>
                    )}
                    <div className="text-xs opacity-80 mt-1 leading-relaxed">
                        {visaInfo.notes}
                    </div>
                </div>
            </div>

            {/* 2. Entry Form Block (Arrival Card) */}
            {hasEntryForm ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 text-blue-600 p-1.5 rounded-full">
                            <FileText size={16} />
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold uppercase">入境必填</div>
                            <div className="text-sm font-bold text-gray-800">{visaInfo.entryFormName || '線上入境卡'}</div>
                        </div>
                    </div>
                    <a 
                        href={visaInfo.entryFormLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
                    >
                        填寫表格 <ExternalLink size={12} />
                    </a>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 px-2">
                    <Info size={14} /> 
                    <span>目前無強制線上入境表格資訊</span>
                </div>
            )}

        </div>
    </div>
  );
};

export default TravelAdvisoryWidget;
