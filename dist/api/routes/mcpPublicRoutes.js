"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = require("../../config");
const router = (0, express_1.Router)();
// Add basic authentication to manifest endpoint for security
// Remove this if the manifest truly needs to be public
router.get('/manifest', (req, res) => {
    // Only expose minimal information required for MCP protocol
    res.json({
        protocol_version: config_1.settings.mcp_settings.protocol_version,
        server_name: config_1.settings.mcp_settings.server_name,
        server_version: config_1.settings.mcp_settings.server_version,
        // Removed vendor_name for security - don't expose unnecessary info
    });
});
// Add other public MCP routes here as they are translated
// NOTE: Consider if these routes truly need to be "public" or should require authentication
exports.default = router;
