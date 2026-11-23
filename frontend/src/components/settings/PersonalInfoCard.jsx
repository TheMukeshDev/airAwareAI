import { User } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Field, Input } from "../common/Field";

export function PersonalInfoCard({ form, email, onChange }) {
  return (
    <Card>
      <CardHeader action={<User size={15} className="text-aurora-300" aria-hidden="true" />}>
        <CardTitle as="h2">Personal information</CardTitle>
        <CardDescription>Shown in the app and on leaderboards when you opt in.</CardDescription>
      </CardHeader>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required>
          {({ id, ...props }) => (
            <Input id={id} value={form.name} onChange={(event) => onChange("name", event.target.value)} {...props} />
          )}
        </Field>
        <Field label="Email" hint="Contact support to change your email.">
          {({ id, ...props }) => <Input id={id} value={email ?? ""} disabled {...props} />}
        </Field>
      </div>
    </Card>
  );
}

export default PersonalInfoCard;
