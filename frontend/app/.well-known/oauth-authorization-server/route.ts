import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";

/**
 * OAuth Authorization Server Metadata endpoint.
 * Required for MCP clients to discover where to authenticate.
 * See: https://datatracker.ietf.org/doc/html/rfc8414
 */
const handler = authServerMetadataHandlerClerk();
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };

