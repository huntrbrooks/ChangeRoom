import "./setup-postgres-env";
import {
  createClient,
  createPool,
  type QueryResult,
  type QueryResultRow,
  type VercelClient,
  type VercelPool,
  type VercelPoolClient,
} from "@vercel/postgres";

type SqlValue = string | number | boolean | null | undefined;
type SqlValues = SqlValue[];

type SqlTag = {
  <O extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: SqlValues
  ): Promise<QueryResult<O>>;
  connect: () => Promise<VercelPoolClient | DirectSqlClient>;
};

type DirectSqlClient = Pick<VercelClient, "query" | "sql"> & {
  release: () => Promise<void>;
};

type ConnectionMode = "pool" | "direct";

let pool: VercelPool | null = null;
let poolConnectionString: string | null = null;

const normalizeConnectionString = (value: string | undefined): string | undefined =>
  value && value !== "undefined" ? value : undefined;

const isLocalhostConnectionString = (connectionString: string): boolean => {
  try {
    return new URL(connectionString.replace(/^postgresql:\/\//, "https://")).hostname === "localhost";
  } catch {
    return false;
  }
};

const isPooledConnectionString = (connectionString: string): boolean =>
  connectionString.includes("-pooler.");

const isPoolCompatibleConnectionString = (connectionString: string): boolean =>
  isLocalhostConnectionString(connectionString) || isPooledConnectionString(connectionString);

const getConnectionCandidates = (): string[] =>
  [
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ].flatMap((value) => {
    const normalized = normalizeConnectionString(value);
    return normalized ? [normalized] : [];
  });

const getConnectionPlan = (): { mode: ConnectionMode; connectionString: string } => {
  const candidates = getConnectionCandidates();
  const pooled = candidates.find(isPoolCompatibleConnectionString);
  if (pooled) {
    return { mode: "pool", connectionString: pooled };
  }

  const direct = candidates[0];
  if (direct) {
    return { mode: "direct", connectionString: direct };
  }

  throw new Error(
    "Missing database connection string. Set POSTGRES_URL for pooled connections or DATABASE_URL/POSTGRES_URL_NON_POOLING for direct connections."
  );
};

const getPool = (connectionString: string): VercelPool => {
  if (!pool || poolConnectionString !== connectionString) {
    pool = createPool({ connectionString });
    poolConnectionString = connectionString;
  }
  return pool;
};

const queryDirect = async <O extends QueryResultRow = QueryResultRow>(
  connectionString: string,
  strings: TemplateStringsArray,
  values: SqlValues
): Promise<QueryResult<O>> => {
  const client = createClient({ connectionString });
  await client.connect();
  try {
    return await client.sql<O>(strings, ...values);
  } finally {
    await client.end();
  }
};

const connectDirect = async (connectionString: string): Promise<DirectSqlClient> => {
  const client = createClient({ connectionString });
  await client.connect();

  return {
    query: client.query.bind(client),
    sql: client.sql.bind(client),
    release: async () => {
      await client.end().catch((error: unknown) => {
        console.error("Failed to close direct database connection:", error);
      });
    },
  };
};

const sqlTag = (async <O extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: SqlValues
): Promise<QueryResult<O>> => {
  const plan = getConnectionPlan();
  if (plan.mode === "pool") {
    return getPool(plan.connectionString).sql<O>(strings, ...values);
  }

  return queryDirect<O>(plan.connectionString, strings, values);
}) as SqlTag;

sqlTag.connect = async () => {
  const plan = getConnectionPlan();
  if (plan.mode === "pool") {
    return getPool(plan.connectionString).connect();
  }

  return connectDirect(plan.connectionString);
};

export const sql = sqlTag;
