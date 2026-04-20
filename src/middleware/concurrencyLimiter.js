/**
 * Concurrency Limiter Middleware
 * 
 * When the server is handling too many simultaneous requests,
 * new requests receive a structured 503 response so the frontend
 * can show a "Server at Capacity" waiting screen and retry automatically.
 */

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '50', 10);

let activeRequests = 0;
let queuedRequests = 0;

// Expose server status globally for the /status endpoint
const getServerStatus = () => ({
  active: activeRequests,
  queued: queuedRequests,
  max: MAX_CONCURRENT,
  isAtCapacity: activeRequests >= MAX_CONCURRENT,
  loadPercent: Math.round((activeRequests / MAX_CONCURRENT) * 100),
});

/**
 * Middleware: tracks concurrent requests and rejects when over limit.
 * Skip static assets, health check, and status endpoints.
 */
const concurrencyLimiter = (req, res, next) => {
  // Always allow health/status checks through
  const skipPaths = ['/health', '/api/v1/status', '/uploads'];
  if (skipPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  if (activeRequests >= MAX_CONCURRENT) {
    queuedRequests++;

    // How long before client should retry (ms)
    const retryAfterMs = 3000;

    res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    return res.status(503).json({
      success: false,
      serverBusy: true,
      message: 'Server is at full capacity. Please wait a moment.',
      status: getServerStatus(),
      retryAfterMs,
    });
  }

  activeRequests++;

  // Decrement counter when response finishes
  res.on('finish', () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });
  res.on('close', () => {
    // Client disconnected early
    activeRequests = Math.max(0, activeRequests - 1);
  });

  next();
};

module.exports = { concurrencyLimiter, getServerStatus };
