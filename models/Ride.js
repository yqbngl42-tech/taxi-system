// ===============================================
// 🚖 RIDE MODEL - UPDATED WITH INDEXES
// ===============================================

import mongoose from "mongoose";

const RideSchema = new mongoose.Schema({
  rideNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
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
    default: "created",
    index: true  // Index for fast status queries
  },
  driverPhone: {
    type: String,
    default: null,
    index: true  // Index for driver queries
  },
  driverRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  driverReview: {
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
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "refunded"],
    default: "pending"
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "card", "bank_transfer", "other"],
    default: "cash"
  },
  paymentDate: {
    type: Date,
    default: null
  },
  history: [{
    status: String,
    by: String,
    timestamp: { type: Date, default: Date.now },
    details: String
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true  // Index for time-based queries
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ===============================================
// 📊 INDEXES FOR PERFORMANCE
// ===============================================

// Compound index for status + date queries (most common)
RideSchema.index({ status: 1, createdAt: -1 });

// Compound index for driver queries
RideSchema.index({ driverPhone: 1, status: 1 });

// Index for customer phone (for history)
RideSchema.index({ customerPhone: 1 });

// Index for ride number (unique anyway but explicit)
RideSchema.index({ rideNumber: 1 });

// Index for payment status
RideSchema.index({ paymentStatus: 1 });

// ===============================================
// 🔧 MIDDLEWARE
// ===============================================

// Update 'updatedAt' on save
RideSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Update 'updatedAt' on findOneAndUpdate
RideSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// ===============================================
// 📈 STATIC METHODS
// ===============================================

/**
 * Get ride statistics for a period
 */
RideSchema.statics.getStatistics = async function(startDate, endDate = new Date()) {
  return await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$price' },
        totalCommission: { $sum: '$commissionAmount' }
      }
    }
  ]);
};

/**
 * Get rides by driver with stats
 */
RideSchema.statics.getDriverStats = async function(driverPhone, startDate, endDate = new Date()) {
  return await this.aggregate([
    {
      $match: {
        driverPhone,
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$price' }
      }
    }
  ]);
};

// ===============================================
// 💡 INSTANCE METHODS
// ===============================================

/**
 * Add history entry
 */
RideSchema.methods.addHistory = function(status, by, details) {
  this.history.push({
    status,
    by,
    details,
    timestamp: new Date()
  });
  return this.save();
};

/**
 * Check if ride can be cancelled
 */
RideSchema.methods.canBeCancelled = function() {
  const cancelableStatuses = ['created', 'sent', 'approved'];
  return cancelableStatuses.includes(this.status);
};

/**
 * Check if ride is completed
 */
RideSchema.methods.isCompleted = function() {
  return ['finished', 'commission_paid'].includes(this.status);
};

console.log('✅ Ride model loaded with indexes');

export default mongoose.model("Ride", RideSchema);
