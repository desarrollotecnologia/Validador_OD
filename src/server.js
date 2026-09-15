import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import odRoutes from './routes/od.routes.js';
import {
  loginConPin,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from './auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Validador OD' });
});

app.post('/api/auth/login', (req, res) => {
  const token = loginConPin(req.body?.pin);
  if (!token) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});

app.post('/api/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/check', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/od', requireAuth, odRoutes);

app.use(
  express.static(path.join(__dirname, '..', 'frontend'), {
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  })
);

function ipsLan() {
  const out = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

const PORT = Number(process.env.PORT || 3050);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Validador OD → http://localhost:${PORT}`);
  for (const ip of ipsLan()) {
    console.log(`Red local    → http://${ip}:${PORT}`);
  }
});
