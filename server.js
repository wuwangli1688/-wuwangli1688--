#!/usr/bin/env node

/**
 * Production entry point for the server.
 * Used by the FaaS deployment system (entrypoint = "server.js").
 * 
 * Starts the Express server on the configured port.
 * The health endpoint is served by the Express app itself.
 */

// Load the built server bundle
import('./server/dist/index.js').catch(err => {
  console.error('[server.js] Failed to start server:', err);
  process.exit(1);
});