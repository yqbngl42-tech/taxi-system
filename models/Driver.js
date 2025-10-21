import mongoose from "mongoose";

// 👥 מבנה נהג בDatabase
const DriverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    unique: true,
    required: true
  },
  groups: {
    type: [String],
    default: []
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

export default mongoose.model("Driver", DriverSchema);