import React from 'react';
import { TextReportBanner } from '../components/TextReportBanner';
import type { PanelWeatherDecision, WeatherDecisionConfig } from '../types/solarguard';

interface DecisionsPageProps {
  decisions: PanelWeatherDecision[];
  config: WeatherDecisionConfig;
  onUpdateConfig: (patch: Partial<WeatherDecisionConfig>) => void;
}

export const DecisionsPage: React.FC<DecisionsPageProps> = ({
  decisions,
  config,
  onUpdateConfig,
}) => {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">WEATHER-AWARE DECISION ENGINE</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Per-Panel Intelligent Cleaning Decisions</h2>
        </div>
        <span className="text-xs text-slate-400">
          8-condition priority matrix · Configurable environmental &amp; soiling calibration
        </span>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Max Humidity for Cleaning</span>
            <span className="font-mono tabular-nums">{config.maxHumidityPct.toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={95}
            step={1}
            value={config.maxHumidityPct}
            onChange={(e) => onUpdateConfig({ maxHumidityPct: Number(e.target.value) })}
            className="w-full accent-sky-500"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Minimum Dust Trigger</span>
            <span className="font-mono tabular-nums">{config.minDustForCleaningPct.toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={config.minDustForCleaningPct}
            onChange={(e) => onUpdateConfig({ minDustForCleaningPct: Number(e.target.value) })}
            className="w-full accent-sky-500"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Critical Dust Threshold</span>
            <span className="font-mono tabular-nums">{config.criticalDustPct.toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={15}
            max={60}
            step={1}
            value={config.criticalDustPct}
            onChange={(e) => onUpdateConfig({ criticalDustPct: Number(e.target.value) })}
            className="w-full accent-rose-500"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Panel Hot Threshold</span>
            <span className="font-mono tabular-nums">{config.panelTempThresholdC.toFixed(0)} °C</span>
          </div>
          <input
            type="range"
            min={32}
            max={68}
            step={1}
            value={config.panelTempThresholdC}
            onChange={(e) => onUpdateConfig({ panelTempThresholdC: Number(e.target.value) })}
            className="w-full accent-amber-500"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Min Light Intensity (LDR)</span>
            <span className="font-mono tabular-nums">{config.minLightIntensityPct.toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={config.minLightIntensityPct}
            onChange={(e) => onUpdateConfig({ minLightIntensityPct: Number(e.target.value) })}
            className="w-full accent-amber-500"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-300">
            <span>Min Power Loss Trigger</span>
            <span className="font-mono tabular-nums">{config.minPowerLossPct.toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={config.minPowerLossPct}
            onChange={(e) => onUpdateConfig({ minPowerLossPct: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
      </section>

      <section className="space-y-4">
        {decisions.map((d) => {
          const dustyZones =
            d.selectedZones
              .map((on, i) => (on ? `Zone ${i + 1}` : null))
              .filter(Boolean)
              .join(', ') || 'None';

          return (
            <div key={d.panelId} className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div>
                  <span className="font-mono text-sm font-semibold text-sky-300">Panel {d.panelId}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="text-xs text-slate-400">{d.conditionCode}</span>
                </div>
                <span
                  className={`font-mono text-xs font-semibold ${
                    d.cleaningEligible ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {d.cleaningEligible ? `PERMITTED · ${d.zoneCommand}` : 'NO CLEANING / WAIT'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <div className="text-slate-400">Dusty Zones</div>
                  <div className="mt-0.5 font-mono text-slate-100">{dustyZones}</div>
                </div>
                <div>
                  <div className="text-slate-400">Humidity</div>
                  <div className="mt-0.5 font-mono text-slate-100">{d.humidityStatus}</div>
                </div>
                <div>
                  <div className="text-slate-400">Rain Status</div>
                  <div className="mt-0.5 font-mono text-slate-100">{d.rainStatus}</div>
                </div>
                <div>
                  <div className="text-slate-400">Panel Temp</div>
                  <div className="mt-0.5 font-mono text-slate-100">{d.panelTempStatus}</div>
                </div>
                <div>
                  <div className="text-slate-400">Passive PCM Cooling</div>
                  <div className="mt-0.5 font-mono text-sky-300">
                    {d.passiveCoolingActive ? 'Active' : 'Standby'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Recommended Action</div>
                  <div className="mt-0.5 text-slate-100">{d.recommendedAction}</div>
                </div>
              </div>

              <p className="mt-3 rounded-lg border border-slate-800/90 bg-[#090F1D] px-3 py-2 text-xs text-slate-300">
                {d.reason}
              </p>
            </div>
          );
        })}
      </section>

      <TextReportBanner
        title="INTELLIGENT WEATHER-GATED DECISION REPORT"
        summary={(() => {
          const permitted = decisions.filter((d) => d.cleaningEligible);
          const coolingActive = decisions.filter((d) => d.passiveCoolingActive).length;
          return `Evaluated ${decisions.length} solar panel(s) against the 8-condition environmental priority matrix (max RH ${config.maxHumidityPct.toFixed(0)}%, cleaning trigger > ${config.minDustForCleaningPct.toFixed(0)}%, critical dust > ${config.criticalDustPct.toFixed(0)}%, min LDR ${config.minLightIntensityPct.toFixed(0)}%). ${permitted.length === 0 ? 'No panels are currently scheduled for active EDS cleaning; standby energy conservation and passive thermal monitoring remain active.' : `${permitted.length} panel(s) are cleared for selective cleaning: ${permitted.map((d) => `Panel ${d.panelId} (${d.zoneCommand})`).join(', ')}.`} Passive PCM thermal regulation is active on ${coolingActive} panel(s).`;
        })()}
        highlights={[
          `Eligible panels: ${decisions.filter((d) => d.cleaningEligible).length} of ${decisions.length}`,
          `Humidity ceiling: ${config.maxHumidityPct.toFixed(0)}% RH · Min LDR: ${config.minLightIntensityPct.toFixed(0)}%`,
          `Dust triggers: > ${config.minDustForCleaningPct.toFixed(0)}% (std) / > ${config.criticalDustPct.toFixed(0)}% (critical)`,
        ]}
      />
    </div>
  );
};
