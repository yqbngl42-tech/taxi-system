import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    message: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 500
    },
    type: {
      type: String,
      enum: ['customer', 'ride', 'payment', 'system'],
      required: true,
      index: true
    },
    emoji: {
      type: String,
      default: '📝',
      maxlength: 10
    },
    details: {
      type: String,
      maxlength: 500,
      default: null
    },
    user: {
      type: String,
      default: 'system',
      maxlength: 100
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: false,
    collection: 'activities'
  }
);

// Index לביצועים טובים
activitySchema.index({ timestamp: -1 });
activitySchema.index({ type: 1 });
activitySchema.index({ user: 1 });

export default mongoose.model('Activity', activitySchema);