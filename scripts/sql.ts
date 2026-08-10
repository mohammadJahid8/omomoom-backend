process.env['LOG_LEVEL'] ??= 'warn';

const SHORTCUTS: Record<string, string> = {
  '\\dt': `SELECT table_name AS table
           FROM information_schema.tables
           WHERE table_schema = 'public'
           ORDER BY table_name`,

  '\\du': `SELECT rolname AS role, rolsuper AS superuser, rolcreatedb AS can_create_db
           FROM pg_roles WHERE rolcanlogin ORDER BY rolname`,

  '\\di': `SELECT indexname AS index, tablename AS table
           FROM pg_indexes WHERE schemaname = 'public'
           ORDER BY tablename, indexname`,

  '\\l': `SELECT datname AS database FROM pg_database WHERE datistemplate = false`,

  '\\conninfo': `SELECT current_database() AS database, current_user AS "user",
                        version() AS version`,
};

const describeTable = (table: string) => `
  SELECT column_name AS column,
         data_type AS type,
         is_nullable AS nullable,
         column_default AS default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = '${table}'
  ORDER BY ordinal_position`;

const resolve = (input: string): string => {
  const trimmed = input.trim();

  if (SHORTCUTS[trimmed]) return SHORTCUTS[trimmed];

  const describe = /^\\d\+?\s+(\w+)$/.exec(trimmed);
  if (describe) return describeTable(describe[1] as string);

  return trimmed;
};

const printable = (rows: unknown): unknown => {
  if (Array.isArray(rows)) return rows.map(printable);

  if (rows && typeof rows === 'object') {
    return Object.fromEntries(
      Object.entries(rows as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'bigint'
          ? Number(value)
          : value instanceof Date
            ? value.toISOString()
            : value,
      ]),
    );
  }

  return rows;
};

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(' ');

  if (!input.trim()) {
    console.error(
      'Usage: npm run db:sql "SELECT * FROM posts LIMIT 5"\n' +
        '       npm run db:sql "\\dt"        list tables\n' +
        '       npm run db:sql "\\d posts"   describe a table',
    );
    process.exit(1);
  }

  const { default: prisma } = await import('../src/shared/prisma');

  const query = resolve(input);
  const startedAt = Date.now();
  const result = await prisma.$queryRawUnsafe(query);
  const elapsed = Date.now() - startedAt;

  const rows = printable(result) as Record<string, unknown>[];

  if (Array.isArray(rows) && rows.length > 0) {
    console.table(rows);
    console.log(`${rows.length} row(s) in ${elapsed}ms`);
  } else if (Array.isArray(rows)) {
    console.log(`0 rows in ${elapsed}ms`);
  } else {
    console.log(rows, `(${elapsed}ms)`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      `\nSQL error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void import('../src/shared/prisma').then(({ default: prisma }) =>
      prisma.$disconnect(),
    );
  });
