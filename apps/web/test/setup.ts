/** Gives component tests a browser-like DOM and the settings the app reads at load. */
import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:3000" });

process.env.NEXT_PUBLIC_NODUS_CONTRACT ??= "CD5YKQ3KJY7ICVFCPOBEXQZ4HJK6GETNAGZI3LEFOEOOT7L3NKQ3AXWC";
process.env.NEXT_PUBLIC_TOKEN_CONTRACT ??= "CADZMBHVXZTZA2Y3ESCULWLZ75YRICE66RPD75OZ7HWVYT7VWEKMSECI";

// Animations have nothing to assert on and the test DOM does not run them faithfully.
const { MotionGlobalConfig } = await import("motion/react");
MotionGlobalConfig.skipAnimations = true;

// Server modules refuse to load outside the server; under test there is no such boundary.
mock.module("server-only", () => ({}));
