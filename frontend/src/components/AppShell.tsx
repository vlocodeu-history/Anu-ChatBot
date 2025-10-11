import React from 'react';

type Props = {
  title?: string;
  right?: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen(open: boolean): void;
  children: React.ReactNode;
};

/** Layout with top bar + truly collapsible sidebar (rail when collapsed) */
export default function AppShell({
  title = 'My Chat',
  right,
  sidebar,
  sidebarOpen,
  setSidebarOpen,
  children,
}: Props) {
  const open = sidebarOpen;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 bg-emerald-700 text-white shadow-md">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex w-9 h-9 rounded hover:bg-white/10"
            onClick={() => setSidebarOpen(!open)}
            aria-label="Toggle sidebar"
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            ≡
          </button>
            <div className="font-semibold truncate">{title}</div>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`transition-[width] duration-200 ease-in-out border-r dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden ${
            open ? 'w-[320px]' : 'w-[64px]'
          }`}
        >
          {/* Expanded content */}
          <div className={`${open ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}>
            {open ? sidebar : null}
          </div>

          {/* Collapsed rail */}
          {!open && (
            <div className="h-full flex flex-col items-center pt-4 text-slate-400 select-none">
              <div className="text-xs rotate-90 mt-6">Contacts</div>
            </div>
          )}
        </aside>

        {/* Content */}
        <section className="flex-1 flex flex-col min-w-0 relative">
          {children}
        </section>
      </div>
    </div>
  );
}
