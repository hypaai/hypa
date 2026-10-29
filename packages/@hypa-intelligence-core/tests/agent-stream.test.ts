import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSseParser, isVisibleTool, toolLabels } from "../src/agent-stream";

describe("agent stream", () => {
  it("parses data frames split across chunks", () => {
    const seen: string[] = [];
    const parser = createSseParser((data) => seen.push(data));
    parser.push('data: {"type":"del');
    parser.push('ta","text":"Hi"}\n\ndata: {"type":"done"');
    parser.push(',"text":"Hi"}\n\n');
    parser.end();
    assert.deepEqual(seen.map((item) => JSON.parse(item).type), ["delta", "done"]);
  });

  it("flushes a last frame without a trailing blank line", () => {
    const seen: string[] = [];
    const parser = createSseParser((data) => seen.push(data));
    parser.push('data: {"type":"done"}');
    parser.end();
    assert.equal(seen.length, 1);
  });

  it("gives one short label per tool and hides finish", () => {
    assert.equal(toolLabels("text_to_speech").failed, "Couldn't create the audio.");
    assert.equal(toolLabels("unknown").running, "Using a tool");
    assert.equal(isVisibleTool("finish"), false);
  });
});
