const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/royalzone';
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};
// mongodb://localhost:27017/
mongoose.connection.on('disconnected', () => {
  console.error('[DIAGNOSTIC] MongoDB connection disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DIAGNOSTIC] MongoDB connection error:', err.stack || err);
});

module.exports = connectDB;
