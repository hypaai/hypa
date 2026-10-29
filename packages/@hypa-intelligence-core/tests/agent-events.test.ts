import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAgentEvent, stepsFromTrace, type AgentReply } from "../src/agent-stream";

const empty = (): AgentReply => ({ content: "", status: "pending" });

describe("applyAgentEvent", () => {
  it("appends deltas and finishes from done", () => {
    let message = empty();
    message = { ...message, ...applyAgentEvent(message, { type: "delta", text: "Hello " }) };
    message = {
      ...message,
      ...applyAgentEvent(message, {
        type: "done",
        action: "replace",
        text: "Hello there",
        speak: false,
        audioUrl: "data:audio/wav;base64,AAAA",
      }),
    };
    assert.equal(message.content, "Hello there");
    assert.equal(message.status, "success");
    assert.equal(message.action, "replace");
    assert.equal(message.audioUrl, "data:audio/wav;base64,AAAA");
  });

  it("tracks a step from call to result with the model that ran", () => {
    let message = empty();
    message = {
      ...message,
      ...applyAgentEvent(message, { type: "tool_call", id: "a", name: "translate_message", args: {} }, 100),
    };
    assert.equal(message.activity, "Translating");
    message = {
      ...message,
      ...applyAgentEvent(
        message,
        { type: "tool_result", id: "a", name: "translate_message", ok: true, provider: "google", model: "gemini-3.5-flash" },
        350,
      ),
    };
    assert.deepEqual(
      message.steps?.map((step) => [step.status, step.provider, step.model, step.ms]),
      [["ok", "google", "gemini-3.5-flash", 250]],
    );
  });

  it("shows a failed tool once and hides the finish tool", () => {
    let message = empty();
    for (let i = 0; i < 2; i += 1) {
      message = {
        ...message,
        ...applyAgentEvent(message, { type: "tool_result", id: "x", name: "text_to_speech", ok: false, error: "no voice" }),
      };
    }
    assert.deepEqual(message.failedTools, ["Couldn't create the audio."]);
    assert.deepEqual(applyAgentEvent(message, { type: "tool_call", id: "f", name: "finish", args: {} }), {});
  });

  it("explains a budget stop", () => {
    const update = applyAgentEvent(empty(), { type: "error", code: "budget_exceeded", message: "x" });
    assert.match(String(update.content), /limit/);
  });

  it("rebuilds steps from a saved trace", () => {
    const rebuilt = stepsFromTrace([
      { type: "tool_call", id: "a", name: "look_up_term", args: {} },
      { type: "tool_result", id: "a", name: "look_up_term", ok: false, error: "down" },
      { type: "delta", text: "ignored" },
    ]);
    assert.equal(rebuilt.steps?.[0].status, "failed");
    assert.deepEqual(rebuilt.failedTools, ["Couldn't look up the word."]);
  });
});
