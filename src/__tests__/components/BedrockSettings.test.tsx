import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../../components/settings/SettingsPanel";
import { useSettingsStore } from "../../store/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: {
      providerId: "openaicompat",
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 4096,
      enableCache: true,
      recacheThreshold: 8000,
      useLegacyChatCompletions: false,
      reasoningEffort: "",
      proxyRequests: false,
      anthropicCacheTtl: "5m",
      humanInTheLoop: false,
      suggestionMode: false,
      maxIterations: 100,
      customInstructions: "",
      openRouterRegion: "global",
      bedrockRegion: "us-east-1",
      ocrLanguage: "eng",
    },
  });
});

async function selectBedrock() {
  const user = userEvent.setup();
  render(<SettingsPanel />);
  const preset = screen.getByRole("combobox") as HTMLSelectElement;
  await user.selectOptions(preset, "bedrock");
  return user;
}

describe("SettingsPanel — Amazon Bedrock", () => {
  it("hides the endpoint URL, shows a region input and the Bedrock key placeholder", async () => {
    await selectBedrock();
    expect(screen.queryByText("Endpoint URL")).toBeNull();
    expect(screen.getByText("Region")).toBeDefined();
    expect(screen.getByPlaceholderText("eu-north-1")).toBeDefined();
    expect(screen.getByPlaceholderText("ABSK...")).toBeDefined();
  });

  it("defaults the region to us-east-1 and persists a typed change on Apply", async () => {
    const user = await selectBedrock();
    const region = screen.getByPlaceholderText("eu-north-1") as HTMLInputElement;
    expect(region.value).toBe("us-east-1");

    await user.clear(region);
    await user.type(region, "eu-north-1");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.bedrockRegion).toBe("eu-north-1");
    expect(useSettingsStore.getState().config.providerId).toBe("bedrock");
    expect(useSettingsStore.getState().config.model).toBe("nvidia.nemotron-super-3-120b");
  });

  it("warns about an invalid region id", async () => {
    const user = await selectBedrock();
    const region = screen.getByPlaceholderText("eu-north-1");
    await user.clear(region);
    await user.type(region, "nonsense");
    expect(screen.getByText(/Expected an AWS region id/)).toBeDefined();
  });

  it("does not warn for a valid region id", async () => {
    const user = await selectBedrock();
    const region = screen.getByPlaceholderText("eu-north-1");
    await user.clear(region);
    await user.type(region, "us-gov-west-1");
    expect(screen.queryByText(/Expected an AWS region id/)).toBeNull();
  });

  it("resets the proxy toggle when switching preset", async () => {
    useSettingsStore.getState().setProxyRequests(true);
    const user = await selectBedrock();
    await user.click(screen.getByText("Apply"));
    expect(useSettingsStore.getState().config.proxyRequests).toBe(false);
  });
});
