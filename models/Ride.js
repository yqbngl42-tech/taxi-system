import mongoose from "mongoose";

const RideSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  pickup: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  scheduledTime: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  commissionRate: {
    type: Number,
    default: 0.10,
    min: 0,
    max: 1
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"],
    default: "created"
  },
  driverPhone: {
    type: String,
    default: null
  },
  rideType: {
    type: String,
    enum: ["regular", "vip", "delivery"],
    default: "regular"
  },
  specialNotes: {
    type: [String],
    default: []
  },
  groupChat: {
    type: String,
    default: "default"
  },
  createdBy: {
    type: String,
    default: "admin"
  },
  history: [{
    status: String,
    by: String,
    timestamp: { type: Date, default: Date.now },
    details: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Ride", RideSchema);