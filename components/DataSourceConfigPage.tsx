import React, { useState } from 'react';
import { Database, FileSpreadsheet, HardDriveUpload, Server, ShieldCheck } from 'lucide-react';

interface DataSourceConfigPageProps {
  onBack?: () => void;
}

type SourceType = 'mysql' | 'sqlserver' | 'postgresql' | 'mongodb' | 'excel';

export const DataSourceConfigPage: React.FC<DataSourceConfigPageProps> = ({ onBack }) => {
  const [activeSource, setActiveSource] = useState<SourceType>('mysql');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const sourceTabs: { key: SourceType; label: string; icon: React.ElementType }[] = [
    { key: 'mysql', label: 'MySQL', icon: Database },
    { key: 'sqlserver', label: 'SQL Server', icon: Server },
    { key: 'postgresql', label: 'PostgreSQL', icon: ShieldCheck },
    { key: 'mongodb', label: 'MongoDB', icon: HardDriveUpload },
    { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  ];

  const cardClass = isDarkMode
    ? 'bg-slate-900 border border-slate-800 text-slate-100'
    : 'bg-white border border-slate-200 text-slate-900';

  const labelClass = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const inputClass = isDarkMode
    ? 'w-full rounded-md bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 outline-none focus:border-violet-500'
    : 'w-full rounded-md bg-white border border-slate-200 text-slate-700 px-3 py-2 outline-none focus:border-violet-500';

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950' : 'bg-white'} px-4 py-8`}>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              Configure Data Source
            </h1>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Connect your preferred source to sync analytics and dashboard data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`rounded-md px-3 py-2 text-xs border ${
                isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'
              }`}
            >
              {isDarkMode ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-3 py-2 text-xs bg-violet-600 text-white"
            >
              Back to Studio
            </button>
          </div>
        </header>

        <div className={`rounded-xl p-2 mb-6 ${cardClass}`}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {sourceTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSource === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveSource(tab.key)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : isDarkMode
                        ? 'bg-slate-950 text-slate-300 border border-slate-800'
                        : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeSource === 'mysql' && (
          <section className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
            <h2 className="font-semibold">MySQL Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Host" inputClass={inputClass} labelClass={labelClass} placeholder="127.0.0.1" />
              <Field label="Port" inputClass={inputClass} labelClass={labelClass} placeholder="3306" />
              <Field label="Database Name" inputClass={inputClass} labelClass={labelClass} placeholder="analytics_db" />
              <Field label="Username" inputClass={inputClass} labelClass={labelClass} placeholder="root" />
              <Field label="Password" inputClass={inputClass} labelClass={labelClass} placeholder="********" type="password" />
              <Field label="SSL Mode" inputClass={inputClass} labelClass={labelClass} placeholder="preferred" />
            </div>
            <ActionRow />
          </section>
        )}

        {activeSource === 'sqlserver' && (
          <section className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
            <h2 className="font-semibold">SQL Server Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Server" inputClass={inputClass} labelClass={labelClass} placeholder="sqlserver.company.local" />
              <Field label="Port" inputClass={inputClass} labelClass={labelClass} placeholder="1433" />
              <Field label="Database" inputClass={inputClass} labelClass={labelClass} placeholder="sales_dw" />
              <Field label="Username" inputClass={inputClass} labelClass={labelClass} placeholder="sa_user" />
              <Field label="Password" inputClass={inputClass} labelClass={labelClass} placeholder="********" type="password" />
              <Field label="Encrypt" inputClass={inputClass} labelClass={labelClass} placeholder="true" />
            </div>
            <ActionRow />
          </section>
        )}

        {activeSource === 'postgresql' && (
          <section className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
            <h2 className="font-semibold">PostgreSQL Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Host" inputClass={inputClass} labelClass={labelClass} placeholder="db.internal.local" />
              <Field label="Port" inputClass={inputClass} labelClass={labelClass} placeholder="5432" />
              <Field label="Database" inputClass={inputClass} labelClass={labelClass} placeholder="warehouse" />
              <Field label="Schema" inputClass={inputClass} labelClass={labelClass} placeholder="public" />
              <Field label="Username" inputClass={inputClass} labelClass={labelClass} placeholder="postgres" />
              <Field label="Password" inputClass={inputClass} labelClass={labelClass} placeholder="********" type="password" />
            </div>
            <ActionRow />
          </section>
        )}

        {activeSource === 'mongodb' && (
          <section className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
            <h2 className="font-semibold">MongoDB Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field
                label="Connection URI"
                inputClass={inputClass}
                labelClass={labelClass}
                placeholder="mongodb+srv://user:password@cluster0.mongodb.net"
              />
              <Field label="Database Name" inputClass={inputClass} labelClass={labelClass} placeholder="xerocode_db" />
              <Field label="Collection" inputClass={inputClass} labelClass={labelClass} placeholder="orders" />
              <Field label="Auth Source" inputClass={inputClass} labelClass={labelClass} placeholder="admin" />
            </div>
            <ActionRow />
          </section>
        )}

        {activeSource === 'excel' && (
          <section className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
            <h2 className="font-semibold">Excel Configuration</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="File Path / URL" inputClass={inputClass} labelClass={labelClass} placeholder="/uploads/sales-report.xlsx" />
              <Field label="Worksheet Name" inputClass={inputClass} labelClass={labelClass} placeholder="Sheet1" />
              <Field label="Header Row Index" inputClass={inputClass} labelClass={labelClass} placeholder="1" />
              <Field label="Date Format" inputClass={inputClass} labelClass={labelClass} placeholder="YYYY-MM-DD" />
            </div>
            <div className={`rounded-md px-3 py-2 text-xs ${isDarkMode ? 'bg-slate-950 text-slate-400 border border-slate-800' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
              Tip: Upload an `.xlsx` or `.csv` file and map columns after import.
            </div>
            <ActionRow />
          </section>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  placeholder: string;
  inputClass: string;
  labelClass: string;
  type?: string;
}> = ({ label, placeholder, inputClass, labelClass, type = 'text' }) => (
  <label className="space-y-1.5 block">
    <span className={`text-xs font-medium ${labelClass}`}>{label}</span>
    <input type={type} placeholder={placeholder} className={inputClass} />
  </label>
);

const ActionRow: React.FC = () => (
  <div className="flex items-center justify-end gap-2 pt-2">
    <button type="button" className="rounded-md px-3 py-2 text-xs border border-slate-400 text-slate-500">
      Test Connection
    </button>
    <button type="button" className="rounded-md px-3 py-2 text-xs bg-violet-600 text-white">
      Save Configuration
    </button>
  </div>
);
