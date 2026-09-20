const mongoose = require('mongoose');
const crypto = require('crypto');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const {
  sendOrderNotification,
  sendCustomerPendingEmail,
  sendCustomerPaymentVerifiedEmail,
  sendCustomerCODEmail,
} = require('../utils/sendEmail');

// Stripe: initialize only if key is set and not a placeholder
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripeAvailable = stripeKey && !stripeKey.includes('PLACEHOLDER');
const stripe = stripeAvailable ? require('stripe')(stripeKey) : null;

// ─── Create Payment Intent (Stripe) ─────────────────────────────────────────
exports.createPaymentIntent = async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: 'Stripe is not configured. Please add STRIPE_SECRET_KEY to server .env'
      });
    }

    const { amount, currency = 'pkr' } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { userId: req.user.id.toString() },
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Create Order ────────────────────────────────────────────────────────────
exports.createOrder = async (req, res, next) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      shippingCost,
      tax,
      discount = 0,
      total,
      notes,
      stripePaymentIntentId,
      customerEmail,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items provided' });
    }

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.street || !shippingAddress.city || !shippingAddress.phone) {
      return res.status(400).json({ success: false, message: 'Complete shipping information (name, address, city, phone) is required' });
    }

    // Process and validate items
    const processedItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
      const productId = item.product || item._id || item.productId;
      let unitPrice = Number(item.price) || 0;
      let itemTitle = item.title || 'Product';
      let itemImage = item.image || item.images?.[0] || '';

      // Try looking up real product in DB if valid ObjectId
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        try {
          const dbProduct = await Product.findById(productId);
          if (dbProduct) {
            unitPrice = dbProduct.price;
            itemTitle = dbProduct.title;
            if (dbProduct.images && dbProduct.images.length > 0) {
              itemImage = dbProduct.images[0];
            }
          }
        } catch (_) {}
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const itemTotal = unitPrice * qty;
      calculatedSubtotal += itemTotal;

      processedItems.push({
        product: mongoose.Types.ObjectId.isValid(productId) ? productId : new mongoose.Types.ObjectId(),
        title: itemTitle,
        image: itemImage,
        price: unitPrice,
        quantity: qty,
        size: item.size || ''
      });
    }

    const finalSubtotal = calculatedSubtotal > 0 ? calculatedSubtotal : (Number(subtotal) || 0);
    const finalShippingCost = finalSubtotal >= 5000 ? 0 : (Number(shippingCost) >= 0 ? Number(shippingCost) : 200);
    const finalTax = Math.round(finalSubtotal * 0.17);
    const finalDiscount = Number(discount) || 0;
    const finalTotal = finalSubtotal + finalShippingCost + finalTax - finalDiscount;

    // For Stripe payments, verify the payment intent was successful
    let paymentStatus = 'pending';
    if (paymentMethod === 'card' && stripePaymentIntentId) {
      if (stripe) {
        try {
          const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
          if (intent.status === 'succeeded') {
            paymentStatus = 'paid';
          } else {
            return res.status(400).json({ success: false, message: 'Payment not confirmed. Please complete card payment first.' });
          }
        } catch (stripeErr) {
          console.error('Stripe verification error:', stripeErr.message);
          if (stripeKey && stripeKey.includes('PLACEHOLDER')) {
            paymentStatus = 'pending';
          } else {
            return res.status(400).json({ success: false, message: 'Could not verify payment. Please try again.' });
          }
        }
      }
    }

    // Generate a secure verify token for manual payment methods
    const isManualPayment = ['easypaisa', 'bank'].includes(paymentMethod);
    const verifyToken = isManualPayment ? crypto.randomBytes(32).toString('hex') : undefined;

    // Get customer email from auth user if not provided
    const User = require('../models/User');
    let resolvedEmail = customerEmail;
    if (!resolvedEmail && req.user && req.user.id) {
      try {
        const user = await User.findById(req.user.id).select('email');
        if (user) resolvedEmail = user.email;
      } catch (_) {}
    }

    const order = await Order.create({
      user: req.user.id,
      items: processedItems,
      shippingAddress: {
        name: shippingAddress.name,
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state || '',
        zipCode: shippingAddress.zipCode || '54000',
        country: shippingAddress.country || 'Pakistan',
        phone: shippingAddress.phone,
      },
      paymentMethod,
      paymentStatus,
      subtotal: finalSubtotal,
      shippingCost: finalShippingCost,
      tax: finalTax,
      discount: finalDiscount,
      total: finalTotal,
      notes: notes || '',
      customerEmail: resolvedEmail || '',
      ...(stripePaymentIntentId && { stripePaymentIntentId }),
      ...(verifyToken && { paymentVerifyToken: verifyToken }),
    });

    // Clear cart after order placed
    const cart = await Cart.findOne({ user: req.user.id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    // ── Send emails asynchronously ────────────────────────────────────────────
    sendOrderNotification(order, verifyToken).catch(err =>
      console.error('Owner notification email error:', err.message)
    );

    if (paymentMethod === 'cod') {
      sendCustomerCODEmail(order).catch(err =>
        console.error('Customer COD email error:', err.message)
      );
    } else if (isManualPayment && resolvedEmail) {
      sendCustomerPendingEmail(order, resolvedEmail).catch(err =>
        console.error('Customer pending email error:', err.message)
      );
    }

    res.status(201).json({
      success: true,
      data: order,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Verify Payment by Token (Owner clicks link in email) ────────────────────
exports.verifyPaymentByToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;background:#f9f9f9;">
          <h2 style="color:#c62828;">❌ Invalid verification link.</h2>
        </body></html>
      `);
    }

    const order = await Order.findOne({ paymentVerifyToken: token }).select('+paymentVerifyToken');

    if (!order) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;background:#f9f9f9;">
          <h1 style="color:#C9A96E;font-family:Georgia,serif;">ROYAL ZONE</h1>
          <h2 style="color:#c62828;">❌ Invalid or Expired Link</h2>
          <p style="color:#555;">This payment verification link is no longer valid.</p>
        </body></html>
      `);
    }

    if (order.paymentStatus === 'verified' || order.paymentStatus === 'paid') {
      return res.send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;background:#f9f9f9;">
          <h1 style="color:#C9A96E;font-family:Georgia,serif;">ROYAL ZONE</h1>
          <h2 style="color:#2e7d32;">✅ Already Verified</h2>
          <p style="color:#555;">Order <strong style="color:#C9A96E;">${order.orderNumber}</strong> has already been verified.</p>
        </body></html>
      `);
    }

    order.paymentStatus = 'verified';
    order.paymentVerifyToken = undefined;
    await order.save();

    sendCustomerPaymentVerifiedEmail(order).catch(err =>
      console.error('Customer verified email error:', err.message)
    );

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Verified — Royal Zone</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
          .card { background: white; border-radius: 16px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.1); }
          .logo { font-size: 28px; font-weight: bold; color: #0A0F1E; font-family: Georgia, serif; letter-spacing: 3px; margin-bottom: 6px; }
          .subtitle { color: #C9A96E; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 32px; }
          .icon { font-size: 72px; line-height: 1; margin-bottom: 20px; }
          h1 { color: #2e7d32; font-size: 24px; margin-bottom: 12px; }
          p { color: #555; font-size: 14px; line-height: 1.7; margin-bottom: 8px; }
          .order-box { background: #C9A96E15; border: 1px solid #C9A96E50; border-radius: 10px; padding: 16px; margin: 24px 0; }
          .order-number { color: #C9A96E; font-size: 20px; font-weight: bold; }
          .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 8px 24px; border-radius: 20px; font-weight: bold; font-size: 13px; border: 2px solid #a5d6a7; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">ROYAL ZONE</div>
          <div class="subtitle">Luxury Lifestyle Store</div>
          <div class="icon">✅</div>
          <h1>Payment Verified!</h1>
          <div class="order-box">
            <p style="color:#888;font-size:12px;margin-bottom:4px;">ORDER NUMBER</p>
            <div class="order-number">${order.orderNumber}</div>
            <p style="margin-top:8px;">Total: PKR ${order.total.toLocaleString()}</p>
          </div>
          <p>The payment has been marked as <strong>VERIFIED</strong>.</p>
          <p>A confirmation email has been sent to the customer automatically.</p>
          <div class="badge">✅ STATUS: VERIFIED</div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Verify payment error:', error.message);
    res.status(500).send(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;">
        <h2 style="color:#c62828;">❌ Server Error</h2>
        <p>${error.message}</p>
      </body></html>
    `);
  }
};

