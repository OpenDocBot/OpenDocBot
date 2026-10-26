#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.resolve(
  ROOT,
  process.argv[2] || "public/third-party-notices.txt",
);

// The Office.js runtime is loaded from Microsoft at runtime. This npm package
// only provides TypeScript typings and is not part of the browser bundle.
const TYPE_ONLY = new Set(["@microsoft/office-js"]);

// Licenses we ship. Anything else fails the build so a new dependency cannot
// silently add a copyleft or unknown obligation.
const ALLOWED_LICENSES = [
  /^MIT$/,
  /^MIT-0$/,
  /^Apache-2\.0$/,
  /^ISC$/,
  /^BSD-2-Clause$/,
  /^BSD-3-Clause$/,
  /^OFL-1\.1$/,
  /^CC0-1\.0$/,
  /^BlueOak-1\.0\.0$/,
  /^\(MIT OR GPL-3\.0-or-later\)$/,
  /^\(MIT AND Zlib\)$/,
];

const LICENSE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)/i;

const MIT_TEXT = `MIT License

Copyright (c) {{author}}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeLicense(pkg, meta) {
  const raw =
    pkg.license ??
    (Array.isArray(pkg.licenses)
      ? pkg.licenses.map((entry) => entry.type ?? entry).join(" OR ")
      : pkg.licenses) ??
    meta.license ??
    "UNKNOWN";
  return typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
}

function authorName(pkg) {
  if (typeof pkg.author === "string") return pkg.author;
  if (pkg.author && typeof pkg.author.name === "string") return pkg.author.name;
  return "the package authors";
}

function repositoryUrl(pkg) {
  const url = pkg.repository?.url ?? pkg.homepage;
  if (!url) return `https://www.npmjs.com/package/${pkg.name}`;
  return String(url)
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}

function readLicenseFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => {
      if (!LICENSE_FILE.test(file)) return false;
      return fs.statSync(path.join(dir, file)).isFile();
    })
    .sort()
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(dir, file), "utf8").trim(),
    }))
    .filter(({ text }) => text.length > 0);
}

function assertAllowed(name, license) {
  if (ALLOWED_LICENSES.some((pattern) => pattern.test(license))) return;
  throw new Error(`Unsupported license for ${name}: ${license}`);
}

function main() {
  const lock = readJson(path.join(ROOT, "package-lock.json"));
  const rootPkg = readJson(path.join(ROOT, "package.json"));
  const entries = Object.entries(lock.packages ?? {}).filter(
    ([key, meta]) => key.startsWith("node_modules/") && !meta.dev,
  );

  const packages = [];
  const excluded = [];

  for (const [key, meta] of entries) {
    const dir = path.join(ROOT, key);
    let pkg;
    try {
      pkg = readJson(path.join(dir, "package.json"));
    } catch {
      continue;
    }

    const name = pkg.name ?? key.replace(/^node_modules\//, "");
    const license = normalizeLicense(pkg, meta);

    if (TYPE_ONLY.has(name)) {
      excluded.push(`${name}@${pkg.version ?? "?"} (typings only)`);
      continue;
    }
    if (pkg.os || pkg.cpu) {
      excluded.push(
        `${name}@${pkg.version ?? "?"} (platform-specific native package)`,
      );
      continue;
    }

    assertAllowed(name, license);

    let licenseFiles = readLicenseFiles(dir);
    if (licenseFiles.length === 0) {
      if (license !== "MIT") {
        throw new Error(
          `No license file found for ${name}@${pkg.version} (${license}).`,
        );
      }
      licenseFiles = [
        {
          file: "SPDX MIT",
          text: MIT_TEXT.replace("{{author}}", authorName(pkg)),
        },
      ];
    }

    packages.push({
      name,
      version: pkg.version ?? meta.version ?? "?",
      license,
      url: repositoryUrl(pkg),
      licenseFiles,
    });
  }

  packages.sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );

  const summary = new Map();
  for (const pkg of packages) {
    summary.set(pkg.license, (summary.get(pkg.license) ?? 0) + 1);
  }

  const lines = [];
  lines.push("OpenDocBot third-party notices");
  lines.push("==============================");
  lines.push("");
  lines.push(
    `Generated from the production dependency tree (package-lock.json) for OpenDocBot ${rootPkg.version}.`,
  );
  lines.push("Do not edit this file by hand. Regenerate it with: npm run notices");
  lines.push("");
  lines.push(
    "OpenDocBot itself is licensed under the fair-code license in LICENSE.",
  );
  lines.push("");
  lines.push("License summary");
  lines.push("---------------");
  for (const [license, count] of [...summary.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    lines.push(`${license}: ${count}`);
  }
  lines.push("");
  lines.push("Packages");
  lines.push("--------");
  for (const pkg of packages) {
    lines.push(`${pkg.name}@${pkg.version} (${pkg.license})`);
  }
  lines.push("");

  if (excluded.length) {
    lines.push("Not bundled or not shipped in the browser bundle");
    lines.push("-----------------------------------------------");
    for (const item of excluded.sort()) lines.push(item);
    lines.push("");
    lines.push(
      "Office.js runtime: https://appsforoffice.microsoft.com/lib/1/hosted/office.js",
    );
    lines.push(
      "The @microsoft/office-js npm package is used only for TypeScript typings.",
    );
    lines.push("");
  }

  lines.push("License texts");
  lines.push("-------------");
  for (const pkg of packages) {
    lines.push("");
    lines.push(`## ${pkg.name}@${pkg.version}`);
    lines.push(`License: ${pkg.license}`);
    lines.push(`Source: ${pkg.url}`);
    for (const { file, text } of pkg.licenseFiles) {
      lines.push("");
      lines.push(`### ${file}`);
      lines.push("");
      lines.push(text);
    }
    if (pkg.license === "(MIT OR GPL-3.0-or-later)") {
      lines.push("");
      lines.push(
        "Note: OpenDocBot uses the MIT option for this dual-licensed package.",
      );
    } else if (pkg.license === "(MIT AND Zlib)") {
      lines.push("");
      lines.push(
        "Note: this package includes both MIT and Zlib licensed components.",
      );
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${lines.join("\n").trim()}\n`, "utf8");
  console.log(
    `Wrote ${path.relative(ROOT, OUTPUT)} (${packages.length} packages, ${excluded.length} excluded).`,
  );
}

main();
