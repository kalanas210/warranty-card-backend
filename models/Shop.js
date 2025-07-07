import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
  shopId: {
    type: String,
    required: true,
    unique: true
  },
  shopName: {
    type: String,
    required: true
  },
  ownerName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Shop', shopSchema);