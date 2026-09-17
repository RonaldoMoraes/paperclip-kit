import { z } from "zod";

/**
 * The analytics event vocabulary — one discriminated union every layer shares. The apps
 * queue these (`queue.ts`), the server parses every batch with this same schema before it
 * stores one, and the store never sees a shape this file did not name.
 *
 * PHI-SAFE BY CONTRACT: closed enums, numbers, or `slug` ids only; never `z.string()` free
 * text. An event carries what happened and where — never what the user typed, answered,
 * scored or read. Every string field goes through `slug` below; a new field that needs
 * prose is a field that does not belong here.
 *
 * The seed vocabulary is the taxonomy `AGENTS.md` asks of every screen — success
 * (`action`), funnel (`funnel`), choice (`choice`), friction (`friction`) — plus the
 * automatic `screen-viewed`, acquisition and session, and the two data-rights moments. A
 * product adds a branch here and one line in `events.spec.ts`'s catalog; the union is the
 * one place the vocabulary exists.
 */

/** An identifier, not prose: lowercase kebab, bounded. The only string shape allowed in an event. */
export const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "a slug");
export type Slug = z.infer<typeof slug>;

/** How the visitor arrived — a channel class, never the referrer URL or the campaign string. */
export const ANALYTICS_SOURCES = ["direct", "ad", "email", "sms", "social", "referral", "unknown"] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

/** A flow's three moments: the user walked in, finished, or left before the end. */
export const FUNNEL_OUTCOMES = ["enter", "complete", "abandon"] as const;
export type FunnelOutcome = (typeof FUNNEL_OUTCOMES)[number];

/** The ways a screen pushed back: the user tried again, the form refused, the user backed out. */
export const FRICTION_KINDS = ["retry", "validation", "backout"] as const;
export type FrictionKind = (typeof FRICTION_KINDS)[number];

export const AnalyticsEvent = z.discriminatedUnion("type", [
  /** Acquisition channel, once per identifier landing. */
  z.object({ type: z.literal("source"), source: z.enum(ANALYTICS_SOURCES) }),
  /** A session's length in seconds. Counted and appended like everything else. */
  z.object({ type: z.literal("session"), durationInS: z.number().positive() }),
  /**
   * A screen on stage — automatic on both apps from the route's pattern
   * (`screen-slug.ts`), so the funnel has a spine before any feature adds an event.
   */
  z.object({ type: z.literal("screen-viewed"), screen: slug }),
  /** Success: the user did the thing the screen exists for. `action` names what, as an id. */
  z.object({ type: z.literal("action"), screen: slug, action: slug }),
  /** Funnel: a step of a named flow, and how it ended. */
  z.object({ type: z.literal("funnel"), flow: slug, step: slug, outcome: z.enum(FUNNEL_OUTCOMES) }),
  /** Choice: what the user decided, as the option's id — never its label. */
  z.object({ type: z.literal("choice"), screen: slug, choice: slug }),
  /** Friction: the screen pushed back, and how. */
  z.object({ type: z.literal("friction"), screen: slug, kind: z.enum(FRICTION_KINDS) }),
  /**
   * The user took their data. Bare on purpose: what the file holds is their whole record,
   * and any field describing it would be a measurement of that record in the pipeline.
   */
  z.object({ type: z.literal("data-exported") }),
  /**
   * The user left, and everything went. Bare for the same reason, and one more: the
   * event outlives the rows it is about, so anything on it would be the last surviving
   * copy of something they asked to have deleted.
   */
  z.object({ type: z.literal("account-deleted") }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;

export type AnalyticsEventType = AnalyticsEvent["type"];
