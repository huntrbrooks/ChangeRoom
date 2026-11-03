import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BrandPitchPrototype } from "@/app/components/BrandPitchPrototype";

test("the pitch room recommends a size without asking for photos and sends photo try-ons to the studio", async () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      catalog: { brandName: "Demo", brandSlug: "demo", products: [{
        id: "top", title: "Cotton top", images: ["/catalog.jpg"], variants: [], sizeSystem: "AU",
      }] },
      dashboard: { brandName: "Demo", productsImported: 1, importedAt: "2026-01-01",
        recentSessions: [], metadataAlerts: [] },
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation: {
      recommendedSizeLabel: "AU 10", confidence: "medium", alternateSizes: [], reasoning: "Matches the size chart.",
    } }) });
  global.fetch = mockFetch;
  try {
    const { container } = render(<BrandPitchPrototype />);
    fireEvent.click(await screen.findByRole("button", { name: /cotton top/i }));
    expect(container.querySelector('input[type="file"][accept*="image"]')).toBeNull();
    expect(screen.getByRole("link", { name: /open the changeroom studio/i })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: /get fit recommendation/i }));
    expect(await screen.findByText("Matches the size chart.")).toBeInTheDocument();
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual(["/api/pitch/catalog", "/api/pitch/recommend"]);
  } finally {
    global.fetch = originalFetch;
  }
});
