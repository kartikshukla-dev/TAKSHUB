const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI from environment variables.
 * Exits the process on failure in production; rethrows otherwise so
 * callers/tests can handle it.
 */
async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(mongoUri);
    console.log(`[db] Connected to MongoDB: ${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    throw err;
  }
}

function getConnectionState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return mongoose.connection.readyState;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, getConnectionState, mongoose };
