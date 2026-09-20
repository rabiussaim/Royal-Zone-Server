const express = require('express');
const { getWishlist, addToWishlist, removeFromWishlist, toggleWishlist } = require('../controllers/wishlistController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getWishlist);

router.post('/toggle', toggleWishlist);

router.route('/:productId')
  .delete(removeFromWishlist);

module.exports = router;
