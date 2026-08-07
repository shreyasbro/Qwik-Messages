const express = require("express");
const cors = require("cors");
const { v2: cloudinary } = require("cloudinary");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();

// ⚡ [F] SECURITY HEADERS (Helmet Setup)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://qwik-messages.vercel.app", "http://127.0.0.1:5173", "http://localhost:5173", "https://*.firebaseio.com"]
    }
  },
  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true
}));

// Add other security headers manually
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ⚡ [F] CORS POLICY SETUP - Whitelist only trusted origins
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "https://qwik-messages.vercel.app"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// ⚡ [B] RATE LIMITING: sliding-window rate limit (20 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: "Too many requests, please try again later." }
});
app.use("/api/", apiLimiter);

// Cloudinary Engine
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Firebase Engine (Firestore Only)
try {
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
  console.error("Firebase Database Init Shielded:", e.message);
  try {
    admin.initializeApp({
      projectId: "qwik-messages"
    });
  } catch (initErr) {
    console.error("🔥 Fallback Initialization Failed:", initErr.message);
  }
}

// ⚡ SECURE EXTENDED SIGNATURE ENDPOINT
app.get("/api/get-upload-signature", (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = "qwik_primary_media";
    
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      success: true,
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder
    });
  } catch (error) {
    // ⚡ [G] Generic error response shield
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ⚡ GLOBAL PROCESS SHIELDS (Prevents Server Death)
process.on('uncaughtException', (err) => console.error('🔥 Severe Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 Severe Unhandled Rejection:', reason));

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 ROBUST SECURITY NETWORK BACKEND ONLINE ON PORT ${PORT}`));
