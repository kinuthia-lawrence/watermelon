import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import migrations from "./migrations";
import Product from "./Product";
import schema from "./schema";

let database: Database | null = null;

export function getDatabase() {
  try {
    if (database) {
      return database;
    }
    console.log("Index.ts::Creating adapter...");
    const adapter = new SQLiteAdapter({
      schema,
      migrations,
      jsi: false,
      onSetUpError: (error) => {
        console.error("Index.ts::Error setting up the database:", error);
      },
    });
    console.log("Index.ts::Creating database instance...");

    database = new Database({
      adapter,
      modelClasses: [Product],
    });
    console.log("Index.ts::Database initialized successfully.");

    return database;
  } catch (error) {
    console.error("Index.ts::Error initializing the database:", error);
    throw error;
  }
}
