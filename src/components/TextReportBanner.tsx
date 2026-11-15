import React from 'react';
import { FileText } from 'lucide-react';

interface TextReportBannerProps {
  title: string;
  summary: string;
  highlights?: string[];
}

export const TextReportBanner: React.FC<TextReportBannerProps> = ({
  title,
  summary,
  highlights,
}) => {
  return (
    <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
      <div className="flex items-center gap-2 text-xs font-mono tracking-wider text-sky-400">
        <FileText className="h-3.5 w-3.5" />
        <span>{title}</span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{summary}</p>
      {highlights && highlights.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-800/80 pt-3 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              · {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
