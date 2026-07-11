import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Transaction {
  id: string;
  amount: number;
  type: "income" | "expense";
  category_id: number;
  note: string | null;
  date: string;
  categories?: { name: string; icon: string; color: string } | null;
}

interface MonthData {
  year: number;
  month: number;
  carryForward: number;
  transactions: (Transaction & { runningBalance: number; serialNo: number })[];
  totalIncome: number;
  totalExpense: number;
  endBalance: number;
}

const iconMap: Record<string, string> = {
  restaurant: "utensils",
  car: "car",
  "shopping-bag": "bag-shopping",
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
  circle: "circle",
};

export default function HomeScreen() {
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nowRef = useRef(new Date());
  const [viewYear, setViewYear] = useState(nowRef.current.getFullYear());
  const [viewMonth, setViewMonth] = useState(nowRef.current.getMonth() + 1);

  const fetchMonthData = useCallback(async (year: number, month: number) => {
    setError(null);
    try {
      const pad = (n: number) => String(n).padStart(2, "0");
      const lastDay = new Date(year, month, 0).getDate();
      const monthStart = `${year}-${pad(month)}-01`;
      const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

      // 1. Fetch this month's transactions (date ASC for running balance)
      const txRes = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?start_date=${monthStart}&end_date=${monthEnd}&size=200&order=date.asc`
      );
      if (!txRes.ok) throw new Error("加载交易记录失败");
      const txData = await txRes.json();
      const transactions: Transaction[] = txData.data || [];

      // 2. Calculate carry-forward balance (all before this month)
      const prevMonthEnd = `${year}-${pad(month - 1 === 0 ? 12 : month - 1)}-${pad(
        new Date(year, month - 1, 0).getDate()
      )}`;
      const summaryRes = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/summary?end_date=${prevMonthEnd}`
      );
      let carryForward = 0;
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        carryForward = parseFloat(summaryData.data?.balance || "0");
      }

      // 3. Calculate running balance
      let running = carryForward;
      let totalIncome = 0;
      let totalExpense = 0;
      const enriched = transactions.map((t, i) => {
        const amt = parseFloat(String(t.amount));
        if (t.type === "income") {
          running += amt;
          totalIncome += amt;
        } else {
          running -= amt;
          totalExpense += amt;
        }
        return {
          ...t,
          amount: amt,
          runningBalance: Math.round(running * 100) / 100,
          serialNo: i + 1,
        };
      });

      setMonthData({
        year,
        month,
        carryForward,
        transactions: enriched,
        totalIncome,
        totalExpense,
        endBalance: Math.round(running * 100) / 100,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setError(message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchMonthData(viewYear, viewMonth).finally(() => setLoading(false));
    }, [viewYear, viewMonth, fetchMonthData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMonthData(viewYear, viewMonth);
    setRefreshing(false);
  }, [viewYear, viewMonth, fetchMonthData]);

  const changeMonth = (delta: number) => {
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const formatCurrency = (val: number) => {
    const fixed = val.toFixed(2);
    const [intPart, decPart] = fixed.split(".");
    const formatted = Number(intPart).toLocaleString("en-US");
    return { int: formatted, dec: decPart };
  };

  const monthLabels = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月",
  ];

  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <View style={[styles.colSerial, styles.colCenter]}>
        <Text style={styles.headerText}>序号</Text>
      </View>
      <View style={styles.colDate}>
        <Text style={styles.headerText}>日期</Text>
      </View>
      <View style={styles.colItem}>
        <Text style={styles.headerText}>项目</Text>
      </View>
      <View style={[styles.colAmount, styles.colRight]}>
        <Text style={[styles.headerText, styles.incomeHeader]}>收入</Text>
      </View>
      <View style={[styles.colAmount, styles.colRight]}>
        <Text style={[styles.headerText, styles.expenseHeader]}>支出</Text>
      </View>
      <View style={[styles.colBalance, styles.colRight]}>
        <Text style={styles.headerText}>余额</Text>
      </View>
    </View>
  );

  const renderCarryForward = () => {
    if (!monthData) return null;
    const cf = formatCurrency(monthData.carryForward);
    return (
      <View style={styles.carryForwardRow}>
        <View style={[styles.colSerial, styles.colCenter]}>
          <Text style={styles.cfText}>-</Text>
        </View>
        <View style={styles.colDate}>
          <Text style={styles.cfText}>-</Text>
        </View>
        <View style={styles.colItem}>
          <Text style={styles.cfLabel}>上月结余</Text>
        </View>
        <View style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.cfText}>-</Text>
        </View>
        <View style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.cfText}>-</Text>
        </View>
        <View style={[styles.colBalance, styles.colRight]}>
          <Text style={styles.cfAmount}>
            <Text style={styles.cfSymbol}>¥</Text>
            {cf.int}
            <Text style={styles.cfDecimal}>.{cf.dec}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderTransaction = ({
    item,
  }: {
    item: MonthData["transactions"][0];
  }) => {
    const amt = formatCurrency(Math.abs(item.amount));
    const bal = formatCurrency(item.runningBalance);
    const cat = item.categories;
    const iconKey = cat?.icon || "circle";
    const iconName = iconMap[iconKey] || "circle";
    const dateStr = item.date ? item.date.slice(5) : ""; // MM-DD
    const isIncome = item.type === "income";

    return (
      <View style={styles.txRow}>
        {/* 序号 */}
        <View style={[styles.colSerial, styles.colCenter]}>
          <Text style={styles.serialText}>{item.serialNo}</Text>
        </View>

        {/* 日期 */}
        <View style={styles.colDate}>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        {/* 项目（分类图标+名称+备注） */}
        <View style={styles.colItem}>
          <View style={styles.itemRow}>
            <View
              style={[
                styles.catIconWrap,
                { backgroundColor: `${cat?.color || "#64748B"}18` },
              ]}
            >
              <FontAwesome6
                name={iconName as any}
                size={11}
                color={cat?.color || "#64748B"}
              />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {cat?.name || "未分类"}
              </Text>
              {item.note ? (
                <Text style={styles.itemNote} numberOfLines={1}>
                  {item.note}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* 收入 */}
        <View style={[styles.colAmount, styles.colRight]}>
          {isIncome ? (
            <Text style={styles.incomeAmount}>
              ¥{amt.int}
              <Text style={styles.amountDecimal}>.{amt.dec}</Text>
            </Text>
          ) : (
            <Text style={styles.emptyCell}>-</Text>
          )}
        </View>

        {/* 支出 */}
        <View style={[styles.colAmount, styles.colRight]}>
          {!isIncome ? (
            <Text style={styles.expenseAmount}>
              ¥{amt.int}
              <Text style={styles.amountDecimal}>.{amt.dec}</Text>
            </Text>
          ) : (
            <Text style={styles.emptyCell}>-</Text>
          )}
        </View>

        {/* 余额 */}
        <View style={[styles.colBalance, styles.colRight]}>
          <Text style={styles.balanceAmount}>
            ¥{bal.int}
            <Text style={styles.balanceDecimal}>.{bal.dec}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (!monthData || monthData.transactions.length === 0) return null;
    const totalIn = formatCurrency(monthData.totalIncome);
    const totalOut = formatCurrency(monthData.totalExpense);
    const endBal = formatCurrency(monthData.endBalance);
    return (
      <View style={styles.footerRow}>
        <View style={[styles.colSerial, styles.colCenter]}>
          <Text style={styles.footerLabel}>合计</Text>
        </View>
        <View style={styles.colDate} />
        <View style={styles.colItem}>
          <Text style={styles.footerLabel}>本月合计</Text>
        </View>
        <View style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.footerIncome}>
            ¥{totalIn.int}
            <Text style={styles.footerDecimal}>.{totalIn.dec}</Text>
          </Text>
        </View>
        <View style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.footerExpense}>
            ¥{totalOut.int}
            <Text style={styles.footerDecimal}>.{totalOut.dec}</Text>
          </Text>
        </View>
        <View style={[styles.colBalance, styles.colRight]}>
          <Text style={styles.footerBalance}>
            ¥{endBal.int}
            <Text style={styles.footerDecimal}>.{endBal.dec}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <FontAwesome6 name="book-open" size={40} color="#CBD5E1" />
      <Text style={styles.emptyText}>本月暂无记录</Text>
      <Text style={styles.emptyHint}>{'点击底部"+"开始记账'}</Text>
    </View>
  );

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <View style={styles.container}>
        {/* Month Selector */}
        <View style={styles.monthBar}>
          <TouchableOpacity
            style={styles.monthArrow}
            onPress={() => changeMonth(-1)}
          >
            <FontAwesome6 name="chevron-left" size={16} color="#475569" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {viewYear}年{monthLabels[viewMonth - 1]}
          </Text>
          <TouchableOpacity
            style={styles.monthArrow}
            onPress={() => changeMonth(1)}
          >
            <FontAwesome6 name="chevron-right" size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Error State */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={() => fetchMonthData(viewYear, viewMonth)}
            >
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading */}
        {loading && !monthData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : monthData ? (
          <FlatList
            data={monthData.transactions}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            ListHeaderComponent={
              <View>
                {renderTableHeader()}
                {renderCarryForward()}
              </View>
            }
            ListFooterComponent={renderFooter}
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#2563EB"
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const COLORS = {
  bg: "#FDFCF9",
  tableBg: "#FFFFFF",
  border: "#E8E4DB",
  headerBg: "#F7F5F0",
  headerText: "#5C4F3C",
  text: "#2D2420",
  textSecondary: "#8B7E6E",
  income: "#0F7B4E",
  incomeBg: "#ECFDF5",
  expense: "#C2410C",
  expenseBg: "#FFF7ED",
  balance: "#1E3A5F",
  carryForwardBg: "#F9F7F2",
  footerBg: "#F7F5F0",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Month Bar
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bg,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.tableBg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginHorizontal: 24,
    letterSpacing: 0.5,
  },

  // Error
  errorBanner: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
  },
  errorText: { fontSize: 13, color: "#DC2626" },
  retryText: { fontSize: 13, color: "#2563EB", fontWeight: "600" },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // List
  listContent: {
    paddingBottom: 40,
  },

  // Table Header
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerBg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginHorizontal: 0,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.headerText,
    letterSpacing: 0.5,
  },
  incomeHeader: { color: COLORS.income },
  expenseHeader: { color: COLORS.expense },

  // Carry Forward
  carryForwardRow: {
    flexDirection: "row",
    backgroundColor: COLORS.carryForwardBg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cfLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  cfText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cfAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.balance,
  },
  cfSymbol: {
    fontSize: 11,
    fontWeight: "500",
  },
  cfDecimal: {
    fontSize: 10,
    fontWeight: "500",
  },

  // Transaction Row
  txRow: {
    flexDirection: "row",
    backgroundColor: COLORS.tableBg,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    minHeight: 44,
    alignItems: "center",
  },

  // Column widths
  colSerial: { width: 32 },
  colDate: { width: 46 },
  colItem: { flex: 1, paddingHorizontal: 4 },
  colAmount: { width: 64 },
  colBalance: { width: 72 },
  colCenter: { alignItems: "center" },
  colRight: { alignItems: "flex-end" },

  serialText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.text,
  },

  // Item
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  catIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  itemNote: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },

  // Amount cells
  emptyCell: {
    fontSize: 12,
    color: "#D6D3D1",
  },
  incomeAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.income,
  },
  expenseAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.expense,
  },
  amountDecimal: {
    fontSize: 10,
    fontWeight: "500",
  },

  // Balance
  balanceAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.balance,
  },
  balanceDecimal: {
    fontSize: 10,
    fontWeight: "500",
  },

  // Footer (合计)
  footerRow: {
    flexDirection: "row",
    backgroundColor: COLORS.footerBg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.headerText,
  },
  footerIncome: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.income,
  },
  footerExpense: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.expense,
  },
  footerBalance: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.balance,
  },
  footerDecimal: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: "#B8B0A5",
    marginTop: 4,
  },
});
