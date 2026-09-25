import { cache } from "react";
import { loadAppData } from "./repository";

/** Per-request memoised app data so layout and page share one load. */
export const getAppData = cache(loadAppData);
