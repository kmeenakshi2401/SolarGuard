import React, { useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { EnergyComparisonChart } from '../components/TelemetryCharts';
import { TextReportBanner } from '../components/TextReportBanner';
import type { EnergyBalanceReport, OperatingMode } from '../types/solarguard';
import { calculateNetEnergyBenefit } from '../utils/calculations';

interface EnergyAnalysisPageProps {
  mode: OperatingMode;
  report: EnergyBalanceReport;
  onUpdateReport: (report: EnergyBalanceReport, saveToCsv: boolean, notes: string) => Promise<void>;
}

export const EnergyAnalysisPage: React.FC<EnergyAnalysisPageProps> = ({
  mode,
  report,
  onUpdateReport,
}) => {
  const [refEnergy, setRefEnergy] = useState(report.referenceEnergyWh.toString());
  const [impEnergy, setImpEnergy] = useState(report.improvedEnergyWh.toString());
  const [edsEnergy, setEdsEnergy] = useState(report.edsCleaningEnergyWh.toString());
  const [ctrlEnergy, setCtrlEnergy] = useState(report.controllerEnergyWh.toString());
  const [periodMin, setPeriodMin] = useState(report.observationPeriodMin.toString());
  const [irradiance, setIrradiance] = useState(report.irradianceWm2.toString());
  const [dataSource, setDataSource] = useState<'SIMULATION' | 'EXPERIMENTAL'>(
    mode === 'HARDWARE' ? 'EXPERIMENTAL' : 'SIMULATION'
  );
  const [notes, setNotes] = useState('Selective 2-zone cleaning under comparable irradiance');
  const [saving, setSaving] = useState(false);

  const previewReport = calculateNetEnergyBenefit({
    referenceEnergyWh: Number(refEnergy) || 0,
    improvedEnergyWh: Number(impEnergy) || 0,
    edsCleaningEnergyWh: Number(edsEnergy) || 0,
    controllerEnergyWh: Number(ctrlEnergy) || 0,
    dataSource,
    observationPeriodMin: Number(periodMin) || 60,
    irradianceWm2: Number(irradiance) || 800,
  });

  const handleCompute = async (saveToCsv: boolean) => {
    setSaving(true);
    try {
      await onUpdateReport(previewReport, saveToCsv, notes);
    } finally {
      setSaving(false);
    }
  };

  const isPositive = previewReport.netEnergyBenefitWh >= 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">RESEARCH EVALUATION</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Net Energy Benefit Calculator</h2>
        </div>
        <span className="font-mono text-xs text-slate-400">
          Net Benefit = (Improved − Reference) − (EDS Cleaning + Controller)
        </span>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Additional Energy</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-sky-300 tabular-nums">
            {previewReport.additionalEnergyWh >= 0 ? '+' : ''}
            {previewReport.additionalEnergyWh.toFixed(4)} <span className="text-xs text-slate-400">Wh</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">+{previewReport.energyGainPct.toFixed(1)}% vs uncleaned</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Cleaning Consumption</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
            {previewReport.edsCleaningEnergyWh.toFixed(4)} <span className="text-xs text-slate-400">Wh</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">Selective zone actuation</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Controller Consumption</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
            {previewReport.controllerEnergyWh.toFixed(4)} <span className="text-xs text-slate-400">Wh</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">ESP32 + INA219 + DS18B20</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Net Energy Benefit</div>
          <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {previewReport.netEnergyBenefitWh >= 0 ? '+' : ''}
            {previewReport.netEnergyBenefitWh.toFixed(4)} <span className="text-xs text-slate-400">Wh</span>
          </div>
          <div className={`mt-1 text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {previewReport.balanceStatus} ENERGY BALANCE
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Data Classification</div>
          <div className="mt-2 font-mono text-lg font-semibold text-slate-100">{previewReport.dataSource}</div>
          <div className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
            {previewReport.observationPeriodMin} min · {previewReport.irradianceWm2} W/m²
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Experimental / Simulated Inputs</h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="mb-1 block text-slate-400">Reference Energy (Wh)</label>
              <input
                type="number"
                step="0.01"
                value={refEnergy}
                onChange={(e) => setRefEnergy(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Improved Energy (Wh)</label>
              <input
                type="number"
                step="0.01"
                value={impEnergy}
                onChange={(e) => setImpEnergy(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">EDS Cleaning (Wh)</label>
              <input
                type="number"
                step="0.005"
                value={edsEnergy}
                onChange={(e) => setEdsEnergy(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Controller (Wh)</label>
              <input
                type="number"
                step="0.005"
                value={ctrlEnergy}
                onChange={(e) => setCtrlEnergy(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Period (min)</label>
              <input
                type="number"
                step="5"
                value={periodMin}
                onChange={(e) => setPeriodMin(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Irradiance (W/m²)</label>
              <input
                type="number"
                step="10"
                value={irradiance}
                onChange={(e) => setIrradiance(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-slate-100"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="mb-1 block text-slate-400">Measurement Tag</label>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as 'SIMULATION' | 'EXPERIMENTAL')}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-slate-100"
            >
              <option value="SIMULATION">SIMULATION (Baseline Prototype Model)</option>
              <option value="EXPERIMENTAL">EXPERIMENTAL (Physical Bench Trial)</option>
            </select>
          </div>

          <div className="text-xs">
            <label className="mb-1 block text-slate-400">Trial Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-slate-100"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleCompute(false)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500"
            >
              <Calculator className="h-3.5 w-3.5" />
              Apply to Dashboard
            </button>
            <button
              onClick={() => handleCompute(true)}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save to CSV'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <EnergyComparisonChart
            items={[
              { label: 'Reference', value: previewReport.referenceEnergyWh, color: '#64748B' },
              { label: 'Improved', value: previewReport.improvedEnergyWh, color: '#38BDF8' },
              { label: 'Additional Gain', value: previewReport.additionalEnergyWh, color: '#22C55E' },
              { label: 'Total Overhead', value: previewReport.totalConsumptionWh, color: '#F59E0B' },
              {
                label: 'Net Benefit',
                value: previewReport.netEnergyBenefitWh,
                color: isPositive ? '#22C55E' : '#EF4444',
              },
            ]}
          />
        </div>
      </section>

      <TextReportBanner
        title="NET ENERGY BALANCE EVALUATION REPORT"
        summary={`Over the ${previewReport.observationPeriodMin}-minute evaluation window at ${previewReport.irradianceWm2} W/m² (${previewReport.dataSource}), SolarGuard improved generation from ${previewReport.referenceEnergyWh.toFixed(4)} Wh to ${previewReport.improvedEnergyWh.toFixed(4)} Wh — yielding ${previewReport.additionalEnergyWh >= 0 ? '+' : ''}${previewReport.additionalEnergyWh.toFixed(4)} Wh (+${previewReport.energyGainPct.toFixed(1)}%) additional energy. Subtracting ${previewReport.edsCleaningEnergyWh.toFixed(4)} Wh EDS actuation and ${previewReport.controllerEnergyWh.toFixed(4)} Wh controller draw (${previewReport.totalConsumptionWh.toFixed(4)} Wh total overhead) produces a ${previewReport.balanceStatus} net energy benefit of ${previewReport.netEnergyBenefitWh >= 0 ? '+' : ''}${previewReport.netEnergyBenefitWh.toFixed(4)} Wh.`}
        highlights={[
          `Gross gain: ${previewReport.additionalEnergyWh >= 0 ? '+' : ''}${previewReport.additionalEnergyWh.toFixed(4)} Wh (+${previewReport.energyGainPct.toFixed(1)}%)`,
          `Total system overhead: ${previewReport.totalConsumptionWh.toFixed(4)} Wh`,
          `Net benefit: ${previewReport.netEnergyBenefitWh >= 0 ? '+' : ''}${previewReport.netEnergyBenefitWh.toFixed(4)} Wh (${previewReport.balanceStatus})`,
        ]}
      />
    </div>
  );
};
