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
    const sessionMutex = new Map(); // Simple mutex to prevent race conditions
    // Clean up expired sessions every 10 minutes
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of activeSessions.entries()) {
            if (now - session.lastActivity > SESSION_TIMEOUT) {
                activeSessions.delete(sessionId);
                sessionMutex.delete(sessionId);
            }
        }
    }, 10 * 60 * 1000);
    // Cleanup on process exit
    process.on('SIGTERM', () => clearInterval(cleanup));
    process.on('SIGINT', () => clearInterval(cleanup));
    return (req, res, next) => {
        var _a;
        const sessionId = req.headers['x-session-id'];
        const ipAddress = ((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.split(',')[0]) || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const now = Date.now();
        // Validate session format
        if (sessionId && !/^[a-zA-Z0-9-_]{16,128}$/.test(sessionId)) {
            res.status(400).json({
                success: false,
                message: 'Invalid session ID format'
            });
            return;
        }
        if (sessionId) {
            // Check for race condition
            if (sessionMutex.get(sessionId)) {
                res.status(429).json({
                    success: false,
                    message: 'Session update in progress, please retry'
                });
                return;
            }
            const session = activeSessions.get(sessionId);
            if (session) {
                // Validate session integrity
                if (session.ipAddress !== ipAddress || session.userAgent !== userAgent) {
                    activeSessions.delete(sessionId);
                    sessionMutex.delete(sessionId);
                    res.status(401).json({
                        success: false,
                        message: 'Session validation failed'
                    });
                    return;
                }
                // Check timeout
                if (now - session.lastActivity > SESSION_TIMEOUT) {
                    activeSessions.delete(sessionId);
                    sessionMutex.delete(sessionId);
                    res.status(401).json({
                        success: false,
                        message: 'Session expired'
                    });
                    return;
                }
                // Update session activity with mutex protection
                sessionMutex.set(sessionId, true);
                session.lastActivity = now;
                sessionMutex.delete(sessionId);
            }
            else {
                // New session - check IP limits
                const sessionsForIP = Array.from(activeSessions.values())
                    .filter(s => s.ipAddress === ipAddress).length;
                if (sessionsForIP >= MAX_SESSIONS_PER_IP) {
                    res.status(429).json({
                        success: false,
                        message: 'Too many active sessions for this IP'
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
        }
        // Add session info to request
        req.sessionInfo = {
            sessionId,
            isNewSession: sessionId ? !activeSessions.has(sessionId) : true,
            ipAddress,
            userAgent
        };
        next();
    };
};
exports.createSessionValidator = createSessionValidator;
