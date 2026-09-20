const Cart = require('../models/Cart');

exports.getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product');

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

exports.addToCart = async (req, res, next) => {
  try {
    const { productId, quantity, size } = req.body;
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user.id,
        items: [{ product: productId, quantity: quantity || 1, size }]
      });
    } else {
      const itemIndex = cart.items.findIndex(p => p.product.toString() === productId && p.size === size);

      if (itemIndex > -1) {
        cart.items[itemIndex].quantity += (quantity || 1);
      } else {
        cart.items.push({ product: productId, quantity: quantity || 1, size });
      }
      await cart.save();
    }

    cart = await cart.populate('items.product');

    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

exports.updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Match by either item ID or product ID to be robust
    const itemIndex = cart.items.findIndex(
      p => p._id.toString() === req.params.itemId || p.product.toString() === req.params.itemId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      await cart.save();
      
      const populatedCart = await Cart.findOne({ user: req.user.id }).populate('items.product');
      return res.status(200).json({ success: true, data: populatedCart });
    } else {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
  } catch (error) {
    next(error);
  }
};

exports.removeFromCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Remove by matching either item ID or product ID
    cart.items = cart.items.filter(
      item => item._id.toString() !== req.params.itemId && item.product.toString() !== req.params.itemId
    );
    await cart.save();

    const populatedCart = await Cart.findOne({ user: req.user.id }).populate('items.product');

    res.status(200).json({
      success: true,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};
