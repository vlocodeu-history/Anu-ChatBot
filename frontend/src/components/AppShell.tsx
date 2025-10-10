import { ReactNode } from 'react';

export default function AppShell({
  title,
  right,
  sidebar,
  children,
  sidebarOpen,
  setSidebarOpen,
}: {
  title: string;
  right?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  return (
    <div className="h-screen w-full flex flex-col bg-slate-50">
      {/* Top bar */}
      <header className="h-14 shrink-0 bg-emerald-700 text-white">
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle contacts"
            >
              ☰
            </button>
            <div className="font-semibold tracking-wide">{title}</div>
          </div>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/25 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="h-full w-full flex">
          {/* Sidebar */}
          <aside
            className={[
              'absolute md:static z-20 h-full bg-white border-r transition-all duration-300 shadow md:shadow-none',
              sidebarOpen ? 'w-[320px] translate-x-0' : 'w-0 -translate-x-full md:w-[320px] md:translate-x-0',
            ].join(' ')}
          >
            {sidebar}
          </aside>

          {/* Main */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
