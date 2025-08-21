const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: String,
  role: String,
  salary: Number,
  contact: String,
  doj: Date,
  photo: String,
  status: { type: String, default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
