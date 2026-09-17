/**
 * The origin the suite drives, decided in one place: the config, the fixture and the page
 * objects all read it. `BASE_URL` in the environment points a run at a server already
 * listening there; unset, Playwright starts `dev:client`, which serves on 5173.
 */
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
