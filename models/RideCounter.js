import mongoose from "mongoose";

const RideCounterSchema = new mongoose.Schema({
  counterName: {
    type: String,
    default: "rides",
    unique: true
  },
  sequenceValue: {
    type: Number,
    default: 1000
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("RideCounter", RideCounterSchema);
