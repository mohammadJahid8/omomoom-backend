import { z } from 'zod';

export const multiValue = (max = 25) =>
  z
    .preprocess(
      (value) => {
        if (value === undefined || value === null || value === '') return [];
        const list = Array.isArray(value) ? value : [value];
        return [
          ...new Set(
            list
              .flatMap((item) => String(item).split(','))
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ];
      },
      z.array(z.string().min(1).max(80)),
    )
    .refine((list) => list.length <= max, {
      message: `Provide at most ${max} values`,
    });

export const multiEnum = <T extends readonly [string, ...string[]]>(
  values: T,
  max = 25,
) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return [];
      const list = Array.isArray(value) ? value : [value];
      return [
        ...new Set(
          list
            .flatMap((item) => String(item).split(','))
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
        ),
      ];
    },
    z.array(z.enum(values)).max(max),
  );

export const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalised)) return true;
  if (['false', '0', 'no'].includes(normalised)) return false;
  return value; // let Zod report the bad value
}, z.boolean().optional());
