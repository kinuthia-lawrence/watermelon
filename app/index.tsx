import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Product from "@/model/Product";
import { Q } from "@nozbe/watermelondb";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDatabase } from "@/model";

const seedProducts = [
  { name: "Mountain Watermelon", price: "4.99" },
  { name: "Citrus Slice", price: "3.49" },
  { name: "Berry Burst", price: "5.25" },
  { name: "Golden Melon", price: "6.00" },
  { name: "Fresh Cube", price: "2.75" },
];

export default function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProducts = async () => {
      try {
        const database = getDatabase();
        const collection = database.get<Product>("products");
        const existingProducts = await collection
          .query(Q.sortBy("created_at", Q.asc))
          .fetch();

        if (existingProducts.length === 0) {
          await database.write(async () => {
            for (const product of seedProducts) {
              await collection.create((record) => {
                record.name = product.name;
                record.price = product.price;
                record.createdAt = new Date();
              });
            }
          });
        }

        const freshProducts = await collection
          .query(Q.sortBy("created_at", Q.asc))
          .fetch();

        if (isMounted) {
          setProducts(freshProducts);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load WatermelonDB:", error);

        if (isMounted) {
          setLoadError(
            "WatermelonDB native bridge is missing in this build. Rebuild the development client with expo run:android and reinstall it on the device.",
          );
          setIsReady(true);
        }
      }
    };

    void loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshProducts = async () => {
    const freshProducts = await getDatabase()
      .get<Product>("products")
      .query(Q.sortBy("created_at", Q.asc))
      .fetch();

    setProducts(freshProducts);
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedPrice = price.trim();

    if (!trimmedName || !trimmedPrice) {
      return;
    }

    setIsSaving(true);

    try {
      const database = getDatabase();
      const collection = database.get<Product>("products");

      if (editingId) {
        const productToUpdate = await collection.find(editingId);

        await database.write(async () => {
          await productToUpdate.update((record) => {
            record.name = trimmedName;
            record.price = trimmedPrice;
          });
        });
      } else {
        await database.write(async () => {
          await collection.create((record) => {
            record.name = trimmedName;
            record.price = trimmedPrice;
            record.createdAt = new Date();
          });
        });
      }

      await refreshProducts();
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setName(product.name);
    setPrice(product.price);
    setEditingId(product.id);
  };

  const handleDelete = async (product: Product) => {
    setIsSaving(true);

    try {
      await getDatabase().write(async () => {
        await product.destroyPermanently();
      });

      if (editingId === product.id) {
        resetForm();
      }

      await refreshProducts();
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <View style={styles.productTextGroup}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productPrice}>${item.price}</Text>
      </View>

      <View style={styles.rowActions}>
        <Pressable
          onPress={() => handleEdit(item)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Edit</Text>
        </Pressable>

        <Pressable
          onPress={() => void handleDelete(item)}
          style={styles.dangerButton}
        >
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Products</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId ? "Edit product" : "Add product"}
            </Text>

            <TextInput
              placeholder="Product name"
              placeholderTextColor="#80909c"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <TextInput
              placeholder="Price"
              placeholderTextColor="#80909c"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              style={styles.input}
            />

            <View style={styles.formActions}>
              {editingId ? (
                <Pressable onPress={resetForm} style={styles.ghostButton}>
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => void handleSubmit()}
                style={[
                  styles.primaryButton,
                  isSaving && styles.buttonDisabled,
                ]}
                disabled={isSaving}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Saving..." : editingId ? "Update" : "Add"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Stored products</Text>
            <Text style={styles.sectionMeta}>{products.length} items</Text>
          </View>

          {loadError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorTitle}>Database unavailable</Text>
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          ) : null}

          {!isReady ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#1f6feb" />
              <Text style={styles.loadingText}>Loading database...</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  header: {
    marginBottom: 16,
  },
  kicker: {
    color: "#111111",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  title: {
    color: "#111111",
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    color: "#222222",
    fontSize: 15,
    lineHeight: 21,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  formTitle: {
    color: "#111111",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    color: "#111111",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 4,
  },
  primaryButton: {
    minWidth: 96,
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  ghostButton: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  ghostButtonText: {
    color: "#111111",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#111111",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionMeta: {
    color: "#4b5563",
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  productCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  productTextGroup: {
    gap: 4,
  },
  productName: {
    color: "#111111",
    fontSize: 17,
    fontWeight: "700",
  },
  productPrice: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "600",
  },
  rowActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: "#111111",
    fontWeight: "700",
  },
  dangerButton: {
    backgroundColor: "#3b1f28",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  dangerButtonText: {
    color: "#ffb3c1",
    fontWeight: "700",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#4b5563",
  },
  errorState: {
    backgroundColor: "#ffffff",
    borderColor: "#fca5a5",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  errorTitle: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  errorText: {
    color: "#111111",
    lineHeight: 20,
  },
});