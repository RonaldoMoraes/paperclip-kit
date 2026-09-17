import { Controller, Get, HttpStatus, Inject, Put } from "@nestjs/common";
import type { GetItemResponse } from "@contracts/example/get-item";
import { type Item, ItemParams } from "@contracts/example/item";
import type { ListItemsResponse } from "@contracts/example/list-items";
import { SetItemDoneRequest, type SetItemDoneResponse } from "@contracts/example/set-item-done";
import { ApiException } from "../common/api-error";
import { ZodBody, ZodParam } from "../common/zod.pipe";
import { type ExampleStore, getItem, listItems, setItemDone } from "./example.service";
import { EXAMPLE_STORE } from "./example.types";

/**
 * The example feature's three routes — the golden path `/feature` clones.
 *
 * Public in base: no session guard exists until the auth module is on, and that module's
 * docs say where `@UseGuards(SessionGuard)` goes. Every input is parsed by the contract's
 * own schema through the pipe, so the handler never sees a raw body or param.
 */
@Controller("api/example")
export class ExampleController {
  constructor(@Inject(EXAMPLE_STORE) private readonly store: ExampleStore) {}

  @Get("items")
  async list(): Promise<ListItemsResponse> {
    return { items: await listItems({ store: this.store }) };
  }

  @Get("items/:id")
  async read(@ZodParam(ItemParams) params: ItemParams): Promise<GetItemResponse> {
    return found(await getItem({ store: this.store }, params.id));
  }

  @Put("items/:id/done")
  async setDone(
    @ZodParam(ItemParams) params: ItemParams,
    @ZodBody(SetItemDoneRequest) body: SetItemDoneRequest
  ): Promise<SetItemDoneResponse> {
    return found(await setItemDone({ store: this.store }, params.id, body.done));
  }
}

/** A missing item is an answer the app names — `NOT_FOUND` in the envelope, never a bare 404. */
function found(item: Item | null): Item {
  if (!item) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no item with that id.");
  return item;
}
