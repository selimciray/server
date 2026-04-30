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
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("Data klasörü oluşturuldu:", DATA_DIR);
  }
} catch (err) {
  console.error("Klasör oluşturma hatası:", err);
}

// 📄 Dosya yoksa oluştur
try {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      maintenance: false,
      maintenance_message: "",
      announcement: "",
      latest_version: "1.0.0",
      min_required_version: "1.0.0"
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
    console.log("Config dosyası oluşturuldu");
  }
} catch (err) {
  console.error("Config dosyası oluşturma hatası:", err);
}

try {
  if (!fs.existsSync(PLAYERS_PATH)) {
    fs.writeFileSync(PLAYERS_PATH, JSON.stringify({}, null, 2), "utf8");
    console.log("Players dosyası oluşturuldu");
  }
} catch (err) {
  console.error("Players dosyası oluşturma hatası:", err);
}

// 📥 JSON oku (güvenli)
function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn("Dosya bulunamadı:", filePath);
      return {};
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("JSON okuma hatası:", filePath, e.message);
    return {};
  }
}

// 💾 JSON yaz
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("JSON yazma hatası:", filePath, e.message);
    return false;
  }
}

// 🌍 IP alma (Render uyumlu)
function getIP(req) {
  try {
    const ipRaw = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "0.0.0.0";
    return ipRaw.replace("::ffff:", "").replace("::1", "127.0.0.1");
  } catch (e) {
    console.error("IP alma hatası:", e);
    return "0.0.0.0";
  }
}

// ============================
// 🚀 ANA ENDPOINT
// ============================
app.post("/auth", (req, res) => {
  try {
    const config = readJSON(CONFIG_PATH);
    const players = readJSON(PLAYERS_PATH);

    const { username, deviceId, version } = req.body;
    const ip = getIP(req);

    // Input validasyonu
    if (!username || !deviceId || !version) {
      return res.status(400).json({
        status: "error",
        message: "Eksik parametre: username, deviceId, version gerekli"
      });
    }

    // 🌍 Ülke tespiti
    const geo = geoip.lookup(ip);
    const country = geo ? geo.country : "UNKNOWN";

    // 🛠️ Maintenance kontrolü
    if (config.maintenance) {
      return res.json({
        status: "maintenance",
        message: config.maintenance_message || "Sunucu bakımda"
      });
    }

    // 🔄 Versiyon kontrolü
    if (version !== config.latest_version) {
      return res.json({
        status: "update_required",
        latest_version: config.latest_version || "1.0.0",
        message: "Lütfen güncelleyin"
      });
    }

    // 👤 Kullanıcı yoksa oluştur
    if (!players[username]) {
      players[username] = {
        deviceId,
        ip,
        country,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      writeJSON(PLAYERS_PATH, players);
      console.log("Yeni kullanıcı:", username, country);
    } else {
      // Mevcut kullanıcıyı güncelle
      players[username].lastLogin = new Date().toISOString();
      players[username].ip = ip;
      players[username].country = country;
      writeJSON(PLAYERS_PATH, players);
    }

    return res.json({
      status: "ok",
      message: "Giriş başarılı",
      announcement: config.announcement || "",
      country,
      user: players[username]
    });
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({
      status: "error",
      message: "Sunucu hatası"
    });
  }
});

// ============================
// 🔧 ADMIN PANEL (ŞİFRELİ)
// ============================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "123456"; // Environment variable'dan al

app.post("/admin/config", (req, res) => {
  const { token, newConfig } = req.body;

  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Yetkisiz erişim" });
  }

  if (!newConfig || typeof newConfig !== 'object') {
    return res.status(400).json({ error: "Geçersiz config" });
  }

  try {
    // Mevcut configi koru ve yeni değerlerle birleştir
    const currentConfig = readJSON(CONFIG_PATH);
    const updatedConfig = { ...currentConfig, ...newConfig };
    writeJSON(CONFIG_PATH, updatedConfig);
    
    return res.json({
      status: "updated",
      config: updatedConfig
    });
  } catch (error) {
    console.error("Admin update error:", error);
    return res.status(500).json({ error: "Config güncellenemedi" });
  }
});

// ============================
// 📊 PLAYER LIST (DEBUG)
// ============================
app.get("/players", (req, res) => {
  try {
    const players = readJSON(PLAYERS_PATH);
    const playerCount = Object.keys(players).length;
    
    res.json({
      total: playerCount,
      players: players
    });
  } catch (error) {
    console.error("Players fetch error:", error);
    res.status(500).json({ error: "Oyuncu listesi alınamadı" });
  }
});

// ============================
// 🏠 TEST
// ============================
app.get("/", (req, res) => {
  res.json({
    status: "active",
    message: "Server çalışıyor 🚀",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint bulunamadı" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({ error: "Sunucu hatası" });
});

// ============================
// 🚀 SERVER
// ============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Config path: ${CONFIG_PATH}`);
  console.log(`Players path: ${PLAYERS_PATH}`);
});
