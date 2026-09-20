/**
 * Script to create/reset the owner/admin account in MongoDB Atlas.
 * Run: node utils/createAdmin.js
 */

const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_EMAIL = 'saimlinkedin0000@gmail.com';
const ADMIN_PASSWORD = 'AdminPassword1231';
const ADMIN_NAME = 'Royal Zone Owner';

async function createAdmin() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    console.log('URI:', MONGO_URI ? MONGO_URI.replace(/:([^:@]+)@/, ':****@') : 'NOT SET');

    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    // Load User model (after connection)
    const User = require('../models/User');

    // Check if admin exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log('Admin user already exists. Resetting password...');
      // Force update password (bypass pre-save hook by hashing manually)
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, salt);
      await User.updateOne({ email: ADMIN_EMAIL }, {
        $set: { password: hashed, role: 'admin', name: ADMIN_NAME }
      });
      console.log('✅ Password reset successfully.');
    } else {
      console.log('Creating new admin user...');
      // Hash manually to avoid double-hashing from pre-save hook if we use .create()
      // Actually use .save() which will trigger the pre-save hook properly
      const user = new User({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD, // pre-save hook will hash this
        role: 'admin',
      });
      await user.save();
      console.log('✅ Admin user created successfully.');
    }

    console.log('');
    console.log('Login credentials:');
    console.log('  Email:   ', ADMIN_EMAIL);
    console.log('  Password:', ADMIN_PASSWORD);
    console.log('  Role:     admin');

    // Verify the password works
    const verifyUser = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
    const match = await bcrypt.compare(ADMIN_PASSWORD, verifyUser.password);
    console.log('');
    console.log('✅ Password verification:', match ? 'PASSED ✓' : 'FAILED ✗');

    await mongoose.disconnect();
    console.log('Done. Disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
