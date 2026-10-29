import assert from "node:assert/strict";
import test from "node:test";
import { buildOcrRequest } from "./index";

test("keeps an image URL as a URL", () => {
  const image = "https://cdn.example.com/receipt.png?token=1";
  const request = buildOcrRequest({ image, imageType: "url" });

  assert.equal(request.image, image);
  assert.equal(request.image_type, "url");
});

test("strips a data URL when sending base64", () => {
  const request = buildOcrRequest({
    image: "data:image/png;base64,iVBORw0KGgo=",
    imageType: "base64",
  });

  assert.equal(request.image, "iVBORw0KGgo=");
  assert.equal(request.image_type, "base64");
});

test("defaults to base64", () => {
  const request = buildOcrRequest({ image: "iVBORw0KGgo=" });

  assert.equal(request.image, "iVBORw0KGgo=");
  assert.equal(request.image_type, "base64");
});
