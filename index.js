const express = require("express");
const fs = require("fs");
const path = require("path");
const geoip = require("geoip-lite");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 📁 Dosya yolları
const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");

// 📁 Klasör yoksa oluştur
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// 📄 Dosya yoksa oluştur
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    maintenance: false,
    maintenance_message: "",
    announcement: "",
    latest_version: "1.0.0",
    min_required_version: "1.0.0"
  }, null, 2));
}

if (!fs.existsSync(PLAYERS_PATH)) {
  fs.writeFileSync(PLAYERS_PATH, JSON.stringify({}, null, 2));
}

// 📥 JSON oku (güvenli)
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return {};
  }
}

// 💾 JSON yaz
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 🌍 IP alma (Render uyumlu)
function getIP(req) {
  const ipRaw =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  return ipRaw.replace("::ffff:", "");
}

// ============================
// 🚀 ANA ENDPOINT
// ============================
app.post("/auth", (req, res) => {
  const config = readJSON(CONFIG_PATH);
  const players = readJSON(PLAYERS_PATH);

  const { username, deviceId, version } = req.body;
  const ip = getIP(req);

  // 🌍 Ülke tespiti
  const geo = geoip.lookup(ip);
  const country = geo ? geo.country : "UNKNOWN";

  // 🛠️ Maintenance kontrolü
  if (config.maintenance) {
    return res.json({
      status: "maintenance",
      message: config.maintenance_message
    });
  }

  // 🔄 Versiyon kontrolü
  if (version !== config.latest_version) {
    return res.json({
      status: "update_required",
      latest_version: config.latest_version
    });
  }

  // 👤 Kullanıcı yoksa oluştur
  if (!players[username]) {
    players[username] = {
      deviceId,
      ip,
      country,
      createdAt: new Date().toISOString()
    };

    writeJSON(PLAYERS_PATH, players);
  }

  return res.json({
    status: "ok",
    message: "Giriş başarılı",
    announcement: config.announcement || "",
    country
  });
});

// ============================
// 🔧 ADMIN PANEL (ŞİFRELİ)
// ============================
const ADMIN_TOKEN = "123456"; // değiştir

app.post("/admin/config", (req, res) => {
  const { token, newConfig } = req.body;

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Yetkisiz" });
  }

  writeJSON(CONFIG_PATH, newConfig);
  res.json({ status: "updated" });
});

// ============================
// 📊 PLAYER LIST (DEBUG)
// ============================
app.get("/players", (req, res) => {
  const players = readJSON(PLAYERS_PATH);
  res.json(players);
});

// ============================
// 🏠 TEST
// ============================
app.get("/", (req, res) => {
  res.send("Server çalışıyor 🚀");
});

// ============================
// 🚀 SERVER
// ============================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
