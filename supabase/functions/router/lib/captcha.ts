import { config } from './config.ts';

export async function verifyCaptcha(token?: string | null): Promise<boolean> {
  if (!config.captchaProvider || !config.captchaSecret) {
    return true;
  }
  return Boolean(token);
}
