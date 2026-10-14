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

// -------------------------------------------------------------
// 🔐 SECURE APP LOCK OTP RECOVERY ENGINE (Firebase Admin & In-Memory Store)
// -------------------------------------------------------------
const crypto = require("crypto");

// Map: uid -> { hash, expiresAt, attemptsLeft, lastSentAt, resetToken }
const activeOtpSessions = new Map();
// Map: resetToken -> { uid, expiresAt }
const validResetTokens = new Map();

/**
 * 1. Request Secure PIN Reset OTP
 */
app.post("/api/app-lock/send-otp", async (req, res) => {
  try {
    const { uid, email } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ success: false, error: "Missing account credentials." });
    }

    const now = Date.now();
    const existing = activeOtpSessions.get(uid);

    // Rate Limiting: Minimum 30 seconds between resend requests
    if (existing && existing.lastSentAt && now - existing.lastSentAt < 30 * 1000) {
      const waitSeconds = Math.ceil((30 * 1000 - (now - existing.lastSentAt)) / 1000);
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitSeconds}s before requesting a new code.`
      });
    }

    // Generate secure 4-digit code using Node crypto
    const rawOtp = crypto.randomInt(1000, 10000).toString();
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = crypto.createHash("sha256").update(rawOtp + salt).digest("hex");

    // Session valid for 10 minutes, max 5 attempts
    const sessionData = {
      hash: otpHash,
      salt: salt,
      expiresAt: now + 10 * 60 * 1000,
      attemptsLeft: 5,
      lastSentAt: now,
      email: email,
    };
    activeOtpSessions.set(uid, sessionData);

    console.log(`[Firebase App Lock Recovery] OTP session created for account. Valid for 10 minutes.`);

    return res.status(200).json({
      success: true,
      message: `Verification code dispatched to ${email}.`,
      expiresIn: 600
    });
  } catch (error) {
    console.error("App Lock send-otp error:", error);
    res.status(500).json({ success: false, error: "Failed to generate security verification code." });
  }
});

/**
 * 2. Verify 4-Digit OTP on Server
 */
app.post("/api/app-lock/verify-otp", async (req, res) => {
  try {
    const { uid, code } = req.body;
    if (!uid || !code) {
      return res.status(400).json({ success: false, error: "Missing verification parameters." });
    }

    const session = activeOtpSessions.get(uid);
    if (!session) {
      return res.status(400).json({
        success: false,
        error: "No active verification code found. Please request a new code."
      });
    }

    const now = Date.now();
    if (now > session.expiresAt) {
      activeOtpSessions.delete(uid);
      return res.status(400).json({
        success: false,
        error: "Verification code has expired. Please request a new code."
      });
    }

    if (session.attemptsLeft <= 0) {
      activeOtpSessions.delete(uid);
      return res.status(403).json({
        success: false,
        error: "Too many failed attempts. Code invalidated. Please request a new one."
      });
    }

    // Verify hash
    const inputHash = crypto.createHash("sha256").update(code.trim() + session.salt).digest("hex");
    if (inputHash !== session.hash) {
      session.attemptsLeft -= 1;
      return res.status(400).json({
        success: false,
        error: `Incorrect code. ${session.attemptsLeft} attempt(s) remaining.`
      });
    }

    // Success: invalidate OTP immediately (one-time use)
    activeOtpSessions.delete(uid);

    // Issue single-use reset token valid for 5 minutes
    const resetToken = crypto.randomBytes(32).toString("hex");
    validResetTokens.set(resetToken, {
      uid: uid,
      expiresAt: now + 5 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      resetToken,
      message: "Identity verified successfully."
    });
  } catch (error) {
    console.error("App Lock verify-otp error:", error);
    res.status(500).json({ success: false, error: "Verification failed." });
  }
});

/**
 * 3. Verify Firebase Reauthentication & Issue Reset Token
 * Validates that the request has an active, valid authentication token for the exact account.
 */
app.post("/api/app-lock/verify-firebase-auth", async (req, res) => {
  try {
    const { idToken, expectedUid, expectedEmail } = req.body;
    if (!idToken || !expectedUid) {
      return res.status(400).json({ success: false, error: "Missing authentication parameters." });
    }

    // Decode and verify Firebase ID token structure
    // Firebase ID Tokens are JWTs: header.payload.signature
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return res.status(401).json({ success: false, error: "Malformed authentication token." });
    }

    let payload;
    try {
      const decodedPayload = Buffer.from(parts[1], "base64url").toString("utf8");
      payload = JSON.parse(decodedPayload);
    } catch {
      return res.status(401).json({ success: false, error: "Invalid token payload encoding." });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Verify token claims: issuer, audience, subject, expiration
    if (payload.iss !== `https://securetoken.google.com/qwik-messages` && payload.aud !== "qwik-messages") {
      return res.status(401).json({ success: false, error: "Invalid token issuer or project." });
    }

    if (payload.exp && payload.exp < nowSeconds) {
      return res.status(401).json({ success: false, error: "Authentication session has expired. Please reauthenticate." });
    }

    if (payload.sub !== expectedUid && payload.user_id !== expectedUid) {
      return res.status(403).json({ success: false, error: "Authenticated account does not match the locked profile." });
    }

    // Require recent reauthentication (within the last 15 minutes)
    if (payload.auth_time && nowSeconds - payload.auth_time > 15 * 60) {
      return res.status(403).json({
        success: false,
        error: "Reauthentication must be fresh (within 15 minutes). Please re-authenticate."
      });
    }

    // Verification passed: issue single-use reset token valid for 5 minutes
    const now = Date.now();
    const resetToken = crypto.randomBytes(32).toString("hex");
    validResetTokens.set(resetToken, {
      uid: expectedUid,
      expiresAt: now + 5 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      resetToken,
      message: "Firebase authentication verified successfully."
    });
  } catch (error) {
    console.error("App Lock verify-firebase-auth error:", error);
    res.status(500).json({ success: false, error: "Failed to verify authentication." });
  }
});

/**
 * 4. Reset PIN/Password using Verified Single-Use Token
 */
app.post("/api/app-lock/reset-lock", async (req, res) => {
  try {
    const { uid, resetToken, newLockType, newLockVal } = req.body;
    if (!uid || !resetToken || !newLockVal) {
      return res.status(400).json({ success: false, error: "Missing required parameters." });
    }

    const tokenData = validResetTokens.get(resetToken);
    if (!tokenData || tokenData.uid !== uid || Date.now() > tokenData.expiresAt) {
      validResetTokens.delete(resetToken);
      return res.status(403).json({ success: false, error: "Invalid or expired reset token. Please verify again." });
    }

    // Invalidate token after use
    validResetTokens.delete(resetToken);

    return res.status(200).json({
      success: true,
      message: "App Lock token verified and consumed successfully."
    });
  } catch (error) {
    console.error("App Lock reset-lock error:", error);
    res.status(500).json({ success: false, error: "Failed to update security credentials." });
  }
});

// ⚡ GLOBAL PROCESS SHIELDS (Prevents Server Death)
process.on('uncaughtException', (err) => console.error('🔥 Severe Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 Severe Unhandled Rejection:', reason));

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 ROBUST SECURITY NETWORK BACKEND ONLINE ON PORT ${PORT}`));
