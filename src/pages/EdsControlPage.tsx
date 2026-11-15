import React from 'react';
import { OctagonAlert, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { TextReportBanner } from '../components/TextReportBanner';
import type {
  EDSCleaningEvent,
  EDSDriverMode,
  EDSState,
  PanelWeatherDecision,
} from '../types/solarguard';

interface EdsControlPageProps {
  driverMode: EDSDriverMode;
  edsState: EDSState;
  hardwareInterlockClosed: boolean;
  emergencyStop: boolean;
  decisions: PanelWeatherDecision[];
  selectedPanelId: number;
  events: EDSCleaningEvent[];
  onSelectPanel: (id: number) => void;
  onChangeDriverMode: (mode: EDSDriverMode) => void;
  onToggleInterlock: (closed: boolean) => void;
  onDispatchEds: (panelId: number) => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
}

export const EdsControlPage: React.FC<EdsControlPageProps> = ({
  driverMode,
  edsState,
  hardwareInterlockClosed,
  emergencyStop,
  decisions,
  selectedPanelId,
  events,
  onSelectPanel,
  onChangeDriverMode,
  onToggleInterlock,
  onDispatchEds,
  onEmergencyStop,
  onResetEmergencyStop,
}) => {
  const activeDecision = decisions.find((d) => d.panelId === selectedPanelId) ?? decisions[0];
  const channels = ['CH1', 'CH2', 'CH3', 'CH4'];
  const latestEventForPanel = events.find((e) => e.panelId === activeDecision?.panelId);

  const driverReady =
    !emergencyStop &&
    (driverMode === 'SIMULATION' ||
      (driverMode === 'ISOLATED_HARDWARE_DRIVER' && hardwareInterlockClosed));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">4-CHANNEL TRAVELLING-WAVE EDS</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">EDS Control Interface &amp; Verification</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => activeDecision && onDispatchEds(activeDecision.panelId)}
            disabled={emergencyStop || !activeDecision}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5" />
            Execute Cleaning Request
          </button>
          {!emergencyStop ? (
            <button
              onClick={onEmergencyStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500 whitespace-nowrap"
            >
              <OctagonAlert className="h-3.5 w-3.5" />
              Emergency Stop
            </button>
          ) : (
            <button
              onClick={onResetEmergencyStop}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-950/40 px-4 py-2 text-xs font-medium text-emerald-300 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Safety Lock
            </button>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>
          Safety Architecture: The ESP32 never switches kilovolt waveforms directly. Actual electrostatic dust removal
          requires an external, opto-isolated, hardware-interlocked 4-phase EDS driver. In LED-Only Demo Mode, indicator
          LEDs illuminate without falsely reporting electrostatic cleaning occurred.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Target Panel</div>
          <select
            value={activeDecision?.panelId ?? 1}
            onChange={(e) => onSelectPanel(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-sm text-slate-100"
          >
            {decisions.map((d) => (
              <option key={d.panelId} value={d.panelId}>
                Panel {d.panelId} ({d.zoneCommand})
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">EDS Driver Mode</div>
          <select
            value={driverMode}
            onChange={(e) => onChangeDriverMode(e.target.value as EDSDriverMode)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-slate-100"
          >
            <option value="SIMULATION">SIMULATION (Safe Model)</option>
            <option value="LED_DEMO_ONLY">LED_DEMO_ONLY (Indicators Only)</option>
            <option value="ISOLATED_HARDWARE_DRIVER">ISOLATED_HARDWARE_DRIVER</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Driver Connection / Interlock</div>
          <div className={`mt-2 font-mono text-sm font-semibold ${driverReady ? 'text-emerald-400' : 'text-amber-300'}`}>
            {driverReady ? 'DRIVER READY' : driverMode === 'LED_DEMO_ONLY' ? 'LED DEMO ONLY' : 'INTERLOCK OPEN'}
          </div>
          {driverMode === 'ISOLATED_HARDWARE_DRIVER' && (
            <label className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>Hardware Interlock Closed</span>
              <input
                type="checkbox"
                checked={hardwareInterlockClosed}
                onChange={(e) => onToggleInterlock(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Controller State</div>
          <div
            className={`mt-2 font-mono text-sm font-semibold ${
              edsState === 'CLEANING_COMPLETED'
                ? 'text-emerald-400'
                : edsState === 'CLEANING_DISABLED_SAFETY' || edsState === 'CLEANING_FAILED'
                  ? 'text-rose-400'
                  : 'text-sky-300'
            }`}
          >
            {edsState}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Weather Gate: {activeDecision?.cleaningEligible ? 'Permitted' : 'Blocked'}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Four-Channel Travelling-Wave Output Matrix</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {channels.map((ch, idx) => {
              const zoneSelected = activeDecision?.selectedZones[idx] ?? false;
              return (
                <div
                  key={ch}
                  className={`rounded-lg border p-3 text-center ${
                    zoneSelected && activeDecision?.cleaningEligible
                      ? 'border-sky-500/60 bg-sky-950/30'
                      : 'border-slate-800 bg-[#090F1D]'
                  }`}
                >
                  <div className="font-mono text-sm font-semibold text-slate-100">{ch}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Zone {idx + 1} · {idx * 90}° phase</div>
                  <div
                    className={`mt-2 font-mono text-xs font-semibold ${
                      zoneSelected && activeDecision?.cleaningEligible ? 'text-sky-300' : 'text-slate-500'
                    }`}
                  >
                    {zoneSelected && activeDecision?.cleaningEligible ? 'SELECTED' : 'STANDBY'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Post-Cleaning Camera Verification</h3>
          {latestEventForPanel ? (
            <div className="mt-4 grid grid-cols-3 gap-3 text-center font-mono tabular-nums">
              <div className="rounded-lg border border-slate-800 bg-[#090F1D] p-3">
                <div className="font-sans text-xs text-slate-400">Before Cleaning</div>
                <div className="mt-1 text-xl font-semibold text-amber-300">
                  {latestEventForPanel.beforeDustPct.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#090F1D] p-3">
                <div className="font-sans text-xs text-slate-400">After Cleaning</div>
                <div className="mt-1 text-xl font-semibold text-emerald-400">
                  {latestEventForPanel.afterDustPct !== null
                    ? `${latestEventForPanel.afterDustPct.toFixed(1)}%`
                    : 'N/A'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#090F1D] p-3">
                <div className="font-sans text-xs text-slate-400">Cleaning Efficiency</div>
                <div className="mt-1 text-xl font-semibold text-sky-300">
                  {latestEventForPanel.cleaningEfficiencyPct !== null
                    ? `${latestEventForPanel.cleaningEfficiencyPct.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Dispatch a selective cleaning request to measure before/after dust reduction and cleaning efficiency.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">EDS Cleaning &amp; Verification Audit Log</h3>
        {events.length === 0 ? (
          <p className="text-xs text-slate-400">No EDS events recorded in this session.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 pr-4 font-medium">Panel</th>
                  <th className="py-2 pr-4 font-medium">Channels</th>
                  <th className="py-2 pr-4 font-medium">Driver Mode</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Before → After</th>
                  <th className="py-2 pr-4 text-right font-medium">Efficiency</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-300">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">{ev.timestamp}</td>
                    <td className="py-2 pr-4">Panel {ev.panelId}</td>
                    <td className="py-2 pr-4 text-sky-300">{ev.channels.join(', ') || 'None'}</td>
                    <td className="py-2 pr-4">{ev.driverMode}</td>
                    <td className="py-2 pr-4">{ev.status}</td>
                    <td className="py-2 pr-4 text-right">
                      {ev.beforeDustPct.toFixed(1)}% → {ev.afterDustPct !== null ? `${ev.afterDustPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-emerald-400">
                      {ev.cleaningEfficiencyPct !== null ? `${ev.cleaningEfficiencyPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 font-sans text-slate-400">{ev.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TextReportBanner
        title="EDS ACTUATION & POST-CLEANING VERIFICATION REPORT"
        summary={`4-channel travelling-wave EDS controller is set to ${driverMode} (${driverReady ? 'driver ready' : 'interlock/safety blocked'}) with controller state ${edsState}. Selected target is Panel ${activeDecision?.panelId ?? 1} (${activeDecision?.zoneCommand ?? 'ZONE:0000'}). ${latestEventForPanel ? `Most recent verification cycle recorded ${latestEventForPanel.beforeDustPct.toFixed(1)}% before-dust and ${latestEventForPanel.afterDustPct !== null ? `${latestEventForPanel.afterDustPct.toFixed(1)}% after-dust (${latestEventForPanel.cleaningEfficiencyPct?.toFixed(1) ?? '0.0'}% removal efficiency)` : 'no physical HV actuation (safety/demo mode)'}.` : `${events.length} total EDS event(s) logged in this session.`}`}
        highlights={[
          `Driver mode: ${driverMode} · Interlock: ${driverMode === 'ISOLATED_HARDWARE_DRIVER' ? (hardwareInterlockClosed ? 'Closed' : 'Open') : 'N/A'}`,
          `Active state: ${edsState} · Emergency Stop: ${emergencyStop ? 'ENGAGED' : 'Clear'}`,
          `Session EDS cycles logged: ${events.length}`,
        ]}
      />
    </div>
  );
};
