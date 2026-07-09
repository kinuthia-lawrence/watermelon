import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: "products",
      columns: [
        { name: "name", type: "string" },
        { name: "quantity", type: "number" },
        { name: "price", type: "string" },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "sales",
      columns: [
        { name: "product_id", type: "string", isIndexed: true },
        { name: "product_name", type: "string" },
        { name: "quantity", type: "number" },
        { name: "unit_price", type: "string" },
        { name: "total_price", type: "string" },
        { name: "status", type: "string" },
        { name: "created_at", type: "number" },
        { name: "synced", type: "boolean" },     
        { name: "server_id", type: "string" },     
      ],
    }),
  ],
});