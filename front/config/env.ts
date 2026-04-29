// Safe environment variable access
// This file provides a safe way to access environment variables
// that works in all contexts (build time, runtime, etc.)

export const getEnvVar = (key: string, fallback: string = ''): string => {
  // Try different methods to get environment variables

  // Method 1: Try import.meta.env (Vite build time)
  try {
    // @ts-ignore - import.meta.env may not be available in all contexts
    if (import.meta?.env?.[key]) {
      // @ts-ignore
      return import.meta.env[key] as string;
    }
  } catch (e) {
    // Silently fail and try next method
  }

  // Method 2: Try window object (runtime injection)
  try {
    if (typeof window !== 'undefined' && (window as any)[key]) {
      return (window as any)[key];
    }
  } catch (e) {
    // Silently fail and try next method
  }

  // Method 3: Return fallback
  return fallback;
};

// Export commonly used environment variables
export const ENV = {
  API_URL: getEnvVar('VITE_API_URL', 'https://urlpro.cc/api'),
  SOCKET_URL: getEnvVar('VITE_SOCKET_URL', 'https://urlpro.cc'),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  MODE: getEnvVar('MODE', 'development'),
};

export default ENV;
