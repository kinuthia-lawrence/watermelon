import { getDatabase } from "@/model";
import Product from "@/model/Product";
import Sale from "@/model/Sale";
import { Q } from "@nozbe/watermelondb";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const seedProducts = [
  { name: "Mountain Watermelon", quantity: 18, price: "4.99" },
  { name: "Citrus Slice", quantity: 12, price: "3.49" },
  { name: "Berry Burst", quantity: 9, price: "5.25" },
];

const money = (value: number | string) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  return `$${numeric.toFixed(2)}`;
};

const API_BASE_URL = "https://66ac-197-248-138-195.ngrok-free.app";

export default function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [productName, setProductName] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [saleProductId, setSaleProductId] = useState<string>("");
  const [saleQuantity, setSaleQuantity] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [isOnline, setIsOnline] = useState(true);

  // ---------- Data Loading ----------
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const database = getDatabase();
        const productsCollection = database.get<Product>("products");
        const salesCollection = database.get<Sale>("sales");

        const existingProducts = await productsCollection
          .query(Q.sortBy("created_at", Q.asc))
          .fetch();

        const needsQuantityBackfill = existingProducts.some(
          (product) =>
            product.quantity === null || product.quantity === undefined,
        );

        if (needsQuantityBackfill) {
          await database.write(async () => {
            for (const product of existingProducts) {
              if (product.quantity === null || product.quantity === undefined) {
                await product.update((record) => {
                  record.quantity = 1;
                });
              }
            }
          });
        }

        if (existingProducts.length === 0) {
          await database.write(async () => {
            for (const product of seedProducts) {
              await productsCollection.create((record) => {
                record.name = product.name;
                record.quantity = product.quantity;
                record.price = product.price;
                record.createdAt = new Date();
              });
            }
          });
        }

        const [freshProducts, freshSales] = await Promise.all([
          productsCollection.query(Q.sortBy("created_at", Q.asc)).fetch(),
          salesCollection.query(Q.sortBy("created_at", Q.desc)).fetch(),
        ]);

        if (isMounted) {
          setProducts(freshProducts);
          setSales(freshSales);
          setIsReady(true);
          if (freshProducts.length > 0) setSaleProductId(freshProducts[0].id);
        }
      } catch (error) {
        console.error("Failed to load QuickStock local data:", error);
        if (isMounted) {
          setLoadError(
            "QuickStock needs a development build with the WatermelonDB native bridge. Rebuild with expo run:android and reinstall the app.",
          );
          setIsReady(true);
        }
      }
    };

    void loadData();

    // Network listener
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online!);
      if (online) {
        void syncData();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // ---------- Refresh UI ----------
  const refreshData = useCallback(async () => {
    const database = getDatabase();
    const productsCollection = database.get<Product>("products");
    const salesCollection = database.get<Sale>("sales");

    const [freshProducts, freshSales] = await Promise.all([
      productsCollection.query(Q.sortBy("created_at", Q.asc)).fetch(),
      salesCollection.query(Q.sortBy("created_at", Q.desc)).fetch(),
    ]);

    setProducts(freshProducts);
    setSales(freshSales);
    if (!saleProductId && freshProducts.length > 0) {
      setSaleProductId(freshProducts[0].id);
    }
  }, [saleProductId]);

  // ---------- Sync Logic ----------
  const syncSaleToServer = async (sale: Sale) => {
    const payload = {
      productId: sale.productId,
      productName: sale.productName,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      totalPrice: sale.totalPrice,
    };
    const response = await fetch(`${API_BASE_URL}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    return await response.json();
  };

  const pollStatus = async (serverId: string): Promise<string> => {
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${API_BASE_URL}/sales/${serverId}/status`);
      if (!response.ok) throw new Error(`Poll error: ${response.status}`);
      const data = await response.json();
      if (data.status === "confirmed") return "confirmed";
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return "pending";
  };

  const syncData = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus("syncing");

    try {
      const db = getDatabase();
      const salesCollection = db.get<Sale>("sales");
      const unsynced = await salesCollection
        .query(Q.where("synced", false), Q.sortBy("created_at", Q.asc))
        .fetch();

      if (unsynced.length === 0) {
        setSyncStatus("success");
        return;
      }

      for (const sale of unsynced) {
        try {
          const result = await syncSaleToServer(sale);
          // Update local sale
          await db.write(async () => {
            await sale.update((record) => {
              record.synced = true;
              record.serverId = result.id;
            });
          });

          // Poll for confirmation in background
          (async () => {
            try {
              const finalStatus = await pollStatus(result.id);
              if (finalStatus === "confirmed") {
                await db.write(async () => {
                  await sale.update((rec) => {
                    rec.status = "confirmed";
                  });
                });
                await refreshData();
              }
            } catch (err) {
              console.error("Polling error for sale", sale.id, err);
            }
          })();
        } catch (err) {
          console.error("Sync failed for sale", sale.id, err);
          // Keep synced = false, will retry later
        }
      }

      await refreshData();
      setSyncStatus("success");
    } catch (err) {
      console.error("Sync error:", err);
      setSyncStatus("error");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshData]);

  // ---------- Product CRUD ----------
  const resetProductForm = () => {
    setProductName("");
    setProductQuantity("");
    setProductPrice("");
    setEditingId(null);
  };

  const resetSaleForm = () => {
    setSaleQuantity("");
  };

  const handleProductSubmit = async () => {
    const trimmedName = productName.trim();
    const parsedQuantity = Number.parseInt(productQuantity.trim(), 10);
    const trimmedPrice = productPrice.trim();

    if (
      !trimmedName ||
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity < 0 ||
      !trimmedPrice
    ) {
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
            record.quantity = parsedQuantity;
            record.price = trimmedPrice;
          });
        });
      } else {
        await database.write(async () => {
          await collection.create((record) => {
            record.name = trimmedName;
            record.quantity = parsedQuantity;
            record.price = trimmedPrice;
            record.createdAt = new Date();
          });
        });
      }

      await refreshData();
      resetProductForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setProductName(product.name);
    setProductQuantity(String(product.quantity));
    setProductPrice(product.price);
    setEditingId(product.id);
  };

  const handleDeleteProduct = async (product: Product) => {
    setIsSaving(true);
    try {
      await getDatabase().write(async () => {
        await product.destroyPermanently();
      });
      if (editingId === product.id) resetProductForm();
      await refreshData();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaleSubmit = async () => {
    const parsedSaleQuantity = Number.parseInt(saleQuantity.trim(), 10);
    if (
      !activeProduct ||
      !Number.isFinite(parsedSaleQuantity) ||
      parsedSaleQuantity <= 0 ||
      parsedSaleQuantity > activeProduct.quantity
    ) {
      return;
    }

    setIsSaving(true);
    try {
      const database = getDatabase();
      const productsCollection = database.get<Product>("products");
      const salesCollection = database.get<Sale>("sales");
      const productToSell = await productsCollection.find(activeProduct.id);
      const unitPrice = Number(productToSell.price);
      const totalPrice = unitPrice * parsedSaleQuantity;

      await database.write(async () => {
        await productToSell.update((record) => {
          record.quantity = record.quantity - parsedSaleQuantity;
        });
        await salesCollection.create((record) => {
          record.productId = productToSell.id;
          record.productName = productToSell.name;
          record.quantity = parsedSaleQuantity;
          record.unitPrice = productToSell.price;
          record.totalPrice = totalPrice.toFixed(2);
          record.status = "pending";
          record.createdAt = new Date();
          record.synced = false; // explicit default
          record.serverId = null;
        });
      });

      await refreshData();
      resetSaleForm();

      // After sale is recorded, attempt sync if online
      if (isOnline) {
        await syncData();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const activeProduct = useMemo(
    () => products.find((p) => p.id === saleProductId) ?? null,
    [products, saleProductId],
  );

  // ---------- Render Helpers ----------
  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.productTextGroup}>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productMeta}>
            {item.quantity} in stock · {money(item.price)} each
          </Text>
        </View>
        <Text style={styles.stockBadge}>
          {item.quantity > 0 ? "Ready" : "Out"}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          onPress={() => handleEditProduct(item)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleDeleteProduct(item)}
          style={styles.dangerButton}
        >
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderSale = ({ item }: { item: Sale }) => {
    const statusLabel = item.status === "confirmed" ? "Confirmed" : "Pending";
    const syncIcon = item.synced ? "☁️" : "💾";
    const bgColor = item.status === "confirmed" ? "#dcfce7" : "#fef9c3";
    const textColor = item.status === "confirmed" ? "#166534" : "#854d0e";

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.productTextGroup}>
            <Text style={styles.productName}>{item.productName}</Text>
            <Text style={styles.productMeta}>
              {item.quantity} sold · {money(item.unitPrice)} each ·{" "}
              {money(item.totalPrice)} total
            </Text>
            <Text style={styles.saleMeta}>
              {item.status} {item.synced ? "· synced" : "· local only"}
            </Text>
          </View>
          <View
            style={[styles.saleBadgeContainer, { backgroundColor: bgColor }]}
          >
            <Text style={[styles.saleBadgeText, { color: textColor }]}>
              {syncIcon} {statusLabel}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ---------- Main UI ----------
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>QuickStock</Text>
            <Text style={styles.title}>Offline-first inventory</Text>
            <Text style={styles.subtitle}>
              Add products, adjust stock, and record local sales without needing
              a network connection.
            </Text>
            <View style={styles.syncRow}>
              <Pressable
                onPress={() => void syncData()}
                disabled={isSyncing || !isOnline}
                style={[
                  styles.syncButton,
                  (isSyncing || !isOnline) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.syncButtonText}>
                  {isSyncing ? "Syncing…" : "Sync now"}
                </Text>
              </Pressable>
              {syncStatus === "success" && (
                <Text style={styles.syncStatusSuccess}>✓ Synced</Text>
              )}
              {syncStatus === "error" && (
                <Text style={styles.syncStatusError}>✗ Sync failed</Text>
              )}
              {!isOnline && <Text style={styles.offlineBadge}>Offline</Text>}
            </View>
          </View>

          {/* Product Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId ? "Edit product" : "Add product"}
            </Text>
            <TextInput
              placeholder="Product name"
              placeholderTextColor="#80909c"
              value={productName}
              onChangeText={setProductName}
              style={styles.input}
            />
            <TextInput
              placeholder="Quantity"
              placeholderTextColor="#80909c"
              value={productQuantity}
              onChangeText={setProductQuantity}
              keyboardType="number-pad"
              style={styles.input}
            />
            <TextInput
              placeholder="Price"
              placeholderTextColor="#80909c"
              value={productPrice}
              onChangeText={setProductPrice}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <View style={styles.formActions}>
              {editingId && (
                <Pressable
                  onPress={resetProductForm}
                  style={styles.ghostButton}
                >
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => void handleProductSubmit()}
                style={[
                  styles.primaryButton,
                  isSaving && styles.buttonDisabled,
                ]}
                disabled={isSaving}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Saving…" : editingId ? "Update" : "Add"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Sale Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Record sale</Text>
            <View style={styles.selectionSummary}>
              <Text style={styles.selectionLabel}>Selected product</Text>
              <Text style={styles.selectionValue}>
                {activeProduct ? activeProduct.name : "No products available"}
              </Text>
            </View>
            <FlatList
              data={products}
              horizontal
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.productPicker}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSaleProductId(item.id)}
                  style={[
                    styles.pickerChip,
                    saleProductId === item.id && styles.pickerChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      saleProductId === item.id && styles.pickerChipTextActive,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
            <TextInput
              placeholder="Sale quantity"
              placeholderTextColor="#80909c"
              value={saleQuantity}
              onChangeText={setSaleQuantity}
              keyboardType="number-pad"
              style={styles.input}
            />
            <View style={styles.formActions}>
              <Pressable onPress={resetSaleForm} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSaleSubmit()}
                style={[
                  styles.primaryButton,
                  (isSaving || !activeProduct) && styles.buttonDisabled,
                ]}
                disabled={isSaving || !activeProduct}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving ? "Recording…" : "Record sale"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Product List + Sales History */}
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
              <Text style={styles.loadingText}>Loading database…</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={renderProduct}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                <View style={styles.footerSection}>
                  <View style={styles.listHeader}>
                    <Text style={styles.sectionTitle}>Sales history</Text>
                    <Text style={styles.sectionMeta}>
                      {sales.length} records
                    </Text>
                  </View>
                  <FlatList
                    data={sales}
                    keyExtractor={(item) => item.id}
                    renderItem={renderSale}
                    contentContainerStyle={styles.listContent}
                    scrollEnabled={false}
                  />
                </View>
              }
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  header: { marginBottom: 16 },
  kicker: {
    color: "#111111",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  title: { color: "#111111", fontSize: 30, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: "#222222", fontSize: 15, lineHeight: 21 },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  syncButton: {
    backgroundColor: "#1f6feb",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  syncButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  syncStatusSuccess: { color: "#16a34a", fontWeight: "700" },
  syncStatusError: { color: "#dc2626", fontWeight: "700" },
  offlineBadge: {
    backgroundColor: "#f3f4f6",
    color: "#4b5563",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
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
    minWidth: 112,
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700" },
  ghostButton: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  ghostButtonText: { color: "#111111", fontWeight: "700" },
  buttonDisabled: { opacity: 0.7 },
  selectionSummary: { marginBottom: 12 },
  selectionLabel: {
    color: "#4b5563",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    fontWeight: "700",
  },
  selectionValue: { color: "#111111", fontSize: 16, fontWeight: "700" },
  productPicker: { gap: 8, paddingBottom: 10 },
  pickerChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  pickerChipActive: { backgroundColor: "#1f6feb", borderColor: "#1f6feb" },
  pickerChipText: { color: "#111111", fontWeight: "700" },
  pickerChipTextActive: { color: "#ffffff" },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  },
  sectionTitle: { color: "#111111", fontSize: 18, fontWeight: "700" },
  sectionMeta: { color: "#4b5563", fontSize: 13 },
  listContent: { paddingBottom: 18, gap: 12 },
  footerSection: { marginTop: 8 },
  card: {
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
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  productTextGroup: { gap: 4, flex: 1 },
  productName: { color: "#111111", fontSize: 17, fontWeight: "700" },
  productMeta: { color: "#4b5563", fontSize: 13 },
  stockBadge: {
    backgroundColor: "#e0f2fe",
    color: "#075985",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
  },
  saleBadgeContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  saleBadgeText: {
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
  },
  saleMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  secondaryButtonText: { color: "#111111", fontWeight: "700" },
  dangerButton: {
    backgroundColor: "#3b1f28",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  dangerButtonText: { color: "#ffb3c1", fontWeight: "700" },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: "#4b5563" },
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
  errorText: { color: "#111111", lineHeight: 20 },
});
