const express = require('express');
const {
  createOrder,
  getUserOrders,
  getAllOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  createPaymentIntent,
  getStripeConfig,
  verifyPaymentByToken,
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public: Owner clicks "Verify Payment" link from email ─────────────────────
router.get('/verify-payment/:token', verifyPaymentByToken);

// ── Protected: Stripe publishable key config ──────────────────────────────────
router.get('/stripe-config', protect, getStripeConfig);

router.use(protect);

// Admin: Get all customer orders with filtering/search
router.get('/admin/all', adminOnly, getAllOrders);

// Create Stripe Payment Intent
router.post('/create-payment-intent', createPaymentIntent);

// CRUD for orders
router.route('/')
  .post(createOrder)
  .get(getUserOrders);

router.route('/:id')
  .get(getOrderById);

router.put('/:id/cancel', cancelOrder);
router.put('/:id/status', adminOnly, updateOrderStatus);
router.patch('/:id/status', adminOnly, updateOrderStatus);

module.exports = router;

