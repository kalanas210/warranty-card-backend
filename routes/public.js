import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { shopAuth } from '../middleware/auth.js';
import Shop from '../models/Shop.js';
import Product from '../models/Product.js';
import QRCode from '../models/QRCode.js';

const router = express.Router();

// Get QR code info
router.get('/qr/:serialNumber', async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const qrcode = await QRCode.findOne({ serialNumber });
    
    if (!qrcode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    const product = await Product.findOne({ productId: qrcode.productId });
    
    if (!qrcode.isActivated) {
      // First scan - need activation
      const shop = qrcode.assignedShopId ? await Shop.findOne({ shopId: qrcode.assignedShopId }).select('-password') : null;
      res.json({
        status: 'needs_activation',
        qrcode,
        product,
        shop
      });
    } else {
      // Already activated - show warranty info
      const shop = await Shop.findOne({ shopId: qrcode.assignedShopId }).select('-password');
      const warrantyEndDate = new Date(qrcode.activationDate);
      warrantyEndDate.setDate(warrantyEndDate.getDate() + product.warrantyDuration);
      
      const remainingDays = Math.max(0, Math.ceil((warrantyEndDate - new Date()) / (1000 * 60 * 60 * 24)));
      
      res.json({
        status: 'activated',
        qrcode,
        product,
        shop,
        warrantyEndDate,
        remainingDays
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Shop login
router.post('/shop/login', async (req, res) => {
  try {
    const { shopId, password } = req.body;
    
    const shop = await Shop.findOne({ shopId });
    if (!shop) {
      return res.status(401).json({ message: 'Invalid shop ID or password' });
    }
    
    const isMatch = await bcrypt.compare(password, shop.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid shop ID or password' });
    }
    
    const token = jwt.sign(
      { type: 'shop', id: shop._id, shopId: shop.shopId },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: '24h' }
    );
    
    res.json({ token, shop: { ...shop.toObject(), password: undefined } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Activate QR code
router.post('/qr/:serialNumber/activate', shopAuth, async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const { customerName, customerAddress, customerPhone } = req.body;
    
    const qrcode = await QRCode.findOne({ serialNumber });
    if (!qrcode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    if (qrcode.isActivated) {
      return res.status(400).json({ message: 'QR code already activated' });
    }
    
    if (qrcode.assignedShopId !== req.shop.shopId) {
      return res.status(403).json({ message: 'This QR code is not assigned to your shop' });
    }
    
    qrcode.isActivated = true;
    qrcode.activationDate = new Date();
    qrcode.customerName = customerName;
    qrcode.customerAddress = customerAddress;
    qrcode.customerPhone = customerPhone;
    
    await qrcode.save();
    
    res.json({ message: 'QR code activated successfully', qrcode });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;