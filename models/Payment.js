import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
  ride: {
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
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "paid"],
    default: "pending"
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "transfer", "card"],
    default: "cash"
  },
  notes: {
    type: String,
    default: null
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