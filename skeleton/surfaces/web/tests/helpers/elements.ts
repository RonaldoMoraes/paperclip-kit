import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(__dirname, "..");
const ELEMENTS_DIR = join(ROOT, "elements");

/** Catalog fronts — React Native shares one mobile surface (iOS + Android). */
export type Platform = "web" | "mobile";

export type ElementEntry = {
  locator: string;
  value: string;
};

/**
 * A key that exists on one platform only declares the other front as `none` rather than
 * omitting it — an omission reads as an oversight, and mirroring the id there would
 * point at a testid the other app does not have.
 */
export const NO_COUNTERPART = "none";

export type ElementFront = ElementEntry | typeof NO_COUNTERPART;

export type ElementCatalog = Record<string, Partial<Record<Platform, ElementFront>>>;

const WEB_STRATEGIES = new Set(["testid", "role", "text", "placeholder", "css", "label"]);
/** RN testID maps to Appium accessibility id; keep a few escapes for rare cases. */
const MOBILE_STRATEGIES = new Set(["testid", "accessibility id", "id", "xpath", "class name"]);

let catalogCache: ElementCatalog | null = null;

/** Every file under `elements/`, nested or not — the same walk the validate gate does. */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

/**
 * The catalogs are one flat namespace: every file's keys are merged, and a key declared
 * twice would let one screen's file silently decide another's locator. Two features
 * landing the same key have to rename, so the collision is raised here rather than
 * resolved by directory order.
 */
function loadCatalog(): ElementCatalog {
  if (catalogCache) return catalogCache;
  const merged: ElementCatalog = {};
  const owner = new Map<string, string>();
  for (const file of walk(ELEMENTS_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const doc = parseYaml(readFileSync(file, "utf8")) as ElementCatalog;
    for (const key of Object.keys(doc ?? {})) {
      const first = owner.get(key);
      if (first) throw new Error(`elements: "${key}" is declared in both ${first} and ${file}`);
      owner.set(key, file);
    }
    Object.assign(merged, doc);
  }
  catalogCache = merged;
  return merged;
}

/** Reset cache (tests / validate script). */
export function resetElementCatalogCache(): void {
  catalogCache = null;
}

export function getElementEntry(key: string, platform: Platform): ElementEntry {
  const catalog = loadCatalog();
  const front = catalog[key]?.[platform];
  if (front === NO_COUNTERPART) {
    throw new Error(`elements: "${key}" has no ${platform} counterpart`);
  }
  if (!front?.locator || !front?.value) {
    throw new Error(`elements: missing "${key}" for platform "${platform}"`);
  }
  if (platform === "web" && !WEB_STRATEGIES.has(front.locator)) {
    throw new Error(`elements: unsupported web locator "${front.locator}" for "${key}"`);
  }
  if (platform === "mobile" && !MOBILE_STRATEGIES.has(front.locator)) {
    throw new Error(`elements: unsupported mobile locator "${front.locator}" for "${key}"`);
  }
  return front;
}

export function getCatalog(): ElementCatalog {
  return loadCatalog();
}

export function allowedStrategies(platform: Platform): Set<string> {
  return platform === "web" ? WEB_STRATEGIES : MOBILE_STRATEGIES;
}

/** Resolve a catalog key to a Playwright Locator. */
export function webLocator(page: Page, key: string): Locator {
  const { locator, value } = getElementEntry(key, "web");
  switch (locator) {
    case "testid":
      return page.getByTestId(value);
    case "role": {
      const match = value.match(/^(\w+)(?:\[name=(.+)\])?$/);
      if (!match) throw new Error(`elements: bad role value "${value}" for "${key}"`);
      const role = match[1] as Parameters<Page["getByRole"]>[0];
      const name = match[2];
      return name ? page.getByRole(role, { name }) : page.getByRole(role);
    }
    case "text":
      return page.getByText(value);
    case "placeholder":
      return page.getByPlaceholder(value);
    case "label":
      return page.getByLabel(value);
    case "css":
      return page.locator(value);
    default:
      throw new Error(`elements: unhandled web strategy "${locator}"`);
  }
}

/**
 * Appium / WebdriverIO selector for a catalog key.
 * Same string for iOS and Android — RN `testID` is the accessibility id on both.
 */
export function mobileSelector(key: string): string {
  const { locator, value } = getElementEntry(key, "mobile");
  switch (locator) {
    case "testid":
    case "accessibility id":
      return `~${value}`;
    case "id":
      return `id=${value}`;
    case "xpath":
      return value;
    case "class name":
      return value;
    default:
      throw new Error(`elements: unhandled mobile strategy "${locator}"`);
  }
}
