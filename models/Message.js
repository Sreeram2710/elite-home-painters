const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, index: true },   // e.g., cust_<id>__admin
  fromRole: { type: String, enum: ["customer", "admin"], required: true },
  fromId: { type: mongoose.Schema.Types.ObjectId, required: true },
  toId: { type: mongoose.Schema.Types.ObjectId, required: true },
  body: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);
