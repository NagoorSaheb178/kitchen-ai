import mongoose from 'mongoose';
import dns from 'node:dns';

// Fix querySrv ECONNREFUSED on Windows with MongoDB Atlas SRV
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // ignore if disallowed
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

const safeMongoUri: string = MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };
global.mongoose = cached;

function resolveDirectFallback(uri: string): string | null {
  const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]+)(\?.*)?$/);
  if (!match) return null;
  const [, user, pass, host, db] = match;
  if (host.includes('test.gg7r1on.mongodb.net')) {
    return `mongodb://${user}:${pass}@ac-jxpidhb-shard-00-00.gg7r1on.mongodb.net:27017,ac-jxpidhb-shard-00-01.gg7r1on.mongodb.net:27017,ac-jxpidhb-shard-00-02.gg7r1on.mongodb.net:27017/${db}?ssl=true&replicaSet=atlas-128119-shard-0&authSource=admin&appName=Test`;
  }
  return null;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = (async () => {
      try {
        return await mongoose.connect(safeMongoUri, {
          bufferCommands: false,
          serverSelectionTimeoutMS: 8000,
        });
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || err?.syscall === 'querySrv') {
          const directUri = resolveDirectFallback(safeMongoUri);
          if (directUri) {
            console.log('[DB] SRV failed; falling back to direct replica-set hosts...');
            return await mongoose.connect(directUri, {
              bufferCommands: false,
              serverSelectionTimeoutMS: 8000,
            });
          }
        }
        throw err;
      }
    })();
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}

export default connectDB;
