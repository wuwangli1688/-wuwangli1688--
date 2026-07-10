import express from "express";
import cors from "cors";
import apiRouter from "./routes/index.js";
import supabaseConfigRouter from "./routes/supabase-config.js";

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

// Supabase config endpoint (for frontend to get URL and anon key)
app.use('/api/supabase-config', supabaseConfigRouter);

// API routes
app.use('/api/v1', apiRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
