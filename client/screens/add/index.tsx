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
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { Link, router as expoRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Category {
  id: number;
  name: string;
  icon: string;
  type: string;
  color: string;
}

interface Store {
  id: string;
  name: string;
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
};

function getIconName(name: string): keyof typeof FontAwesome6.glyphMap {
  return (iconMap[name] || "circle") as keyof typeof FontAwesome6.glyphMap;
}

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [project, setProject] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchStores();
  }, [type]);

  const fetchCategories = async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/categories/by-type?type=${type}`);
      const data = await res.json();
      setCategories(data.data || []);
      setSelectedCategory(null);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`);
      const data = await res.json();
      const storeList = data.data || [];
      setStores(storeList);
      if (storeList.length === 1) {
        setSelectedStoreId(storeList[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch stores:", err);
    }
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
       * 接口：POST /api/v1/transactions
       * Body 参数：amount: string, type: string, category_id: number, note?: string, date: string
       */
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          type,
          category_id: selectedCategory,
          store_id: selectedStoreId,
          note: note || null,
          project: project || null,
          date: new Date(date).toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }

      setAmount("");
      setNote("");
      setProject("");
      setSelectedCategory(null);
      Alert.alert("成功", "记录已保存", [
        { text: "继续记账", style: "default" },
        { text: "返回首页", onPress: () => router.navigate("/") },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      Alert.alert("错误", message);
    } finally {
      setSaving(false);
    }
  };

  const handleAmountChange = (text: string) => {
    // Allow only valid number input
    if (text === "" || /^\d*\.?\d{0,2}$/.test(text)) {
      setAmount(text);
    }
  };

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Toggle */}
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, type === "expense" && styles.typeBtnActiveExpense]}
              onPress={() => setType("expense")}
            >
              <Text style={[styles.typeBtnText, type === "expense" && styles.typeBtnTextActive]}>
                支出
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === "income" && styles.typeBtnActiveIncome]}
              onPress={() => setType("income")}
            >
              <Text style={[styles.typeBtnText, type === "income" && styles.typeBtnTextActive]}>
                收入
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.amountSection}>
            <Text style={styles.currencySymbol}>¥</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#CBD5E1"
              value={amount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Store Picker */}
          {stores.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>选择店铺</Text>
              </View>
              <View style={styles.storePicker}>
                {stores.map((store) => (
                  <TouchableOpacity
                    key={store.id}
                    style={[
                      styles.storeChip,
                      selectedStoreId === store.id && styles.storeChipActive,
                    ]}
                    onPress={() => setSelectedStoreId(store.id)}
                  >
                    <Text
                      style={[
                        styles.storeChipText,
                        selectedStoreId === store.id && styles.storeChipTextActive,
                      ]}
                    >
                      {store.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Category Grid */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>选择分类</Text>
            <Link href="/categories" style={styles.manageLink}>
              <Text style={styles.manageLinkText}>管理分类</Text>
            </Link>
          </View>
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryItem,
                  selectedCategory === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color },
                ]}
                onPress={() => setSelectedCategory(cat.id)}
                onLongPress={() => router.push('/categories')}
              >
                <View style={[styles.categoryIcon, { backgroundColor: `${cat.color}15` }]}>
                  <FontAwesome6 name={getIconName(cat.icon)} size={20} color={cat.color} />
                </View>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note Input */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>备注</Text>
          </View>
          <View style={styles.noteInputContainer}>
            <TextInput
              style={styles.noteInput}
              placeholder="添加备注（可选）"
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />
          </View>

          {/* Project Content */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>项目内容</Text>
          </View>
          <View style={styles.noteInputContainer}>
            <TextInput
              style={styles.noteInput}
              placeholder="填写项目内容，如：购买办公用品、支付房租（可选）"
              placeholderTextColor="#94A3B8"
              value={project}
              onChangeText={setProject}
              maxLength={200}
              multiline
            />
          </View>

          {/* Date */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>日期</Text>
          </View>
          <View style={styles.dateContainer}>
            <TextInput
              style={styles.dateInput}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />
            <FontAwesome6 name="calendar" size={16} color="#64748B" />
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? "保存中..." : "保存"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  manageLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  manageLinkText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2563EB",
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
  noteInputContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  noteInput: {
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
  storePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  storeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  storeChipActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  storeChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  storeChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
