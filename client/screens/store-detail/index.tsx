import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Screen } from "@/components/Screen";
import { FontAwesome6 } from "@expo/vector-icons";
import { useSafeRouter, useSafeSearchParams } from "@/hooks/useSafeRouter";

interface StoreDetailParams {
  id: string;
  name: string;
  notes?: string;
}

export default function StoreDetailScreen() {
  const router = useSafeRouter();
  const params = useSafeSearchParams<StoreDetailParams>();

  const store = {
    id: params.id,
    name: decodeURIComponent(params.name),
    notes: params.notes ? decodeURIComponent(params.notes) : null,
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <FontAwesome6 name="arrow-left" size={18} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>店铺详情</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: 20 }}>
          {/* Store Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.storeIconRow}>
              <View style={styles.storeIconLarge}>
                <FontAwesome6 name="store" size={28} color="#0284C7" />
              </View>
              <View style={styles.storeNameRow}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.storeId}>ID: {store.id.slice(0, 8)}...</Text>
              </View>
            </View>

            {store.notes ? (
              <View style={styles.notesSection}>
                <Text style={styles.notesLabel}>备注</Text>
                <Text style={styles.notesText}>{store.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>快捷操作</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: "#E0F2FE" }]}>
                <FontAwesome6 name="list" size={20} color="#0284C7" />
              </View>
              <Text style={styles.actionText}>查看账单</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}>
                <FontAwesome6 name="chart-simple" size={20} color="#D97706" />
              </View>
              <Text style={styles.actionText}>数据统计</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: "#FCE7F3" }]}>
                <FontAwesome6 name="users" size={20} color="#DB2777" />
              </View>
              <Text style={styles.actionText}>权限管理</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: "#D1FAE5" }]}>
                <FontAwesome6 name="gear" size={20} color="#059669" />
              </View>
              <Text style={styles.actionText}>店铺设置</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  storeIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  storeIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F0F9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  storeNameRow: {
    flex: 1,
  },
  storeName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E293B",
  },
  storeId: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  notesText: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionCard: {
    width: "47%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
});