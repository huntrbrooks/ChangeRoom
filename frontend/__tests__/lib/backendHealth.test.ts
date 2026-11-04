/** @jest-environment node */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { probeBackendHealth } from "@/lib/backendHealth";

describe("probeBackendHealth", () => {
  it.each(["fastapi-worker", "fastapi-render"])("accepts the expected JSON response from %s", async (stack) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({"content-type": "application/json; charset=utf-8", "x-changeroom-stack": stack}),
      text: async () => '{"message":"IGetDressed.Online API is running"}',
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

it.each([
  ["text/html", "", "<html><title>Sign in with Google</title></html>"],
  ["application/json", "fastapi-worker", "{not json"],
  ["application/json", "", '{"message":"IGetDressed.Online API is running"}'],
  ["application/json", "different-service", '{"message":"IGetDressed.Online API is running"}'],
  ["application/json", "fastapi-worker", '{"message":"ok"}'],
])("rejects a real 200 from an unexpected service (%s, %s)", async (type, stack, body) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, {"Content-Type":type, "X-ChangeRoom-Stack":stack});
    res.end(body);
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const result = await probeBackendHealth('http://127.0.0.1:'+port);
    expect(result).toMatchObject({ok:false,status:200});
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(()=>resolve()));
  }
});
