const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true
  },
  items: [{
    product: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: true
    },
    title: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    size: { type: String }
  }],
  shippingAddress: {
    name: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true }
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['cod', 'card', 'bank', 'easypaisa']
  },
  paymentVerifyToken: {
    type: String,
    select: false  // Don't expose token in normal queries
  },
  customerEmail: {
    type: String
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'verified'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, required: true },
  tax: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  notes: { type: String },
  stripePaymentIntentId: { type: String },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

orderSchema.methods.generateOrderNumber = function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  this.orderNumber = `RZ-${year}${month}-${randomStr}`;
};

orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    this.generateOrderNumber();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
