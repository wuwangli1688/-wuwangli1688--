import { Router } from "express";
import type { Response } from "express";
import QRCode from "qrcode";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// All share routes require auth
router.use(authMiddleware);

// GET /api/v1/share/app-url
// Returns the app download/share URL and QR code as base64
router.get("/app-url", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "http://localhost:5000";
    const shareUrl = `${baseUrl}`;

    // Generate QR code as base64 data URL
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      data: {
        url: shareUrl,
        qr_code: qrDataUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/v1/share/qr-code
// Returns QR code image as PNG buffer
router.get("/qr-code", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "http://localhost:5000";
    const shareUrl = `${baseUrl}`;

    const qrBuffer = await QRCode.toBuffer(shareUrl, {
      width: 300,
      margin: 2,
      type: "png",
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", qrBuffer.length.toString());
    res.send(qrBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
