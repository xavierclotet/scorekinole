/**
 * Device info utilities for tracking and fraud detection
 */

/**
 * Get client IP address using external service
 */
export async function getClientIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) {
      return 'unknown';
    }
    const data = await response.json();
    return data.ip || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Generate a simple device fingerprint based on browser/device characteristics
 * This is a basic fingerprint - not as robust as libraries like FingerprintJS
 * but sufficient for detecting obvious duplicate accounts
 */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    `${screen.colorDepth}`,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || '0',
    navigator.maxTouchPoints?.toString() || '0',
    // Canvas fingerprint would go here but is more invasive
  ];

  // Create a simple hash from the components
  const dataString = components.join('|');
  return simpleHash(dataString);
}

/**
 * Get device info object for storage
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    ip: await getClientIP(),
    fingerprint: getDeviceFingerprint(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    screenResolution: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  };
}

export interface DeviceInfo {
  ip: string;
  fingerprint: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
}

/**
 * Simple hash function for fingerprinting
 * Not cryptographically secure, just for generating a consistent ID
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to base36 and take first 16 chars
  return Math.abs(hash).toString(36).padStart(8, '0') +
         Math.abs(hash * 31).toString(36).padStart(8, '0');
}
