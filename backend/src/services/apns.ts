import { config } from '../config.js';

export async function sendApnsPushNotification(serialNumber: string, _payload: Record<string, unknown>): Promise<{ sent: boolean; reason?: string }> {
  if (!config.apnsKeyPath || !config.apnsKeyId) {
    return { sent: false, reason: 'APNs not configured' };
  }

  return { sent: false, reason: `APNs stub for ${serialNumber}` };
}
