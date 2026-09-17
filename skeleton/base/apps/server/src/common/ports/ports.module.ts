import { Global, type InjectionToken, Module, type Provider } from "@nestjs/common";
import { KIT_PORTS } from "../../app.modules.gen";

/**
 * The token a provider binds, in every shape Nest's `Provider` allows: the engine emits
 * `{ provide, useFactory | useValue | useClass }` objects today, and a bare class is its own token.
 */
const tokenOf = (provider: Provider): InjectionToken => (typeof provider === "function" ? provider : provider.provide);

/**
 * What `PortsModule` exports — derived from the providers, never a hand-kept list. A port that is
 * provided and not exported is instantiated and invisible to every other module, and Nest says so
 * only at boot (`can't resolve … at index [n]`), in whichever tree first claims it.
 */
export const portTokens = (providers: readonly Provider[]): InjectionToken[] => providers.map(tokenOf);

/**
 * The ports, bound once for the whole app.
 *
 * Global, so a feature module injects a port without importing anything — and so the
 * filter, which Nest builds outside any feature module, can too. The providers come from
 * the generated list: a module that claims a port replaces the console default there, and
 * two providers for one token can never both be registered.
 *
 * Base's three are not the whole list: any module may DECLARE a port (`server.portDefaults`) for
 * another to claim, and its provider arrives in `KIT_PORTS` like any other — which is why the
 * exports are computed from that list rather than written out here.
 */
@Global()
@Module({
  providers: KIT_PORTS,
  exports: portTokens(KIT_PORTS),
})
export class PortsModule {}
