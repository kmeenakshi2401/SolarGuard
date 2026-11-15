import React, { useEffect, useState } from 'react';
import { Code2, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { TextReportBanner } from '../components/TextReportBanner';
import type { CleaningLogEntry, CsvRow } from '../types/solarguard';

interface DataReportsPageProps {
  sensorRows: CsvRow[];
  panelMonitorRows: CsvRow[];
  energyRows: CsvRow[];
  experimentRows: CsvRow[];
  cleaningLogs: CleaningLogEntry[];
  onRefreshData: () => Promise<void>;
}

export const DataReportsPage: React.FC<DataReportsPageProps> = ({
  sensorRows,
  panelMonitorRows,
  energyRows,
  experimentRows,
  cleaningLogs,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'panel' | 'sensor' | 'energy' | 'experiment' | 'code'>('panel');
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('control/weather_decision.py');
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingCode, setLoadingCode] = useState(false);

  useEffect(() => {
    fetch('/api/source-files')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.files)) setSourceFiles(d.files);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    setLoadingCode(true);
    fetch(`/api/source-file?path=${encodeURIComponent(selectedFile)}`)
      .then((r) => r.json())
      .then((d) => setFileContent(d.content ?? ''))
      .catch(() => setFileContent('Unable to load file.'))
      .finally(() => setLoadingCode(false));
  }, [selectedFile]);

  const downloadFileContent = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.split('/').pop() ?? filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderCsvTable = (rows: CsvRow[]) => {
    if (rows.length === 0) {
      return <p className="text-xs text-slate-400">No CSV rows stored yet.</p>;
    }
    const headers = Object.keys(rows[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              {headers.map((h) => (
                <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-300">
            {[...rows].reverse().map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-900/40">
                {headers.map((h) => (
                  <td key={h} className="py-2 pr-4 whitespace-nowrap">
                    {row[h]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">APPEND-ONLY STORAGE &amp; CODEBASE</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">Experimental Data Logs, CSV Export &amp; Source Modules</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRefreshData()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh CSVs
          </button>
          <a
            href="/api/export/panel_monitoring_log"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
          >
            <Download className="h-3.5 w-3.5" />
            Download panel_monitoring_log.csv
          </a>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#0B1221] p-1 w-fit">
        <button
          onClick={() => setActiveTab('panel')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'panel' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Panel Monitor ({panelMonitorRows.length})
        </button>
        <button
          onClick={() => setActiveTab('sensor')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'sensor' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Sensor Logs ({sensorRows.length})
        </button>
        <button
          onClick={() => setActiveTab('energy')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'energy' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Energy Balance ({energyRows.length})
        </button>
        <button
          onClick={() => setActiveTab('experiment')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'experiment' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Cooling Trials ({experimentRows.length})
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'code' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
          Python &amp; ESP32 Source ({sourceFiles.length})
        </button>
      </div>

      {activeTab === 'panel' && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Per-Panel Autonomous Monitoring Log (`SolarGuard/data/panel_monitoring_log.csv`)</h3>
            <a href="/api/export/panel_monitoring_log" className="text-xs text-sky-400 hover:underline">
              Export CSV
            </a>
          </div>
          {renderCsvTable(panelMonitorRows)}
        </section>
      )}

      {activeTab === 'sensor' && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Historical Sensor &amp; Dust Readings (`SolarGuard/data/sensor_data.csv`)</h3>
            <a href="/api/export/sensor_data" className="text-xs text-sky-400 hover:underline">
              Export CSV
            </a>
          </div>
          {renderCsvTable(sensorRows)}
        </section>
      )}

      {activeTab === 'energy' && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Net Energy Analysis History (`SolarGuard/data/energy_data.csv`)</h3>
            <a href="/api/export/energy_data" className="text-xs text-sky-400 hover:underline">
              Export CSV
            </a>
          </div>
          {renderCsvTable(energyRows)}
        </section>
      )}

      {activeTab === 'experiment' && (
        <section className="space-y-6">
          <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Thermal &amp; Cooling Trials (`SolarGuard/data/experiment_results.csv`)</h3>
              <a href="/api/export/experiment_results" className="text-xs text-sky-400 hover:underline">
                Export CSV
              </a>
            </div>
            {renderCsvTable(experimentRows)}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
            <h3 className="text-sm font-semibold text-slate-100">Session Cleaning Dispatch History</h3>
            {cleaningLogs.length === 0 ? (
              <p className="text-xs text-slate-400">No cleaning dispatches in current browser session.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Timestamp</th>
                      <th className="py-2 pr-4 font-medium">Command</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono text-slate-300">
                    {cleaningLogs.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 pr-4">{c.timestamp}</td>
                        <td className="py-2 pr-4 text-sky-300">{c.command}</td>
                        <td className="py-2 pr-4">{c.status}</td>
                        <td className="py-2 font-sans text-slate-400">{c.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'code' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">SolarGuard Project Tree</h3>
            <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1 font-mono text-xs">
              {sourceFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => setSelectedFile(file)}
                  className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left transition-colors ${
                    selectedFile === file
                      ? 'bg-sky-600/20 text-sky-300'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  {file}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <span className="font-mono text-xs font-semibold text-sky-300">SolarGuard/{selectedFile}</span>
              <button
                onClick={() => downloadFileContent(selectedFile, fileContent)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500"
              >
                <Download className="h-3.5 w-3.5" />
                Download File
              </button>
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-lg bg-[#070B14] p-4 font-mono text-xs leading-relaxed text-slate-300">
              {loadingCode ? 'Loading source...' : fileContent}
            </pre>
          </div>
        </section>
      )}

      <TextReportBanner
        title="PERSISTENT ARCHIVE & SOURCE REPOSITORY REPORT"
        summary={`Append-only CSV storage under SolarGuard/data/ currently holds ${panelMonitorRows.length} autonomous panel-monitoring records, ${sensorRows.length} electrical/dust snapshots, ${energyRows.length} energy balance evaluations, and ${experimentRows.length} thermal cooling trials, alongside ${cleaningLogs.length} in-session cleaning dispatches and ${sourceFiles.length} inspectable Python/ESP32 source modules.`}
        highlights={[
          `panel_monitoring_log.csv: ${panelMonitorRows.length} rows · sensor_data.csv: ${sensorRows.length} rows`,
          `energy_data.csv: ${energyRows.length} rows · experiment_results.csv: ${experimentRows.length} rows`,
          `Inspectable Python & C++ modules: ${sourceFiles.length} files`,
        ]}
      />
    </div>
  );
};
