import mongoose from 'mongoose';

const qrCodeSchema = new mongoose.Schema({
  serialNumber: {
    type: String,
    required: true,
    unique: true
  },
  productId: {
    type: String,
    required: true
  },
  batchId: {
    type: String,
    required: true
  },
  assignedShopId: {
    type: String,
    default: null
  },
  isActivated: {
    type: Boolean,
    default: false
  },
  activationDate: {
    type: Date,
    default: null
  },
  customerName: {
    type: String,
    default: null
  },
  customerAddress: {
    type: String,
    default: null
  },
  customerPhone: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

export default mongoose.model('QRCode', qrCodeSchema);