import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { KIT_MODULES } from "./app.modules.gen";
import { ApiErrorFilter } from "./common/api-error.filter";
import { PortsModule } from "./common/ports/ports.module";
import { ExampleModule } from "./example/example.module";
import { HealthModule } from "./health/health.module";

@Module({
  // PortsModule first: it is global, and every module after it may inject a port. The
  // opted-in modules come from the generated list, never from an edit here.
  imports: [PortsModule, ...KIT_MODULES, HealthModule, ExampleModule],
  // The app's only global exception filter. Nest stops at the first `@Catch()` that
  // matches, so a second one would never run: `ApiErrorFilter` reports the unexpected
  // through the telemetry port itself and answers in the envelope.
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}
