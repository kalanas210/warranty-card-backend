import jwt from 'jsonwebtoken';
import Shop from '../models/Shop.js';

const adminAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    if (decoded.type === 'admin') {
      req.admin = decoded;
      next();
    } else {
      res.status(403).json({ message: 'Admin access required' });
    }
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const shopAuth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    if (decoded.type === 'shop') {
      const shop = await Shop.findById(decoded.id);
      if (!shop) {
        return res.status(401).json({ message: 'Shop not found' });
      }
      req.shop = shop;
      next();
    } else {
      res.status(403).json({ message: 'Shop access required' });
    }
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export { adminAuth, shopAuth };