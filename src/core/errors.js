// The message off a thrown value. It lives in core because the transit worker
// needs it too, and core is the one layer everything else is allowed to import.
//
// `catch (err)` hands over an unknown - anything at all can be thrown - so
// reaching straight for err.message is a guess that happens to be right for
// every throw in this app and would read "undefined" for any that was not.

/**
 * @param {unknown} err
 * @returns {string} err.message where there is one, and whatever the value
 *   prints as otherwise - never an empty string, so a caller can show it.
 */
export function errorMessage(err){
  const message = (err instanceof Error) ? err.message : "";
  return message || String(err);
}
