"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateBasic = void 0;
const crypto_1 = __importDefault(require("crypto"));
const createAuthError = (message, statusCode = 401) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};
const secureCompare = (a, b) => {
    if (a.length !== b.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};
const validateCredentials = () => {
    const username = process.env.BASIC_AUTH_USER;
    const password = process.env.BASIC_AUTH_PASS;
    if (!username || !password) {
        throw createAuthError('Authentication credentials not properly configured', 500);
    }
    // Enhanced password validation
    if (username.length < 3) {
        throw createAuthError('Username must be at least 3 characters long', 500);
    }
    if (password.length < 12) {
        throw createAuthError('Password must be at least 12 characters long', 500);
    }
    // Check for password complexity requirements
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        throw createAuthError('Password must contain uppercase, lowercase, numbers, and special characters', 500);
    }
    // Check for common weak passwords
    const weakPasswords = [
        'password123!', 'Password123!', 'admin123!', 'test123!',
        '123456789!', 'qwerty123!', 'letmein123!'
    ];
    if (weakPasswords.includes(password)) {
        throw createAuthError('Password is too common, please use a stronger password', 500);
    }
    return { username, password };
};
const authenticateBasic = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const [type, credentials] = authHeader.split(' ');
        if (type !== 'Basic' || !credentials) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
            res.status(401).json({
                success: false,
                message: 'Invalid authentication format'
            });
            return;
        }
        let decodedCredentials;
        try {
            decodedCredentials = Buffer.from(credentials, 'base64').toString('utf8');
        }
        catch (error) {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials encoding'
            });
            return;
        }
        if (decodedCredentials === undefined) {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials encoding'
            });
            return;
        }
        const colonIndex = decodedCredentials.indexOf(':');
        if (colonIndex === -1) {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials format'
            });
            return;
        }
        const username = decodedCredentials.substring(0, colonIndex);
        const password = decodedCredentials.substring(colonIndex + 1);
        if (!username || !password) {
            res.status(401).json({
                success: false,
                message: 'Username and password are required'
            });
            return;
        }
        const { username: expectedUsername, password: expectedPassword } = validateCredentials();
        const usernameMatch = secureCompare(username, expectedUsername);
        const passwordMatch = secureCompare(password, expectedPassword);
        if (usernameMatch && passwordMatch) {
            next();
            return;
        }
        else {
            res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
    }
    catch (error) {
        console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            success: false,
            message: 'Authentication service unavailable'
        });
        return;
    }
};
exports.authenticateBasic = authenticateBasic;
