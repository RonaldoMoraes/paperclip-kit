import { Redirect } from "expo-router";
import { StatusBar, useColorScheme } from "react-native";
import { SOCIAL_PROVIDERS } from "@contracts/auth/errors";
import { useSignIn } from "~/features/account/hooks/useSignIn";
import { SignIn } from "~/features/account/screens/SignIn";
import { useSessionGate } from "~/lib/session";

/**
 * Sign-in, beside `index`: the route the session gate sends a launch without a session
 * to. Unguarded by the stack, so a person already signed in who lands here is walked
 * on to `index`, which turns the resolved gates into a destination.
 */
export default function SignInRoute() {
  const scheme = useColorScheme();
  const gate = useSessionGate();
  const flow = useSignIn();

  if (gate.ready && gate.allow) return <Redirect href="/" />;

  return (
    <>
      {/* The screen sits on `bg-canvas`, which follows the scheme — so the clock has to
          as well, or it disappears into the ground. */}
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <SignIn
        step={flow.step}
        pending={flow.pending}
        error={flow.error}
        nextCodeIn={flow.nextCodeIn}
        // every provider the server knows; a product without one drops it from this list
        providers={SOCIAL_PROVIDERS}
        onSocial={flow.signInWithSocial}
        onSendOtp={flow.sendOtp}
        onVerifyOtp={flow.verifyOtp}
        onChangeEmail={flow.reset}
      />
    </>
  );
}
