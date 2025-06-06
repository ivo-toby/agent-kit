import { createAgent, createTool, type Tool } from "@inngest/agent-kit";
import {
  extractClassAndFnsTool,
  readFileTool,
  replaceClassMethodTool,
} from "../tools/tools";
import type { AgentState } from "../networks/codeWritingNetwork";

/**
 * the editingAgent is enabled once a plan has been written.  It disregards all conversation history
 * and uses the plan from the current network state to construct a system prompt to edit the given
 * files to resolve the input.
 */
export const editingAgent = createAgent<AgentState>({
  name: "Editor",
  description:
    "Edits code by replacing contents in files, or creating new files with new code.",
  tools: [
    extractClassAndFnsTool,
    replaceClassMethodTool,
    readFileTool,

    createTool({
      name: "done",
      description: "Saves the current project and finishes editing",
      handler: (_input, opts: Tool.Options<AgentState>) => {
        if (!opts.network) {
          return;
        }
        opts.network.state.data.done = true;
        return "Done editing";
      },
    }),
  ],
  lifecycle: {
    // The editing agent is only enabled once we have a plan.
    enabled: (opts) => {
      return opts.network?.state.data.plan !== undefined
    },

    // onStart is called when we start inference.  We want to update the history here to remove
    // things from the planning agent.  We update the system prompt to include details from the
    // plan via network state.
    onStart: ({ agent, prompt, network }) => {
      const history = (network?.state.results || [])
        .filter((i) => i.agentName === agent.name) // Return the current history from this agent only.
        .map((i) => i.output.concat(i.toolCalls)) // Only add the output and tool calls to the conversation history
        .flat();

      return { prompt, history, stop: false };
    },
  },

  system: ({ network }) => `
    You are an expert Python programmer working on a specific project: ${network?.state.data.repo}.  You have been
    given a plan to fix the given issue supplied by the user.

    The current plan is:
    <plan>
      ${JSON.stringify(network?.state.data.plan)}
    </plan>

    You MUST:
      - Understand the user's request
      - Understand the given plan
      - Write code using the tools available to fix the issue

    Once the files have been edited and you are confident in the updated code, you MUST finish your editing via calling the "done" tool.
  `,
});
