import RideCounter from "../models/RideCounter.js";

const rideNumberGenerator = {
  getNextRideNumber: async () => {
    try {
      const counter = await RideCounter.findOneAndUpdate(
        { counterName: "rides" },
        { $inc: { sequenceValue: 1 }, updatedAt: new Date() },
        { new: true, upsert: true }
      );

      return counter.sequenceValue;
    } catch (err) {
      console.error("שגיאה בקבלת מספר סידורי:", err);
      throw err;
    }
  },

  formatRideNumber: async () => {
    const num = await rideNumberGenerator.getNextRideNumber();
    return `#${num}`;
  }
};

export default rideNumberGenerator;