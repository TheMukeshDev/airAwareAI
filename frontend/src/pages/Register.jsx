import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Button } from "../components/common/Button";
import { LabeledInput } from "../components/common/Field";
import { Toggle } from "../components/common/Toggle";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../services/api";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);


  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));


  const submit = async (event) => {
    event?.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Please tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (form.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (form.password !== form.confirm) nextErrors.confirm = "Passwords do not match.";
    if (!consent) nextErrors.consent = "Please accept the privacy notice to continue.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const fieldRefs = { name: nameRef, email: emailRef, password: passwordRef, confirm: confirmRef };
      const firstKey = ["name", "email", "password", "confirm"].find((k) => nextErrors[k]);
      if (firstKey) fieldRefs[firstKey].current?.focus();

      return;
    }

    setSubmitting(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, consent: true });
      toast.success("Account created. Let's set up your environment.");
      navigate("/onboarding", { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Could not create your account."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Three minutes of setup, then a daily plan built around your actual routine."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-aurora-300 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <LabeledInput
          ref={nameRef}

          label="Full name"
          autoComplete="name"
          placeholder="Your name"
          value={form.name}
          onChange={update("name")}
          error={errors.name}
          required
        />
        <LabeledInput
          ref={emailRef}

          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <LabeledInput
              ref={passwordRef}

              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={update("password")}
              error={errors.password}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-[30px] rounded-md p-1.5 text-slate-400 hover:text-slate-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
          <LabeledInput
            ref={confirmRef}

            label="Confirm password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repeat password"
            value={form.confirm}
            onChange={update("confirm")}
            error={errors.confirm}
            required
          />
        </div>

        <div className="rounded-xl border border-hairline bg-ink-900/50 p-3.5">
          <Toggle
            id="consent"
            checked={consent}
            onChange={setConsent}
            label="I consent to environmental data processing"
            description="Your location and habits personalise guidance. Community analytics only ever show aggregated values."
          />
          {errors.consent ? <p className="mt-2 text-[12px] text-verypoor" role="alert">{errors.consent}</p> : null}
        </div>

        <Button type="submit" className="w-full" loading={submitting} size="lg">
          {!submitting ? <UserPlus size={16} aria-hidden="true" /> : null}
          Create account
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          We never sell personal data and never publish an individual&apos;s location or lifestyle profile.
        </p>
      </form>
    </AuthLayout>
  );
}

export default Register;
