import React from 'react';
import { ChevronRight, Database, FileSpreadsheet, HardDriveUpload, Server, ShieldCheck } from 'lucide-react';

export type ConnectorType = 'mysql' | 'sqlserver' | 'postgresql' | 'mongodb' | 'excel';

interface ConnectorConfigPageProps {
  connector: ConnectorType;
  onBack?: () => void;
}

const connectorMeta: Record<ConnectorType, { title: string; fields: string[] }> = {
  mysql: {
    title: 'MySQL Connector',
    fields: ['Host', 'Port', 'Database Name', 'Username', 'Password', 'SSL Mode'],
  },
  sqlserver: {
    title: 'SQL Server Connector',
    fields: ['Server', 'Port', 'Database Name', 'Username', 'Password', 'Encrypt'],
  },
  postgresql: {
    title: 'PostgreSQL Connector',
    fields: ['Host', 'Port', 'Database Name', 'Schema', 'Username', 'Password'],
  },
  mongodb: {
    title: 'MongoDB Connector',
    fields: ['Connection URI', 'Database Name', 'Collection Name', 'Auth Source'],
  },
  excel: {
    title: 'Excel Connector',
    fields: ['File Path / URL', 'Worksheet Name', 'Header Row Index', 'Date Format'],
  },
};

export const ConnectorConfigPage: React.FC<ConnectorConfigPageProps> = ({ connector, onBack }) => {
  const meta = connectorMeta[connector];
  const connectors: { key: ConnectorType; label: string; icon: React.ElementType }[] = [
    { key: 'mysql', label: 'MySQL', icon: Database },
    { key: 'sqlserver', label: 'SQL Server', icon: Server },
    { key: 'postgresql', label: 'PostgreSQL', icon: ShieldCheck },
    { key: 'mongodb', label: 'MongoDB', icon: HardDriveUpload },
    { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="hidden lg:flex lg:flex-col w-[238px] border-r border-slate-800 bg-slate-900">
        <div className="h-12 px-4 flex items-center text-[13px] font-semibold text-slate-200">XeroCode.ai</div>
        <div className="px-3">
          <p className="px-1 mb-2 uppercase tracking-[0.14em] font-bold text-[11px] text-slate-500">App Data</p>
          <div className="space-y-1">
            {connectors.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === connector;
              return (
                <div
                  key={item.key}
                  className={`w-full h-8 rounded-md text-xs px-2.5 inline-flex items-center gap-2 ${
                    isActive ? 'bg-violet-100 text-violet-700 font-semibold' : 'text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-12 border-b border-slate-800 bg-slate-900 px-4 sm:px-6 flex items-center justify-between">
          <div className="inline-flex items-center text-xs text-slate-400 gap-2">
            <span>Data</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-300 font-medium">{meta.title}</span>
          </div>
          <button type="button" onClick={onBack} className="rounded-md px-3 py-1.5 text-xs bg-violet-600 text-white">
            Back to Studio
          </button>
        </header>

        <main className="max-w-[980px] mx-auto px-4 sm:px-8 py-8">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h1 className="text-2xl font-semibold text-slate-100">{meta.title} Configuration</h1>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              Configure connection details and test your source integration.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {meta.fields.map((field) => (
                <label key={field} className="space-y-1.5 block">
                  <span className="text-xs font-medium text-slate-300">{field}</span>
                  <input
                    type={field.toLowerCase().includes('password') ? 'password' : 'text'}
                    placeholder={`Enter ${field.toLowerCase()}`}
                    className="w-full rounded-md bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 outline-none focus:border-violet-500"
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-5">
              <button
                type="button"
                className="rounded-md px-3 py-2 text-xs border border-slate-700 text-slate-300"
              >
                Test Connection
              </button>
              <button type="button" className="rounded-md px-3 py-2 text-xs bg-violet-600 text-white">
                Save Configuration
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
