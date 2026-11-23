import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Button } from "../components/common/Button";
import { LabeledInput } from "../components/common/Field";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../services/api";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));


  const submit = async (event) => {
    event?.preventDefault();
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = "Email is required.";
    if (!form.password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.email) emailRef.current?.focus();
      else if (nextErrors.password) passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const user = await login({ email: form.email.trim(), password: form.password });
      toast.success(`Welcome back, ${user?.name?.split(" ")[0] || "friend"}`);
      const redirect = location.state?.from;
      navigate(redirect || (user?.onboarding_complete === false ? "/onboarding" : "/dashboard"), { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Could not sign in. Check your email and password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up today's plan and your latest readings."
      footer={
        <>
          New to AirAware AI?{" "}
          <Link to="/register" className="font-medium text-aurora-300 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
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
        <div className="relative">
          <LabeledInput
            ref={passwordRef}
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
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
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>

        <p className="text-[12px] text-slate-300">
          Protected pages require a signed-in session.
        </p>

        <Button type="submit" className="w-full" loading={submitting} size="lg">
          {!submitting ? <LogIn size={16} aria-hidden="true" /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default Login;
