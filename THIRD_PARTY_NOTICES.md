# Third-party notices

OpenDocBot's browser bundle includes third-party open-source software.

The full, generated notices are served at
https://opendocbot.com/third-party-notices.txt. They are generated at build
time by `scripts/build-notices.mjs` from the production dependency tree in
`package-lock.json`, and Vite copies them to the deployed bundle at
`/third-party-notices.txt`.

Run `npm run notices` to regenerate the file locally. The generated file is not
committed.

The Office.js runtime is loaded from Microsoft at runtime, not bundled. The
`@microsoft/office-js` npm package is used only for TypeScript typings.
