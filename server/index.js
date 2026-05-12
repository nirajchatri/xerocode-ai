import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from '../api/index.js';
import { bootstrapControlDbTables } from '../api/controlDb/sqlserverConnections.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const app = express();
const port = process.env.API_PORT || 8787;

app.use(cors());
/** Default express.json() limit (~100kb) rejects multimodal chat payloads (base64 images). */
app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ extended: true, limit: '40mb' }));
app.use('/api', apiRouter);
app.use((err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('Unhandled API error:', err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ ok: false, message });
});

const startServer = async () => {
  try {
    await bootstrapControlDbTables();
    console.log('Control DB bootstrap complete (connection_profiles, user_profile).');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Control DB bootstrap failed: ${message}`);
  }

  app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`);
  });
};

void startServer();
