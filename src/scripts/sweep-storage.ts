/**
 * Deletes files in R2 that no row points at.
 *
 * An upload reaches storage before anything records it, so a failed commit or
 * a closed tab leaves the file behind with nothing referencing it. Nothing in
 * the app can notice that, because the only evidence is an absence.
 *
 *   npm run storage:sweep            list what would go
 *   npm run storage:sweep -- --apply actually delete it
 */
import prisma from '../shared/prisma';
import { listObjects, removeObject, storageEnabled } from '../shared/storage';

/** Young files are skipped: an upload in flight has no row yet and is not an orphan. */
const MIN_AGE_HOURS = 6;

const PREFIXES = ['avatars/', 'restaurants/', 'community/'];

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

async function referencedKeys(): Promise<Set<string>> {
  const [photos, avatars] = await Promise.all([
    prisma.restaurantPhoto.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    }),
    prisma.user.findMany({
      where: { avatarUrl: { not: null } },
      select: { avatarUrl: true },
    }),
  ]);

  const keys = new Set<string>();

  for (const photo of photos) {
    if (photo.storageKey) keys.add(photo.storageKey);
  }

  // Avatars are stored as a URL, so the key is whatever follows the host.
  for (const user of avatars) {
    const match = /\/(avatars\/.+)$/.exec(user.avatarUrl ?? '');
    if (match?.[1]) keys.add(match[1]);
  }

  return keys;
}

async function main() {
  const apply = process.argv.includes('--apply');

  if (!storageEnabled) {
    console.error('Storage is not configured. Nothing to sweep.');
    process.exit(1);
  }

  const keys = await referencedKeys();
  console.log(`${keys.size} files are referenced by a row.`);

  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000);
  let scanned = 0;
  let orphans = 0;
  let bytes = 0;

  for (const prefix of PREFIXES) {
    for await (const object of listObjects(prefix)) {
      scanned += 1;

      if (keys.has(object.key)) continue;
      if (object.uploadedAt > cutoff) continue;

      orphans += 1;
      bytes += object.size;
      console.log(`  ${apply ? 'deleting' : 'orphan  '} ${object.key} (${mb(object.size)}MB)`);

      if (apply) await removeObject(object.key);
    }
  }

  console.log('');
  console.log(`scanned ${scanned}, orphaned ${orphans}, ${mb(bytes)}MB`);
  console.log(
    apply
      ? 'Deleted.'
      : 'Nothing was deleted. Re-run with --apply to remove them.',
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
