// api-key.js is gitignored, so a fresh clone has no copy and `npm run typecheck`
// could not resolve the import in src/services/places.js. This declares the
// shape instead, which is all the checker needs: the real file is still what
// the browser and the bundler load, and the two cannot drift - there is only
// one export, and it is a string either way.
export const awsApiKey: string;
