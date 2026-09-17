# Quality gates

Run locally: `yarn test:e2e:validate` (from the product root) or `yarn validate` (from this package).

| Gate | Script | Enforces |
| --- | --- | --- |
| Elements catalog | `validate:elements` | YAML `locator`+`value`, allowlisted strategies, POM keys exist |
| Specs via POM | `validate:specs` | No `page.getBy*` / `page.locator` / `driver.$` in contract/smoke/regression specs |
| App contract | `yarn test:contract` | Unit siblings; contract journey spec per routed web screen |
| Hermetic API | `fixtures/web.ts` | Unmocked `/api` fails the test (unless `E2E_API_MODE=live`) |
| forbidOnly | Playwright config | No `test.only` on CI |

Judgment that a new case "looks like smoke" is still human review — gates cover structure.
