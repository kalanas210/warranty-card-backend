import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

dotenv.config(); // Load environment variables early

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB URI
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/warranty-system';

// Connect and start server
const startServer = async () => {
  try {
    mongoose.set('bufferCommands', false); // Prevent command buffering
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB');

    // Routes
    app.use('/api/admin', adminRoutes);
    app.use('/api/public', publicRoutes);

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('\n=== MongoDB Setup Help ===');
    console.log('Option 1: Install MongoDB locally');
    console.log('Option 2: Use MongoDB Atlas');
    console.log('Option 3: Use Docker to run MongoDB\n');
    console.log('Visit: https://www.mongodb.com/try/download/community\n');
  }
};

startServer();
