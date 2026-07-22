import './env.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { disconnectPrisma } from './db/client.js';
import { ensureBucketForDev } from './services/storage.service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  // 개발(MinIO)에서 버킷이 없으면 생성. 실제 AWS에서는 no-op.
  await ensureBucketForDev();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
