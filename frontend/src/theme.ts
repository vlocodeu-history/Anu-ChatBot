// frontend/src/theme.ts
export type ThemeName =
  | "Classic Light"
  | "Slate Dark"
  | "Ocean"
  | "Emerald"
  | "Crimson"
  | "Midnight Indigo"
  | "Graphite";

export const THEMES: Record<ThemeName, {
  primary: string; bg: string; bg2: string; text: string; dark: boolean;
}> = {
  "Classic Light": { primary: "#0ea5e9", bg: "#ffffff", bg2: "#f1f5f9", text: "#0f172a", dark: false },
  "Slate Dark":    { primary: "#22d3ee", bg: "#0b1220", bg2: "#111827", text: "#e5e7eb", dark: true  },
  "Ocean":         { primary: "#0284c7", bg: "#f8fbff", bg2: "#e6f1ff", text: "#0b2038", dark: false },
  "Emerald":       { primary: "#10b981", bg: "#ffffff", bg2: "#ecfdf5", text: "#052e21", dark: false },
  "Crimson":       { primary: "#ef4444", bg: "#ffffff", bg2: "#fff1f2", text: "#111827", dark: false },
  "Midnight Indigo": { primary: "#6366f1", bg: "#0f1226", bg2: "#141836", text: "#e2e8f0", dark: true },
  "Graphite":      { primary: "#fbbf24", bg: "#0b0b0c", bg2: "#171717", text: "#e5e5e5", dark: true  },
};

let styleEl: HTMLStyleElement | null = null;

export function applyTheme(name: ThemeName) {
  const t = THEMES[name] || THEMES["Classic Light"];
  const root = document.documentElement;

  // keep your existing dark-mode behavior in sync
  root.classList.toggle("dark", !!t.dark);

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "app-theme-css";
    document.head.appendChild(styleEl);
  }

  // We set CSS variables and override a few common Tailwind utilities used in Chat.tsx.
  styleEl.textContent = `
  :root {
    --primary: ${t.primary};
    --bg: ${t.bg};
    --bg2: ${t.bg2};
    --text: ${t.text};
  }

  body { background: var(--bg); color: var(--text); }

  /* App shell surfaces used in your Chat.tsx */
  .bg-chat-bg { background: var(--bg2) !important; }
  .dark .bg-chat-bg { background: var(--bg2) !important; }

  /* Header + sidebar backgrounds (they use bg-white / dark:bg-slate-900) */
  .dark .bg-slate-900, .bg-white { background: var(--bg) !important; }
  .dark .text-white { color: var(--text) !important; }

  /* Borders – gently tint */
  .border, .dark .dark\\:border-slate-800, .dark .border-slate-800 {
    border-color: color-mix(in oklab, var(--text) 15%, transparent) !important;
  }

  /* Primary buttons currently using emerald */
  .bg-emerald-600, .hover\\:bg-emerald-700:hover {
    background-color: var(--primary) !important;
  }
  .text-emerald-600 { color: var(--primary) !important; }

  /* Sent message bubble uses a light emerald background – re-tint */
  .message-bubble-right, .sent-bubble {
    background: color-mix(in oklab, var(--primary) 20%, transparent) !important;
  }

  /* Generic text color */
  .text-slate-500, .dark .text-slate-500 { color: color-mix(in oklab, var(--text) 65%, var(--bg) 35%) !important; }
  `;
}
