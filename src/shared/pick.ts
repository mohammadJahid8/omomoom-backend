const pick = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Partial<T> => {
  const result: Partial<T> = {};

  for (const key of keys) {
    if (obj && Object.hasOwn(obj, key)) {
      const value = obj[key];
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value;
      }
    }
  }

  return result;
};

export default pick;
