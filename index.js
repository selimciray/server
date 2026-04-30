const express = require("express");
const fs = require("fs");
const path = require("path");
const geoip = require("geoip-lite");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const DATA_DIR    = path.join(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) { console.error("Klasör hatası:", err); }

try {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
      maintenance: false,
      maintenance_message: "",
      announcement: "",
      announcement_image: "",
      latest_version: "1.0.0",
      min_required_version: "1.0.0"
    }, null, 2), "utf8");
  }
} catch (err) { console.error("Config hatası:", err); }

try {
  if (!fs.existsSync(PLAYERS_PATH))
    fs.writeFileSync(PLAYERS_PATH, JSON.stringify({}, null, 2), "utf8");
} catch (err) { console.error("Players hatası:", err); }

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) { console.error("JSON okuma hatası:", e.message); return {}; }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) { console.error("JSON yazma hatası:", e.message); return false; }
}

function getIP(req) {
  try {
    const ipRaw = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket.remoteAddress || "0.0.0.0";
    return ipRaw.replace("::ffff:", "").replace("::1", "127.0.0.1");
  } catch (e) { return "0.0.0.0"; }
}

// ============================
// 🚀 ANA ENDPOINT
// ============================
app.post("/auth", (req, res) => {
  try {
    const config  = readJSON(CONFIG_PATH);
    const players = readJSON(PLAYERS_PATH);

    // Godot game_id gönderiyor — username/deviceId yerine game_id kabul et
    const game_id = req.body.game_id || req.body.username || req.body.deviceId;
    const version = req.body.version;
    const ip      = getIP(req);

    if (!game_id || !version) {
      return res.status(400).json({ status: "error", message: "game_id ve version gerekli" });
    }

    const geo     = geoip.lookup(ip);
    const country = geo ? geo.country : "UNKNOWN";

    // Bakım kontrolü
    if (config.maintenance) {
      return res.json({
        status: "maintenance",
        maintenance: true,
        maintenance_message: config.maintenance_message || "Sunucu bakımda",
        latest_version: config.latest_version,
        announcement: config.announcement || "",
        announcement_image: config.announcement_image || "",
        country
      });
    }

    // Versiyon kontrolü
    if (version !== config.latest_version) {
      return res.json({
        status: "update_required",
        latest_version: config.latest_version || "1.0.0",
        announcement: config.announcement || "",
        announcement_image: config.announcement_image || "",
        country
      });
    }

    // Oyuncu kaydet/güncelle
    if (!players[game_id]) {
      players[game_id] = { ip, country, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
      console.log("Yeni oyuncu:", game_id, country);
    } else {
      players[game_id].lastLogin = new Date().toISOString();
      players[game_id].ip = ip;
      players[game_id].country = country;
    }
    writeJSON(PLAYERS_PATH, players);

    return res.json({
      status: "ok",
      message: "Giriş başarılı",
      announcement: config.announcement || "",
      announcement_image: config.announcement_image || "",
      latest_version: config.latest_version,
      country
    });

  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ status: "error", message: "Sunucu hatası" });
  }
});

// ============================
// 🔓 LOGOUT
// ============================
app.post("/logout", (req, res) => {
  const { game_id } = req.body;
  console.log("Logout:", game_id);
  res.json({ status: "ok" });
});

// ============================
// 🔧 ADMIN
// ============================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "123456";

app.post("/admin/config", (req, res) => {
  const { token, newConfig } = req.body;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: "Yetkisiz" });
  if (!newConfig || typeof newConfig !== "object") return res.status(400).json({ error: "Geçersiz config" });

  try {
    const current = readJSON(CONFIG_PATH);
    const updated = { ...current, ...newConfig };
    writeJSON(CONFIG_PATH, updated);
    return res.json({ status: "updated", config: updated });
  } catch (e) {
    return res.status(500).json({ error: "Config güncellenemedi" });
  }
});

// ============================
// 📊 PLAYERS
// ============================
app.get("/players", (req, res) => {
  try {
    const players = readJSON(PLAYERS_PATH);
    res.json({ total: Object.keys(players).length, players });
  } catch (e) {
    res.status(500).json({ error: "Liste alınamadı" });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "active", message: "Server çalışıyor 🚀", timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: "Endpoint bulunamadı" }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: "Sunucu hatası" }); });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
