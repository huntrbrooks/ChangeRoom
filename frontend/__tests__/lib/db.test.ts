describe("database connection adapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    jest.dontMock("@vercel/postgres");
    process.env = originalEnv;
  });

  function mockVercelPostgres() {
    const createPool = jest.fn(() => ({
      sql: jest.fn(async () => ({ rows: [{ source: "pool" }] })),
      connect: jest.fn(async () => ({
        query: jest.fn(),
        sql: jest.fn(),
        release: jest.fn(),
      })),
    }));

    const createClient = jest.fn(() => ({
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query: jest.fn(async () => ({ rows: [] })),
      sql: jest.fn(async () => ({ rows: [{ source: "direct" }] })),
    }));

    jest.doMock("@vercel/postgres", () => ({
      createPool,
      createClient,
    }));

    return { createPool, createClient };
  }

  it("uses createClient when DATABASE_URL is a direct Neon connection string", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/db?sslmode=require";
    const postgres = mockVercelPostgres();

    const { sql } = await import("@/lib/db");
    const result = await sql`SELECT 1`;

    expect(result.rows).toEqual([{ source: "direct" }]);
    expect(postgres.createClient).toHaveBeenCalledWith({
      connectionString: process.env.DATABASE_URL,
    });
    expect(postgres.createPool).not.toHaveBeenCalled();
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(process.env.POSTGRES_URL_NON_POOLING).toBe(process.env.DATABASE_URL);
  });

  it("uses createPool when POSTGRES_URL is a pooled Neon connection string", async () => {
    process.env.POSTGRES_URL =
      "postgresql://user:pass@ep-example-pooler.us-east-1.aws.neon.tech/db?sslmode=require";
    const postgres = mockVercelPostgres();

    const { sql } = await import("@/lib/db");
    const result = await sql`SELECT 1`;

    expect(result.rows).toEqual([{ source: "pool" }]);
    expect(postgres.createPool).toHaveBeenCalledWith({
      connectionString: process.env.POSTGRES_URL,
    });
    expect(postgres.createClient).not.toHaveBeenCalled();
  });
});
