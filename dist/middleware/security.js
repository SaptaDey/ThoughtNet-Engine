"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionValidator = exports.createSecurityMiddleware = void 0;
const createSecurityMiddleware = (config = {}) => {
    return (req, res, next) => {
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        // Remove server information
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
        // Session security
        if (config.maxSessionAge) {
            res.setHeader('Set-Cookie', `HttpOnly; Secure; SameSite=Strict; Max-Age=${config.maxSessionAge}`);
        }
        // Prevent caching of sensitive responses
        if (req.path.includes('/admin') || req.path.includes('/debug')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        }
        next();
    };
};
exports.createSecurityMiddleware = createSecurityMiddleware;
const createSessionValidator = () => {
    const activeSessions = new Map();
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const MAX_SESSIONS_PER_IP = 5;
    // Clean up expired sessions every 10 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of activeSessions.entries()) {
            if (now - session.lastActivity > SESSION_TIMEOUT) {
                activeSessions.delete(sessionId);
            }
        }
    }, 10 * 60 * 1000);
    return (req, res, next) => {
        const sessionId = req.get('Authorization') || 'anonymous';
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        const now = Date.now();
        // Check for session hijacking attempts
        if (activeSessions.has(sessionId)) {
            const existingSession = activeSessions.get(sessionId);
            // Validate IP consistency (allow for some flexibility with proxies)
            if (existingSession.ipAddress !== ipAddress &&
                !ipAddress.startsWith('10.') &&
                !ipAddress.startsWith('192.168.') &&
                !ipAddress.startsWith('172.')) {
                console.warn(`Potential session hijacking detected: Session ${sessionId.substring(0, 10)}... used from different IP`);
            }
            // Update last activity
            existingSession.lastActivity = now;
        }
        else {
            // Check rate limiting per IP
            const sessionsFromIP = Array.from(activeSessions.values())
                .filter(session => session.ipAddress === ipAddress).length;
            if (sessionsFromIP >= MAX_SESSIONS_PER_IP) {
                res.status(429).json({
                    success: false,
                    message: 'Too many active sessions from this IP address'
                });
                return;
            }
            // Create new session
            activeSessions.set(sessionId, {
                lastActivity: now,
                ipAddress,
                userAgent
            });
        }
        // Add session info to response headers (for monitoring)
        res.setHeader('X-Session-Timeout', Math.floor(SESSION_TIMEOUT / 1000));
        next();
    };
};
exports.createSessionValidator = createSessionValidator;
exports.default = exports.createSecurityMiddleware;
