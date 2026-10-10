// Notification animations are Lottie JSON files dropped into the `src/`
// folder. Instead of a hardcoded registry, the list is fetched at runtime
// from the server (`GET /api/notification-animations`), which scans `src/`
// directly — so adding a new `.json` file to `src/` makes it available in
// the admin "Notification Animation" picker with no code changes.

export interface NotificationAnimationOption {
  key: string;
  filename: string;
  label: string;
}

export const DEFAULT_NOTIFICATION_ANIMATION_KEY = "notification-alert";

let cachedOptions: NotificationAnimationOption[] | null = null;
let inFlight: Promise<NotificationAnimationOption[]> | null = null;

/**
 * Fetch the list of available notification animations from the server.
 * Results are cached for the lifetime of the page; pass `force: true` to
 * re-fetch (e.g. if the user expects newly-added files to show up).
 */
export const loadAvailableAnimations = async (
  force = false,
): Promise<NotificationAnimationOption[]> => {
  if (cachedOptions && !force) return cachedOptions;
  if (inFlight && !force) return inFlight;

  inFlight = fetch("/api/notification-animations")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load animations");
      return res.json();
    })
    .then((data: NotificationAnimationOption[]) => {
      cachedOptions = Array.isArray(data) ? data : [];
      return cachedOptions;
    })
    .catch(() => {
      cachedOptions = [];
      return cachedOptions;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * Fetch the actual Lottie JSON data for a given animation key (filename
 * without extension).
 */
export const loadAnimationData = async (key: string): Promise<any> => {
  const res = await fetch(`/api/notification-animations/${key}.json`);
  if (!res.ok) throw new Error("Failed to load animation data");
  return res.json();
};

export const getDefaultAnimationOption = (
  options: NotificationAnimationOption[],
): NotificationAnimationOption | undefined => {
  return (
    options.find((opt) => opt.key === DEFAULT_NOTIFICATION_ANIMATION_KEY) ||
    options[0]
  );
};
