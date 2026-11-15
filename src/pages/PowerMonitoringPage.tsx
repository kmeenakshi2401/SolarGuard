import React, { useMemo, useState } from 'react';
import { PrecisionLineChart } from '../components/TelemetryCharts';
import { TextReportBanner } from '../components/TextReportBanner';
import type { TelemetryPoint } from '../types/solarguard';
import {
  calculateAccumulatedEnergyWh,
  calculatePanelEfficiencyPct,
  evaluatePowerEfficiencyAndRuntime,
} from '../utils/calculations';

interface PowerMonitoringPageProps {
  history: TelemetryPoint[];
  accumulatedEnergyWh: number;
  avgDustPct: number;
  cleaningThresholdPct: number;
  ldrPct: number | null;
}

export const PowerMonitoringPage: React.FC<PowerMonitoringPageProps> = ({
  history,
  accumulatedEnergyWh,
  avgDustPct,
  cleaningThresholdPct,
  ldrPct,
}) => {
  const latest = history[history.length - 1];

  const [panelAreaM2, setPanelAreaM2] = useState<string>('0.036');
  const [ratedEffPct, setRatedEffPct] = useState<string>('18.5');
  const [irradianceWm2, setIrradianceWm2] = useState<string>(
    ldrPct !== null ? Math.max(150, Math.round(ldrPct * 10)).toString() : '820'
  );
  const [soilingRateDay, setSoilingRateDay] = useState<string>('3.5');
  const [batteryCapWh, setBatteryCapWh] = useState<string>('20');
  const [loadPowerW, setLoadPowerW] = useState<string>('1.8');

  const areaVal = Math.max(0.005, Number(panelAreaM2) || 0.036);
  const ratedVal = Math.max(1, Number(ratedEffPct) || 18.5);
  const irrVal = Math.max(50, Number(irradianceWm2) || 820);
  const soilVal = Math.max(0.2, Number(soilingRateDay) || 3.5);
  const battVal = Math.max(1, Number(batteryCapWh) || 20);
  const loadVal = Math.max(0.2, Number(loadPowerW) || 1.8);

  const forecast = useMemo(
    () =>
      evaluatePowerEfficiencyAndRuntime({
        powerHistoryW: history.map((h) => h.powerW),
        irradianceWm2: irrVal,
        panelAreaM2: areaVal,
        ratedEfficiencyPct: ratedVal,
        panelTempC: latest.panelTempC,
        avgDustPct,
        soilingRatePctPerDay: soilVal,
        cleaningThresholdPct,
        batteryCapacityWh: battVal,
        loadPowerW: loadVal,
      }),
    [history, irrVal, areaVal, ratedVal, latest.panelTempC, avgDustPct, soilVal, cleaningThresholdPct, battVal, loadVal]
  );

  const efficiencySeries = useMemo(
    () => history.map((h) => calculatePanelEfficiencyPct(h.powerW, irrVal, areaVal)),
    [history, irrVal, areaVal]
  );

  const cumulativeSeries = useMemo(
    () => history.map((_, idx) => calculateAccumulatedEnergyWh(history.slice(0, idx + 1))),
    [history]
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">INA219 ELECTRICAL &amp; EFFICIENCY TELEMETRY</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">
            Solar Power, Real-Time Efficiency &amp; Effective Runtime Outlook
          </h2>
        </div>
        <span className="text-xs text-slate-400">
          η = P_out / (G × A) × 100 · Historical variation &amp; runtime projection
        </span>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Bus Voltage</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {latest.voltageV.toFixed(2)} <span className="text-xs text-slate-400">V</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">INA219 high-side sense</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Load Current</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {latest.currentA.toFixed(3)} <span className="text-xs text-slate-400">A</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Instantaneous array current</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Instantaneous Power</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
            {latest.powerW.toFixed(3)} <span className="text-xs text-slate-400">W</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Energy: {accumulatedEnergyWh.toFixed(4)} Wh</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Current Panel Efficiency</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-sky-400 tabular-nums">
            {forecast.currentEfficiencyPct.toFixed(2)} <span className="text-xs text-slate-400">%</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {forecast.efficiencyRetentionPct.toFixed(1)}% of {ratedVal.toFixed(1)}% STC rating
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Earlier Efficiency Variation</div>
          <div className="mt-2 font-mono text-xl font-semibold text-amber-300 tabular-nums">
            {forecast.minEarlierEfficiencyPct.toFixed(1)}–{forecast.maxEarlierEfficiencyPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Mean {forecast.avgEarlierEfficiencyPct.toFixed(2)}% · Δ {forecast.efficiencyDeltaPct >= 0 ? '+' : ''}
            {forecast.efficiencyDeltaPct.toFixed(2)}%
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Effective Daylight Left Today</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
            ~{forecast.estimatedEffectiveDaylightHours.toFixed(1)} <span className="text-xs text-slate-400">hrs</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Based on {irrVal.toFixed(0)} W/m² irradiance</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Days Before Cleaning Trigger</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-sky-300 tabular-nums">
            ~{forecast.estimatedDaysBeforeCleaning.toFixed(1)} <span className="text-xs text-slate-400">days</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {avgDustPct.toFixed(1)}% avg dust vs {cleaningThresholdPct}% trigger
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Thermal Derating Margin</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              forecast.thermalMarginToDerateC >= 10 ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {forecast.thermalMarginToDerateC >= 0 ? '+' : ''}
            {forecast.thermalMarginToDerateC.toFixed(1)} <span className="text-xs text-slate-400">°C</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Headroom below 65 °C critical temp</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Combined Load Autonomy</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            ~{forecast.batteryAutonomyHours.toFixed(1)} <span className="text-xs text-slate-400">hrs</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {battVal.toFixed(0)} Wh storage + solar @ {loadVal.toFixed(1)} W load
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">Array &amp; Load Sizing Parameters</h3>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-slate-400">Active Area (m²)</label>
            <input
              type="number"
              step="0.002"
              value={panelAreaM2}
              onChange={(e) => setPanelAreaM2(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Rated STC Eff (%)</label>
            <input
              type="number"
              step="0.5"
              value={ratedEffPct}
              onChange={(e) => setRatedEffPct(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Irradiance (W/m²)</label>
            <input
              type="number"
              step="20"
              value={irradianceWm2}
              onChange={(e) => setIrradianceWm2(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Soiling (%/day)</label>
            <input
              type="number"
              step="0.5"
              value={soilingRateDay}
              onChange={(e) => setSoilingRateDay(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Storage (Wh)</label>
            <input
              type="number"
              step="1"
              value={batteryCapWh}
              onChange={(e) => setBatteryCapWh(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Load Draw (W)</label>
            <input
              type="number"
              step="0.1"
              value={loadPowerW}
              onChange={(e) => setLoadPowerW(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
        </div>
      </section>

      <PrecisionLineChart
        title="Panel Conversion Efficiency (%) Over Time (Earlier Variation)"
        subtitle="Instantaneous efficiency η compared across earlier samples in the active run"
        timestamps={history.map((h) => h.timestamp)}
        yLabel="Efficiency (%)"
        series={[
          {
            id: 'efficiency',
            label: 'Conversion Efficiency',
            unit: '%',
            color: '#F59E0B',
            values: efficiencySeries,
            areaFill: true,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PrecisionLineChart
          title="Instantaneous Electrical Power Trend"
          subtitle="Live Watts computed from voltage and current samples"
          timestamps={history.map((h) => h.timestamp)}
          yLabel="Power (W)"
          series={[
            {
              id: 'power',
              label: 'Output Power',
              unit: 'W',
              color: '#22C55E',
              values: history.map((h) => h.powerW),
              areaFill: true,
            },
          ]}
        />

        <PrecisionLineChart
          title="Accumulated Energy Curve"
          subtitle="Trapezoidal Wh integration using actual sampling intervals"
          timestamps={history.map((h) => h.timestamp)}
          yLabel="Energy (Wh)"
          series={[
            {
              id: 'energy',
              label: 'Accumulated Energy',
              unit: 'Wh',
              color: '#38BDF8',
              values: cumulativeSeries,
              areaFill: true,
            },
          ]}
        />
      </div>

      <TextReportBanner
        title="POWER EFFICIENCY & RUNTIME REPORT"
        summary={forecast.summaryReport}
        highlights={[
          `Current Efficiency: ${forecast.currentEfficiencyPct.toFixed(2)}% (${forecast.efficiencyRetentionPct.toFixed(1)}% of STC rating)`,
          `Earlier Range: ${forecast.minEarlierEfficiencyPct.toFixed(2)}% – ${forecast.maxEarlierEfficiencyPct.toFixed(2)}% (mean ${forecast.avgEarlierEfficiencyPct.toFixed(2)}%)`,
          `Effective Runtime: ~${forecast.estimatedEffectiveDaylightHours.toFixed(1)} hrs daylight · ~${forecast.batteryAutonomyHours.toFixed(1)} hrs load autonomy · ~${forecast.estimatedDaysBeforeCleaning.toFixed(1)} days to next clean`,
        ]}
      />
    </div>
  );
};
