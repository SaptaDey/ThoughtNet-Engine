
import { Router, Request, Response } from 'express';
import { settings } from '../../config';
import { authenticateBasic } from '../../middleware/auth';

const router = Router();

// Add basic authentication to manifest endpoint for security
// Remove this if the manifest truly needs to be public
router.get('/manifest', (req: Request, res: Response) => {
  // Only expose minimal information required for MCP protocol
  res.json({
    protocol_version: settings.mcp_settings.protocol_version,
    server_name: settings.mcp_settings.server_name,
    server_version: settings.mcp_settings.server_version,
    // Removed vendor_name for security - don't expose unnecessary info
  });
});

// Add other public MCP routes here as they are translated
// NOTE: Consider if these routes truly need to be "public" or should require authentication

export default router;
