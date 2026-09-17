import { useEffect, useState } from "react";
import { secondsUntil, sendCooldownEnd } from "@contracts/auth/send-cooldown";

type Cooldown = {
  /** Seconds until another code may be asked for; 0 when the buttons are the person's again. */
  remaining: number;
  /** Starts a full wait from now; whether one is owed is the caller's decision. */
  start: () => void;
};

/**
 * The wait, counted against the wall clock rather than by ticks: a browser throttles
 * timers in a background tab, and someone who switches to their mail to fetch the code
 * must come back to a wait that ran while they were gone, not one paused where they left.
 */
export function useSendCooldown(): Cooldown {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;

    const tick = () => {
      const left = secondsUntil(endsAt, Date.now());
      setRemaining(left);
      if (left === 0) setEndsAt(null);
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [endsAt]);

  return { remaining, start: () => setEndsAt(sendCooldownEnd(Date.now())) };
}
