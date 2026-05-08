import axios, { type InternalAxiosRequestConfig } from 'axios';
import { loader } from './loader';

// Shared axios instance with sane defaults for both client and server
export const http = axios.create({
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  'X-Chat': '1',
  },
  withCredentials: true,
});

// Optional CSRF token support if you later add a CSRF cookie/meta tag
export function setCsrfToken(getter: () => string | null) {
  const token = getter();
  if (token) http.defaults.headers.common['X-CSRF-Token'] = token;
}

// Global loader interceptors (browser only)
if (typeof window !== 'undefined') {
  http.interceptors.request.use((config) => {
    // Opt-out by setting config.metadata?.skipLoader = true
    const cfg = config as InternalAxiosRequestConfig & { metadata?: { skipLoader?: boolean } };
    // By default, suppress loader for chat/enrollment calls marked with X-Chat
    const isChat = String(cfg.headers?.['X-Chat'] || cfg.headers?.['x-chat'] || '').includes('1');
    const skip = cfg.metadata?.skipLoader ?? isChat;
    if (!skip) loader.show();
    return cfg;
  });
  http.interceptors.response.use(
    (res) => { loader.hide(); return res; },
    (err) => { loader.hide(); return Promise.reject(err); }
  );
}
