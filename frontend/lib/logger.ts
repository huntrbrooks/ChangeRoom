type LogFields = Record<string, unknown>;

function normalizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;

  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (value instanceof Error) {
        return [
          key,
          {
            name: value.name,
            message: value.message,
            stack: value.stack,
          },
        ];
      }
      return [key, value];
    })
  );
}

export const logger = {
  info(message: string, fields?: LogFields) {
    const normalized = normalizeFields(fields);
    if (normalized) {
      console.info(message, normalized);
      return;
    }
    console.info(message);
  },
  warn(message: string, fields?: LogFields) {
    const normalized = normalizeFields(fields);
    if (normalized) {
      console.warn(message, normalized);
      return;
    }
    console.warn(message);
  },
  error(message: string, fields?: LogFields) {
    const normalized = normalizeFields(fields);
    if (normalized) {
      console.error(message, normalized);
      return;
    }
    console.error(message);
  },
};
