import React from 'react';
import { CloudRain, Droplets, Sun, Thermometer } from 'lucide-react';
import { TextReportBanner } from '../components/TextReportBanner';
import type { OperatingMode, PanelWeatherDecision, WeatherInputs } from '../types/solarguard';

interface WeatherMonitoringPageProps {
  mode: OperatingMode;
  weather: WeatherInputs;
  sampleDecision: PanelWeatherDecision;
  simWeather: {
    humidityPct: number;
    ambientTempC: number;
    rainDetected: boolean;
    ldrPct: number;
  };
  onUpdateSimWeather: (patch: Partial<{ humidityPct: number; ambientTempC: number; rainDetected: boolean; ldrPct: number }>) => void;
}

export const WeatherMonitoringPage: React.FC<WeatherMonitoringPageProps> = ({
  mode,
  weather,
  sampleDecision,
  simWeather,
  onUpdateSimWeather,
}) => {
  const isSim = mode === 'SIMULATION';

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">ENVIRONMENTAL TELEMETRY</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Weather Monitoring &amp; Atmospheric Eligibility</h2>
        </div>
        <span className="font-mono text-xs text-slate-400">
          {isSim ? 'SIMULATION CONTROLS ACTIVE [SIMULATED]' : 'HARDWARE ESP32 SENSOR STREAM'}
        </span>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Relative Humidity</span>
            <Droplets className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {weather.dht22Connected && weather.humidityPct !== null ? `${weather.humidityPct.toFixed(1)}%` : 'OFFLINE'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {weather.dht22Connected ? (isSim ? 'DHT22 [SIMULATED]' : 'DHT22 Connected') : 'DHT22 Disconnected'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Rain Sensor</span>
            <CloudRain className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div
            className={`mt-2 font-mono text-xl font-semibold ${
              !weather.rainSensorConnected
                ? 'text-amber-300'
                : weather.rainDetected
                  ? 'text-rose-400'
                  : 'text-emerald-400'
            }`}
          >
            {weather.rainSensorConnected
              ? weather.rainDetected
                ? 'RAIN DETECTED'
                : 'DRY'
              : 'OFFLINE'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {weather.rainSensorConnected ? (isSim ? 'Rain Sensor [SIMULATED]' : 'Rain Sensor Connected') : 'Rain Sensor Disconnected'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ambient Temp</span>
            <Thermometer className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {weather.dht22Connected && weather.ambientTempC !== null ? `${weather.ambientTempC.toFixed(1)} °C` : 'OFFLINE'}
          </div>
          <div className="mt-1 text-xs text-slate-400">DHT22 ambient probe</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Panel Surface Temp</span>
            <Thermometer className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
            {weather.panelTempC.toFixed(1)} °C
          </div>
          <div className="mt-1 text-xs text-slate-400">DS18B20 surface probe</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Light Intensity (LDR)</span>
            <Sun className="h-3.5 w-3.5 text-amber-300" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {weather.ldrConnected && weather.ldrPct !== null ? `${weather.ldrPct.toFixed(0)}%` : 'OFFLINE'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {weather.ldrConnected ? (isSim ? 'LDR [SIMULATED]' : 'LDR Connected') : 'LDR Disconnected'}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">Weather Classification &amp; Cleaning Gate</h3>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">Atmospheric Classification</span>
              <span className="font-mono font-semibold text-sky-300">{sampleDecision.atmosphericCondition}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">EDS Cleaning Eligibility</span>
              <span
                className={`font-mono font-semibold ${
                  sampleDecision.cleaningEligible ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {sampleDecision.cleaningEligible ? 'PERMITTED' : 'SUSPENDED / IDLE'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-2">
              <span className="text-slate-400">Passive PCM Cooling</span>
              <span className="font-mono text-slate-200">
                {sampleDecision.passiveCoolingActive ? 'ACTIVE (Independent of Cleaning)' : 'STANDBY'}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#090F1D] p-3 text-slate-300">
              <div className="font-medium text-slate-200">Decision Rationale</div>
              <p className="mt-1 leading-relaxed text-slate-400">{sampleDecision.reason}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            {isSim ? 'Simulate Weather Conditions [SIMULATED]' : 'Hardware Sensor Diagnostics'}
          </h3>
          {isSim ? (
            <div className="mt-4 space-y-4 text-xs">
              <div>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>DHT22 Relative Humidity</span>
                  <span className="font-mono tabular-nums">{simWeather.humidityPct.toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={98}
                  step={1}
                  value={simWeather.humidityPct}
                  onChange={(e) => onUpdateSimWeather({ humidityPct: Number(e.target.value) })}
                  className="w-full accent-sky-500"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>LDR Light Intensity</span>
                  <span className="font-mono tabular-nums">{simWeather.ldrPct.toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={simWeather.ldrPct}
                  onChange={(e) => onUpdateSimWeather({ ldrPct: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-slate-300">
                  <span>Ambient Air Temperature</span>
                  <span className="font-mono tabular-nums">{simWeather.ambientTempC.toFixed(1)} °C</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={48}
                  step={0.5}
                  value={simWeather.ambientTempC}
                  onChange={(e) => onUpdateSimWeather({ ambientTempC: Number(e.target.value) })}
                  className="w-full accent-sky-500"
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#090F1D] px-3 py-2.5 text-slate-200">
                <span>Simulate Rain Detection (Rain Sensor Wet)</span>
                <input
                  type="checkbox"
                  checked={simWeather.rainDetected}
                  onChange={(e) => onUpdateSimWeather({ rainDetected: e.target.checked })}
                  className="h-4 w-4 accent-rose-500"
                />
              </label>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              In Hardware Mode, humidity, ambient temperature, rainfall, and light intensity are read strictly from the
              ESP32 serial stream (`DHT22` GPIO 15, `Rain Sensor` GPIO 34, `LDR` GPIO 35). Disconnected environmental
              sensors are explicitly flagged and prevent unsafe blind EDS activation.
            </p>
          )}
        </div>
      </section>

      <TextReportBanner
        title="ATMOSPHERIC TELEMETRY & SAFETY GATE REPORT"
        summary={`Environmental telemetry (${isSim ? 'Simulated Stream' : 'ESP32 Hardware Stream'}) classifies ambient conditions as "${sampleDecision.atmosphericCondition}". Relative humidity is ${weather.dht22Connected && weather.humidityPct !== null ? `${weather.humidityPct.toFixed(1)}%` : 'offline/unmeasured'}, surface rain status is ${weather.rainSensorConnected ? (weather.rainDetected ? 'rain detected' : 'dry') : 'offline'}, and LDR irradiance index is ${weather.ldrConnected && weather.ldrPct !== null ? `${weather.ldrPct.toFixed(0)}%` : 'offline'}. Electrostatic cleaning is currently ${sampleDecision.cleaningEligible ? 'PERMITTED' : 'SUSPENDED / IDLE'}: ${sampleDecision.reason}`}
        highlights={[
          `Atmospheric class: ${sampleDecision.atmosphericCondition}`,
          `EDS safety gate: ${sampleDecision.cleaningEligible ? 'Permitted' : 'Suspended'}`,
          `Passive PCM cooling: ${sampleDecision.passiveCoolingActive ? 'Active' : 'Standby'} (${weather.panelTempC.toFixed(1)} °C panel)`,
        ]}
      />
    </div>
  );
};
