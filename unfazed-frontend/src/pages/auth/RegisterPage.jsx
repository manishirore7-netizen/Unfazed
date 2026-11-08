import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import AuthLayout from "../../components/common/AuthLayout";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (formData.name.trim().length > 100) {
      newErrors.name = "Name cannot exceed 100 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters long";
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

    const result = await register(
      formData.name,
      formData.email,
      formData.password
    );
    setIsSubmitting(false);

    if (result.success) {
      navigate("/", { replace: true });
    } else {
      setServerError(
        result.message || "Registration failed. Please check your details."
      );
    }
  };

  return (
    <AuthLayout
      title="Create your practice"
      subtitle="Join Unfazed to organize your clinical practice with peace of mind."
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
          id="name"
          name="name"
          type="text"
          label="Full Name"
          placeholder="Dr. Eleanor Vance, PsyD"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          helperText="Your professional clinical name (max 100 characters)"
          autoComplete="name"
          maxLength={100}
          required
        />

        <Input
          id="email"
          name="email"
          type="email"
          label="Email address"
          placeholder="dr.vance@example.com"
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
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          helperText="Must be at least 8 characters"
          autoComplete="new-password"
          required
        />

        <div className="pt-2">
          <Button type="submit" isLoading={isSubmitting}>
            Create practice account
          </Button>
        </div>

        <div className="pt-4 border-t border-[#EFE8DF] text-center">
          <p className="text-xs text-[#5C6A62]">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-[#1B3B2B] hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}
