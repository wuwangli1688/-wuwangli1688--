import { Router } from "express";
import type { Request, Response } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/v1/wechat/login
 * 微信小程序登录（无需认证）
 * Body: { code: string, nickname?: string, avatarUrl?: string }
 *
 * 流程：
 * 1. 用 code 换取 openid
 * 2. 查找是否已有绑定的用户
 * 3. 如果没有，自动创建新用户
 * 4. 用虚拟邮箱 + 密码登录 Supabase Auth，返回 session
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { code, nickname, avatarUrl } = req.body;

    if (!code) {
      return res.status(400).json({ error: "缺少 code 参数" });
    }

    // 调用微信接口获取 openid
    const wxAppId = process.env.WX_APP_ID || "";
    const wxAppSecret = process.env.WX_APP_SECRET || "";

    let openid: string;

    if (wxAppId && wxAppSecret) {
      const wxRes = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?appid=${wxAppId}&secret=${wxAppSecret}&js_code=${code}&grant_type=authorization_code`
      );
      const wxData = (await wxRes.json()) as {
        openid?: string;
        session_key?: string;
        errcode?: number;
        errmsg?: string;
      };

      if (wxData.errcode || !wxData.openid) {
        return res.status(400).json({
          error: "微信登录失败",
          detail: wxData.errmsg || "获取 openid 失败",
        });
      }
      openid = wxData.openid;
    } else {
      // 开发环境：用 code 模拟 openid
      openid = `wx_dev_${code}`;
    }

    const supabase = getSupabaseClient();
    const virtualEmail = `${openid}@wechat.local`;

    // 查找是否已有绑定的用户
    const { data: existingUsers } = await supabase
      .from("user_profiles")
      .select("id, role, display_name")
      .eq("wx_openid", openid)
      .limit(1);

    let userId: string;
    let isNewUser = false;
    let wxPassword: string;

    if (existingUsers && existingUsers.length > 0) {
      // 已有用户
      userId = existingUsers[0].id;

      // 更新微信信息
      const updateData: Record<string, string | null> = {};
      if (nickname) updateData.wx_nickname = nickname;
      if (avatarUrl) updateData.wx_avatar_url = avatarUrl;
      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("user_profiles")
          .update(updateData)
          .eq("id", userId);
      }

      // 使用固定密码格式登录（与创建时一致）
      wxPassword = `wx_${openid}_pwd_2024`;
    } else {
      // 新用户，自动创建
      isNewUser = true;

      // 固定密码格式，后续可用此密码重新登录
      wxPassword = `wx_${openid}_pwd_2024`;

      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: virtualEmail,
          password: wxPassword,
          email_confirm: true,
        });

      if (authError || !authData.user) {
        return res.status(500).json({
          error: "创建用户失败",
          detail: authError?.message,
        });
      }

      userId = authData.user.id;
      const displayName = nickname || `微信用户${openid.slice(-6)}`;

      // 创建用户档案
      await supabase.from("user_profiles").insert({
        id: userId,
        role: "parent",
        display_name: displayName,
        platform: "wechat",
        wx_openid: openid,
        wx_nickname: nickname || null,
        wx_avatar_url: avatarUrl || null,
      });

      // 为新用户创建默认分类
      const defaultCategories = [
        { name: "餐饮", icon: "restaurant", type: "expense", color: "#FF6B6B", sort_order: 1 },
        { name: "交通", icon: "car", type: "expense", color: "#4ECDC4", sort_order: 2 },
        { name: "购物", icon: "shopping-bag", type: "expense", color: "#45B7D1", sort_order: 3 },
        { name: "娱乐", icon: "film", type: "expense", color: "#96CEB4", sort_order: 4 },
        { name: "医疗", icon: "heart", type: "expense", color: "#FFEAA7", sort_order: 5 },
        { name: "教育", icon: "book", type: "expense", color: "#DDA0DD", sort_order: 6 },
        { name: "住房", icon: "home", type: "expense", color: "#98D8C8", sort_order: 7 },
        { name: "通讯", icon: "phone", type: "expense", color: "#F7DC6F", sort_order: 8 },
        { name: "其他支出", icon: "more-horizontal", type: "expense", color: "#B0BEC5", sort_order: 9 },
        { name: "工资", icon: "briefcase", type: "income", color: "#00B894", sort_order: 1 },
        { name: "奖金", icon: "award", type: "income", color: "#0984E3", sort_order: 2 },
        { name: "投资", icon: "trending-up", type: "income", color: "#6C5CE7", sort_order: 3 },
        { name: "兼职", icon: "clock", type: "income", color: "#E17055", sort_order: 4 },
        { name: "其他收入", icon: "plus-circle", type: "income", color: "#636E72", sort_order: 5 },
      ];

      await supabase.from("categories").insert(
        defaultCategories.map((c) => ({ ...c, user_id: userId }))
      );
    }

    // 用虚拟邮箱 + 固定密码登录，获取 Supabase Auth session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.signInWithPassword({
        email: virtualEmail,
        password: wxPassword,
      });

    if (sessionError || !sessionData.session) {
      return res.status(500).json({
        error: "获取登录凭证失败",
        detail: sessionError?.message,
      });
    }

    return res.json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      user: {
        id: userId,
        email: virtualEmail,
        isNewUser,
      },
    });
  } catch (error) {
    console.error("WeChat login error:", error);
    return res.status(500).json({ error: "微信登录失败" });
  }
});

/**
 * POST /api/v1/wechat/bindAccount
 * 将微信绑定到已有的 App 账号（无需认证）
 * Body: { code: string, account: string, password: string }
 *
 * 用于：小程序用户输入 App 端的账号密码，将微信绑定到该账号
 */
router.post("/bindAccount", async (req: Request, res: Response) => {
  try {
    const { code, account, password } = req.body;

    if (!code || !account || !password) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    const wxAppId = process.env.WX_APP_ID || "";
    const wxAppSecret = process.env.WX_APP_SECRET || "";

    let openid: string;

    if (wxAppId && wxAppSecret) {
      const wxRes = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?appid=${wxAppId}&secret=${wxAppSecret}&js_code=${code}&grant_type=authorization_code`
      );
      const wxData = (await wxRes.json()) as {
        openid?: string;
        errcode?: number;
        errmsg?: string;
      };

      if (wxData.errcode || !wxData.openid) {
        return res.status(400).json({ error: "微信登录失败" });
      }
      openid = wxData.openid;
    } else {
      openid = `wx_dev_${code}`;
    }

    const supabase = getSupabaseClient();

    // 检查微信是否已绑定其他账号
    const { data: wxBound } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("wx_openid", openid)
      .limit(1);

    if (wxBound && wxBound.length > 0) {
      return res.status(400).json({ error: "该微信已绑定其他账号" });
    }

    // 验证账号密码
    const isEmail = account.includes("@");
    const email = isEmail ? account : `${account}@记账app.local`;

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.user) {
      return res.status(400).json({ error: "账号或密码错误" });
    }

    const userId = signInData.user.id;

    // 绑定微信到该账号
    await supabase
      .from("user_profiles")
      .update({
        wx_openid: openid,
        platform: "both",
      })
      .eq("id", userId);

    return res.json({
      access_token: signInData.session?.access_token,
      refresh_token: signInData.session?.refresh_token,
      user: {
        id: userId,
        email: signInData.user.email,
        isNewUser: false,
      },
    });
  } catch (error) {
    console.error("WeChat bind error:", error);
    return res.status(500).json({ error: "绑定失败" });
  }
});

