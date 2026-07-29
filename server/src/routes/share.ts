import { Router } from "express";
import type { Response } from "express";
import QRCode from "qrcode";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import { execute } from "../storage/database/direct-connection.js";

const router = Router();

// GET /api/v1/share/app-url (public)
// Returns the app download/share URL and QR code as base64
router.get("/app-url", async (_req, res: Response) => {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "http://localhost:5000";
    // The web app URL - users can directly access the app in browser
    const webAppUrl = baseUrl;

    // Generate QR code as base64 data URL for the web app
    const qrDataUrl = await QRCode.toDataURL(webAppUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      data: {
        url: webAppUrl,
        qr_code: qrDataUrl,
        // Expo Go deep link for development
        expo_go_url: `exp://u.expo.dev/${process.env.EXPO_PUBLIC_COZE_PROJECT_ID || ""}`,
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
    const webAppUrl = baseUrl;

    const qrBuffer = await QRCode.toBuffer(webAppUrl, {
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

// GET /api/v1/share/install-info
// Returns installation guide info with multiple installation methods
router.get("/install-info", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || "http://localhost:5000";
    const projectId = process.env.EXPO_PUBLIC_COZE_PROJECT_ID || "";

    // Method 1: Web app direct access (scan QR to open in browser)
    const webAppUrl = baseUrl;
    const webQrCode = await QRCode.toDataURL(webAppUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // Method 2: Expo Go deep link (for development/testing)
    const expoGoUrl = projectId ? `exp://u.expo.dev/${projectId}` : "";
    let expoGoQrCode = "";
    if (expoGoUrl) {
      expoGoQrCode = await QRCode.toDataURL(expoGoUrl, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
    }

    res.json({
      data: {
        app_name: "收支记账本",
        version: "1.0.0",
        methods: [
          {
            id: "web",
            title: "网页版（推荐）",
            description: "手机扫描二维码，直接在浏览器中打开应用",
            url: webAppUrl,
            qr_code: webQrCode,
            steps: [
              "打开手机相机或扫码软件",
              "扫描上方二维码",
              "在浏览器中打开链接",
              "建议：点击浏览器菜单 → 添加到主屏幕，像 App 一样使用",
            ],
          },
          {
            id: "expo_go",
            title: "Expo Go（开发版）",
            description: "安装 Expo Go 应用后扫码，获得原生 App 体验",
            url: expoGoUrl,
            qr_code: expoGoQrCode,
            steps: [
              "在应用商店搜索并安装「Expo Go」",
              "打开 Expo Go 应用",
              "扫描上方二维码",
              "自动加载并运行应用",
            ],
          },
        ],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/v1/share/feedback
// Submit user feedback
router.post("/feedback", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { content, contact } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: "反馈内容不能为空" });
      return;
    }

    await execute(
      "INSERT INTO feedback (user_id, content, contact) VALUES ($1, $2, $3)",
      [userId, content.trim(), contact?.trim() || ""]
    );

    res.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
