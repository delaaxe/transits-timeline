# Vendored dependencies

## ephemeris-astronomy.js

`ephemeris-astronomy@0.1.1` — Moshier ephemeris, MIT.
Upstream: https://github.com/Xch1998h/ephemeris-astronomy

Built from the npm tarball, not from a CDN:

    curl -L https://registry.npmjs.org/ephemeris-astronomy/-/ephemeris-astronomy-0.1.1.tgz -o eph.tgz
    # verify: openssl dgst -sha512 -binary eph.tgz | openssl base64 -A
    # must equal PyLEvg+423OS8XerDNNXJhFZR7qiMvSuD4N7autdC9eIaB2dFNw8t4Gwx0r3iPEKUTG3Dls2QjB1FN9C2DTv2Q==
    tar xzf eph.tgz && chmod -R u+rwX package
    npx esbuild@0.25.0 package/index.js --bundle --format=esm --platform=neutral --minify \
      --outfile=vendor/ephemeris-astronomy.js

The package is CommonJS; the bundle converts it to ESM with a default export.
Verified to produce bit-identical longitudes to the esm.sh build it replaced,
for all 12 bodies, and checked against JPL DE421 by `test/ephemeris.test.mjs`.

One local modification: a `// @ts-nocheck` line is prepended to keep
`npm run typecheck` off minified third-party output. Re-add it after a rebuild.
