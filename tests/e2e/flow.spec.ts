import { expect, test } from "@playwright/test";
import { verifyPayload } from "../../app/src/lib/crypto.ts";
import { registrationSignedView } from "../../app/src/lib/validation.ts";
import type { Registration } from "../../app/src/lib/types.ts";

test.beforeEach(async ({ page }) => {
  // Start each test from a clean device (no stored identity).
  await page.addInitScript(() => indexedDB.deleteDatabase("bracketchain"));
});

test("the published round is in standings and verifiable by anyone", async ({ page }) => {
  await page.goto("/#/standings");
  await expect(page.getByRole("cell", { name: "alice", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "bob", exact: true })).toBeVisible();
  // alice (110) outranks bob (70).
  await expect(page.locator("tbody tr").first()).toContainText("alice");

  // Build & verify a real inclusion proof against the published root.
  await page.goto("/#/verify");
  await page.getByLabel("Round").selectOption({ label: "Round of 16" });
  await page.getByLabel("Player").selectOption("alice");
  await page.getByRole("button", { name: "Build & verify proof" }).click();
  await expect(page.getByText("proof verifies against the published root")).toBeVisible();

  // A second player + round also verifies.
  await page.getByLabel("Round").selectOption({ label: "Quarter-finals" });
  await page.getByLabel("Player").selectOption("bob");
  await page.getByRole("button", { name: "Build & verify proof" }).click();
  await expect(page.getByText("proof verifies against the published root")).toBeVisible();
});

test("a new player generates an identity and sees a live commitment preview", async ({ page }) => {
  await page.goto("/#/lobby");
  await page.getByLabel("GitHub login").fill("carol");
  await page.getByRole("button", { name: "Generate identity" }).click();
  await expect(page.getByText("Public key")).toBeVisible();
  await expect(page.getByText("signed in as")).toContainText("carol");

  // The open Semi-finals round lets us pick and preview a commitment.
  await page.goto("/#/bracket");
  await page.getByRole("combobox").selectOption({ label: "Semi-finals" });
  await page.locator('input[name="s1"][value="BRA"]').check();
  await page.locator('input[name="s2"][value="ESP"]').check();
  const preview = page.locator(".preview code");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveText(/^[0-9a-f]{64}$/);
});

test("registering produces a validly signed record (GitHub API mocked)", async ({ page }) => {
  let putBody: { content: string; message: string } | null = null;

  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      // Not yet registered.
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return;
    }
    putBody = req.postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ content: { sha: "deadbeef" } }),
    });
  });

  await page.goto("/#/lobby");
  await page.getByLabel("GitHub login").fill("dave");
  await page.getByRole("button", { name: "Generate identity" }).click();
  await page.getByLabel("Personal Access Token").fill("github_pat_dummy");
  await page.getByRole("button", { name: "Save token" }).click();
  await page.getByRole("button", { name: "Register on the ledger" }).click();
  await expect(page.getByText("Registration committed")).toBeVisible();

  // The app must have PUT a registration whose signature verifies.
  expect(putBody).not.toBeNull();
  const json = JSON.parse(Buffer.from(putBody!.content, "base64").toString("utf8")) as Registration;
  expect(json.type).toBe("registration");
  expect(json.login).toBe("dave");
  expect(await verifyPayload(json.publicKey, json.signature, registrationSignedView(json))).toBe(true);
});
