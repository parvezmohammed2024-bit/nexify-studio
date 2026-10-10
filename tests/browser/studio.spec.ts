import { test, expect } from "@playwright/test";
const pages = [
  ["/", "Let’s make something great."],
  ["/image-studio", "From imagination to image."],
  ["/video-studio", "Give your visuals a little life."],
  ["/b-roll-studio", "Build the shots that tell the story."],
  ["/prompt-engineer", "Simple words. Exceptional direction."],
  ["/client-projects", "Great work starts with a good brief."],
  ["/creative-library", "Your creative library"],
  ["/generation-history", "Every idea has a paper trail."],
  ["/budget", "Creative freedom. Financial clarity."],
  ["/settings", "Make the studio work your way."],
];
for (const [path, title] of pages)
  test(`renders ${path} without fabricated records`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Connect Supabase to activate your workspace."),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("generation requires verified setup and explicit cost confirmation", async ({
  page,
}) => {
  await page.goto("/image-studio");
  await expect(
    page.getByRole("button", { name: "Preview generation cost" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview cost to continue" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Describe your vision" })
    .fill("A carefully lit perfume bottle");
  await expect(
    page.getByRole("button", { name: "Preview cost to continue" }),
  ).toBeDisabled();
});
test("B-roll scenes can be edited, reordered and removed without generating", async ({
  page,
}) => {
  await page.goto("/b-roll-studio");
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page.getByRole("textbox", { name: "Scene title" }).fill("Opening shot");
  await page
    .getByRole("textbox", { name: "Scene description" })
    .fill("A close-up of the product");
  await page
    .getByRole("textbox", { name: "Lighting", exact: true })
    .fill("Soft morning light");
  await expect(
    page.getByText("Lighting: Soft morning light.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  await page.getByRole("textbox", { name: "Scene title" }).fill("Second shot");
  await page
    .getByRole("button", { name: "Move scene up", exact: true })
    .nth(1)
    .click();
  await expect(
    page.getByRole("button", { name: "Move scene up", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove scene", exact: true })
    .first()
    .click();
  await expect(page.getByText("1 / 20 scenes")).toBeVisible();
});
test("manual prompt handoff works while AI enhancement is unconfigured", async ({
  page,
}) => {
  await page.goto("/prompt-engineer");
  await page
    .getByRole("textbox", { name: "What would you like to create?" })
    .fill("Keep the blue bottle and use soft lighting.");
  await expect(
    page.getByRole("button", { name: "Enhance my prompt" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Use manual prompt" }).click();
  await expect(page).toHaveURL(/image-studio/);
  await expect(
    page.getByRole("textbox", { name: "Describe your vision" }),
  ).toHaveValue("Keep the blue bottle and use soft lighting.");
});
test("login does not provide public signup", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome to the studio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter your workspace" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Public signup is disabled.", { exact: false }),
  ).toBeVisible();
});
test("sensitive routes fail closed without credentials and reject foreign origins", async ({
  request,
}) => {
  const denied = await request.post("/api/manage", {
    headers: { origin: "https://foreign.example" },
    data: { action: "budget", values: {} },
  });
  expect(denied.status()).toBe(403);
  const unconfigured = await request.post("/api/generations", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: {},
  });
  expect(unconfigured.status()).toBe(400);
  const asset = await request.get(
    "/api/assets/11111111-1111-4111-8111-111111111111",
  );
  expect(asset.status()).toBe(503);
  const cron = await request.get("/api/cron/reconcile");
  expect(cron.status()).toBe(503);
});
test("manual text-video handoff selects the correct video workflow", async ({
  page,
}) => {
  await page.goto("/prompt-engineer");
  await page.getByLabel("Creative mode").selectOption("text-to-video");
  await page
    .getByRole("textbox", { name: "What would you like to create?" })
    .fill("A wide landscape shot with morning light.");
  await page.getByRole("button", { name: "Use manual prompt" }).click();
  await expect(
    page.getByRole("textbox", { name: "Describe the motion" }),
  ).toHaveValue("A wide landscape shot with morning light.");
  await expect(
    page.getByRole("button", { name: "Text to video", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("manual B-roll handoff creates an editable scene", async ({ page }) => {
  await page.goto("/prompt-engineer");
  await page.getByLabel("Creative mode").selectOption("b-roll");
  await page
    .getByRole("textbox", { name: "What would you like to create?" })
    .fill("Close-up of coffee being poured into a cup.");
  await page.getByRole("button", { name: "Use manual prompt" }).click();
  await expect(page).toHaveURL(/b-roll-studio/);
  await expect(
    page.getByRole("textbox", { name: "Scene description" }),
  ).toHaveValue("Close-up of coffee being poured into a cup.");
});
