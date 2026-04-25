export function isDemoAuthEnabled(): boolean {
  return process.env.SPLITTABLE_ENABLE_DEV_AUTH?.trim().toLowerCase() === "true";
}
