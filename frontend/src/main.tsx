import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // Tailwind

const el = document.getElementById("root");
if (!el) throw new Error("Root element #root not found");

// on App mount (e.g., in main.tsx)
const saved = localStorage.getItem('theme');
document.documentElement.classList.toggle('dark', saved === 'dark');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log("main.tsx mounted OK");
