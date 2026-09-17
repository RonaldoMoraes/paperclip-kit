import { Module } from "@nestjs/common";
import { MOCK_ITEMS } from "@contracts/example/mock-library";
import { ExampleController } from "./example.controller";
import { MemoryExampleStore } from "./example.store.memory";
import { EXAMPLE_STORE } from "./example.types";

/**
 * Wiring only. The store is built in the factory and nowhere else, seeded from the
 * contract's fixture; a database-backed store replaces this one provider and the
 * controller and service never learn of it.
 */
@Module({
  controllers: [ExampleController],
  providers: [{ provide: EXAMPLE_STORE, useFactory: (): MemoryExampleStore => new MemoryExampleStore(MOCK_ITEMS) }],
})
export class ExampleModule {}
