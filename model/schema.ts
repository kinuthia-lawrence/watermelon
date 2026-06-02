import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "products",
      columns: [
        { name: "name", type: "string" },
        { name: "price", type: "string" },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});