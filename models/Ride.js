import mongoose from "mongoose";

const RideSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  pickup: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
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
    default: 0,
    required: true
  },
  commissionRate: {
    type: Number,
    default: 0.10,
    required: true
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid"],
    default: "created",
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    default: null
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
  history: [{
    status: {
      type: String,
      required: true
    },
    by: {
      type: String,
      required: true
    },
    at: {
      type: Date,
      default: Date.now
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
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