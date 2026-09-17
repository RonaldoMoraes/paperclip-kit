import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { fill } from "@domain/copy";
import { STORE_COPY } from "@domain/subscription/store-copy";
import { cn } from "@ui/cn";
import { Button } from "@ui/components/Button";
import type { StoreOffering, StorePackage } from "~/lib/store";

/**
 * The paywall — the one screen on the phone that asks for money.
 *
 * Every number on it comes from the store: the price is what Apple or Google quotes in the
 * person's own currency, and the free week is the product's own introductory offer, not a
 * promise this app makes. `trialEligible` is the server's answer and only decides whether
 * the line may be *shown* — the store decides whether the offer is actually granted, and
 * the two agree because both are once per store account and once per person.
 *
 * The screen renders what it is given and hands taps back. It grants nothing: `onBuy`
 * finishes at the server, and the gate above it is what opens the app.
 *
 * Handles: `paywall-*`.
 */
type Props = {
  /** null while the store is still answering */
  offering: StoreOffering | null;
  trialEligible: boolean;
  /** the store answered nothing, or failed */
  unavailable: boolean;
  pending: boolean;
  error: string | null;
  onBuy: (plan: StorePackage["plan"]) => void;
  onRestore: () => void;
  onRetry: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
};

const C = STORE_COPY.paywall;

export function Paywall({
  offering,
  trialEligible,
  unavailable,
  pending,
  error,
  onBuy,
  onRestore,
  onRetry,
  onOpenTerms,
  onOpenPrivacy,
}: Props) {
  return (
    <ScrollView testID="paywall" className="flex-1 bg-canvas" contentContainerClassName="px-6 pt-20 pb-16">
      <Text testID="paywall-title" className="font-sans-bold text-display-2 text-ink">
        {C.title}
      </Text>
      <Text testID="paywall-body" className="mt-4 font-sans text-base text-ink-secondary">
        {C.body}
      </Text>

      {trialEligible ? (
        <Text testID="paywall-trial" className="mt-3 font-sans-medium text-base text-ink-brand">
          {C.trial}
        </Text>
      ) : null}

      {unavailable ? (
        <View testID="paywall-unavailable" className="mt-8 rounded-sheet border border-line bg-surface px-5 py-4">
          <Text className="font-sans-semibold text-base text-ink">{C.unavailableTitle}</Text>
          <Text className="mt-2 font-sans text-sm text-ink-secondary">{C.unavailableBody}</Text>
          <Button variant="card" className="mt-4" testID="paywall-retry" disabled={pending} onPress={onRetry}>
            {C.retry}
          </Button>
        </View>
      ) : offering === null ? (
        <View testID="paywall-loading" className="mt-10 items-center">
          <ActivityIndicator />
        </View>
      ) : (
        <View testID="paywall-plans" className="mt-8 gap-3">
          {offering.packages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              accessibilityRole="button"
              disabled={pending}
              onPress={() => onBuy(pkg.plan)}
              testID={`paywall-plan-${pkg.plan}`}
              className={cn(
                "flex-row items-baseline justify-between gap-3 rounded-sheet border border-line bg-surface px-5 py-4",
                pending && "opacity-60"
              )}
            >
              <View className="flex-1">
                <Text className="font-sans-semibold text-base text-ink">{C.plans[pkg.plan].name}</Text>
                <Text className="mt-1 font-sans text-sm text-ink-secondary">{C.plans[pkg.plan].note}</Text>
              </View>
              <Text testID={`paywall-price-${pkg.plan}`} className="font-sans-semibold text-base text-ink">
                {fill(C.price, { price: pkg.intro ? pkg.intro.priceString : pkg.priceString })}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {pending ? (
        <View testID="paywall-pending" className="mt-6 items-center">
          <ActivityIndicator />
        </View>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          testID="paywall-error"
          className="mt-4 text-center font-sans text-sm text-error"
        >
          {error}
        </Text>
      ) : null}

      <Button variant="ghost" className="mt-8" testID="paywall-restore" disabled={pending} onPress={onRestore}>
        {C.restore}
      </Button>

      <Text testID="paywall-legal" className="mt-8 text-center font-sans text-xs text-ink-tertiary">
        {C.legal}
      </Text>

      <View className="mt-4 flex-row justify-center gap-6">
        <Pressable accessibilityRole="link" testID="paywall-terms" onPress={onOpenTerms}>
          <Text className="font-sans text-xs text-ink-tertiary underline">{C.terms}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" testID="paywall-privacy" onPress={onOpenPrivacy}>
          <Text className="font-sans text-xs text-ink-tertiary underline">{C.privacy}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
