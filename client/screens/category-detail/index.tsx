import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useSafeRouter, useSafeSearchParams } from "@/hooks/useSafeRouter";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface TransactionItem {
  id: number;
  amount: string;
  type: "income" | "expense";
  category_id: number;
  note: string | null;
  project: string | null;
  date: string;
  store_id: string | null;
  stores: { name: string } | null;
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
};

function getIconName(name: string): keyof typeof FontAwesome6.glyphMap {
  return (iconMap[name] || "circle") as keyof typeof FontAwesome6.glyphMap;
}

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { category_id, type, month, name, color, icon } = useSafeSearchParams<{
    category_id: number;
    type: string;
    month: string;
    name: string;
    color: string;
    icon: string;
  }>();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!category_id || !month || !type) return;
    try {
      setLoading(true);
      const startDate = `${month}-01`;
      const [year, monthNum] = month.split("-").map(Number);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?type=${type}&category_id=${category_id}&start_date=${startDate}&end_date=${endDate}&size=1000`
      );
      const data = await res.json();
      const list: TransactionItem[] = data.data || [];
      setTransactions(list);

      const total = list.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      setTotalAmount(total);
    } catch (err) {
      console.error("Failed to fetch category transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [category_id, month, type]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const renderTransaction = ({ item, index }: { item: TransactionItem; index: number }) => {
    const isExpense = item.type === "expense";
    const cat = item.categories || { name: name || "未分类", icon: icon || "circle", color: color || "#94A3B8" };

    return (
      <View style={s.txRow}>
        <View style={s.txLeft}>
          <View style={[s.txIcon, { backgroundColor: `${cat.color}18` }]}>
            <FontAwesome6 name={getIconName(cat.icon)} size={14} color={cat.color} />
          </View>
          <View style={s.txInfo}>
            <Text style={s.txCategory}>{cat.name}</Text>
            {item.project ? <Text style={s.txProject}>{item.project}</Text> : null}
            {item.note ? (
              <Text style={s.txNote} numberOfLines={2}>
                {item.note}
              </Text>
            ) : null}
            {item.stores?.name ? <Text style={s.txStore}>{item.stores.name}</Text> : null}
          </View>
        </View>
        <View style={s.txRight}>
          <Text style={[s.txAmount, { color: isExpense ? "#DC2626" : "#059669" }]}>
            {isExpense ? "-" : "+"}¥{parseFloat(item.amount).toFixed(2)}
          </Text>
          <Text style={s.txDate}>{item.date?.substring(0, 10) || ""}</Text>
        </View>
      </View>
    );
  };

  const displayMonth = month
    ? `${month.replace("-", "年")}月`
    : "";

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <FontAwesome6 name="arrow-left" size={18} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.headerIcon, { backgroundColor: `${color || "#94A3B8"}18` }]}>
            <FontAwesome6
              name={getIconName(icon || "circle")}
              size={16}
              color={color || "#94A3B8"}
            />
          </View>
          <Text style={s.headerTitle}>{name || "分类明细"}</Text>
        </View>
        <View style={s.backBtn} />
      </View>

      <View style={s.summaryCard}>
        <Text style={s.summaryMonth}>{displayMonth}</Text>
        <Text style={[s.summaryAmount, { color: type === "expense" ? "#DC2626" : "#059669" }]}>
          {type === "expense" ? "支出" : "收入"}：¥{totalAmount.toFixed(2)}
        </Text>
        <Text style={s.summaryCount}>共 {transactions.length} 笔记录</Text>
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : transactions.length === 0 ? (
        <View style={s.emptyContainer}>
          <FontAwesome6 name="file-lines" size={48} color="#CBD5E1" />
          <Text style={s.emptyText}>本月暂无数据</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTransaction}
          contentContainerStyle={[
            s.listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={true}
        />
      )}
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
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryMonth: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 13,
    color: "#94A3B8",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  txInfo: {
    flex: 1,
  },
  txCategory: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  txProject: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  txNote: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  txStore: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  txRight: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  txDate: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 16,
  },
});