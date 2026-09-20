const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const express = require('express');
const dotenv = require('dotenv');
// Load env vars immediately before other modules
dotenv.config();

const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');

// Route files
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');

// Connect to database
connectDB();

const app = express();

// Disable ETag caching for dynamic API responses
app.set('etag', false);

// Body parser (10mb limit for base64 product image uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Security middleware
app.use(helmet());

// Hardcoded allowed origins — always permitted regardless of CLIENT_URL env var
const HARDCODED_ORIGINS = [
  'https://www.royalzonepk.com',
  'https://royalzonepk.com',
  'https://royal-zone.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

const envOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : [];

const allowedOrigins = [...new Set([...HARDCODED_ORIGINS, ...envOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any Vercel preview deployment
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    // Allow any royalzonepk.com subdomain
    if (origin.endsWith('royalzonepk.com')) return callback(null, true);
    // Check against allowed list
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Log blocked origins for debugging
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials: true,
}));

// Prevent HTTP 304 caching on API routes
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);

// Error handler middleware
app.use(errorHandler);

// Process-level diagnostic logging
process.on('uncaughtException', (err) => {
  console.error('[DIAGNOSTIC] UNCAUGHT EXCEPTION:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[DIAGNOSTIC] UNHANDLED REJECTION:', reason.stack || reason);
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('[DIAGNOSTIC] Server error:', err.stack || err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
});

