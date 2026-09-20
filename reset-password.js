const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGO_URI = 'mongodb+srv://hafizrabiussaim_db_user:Hafiz786@royalzone.wh1bcv7.mongodb.net/royalzone?retryWrites=true&w=majority&appName=RoyalZone';
const TARGET_EMAIL = 'saimlinkedin0000@gmail.com';
const NEW_PASSWORD = 'AdminPassword123!';

async function resetPassword() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const User = require('./models/User');

    const user = await User.findOne({ email: TARGET_EMAIL });

    if (!user) {
      console.log('❌ User not found:', TARGET_EMAIL);
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, salt);

    await User.findByIdAndUpdate(user._id, { password: hashedPassword });

    console.log('✅ Password reset successfully!');
    console.log('Email   :', TARGET_EMAIL);
    console.log('Password:', NEW_PASSWORD);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

resetPassword();
