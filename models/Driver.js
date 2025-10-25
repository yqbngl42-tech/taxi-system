// ===============================================
// 👨‍✈️ DRIVER MODEL - UPDATED WITH RATINGS
// ===============================================

import mongoose from "mongoose";

const DriverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true  // Index for fast phone queries
  },
  licenseNumber: {
    type: String,
    default: null,
    trim: true
  },
  vehicleNumber: {
    type: String,
    default: null,
    trim: true
  },
  vehicleType: {
    type: String,
    default: "sedan"
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true  // Index for active driver queries
  },
  isBlocked: {
    type: Boolean,
    default: false,
    index: true  // Index for blocked status
  },
  blockedReason: {
    type: String,
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  // ⭐ RATING SYSTEM
  rating: {
    average: { 
      type: Number, 
      default: 5.0, 
      min: 1, 
      max: 5,
      index: -1  // Index for sorting by rating (descending)
    },
    count: { 
      type: Number, 
      default: 0 
    },
    breakdown: {
      five: { type: Number, default: 0 },
      four: { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      two: { type: Number, default: 0 },
      one: { type: Number, default: 0 }
    }
  },
  reviews: [{
    rideId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Ride' 
    },
    customerName: String,
    rating: { 
      type: Number, 
      min: 1, 
      max: 5 
    },
    comment: String,
    timestamp: { 
      type: Date, 
      default: Date.now 
    }
  }],
  // 💰 EARNINGS
  earnings: {
    total: { 
      type: Number, 
      default: 0 
    },
    thisMonth: { 
      type: Number, 
      default: 0 
    },
    lastMonth: { 
      type: Number, 
      default: 0 
    },
    unpaid: { 
      type: Number, 
      default: 0 
    }
  },
  // 📊 STATISTICS
  stats: {
    totalRides: { 
      type: Number, 
      default: 0 
    },
    completedRides: { 
      type: Number, 
      default: 0 
    },
    cancelledRides: { 
      type: Number, 
      default: 0 
    },
    acceptanceRate: { 
      type: Number, 
      default: 0 
    }
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
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

// ===============================================
// 📊 INDEXES FOR PERFORMANCE
// ===============================================

// Compound index for active status + blocked
DriverSchema.index({ isActive: 1, isBlocked: 1 });

// Index for rating (for sorting top drivers)
DriverSchema.index({ 'rating.average': -1 });

// Index for last active (for finding active drivers)
DriverSchema.index({ lastActive: -1 });

// Text index for searching by name
DriverSchema.index({ name: 'text' });

// ===============================================
// 🔧 MIDDLEWARE
// ===============================================

// Update 'updatedAt' on save
DriverSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Update 'updatedAt' on findOneAndUpdate
DriverSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// ===============================================
// 📈 STATIC METHODS
// ===============================================

/**
 * Get active drivers
 */
DriverSchema.statics.getActiveDrivers = function() {
  return this.find({ 
    isActive: true, 
    isBlocked: false 
  }).sort({ name: 1 });
};

/**
 * Get top rated drivers
 */
DriverSchema.statics.getTopRated = function(limit = 10) {
  return this.find({ 
    isActive: true, 
    isBlocked: false,
    'rating.count': { $gte: 3 }  // At least 3 reviews
  })
  .sort({ 'rating.average': -1 })
  .limit(limit)
  .select('name phone rating stats');
};

/**
 * Search drivers by name
 */
DriverSchema.statics.searchByName = function(query) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } });
};

// ===============================================
// 💡 INSTANCE METHODS
// ===============================================

/**
 * Add a review
 */
DriverSchema.methods.addReview = function(rideId, customerName, rating, comment) {
  // Add review
  this.reviews.push({
    rideId,
    customerName,
    rating,
    comment: comment || '',
    timestamp: new Date()
  });
  
  // Update breakdown
  const ratingKey = {
    5: 'five',
    4: 'four',
    3: 'three',
    2: 'two',
    1: 'one'
  }[rating];
  this.rating.breakdown[ratingKey]++;
  
  // Recalculate average
  this.rating.count = this.reviews.length;
  const sum = this.reviews.reduce((acc, r) => acc + r.rating, 0);
  this.rating.average = parseFloat((sum / this.rating.count).toFixed(2));
  
  return this.save();
};

/**
 * Block driver
 */
DriverSchema.methods.block = function(reason) {
  this.isBlocked = true;
  this.blockedReason = reason;
  this.blockedAt = new Date();
  return this.save();
};

/**
 * Unblock driver
 */
DriverSchema.methods.unblock = function() {
  this.isBlocked = false;
  this.blockedReason = null;
  this.blockedAt = null;
  return this.save();
};

/**
 * Update earnings
 */
DriverSchema.methods.addEarnings = function(amount) {
  this.earnings.total += amount;
  this.earnings.thisMonth += amount;
  this.earnings.unpaid += amount;
  return this.save();
};

/**
 * Mark earnings as paid
 */
DriverSchema.methods.markPaid = function(amount) {
  this.earnings.unpaid = Math.max(0, this.earnings.unpaid - amount);
  return this.save();
};

/**
 * Increment ride stats
 */
DriverSchema.methods.incrementRides = function(status) {
  this.stats.totalRides++;
  if (status === 'completed') {
    this.stats.completedRides++;
  } else if (status === 'cancelled') {
    this.stats.cancelledRides++;
  }
  
  // Calculate acceptance rate
  if (this.stats.totalRides > 0) {
    this.stats.acceptanceRate = parseFloat(
      ((this.stats.completedRides / this.stats.totalRides) * 100).toFixed(2)
    );
  }
  
  return this.save();
};

/**
 * Update last active
 */
DriverSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

/**
 * Get driver summary
 */
DriverSchema.methods.getSummary = function() {
  return {
    name: this.name,
    phone: this.phone,
    rating: {
      average: this.rating.average,
      count: this.rating.count
    },
    stats: this.stats,
    earnings: {
      total: this.earnings.total,
      unpaid: this.earnings.unpaid
    },
    isActive: this.isActive,
    isBlocked: this.isBlocked
  };
};

console.log('✅ Driver model loaded with indexes and ratings');

export default mongoose.model("Driver", DriverSchema);
