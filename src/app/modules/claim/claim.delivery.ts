import crypto from 'node:crypto';

import config from '../../../config';
import logger from '../../../shared/logger';

export const MOCK_CODE = '000000';

export type DeliveryChannel = 'PHONE' | 'EMAIL_DOMAIN';

export const hashCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex');

/** Last two digits kept so the owner can tell which number we used. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '•••• ••';
  return `••• ••• ${digits.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/**
 * No SMS or email provider is wired up yet, so the code is a fixed 000000 and
 * goes to the log instead of a phone. Swapping in Twilio and a mailer means
 * replacing the body of this function; everything downstream verifies the same
 * hash either way.
 */
export async function sendCode(
  channel: DeliveryChannel,
  destination: string,
): Promise<string> {
  const code = config.isProduction
    ? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    : MOCK_CODE;

  logger.info(
    { channel, destination, code },
    'Verification code issued (no provider configured, nothing was sent)',
  );

  return code;
}

export const codeIsMocked = !config.isProduction;
