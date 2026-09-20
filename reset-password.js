const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '.env'),
  override: true
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hafizrabiussaim_db_user:Hafiz786@royalzone.wh1bcv7.mongodb.net/royalzone?appName=RoyalZone';
const TARGET_EMAIL = 'saimlinkedin0000@gmail.com';
const NEW_PASSWORD = 'AdminPassword123!';

async function resetOrCreateAdmin() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Database:', mongoose.connection.name);

    const User = require('./models/User');

    let user = await User.findOne({ email: TARGET_EMAIL });

    if (!user) {
      console.log('Creating new Admin / Store Owner account...');
      user = await User.create({
        name: 'Store Owner',
        email: TARGET_EMAIL,
        password: NEW_PASSWORD,
        role: 'admin'
      });
      console.log('✅ Admin user created successfully!');
    } else {
      user.password = NEW_PASSWORD;
      user.role = 'admin';
      await user.save();
      console.log('✅ Admin user password and role updated successfully!');
    }

    console.log('--- Admin Account Details ---');
    console.log('Email   :', TARGET_EMAIL);
    console.log('Password:', NEW_PASSWORD);
    console.log('Role    : admin');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
}

resetOrCreateAdmin();
