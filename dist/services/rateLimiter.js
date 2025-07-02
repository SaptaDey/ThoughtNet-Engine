"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStrictRateLimit = exports.createApiRateLimit = exports.createAuthRateLimit = exports.createRateLimitMiddleware = exports.RateLimiter = void 0;
class RateLimiter {
    constructor(config) {
        this.config = config;
        this._log = new Map();
        // Clean up old entries every 5 minutes
        this._cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }
    cleanup() {
        const now = Date.now() / 1000;
        for (const [key, timestamps] of this._log.entries()) {
            const filtered = timestamps.filter(timestamp => now - timestamp < this.config.perSeconds);
            if (filtered.length === 0) {
                this._log.delete(key);
            }
            else {
                this._log.set(key, filtered);
            }
        }
    }
    isAllowed(key) {
        const now = Date.now() / 1000;
        let timestamps = this._log.get(key) || [];
        // Filter out old timestamps
        timestamps = timestamps.filter(timestamp => now - timestamp < this.config.perSeconds);
        const remaining = Math.max(0, this.config.maxRequests - timestamps.length);
        const resetTime = timestamps.length > 0 ?
            Math.ceil(timestamps[0] + this.config.perSeconds) :
            Math.ceil(now + this.config.perSeconds);
        if (timestamps.length >= this.config.maxRequests) {
            return { allowed: false, remaining: 0, resetTime };
        }
        timestamps.push(now);
        this._log.set(key, timestamps);
        return {
            allowed: true,
            remaining: this.config.maxRequests - timestamps.length,
            resetTime
        };
    }
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
    }
}
exports.RateLimiter = RateLimiter;
const createRateLimitMiddleware = (config) => {
    const limiter = new RateLimiter(config);
    return (req, res, next) => {
        // Create a composite key using IP and User-Agent for better rate limiting
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        const clientId = `${ip}:${userAgent.substring(0, 50)}`;
        const result = limiter.isAllowed(clientId);
        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.resetTime.toString(),
        });
        if (!result.allowed) {
            res.status(429).json({
                success: false,
                message: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil(result.resetTime - Date.now() / 1000)
            });
            return;
        }
        next();
    };
};
exports.createRateLimitMiddleware = createRateLimitMiddleware;
// Pre-configured rate limiters for different endpoint types
const createAuthRateLimit = () => (0, exports.createRateLimitMiddleware)({
    maxRequests: 5,
    perSeconds: 900, // 15 minutes
});
exports.createAuthRateLimit = createAuthRateLimit;
const createApiRateLimit = () => (0, exports.createRateLimitMiddleware)({
    maxRequests: 100,
    perSeconds: 3600, // 1 hour
});
exports.createApiRateLimit = createApiRateLimit;
const createStrictRateLimit = () => (0, exports.createRateLimitMiddleware)({
    maxRequests: 10,
    perSeconds: 60, // 1 minute
});
exports.createStrictRateLimit = createStrictRateLimit;
