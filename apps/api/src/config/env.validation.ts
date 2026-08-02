function required(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`La variable ${key} est obligatoire.`);
  }
  return value;
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const databaseUrl = required(config, 'DATABASE_URL');
  const accessSecret = required(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = required(config, 'JWT_REFRESH_SECRET');
  const webUrl = required(config, 'WEB_URL');

  if (!databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL doit utiliser PostgreSQL.');
  }
  if (accessSecret.length < 32 || refreshSecret.length < 32 || accessSecret === refreshSecret) {
    throw new Error('Les secrets JWT doivent être différents et contenir au moins 32 caractères.');
  }
  try {
    new URL(webUrl);
  } catch {
    throw new Error('WEB_URL doit être une URL valide.');
  }

  const port = Number(config.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT doit être un port valide.');
  }

  const hospitalUtcOffsetMinutes = Number(config.HOSPITAL_UTC_OFFSET_MINUTES ?? 120);
  if (
    !Number.isInteger(hospitalUtcOffsetMinutes) ||
    hospitalUtcOffsetMinutes < -720 ||
    hospitalUtcOffsetMinutes > 840
  ) {
    throw new Error('HOSPITAL_UTC_OFFSET_MINUTES doit être compris entre -720 et 840.');
  }

  return {
    ...config,
    API_PORT: port,
    HOSPITAL_UTC_OFFSET_MINUTES: hospitalUtcOffsetMinutes,
  };
}
