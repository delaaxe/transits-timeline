// Where the transit worker lives. Development loads src/ directly, so the
// worker is the sibling source file; the build rewrites this name to the hashed
// worker it emits, which sits beside the bundle. Either way it is one file along
// from whatever is running, so one relative URL covers both.
const WORKER_FILE = "worker.js";

export const workerUrl = new URL(WORKER_FILE, import.meta.url);
