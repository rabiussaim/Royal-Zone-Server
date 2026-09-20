const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
  try {
    if (dns.setDefaultResultOrder) {
      dns.setDefaultResultOrder('ipv4first');
    }
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {}

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
