import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

/**
 * OAuth Protected Resource Metadata endpoint for MCP.
 * Lets MCP clients discover what OAuth scopes this resource supports.
 * See: https://datatracker.ietf.org/doc/html/rfc9728#section-4.1
 */
const handler = protectedResourceHandlerClerk({
  // Specify which OAuth scopes this protected resource supports
  scopes_supported: ["profile", "email"],
});
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };

