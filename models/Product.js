import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true
  },
  productName: {
    type: String,
    required: true
  },
  manufacturer: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  warrantyDuration: {
    type: Number,
    required: true,
    default: 365 // days
  }
}, {
  timestamps: true
});

export default mongoose.model('Product', productSchema);