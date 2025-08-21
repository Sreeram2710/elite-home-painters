const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  address: String,
  paintType: String,
  area: Number,
  message: String,
  estimatedPrice: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Quote', quoteSchema);
