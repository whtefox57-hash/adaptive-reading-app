function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export const limits = {
  dailyEditions: integer('MAX_DAILY_EDITIONS', 30, 1, 1000),
  generationIntervalMs: integer('GENERATION_INTERVAL_MS', 1000, 0, 60000),
  maxSourceCharacters: integer('MAX_SOURCE_CHARACTERS', 1500000, 1000, 1500000),
  maxRetries: 3,
  workerBatch: 10,
};
