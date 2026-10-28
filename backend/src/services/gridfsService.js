const mongoose = require('mongoose');
const { Readable } = require('stream');

let bucket = null;

// Lazily creates (or returns) the GridFSBucket used for task attachments.
// Must be called after mongoose.connect() has resolved.
function getBucket() {
  if (bucket) return bucket;
  if (mongoose.connection.readyState !== 1) {
    throw new Error('GridFS bucket requested before MongoDB connection is ready');
  }
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
  return bucket;
}

// Resets the cached bucket reference (used in tests when the connection is torn down).
function resetBucket() {
  bucket = null;
}

function uploadBuffer({ buffer, filename, contentType }) {
  return new Promise((resolve, reject) => {
    const uploadStream = getBucket().openUploadStream(filename, { contentType });
    Readable.from(buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve(uploadStream.id));
  });
}

function downloadStream(fileId) {
  return getBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId));
}

async function findFile(fileId) {
  const files = await getBucket().find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
  return files[0] || null;
}

function deleteFile(fileId) {
  return getBucket().delete(new mongoose.Types.ObjectId(fileId));
}

module.exports = { getBucket, resetBucket, uploadBuffer, downloadStream, findFile, deleteFile };
