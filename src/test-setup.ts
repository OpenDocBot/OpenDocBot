import "@testing-library/jest-dom";
import { existsSync } from "node:fs";
import path from "node:path";

// Load local secrets (e.g. GEMINI_API_KEY for integration tests) without
// failing when the file is absent (CI, fresh checkout).
const envPath = path.join(process.cwd(), ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
