import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const triageCitizenReport = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        description: z.string().trim().min(1).max(2000),
        hazard: z.string().max(40),
        location: z.string().trim().min(1).max(200),
        image: z.string().startsWith("data:image/").max(3_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { triageReport } = await import("./triage.server");
    try {
      return { ok: true as const, triage: await triageReport(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const status = (e as { statusCode?: number })?.statusCode;
      const error =
        status === 402
          ? "AI credits are used up — the report was still sent for human review."
          : status === 429
            ? "AI is busy right now — the report was still sent for human review."
            : msg.includes("configured")
              ? "AI is not set up — the report was still sent for human review."
              : "AI analysis failed — the report was still sent for human review.";
      console.error("triage failed", status, msg);
      return { ok: false as const, error };
    }
  });
