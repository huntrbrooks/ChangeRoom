import { probeBackendHealth } from "@/lib/backendHealth";

describe("probeBackendHealth", () => {
  it("returns healthy for a successful backend response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"message":"ok"}',
    });

    await expect(
      probeBackendHealth("https://changeroom.onrender.com", fetchMock as typeof fetch)
    ).resolves.toEqual({
      ok: true,
      message: null,
      status: 200,
    });
  });

  it("surfaces a suspended backend clearly", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "This service has been suspended.",
    });

    await expect(
      probeBackendHealth("https://changeroom.onrender.com", fetchMock as typeof fetch)
    ).resolves.toEqual({
      ok: false,
      message: "Try-on is unavailable because the backend host is suspended.",
      status: 503,
    });
  });

  it("reports network failures as unavailable", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      probeBackendHealth("https://changeroom.onrender.com", fetchMock as typeof fetch)
    ).resolves.toEqual({
      ok: false,
      message: "Try-on is unavailable because the backend could not be reached.",
      status: null,
    });
  });
});
