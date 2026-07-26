import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CategoryStat {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  total: string;
  count: number;
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

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Check subscription status
  const checkSubscription = useCallback(async () => {
    try {
      const res = await authFetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/subscriptions/check-feature?feature=history_unlimited`);
      if (res.ok) {
        const data = await res.json();
        setIsPro(data.data?.available || false);
      }
    } catch {
      // silently fail
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const startDate = `${currentMonth}-01`;
      const [year, month] = currentMonth.split("-").map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/stats-by-category?type=${type}&start_date=${startDate}&end_date=${endDate}`
      );
      const data = await res.json();
      const stats: CategoryStat[] = data.data || [];
      setCategoryStats(stats);

      const total = stats.reduce((sum, item) => sum + parseFloat(item.total), 0);
      setTotalAmount(total);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [type, currentMonth]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      checkSubscription();
    }, [fetchData, checkSubscription])
  );

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + delta, 1);

    // Free users can only view last 3 months
    if (!isPro) {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setDate(1);
      if (d < threeMonthsAgo) {
        Alert.alert(
          '仅限专业版',
          '免费版仅可查看近3个月的统计数据。升级专业版可查看全部历史数据。',
          [
            { text: '取消', style: 'cancel' },
            { text: '去升级', onPress: () => router.push('/subscription') },
          ]
        );
        return;
      }
    }

    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
            <FontAwesome6 name="chevron-left" size={16} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{currentMonth.replace("-", "年")}月</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
            <FontAwesome6 name="chevron-right" size={16} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Type Toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, type === "expense" && styles.typeBtnActive]}
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

        {/* Total Amount */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{type === "expense" ? "总支出" : "总收入"}</Text>
          <Text style={[styles.totalValue, { color: type === "expense" ? "#DC2626" : "#059669" }]}>
            ¥{totalAmount.toFixed(2)}
          </Text>
        </View>

        {/* Category Breakdown */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>分类明细</Text>
        </View>

        {categoryStats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FontAwesome6 name="chart-pie" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>本月暂无数据</Text>
          </View>
        ) : (
          categoryStats.map((item, index) => {
            const percentage = totalAmount > 0 ? (parseFloat(item.total) / totalAmount) * 100 : 0;
            const barWidth = (SCREEN_WIDTH - 100) * (percentage / 100);

            return (
              <TouchableOpacity
                key={item.category_id}
                activeOpacity={0.7}
                onPress={() =>
                  router.push("/category-detail", {
                    category_id: item.category_id,
                    type,
                    month: currentMonth,
                    name: item.name,
                    color: item.color,
                    icon: item.icon,
                  })
                }
              >
                <View style={styles.statItem}>
                  <View style={styles.statHeader}>
                    <View style={styles.statLeft}>
                      <View style={[styles.statIcon, { backgroundColor: `${item.color}18` }]}>
                        <FontAwesome6 name={getIconName(item.icon)} size={14} color={item.color} />
                      </View>
                      <Text style={styles.statName}>{item.name}</Text>
                      <Text style={styles.statCount}>{item.count}笔</Text>
                    </View>
                    <View style={styles.statRight}>
                      <View style={styles.amountRow}>
                        <Text style={styles.statAmount}>¥{parseFloat(item.total).toFixed(2)}</Text>
                        <FontAwesome6 name="chevron-right" size={12} color="#CBD5E1" style={{ marginLeft: 6 }} />
                      </View>
                      <Text style={styles.statPercent}>{percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                  <View style={styles.barBackground}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: Math.max(barWidth, 4),
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  </View>
                  {index < categoryStats.length - 1 && <View style={styles.divider} />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  typeBtnActive: {
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
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  typeBtnTextActive: {
    color: "#0F172A",
  },
  totalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  totalLabel: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: "800",
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 16,
  },
  statItem: {
    marginBottom: 4,
  },
  statHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  statName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginRight: 6,
  },
  statCount: {
    fontSize: 12,
    color: "#94A3B8",
  },
  statRight: {
    alignItems: "flex-end",
  },
  statAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginRight: 8,
  },
  statPercent: {
    fontSize: 12,
    color: "#64748B",
    minWidth: 40,
    textAlign: "right",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  barBackground: {
    height: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 12,
  },
});
