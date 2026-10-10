import { it, expect } from "vitest";
import { redact } from "@/lib/redact";
it("retains structured diagnostics while removing credentials, prompts, and signed URLs", () => {
  const result = redact(
    {
      status: "completed",
      request_id: "test-request",
      api_key: "TEST_SECRET",
      nested: {
        prompt: "Private client brief",
        images: [
          { url: "https://test.example/private/path?signature=TEST_SECRET" },
        ],
        debug: "Echo TEST_SECRET",
      },
    },
    ["TEST_SECRET"],
  );
  expect(result).toEqual({
    status: "completed",
    request_id: "test-request",
    api_key: "[redacted]",
    nested: {
      prompt: "[redacted]",
      images: [{ url: "https://test.example/[URL redacted]" }],
      debug: "Echo [redacted]",
    },
  });
});
