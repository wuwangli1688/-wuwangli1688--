import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSafeRouter, useSafeSearchParams } from "@/hooks/useSafeRouter";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Category {
  id: number;
  name: string;
  icon: string;
  type: string;
  color: string;
}

interface TransactionData {
  id: number;
  amount: string;
  type: "expense" | "income";
  category_id: number;
  note: string | null;
  project: string | null;
  date: string;
  store_id: string | null;
  categories: { name: string; icon: string; color: string } | null;
}

const iconMap: Record<string, keyof typeof FontAwesome6.glyphMap> = {
  restaurant: "utensils",
  car: "car",
  "shopping-bag": "shopping-bag",
  film: "film",
  heart: "heart",
  book: "book",
  home: "house",
  phone: "phone",
  "more-horizontal": "ellipsis",
  briefcase: "briefcase",
  award: "award",
  "trending-up": "arrow-trend-up",
  clock: "clock",
  "plus-circle": "circle-plus",
  gift: "gift",
  users: "users",
  "user-gear": "user-gear",
  wrench: "wrench",
  truck: "truck",
  toolbox: "toolbox",
  "hand-holding-dollar": "hand-holding-dollar",
  "sack-dollar": "sack-dollar",
  "money-bill": "money-bill",
  "building-columns": "building-columns",
  "chart-line": "chart-line",
  "chart-pie": "chart-pie",
  "file-invoice": "file-invoice",
  "file-invoice-dollar": "file-invoice-dollar",
  receipt: "receipt",
  store: "store",
  shop: "shop",
  warehouse: "warehouse",
  box: "box",
  boxes: "boxes",
  "box-open": "box-open",
  "truck-moving": "truck-moving",
  "truck-fast": "truck-fast",
  road: "road",
  "gas-pump": "gas-pump",
  "oil-can": "oil-can",
  hammer: "hammer",
  "helmet-safety": "helmet-safety",
  "paint-roller": "paint-roller",
  plug: "plug",
  lightbulb: "lightbulb",
  water: "water",
  fire: "fire",
  newspaper: "newspaper",
  print: "print",
  envelope: "envelope",
  "credit-card": "credit-card",
  coins: "coins",
  "scale-balanced": "scale-balanced",
  gavel: "gavel",
  shield: "shield",
  lock: "lock",
  key: "key",
  tag: "tag",
  tags: "tags",
  barcode: "barcode",
  qrcode: "qrcode",
  camera: "camera",
  video: "video",
  music: "music",
  headphones: "headphones",
  laptop: "laptop",
  computer: "computer",
  mobile: "mobile",
  tablet: "tablet",
  wifi: "wifi",
  cloud: "cloud",
  database: "database",
  server: "server",
  seedling: "seedling",
  tree: "tree",
  leaf: "leaf",
  recycle: "recycle",
  dumbbell: "dumbbell",
  futbol: "futbol",
  basketball: "basketball",
  plane: "plane",
  ship: "ship",
  train: "train",
  bus: "bus",
  bicycle: "bicycle",
  dog: "dog",
  cat: "cat",
  paw: "paw",
  cake: "cake",
  "ice-cream": "ice-cream",
  "mug-hot": "mug-hot",
  "wine-bottle": "wine-bottle",
  beer: "beer",
  cocktail: "cocktail",
  tent: "tent",
  mountain: "mountain",
  umbrella: "umbrella",
  snowflake: "snowflake",
  sun: "sun",
  moon: "moon",
  star: "star",
  globe: "globe",
  compass: "compass",
  map: "map",
  "location-dot": "location-dot",
  flag: "flag",
  certificate: "certificate",
  medal: "medal",
  trophy: "trophy",
  gem: "gem",
  diamond: "diamond",
  crown: "crown",
  robot: "robot",
  gear: "gear",
  sliders: "sliders",
  palette: "palette",
  pencil: "pencil",
  pen: "pen",
  clipboard: "clipboard",
  calculator: "calculator",
  ruler: "ruler",
  scissors: "scissors",
  eye: "eye",
  search: "search",
  bell: "bell",
  comment: "comment",
  message: "message",
  share: "share",
  "thumbs-up": "thumbs-up",
  "thumbs-down": "thumbs-down",
};

function getIconName(icon: string): keyof typeof FontAwesome6.glyphMap {
  return (iconMap[icon] || "circle") as keyof typeof FontAwesome6.glyphMap;
}

