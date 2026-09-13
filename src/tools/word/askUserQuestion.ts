import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";

const askUserQuestion: ToolDefinition = {
  name: "ask_user_question",
  host: "both",
  description:
    "Present options to the user when you genuinely need their input to proceed. " +
    "Use this for ELICITATION — when you need to understand the user's preferences before acting. " +
    "The UI shows tappable options that let the user answer quickly without typing.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description:
                "The question to ask. Keep to 1-3 short sentences. Max 500 characters. " +
                "Plans and context belong in your chat message BEFORE this tool call — this field is just the question itself.",
            },
            header: {
              type: "string",
              description: "Short label for the question (e.g. 'Audience', 'Tone', 'Length'). Shows above the options.",
            },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Short option label (e.g. 'Executive', 'Informal', 'Formal')." },
                  description: { type: "string", description: "Brief explanation of what this option means." },
                },
                required: ["label", "description"],
              },
              description: "2-4 tappable options. Do NOT include 'Other' — the UI adds it automatically.",
            },
            multiSelect: {
              type: "boolean",
              description: "Allow selecting multiple options (default: false = single select).",
            },
          },
          required: ["question", "header", "options"],
        },
      },
    },
    required: ["questions"],
  },
};

toolRegistry.register(askUserQuestion, async (args) => {
  const questions = args.questions as Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect?: boolean;
  }> | undefined;

  if (!questions || questions.length === 0) {
    return JSON.stringify({ error: "questions array is required" });
  }

  return JSON.stringify({
    questions,
    _user_interaction: true,
  });
});
