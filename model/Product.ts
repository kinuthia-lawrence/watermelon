import { Model } from "@nozbe/watermelondb";
import { text, date } from "@nozbe/watermelondb/decorators";

export default class Product extends Model {
  static table = "products";

  @text("name") name!: string;
  @text("price") price!: string;
  @date("created_at") createdAt!: Date;
}