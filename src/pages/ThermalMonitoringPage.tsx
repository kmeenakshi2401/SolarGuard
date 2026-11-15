import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { PrecisionLineChart } from '../components/TelemetryCharts';
import { TextReportBanner } from '../components/TextReportBanner';
import type { CsvRow, OperatingMode, TelemetryPoint } from '../types/solarguard';
import { calculateTemperatureReduction } from '../utils/calculations';

interface ThermalMonitoringPageProps {
  mode: OperatingMode;
  history: TelemetryPoint[];
  experimentRows: CsvRow[];
  onAppendExperiment: (row: Record<string, unknown>) => Promise<void>;
}

export const ThermalMonitoringPage: React.FC<ThermalMonitoringPageProps> = ({
  mode,
  history,
  experimentRows,
  onAppendExperiment,
}) => {
  const latest = history[history.length - 1];
  const deltaT = calculateTemperatureReduction(latest.referenceTempC, latest.panelTempC);

  const [configName, setConfigName] = useState('Aluminum Fin + Water Mist Pulse');
  const [refTemp, setRefTemp] = useState('51.4');
  const [cooledTemp, setCooledTemp] = useState(latest.panelTempC.toFixed(1));
  const [assemblyTemp, setAssemblyTemp] = useState(latest.coolingTempC.toFixed(1));
  const [notes, setNotes] = useState('30-minute irradiance stabilized trial');
  const [saving, setSaving] = useState(false);

  const handleLogTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const refVal = Number(refTemp) || 0;
    const cooledVal = Number(cooledTemp) || 0;
    const asmVal = Number(assemblyTemp) || 0;
    try {
      await onAppendExperiment({
        data_source: mode === 'HARDWARE' ? 'EXPERIMENTAL' : 'SIMULATION',
        cooling_config: configName,
        reference_panel_temp_c: refVal.toFixed(2),
        cooled_panel_temp_c: cooledVal.toFixed(2),
        cooling_assembly_temp_c: asmVal.toFixed(2),
        temp_reduction_c: calculateTemperatureReduction(refVal, cooledVal).toFixed(2),
        avg_power_w: latest.powerW.toFixed(3),
        dust_coverage_avg_pct: '8.5',
        selected_zones: '0000',
        notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">THERMAL INSTRUMENTATION</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Panel &amp; Cooling Assembly Thermal Analysis</h2>
        </div>
        <span className="text-xs text-slate-400">
          DS18B20 Dual-Probe Separation · Panel surface temperature tracked independently from cooling assembly
        </span>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Solar Panel Surface Temp (DS18B20 #1)</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
            {latest.panelTempC.toFixed(2)} <span className="text-xs text-slate-400">°C</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Uncooled Ref: {latest.referenceTempC.toFixed(1)} °C</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Cooling Assembly Temp (DS18B20 #2)</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-sky-300 tabular-nums">
            {latest.coolingTempC.toFixed(2)} <span className="text-xs text-slate-400">°C</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Rear heatsink / fin substrate probe</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Temperature Reduction (Ref − Cooled)</div>
          <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${deltaT >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {deltaT >= 0 ? `-${deltaT.toFixed(2)}` : `+${Math.abs(deltaT).toFixed(2)}`} <span className="text-xs text-slate-400">°C</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Est. Si-PV thermal recovery: +{(deltaT * 0.4).toFixed(2)}% relative
          </div>
        </div>
      </section>

      <PrecisionLineChart
        title="Temperature-versus-Time Profile"
        subtitle="Panel surface probe compared against independent cooling assembly probe"
        timestamps={history.map((h) => h.timestamp)}
        yLabel="Temp (°C)"
        series={[
          {
            id: 'panel',
            label: 'Solar Panel Temp',
            unit: '°C',
            color: '#F59E0B',
            values: history.map((h) => h.panelTempC),
          },
          {
            id: 'cooling',
            label: 'Cooling Assembly Temp',
            unit: '°C',
            color: '#38BDF8',
            values: history.map((h) => h.coolingTempC),
          },
          {
            id: 'reference',
            label: 'Uncooled Baseline Ref',
            unit: '°C',
            color: '#64748B',
            values: history.map((h) => h.referenceTempC),
            dashed: true,
          },
        ]}
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleLogTrial} className="space-y-3 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Record Cooling Configuration Trial</h3>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Configuration Name</label>
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Ref (°C)</label>
              <input
                type="number"
                step="0.1"
                value={refTemp}
                onChange={(e) => setRefTemp(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Cooled (°C)</label>
              <input
                type="number"
                step="0.1"
                value={cooledTemp}
                onChange={(e) => setCooledTemp(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Cooler (°C)</label>
              <input
                type="number"
                step="0.1"
                value={assemblyTemp}
                onChange={(e) => setAssemblyTemp(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Experimental Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Appending to CSV...' : 'Append Trial to experiment_results.csv'}
          </button>
        </form>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Cooling Configuration Comparison Records</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Configuration</th>
                  <th className="py-2 pr-3 text-right font-medium">Ref °C</th>
                  <th className="py-2 pr-3 text-right font-medium">Cooled °C</th>
                  <th className="py-2 pr-3 text-right font-medium">Assembly °C</th>
                  <th className="py-2 pr-3 text-right font-medium">Reduction</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-300">
                {experimentRows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-3 font-sans text-slate-200">{r.cooling_config}</td>
                    <td className="py-2.5 pr-3 text-right">{r.reference_panel_temp_c}</td>
                    <td className="py-2.5 pr-3 text-right text-amber-300">{r.cooled_panel_temp_c}</td>
                    <td className="py-2.5 pr-3 text-right text-sky-300">{r.cooling_assembly_temp_c}</td>
                    <td className="py-2.5 pr-3 text-right text-emerald-400">-{r.temp_reduction_c} °C</td>
                    <td className="py-2.5 text-slate-400">{r.data_source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <TextReportBanner
        title="THERMAL & COOLING ASSEMBLY REPORT"
        summary={`DS18B20 probe #1 measures a solar panel surface temperature of ${latest.panelTempC.toFixed(2)} °C against an uncooled baseline reference of ${latest.referenceTempC.toFixed(1)} °C (${deltaT >= 0 ? `-${deltaT.toFixed(2)}` : `+${Math.abs(deltaT).toFixed(2)}`} °C net thermal shift), while probe #2 tracks the rear cooling assembly independently at ${latest.coolingTempC.toFixed(2)} °C. Based on the standard -0.40%/°C crystalline-silicon temperature coefficient, passive cooling recovers an estimated +${(deltaT * 0.4).toFixed(2)}% relative conversion efficiency across ${experimentRows.length} archived cooling trial(s).`}
        highlights={[
          `Panel surface: ${latest.panelTempC.toFixed(2)} °C · Cooler substrate: ${latest.coolingTempC.toFixed(2)} °C`,
          `Thermal reduction: ${deltaT >= 0 ? `-${deltaT.toFixed(2)}` : `+${Math.abs(deltaT).toFixed(2)}`} °C vs ${latest.referenceTempC.toFixed(1)} °C ref`,
          `Archived trials in experiment_results.csv: ${experimentRows.length}`,
        ]}
      />
    </div>
  );
};
