const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('../models/Category');
const Product = require('../models/Product');

dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/royalzone2')
  .then(() => console.log('MongoDB Connected for Seeding'))
  .catch(err => console.error(err));

const categoriesData = [
  { name: 'perfume', slug: 'perfume', description: 'Luxury perfumes', isActive: true },
  { name: 'bedsheet', slug: 'bedsheet', description: 'Premium bedsheets', isActive: true }
];

const perfumeTitles = ['Oud Al Qamar', 'Rose Noire', 'Amber Mystique', 'Persian Jasmine', 'Midnight Oud', 'Sandalwood Dreams', 'Royal Musk', 'Desert Bloom', 'Golden Iris', 'Black Orchid', 'Velvet Rose', 'Cedar Royale', 'Saffron Elixir', 'Lavender Luxe', 'Vanilla Noir', 'Patchouli Prince', 'Bergamot Crown', 'Frankincense Gold', 'Tobacco Royale', 'White Amber'];
const bedsheetTitles = ['Royal Cotton 1000TC', 'Silk Touch Luxury Set', 'Egyptian Cotton King', 'Satin Bliss Queen', 'Bamboo Cloud Set', 'Pearl White Premium', 'Navy Elegance Set', 'Golden Threads King', 'Crimson Velvet Set', 'Ivory Dream Set', 'Midnight Blue Luxury', 'Sage Garden Set', 'Blush Romance Set', 'Grey Marble Premium', 'Charcoal Classic Set', 'Teal Ocean Luxury', 'Rose Gold Satin', 'Forest Green Premium', 'Lavender Lush Set', 'Cream Linen Luxury'];

const generateProducts = (titles, categoryId, isPerfume) => {
  return titles.map((title, index) => {
    const price = isPerfume ? Math.floor(Math.random() * (25000 - 3500 + 1) + 3500) : Math.floor(Math.random() * (35000 - 4500 + 1) + 4500);
    const hasDiscount = Math.random() > 0.5;
    const oldPrice = hasDiscount ? price + Math.floor(price * (Math.random() * 0.2 + 0.1)) : null;

    const sizes = isPerfume ? [] : ['Single', 'Double', 'Queen', 'King'];
    const specs = isPerfume 
      ? [
          { key: 'Volume', value: ['50ml', '100ml', '200ml'][Math.floor(Math.random()*3)] },
          { key: 'Fragrance Family', value: 'Woody/Floral/Oriental' },
          { key: 'Top Notes', value: 'Bergamot, Lemon' },
          { key: 'Heart Notes', value: 'Rose, Jasmine' },
          { key: 'Base Notes', value: 'Oud, Musk, Amber' }
        ]
      : [
          { key: 'Material', value: '100% Cotton / Silk Blend' },
          { key: 'Thread Count', value: ['400TC', '600TC', '1000TC'][Math.floor(Math.random()*3)] },
          { key: 'Care', value: 'Machine wash cold' }
        ];

    return {
      title,
      slug: title.toLowerCase().replace(/ /g, '-'),
      description: `Experience the luxury of ${title}, perfect for premium lifestyle.`,
      longDescription: `Experience the luxury of ${title}. Crafted with the finest ingredients and materials to provide an unforgettable experience. Perfect for those who appreciate premium quality.`,
      price,
      oldPrice,
      category: categoryId,
      images: [`https://picsum.photos/id/${(isPerfume ? 100 : 200) + index}/600/600`],
      sizes,
      stock: Math.floor(Math.random() * 100) + 10,
      rating: (Math.random() * (5 - 3.8) + 3.8).toFixed(1),
      reviewCount: Math.floor(Math.random() * 190) + 10,
      featured: Math.random() > 0.7,
      bestSeller: Math.random() > 0.7,
      newArrival: Math.random() > 0.7,
      luxuryCollection: Math.random() > 0.8,
      tags: [isPerfume ? 'perfume' : 'bedsheet', 'luxury', 'premium'],
      specifications: specs
    };
  });
};

const importData = async () => {
  try {
    await Category.deleteMany();
    await Product.deleteMany();

    const createdCategories = await Category.insertMany(categoriesData);
    
    const perfumeCategory = createdCategories.find(c => c.name === 'perfume');
    const bedsheetCategory = createdCategories.find(c => c.name === 'bedsheet');

    const perfumes = generateProducts(perfumeTitles, perfumeCategory._id, true);
    const bedsheets = generateProducts(bedsheetTitles, bedsheetCategory._id, false);

    await Product.insertMany([...perfumes, ...bedsheets]);

    console.log('Data Imported successfully');
    process.exit();
  } catch (error) {
    console.error(`Error with data import: ${error}`);
    process.exit(1);
  }
};

importData();
