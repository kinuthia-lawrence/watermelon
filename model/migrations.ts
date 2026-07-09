import { addColumns, createTable, schemaMigrations } from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: "products",
          columns: [{ name: "quantity", type: "number" }],
        }),
        createTable({
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
            { name: "server_id", type: "string", isOptional: true },
          ],
        }),
      ],
    },
  ],
});