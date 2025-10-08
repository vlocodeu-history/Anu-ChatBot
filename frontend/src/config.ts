// Create a config file: src/config.ts
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'