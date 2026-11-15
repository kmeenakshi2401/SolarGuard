import React from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type {
  CleaningDecision,
  EnergyBalanceReport,
  NavPageId,
  OperatingMode,
  TelemetryPoint,
} from '../types/solarguard';
import { TextReportBanner } from '../components/TextReportBanner';
import { calculateTemperatureReduction, classifyDustLevel } from '../utils/calculations';

interface HomePageProps {
  mode: OperatingMode;
  serialConnected: boolean;
  serialPortLabel: string;
  latest: TelemetryPoint;
  accumulatedEnergyWh: number;
  zoneDust: number[];
  cleanThreshold: number;
  moderateThreshold: number;
  decision: CleaningDecision;
  cleaningStatus: string;
  activeLeds: boolean[];
  energyReport: EnergyBalanceReport;
  onNavigate: (page: NavPageId) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  mode,
  serialConnected,
  serialPortLabel,
  latest,
  accumulatedEnergyWh,
  zoneDust,
  cleanThreshold,
  moderateThreshold,
  decision,
  cleaningStatus,
  activeLeds,
  energyReport,
  onNavigate,
}) => {
  const overallDust = zoneDust.reduce((a, b) => a + b, 0) / 4;
  const tempReduction = calculateTemperatureReduction(latest.referenceTempC, latest.panelTempC);

  const connectionText =
    mode === 'HARDWARE'
      ? serialConnected
        ? `ESP32 Connected · ${serialPortLabel}`
        : 'ESP32 Disconnected'
      : 'Simulation Mode Active';

  const connectionTone =
    mode === 'HARDWARE'
      ? serialConnected
        ? 'text-emerald-400'
        : 'text-rose-400'
      : 'text-sky-400';

  const metrics = [
    {
      label: 'System Connection',
      value: mode === 'HARDWARE' ? (serialConnected ? 'CONNECTED' : 'OFFLINE') : 'SIMULATED',
      unit: '',
      sub: connectionText,
      tone: connectionTone,
    },
    {
      label: 'Solar Panel Temp',
      value: latest.panelTempC.toFixed(1),
      unit: '°C',
      sub: `Cooling reduction ${tempReduction >= 0 ? '-' : '+'}${Math.abs(tempReduction).toFixed(1)} °C vs ref`,
      tone: 'text-amber-300',
    },
    {
      label: 'Cooling Assembly Temp',
      value: latest.coolingTempC.toFixed(1),
      unit: '°C',
      sub: 'Dedicated DS18B20 heatsink probe',
      tone: 'text-sky-300',
    },
    {
      label: 'Bus Voltage',
      value: latest.voltageV.toFixed(2),
      unit: 'V',
      sub: 'INA219 high-side sense',
      tone: 'text-slate-100',
    },
    {
      label: 'Panel Current',
      value: latest.currentA.toFixed(3),
      unit: 'A',
      sub: 'Load circuit current',
      tone: 'text-slate-100',
    },
    {
      label: 'Output Power',
      value: latest.powerW.toFixed(3),
      unit: 'W',
      sub: `Instantaneous V × I · ${latest.source}`,
      tone: 'text-emerald-400',
    },
    {
      label: 'Generated Energy',
      value: accumulatedEnergyWh.toFixed(4),
      unit: 'Wh',
      sub: 'Timestamp-integrated session total',
      tone: 'text-emerald-300',
    },
    {
      label: 'Overall Est. Dust',
      value: overallDust.toFixed(1),
      unit: '%',
      sub: 'Optical 4-zone surface estimate',
      tone: overallDust > moderateThreshold ? 'text-rose-400' : overallDust > cleanThreshold ? 'text-amber-300' : 'text-emerald-400',
    },
    {
      label: 'Net Energy Benefit',
      value: `${energyReport.netEnergyBenefitWh >= 0 ? '+' : ''}${energyReport.netEnergyBenefitWh.toFixed(4)}`,
      unit: 'Wh',
      sub: `${energyReport.balanceStatus} · ${energyReport.dataSource}`,
      tone: energyReport.netEnergyBenefitWh >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Cleaning Status',
      value: cleaningStatus.replace(/_/g, ' '),
      unit: '',
      sub: `Command ${decision.command}`,
      tone: decision.emergencyStopActive ? 'text-rose-400' : 'text-sky-300',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="max-w-3xl">
          <p className="text-xs font-mono tracking-wider text-sky-400">SYSTEM OVERVIEW</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Intelligent Solar Panel Monitoring &amp; Selective Cleaning
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            Real-time telemetry, four-zone optical dust estimation, selective indicator control, and net energy balance verification.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{latest.source === 'SIMULATION' ? 'Simulated Sensor Stream' : 'ESP32 Hardware Stream'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{latest.timestamp}</span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
            <div className="text-xs font-medium text-slate-400">{m.label}</div>
            <div className={`mt-2 flex items-baseline font-mono tabular-nums ${m.tone}`}>
              <span className="text-2xl font-semibold tracking-tight truncate">{m.value}</span>
              {m.unit && <span className="ml-1.5 text-xs uppercase text-slate-400">{m.unit}</span>}
            </div>
            <div className="mt-2 truncate text-xs text-slate-400">{m.sub}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Four-Zone Dust &amp; Indicator Matrix</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Clean 0–{cleanThreshold}% · Moderate &gt;{cleanThreshold}–{moderateThreshold}% · Dusty &gt;{moderateThreshold}%
              </p>
            </div>
            <button
              onClick={() => onNavigate('vision')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/60 hover:text-sky-300 whitespace-nowrap shrink-0"
            >
              Open Vision &amp; Calibration
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {zoneDust.map((pct, idx) => {
              const cls = classifyDustLevel(pct, cleanThreshold, moderateThreshold);
              const isClean = cls === 'Clean';
              const isModerate = cls === 'Moderate dust';
              const ledOn = activeLeds[idx];
              const toneClass = isClean
                ? 'text-emerald-400'
                : isModerate
                  ? 'text-amber-300'
                  : 'text-rose-400';

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-[#090F1D] px-4 py-3.5"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-200">Zone {idx + 1}</div>
                    <div className={`mt-0.5 text-xs ${toneClass}`}>{cls}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-xl font-semibold tabular-nums ${toneClass}`}>
                      {pct.toFixed(1)}%
                    </div>
                    <div className={`mt-0.5 font-mono text-xs ${ledOn ? 'text-emerald-400' : 'text-slate-500'}`}>
                      LED {ledOn ? 'ON' : 'OFF'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              <span>Selective Dispatch &amp; Safety</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Selective cleaning targets only quadrants exceeding the {moderateThreshold}% dust threshold, avoiding wasted cleaning power on clean zones.
            </p>
            <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Generated Command</span>
                <span className="font-mono font-semibold text-sky-300">{decision.command}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Output Driver</span>
                <span className="font-mono text-slate-200">Indicator LEDs Only</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">HV EDS Interlock</span>
                <span className="font-mono text-amber-300">Disabled (Isolated)</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate('cleaning')}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500 whitespace-nowrap"
            >
              Cleaning Control
            </button>
            <button
              onClick={() => onNavigate('energy')}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 whitespace-nowrap"
            >
              Net Energy Calc
            </button>
          </div>
        </div>
      </section>

      <TextReportBanner
        title="EXECUTIVE SYSTEM STATUS REPORT"
        summary={`SolarGuard is operating in ${mode} mode (${connectionText}). Array output stands at ${latest.powerW.toFixed(3)} W (${latest.voltageV.toFixed(2)} V × ${latest.currentA.toFixed(3)} A) with ${accumulatedEnergyWh.toFixed(4)} Wh generated this session. Passive thermal assembly holds the panel at ${latest.panelTempC.toFixed(1)} °C (${tempReduction >= 0 ? `-${tempReduction.toFixed(1)}` : `+${Math.abs(tempReduction).toFixed(1)}`} °C vs uncooled reference). Mean surface soiling is ${overallDust.toFixed(1)}% with selective mask ${decision.command} (${cleaningStatus.replace(/_/g, ' ')}) and a ${energyReport.netEnergyBenefitWh >= 0 ? 'positive' : 'negative'} net energy balance of ${energyReport.netEnergyBenefitWh >= 0 ? '+' : ''}${energyReport.netEnergyBenefitWh.toFixed(4)} Wh.`}
        highlights={[
          `Electrical output: ${latest.powerW.toFixed(3)} W · Accumulated: ${accumulatedEnergyWh.toFixed(4)} Wh`,
          `Thermal delta: ${tempReduction >= 0 ? `-${tempReduction.toFixed(1)}` : `+${Math.abs(tempReduction).toFixed(1)}`} °C · Cooler probe: ${latest.coolingTempC.toFixed(1)} °C`,
          `Selective mask: ${decision.command} · Net energy balance: ${energyReport.netEnergyBenefitWh >= 0 ? '+' : ''}${energyReport.netEnergyBenefitWh.toFixed(4)} Wh`,
        ]}
      />
    </div>
  );
};
