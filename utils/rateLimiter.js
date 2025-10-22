export default {
  /**
   * בדוק אם ה-IP חרג מהגבול
   */
  rateLimitStore: new Map(),

  /**
   * בדוק האם צריך לחסום בקשה
   */
  checkRateLimit(identifier, maxRequests = 30, windowMs = 60000) {
    const now = Date.now();
    const key = identifier;

    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, []);
    }

    let requests = this.rateLimitStore.get(key);

    // הסר בקשות ישנות
    requests = requests.filter(time => now - time < windowMs);
    this.rateLimitStore.set(key, requests);

    if (requests.length >= maxRequests) {
      return false; // חסום את הבקשה
    }

    requests.push(now);
    return true; // אפשר את הבקשה
  },

  /**
   * Middleware ל-Express
   */
  middleware(maxRequests = 30, windowMs = 60000) {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      const endpoint = req.path;
      const identifier = `${ip}-${endpoint}`;

      if (!this.checkRateLimit(identifier, maxRequests, windowMs)) {
        return res.status(429).json({
          ok: false,
          error: "יותר מדי בקשות - נסה שוב בעוד דקה"
        });
      }

      next();
    };
  }
};