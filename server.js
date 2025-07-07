import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/warranty-system';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  console.log('\n=== MONGODB SETUP REQUIRED ===');
  console.log('To fix this issue, you need to install and run MongoDB:');
  console.log('');
  console.log('Option 1: Install MongoDB locally');
  console.log('1. Download MongoDB Community Server from: https://www.mongodb.com/try/download/community');
  console.log('2. Install it on your system');
  console.log('3. Start MongoDB service');
  console.log('');
  console.log('Option 2: Use MongoDB Atlas (Free cloud database)');
  console.log('1. Go to https://www.mongodb.com/atlas');
  console.log('2. Create a free account and cluster');
  console.log('3. Get your connection string');
  console.log('4. Create a .env file with: MONGODB_URI=your_connection_string');
  console.log('');
  console.log('Option 3: Use Docker (if you have Docker installed)');
  console.log('Run: docker run -d -p 27017:27017 --name mongodb mongo:latest');
  console.log('');
});

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});