import { createClient } from "redis";
import { config } from "./config";

export const DOCUMENT_INGESTION_STREAM = "document-ingestion";

export type DocumentIngestionJob = {
  ingestionRunId: string;
  documentId: string;
  versionId: string;
  extractionProfile: string;
};

type RedisClient = ReturnType<typeof createClient>;

const globalForRedis = globalThis as unknown as { redisClientPromise?: Promise<RedisClient> };

export async function getRedisClient(): Promise<RedisClient> {
  if (!globalForRedis.redisClientPromise) {
    globalForRedis.redisClientPromise = (async () => {
      const client = createClient({ url: config.redisUrl });
      client.on("error", (error) => {
        console.error("redis_client_error", error);
      });
      await client.connect();
      return client;
    })().catch((error) => {
      globalForRedis.redisClientPromise = undefined;
      throw error;
    });
  }

  return globalForRedis.redisClientPromise;
}

export async function enqueueDocumentIngestion(job: DocumentIngestionJob): Promise<string> {
  const client = await getRedisClient();
  return client.xAdd(DOCUMENT_INGESTION_STREAM, "*", {
    payload: JSON.stringify(job)
  });
}

export async function closeRedisClientForTests(): Promise<void> {
  const client = await globalForRedis.redisClientPromise;
  if (client?.isOpen) {
    await client.quit();
  }
  globalForRedis.redisClientPromise = undefined;
}
