// models/Quote.js
const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema(
  {
    // Customer info
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },

    // Job info
    paintType: { type: String, trim: true, default: '' },

    // Measurements & extras (square meters + counts)
    area: { type: Number, default: 0, min: 0 },     // stored in m²
    windows: { type: Number, default: 0, min: 0 },
    doors: { type: Number, default: 0, min: 0 },
    frames: { type: Number, default: 0, min: 0 },
    features: { type: Number, default: 0, min: 0 },

    // Customer message
    message: { type: String, trim: true, default: '' },

    // Pricing (NZD)
    estimatedPrice: { type: Number, default: 0, min: 0 },

    // Meta
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'quotes' }
);

module.exports = mongoose.model('Quote', quoteSchema);
