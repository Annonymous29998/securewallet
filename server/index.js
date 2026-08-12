import net from "net";
import app from "./app.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PORT = process.env.PORT || 3000;

const start = async () => {
  const isProd = process.env.NODE_ENV === 'production';
  
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    // For local dev, we can skip exit if we want, but better to be strict
    // process.exit(1); 
  }

  const chosen = await findAvailablePort(PORT);
  PORT = chosen;

  // Vite middleware for local development
  if (!isProd && process.env.API_ONLY !== 'true') {
    const vite = await import('vite');
    const hmrPort = await findAvailablePort(24678);
    const viteServer = await vite.createServer({
      server: { middlewareMode: true, hmr: { port: hmrPort, clientPort: hmrPort } },
      appType: 'custom'
    });
    app.use(viteServer.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      try {
        const url = req.originalUrl;
        const htmlPath = path.resolve(__dirname, '../index.html');
        let template = fs.readFileSync(htmlPath, 'utf-8');
        template = await viteServer.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else if (isProd || process.env.API_ONLY !== 'true') {
     // Serve static files in production or if not API_ONLY
     // (Though Vercel handles this via vercel.json usually)
     const dist = path.resolve(__dirname, '../dist');
     if (fs.existsSync(dist)) {
        const express = await import('express');
        app.use(express.default.static(dist));
        app.use('*', (req, res, next) => {
          if (req.originalUrl.startsWith('/api')) return next();
          res.sendFile(path.join(dist, 'index.html'));
        });
     }
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();

async function findAvailablePort(startPort) {
  const tryPort = (p) => new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      resolve(false);
    });
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(p, '0.0.0.0');
  });
  for (let p = Number(startPort); p < Number(startPort) + 20; p++) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await tryPort(p);
    if (ok) return p;
  }
  return startPort;
}