// ─── Get User Orders ──────────────────────────────────────────────────────────
exports.getUserOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;

    const total = await Order.countDocuments({ user: req.user.id });

    const orders = await Order.find({ user: req.user.id })
      .sort('-createdAt')
      .skip(startIndex)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: orders.length,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit
      },
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get All Orders (Admin) ───────────────────────────────────────────────────
exports.getAllOrders = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.orderStatus = status.toLowerCase();
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderNumber: searchRegex },
        { customerEmail: searchRegex },
        { 'shippingAddress.name': searchRegex },
        { 'shippingAddress.phone': searchRegex },
        { 'shippingAddress.city': searchRegex },
      ];
    }

    const startIndex = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .sort('-createdAt')
      .skip(startIndex)
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      count: orders.length,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Single Order ─────────────────────────────────────────────────────────
exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let order;

    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await Order.findById(id).populate('user', 'name email phone');
    }
    if (!order) {
      order = await Order.findOne({ orderNumber: id }).populate('user', 'name email phone');
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Security check: owner of order OR admin
    const userIdStr = req.user.id ? req.user.id.toString() : '';
    const isOwner = order.user && (order.user._id ? order.user._id.toString() === userIdStr : order.user.toString() === userIdStr);
    const isAdmin = req.user.role === 'admin' || (req.user.email && req.user.email.toLowerCase().trim() === 'saimlinkedin0000@gmail.com');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this order' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Cancel Order ─────────────────────────────────────────────────────────────
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const userIdStr = req.user.id ? req.user.id.toString() : '';
    const isOwner = order.user && (order.user._id ? order.user._id.toString() === userIdStr : order.user.toString() === userIdStr);
    const isAdmin = req.user.role === 'admin' || (req.user.email && req.user.email.toLowerCase().trim() === 'saimlinkedin0000@gmail.com');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this order' });
    }

    if (order.orderStatus !== 'pending' && order.orderStatus !== 'processing') {
      return res.status(400).json({ success: false, message: 'Cannot cancel order at this stage' });
    }

    order.orderStatus = 'cancelled';
    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Update Order Status (Admin) ──────────────────────────────────────────────
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    let order = await Order.findById(req.params.id);
    if (!order) {
      order = await Order.findOne({ orderNumber: req.params.id });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (orderStatus) order.orderStatus = orderStatus.toLowerCase();
    if (paymentStatus) order.paymentStatus = paymentStatus.toLowerCase();

    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Get Stripe Config ────────────────────────────────────────────────────────
exports.getStripeConfig = async (req, res) => {
  const pubKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const available = pubKey && !pubKey.includes('PLACEHOLDER');
  res.json({
    success: true,
    publishableKey: available ? pubKey : null,
    stripeAvailable: available,
  });
};

