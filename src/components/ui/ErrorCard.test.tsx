import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorCard } from "./ErrorCard";

describe("<ErrorCard />", () => {
  it("renders title and message and matches snapshot", () => {
    const { container } = render(
      <ErrorCard title="Boom" message="Something exploded." />,
    );
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText("Something exploded.")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("invokes onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(<ErrorCard message="Try again." onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the retry button when no onRetry prop is provided", () => {
    render(<ErrorCard message="Read-only error." />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});