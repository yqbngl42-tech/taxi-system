import mongoose from "mongoose";

// 🚖 מבנה נסיעה בDatabase
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
  scheduledTime: String,
  notes: String,
  price: {
    type: Number,
    default: 0
  },
  commissionRate: {
    type: Number,
    default: 0.10
  },
  commissionAmount: Number,
  
  // ⭐ סטטוס הנסיעה
  status: {
    type: String,
    enum: ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid"],
    default: "created"
  },
  
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    default: null
  },
  driverPhone: String,
  
  // 📝 היסטוריה מלאה של מה שקרה
  history: [{
    status: String,
    by: String,
    at: {
      type: Date,
      default: Date.now
    },
    meta: mongoose.Schema.Types.Mixed
  }]
}, { timestamps: true });

export default mongoose.model("Ride", RideSchema);