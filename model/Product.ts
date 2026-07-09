import { Model } from "@nozbe/watermelondb";
import { date, field, text } from "@nozbe/watermelondb/decorators";

export default class Product extends Model {
  static table = "products";

  @text("name") name!: string;
  @field("quantity") quantity!: number;
  @text("price") price!: string;
  @date("created_at") createdAt!: Date;
}