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
    if (username.length < 3 || password.length < 8) {
        throw createAuthError('Authentication credentials do not meet security requirements', 500);
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
