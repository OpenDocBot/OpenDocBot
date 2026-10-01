import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInGate } from "../../components/auth/SignInGate";

const signIn = vi.fn(async () => ({ sid: "sid-1", user: { sub: "u1" } }));
const refreshManagedConfig = vi.fn(async () => {});

vi.mock("../../lib/auth", () => ({ signIn: () => signIn() }));
vi.mock("../../lib/managedConfigBootstrap", () => ({
  refreshManagedConfig: () => refreshManagedConfig(),
}));

beforeEach(() => {
  signIn.mockClear();
  refreshManagedConfig.mockClear();
});

describe("SignInGate", () => {
  it("renders the gate and signs in on click", async () => {
    const user = userEvent.setup();
    render(<SignInGate />);

    expect(screen.getByText(/Sign in required/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refreshManagedConfig).toHaveBeenCalledTimes(1));
  });

  it("shows an error toast when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new Error("dialog blocked"));
    const user = userEvent.setup();
    render(<SignInGate />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(refreshManagedConfig).not.toHaveBeenCalled();
  });
});
