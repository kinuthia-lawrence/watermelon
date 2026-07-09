import { Model } from "@nozbe/watermelondb";
import { date, field, text } from "@nozbe/watermelondb/decorators";

export default class Sale extends Model {
  static table = "sales";

  @text("product_id") productId!: string;
  @text("product_name") productName!: string;
  @field("quantity") quantity!: number;
  @text("unit_price") unitPrice!: string;
  @text("total_price") totalPrice!: string;
  @text("status") status!: string;
  @date("created_at") createdAt!: Date;
  @field("synced") synced!: boolean;         
  @text("server_id") serverId!: string | null;
}