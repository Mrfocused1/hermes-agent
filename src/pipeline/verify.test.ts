import { describe, it, expect, vi } from "vitest";
import { verifyAndRetry } from "./verify.js";

describe("verifyAndRetry", () => {
  it("returns ok on first successful build", async () => {
    const build = vi.fn().mockResolvedValue({ ok: true, log: "" });
    const fix = vi.fn();
    const r = await verifyAndRetry({ build, fix, maxRetries: 3 });
    expect(r.status).toBe("ok");
    expect(fix).not.toHaveBeenCalled();
  });

  it("fixes once then succeeds", async () => {
    const build = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, log: "err" })
      .mockResolvedValueOnce({ ok: true, log: "" });
    const fix = vi.fn().mockResolvedValue(undefined);
    const r = await verifyAndRetry({ build, fix, maxRetries: 3 });
    expect(r.status).toBe("ok");
    expect(fix).toHaveBeenCalledTimes(1);
  });

  it("escalates after exhausting retries", async () => {
    const build = vi.fn().mockResolvedValue({ ok: false, log: "boom" });
    const fix = vi.fn().mockResolvedValue(undefined);
    const r = await verifyAndRetry({ build, fix, maxRetries: 2 });
    expect(r.status).toBe("escalate");
    if (r.status === "escalate") expect(r.lastLog).toBe("boom");
    expect(fix).toHaveBeenCalledTimes(2);
  });
});
