/**
 * Enable PPI-revealing debug information in logs
 */
export const DEBUG = process.env.DEBUG === "true";

/**
 * Don't actually make changes
 */
export const DRY_RUN = process.env.DRY_RUN === "true";

/**
 * Enable adding users to activity groups
 */
export const ACTIVITIES_ENABLED = process.env.ACTIVITIES_ENABLED === "true";
