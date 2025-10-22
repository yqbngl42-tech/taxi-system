import mongoose from "mongoose";

const AdminContactSchema = new mongoose.Schema({
  adminName: {
    type: String,
    required: true,
    trim: true
  },
  adminPhone: {
    type: String,
    required: true,
    trim: true
  },
  adminEmail: {
    type: String,
    default: null
  },
  appealMessage: {
    type: String,
    default: "⚠️ עברתי על התקנות - בקשה להסרת חסימה"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("AdminContact", AdminContactSchema);