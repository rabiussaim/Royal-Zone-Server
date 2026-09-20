const jwt = require('jsonwebtoken');

const generateToken = (userId, role) => {
  const secret = process.env.JWT_SECRET || 'royal_zone_super_secret_jwt_key_2025';
  const expire = process.env.JWT_EXPIRE || '30d';
  return jwt.sign({ id: userId, role }, secret, {
    expiresIn: expire,
  });
};

module.exports = generateToken;
