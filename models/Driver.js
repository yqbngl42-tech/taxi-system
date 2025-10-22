import mongoose from "mongoose";

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
  },
  rating: {
    type: Number,
    default: 5,
    min: 0,
    max: 5
  },
  averageResponseTime: {
    type: Number,
    default: 0
  },
  acceptanceRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedReason: {
    type: String,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  totalRides: {
    type: Number,
    default: 0
  },
  completedRides: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
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

export default mongoose.model("Driver", DriverSchema);