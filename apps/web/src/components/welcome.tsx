"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { explain } from "@/lib/actions";
import { SOFTWARE_PASSKEYS } from "@/lib/config";
import { useSession } from "@/lib/session";
import { examplePasskey, softwarePasskeys } from "@/lib/software-passkey";
import { Benefits } from "./landing/benefits";
import { Closing } from "./landing/closing";
import { Demonstration } from "./landing/demonstration";
import { Faq } from "./landing/faq";
import { LandingFooter } from "./landing/footer";
import { Hero } from "./landing/hero";
import { HowItWorks } from "./landing/how-it-works";
import { LandingNav } from "./landing/nav";
import { Tangle } from "./landing/tangle";
import { Trust } from "./landing/trust";

/** What someone without a session sees: what Nodus is, and how to get in. */
export function Welcome() {
  const session = useSession();
  const create = useMutation({ mutationFn: (name: string) => session.create(name) });
  const enter = useMutation({ mutationFn: (credentialId?: string) => session.enter(credentialId) });
  const tryExample = useMutation({ mutationFn: () => session.tryExample() });
  const problem = create.error ?? enter.error ?? tryExample.error;

  // This screen only renders in the browser, once the session is known, so storage is there.
  const [testPasskeys] = useState(() => (SOFTWARE_PASSKEYS ? softwarePasskeys() : null));
  const [keptExample] = useState(() => examplePasskey() !== undefined);

  return (
    <WelcomeScreen
      onCreate={create.mutate}
      creating={create.isPending}
      onEnter={enter.mutate}
      entering={enter.isPending ? (enter.variables ?? true) : false}
      problem={problem ? explain(problem) : null}
      testPasskeys={testPasskeys}
      onTryExample={tryExample.mutate}
      tryingExample={tryExample.isPending}
      keptExample={keptExample}
    />
  );
}

interface ScreenProps {
  onCreate: (name: string) => void;
  creating: boolean;
  onEnter: (credentialId?: string) => void;
  /** The test passkey being entered with, or true while entering with a device passkey. */
  entering: string | boolean;
  problem: string | null;
  /** The keys kept in this browser instead of device passkeys, when the app runs that way. */
  testPasskeys: Array<{ credentialId: string; name: string }> | null;
  /** Enters an example business, made up for trying the app without bringing anyone along. */
  onTryExample: () => void;
  tryingExample: boolean;
  /** Whether this browser was already handed an example business, to go back to it. */
  keptExample: boolean;
}

/**
 * The landing page: the way in at the top, beside the product playing, and
 * below it the problem, the steps, what changes, why Stellar, the questions
 * and a last call. The sections live in `./landing`.
 */
export function WelcomeScreen(props: ScreenProps) {
  const { onEnter, entering, creating, testPasskeys, tryingExample } = props;
  return (
    <div className="flex min-h-screen flex-col">
      <LandingNav
        onEnter={() => onEnter(undefined)}
        entering={entering === true}
        busy={creating || entering !== false || tryingExample}
        testMode={testPasskeys !== null}
      />
      <main className="flex-1">
        <Hero {...props} demo={<Demonstration />} />
        <Tangle />
        <HowItWorks />
        <Benefits />
        <Trust />
        <Faq />
        <Closing />
      </main>
      <LandingFooter />
    </div>
  );
}
