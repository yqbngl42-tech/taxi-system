// ===============================================
// 📱 WHATSAPP GROUP MODEL - UPDATED WITH INDEXES
// ===============================================

import mongoose from "mongoose";

const WhatsAppGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true  // Index for fast name queries
  },
  phoneNumbers: {
    type: [String],
    required: true,
    default: []
  },
  isDefault: {
    type: Boolean,
    default: false,
    index: true  // Index for finding default group
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true  // Index for active group queries
  },
  description: {
    type: String,
    default: null
  },
  createdBy: {
    type: String,
    default: "admin"
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

// Compound index for default + active queries
WhatsAppGroupSchema.index({ isDefault: 1, isActive: 1 });

// Index for name searches
WhatsAppGroupSchema.index({ name: 'text' });

// ===============================================
// 🔧 MIDDLEWARE
// ===============================================

// Update 'updatedAt' on save
WhatsAppGroupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Ensure only one default group
WhatsAppGroupSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Unset other defaults
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { isDefault: false }
    );
  }
  next();
});

// ===============================================
// 📈 STATIC METHODS
// ===============================================

/**
 * Get default group
 */
WhatsAppGroupSchema.statics.getDefault = function() {
  return this.findOne({ isDefault: true, isActive: true });
};

/**
 * Get active groups
 */
WhatsAppGroupSchema.statics.getActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

/**
 * Set as default
 */
WhatsAppGroupSchema.statics.setAsDefault = async function(groupId) {
  // Unset all defaults
  await this.updateMany({}, { isDefault: false });
  
  // Set new default
  return await this.findByIdAndUpdate(
    groupId,
    { isDefault: true, isActive: true },
    { new: true }
  );
};

// ===============================================
// 💡 INSTANCE METHODS
// ===============================================

/**
 * Add phone numbers
 */
WhatsAppGroupSchema.methods.addPhones = function(phones) {
  const uniquePhones = [...new Set([...this.phoneNumbers, ...phones])];
  this.phoneNumbers = uniquePhones;
  return this.save();
};

/**
 * Remove phone numbers
 */
WhatsAppGroupSchema.methods.removePhones = function(phones) {
  this.phoneNumbers = this.phoneNumbers.filter(p => !phones.includes(p));
  return this.save();
};

/**
 * Get member count
 */
WhatsAppGroupSchema.methods.getMemberCount = function() {
  return this.phoneNumbers.length;
};

/**
 * Validate all phone numbers
 */
WhatsAppGroupSchema.methods.validatePhones = function() {
  const phoneRegex = /^(0|\+972)?5\d{8}$/;
  return this.phoneNumbers.filter(phone => 
    phoneRegex.test(phone.replace(/[\s\-]/g, ''))
  );
};

/**
 * Get invalid phone numbers
 */
WhatsAppGroupSchema.methods.getInvalidPhones = function() {
  const phoneRegex = /^(0|\+972)?5\d{8}$/;
  return this.phoneNumbers.filter(phone => 
    !phoneRegex.test(phone.replace(/[\s\-]/g, ''))
  );
};

console.log('✅ WhatsAppGroup model loaded with indexes');

export default mongoose.model("WhatsAppGroup", WhatsAppGroupSchema);
