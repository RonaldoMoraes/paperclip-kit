import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@contracts/auth/session";
import { useStoreIdentity } from "./useStoreIdentity";

const identify = vi.fn();
const forget = vi.fn();

vi.mock("~/lib/store", () => ({
  store: {
    identify: (customer: unknown) => identify(customer),
    forget: () => forget(),
  },
}));

const USER: SessionUser = { id: "7", email: "someone@example.com", name: "Someone" };

function Harness({ user }: { user: SessionUser | null }) {
  useStoreIdentity(user);
  return null;
}

describe("useStoreIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identify.mockResolvedValue(undefined);
    forget.mockResolvedValue(undefined);
  });

  // Account before paywall: the store's app user id is the auth user id, set the moment the
  // session resolves, so no purchase is ever anonymous.
  it("makes the store's customer the signed-in user, with the attributes beside the id", async () => {
    render(<Harness user={USER} />);

    await waitFor(() =>
      expect(identify).toHaveBeenCalledWith({ id: "7", email: "someone@example.com", name: "Someone" })
    );
  });

  it("says it once for a session that has not changed", async () => {
    const { rerender } = render(<Harness user={USER} />);
    await waitFor(() => expect(identify).toHaveBeenCalledOnce());

    rerender(<Harness user={{ ...USER }} />);

    expect(identify).toHaveBeenCalledOnce();
  });

  it("says it again when the name or the email changes", async () => {
    const { rerender } = render(<Harness user={USER} />);
    await waitFor(() => expect(identify).toHaveBeenCalledOnce());

    rerender(<Harness user={{ ...USER, name: "Someone Else" }} />);

    await waitFor(() => expect(identify).toHaveBeenCalledTimes(2));
  });

  // So the next person on this phone does not inherit the last one's receipt.
  it("returns the store to an anonymous customer on sign-out", async () => {
    const { rerender } = render(<Harness user={USER} />);
    await waitFor(() => expect(identify).toHaveBeenCalledOnce());

    rerender(<Harness user={null} />);

    await waitFor(() => expect(forget).toHaveBeenCalledOnce());
  });

  it("says nothing at all on a launch that was never signed in", () => {
    render(<Harness user={null} />);

    expect(identify).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });

  // The store failing to hear who this is must not hold the app: the paywall identifies
  // again, awaited, right before it sells.
  it("keeps the app up when the store refuses", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    identify.mockRejectedValue(new Error("no network"));

    expect(() => render(<Harness user={USER} />)).not.toThrow();

    await waitFor(() => expect(warned).toHaveBeenCalled());
  });
});
