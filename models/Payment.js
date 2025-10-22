import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ride",
    required: true
  },
  driverPhone: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  method: {
    type: String,
    enum: ["bit", "paybox", "cash"],
    default: "bit",
    required: true
  },
  paidAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  txMeta: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "completed"
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

export default mongoose.model("Payment", PaymentSchema);