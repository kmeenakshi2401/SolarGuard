import React from 'react';
import { OctagonAlert, RotateCcw, Send, ShieldAlert, Usb } from 'lucide-react';
import { TextReportBanner } from '../components/TextReportBanner';
import type { CleaningDecision, CleaningLogEntry, OperatingMode } from '../types/solarguard';

interface CleaningControlPageProps {
  mode: OperatingMode;
  serialConnected: boolean;
  serialPortLabel: string;
  zoneDust: number[];
  moderateThreshold: number;
  decision: CleaningDecision;
  manualOverrideEnabled: boolean;
  manualZones: boolean[];
  activeLeds: boolean[];
  cleaningStatus: string;
  emergencyStop: boolean;
  logs: CleaningLogEntry[];
  onToggleManualOverride: (enabled: boolean) => void;
  onToggleManualZone: (idx: number) => void;
  onSendCommand: () => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
  onConnectWebSerial: () => void;
}

export const CleaningControlPage: React.FC<CleaningControlPageProps> = ({
  mode,
  serialConnected,
  serialPortLabel,
  zoneDust,
  moderateThreshold,
  decision,
  manualOverrideEnabled,
  manualZones,
  activeLeds,
  cleaningStatus,
  emergencyStop,
  logs,
  onToggleManualOverride,
  onToggleManualZone,
  onSendCommand,
  onEmergencyStop,
  onResetEmergencyStop,
  onConnectWebSerial,
}) => {
  const gpioPins = [13, 12, 14, 27];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">SELECTIVE ZONE CONTROL</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Intelligent Cleaning Decision &amp; LED Dispatch</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'HARDWARE' && !serialConnected && (
            <button
              onClick={onConnectWebSerial}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-950/40 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-900/50 whitespace-nowrap"
            >
              <Usb className="h-3.5 w-3.5" />
              Connect ESP32 USB Serial
            </button>
          )}
          <button
            onClick={onSendCommand}
            disabled={emergencyStop}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" />
            Send Command ({decision.command})
          </button>
          {!emergencyStop ? (
            <button
              onClick={onEmergencyStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
            >
              <OctagonAlert className="h-3.5 w-3.5" />
              Emergency Stop
            </button>
          ) : (
            <button
              onClick={onResetEmergencyStop}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-950/40 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Emergency Stop
            </button>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-[#0E1628] px-4 py-3 text-xs text-slate-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>
          Hardware Safety Boundary: Commands drive low-voltage indicator LEDs (GPIO 13, 12, 14, 27) only. High-voltage
          Electrodynamic Screen (EDS) electrodes remain disabled until an approved isolated driver, documented interface,
          independent hardware interlocks, and qualified safety validation are installed.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Zone Indicator LED Array</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Active Status: <span className="font-mono text-slate-200">{cleaningStatus}</span> · Threshold &gt; {moderateThreshold}%
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={manualOverrideEnabled}
                onChange={(e) => onToggleManualOverride(e.target.checked)}
                className="h-4 w-4 accent-sky-500"
              />
              Manual Zone Override
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((idx) => {
              const ledOn = activeLeds[idx];
              const autoRec = decision.zoneRecommendations[idx];
              const selected = decision.selectedZones[idx];

              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-4 transition-colors ${
                    ledOn
                      ? 'border-emerald-500/60 bg-emerald-950/20'
                      : 'border-slate-800 bg-[#090F1D]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Zone {idx + 1}</div>
                      <div className="font-mono text-xs text-slate-400">ESP32 GPIO {gpioPins[idx]}</div>
                    </div>
                    <div
                      className={`font-mono text-xs font-semibold ${
                        ledOn ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {ledOn ? '● LED ACTIVE' : '○ LED OFF'}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
                    <span className="text-slate-400">
                      Est. Dust: <span className="font-mono text-slate-200">{zoneDust[idx].toFixed(1)}%</span>
                    </span>
                    <span className={autoRec ? 'text-amber-300' : 'text-emerald-400'}>
                      {autoRec ? 'Auto: Clean' : 'Auto: Skip'}
                    </span>
                  </div>

                  {manualOverrideEnabled && (
                    <button
                      onClick={() => onToggleManualZone(idx)}
                      className={`mt-3 w-full rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        manualZones[idx]
                          ? 'border-sky-500 bg-sky-600/20 text-sky-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300'
                      }`}
                    >
                      Manual Select: {manualZones[idx] ? 'ON' : 'OFF'}
                    </button>
                  )}

                  {!manualOverrideEnabled && (
                    <div className="mt-2 text-xs text-slate-400">
                      Queued State: <span className="font-mono text-slate-200">{selected ? '1 (ACTIVATE)' : '0 (IDLE)'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Serial Frame Preview</h3>
          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 font-mono">
            <div className="text-xs text-slate-400">TX Command Packet</div>
            <div className="mt-1 text-2xl font-bold text-sky-400">{decision.command}</div>
            <div className="mt-2 text-xs text-slate-400">
              Target: {mode === 'HARDWARE' ? (serialConnected ? serialPortLabel : 'ESP32 Disconnected') : 'Virtual LED Matrix'}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-medium text-slate-300">Decision Breakdown</div>
            {decision.statusMessages.map((msg, i) => (
              <div key={i} className="rounded-md border border-slate-800/80 bg-[#090F1D] px-3 py-2 font-mono text-slate-300">
                {msg}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">Cleaning Activity &amp; Interlock Log</h3>
        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">No commands dispatched yet. Click Send Command to record a selective activation.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 pr-4 font-medium">Command</th>
                  <th className="py-2 pr-4 font-medium">Mode</th>
                  <th className="py-2 pr-4 font-medium">Target Driver</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-300">
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{entry.timestamp}</td>
                    <td className="py-2.5 pr-4 text-sky-300">{entry.command}</td>
                    <td className="py-2.5 pr-4">{entry.mode}</td>
                    <td className="py-2.5 pr-4">{entry.targetDriver}</td>
                    <td className={`py-2.5 pr-4 ${entry.status === 'EMERGENCY_STOP' ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {entry.status}
                    </td>
                    <td className="py-2.5 font-sans text-slate-400">{entry.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TextReportBanner
        title="SELECTIVE ZONE LED CONTROL REPORT"
        summary={`Zone dispatch operates in ${mode} mode targeting ${mode === 'HARDWARE' ? (serialConnected ? serialPortLabel : 'disconnected ESP32 serial port') : 'the virtual 4-zone LED array'}. Current queued packet is ${decision.command} (${manualOverrideEnabled ? 'Manual Override' : 'Automated > ' + moderateThreshold + '% threshold'}) with zone dust levels [${zoneDust.map((d) => `${d.toFixed(1)}%`).join(', ')}]. ${emergencyStop ? 'Emergency Stop is engaged, locking all GPIO channels OFF.' : `${activeLeds.filter(Boolean).length} indicator LED(s) are currently illuminated.`}`}
        highlights={[
          `Serial packet: ${decision.command} · Status: ${cleaningStatus}`,
          `GPIO pins: 13 (Z1), 12 (Z2), 14 (Z3), 27 (Z4) — LED indicators only`,
          `Dispatches logged this session: ${logs.length}`,
        ]}
      />
    </div>
  );
};