export default function EditTransactionScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: number }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [type, setType] = useState<"expense" | "income">("expense");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [project, setProject] = useState("");
  const [date, setDate] = useState("");

  // Fetch transaction data
  useEffect(() => {
    if (!id) return;
    loadTransaction();
  }, [id]);

  const loadTransaction = async () => {
    try {
      setLoading(true);
      /**
       * 服务端文件：server/src/routes/index.ts
       * 接口：GET /api/v1/transactions/:id
       * Path 参数：id: number
       */
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "获取记录失败");
      }
      const data = await res.json();
      const tx: TransactionData = data.data;

      setType(tx.type);
      setAmount(tx.amount);
      setNote(tx.note || "");
      setProject(tx.project || "");
      setDate(tx.date?.substring(0, 10) || "");
      setSelectedCategory(tx.category_id);

      // Fetch categories for the type
      await fetchCategories(tx.type);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取失败";
      Alert.alert("错误", message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async (txType: string) => {
    try {
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/categories/by-type?type=${txType}`
      );
      const data = await res.json();
      setCategories(data.data || []);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };

  const handleTypeChange = (newType: "expense" | "income") => {
    setType(newType);
    setSelectedCategory(null);
    fetchCategories(newType);
  };

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("提示", "请输入有效金额");
      return;
    }
    if (!selectedCategory) {
      Alert.alert("提示", "请选择分类");
      return;
    }

    setSaving(true);
    try {
      /**
       * 服务端文件：server/src/routes/index.ts
       * 接口：PUT /api/v1/transactions/:id
       * Body 参数：amount: string, type: string, category_id: number, note?: string, project?: string, date: string
       */
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            type,
            category_id: selectedCategory,
            note: note || null,
            project: project || null,
            date: new Date(date).toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }

      Alert.alert("成功", "记录已更新", [
        { text: "返回", onPress: () => router.back() },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      Alert.alert("错误", message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("确认删除", "确定要删除这条记录吗？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: confirmDelete,
      },
    ]);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      /**
       * 服务端文件：server/src/routes/index.ts
       * 接口：DELETE /api/v1/transactions/:id
       */
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "删除失败");
      }

      Alert.alert("成功", "记录已删除", [
        { text: "返回", onPress: () => router.back() },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      Alert.alert("错误", message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAmountChange = (text: string) => {
    if (text === "" || /^\d*\.?\d{0,2}$/.test(text)) {
      setAmount(text);
    }
  };

  if (loading) {
    return (
      <Screen safeAreaEdges={["left", "right"]}>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <FontAwesome6 name="arrow-left" size={18} color="#0F172A" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>编辑记录</Text>
          <TouchableOpacity
            onPress={handleDelete}
            style={s.deleteBtn}
            disabled={deleting}
          >
            <FontAwesome6
              name="trash-can"
              size={18}
              color={deleting ? "#CBD5E1" : "#DC2626"}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Toggle */}
          <View style={s.typeToggle}>
            <TouchableOpacity
              style={[s.typeBtn, type === "expense" && s.typeBtnActiveExpense]}
              onPress={() => handleTypeChange("expense")}
            >
              <Text style={[s.typeBtnText, type === "expense" && s.typeBtnTextActive]}>
                支出
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, type === "income" && s.typeBtnActiveIncome]}
              onPress={() => handleTypeChange("income")}
            >
              <Text style={[s.typeBtnText, type === "income" && s.typeBtnTextActive]}>
                收入
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={s.amountSection}>
            <Text style={s.currencySymbol}>¥</Text>
            <TextInput
              style={s.amountInput}
              placeholder="0.00"
              placeholderTextColor="#CBD5E1"
              value={amount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Category Grid */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>选择分类</Text>
          </View>
          <View style={s.categoryGrid}>
            {categories.map((cat) => {
              const catColor = cat.color || "#6B7280";
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    s.categoryItem,
                    selectedCategory === cat.id && {
                      backgroundColor: `${catColor}20`,
                      borderColor: catColor,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <View style={[s.categoryIcon, { backgroundColor: `${catColor}15` }]}>
                    <FontAwesome6
                      name={getIconName(cat.icon)}
                      size={20}
                      color={catColor}
                    />
                  </View>
                  <Text style={s.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Note Input */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>备注</Text>
          </View>
          <View style={s.inputContainer}>
            <TextInput
              style={s.textInput}
              placeholder="添加备注（可选）"
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />
          </View>

          {/* Project Content */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>项目内容</Text>
          </View>
          <View style={s.inputContainer}>
            <TextInput
              style={s.textInput}
              placeholder="填写项目内容（可选）"
              placeholderTextColor="#94A3B8"
              value={project}
              onChangeText={setProject}
              maxLength={200}
              multiline
            />
          </View>

          {/* Date */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>日期</Text>
          </View>
          <View style={s.dateContainer}>
            <TextInput
              style={s.dateInput}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />
            <FontAwesome6 name="calendar" size={16} color="#64748B" />
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>
              {saving ? "保存中..." : "保存修改"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  deleteBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  typeBtnActiveExpense: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  typeBtnActiveIncome: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  typeBtnTextActive: {
    color: "#0F172A",
  },
  amountSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    paddingVertical: 16,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0F172A",
    marginRight: 8,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: "800",
    color: "#0F172A",
    minWidth: 150,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 24,
  },
  categoryItem: {
    width: "20%",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    marginBottom: 8,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },
  inputContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  textInput: {
    fontSize: 15,
    color: "#0F172A",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  dateInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  saveBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});