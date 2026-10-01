import { describe, it, expect, beforeEach } from "vitest";
import { useManagedConfigStore } from "../../store/managedConfigStore";

const payload = { managedConfig: { apiKey: "managed" } };

beforeEach(() => {
  useManagedConfigStore.setState({
    state: "loading",
    payload: null,
    managedInstance: false,
  });
});

describe("managedConfigStore — setUnavailable", () => {
  it("keeps the previous payload when no replacement is provided", () => {
    useManagedConfigStore.getState().setManaged(payload);
    useManagedConfigStore.getState().setUnavailable(null);

    const s = useManagedConfigStore.getState();
    expect(s.payload).toEqual(payload);
    expect(s.state).toBe("managed");
  });

  it("falls back to unavailable when there is no payload to keep", () => {
    useManagedConfigStore.getState().setUnavailable(null);

    const s = useManagedConfigStore.getState();
    expect(s.payload).toBeNull();
    expect(s.state).toBe("unavailable");
  });

  it("uses the provided cached payload", () => {
    useManagedConfigStore.getState().setUnavailable(payload);

    const s = useManagedConfigStore.getState();
    expect(s.payload).toEqual(payload);
    expect(s.state).toBe("managed");
  });

  it("tracks managedInstance separately from the payload", () => {
    useManagedConfigStore.getState().setManagedInstance(true);
    useManagedConfigStore.getState().setUnavailable(null);

    const s = useManagedConfigStore.getState();
    expect(s.managedInstance).toBe(true);
    expect(s.payload).toBeNull();
  });
});
