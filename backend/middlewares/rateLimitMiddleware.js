const requestBuckets = new Map();
let requestsSinceCleanup = 0;

const createRateLimiter = ({ windowMs, max, message }) => {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 1000) {
      requestsSinceCleanup = 0;
      for (const [bucketKey, bucket] of requestBuckets) {
        if (now - bucket.startedAt >= windowMs) {
          requestBuckets.delete(bucketKey);
        }
      }
    }

    const current = requestBuckets.get(key);

    if (!current || now - current.startedAt >= windowMs) {
      requestBuckets.set(key, { startedAt: now, count: 1 });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      return res.status(429).json({ message });
    }

    return next();
  };
};

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.",
});

const resetRequestRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Zbyt wiele zgłoszeń resetu. Spróbuj ponownie za kilka minut.",
});

module.exports = { loginRateLimiter, resetRequestRateLimiter };
