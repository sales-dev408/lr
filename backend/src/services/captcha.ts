import { config } from '../config.js';

export async function verifyCaptcha(token?: string | null): Promise<boolean> {
  if (!config.captchaProvider || config.nodeEnv === 'development' || config.nodeEnv === 'test') {
    return true;
  }

  return Boolean(token && config.captchaSecret);
}
