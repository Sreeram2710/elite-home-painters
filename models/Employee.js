const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  id: String,
  number: Number,
  name: String,
  role: String,
  salary: Number,
  contact: String,
  doj: String,
  photo: String,
  status: { type: String, default: 'Active' }
});

module.exports = mongoose.model('Employee', employeeSchema);
