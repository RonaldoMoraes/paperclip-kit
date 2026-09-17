import type { ReactNode } from "react";
import { useStoreAccess } from "~/features/subscription/hooks/useStoreAccess";
import { useStoreIdentity } from "~/features/subscription/hooks/useStoreIdentity";

/**
 * Where the store learns who the customer is: one mount, above every screen, under the
 * query client.
 *
 * A `KIT_PROVIDERS` entry rather than a `KIT_BOOT` step, because identity is not a fact the
 * app knows before it starts — the stored session resolves after the first frame, and it
 * changes again on every sign-in and sign-out. A boot step runs once, before any of that,
 * and could only ever identify nobody.
 *
 * It renders its children and nothing else; the effect is `useStoreIdentity`'s, and its
 * failures are that hook's to swallow. Mounting it here rather than inside the gate is what
 * keeps it to one mount: the gate hook is called from both the root layout and `index`, so
 * an effect in it would run twice.
 */
export function StoreIdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useStoreAccess();
  useStoreIdentity(user);
  return <>{children}</>;
}
