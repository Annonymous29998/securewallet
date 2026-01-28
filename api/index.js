import app from "../server/app.js";

export default async function handler(req, res) {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: "admin_env_missing" });
    return;
  }
  return app(req, res);
}
