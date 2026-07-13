#!/usr/bin/env node

/**
 * Entry point for the server.
 * This file is referenced by .coze's entrypoint = "server.js"
 * It redirects to the actual server code in server/dist/index.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Set the PORT environment variable to 5000 for deployment
process.env.PORT = process.env.PORT || '5000';

// Dynamic import of the server bundle
const serverPath = new URL('./server/dist/index.js', import.meta.url).pathname;
import(serverPath).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});