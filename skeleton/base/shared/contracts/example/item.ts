import { z } from "zod";

/**
 * The example feature's one record, as every layer sees it.
 *
 * `id` is a slug so it can sit in a URL and a cookie ledger unencoded; `updatedAt` is an
 * ISO-8601 string on the wire, and a reader that computes with it declares
 * `z.coerce.date()` at its own seam rather than here.
 */
export const ItemId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "a slug");
export type ItemId = z.infer<typeof ItemId>;

export const Item = z.object({
  id: ItemId,
  title: z.string().min(1).max(120),
  note: z.string().max(500),
  done: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type Item = z.infer<typeof Item>;

/** The route params every `/api/example/items/:id` route parses. */
export const ItemParams = z.object({ id: ItemId });
export type ItemParams = z.infer<typeof ItemParams>;
