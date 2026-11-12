import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { paypalConfigFromEnv } from "./rest";

type Actions = ConstructorParameters<typeof PayPalAgentToolkit>[0]["configuration"]["actions"];

/**
 * PayPal Agent Toolkit, pinned to the sandbox. The toolkit defaults to LIVE
 * when context.sandbox is missing, so never construct it anywhere else.
 */
export function paypalToolkit(actions: Actions): PayPalAgentToolkit {
  const { clientId, clientSecret } = paypalConfigFromEnv();
  return new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions, context: { sandbox: true } },
  });
}
