export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string | undefined;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.API_PORT ?? 3000),
    host: process.env.API_HOST ?? '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL,
  };
}
