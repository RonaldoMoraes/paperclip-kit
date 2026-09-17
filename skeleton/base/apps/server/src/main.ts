import "dotenv/config";
import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";
import { AppModule } from "./app.module";
import { KIT_RAW_BODY_PATHS } from "./app.modules.gen";
import { parseBodyExcept } from "./common/raw-body";

async function bootstrap(): Promise<void> {
  // Nest's own body parser is off so a signed webhook can keep the exact bytes its sender
  // hashed — `common/raw-body.ts` says why nothing else works. Every other path gets JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(parseBodyExcept(json(), KIT_RAW_BODY_PATHS));

  // /api answers are personal: no browser or proxy cache, ever. Assets keep their normal
  // caching; the only client-side cache is the query client's, not HTTP's.
  app.use((req: { path: string }, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // The built web app, when there is one: static files, then index.html for any non-API
  // path no file answered. Both are middleware and never routes — Express 5 runs
  // path-to-regexp v8, where a bare `*` pattern throws at startup — and both are skipped
  // when no bundle exists, so a server-only tree boots without a web surface.
  const clientDist = join(__dirname, "..", "..", "web", "dist");
  if (existsSync(clientDist)) {
    app.useStaticAssets(clientDist);
    app.use((req: { path: string }, res: { sendFile: (p: string) => void }, next: () => void) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(join(clientDist, "index.html"));
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[__PRODUCT_SLUG__] listening on port ${port}`);
}

bootstrap().catch(console.error);
