import { MongoClient } from "mongodb";

type MongoClientCache = {
  clients: Map<string, Promise<MongoClient>>;
};

declare global {
  var __zaiMongoClientCache: MongoClientCache | undefined;
}

function getMongoClientCache(): MongoClientCache {
  if (!globalThis.__zaiMongoClientCache) {
    globalThis.__zaiMongoClientCache = { clients: new Map<string, Promise<MongoClient>>() };
  }
  return globalThis.__zaiMongoClientCache;
}

export async function getMongoClient(mongoUri: string): Promise<MongoClient> {
  const cache = getMongoClientCache();
  const existing = cache.clients.get(mongoUri);
  if (existing) return existing;

  const clientPromise = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 })
    .connect()
    .catch((error) => {
      cache.clients.delete(mongoUri);
      throw error;
    });

  cache.clients.set(mongoUri, clientPromise);
  return clientPromise;
}
