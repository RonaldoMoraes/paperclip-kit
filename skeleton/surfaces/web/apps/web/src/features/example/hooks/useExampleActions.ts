import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ExampleFlowError } from "@contracts/example/errors";
import { setItemDone } from "@contracts/example/set-item-done";
import { failureCopy } from "@contracts/http-errors";
import { EXAMPLE_COPY } from "@domain/copy";
import { http } from "~/lib/http";

/**
 * What the user does with an item — flipping its flag — written through the idempotent
 * endpoint and folded back into the `["example"]` queries, so every count on the list is
 * re-derived from what the server now says rather than patched locally.
 *
 * One mutation scope for every write: two in-flight writes to the same record would race
 * read-modify-write with the loser's flag dropped. The scope runs them one after another.
 */
const ITEM_STATE_SCOPE = { id: "example-item-state" };

type ExampleActions = {
  setDone: (id: string, done: boolean) => void;
  pending: boolean;
  /** the line to show for the last write that failed, cleared by the next attempt */
  error: string | null;
};

/** The contract's own refusal has its own line; anything else reads as the generic failure. */
function lineFor(error: unknown): string {
  if (error instanceof ExampleFlowError) return EXAMPLE_COPY.detail.refused;
  return failureCopy(error);
}

export function useExampleActions(): ExampleActions {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    scope: ITEM_STATE_SCOPE,
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setItemDone(http, id, done),
    onMutate: () => setError(null),
    onError: (failure) => setError(lineFor(failure)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["example"] }),
  });

  return { setDone: (id, done) => mutate({ id, done }), pending: isPending, error };
}
