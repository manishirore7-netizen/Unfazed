import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import AuthLayout from "../../components/common/AuthLayout";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (serverError) {
      setServerError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError("");

    const result = await login(formData.email, formData.password);
    setIsSubmitting(false);

    if (result.success) {
      navigate("/", { replace: true });
    } else {
      setServerError(result.message || "Invalid credentials. Please try again.");
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to access your practice notes, clients, and appointments."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4.5" noValidate>
        {serverError && (
          <Alert
            type="error"
            message={serverError}
            onClose={() => setServerError("")}
          />
        )}

        <Input
          id="email"
          name="email"
          type="email"
          label="Email address"
          placeholder="dr.jane@example.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          autoComplete="email"
          required
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          autoComplete="current-password"
          required
        />

        <div className="pt-2">
          <Button type="submit" isLoading={isSubmitting}>
            Sign in to practice
          </Button>
        </div>

        <div className="pt-4 border-t border-[#EFE8DF] text-center">
          <p className="text-xs text-[#5C6A62]">
            New to Unfazed?{" "}
            <Link
              to="/register"
              className="font-medium text-[#1B3B2B] hover:underline underline-offset-4"
            >
              Create your therapist practice
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}
