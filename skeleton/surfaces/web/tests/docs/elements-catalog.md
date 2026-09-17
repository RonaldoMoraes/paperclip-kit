# Elements catalog

One YAML file per screen under `elements/` (plus `shared.yaml` for locators used across
screens). Each key is semantic; **two fronts only** — `web` and `mobile`.

```yaml
# elements/example.yaml
example_detail_toggle:
  web:
    locator: testid
    value: example-detail-toggle
  mobile:
    locator: testid
    value: example-detail-toggle
```

Both fronts are required. A key that exists on one platform only declares the other as
`none` — an omission reads as an oversight, and mirroring the id there would point at a
testid the other app does not have. Asking for a `none` front throws.

```yaml
top_bar:
  web:
    locator: testid
    value: top-bar
  mobile: none
```

| File | Screen / scope |
| --- | --- |
| `shared.yaml` | Cross-screen (`wordmark`, the route error's retry) |
| `shell.yaml` | The shell — tab bar, top bar, the pills |
| `example.yaml` | The example list and item |
| `settings.yaml` | Settings |

Only the static spine lives in the catalog. A row's testid is built by the page object from
the same prefix the screen uses (`example-list-row-<id>`), so a per-row key is never listed.

## Web strategies

`testid` | `role` | `text` | `placeholder` | `css` | `label`

Prefer `testid` (i18n-safe). `text`, `placeholder` and `label` couple the suite to copy and
the testing contract refuses them; `css` is for a prefix match over many rows, never for one.

## Mobile strategies

`testid` (preferred — RN `testID` → Appium accessibility id) | `accessibility id` | `id` | `xpath` | `class name`

No separate `ios` / `android` blocks.

## Usage

Web POMs (`pages/web/`) call `webLocator(page, "example_detail_toggle")`.
Mobile POMs (`pages/mobile/`) call `mobileSelector("example_detail_toggle")`.
Specs never hardcode selectors.
