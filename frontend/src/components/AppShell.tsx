import { ReactNode } from "react";

export default function AppShell({
  headerLeft,
  headerRight,
  sidebar,
  children,
}: {
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode; // chat pane
}) {
  return (
    <div className="h-screen w-screen bg-chat-bg">
      {/* Top app bar */}
      <header className="h-14 flex items-center justify-between px-4 bg-brand-500 text-white shadow-header">
        <div className="font-semibold tracking-wide">{headerLeft}</div>
        <div className="flex items-center gap-3">{headerRight}</div>
      </header>

      {/* Body: sidebar + chat */}
      <div className="grid grid-cols-[380px_minmax(0,1fr)] h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <aside className="bg-chat-pane border-r border-black/5 overflow-hidden">
          {sidebar}
        </aside>

        {/* Chat content */}
        <main className="relative">{children}</main>
      </div>
    </div>
  );
}
