import { v2 as cloudinary } from "cloudinary";

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ⚡ HARDCODED KEYS FOR IMMEDIATE VERCEL RESTORATION
    cloudinary.config({
      cloud_name: "dphkrk4sf",
      api_key: "483193392587651",
      api_secret: "9mtMuqTZ9J9Z72TFUck1p9LZQmw"
    });

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = "qwik_primary_media";
    
    // Generate Signature
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      "9mtMuqTZ9J9Z72TFUck1p9LZQmw"
    );

    // Send Success Payload
    res.status(200).json({
      success: true,
      signature,
      timestamp,
      cloudName: "dphkrk4sf",
      apiKey: "483193392587651",
      folder
    });
  } catch (error) {
    console.error("Signature Gen Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to generate signature" });
  }
}
