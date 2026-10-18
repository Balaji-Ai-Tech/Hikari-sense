import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submissionService } from "@/services/api";
import { CitizenSubmissionMedia, EvidencePreview, reportCoordinates } from "./CitizenReports";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("citizen evidence previews", () => {
  it("maps selected geolocation to the backend coordinate field names", () => {
    expect(reportCoordinates({ lat: 17.385, lng: 78.4867 })).toEqual({
      latitude: 17.385,
      longitude: 78.4867,
    });
    expect(reportCoordinates(null)).toEqual({});
  });

  it("loads an owned image through the authenticated media service", async () => {
    const mediaUrl = vi
      .spyOn(submissionService, "mediaUrl")
      .mockResolvedValue("blob:image-evidence");

    render(
      <CitizenSubmissionMedia
        media={{ key: "image-id", kind: "image", name: "synthetic.png", size: 64 }}
      />,
    );

    expect(await screen.findByAltText("Image evidence: synthetic.png")).toHaveAttribute(
      "src",
      "blob:image-evidence",
    );
    expect(mediaUrl).toHaveBeenCalledWith("image-id", "citizen");
  });

  it("renders a controllable video preview for uploaded and persisted evidence", async () => {
    const mediaUrl = vi
      .spyOn(submissionService, "mediaUrl")
      .mockResolvedValue("blob:video-evidence");

    render(
      <CitizenSubmissionMedia
        media={{ key: "video-id", kind: "video", name: "synthetic.webm", size: 128 }}
      />,
    );

    const video = await screen.findByLabelText("Video evidence: synthetic.webm");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("src", "blob:video-evidence");
    expect(mediaUrl).toHaveBeenCalledWith("video-id", "citizen");

    render(
      <EvidencePreview
        url="blob:local-video"
        kind="video"
        label="Preview synthetic.webm"
        className="aspect-video w-28"
      />,
    );
    expect(screen.getByLabelText("Preview synthetic.webm")).toHaveAttribute("controls");
  });
});
