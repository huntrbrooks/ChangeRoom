/** @jest-environment node */
import { POST } from "@/app/api/pitch/try-on/route";

test("an old demo upload is rejected without inspecting the request or contacting a provider", async () => {
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
    throw new Error("Unexpected network call");
  });
  try {
    const request = new Proxy({} as Request, {
      get() { throw new Error("Unexpected access to the demo upload or its credentials"); },
    });
    const post: (req: Request) => Response | Promise<Response> = POST;
    const response = await post(request);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: "pitch_try_on_retired", studioUrl: "/" });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
