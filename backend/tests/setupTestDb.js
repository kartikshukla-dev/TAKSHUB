const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

async function startTestDb() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  return uri;
}

async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
}

async function clearTestDb() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { startTestDb, stopTestDb, clearTestDb };
