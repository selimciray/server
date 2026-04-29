const express = require("express");
const geoip = require("geoip-lite");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const CONFIG_PATH = path.join(__dirname, "data/config.json");
const PLAYERS_PATH = path.join(__dirname, "data/players.json");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Ana giriş endpoint'i
app.post("/auth", (req, res) => {
  const { game_id } = req.body;

  if (!game_id || typeof game_id !== "string") {
    return res.status(400).json({ error: "Geçersiz game_id" });
  }

  const config = readJSON(CONFIG_PATH);
  const players = readJSON(PLAYERS_PATH);

  // Oyuncuyu kaydet/güncelle
  const now = new Date().toISOString();
  if (!players[game_id]) {
    players[game_id] = { first_seen: now };
  }
  players[game_id].last_seen = now;
  writeJSON(PLAYERS_PATH, players);

  // IP'den konum al
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip);
  const location = geo
    ? { country: geo.country, city: geo.city, ll: geo.ll }
    : { country: "TR", city: "Unknown", ll: [39.9, 32.8] }; // localhost fallback

  res.json({
    success: true,
    maintenance: config.maintenance,
    maintenance_message: config.maintenance_message,
    announcement: config.announcement,
    latest_version: config.latest_version,
    min_required_version: config.min_required_version,
    location: location,
  });
});

// Admin: config güncelle (basit, ileride token ekle)
app.post("/admin/config", (req, res) => {
  const config = readJSON(CONFIG_PATH);
  Object.assign(config, req.body);
  writeJSON(CONFIG_PATH, config);
  res.json({ success: true, config });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));