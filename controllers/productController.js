const Product = require('../models/Product');
const Category = require('../models/Category');

exports.getProducts = async (req, res, next) => {
  try {
    let query;
    const reqQuery = { ...req.query };
    const removeFields = ['select', 'sort', 'page', 'limit', 'category', 'search'];
    removeFields.forEach(param => delete reqQuery[param]);

    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
    
    query = Product.find(JSON.parse(queryStr)).populate('category', 'name slug');

    // Category filter
    if (req.query.category) {
      const category = await Category.findOne({ slug: req.query.category });
      if (category) {
        query = query.where({ category: category._id });
      }
    }

    // Search
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query = query.or([
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ]);
    }

    // Sort
    if (req.query.sort) {
      if (req.query.sort === 'price-asc') query = query.sort('price');
      else if (req.query.sort === 'price-desc') query = query.sort('-price');
      else if (req.query.sort === 'rating') query = query.sort('-rating');
      else if (req.query.sort === 'newest') query = query.sort('-createdAt');
    } else {
      query = query.sort('-createdAt'); // default sort
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Product.countDocuments(query);

    query = query.skip(startIndex).limit(limit);

    const products = await query;

    const pagination = {
      total,
      pages: Math.ceil(total / limit),
      page,
      limit
    };

    res.status(200).json({
      success: true,
      count: products.length,
      pagination,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('reviews');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ featured: true })
      .populate('category', 'name slug')
      .limit(8);

    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

exports.getProductsByCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.category });
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const products = await Product.find({ category: category._id })
      .populate('category', 'name slug');

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

exports.searchProducts = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    const products = await Product.find({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ]
    }).populate('category', 'name slug');

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { title, description, longDescription, price, oldPrice, category, images, sizes, stock, tags, featured, bestSeller, newArrival, luxuryCollection } = req.body;

    if (!title || !description || !price || !category) {
      return res.status(400).json({ success: false, message: 'Title, description, price, and category are required' });
    }

    // Resolve category by name (e.g. 'perfume' or 'bedsheet')
    let categoryDoc = await Category.findOne({ name: category.toLowerCase() });
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: `Category '${category}' not found` });
    }

    // Generate slug from title
    let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // Ensure uniqueness
    const existing = await Product.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    const product = await Product.create({
      title,
      slug,
      description,
      longDescription: longDescription || '',
      price,
      oldPrice: oldPrice || undefined,
      category: categoryDoc._id,
      images: images || [],
      sizes: sizes || [],
      stock: stock || 0,
      tags: tags || [],
      featured: featured || false,
      bestSeller: bestSeller || false,
      newArrival: newArrival || false,
      luxuryCollection: luxuryCollection || false,
    });

    const populated = await Product.findById(product._id).populate('category', 'name slug');

    res.status(201).json({
      success: true,
      data: populated
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (req.body.category && typeof req.body.category === 'string') {
      const categoryDoc = await Category.findOne({ name: req.body.category.toLowerCase() });
      if (categoryDoc) req.body.category = categoryDoc._id;
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('category', 'name slug');

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

