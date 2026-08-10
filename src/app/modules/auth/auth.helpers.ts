import prisma from '../../../shared/prisma';

const MAX_LENGTH = 24;

const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '');

export async function generateUsername(
  displayName: string,
  email: string,
): Promise<string> {
  const base =
    slugify(displayName) || slugify(email.split('@')[0] ?? '') || 'foodie';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`.slice(0, 32);
}

const LOCK_AFTER_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export const lockState = (failedCount: number) => ({
  shouldLock: failedCount + 1 >= LOCK_AFTER_ATTEMPTS,
  lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
});

export const LOCK_AFTER = LOCK_AFTER_ATTEMPTS;
export const LOCK_FOR_MINUTES = LOCK_MINUTES;
