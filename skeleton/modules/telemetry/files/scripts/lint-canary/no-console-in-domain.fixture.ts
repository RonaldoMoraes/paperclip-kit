// Deliberate violation for the lint-guard canary: server code writing to the console.
export function shout(): void {
  console.log("hello");
}
