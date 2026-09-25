"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { login } from "./actions";

export function LoginForm({ next, error }: { next: string; error: boolean }) {
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="mt-6 space-y-3"
      action={async (formData) => {
        setPending(true);
        await login(formData);
        setPending(false);
      }}
    >
      <input type="hidden" name="next" value={next} />
      <Input name="passphrase" type="password" autoFocus autoComplete="current-password" placeholder="Passphrase" aria-label="Passphrase" required />
      {error && <p className="text-xs text-negative">That passphrase didn't match.</p>}
      <Button type="submit" variant="primary" className="w-full" loading={pending}>
        Unlock
      </Button>
    </form>
  );
}
