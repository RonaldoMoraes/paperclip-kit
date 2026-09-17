// Deliberate violation: an EXPO_PUBLIC_* read outside the four files that own them.
export const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
