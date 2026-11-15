import React, { useState } from 'react';

export interface ChartSeries {
  id: string;
  label: string;
  unit: string;
  color: string;
  values: number[];
  dashed?: boolean;
  areaFill?: boolean;
}

interface PrecisionLineChartProps {
  title: string;
  subtitle?: string;
  timestamps: string[];
  series: ChartSeries[];
  yLabel: string;
  height?: number;
}

export const PrecisionLineChart: React.FC<PrecisionLineChartProps> = ({
  title,
  subtitle,
  timestamps,
  series,
  yLabel,
  height = 280,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.values);
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 10;
  const span = Math.max(0.5, rawMax - rawMin);
  const yMin = Math.max(0, rawMin - span * 0.14);
  const yMax = rawMax + span * 0.14;

  const n = Math.max(1, timestamps.length);
  const xFor = (idx: number) => (n === 1 ? padLeft + innerW / 2 : padLeft + (idx / (n - 1)) * innerW);
  const yFor = (val: number) => padTop + innerH - ((val - yMin) / (yMax - yMin || 1)) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  const activeIdx = hoverIdx !== null && hoverIdx < n ? hoverIdx : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  backgroundColor: s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
              />
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {timestamps.length === 0 ? (
        <div className="flex h-48 items-center justify-center border border-dashed border-slate-800 text-sm text-slate-400">
          No telemetry samples recorded yet.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full cursor-crosshair select-none overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const ratio = Math.max(0, Math.min(1, (relX - padLeft) / innerW));
              setHoverIdx(Math.round(ratio * (n - 1)));
            }}
          >
            {yTicks.map((tick, idx) => {
              const y = yFor(tick);
              return (
                <g key={idx}>
                  <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#1E293B" strokeWidth="1" />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94A3B8"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            <text
              x={14}
              y={padTop + innerH / 2}
              transform={`rotate(-90 14 ${padTop + innerH / 2})`}
              textAnchor="middle"
              fill="#64748B"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {yLabel}
            </text>

            {series.map((s) => {
              const points = s.values.map((v, idx) => `${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
              const areaPath =
                s.areaFill && s.values.length > 1
                  ? `M ${xFor(0).toFixed(1)},${(padTop + innerH).toFixed(1)} L ${s.values
                      .map((v, idx) => `${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)}`)
                      .join(' L ')} L ${xFor(s.values.length - 1).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`
                  : null;

              return (
                <g key={s.id}>
                  {areaPath && <path d={areaPath} fill={s.color} fillOpacity={0.11} />}
                  <polyline
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2.2"
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                    points={points}
                  />
                  {s.values.map((v, idx) => (
                    <circle
                      key={idx}
                      cx={xFor(idx)}
                      cy={yFor(v)}
                      r={activeIdx === idx ? 4.5 : 2.3}
                      fill={s.color}
                    />
                  ))}
                </g>
              );
            })}

            {timestamps.map((ts, idx) => {
              const showTick = n <= 6 || idx === 0 || idx === n - 1 || idx % Math.ceil(n / 5) === 0;
              if (!showTick) return null;
              const shortTime = ts.includes('T') ? ts.split('T')[1].slice(0, 8) : ts.slice(0, 8);
              return (
                <text
                  key={idx}
                  x={xFor(idx)}
                  y={height - 10}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {shortTime}
                </text>
              );
            })}

            {activeIdx !== null && (
              <line
                x1={xFor(activeIdx)}
                y1={padTop}
                x2={xFor(activeIdx)}
                y2={padTop + innerH}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {activeIdx !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-slate-800 pt-2.5 text-xs font-mono tabular-nums text-slate-300">
              <span className="text-slate-400">{timestamps[activeIdx]}</span>
              {series.map((s) => (
                <span key={s.id} style={{ color: s.color }}>
                  {s.label}: {s.values[activeIdx]?.toFixed(3)} {s.unit}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface EnergyBarItem {
  label: string;
  value: number;
  color: string;
}

export const EnergyComparisonChart: React.FC<{ items: EnergyBarItem[] }> = ({ items }) => {
  const width = 720;
  const height = 260;
  const padLeft = 56;
  const padBottom = 38;
  const padTop = 24;
  const padRight = 20;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const vals = items.map((d) => d.value);
  const maxAbs = Math.max(0.5, ...vals.map((v) => Math.abs(v)));
  const minVal = Math.min(0, ...vals);
  const maxVal = Math.max(0.5, ...vals);
  const range = Math.max(0.5, maxVal - minVal);
  const zeroY = padTop + (maxVal / range) * innerH;
  const yFor = (val: number) => padTop + ((maxVal - val) / range) * innerH;

  const barSlot = innerW / Math.max(1, items.length);
  const barWidth = Math.min(72, barSlot * 0.54);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Net Energy Balance Breakdown</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Comparison of baseline reference yield, improved output, consumption overhead, and net gain (Wh)
          </p>
        </div>
        <span className="font-mono text-xs text-slate-400">Scale ±{maxAbs.toFixed(2)} Wh</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <line x1={padLeft} y1={zeroY} x2={width - padRight} y2={zeroY} stroke="#475569" strokeWidth="1.2" />
        {[0, 0.5, 1].map((f, idx) => {
          const val = minVal + f * range;
          const y = yFor(val);
          return (
            <g key={idx}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#1E293B" strokeWidth="1" />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="#94A3B8"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}

        {items.map((item, idx) => {
          const cx = padLeft + barSlot * (idx + 0.5);
          const x = cx - barWidth / 2;
          const valY = yFor(item.value);
          const rectY = item.value >= 0 ? valY : zeroY;
          const rectH = Math.max(2, Math.abs(zeroY - valY));

          return (
            <g key={item.label}>
              <rect x={x} y={rectY} width={barWidth} height={rectH} rx="4" fill={item.color} fillOpacity="0.9" />
              <text
                x={cx}
                y={item.value >= 0 ? rectY - 7 : rectY + rectH + 13}
                textAnchor="middle"
                fill="#E2E8F0"
                fontSize="11"
                fontFamily="JetBrains Mono, monospace"
              >
                {item.value >= 0 ? `+${item.value.toFixed(3)}` : item.value.toFixed(3)}
              </text>
              <text x={cx} y={height - 12} textAnchor="middle" fill="#94A3B8" fontSize="11">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
