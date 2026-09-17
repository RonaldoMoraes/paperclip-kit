export type TestPlatform = "ios" | "android" | "web";

const DEFAULT_PLATFORM: TestPlatform = "ios";

let current: TestPlatform = DEFAULT_PLATFORM;

export function setTestPlatform(os: TestPlatform): void {
  current = os;
}

export function getTestPlatform(): TestPlatform {
  return current;
}

export function resetTestPlatform(): void {
  current = DEFAULT_PLATFORM;
}
