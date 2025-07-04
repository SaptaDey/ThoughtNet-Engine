"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler_1 = require("../middleware/errorHandler");
// Re-export the new catchAsync for backward compatibility
const catchAsync = errorHandler_1.catchAsync;
exports.default = catchAsync;
