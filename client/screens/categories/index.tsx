import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { authFetch } from "@/lib/supabase";
import { useSafeRouter } from "@/hooks/useSafeRouter";

const PRESET_ICONS = ["food", "car", "cash", "cart", "home", "game", "book", "med", "plane", "shirt", "music", "pet", "coffee", "gift", "hospital", "phone"];
const PRESET_COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"];

interface Category {
  id: number;
  name: string;
  icon: string;
  type: "income" | "expense";
  color: string;
  sort_order: number;
  user_id: string | null;
}

export default function CategoriesScreen() {
  const router = useSafeRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("more-horizontal");
  const [formType, setFormType] = useState<"income" | "expense">("expense");
  const [formColor, setFormColor] = useState("#6B7280");

  const fetchCategories = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/categories");
      const json = await res.json();
      setCategories(json.data || []);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
    }, [fetchCategories])
  );

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setFormName(cat.name);
    setFormIcon(cat.icon);
    setFormType(cat.type);
    setFormColor(cat.color);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert("提示", "请输入分类名称");
      return;
    }
    try {
      if (editing) {
        const res = await authFetch(`/api/v1/categories/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: formName.trim(), icon: formIcon, color: formColor }),
        });
        if (!res.ok) throw new Error("更新失败");
      } else {
        const res = await authFetch("/api/v1/categories", {
          method: "POST",
          body: JSON.stringify({ name: formName.trim(), icon: formIcon, type: formType, color: formColor }),
        });
        if (!res.ok) throw new Error("创建失败");
      }
      setModalVisible(false);
      fetchCategories();
    } catch (err) {
      Alert.alert("错误", err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDelete = (cat: Category) => {
    if (!cat.user_id) {
      Alert.alert("提示", "系统默认分类不能删除");
      return;
    }
    Alert.alert("确认删除", `确定要删除分类"${cat.name}"吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(`/api/v1/categories/${cat.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("删除失败");
            fetchCategories();
          } catch (err) {
            Alert.alert("错误", err instanceof Error ? err.message : "删除失败");
          }
        },
      },
    ]);
  };

  const incomeCats = categories.filter((c) => c.type === "income");
  const expenseCats = categories.filter((c) => c.type === "expense");

  const renderCategory = ({ item }: { item: Category }) => (
    <View className="flex-row items-center bg-white dark:bg-gray-800 mx-4 mb-2 p-4 rounded-xl">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: item.color + "20" }}
      >
        <Text className="text-lg">{item.icon}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">{item.name}</Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {item.user_id ? "自定义分类" : "系统默认"}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <TouchableOpacity
          className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg"
          onPress={() => openEdit(item)}
        >
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-medium">编辑</Text>
        </TouchableOpacity>
        {item.user_id && (
          <TouchableOpacity
            className="px-3 py-2 bg-red-50 dark:bg-red-900/30 rounded-lg"
            onPress={() => handleDelete(item)}
          >
            <Text className="text-red-600 dark:text-red-400 text-sm font-medium">删除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Screen>
      <View className="flex-1 bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-blue-600 text-base">← 返回</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 dark:text-white flex-1">分类管理</Text>
          <TouchableOpacity
            className="bg-blue-600 px-4 py-2 rounded-lg"
            onPress={() => { setFormName(''); setFormIcon('more-horizontal'); setFormType('expense'); setFormColor('#6B7280'); setEditing(null); setModalVisible(true); }}
          >
            <Text className="text-white font-medium text-sm">新增</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={() => (
            <View>
              {/* Expense Categories */}
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mx-4 mt-4 mb-2 uppercase">
                支出分类 ({expenseCats.length})
              </Text>
              {expenseCats.map((cat) => (
                <View key={cat.id}>{renderCategory({ item: cat })}</View>
              ))}

              {/* Income Categories */}
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mx-4 mt-6 mb-2 uppercase">
                收入分类 ({incomeCats.length})
              </Text>
              {incomeCats.map((cat) => (
                <View key={cat.id}>{renderCategory({ item: cat })}</View>
              ))}

              {loading && (
                <Text className="text-center text-gray-400 mt-8">加载中...</Text>
              )}
              {!loading && categories.length === 0 && (
                <Text className="text-center text-gray-400 mt-8">暂无分类</Text>
              )}
              <View className="h-20" />
            </View>
          )}
        />

        {/* Add/Edit Modal */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/40">
            <View className="bg-white dark:bg-gray-800 rounded-t-3xl p-6 max-h-[70%]">
              <ScrollView>
                <Text className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                  {editing ? "编辑分类" : "添加分类"}
                </Text>

                {/* Name */}
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">分类名称</Text>
                <TextInput
                  className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white mb-4"
                  placeholder="输入分类名称"
                  placeholderTextColor="#9CA3AF"
                  value={formName}
                  onChangeText={setFormName}
                />

                {/* Type (only for new) */}
                {!editing && (
                  <>
                    <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">类型</Text>
                    <View className="flex-row gap-3 mb-4">
                      <TouchableOpacity
                        className={`flex-1 py-3 rounded-xl items-center ${
                          formType === "expense" ? "bg-red-500" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                        onPress={() => setFormType("expense")}
                      >
                        <Text className={formType === "expense" ? "text-white font-semibold" : "text-gray-500"}>
                          支出
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className={`flex-1 py-3 rounded-xl items-center ${
                          formType === "income" ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                        onPress={() => setFormType("income")}
                      >
                        <Text className={formType === "income" ? "text-white font-semibold" : "text-gray-500"}>
                          收入
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Icon */}
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">图标</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {PRESET_ICONS.map((icon) => (
                    <TouchableOpacity
                      key={icon}
                      className={`w-11 h-11 rounded-xl items-center justify-center ${
                        formIcon === icon ? "bg-blue-100 dark:bg-blue-900/50 border-2 border-blue-500" : "bg-gray-100 dark:bg-gray-700"
                      }`}
                      onPress={() => setFormIcon(icon)}
                    >
                      <Text className="text-xl">{icon}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Color */}
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">颜色</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {PRESET_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      className={`w-10 h-10 rounded-full items-center justify-center ${
                        formColor === color ? "border-4 border-gray-300 dark:border-gray-500" : ""
                      }`}
                      style={{ backgroundColor: color }}
                      onPress={() => setFormColor(color)}
                    />
                  ))}
                </View>
              </ScrollView>

              {/* Footer */}
              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 items-center"
                  onPress={() => setModalVisible(false)}
                >
                  <Text className="text-gray-700 dark:text-gray-300 font-semibold">取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 py-3 rounded-xl bg-blue-600 items-center"
                  onPress={handleSave}
                >
                  <Text className="text-white font-semibold">保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}
