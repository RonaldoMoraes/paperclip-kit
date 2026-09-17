#!/usr/bin/env bash
# Deterministic Android emulator loop for the Expo app under apps/mobile.
#
# Targets are semantic, never visual. Resolution order is exact `testID`
# (Android resource-id) -> exact accessibility label/text -> substring, and an
# ambiguous selector is refused rather than guessed. Tap coordinates always come
# from the matched element's live bounds, so the same command works on any AVD
# size or layout.
#
# Every value that identifies the app (bundle id, scheme, API origin) is read from
# the app's .env at call time — nothing here is hardcoded, so a build or env change
# cannot silently point the loop at the wrong app.
#
# Usage: android-loop.sh <command> [args]
#   preflight        report device, package, Metro, API origin — changes nothing
#   up               boot emulator if needed, reverse Metro, launch dev client, clear dev menu
#   ui [filter]      print every element with testID, label, state, and tap coordinates
#   tap <target>     tap the one unambiguous clickable element matching testID or label
#   wait <target> [s]  wait for a target to appear (default 20s), visible or not
#   xy <x> <y>       tap raw coordinates (last resort — never read them off a screenshot)
#   swipe <x1> <y1> <x2> <y2> [ms]
#   text <string>    type into the focused field
#   key <BACK|HOME|ENTER>
#   shot <path>      screenshot to <path>
#   rec <path> [s]   record the screen for s seconds (default 30) to <path>.mp4 — for flows
#   fg               print the foreground activity
#   logs [pattern]   tail app logcat
#   down [--force]   remove this loop's reverse; stop only an emulator this loop booted
#
# The app and its Metro:
#   MOBILE_DIR              the app's directory, relative to the repo root (default: apps/mobile)
#   METRO_PORT              the dev server's port (default: 8300, the base port; a worktree slot adds 10 × slot)
#
# Bring-up and teardown are the only machine-specific steps, so they are the
# only overridable ones:
#   ANDROID_LOOP_ENV_FILE   sourced before anything else (SDK paths, PATH, …)
#   ANDROID_LOOP_UP_CMD     replaces the default `emulator -avd` bring-up
#   ANDROID_LOOP_DOWN_CMD   replaces the default `adb emu kill` teardown
#   ANDROID_LOOP_AVD        AVD to boot (default: first of `emulator -list-avds`)
#   ANDROID_LOOP_SERIAL     pin a specific emulator when several are running
#   ANDROID_LOOP_EMULATOR_ARGS  extra flags for the default bring-up
#   ANDROID_LOOP_WINDOW=1   show the emulator window instead of running headless
#   ANDROID_LOOP_STATE_DIR  where emulator ownership state is kept
#   ANDROID_LOOP_NO_BOOT=1  never boot: the emulator belongs to someone else
#   ANDROID_LOOP_LOCK_FILE=/tmp/android-device-lock/device.lock  shared lock across profiles
#   ANDROID_LOOP_LOCK_WAIT  seconds to queue for the device before giving up (default 300)
set -euo pipefail

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
MOBILE_DIR="${MOBILE_DIR:-apps/mobile}"
case "$MOBILE_DIR" in
  /*) MOBILE="$MOBILE_DIR" ;;
  *) MOBILE="$REPO/$MOBILE_DIR" ;;
esac
ENV_FILE="$MOBILE/.env"
METRO_PORT="${METRO_PORT:-8300}"
STATE_DIR="${ANDROID_LOOP_STATE_DIR:-${TMPDIR:-/tmp}/android-loop-$(id -u)}"
STATE_FILE="$STATE_DIR/state"
# Deliberately outside STATE_DIR: every loop on this machine — this skill's and
# any other — contends for the same file, because they share one set of devices.
LOCK_FILE="${ANDROID_LOOP_LOCK_FILE:-/tmp/android-device-lock/device.lock}"
LOCK_WAIT="${ANDROID_LOOP_LOCK_WAIT:-300}"

if [[ -n ${ANDROID_LOOP_ENV_FILE:-} ]]; then
  [[ -f $ANDROID_LOOP_ENV_FILE ]] || { echo "error: ANDROID_LOOP_ENV_FILE not found: $ANDROID_LOOP_ENV_FILE" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$ANDROID_LOOP_ENV_FILE"
fi

die() { echo "error: $*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# One run drives Android at a time: two runs tapping one screen interleave into a
# session that reads as a bug in the app. The lock covers every device rather than
# one AVD, because two runs on two AVDs still share the host, the GPU and the Metro
# port. Only the commands that change the device take it — see the dispatch below.
hold_device_lock() {
  have flock || die "flock is required for the single-driver lock"
  local lock_dir
  lock_dir="$(dirname -- "$LOCK_FILE")"
  mkdir -p "$lock_dir" || die "cannot create shared device lock directory $lock_dir"
  if [[ "$LOCK_FILE" == "/tmp/android-device-lock/device.lock" ]]; then
    chgrp kvm "$lock_dir" 2>/dev/null || true
    chmod 2770 "$lock_dir" 2>/dev/null || true
  fi
  [[ -r "$lock_dir" && -w "$lock_dir" && -x "$lock_dir" ]] || die "shared device lock directory is not accessible: $lock_dir"
  local old_umask
  old_umask="$(umask)"
  umask 000
  if ! exec 9>>"$LOCK_FILE"; then
    umask "$old_umask"
    die "cannot open shared device lock $LOCK_FILE"
  fi
  umask "$old_umask"
  chmod 0660 "$LOCK_FILE" 2>/dev/null || true
  flock -w "$LOCK_WAIT" 9 \
    || die "another android-loop run has held the device for ${LOCK_WAIT}s — wait for it to finish, or raise ANDROID_LOOP_LOCK_WAIT"
}
have adb || die "adb not on PATH — install the Android SDK platform-tools, or point ANDROID_LOOP_ENV_FILE at a file that exports them"
have python3 || die "python3 not on PATH — it parses the uiautomator tree"

env_val() {
  # Last non-commented assignment wins, matching dotenv.
  [[ -f $ENV_FILE ]] || die "no .env at $ENV_FILE — copy .env.example and fill the identity block"
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r'
}

PKG="$(env_val MOBILE_BUNDLE_ID)"
SCHEME="$(env_val EXPO_PUBLIC_SCHEME)"
API_URL="$(env_val EXPO_PUBLIC_API_URL)"
[[ -n $PKG ]] || die "MOBILE_BUNDLE_ID unset in .env — cannot identify the dev client"
[[ -n $SCHEME ]] || die "EXPO_PUBLIC_SCHEME unset in .env"

running_serials() {
  adb devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1 }'
}

state_get() {
  [[ -f $STATE_FILE ]] || return 1
  sed -n "s/^$1=//p" "$STATE_FILE" | head -1
}

state_write() {
  mkdir -p "$STATE_DIR"
  printf 'serial=%s\nowned=%s\nreverse=1\npackage=%s\n' "$1" "$2" "$PKG" >"$STATE_FILE"
}

serial() {
  local pinned="${ANDROID_LOOP_SERIAL:-}"
  local saved; saved="$(state_get serial 2>/dev/null || true)"
  local serials=(); mapfile -t serials < <(running_serials)

  if [[ -n $pinned ]]; then
    printf '%s\n' "${serials[@]}" | grep -Fxq -- "$pinned" \
      || die "ANDROID_LOOP_SERIAL '$pinned' is not a ready emulator (ready: ${serials[*]:-none})"
    echo "$pinned"; return
  fi
  if [[ -n $saved ]] && printf '%s\n' "${serials[@]}" | grep -Fxq -- "$saved"; then
    echo "$saved"; return
  fi
  # Pinning is only required once the choice is real: one emulator is unambiguous.
  case "${#serials[@]}" in
    0) return 1 ;;
    1) echo "${serials[0]}" ;;
    *) die "several emulators are ready (${serials[*]}) — set ANDROID_LOOP_SERIAL to pick one" ;;
  esac
}

require_device() {
  local s; s="$(serial)" || die "no booted emulator — run: $0 up"
  [[ -n $s ]] || die "no booted emulator — run: $0 up"
  echo "$s"
}

dump_xml() {
  local s; s="$(require_device)"
  local remote="/sdcard/android-loop-ui-$$.xml"
  adb -s "$s" shell uiautomator dump "$remote" >/dev/null 2>&1 || true
  adb -s "$s" shell cat "$remote" 2>/dev/null
  adb -s "$s" shell rm -f "$remote" >/dev/null 2>&1 || true
}

# Parses the hierarchy into tab-separated
# "<x> <y> <testID> <label> <class> <clickable> <enabled> <selected>" rows.
# This is the whole reason the loop is repeatable: coordinates come from the
# tree, never from reading a screenshot.
parse_elements() {
  python3 -c '
import html, re, sys
import xml.etree.ElementTree as ET

raw = sys.stdin.read()
try:
    root = ET.fromstring(raw)
except ET.ParseError:
    raise SystemExit("could not parse the uiautomator XML — retry, the dump raced a render")

clean = lambda v: re.sub(r"[\t\r\n]+", " ", v).strip()
seen = set()
for node in root.iter("node"):
    a = node.attrib
    # React Native exposes testID as the accessibility view-id; some sources
    # prefix it with "<package>:id/", so keep only the leaf.
    resource_id = a.get("resource-id", "")
    test_id = resource_id.rsplit("/", 1)[-1] if resource_id else ""
    label = html.unescape(a.get("content-desc", "")) or html.unescape(a.get("text", ""))
    box = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", a.get("bounds", ""))
    if not box or (not test_id and not label):
        continue
    x1, y1, x2, y2 = map(int, box.groups())
    if x2 <= x1 or y2 <= y1:
        continue
    row = (
        (x1 + x2) // 2, (y1 + y2) // 2, clean(test_id), clean(label),
        clean(a.get("class", "")).rsplit(".", 1)[-1],
        a.get("clickable", "false"), a.get("enabled", "true"), a.get("selected", "false"),
    )
    if row in seen:
        continue
    seen.add(row)
    print("\t".join(map(str, row)))
'
}

# Exact testID, then exact label, then substring across both. More than one hit
# at the winning tier is an error: a wrong tap that looks like a pass is worse
# than a failure that names its candidates.
select_row() {
  local query="$1" clickable_only="${2:-true}" allow_ambiguous="${3:-false}"
  python3 -c '
import sys

query, clickable_only, allow_ambiguous = sys.argv[1].casefold(), sys.argv[2] == "true", sys.argv[3] == "true"
rows = [l.rstrip("\n").split("\t") for l in sys.stdin if l.strip()]
if clickable_only:
    rows = [r for r in rows if len(r) > 5 and r[5] == "true"]

exact = lambda i: [r for r in rows if len(r) > i and r[i].casefold() == query]
matches = exact(2) or exact(3) or [
    r for r in rows if any(query in r[i].casefold() for i in (2, 3) if len(r) > i)
]

if len(matches) > 1 and not allow_ambiguous:
    print(f"ambiguous target {sys.argv[1]!r} — {len(matches)} matches:", file=sys.stderr)
    for r in matches:
        print("  testID=%-36r label=%-36r %s" % (r[2] or "-", r[3] or "-", r[4]), file=sys.stderr)
    print("Give the control a <screen>-<element> testID and address it by that.", file=sys.stderr)
    raise SystemExit(2)
if not matches:
    raise SystemExit(1)
print("\t".join(matches[0]))
' "$query" "$clickable_only" "$allow_ambiguous"
}

cmd_preflight() {
  local s; s="$(serial 2>/dev/null || true)"
  echo "app dir        : $MOBILE"
  echo "package        : $PKG"
  echo "scheme         : $SCHEME"
  echo "API origin     : ${API_URL:-<unset — src/lib/config.ts defaults to http://10.0.2.2:3000>}"
  if [[ -z $s ]]; then
    echo "emulator       : NOT RUNNING (run: $0 up)"
    return 0
  fi
  echo "emulator       : $s"
  adb -s "$s" shell pm path "$PKG" >/dev/null 2>&1 \
    && echo "dev client     : installed" \
    || echo "dev client     : NOT INSTALLED — build and install it: yarn --cwd $MOBILE_DIR android"
  if curl -sf -o /dev/null "http://localhost:$METRO_PORT/status"; then
    echo "metro          : up on $METRO_PORT"
  else
    echo "metro          : DOWN — start with: yarn mobile:mock (or yarn mobile); METRO_PORT=$METRO_PORT"
  fi
  # `localhost` inside the emulator is the emulator itself: an origin naming it never
  # reaches the host, and every /api call fails as "offline".
  case "${API_URL:-}" in
    *://localhost*|*://127.0.0.1*)
      echo "warning        : EXPO_PUBLIC_API_URL names localhost — the emulator reaches the host as 10.0.2.2" ;;
  esac
}

boot_emulator() {
  # Where the emulator belongs to someone else — another account, another
  # session, a shared machine — this loop is a client and never starts one.
  [[ ${ANDROID_LOOP_NO_BOOT:-} == 1 ]] \
    && die "no booted emulator, and ANDROID_LOOP_NO_BOOT=1 — start one where the AVDs live, then run: $0 up"
  if [[ -n ${ANDROID_LOOP_UP_CMD:-} ]]; then
    echo "booting emulator via ANDROID_LOOP_UP_CMD..." >&2
    bash -c "$ANDROID_LOOP_UP_CMD" >&2 9>&-
    # The override only starts the process; readiness is still this loop's job.
    local i s
    for i in $(seq 1 90); do
      s="$(serial 2>/dev/null || true)"
      [[ -n $s && "$(adb -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && return
      sleep 2
    done
    die "ANDROID_LOOP_UP_CMD ran but no emulator finished booting within 180s"
  fi
  have emulator || die "emulator not on PATH — add \$ANDROID_HOME/emulator, or set ANDROID_LOOP_UP_CMD"
  local avd="${ANDROID_LOOP_AVD:-}"
  [[ -n $avd ]] || avd="$(emulator -list-avds 2>/dev/null | grep -v '^INFO' | head -1)"
  [[ -n $avd ]] || die "no AVD found — create one in Android Studio, or set ANDROID_LOOP_AVD"

  # One qemu per AVD: two on the same AVD deadlock silently.
  pgrep -fa "emulator.*-avd $avd\$|emulator.*-avd $avd " >/dev/null \
    && die "an emulator is already running for AVD '$avd' but adb does not list it — resolve that before booting another"

  local args=(-avd "$avd" -no-boot-anim -no-snapshot-save)
  # Headless GPU: ANGLE. The legacy SwiftShader GLES JIT (what -gpu auto/guest/
  # swiftshader_indirect resolve to without a window) segfaults the emulator.
  [[ ${ANDROID_LOOP_WINDOW:-} == 1 ]] || args+=(-no-window -no-audio -gpu swangle_indirect)
  # shellcheck disable=SC2206
  [[ -n ${ANDROID_LOOP_EMULATOR_ARGS:-} ]] && args+=(${ANDROID_LOOP_EMULATOR_ARGS})
  echo "booting AVD '$avd'..." >&2
  # 9>&- or the emulator inherits the lock fd and holds the device for its whole
  # life, so every command after this `up` would queue behind a boot that is done.
  nohup emulator "${args[@]}" >/dev/null 2>&1 9>&- &
  disown 2>/dev/null || true

  # Never `adb kill-server` while this is running: it orphans the registration.
  adb wait-for-device
  local i
  for i in $(seq 1 90); do
    [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && return
    sleep 2
  done
  die "AVD '$avd' did not finish booting within 180s"
}

cmd_up() {
  local owned=0
  if ! serial >/dev/null 2>&1; then
    boot_emulator
    owned=1
  fi
  local s; s="$(require_device)"
  # Re-running `up` against an emulator this loop booted must not disown it, or
  # `down` would leave it running.
  [[ "$(state_get serial 2>/dev/null || true)" == "$s" && "$(state_get owned 2>/dev/null || true)" == 1 ]] && owned=1

  # adb reverse is per-connection state: it does not survive an emulator restart,
  # so it is re-applied on every up rather than assumed.
  adb -s "$s" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
  curl -sf -o /dev/null "http://localhost:$METRO_PORT/status" \
    || die "Metro is not answering on $METRO_PORT — start it first: yarn mobile:mock (METRO_PORT=$METRO_PORT)"

  adb -s "$s" shell pm path "$PKG" >/dev/null 2>&1 \
    || die "$PKG is not installed — build and install the dev client: yarn --cwd $MOBILE_DIR android"

  local url="${SCHEME}://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${METRO_PORT}"
  adb -s "$s" shell am start -W -a android.intent.action.VIEW -d "$url" "$PKG" >/dev/null
  state_write "$s" "$owned"
  echo "launched $PKG against Metro:$METRO_PORT on $s (owned=$owned)"

  # First launch after an install shows the Expo dev-menu first-run sheet over the
  # app, then the menu itself. Screenshotting through it looks like a broken app.
  local i
  for i in $(seq 1 20); do
    sleep 2
    local rows; rows="$(dump_xml | parse_elements || true)"
    # Exact label only: the first-run sheet's button is "Continue", and an app screen
    # may carry a "Continue on the web" that a substring match would tap through.
    local hit; hit="$(select_row Continue false true <<<"$rows" 2>/dev/null | awk -F'\t' 'tolower($4)=="continue"' || true)"
    if [[ -n $hit ]]; then
      adb -s "$s" shell input tap "$(cut -f1 <<<"$hit")" "$(cut -f2 <<<"$hit")"
      sleep 2
      adb -s "$s" shell input keyevent KEYCODE_BACK
      sleep 2
      continue
    fi
    if [[ -n $rows ]]; then
      echo "app is up ($(wc -l <<<"$rows") elements on screen)"
      return 0
    fi
  done
  echo "warning: app did not present a readable UI within 40s — check Metro output" >&2
}

cmd_ui() {
  local rows; rows="$(dump_xml | parse_elements)"
  [[ -n ${1:-} ]] && rows="$(grep -Fai -- "$1" <<<"$rows" || true)"
  [[ -n $rows ]] || { echo "no matching elements" >&2; return 1; }
  { printf 'X\tY\tTESTID\tLABEL\tCLASS\tTAP\n'; awk -F'\t' '{printf "%s\t%s\t%s\t%s\t%s\t%s\n", $1, $2, ($3==""?"-":$3), ($4==""?"-":$4), $5, ($7=="false"?"disabled":($6=="true"?"yes":"-"))}' <<<"$rows"; } \
    | awk -F'\t' '{printf "%-6s %-6s %-36s %-34s %-18s %s\n", $1, $2, $3, $4, $5, $6}'
}

cmd_tap() {
  [[ -n ${1:-} ]] || die "tap needs a testID or accessibility label"
  local s; s="$(require_device)"
  local hit rc=0
  hit="$(dump_xml | parse_elements | select_row "$1" true false)" || rc=$?
  case "$rc" in
    0) ;;
    2) exit 2 ;;
    *) die "no clickable element matches '$1' — run: $0 ui" ;;
  esac
  local x y test_id label
  IFS=$'\t' read -r x y test_id label _ <<<"$hit"
  adb -s "$s" shell input tap "$x" "$y"
  echo "tapped ${test_id:-$label} at ($x,$y)"
}

# Waits on presence, not clickability: route roots and empty/error states are the
# things worth waiting for and they are not tappable.
cmd_wait() {
  [[ -n ${1:-} ]] || die "wait needs a testID or accessibility label"
  # Two statements: `local a=… b=$((…a…))` expands every word before assigning any,
  # so the arithmetic would read an unset `timeout` under `set -u`.
  local timeout="${2:-20}"
  local deadline=$((SECONDS + timeout))
  require_device >/dev/null
  while ((SECONDS < deadline)); do
    if dump_xml | parse_elements 2>/dev/null | select_row "$1" false true >/dev/null 2>&1; then
      echo "found $1"
      return 0
    fi
    sleep 1
  done
  die "timed out waiting for '$1' after ${timeout}s — run: $0 ui"
}

cmd_xy()    { local s; s="$(require_device)"; adb -s "$s" shell input tap "$1" "$2"; }
cmd_swipe() {
  [[ $# -ge 4 ]] || die "swipe needs x1 y1 x2 y2 [duration-ms]"
  local s; s="$(require_device)"
  adb -s "$s" shell input swipe "$1" "$2" "$3" "$4" "${5:-300}"
}
cmd_text() {
  # `input text` wants spaces as %s, and `adb shell` re-splits the argument on
  # the device side — escape both or everything after the first word is lost.
  local s; s="$(require_device)"
  local t="${1:?text needs a string}"
  t="${t// /%s}"
  adb -s "$s" shell input text "$(printf %q "$t")"
}
cmd_key()  { local s; s="$(require_device)"; adb -s "$s" shell input keyevent "KEYCODE_${1}"; }
cmd_fg()   { local s; s="$(require_device)"; adb -s "$s" shell dumpsys activity activities | grep -m1 topResumedActivity; }

cmd_shot() {
  local out="${1:?shot needs an output path}"
  local s; s="$(require_device)"
  mkdir -p "$(dirname -- "$out")"
  adb -s "$s" exec-out screencap -p > "$out"
  echo "$out"
}

cmd_rec() {
  local out="${1:?rec needs an output path}" secs="${2:-30}"
  local s; s="$(require_device)"
  mkdir -p "$(dirname -- "$out")"
  # screenrecord blocks for the whole window; drive the flow from another shell meanwhile.
  adb -s "$s" shell screenrecord --time-limit "$secs" /sdcard/android-loop.mp4
  adb -s "$s" pull /sdcard/android-loop.mp4 "$out" >/dev/null
  adb -s "$s" shell rm -f /sdcard/android-loop.mp4
  echo "$out"
}

cmd_logs() {
  local s; s="$(require_device)"
  local pid; pid="$(adb -s "$s" shell pidof "$PKG" | tr -d '\r')"
  [[ -n $pid ]] || die "$PKG is not running"
  if [[ -n ${1:-} ]]; then
    adb -s "$s" logcat --pid="$pid" | grep --line-buffered -E "$1"
  else
    adb -s "$s" logcat --pid="$pid"
  fi
}

cmd_down() {
  local force=0
  [[ ${1:-} == --force ]] && force=1
  if [[ -n ${ANDROID_LOOP_DOWN_CMD:-} ]]; then
    bash -c "$ANDROID_LOOP_DOWN_CMD" >&2 || true
    rm -f "$STATE_FILE"
  else
    local s owned
    s="$(state_get serial 2>/dev/null || true)"
    owned="$(state_get owned 2>/dev/null || true)"
    [[ -n $s ]] || s="$(serial 2>/dev/null || true)"
    if [[ -n $s ]]; then
      adb -s "$s" reverse --remove "tcp:$METRO_PORT" >/dev/null 2>&1 || true
      if [[ $owned == 1 || $force == 1 ]]; then
        adb -s "$s" emu kill >&2 2>/dev/null || true
        echo "stopped emulator $s"
      else
        echo "left emulator $s running — this loop did not boot it. Stop it with: $0 down --force"
      fi
    fi
    rm -f "$STATE_FILE"
  fi
  # Teardown audits nothing; qemu and JVMs outlive it.
  pgrep -fal 'qemu-system|emulator -avd' || echo "no emulator processes remain"
}

# Only the commands that change the device queue. The observers — preflight, ui,
# wait, shot, fg, and the two that run open-ended, rec and logs — never take the
# lock: `rec` is meant to run while another shell drives the flow, `logs` follows
# until interrupted, and either would hold the device for as long as it lived.
case "${1:-}" in
  up|tap|xy|swipe|text|key|down) hold_device_lock ;;
esac

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  up)        shift; cmd_up "$@" ;;
  ui)        shift; cmd_ui "${1:-}" ;;
  tap)       shift; cmd_tap "$@" ;;
  wait)      shift; cmd_wait "$@" ;;
  xy)        shift; cmd_xy "$@" ;;
  swipe)     shift; cmd_swipe "$@" ;;
  text)      shift; cmd_text "$@" ;;
  key)       shift; cmd_key "$@" ;;
  shot)      shift; cmd_shot "$@" ;;
  rec)       shift; cmd_rec "$@" ;;
  fg)        shift; cmd_fg "$@" ;;
  logs)      shift; cmd_logs "${1:-}" ;;
  down)      shift; cmd_down "$@" ;;
  *) sed -n '2,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
