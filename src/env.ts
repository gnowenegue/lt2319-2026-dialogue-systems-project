/**
 * retrieves an environment variable from `import.meta.env` (Vite) or `process.env` (Node)
 */
export const getEnv = (key: string, fallback = ''): string => {
  const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
  return metaEnv?.[key] || globalThis.process?.env?.[key] || fallback;
};
