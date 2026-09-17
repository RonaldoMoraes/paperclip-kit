import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getItemQuery } from "@contracts/example/get-item";
import type { Item } from "@contracts/example/item";
import { listItemsQuery } from "@contracts/example/list-items";
import { failureCopy, failureReason } from "@contracts/http-errors";
import { rememberVisitedItem } from "~/data/store";
import { http } from "~/lib/http";

/**
 * Server state on a tab: one `use<Feature>Facts` hook, the whole of what the tab reads.
 * It calls the contract's query factory and never re-declares a key — the factory owns the
 * key and the freshness — and returns a narrow discriminated result the route branches on
 * once. There are no loaders on the phone, so the pending and failed branches live here
 * rather than in the web's `ensureQueryData`; the screen takes what `ready` carries and
 * holds neither. `failureCopy` is the one place a failure becomes a sentence.
 */
export type ExampleItemsFacts =
  | { status: "pending" }
  | { status: "failed"; failure: string; retry: () => void }
  | { status: "ready"; items: Item[] };

export function useExampleItems(): ExampleItemsFacts {
  const { data, status, error, refetch } = useQuery(listItemsQuery(http));

  // Data already held outranks a refetch that failed: the list stays readable and the
  // next foreground refetch tries again on its own.
  if (data) return { status: "ready", items: data.items };
  if (status === "error") {
    return {
      status: "failed",
      failure: failureCopy(error),
      retry: () => {
        refetch();
      },
    };
  }
  return { status: "pending" };
}

/**
 * One item, for the pushed detail — the same shape, keyed under the list's feature key,
 * plus `missing`: an id the server does not carry — a dead link, a typo — is not a failure
 * to retry from but a reason to go back to the list, which is the honest answer to "that
 * one is gone". Only the 404: any other failure is a valid deep link the user should be
 * able to retry.
 */
export type ExampleItemFacts =
  | { status: "pending" }
  | { status: "missing" }
  | { status: "failed"; failure: string; retry: () => void }
  | { status: "ready"; item: Item };

export function useExampleItem(id: string): ExampleItemFacts {
  const { data, status, error, refetch } = useQuery(getItemQuery(http, id));

  // Only an item that exists is worth remembering — the store is device-side and the list
  // marks it. In the effect, not the render: the store notifies its readers.
  useEffect(() => {
    if (data) rememberVisitedItem(data.id);
  }, [data]);

  if (data) return { status: "ready", item: data };
  if (status === "error") {
    if (failureReason(error) === "not-found") return { status: "missing" };
    return {
      status: "failed",
      failure: failureCopy(error),
      retry: () => {
        refetch();
      },
    };
  }
  return { status: "pending" };
}
