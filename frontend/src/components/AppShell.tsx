import React from 'react';

type Props = {
  title?: string;
  right?: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen(open: boolean): void;
  children: React.ReactNode;
};

/** Layout with top bar + collapsible sidebar */
export default function AppShell({
  title = 'My Chat',
  right,
  sidebar,
  sidebarOpen,
  setSidebarOpen,
  children,
}: Props) {
  return (
    <div className="h-screen w-full flex flex-col bg-slate-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 bg-emerald-700 text-white">
        <div className="flex items-center gap-2">
          <button
            className="md:hidden inline-flex w-9 h-9 rounded hover:bg-white/10"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <div className="font-semibold truncate">{title}</div>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 transition-transform duration-200 w-[320px] shrink-0 border-r bg-white relative`}
        >
          {sidebar}
        </aside>

        {/* Content */}
        <section className="flex-1 flex flex-col min-w-0 relative">
          {children}
        </section>
      </div>
    </div>
  );
}
