import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface CategoryInfo {
  name: string;
  icon: string;
  color: string;
}

interface Transaction {
  id: number;
  amount: string;
  type: "income" | "expense";
  category_id: number;
  note: string | null;
  date: string;
  created_at: string;
  categories: CategoryInfo;
}

interface Summary {
  total_income: string;
  total_expense: string;
  balance: string;
}

// Icon name mapping
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${month}月${day}日 ${weekDays[d.getDay()]}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_income: "0.00", total_expense: "0.00", balance: "0.00" });
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchData = useCallback(async () => {
    try {
      const startDate = `${currentMonth}-01`;
      const [year, month] = currentMonth.split("-").map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

      const [transRes, summaryRes] = await Promise.all([
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?start_date=${startDate}&end_date=${endDate}&size=50`),
        authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/summary?start_date=${startDate}&end_date=${endDate}`),
      ]);

      const transData = await transRes.json();
      const summaryData = await summaryRes.json();

      setTransactions(transData.data || []);
      setSummary(summaryData.data || { total_income: "0.00", total_expense: "0.00", balance: "0.00" });
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  }, [currentMonth]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // Group transactions by date
  const groupedTransactions = transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const dateKey = t.date.split("T")[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(t);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.transactionItem}>
      <View style={[styles.iconContainer, { backgroundColor: `${item.categories.color}18` }]}>
        <FontAwesome6 name={getIconName(item.categories.icon)} size={18} color={item.categories.color} />
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionName}>{item.categories.name}</Text>
        {item.note ? <Text style={styles.transactionNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <Text style={[styles.transactionAmount, { color: item.type === "income" ? "#059669" : "#DC2626" }]}>
        {item.type === "income" ? "+" : "-"}{parseFloat(item.amount).toFixed(2)}
      </Text>
    </View>
  );

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
            <FontAwesome6 name="chevron-left" size={16} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{currentMonth.replace("-", "年")}月</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
            <FontAwesome6 name="chevron-right" size={16} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>收入</Text>
            <Text style={[styles.summaryValue, { color: "#059669" }]}>
              {parseFloat(summary.total_income).toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>支出</Text>
            <Text style={[styles.summaryValue, { color: "#DC2626" }]}>
              {parseFloat(summary.total_expense).toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>结余</Text>
            <Text style={[styles.summaryValue, { color: "#2563EB" }]}>
              {parseFloat(summary.balance).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Transaction List */}
      <FlatList
        data={sortedDates}
        keyExtractor={(item) => item}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome6 name="receipt" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>本月暂无记录</Text>
          </View>
        }
        renderItem={({ item: dateKey }) => {
          const items = groupedTransactions[dateKey];
          const dayExpense = items.filter((t) => t.type === "expense").reduce((s, t) => s + parseFloat(t.amount), 0);
          const dayIncome = items.filter((t) => t.type === "income").reduce((s, t) => s + parseFloat(t.amount), 0);

          return (
            <View style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateText}>{formatDate(dateKey)}</Text>
                <View style={styles.dateSummary}>
                  {dayIncome > 0 && <Text style={styles.dateIncome}>收:{dayIncome.toFixed(2)}</Text>}
                  {dayExpense > 0 && <Text style={styles.dateExpense}>支:{dayExpense.toFixed(2)}</Text>}
                </View>
              </View>
              {items.map((t) => (
                <View key={t.id}>{renderTransaction({ item: t })}</View>
              ))}
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  arrowBtn: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginHorizontal: 16,
  },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 16,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  dateSummary: {
    flexDirection: "row",
    gap: 12,
  },
  dateIncome: {
    fontSize: 12,
    color: "#059669",
  },
  dateExpense: {
    fontSize: 12,
    color: "#DC2626",
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  transactionNote: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
});