/**
 * POST /api/v1/wechat/bindFromApp
 * App 端用户绑定微信（需要认证）
 * Body: { code: string }
 * Headers: x-session
 */
router.post("/bindFromApp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.userId;

    if (!code || !userId) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    const wxAppId = process.env.WX_APP_ID || "";
    const wxAppSecret = process.env.WX_APP_SECRET || "";

    let openid: string;

    if (wxAppId && wxAppSecret) {
      const wxRes = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?appid=${wxAppId}&secret=${wxAppSecret}&js_code=${code}&grant_type=authorization_code`
      );
      const wxData = (await wxRes.json()) as {
        openid?: string;
        errcode?: number;
        errmsg?: string;
      };

      if (wxData.errcode || !wxData.openid) {
        return res.status(400).json({ error: "微信登录失败" });
      }
      openid = wxData.openid;
    } else {
      openid = `wx_dev_${code}`;
    }

    const supabase = getSupabaseClient();

    // 检查 openid 是否已被其他用户绑定
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("wx_openid", openid)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "该微信已绑定其他账号" });
    }

    // 绑定到当前用户
    await supabase
      .from("user_profiles")
      .update({
        wx_openid: openid,
        platform: "both",
      })
      .eq("id", userId);

    return res.json({ message: "绑定成功" });
  } catch (error) {
    console.error("WeChat bindFromApp error:", error);
    return res.status(500).json({ error: "绑定失败" });
  }
});

export default router;
