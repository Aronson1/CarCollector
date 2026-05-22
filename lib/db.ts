import mongoose from "mongoose";

export class DatabaseUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseUnavailableError";
  }
}

declare global {
  var mongooseConnection:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}

const fallbackLocalUri = "mongodb://127.0.0.1:27017/carCollectorDB";

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI || fallbackLocalUri;

  if (!global.mongooseConnection) {
    global.mongooseConnection = { conn: null, promise: null };
  }

  if (global.mongooseConnection.conn) {
    return global.mongooseConnection.conn;
  }

  if (!global.mongooseConnection.promise) {
    global.mongooseConnection.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    global.mongooseConnection.conn = await global.mongooseConnection.promise;
  } catch (error) {
    global.mongooseConnection.promise = null;
    throw new DatabaseUnavailableError(
      "Database is unavailable. Start local MongoDB on 127.0.0.1:27017 or configure MONGODB_URI.",
      { cause: error },
    );
  }

  return global.mongooseConnection.conn;
}
