import type { z } from "zod";
import { friendlyError } from "./errors";

/** Validate action input and surface a readable message instead of a JSON issue list. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(friendlyError(result.error));
  return result.data as z.output<T>;
}
