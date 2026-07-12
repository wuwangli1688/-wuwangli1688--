import express from "express";
import cors from "cors";
import apiRouter from "./routes/index.js";
import supabaseConfigRouter from "./routes/supabase-config.js";
import wechatRouter from "./routes/wechat.js";
import { getSupabaseClient } from "./storage/database/supabase-client.js";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
const allowedOrigins = [
  'http://localhost:5000',
  'https://wuwanli.online',
  'http://wuwanli.online',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // 开发阶段允许所有来源，上线后可收紧
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Version check endpoint (public, no auth)
// Compare against a stored version instead of relying on hardcoded app version
app.get('/api/v1/version/check', async (req, res) => {
  try {
    const { currentVersion } = req.query;
    const supabase = getSupabaseClient();
    const { data: versions, error } = await supabase
      .from('app_versions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !versions || versions.length === 0) {
      return res.json({ hasUpdate: false, latestVersion: '1.0.0', message: '暂无版本信息' });
    }

    const latest = versions[0];
    const current = (currentVersion as string) || '1.0.0';
    const hasUpdate = compareVersions(latest.version, current) > 0;

    res.json({
      hasUpdate,
      currentVersion: current,
      latestVersion: latest.version,
      forceUpdate: latest.force_update || false,
      releaseNotes: latest.release_notes || '',
      downloadUrl: latest.download_url || '',
    });
  } catch (err) {
    console.error('Version check error:', err);
    res.json({ hasUpdate: false, latestVersion: '1.0.0', message: '版本检查失败' });
  }
});

// Get current latest version (public, no auth)
app.get('/api/v1/version/current', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data: versions, error } = await supabase
      .from('app_versions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !versions || versions.length === 0) {
      return res.json({ version: '1.0.0', releaseNotes: '', downloadUrl: '' });
    }

    const latest = versions[0];
    res.json({
      version: latest.version,
      releaseNotes: latest.release_notes || '',
      downloadUrl: latest.download_url || '',
      forceUpdate: latest.force_update || false,
    });
  } catch (err) {
    console.error('Version current error:', err);
    res.json({ version: '1.0.0', releaseNotes: '', downloadUrl: '' });
  }
});

// Supabase config endpoint (for frontend to get URL and anon key)
app.use('/api/supabase-config', supabaseConfigRouter);

// WeChat mini program routes (public, no auth required for login/bind)
app.use('/api/v1/wechat', wechatRouter);

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
