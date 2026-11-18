import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Input } from "../components/common/Field";

describe("Field", () => {
  it("associates label, hint, and error with the control", () => {
    const { rerender } = render(
      <Field label="Email" hint="Use your account email">
        {({ id, ...props }) => <Input id={id} {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    const hint = screen.getByText("Use your account email");
    expect(input).toHaveAttribute("aria-describedby", hint.id);

    rerender(
      <Field label="Email" hint="Use your account email" error="Email is required.">
        {({ id, ...props }) => <Input id={id} {...props} />}
      </Field>,
    );
    const errored = screen.getByLabelText("Email");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Email is required.");
    expect(errored).toHaveAttribute("aria-invalid", "true");
    expect(errored.getAttribute("aria-describedby")).toContain(alert.id);
  });
});