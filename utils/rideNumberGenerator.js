import RideCounter from "../models/RideCounter.js";

export default {
  /**
   * קבל את המספר הסידורי הבא
   */
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

  /**
   * פורמט המספר הסידורי
   */
  formatRideNumber: async () => {
    const num = await this.getNextRideNumber();
    return `#${num}`;
  }
};
