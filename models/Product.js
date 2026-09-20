const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  longDescription: {
    type: String
  },
  price: {
    type: Number,
    required: true
  },
  oldPrice: {
    type: Number
  },
  discount: {
    type: Number,
    default: 0
  },
  category: {
    type: mongoose.Schema.ObjectId,
    ref: 'Category',
    required: true
  },
  images: [{
    type: String
  }],
  sizes: [{
    type: String
  }],
  stock: {
    type: Number,
    required: true,
    default: 0
  },
  rating: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  bestSeller: {
    type: Boolean,
    default: false
  },
  newArrival: {
    type: Boolean,
    default: false
  },
  luxuryCollection: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  specifications: [{
    key: String,
    value: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productSchema.pre('save', function(next) {
  if (this.oldPrice && this.oldPrice > this.price) {
    this.discount = Math.round(((this.oldPrice - this.price) / this.oldPrice) * 100);
  }
  next();
});

productSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'product',
  justOne: false
});

module.exports = mongoose.model('Product', productSchema);
