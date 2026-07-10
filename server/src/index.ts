import express from "express";
import cors from "cors";
import apiRouter from "./routes/index.js";
import supabaseConfigRouter from "./routes/supabase-config.js";
import { getSupabaseClient } from "./storage/database/supabase-client.js";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Version check endpoint (public, no auth)
app.get('/api/v1/version/check', async (req, res) => {
  try {
    const { currentVersion } = req.query;
    const supabase = getSupabaseClient();
    const { data: latest, error } = await supabase
      .from('app_versions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !latest) {
      return res.json({ hasUpdate: false, currentVersion: currentVersion || '1.0.0' });
    }

    const current = (currentVersion as string) || '1.0.0';
    const hasUpdate = compareVersions(latest.version, current) > 0;

    res.json({
      hasUpdate,
      currentVersion: current,
      latestVersion: latest.version,
      forceUpdate: latest.force_update,
      releaseNotes: latest.release_notes,
      downloadUrl: latest.download_url,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check version' });
  }
});

// Supabase config endpoint (for frontend to get URL and anon key)
app.use('/api/supabase-config', supabaseConfigRouter);

// API routes
app.use('/api/v1', apiRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});

// Compare semver strings: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
