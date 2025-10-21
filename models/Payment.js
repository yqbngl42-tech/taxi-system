import mongoose from "mongoose";

// 💰 מבנה תשלום בDatabase
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
    default: "bit"
  },
  paidAt: {
    type: Date,
    default: Date.now
  },
  txMeta: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export default mongoose.model("Payment", PaymentSchema);