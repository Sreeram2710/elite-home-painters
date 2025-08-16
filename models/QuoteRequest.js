const mongoose = require('mongoose');

const quoteRequestSchema = new mongoose.Schema({
  customer: String,
  email: String,
  service: String,
  preferredDate: String,
  image: String,
  submittedOn: String
});

module.exports = mongoose.model('QuoteRequest', quoteRequestSchema);
