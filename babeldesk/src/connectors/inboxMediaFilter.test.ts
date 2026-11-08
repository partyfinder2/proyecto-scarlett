import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInboxTempOrFragment, shouldIndexInboxFile } from "./inboxMediaFilter";

describe("inboxMediaFilter", () => {
  it("detecta fragmentos yt-dlp .f399.mp4", () => {
    assert.equal(
      isInboxTempOrFragment("C:/Inbox/youtube-foo-20261001.f399.mp4"),
      true
    );
    assert.equal(isInboxTempOrFragment("C:/Inbox/youtube-foo-20261001.mp4"), false);
  });

  it("detecta temporales watermark y .part", () => {
    assert.equal(isInboxTempOrFragment("clip.__nowm.0.mp4"), true);
    assert.equal(isInboxTempOrFragment("video.mp4.part"), true);
    assert.equal(isInboxTempOrFragment("foo.delogo-3.mp4"), true);
  });
});

describe("shouldIndexInboxFile", () => {
  it("rechaza fragmentos por nombre", () => {
    assert.equal(shouldIndexInboxFile("C:/Inbox/x.f399.mp4"), false);
  });
});
