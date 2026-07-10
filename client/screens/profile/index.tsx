import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Summary {
  total_income: string;
  total_expense: string;
  balance: string;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<Summary>({ total_income: "0.00", total_expense: "0.00", balance: "0.00" });
  const [totalCount, setTotalCount] = useState(0);

  const fetchAllTimeStats = useCallback(async () => {
    try {
      const [summaryRes, transRes] = await Promise.all([
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/summary`),
        fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?size=1`),
      ]);

      const summaryData = await summaryRes.json();
      const transData = await transRes.json();

      setSummary(summaryData.data || { total_income: "0.00", total_expense: "0.00", balance: "0.00" });
      setTotalCount(transData.pagination?.total || 0);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAllTimeStats();
    }, [fetchAllTimeStats])
  );

  const handleClearData = () => {
    Alert.alert(
      "确认清除",
      "确定要清除所有记账数据吗？此操作不可恢复。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认清除",
          style: "destructive",
          onPress: async () => {
            try {
              // Fetch all transactions and delete them one by one
              const res = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions?size=100`);
              const data = await res.json();
              const transactions = data.data || [];

              for (const t of transactions) {
                await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/transactions/${t.id}`, {
                  method: "DELETE",
                });
              }

              Alert.alert("成功", "所有数据已清除");
              fetchAllTimeStats();
            } catch (err) {
              Alert.alert("错误", "清除数据失败");
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: "receipt" as keyof typeof FontAwesome6.glyphMap,
      title: "记账笔数",
      value: `${totalCount} 笔`,
      color: "#2563EB",
    },
    {
      icon: "arrow-trend-up" as keyof typeof FontAwesome6.glyphMap,
      title: "累计收入",
      value: `¥${parseFloat(summary.total_income).toFixed(2)}`,
      color: "#059669",
    },
    {
      icon: "arrow-trend-down" as keyof typeof FontAwesome6.glyphMap,
      title: "累计支出",
      value: `¥${parseFloat(summary.total_expense).toFixed(2)}`,
      color: "#DC2626",
    },
    {
      icon: "wallet" as keyof typeof FontAwesome6.glyphMap,
      title: "累计结余",
      value: `¥${parseFloat(summary.balance).toFixed(2)}`,
      color: "#2563EB",
    },
  ];

  return (
    <Screen safeAreaEdges={["left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <FontAwesome6 name="piggy-bank" size={36} color="#2563EB" />
          </View>
          <Text style={styles.profileName}>我的账本</Text>
          <Text style={styles.profileDesc}>记录每一笔，掌控每一分</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {menuItems.map((item, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: `${item.color}12` }]}>
                <FontAwesome6 name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.statTitle}>{item.title}</Text>
              <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.actionsTitle}>数据管理</Text>
          <TouchableOpacity style={styles.actionItem} onPress={handleClearData}>
            <View style={[styles.actionIcon, { backgroundColor: "#FEE2E2" }]}>
              <FontAwesome6 name="trash" size={16} color="#DC2626" />
            </View>
            <Text style={styles.actionText}>清除所有数据</Text>
            <FontAwesome6 name="chevron-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>MoneyFlow v1.0.0</Text>
          <Text style={styles.appInfoSubtext}>用心记录每一笔收支</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 32,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  profileDesc: {
    fontSize: 14,
    color: "#64748B",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  actionsSection: {
    marginBottom: 32,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#0F172A",
  },
  appInfo: {
    alignItems: "center",
    paddingVertical: 24,
  },
  appInfoText: {
    fontSize: 13,
    color: "#94A3B8",
    marginBottom: 4,
  },
  appInfoSubtext: {
    fontSize: 12,
    color: "#CBD5E1",
  },
});
