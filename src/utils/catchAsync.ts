// Deprecated: Use catchAsync from middleware/errorHandler instead
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { catchAsync as newCatchAsync } from '../middleware/errorHandler';

// Re-export the new catchAsync for backward compatibility
const catchAsync = newCatchAsync;

export default catchAsync;