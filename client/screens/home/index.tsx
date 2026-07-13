import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  Keyboard,
  Dimensions,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { authFetch } from "@/lib/supabase";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

const monthLabels = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

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
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
};

function formatAmount(amount: number, isIncome: boolean) {
  if (!amount || amount === 0) return null;
  const abs = Math.abs(amount).toFixed(2);
  const [int, dec] = abs.split(".");
  return { int, dec, isIncome };
}

function AmountCell({
  amount,
  isIncome,
}: {
  amount: number;
  isIncome: boolean;
}) {
  const fmt = formatAmount(amount, isIncome);
  if (!fmt) {
    return <Text style={styles.emptyCell}>-</Text>;
  }
  return (
    <Text
      style={isIncome ? styles.incomeAmount : styles.expenseAmount}
    >
      {isIncome ? "+" : "-"}
      {fmt.int}
      <Text
        style={isIncome ? styles.amountDecimal : styles.amountDecimal}
      >
        .{fmt.dec}
      </Text>
    </Text>
  );
}

export default function HomeScreen() {
  const router = useSafeRouter();
  const { user, email, role } = useAuth();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [monthData, setMonthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store filter state
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStoreName, setSelectedStoreName] = useState("全部店铺");
  const isInitialLoad = useRef(true);
  const requestId = useRef(0);
  const [storeModalVisible, setStoreModalVisible] = useState(false);

  // Export state
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  // Load stores
  const loadStores = useCallback(async () => {
    try {
      // authFetch is already imported at top
      const res = await authFetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores`
      );
      if (res.ok) {
        const data = await res.json();
        const storeList = data.data || [];
        setStores(storeList);
        // Read saved store ID from AsyncStorage
        const savedId = await AsyncStorage.getItem("selected_store_id");
        if (savedId) {
          const found = storeList.find((s: any) => s.id === savedId);
          if (found) {
            setSelectedStoreId(savedId);
            setSelectedStoreName(found.name);
          }
        }
      }
    } catch (e) {
      // silently fail - store filter is optional
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, []);

  const fetchMonthData = useCallback(
    async (year: number, month: number) => {
      const currentId = ++requestId.current;
      try {
        setLoading(isInitialLoad.current);
        isInitialLoad.current = false;
        setError(null);

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        // Fetch transaction list
        const listParams = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
        });
        if (selectedStoreId) {
          listParams.append("store_id", selectedStoreId);
        }

        const [listRes, summaryRes] = await Promise.all([
          authFetch(
            `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?${listParams}`
          ),
          authFetch(
            `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/summary?${listParams}`
          ),
        ]);

        if (!listRes.ok) {
          const errData = await listRes.json().catch(() => ({}));
          throw new Error(errData.error || "获取数据失败");
        }

        const listData = await listRes.json();
        let summaryData = { total_income: 0, total_expense: 0, balance: 0 };
        if (summaryRes.ok) {
          const s = await summaryRes.json();
          summaryData = s.data || summaryData;
        }

        // Only update if this is still the latest request
        if (currentId === requestId.current) {
          // Process transactions: sort income first, then expense, calculate running balance
          const rawData = listData.data || [];
          const processedData = [...rawData].sort((a, b) => {
            // Income first, then expense
            if (a.type !== b.type) {
              return a.type === 'income' ? -1 : 1;
            }
            // Within same type, sort by date ascending
            return (a.date || '').localeCompare(b.date || '');
          });

          // Enrich transactions: flatten categories, set is_income, calculate running balance
          let runningBalance = 0;
          for (const txn of processedData) {
            // Flatten nested categories (with fallback if join returns null)
            const catData = txn.categories || {};
            txn.category_name = catData.name || null;
            txn.category_icon = catData.icon || null;
            txn.category_color = catData.color || null;
            // Set is_income flag from type
            txn.is_income = txn.type === 'income';
            // Normalize fields
            txn.notes = txn.note || txn.notes || '';
            txn.project = txn.project || '';

            // Calculate running balance
            const amount = Number(txn.amount) || 0;
            if (txn.is_income) {
              runningBalance += amount;
            } else {
              runningBalance -= amount;
            }
            txn.balance = runningBalance;
          }

          setMonthData({
            data: processedData,
            pagination: listData.pagination,
            total_income: Number(summaryData.total_income) || 0,
            total_expense: Number(summaryData.total_expense) || 0,
            balance: Number(summaryData.balance) || 0,
          });
        }
      } catch (e: any) {
        if (currentId === requestId.current) {
          setError(e.message || "网络错误");
        }
      } finally {
        if (currentId === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedStoreId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchMonthData(viewYear, viewMonth);
    }, [viewYear, viewMonth, fetchMonthData])
  );

  const changeMonth = (delta: number) => {
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMonthData(viewYear, viewMonth);
  };

  const handleStoreSelect = (store: any) => {
    if (store === null) {
      setSelectedStoreId(null);
      setSelectedStoreName("全部店铺");
      AsyncStorage.removeItem("selected_store_id");
    } else {
      setSelectedStoreId(store.id);
      setSelectedStoreName(store.name);
      AsyncStorage.setItem("selected_store_id", store.id);
    }
    setStoreModalVisible(false);
  };

  // Export handler
  const handleExport = async () => {
    try {
      setExporting(true);
      // authFetch is already imported at top

      const params = new URLSearchParams();
      if (exportStartDate) params.append("start_date", exportStartDate);
      if (exportEndDate) params.append("end_date", exportEndDate);
      if (selectedStoreId) params.append("store_id", selectedStoreId);

      const url = `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/export/transactions?${params}`;
      const res = await authFetch(url);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "导出失败");
      }

      const filename = `记账明细_${exportStartDate || "全部"}_${exportEndDate || "全部"}.xlsx`;
      const fs = FileSystem as any;
      const filePath = `${fs.cacheDirectory}${filename}`;

      // Read response as array buffer and convert to base64
      const arrayBuffer = await res.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      await fs.writeAsStringAsync(filePath, base64, {
        encoding: fs.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "导出记账数据",
        });
      } else {
        Alert.alert("成功", `数据已导出到: ${filePath}`);
      }

      setExportModalVisible(false);
    } catch (e: any) {
      Alert.alert("导出失败", e.message || "网络错误");
    } finally {
      setExporting(false);
    }
  };

  const openExportModal = (preset?: string) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    if (preset === "thisMonth") {
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setExportStartDate(start);
      setExportEndDate(end);
      setExportModalVisible(true);
    } else if (preset === "lastMonth") {
      const lastM = m === 1 ? 12 : m - 1;
      const lastY = m === 1 ? y - 1 : y;
      const start = `${lastY}-${String(lastM).padStart(2, "0")}-01`;
      const lastDay = new Date(lastY, lastM, 0).getDate();
      const end = `${lastY}-${String(lastM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setExportStartDate(start);
      setExportEndDate(end);
      setExportModalVisible(true);
    } else if (preset === "all") {
      setExportStartDate("");
      setExportEndDate("");
      setExportModalVisible(true);
    } else {
      setExportStartDate(`${y}-${String(m).padStart(2, "0")}-01`);
      const lastDay = new Date(y, m, 0).getDate();
      setExportEndDate(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
      setExportModalVisible(true);
    }
  };

  // Transaction rendering
  const renderTransaction = useCallback(({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={styles.txRow}
      activeOpacity={0.7}
      onPress={() => router.push("/detail", { id: item.id })}
    >
      <View style={[styles.colSerial, styles.colCenter]}>
        <Text style={styles.serialText}>{index + 1}</Text>
      </View>
      <View style={[styles.colDate, styles.colCenter]}>
        <Text style={styles.dateText}>
          {item.date ? item.date.substring(0, 10) : "-"}
        </Text>
      </View>
      <View style={styles.colItem}>
        <View style={styles.itemRow}>
          <View
            style={[
              styles.catIconWrap,
              { backgroundColor: `${item.category_color || "#8B7E6E"}20` },
            ]}
          >
            <FontAwesome6
              name={item.category_icon || "circle"}
              size={12}
              color={item.category_color || "#8B7E6E"}
            />
          </View>
          <View style={styles.itemTextWrap}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.category_name || "未分类"}
            </Text>
            {item.project ? (
              <Text style={styles.itemProject} numberOfLines={1}>
                {item.project}
              </Text>
            ) : null}
            {item.notes ? (
              <Text style={styles.itemNote} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <View style={[styles.colAmount, styles.colRight]}>
        {item.is_income ? (
          <AmountCell amount={item.amount} isIncome={true} />
        ) : (
          <Text style={styles.emptyCell}>-</Text>
        )}
      </View>
      <View style={[styles.colAmount, styles.colRight]}>
        {!item.is_income ? (
          <AmountCell amount={item.amount} isIncome={false} />
        ) : (
          <Text style={styles.emptyCell}>-</Text>
        )}
      </View>
      <View style={[styles.colBalance, styles.colRight]}>
        {item.balance !== undefined && item.balance !== null ? (
          <Text style={styles.balanceAmount}>
            {item.balance >= 0 ? "+" : ""}
            {item.balance.toFixed(2)}
          </Text>
        ) : (
          <Text style={styles.emptyCell}>-</Text>
        )}
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.headerText, styles.colSerial, styles.colCenter]}>
        序号
      </Text>
      <Text style={[styles.headerText, styles.colDate, styles.colCenter]}>
        日期
      </Text>
      <Text style={[styles.headerText, styles.colItem]}>项目</Text>
      <Text
        style={[
          styles.headerText,
          styles.colAmount,
          styles.colRight,
          styles.incomeHeader,
        ]}
      >
        收入
      </Text>
      <Text
        style={[
          styles.headerText,
          styles.colAmount,
          styles.colRight,
          styles.expenseHeader,
        ]}
      >
        支出
      </Text>
      <Text style={[styles.headerText, styles.colBalance, styles.colRight]}>
        余额
      </Text>
    </View>
  );

  const renderCarryForward = () => {
    if (!monthData?.carry_forward) return null;
    return (
      <View style={styles.carryForwardRow}>
        <Text style={[styles.cfLabel, styles.colSerial, styles.colCenter]}>
          -
        </Text>
        <Text style={[styles.cfText, styles.colDate, styles.colCenter]}>
          -
        </Text>
        <Text style={[styles.cfLabel, styles.colItem]}>上月结余</Text>
        <Text style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.emptyCell}>-</Text>
        </Text>
        <Text style={[styles.colAmount, styles.colRight]}>
          <Text style={styles.emptyCell}>-</Text>
        </Text>
        <View style={[styles.colBalance, styles.colRight]}>
          <Text style={styles.cfAmount}>
            {monthData.carry_forward >= 0 ? "+" : ""}
            {monthData.carry_forward.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (!monthData) return null;
    return (
      <View style={styles.footerRow}>
        <Text style={[styles.footerLabel, styles.colSerial, styles.colCenter]}>
          -
        </Text>
        <Text style={[styles.footerText, styles.colDate, styles.colCenter]}>
          -
        </Text>
        <Text style={[styles.footerLabel, styles.colItem]}>本月合计</Text>
        <View style={[styles.colAmount, styles.colRight]}>
          {monthData.total_income > 0 ? (
            <AmountCell amount={monthData.total_income} isIncome={true} />
          ) : (
            <Text style={styles.emptyCell}>-</Text>
          )}
        </View>
        <View style={[styles.colAmount, styles.colRight]}>
          {monthData.total_expense > 0 ? (
            <AmountCell amount={monthData.total_expense} isIncome={false} />
          ) : (
            <Text style={styles.emptyCell}>-</Text>
          )}
        </View>
        <View style={[styles.colBalance, styles.colRight]}>
          <Text style={styles.footerBalance}>
            {monthData.balance >= 0 ? "+" : ""}
            {monthData.balance.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <FontAwesome6 name="book-open" size={48} color="#D6D3D1" />
      <Text style={styles.emptyText}>本月暂无记录</Text>
      <Text style={styles.emptyHint}>{'点击底部"+"开始记账'}</Text>
    </View>
  );

  return (
    <Screen safeAreaEdges={["top", "left", "right"]}>
      {/* Loading */}
      {loading && !monthData ? (
        <View style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : monthData ? (
        <FlatList
          style={{ flex: 1 }}
          data={monthData.data}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderTransaction}
          removeClippedSubviews={false}
          ListHeaderComponent={
            <View>
              {/* Month Selector + Store + Export */}
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
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={() => openExportModal("thisMonth")}
                >
                  <FontAwesome6 name="download" size={14} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              {/* Store Selector Bar */}
              <TouchableOpacity
                style={styles.storeBar}
                onPress={() => setStoreModalVisible(true)}
                activeOpacity={0.7}
              >
                <FontAwesome6 name="store" size={12} color="#6B7280" />
                <Text style={styles.storeBarText} numberOfLines={1}>
                  {selectedStoreName}
                </Text>
                <FontAwesome6 name="chevron-down" size={10} color="#9CA3AF" />
              </TouchableOpacity>
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

      {/* Store Selector Modal */}
      <Modal
        visible={storeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStoreModalVisible(false)}
        >
          <View style={styles.storeModalContent}>
            <Text style={styles.storeModalTitle}>选择店铺</Text>
            <ScrollView style={styles.storeModalList}>
              <TouchableOpacity
                style={[
                  styles.storeOption,
                  !selectedStoreId && styles.storeOptionActive,
                ]}
                onPress={() => handleStoreSelect(null)}
              >
                <FontAwesome6
                  name="store"
                  size={16}
                  color={!selectedStoreId ? COLORS.primary : "#6B7280"}
                />
                <Text
                  style={[
                    styles.storeOptionText,
                    !selectedStoreId && styles.storeOptionTextActive,
                  ]}
                >
                  全部店铺
                </Text>
                {!selectedStoreId && (
                  <FontAwesome6
                    name="check"
                    size={14}
                    color={COLORS.primary}
                  />
                )}
              </TouchableOpacity>
              {stores.map((store: any) => (
                <TouchableOpacity
                  key={store.id}
                  style={[
                    styles.storeOption,
                    selectedStoreId === store.id && styles.storeOptionActive,
                  ]}
                  onPress={() => handleStoreSelect(store)}
                >
                  <FontAwesome6
                    name="store"
                    size={16}
                    color={
                      selectedStoreId === store.id ? COLORS.primary : "#6B7280"
                    }
                  />
                  <Text
                    style={[
                      styles.storeOptionText,
                      selectedStoreId === store.id &&
                        styles.storeOptionTextActive,
                    ]}
                  >
                    {store.name}
                  </Text>
                  {selectedStoreId === store.id && (
                    <FontAwesome6
                      name="check"
                      size={14}
                      color={COLORS.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.storeModalClose}
              onPress={() => setStoreModalVisible(false)}
            >
              <Text style={styles.storeModalCloseText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Export Modal */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={Keyboard.dismiss}
          disabled={Platform.OS === "web"}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.exportModalContent}>
                <Text style={styles.exportModalTitle}>导出数据</Text>

                <ScrollView
                  style={styles.exportModalBody}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Quick Presets */}
                  <Text style={styles.exportSectionLabel}>快速选择</Text>
                  <View style={styles.exportPresets}>
                    <TouchableOpacity
                      style={styles.exportPresetBtn}
                      onPress={() => openExportModal("thisMonth")}
                    >
                      <Text style={styles.exportPresetText}>本月</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.exportPresetBtn}
                      onPress={() => openExportModal("lastMonth")}
                    >
                      <Text style={styles.exportPresetText}>上月</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.exportPresetBtn}
                      onPress={() => openExportModal("all")}
                    >
                      <Text style={styles.exportPresetText}>全部</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Custom Date Range */}
                  <Text style={styles.exportSectionLabel}>自定义时间</Text>
                  <View style={styles.exportDateRow}>
                    <View style={styles.exportDateField}>
                      <Text style={styles.exportDateLabel}>开始日期</Text>
                      <TextInput
                        style={styles.exportDateInput}
                        value={exportStartDate}
                        onChangeText={setExportStartDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                    <Text style={styles.exportDateSep}>至</Text>
                    <View style={styles.exportDateField}>
                      <Text style={styles.exportDateLabel}>结束日期</Text>
                      <TextInput
                        style={styles.exportDateInput}
                        value={exportEndDate}
                        onChangeText={setExportEndDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  </View>

                  <Text style={styles.exportInfoText}>
                    当前店铺筛选: {selectedStoreName}
                  </Text>
                </ScrollView>

                <View style={styles.exportModalFooter}>
                  <TouchableOpacity
                    style={styles.exportCancelBtn}
                    onPress={() => setExportModalVisible(false)}
                    disabled={exporting}
                  >
                    <Text style={styles.exportCancelText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.exportSubmitBtn}
                    onPress={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.exportSubmitText}>导出</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </Screen>
  );
}

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
  exportBtn: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },

  // Store Bar
  storeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  storeBarText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
    maxWidth: 200,
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
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusRejected: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  itemNote: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  itemProject: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
    fontStyle: 'italic',
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
    fontWeight: "700",
    color: COLORS.balance,
  },

  // Footer
  footerRow: {
    flexDirection: "row",
    backgroundColor: COLORS.footerBg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  footerBalance: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.balance,
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: "#D1D5DB",
    marginTop: 4,
  },

  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Store Modal
  storeModalContent: {
    width: "80%",
    maxHeight: "60%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  storeModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 16,
  },
  storeModalList: {
    maxHeight: 300,
  },
  storeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  storeOptionActive: {
    backgroundColor: COLORS.primaryLight,
  },
  storeOptionText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  storeOptionTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  storeModalClose: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  storeModalCloseText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },

  // Export Modal
  exportModalContent: {
    width: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  exportModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 16,
  },
  exportModalBody: {
    maxHeight: 350,
  },
  exportSectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
    marginTop: 8,
  },
  exportPresets: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  exportPresetBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    alignItems: "center",
  },
  exportPresetText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  exportDateRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  exportDateField: {
    flex: 1,
  },
  exportDateLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  exportDateInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#374151",
  },
  exportDateSep: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingBottom: 8,
  },
  exportInfoText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 8,
    textAlign: "center",
  },
  exportModalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 16,
  },
  exportCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  exportCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  exportSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  exportSubmitText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});