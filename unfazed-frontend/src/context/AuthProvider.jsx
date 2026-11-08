import { useState, useEffect } from "react";
import AuthContext from "./AuthContext";
import axiosInstance from "../api/axiosInstance";

export default function AuthProvider({ children }) {
  const [therapist, setTherapist] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("unfazed_token"));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("unfazed_token")));

  useEffect(() => {
    let isMounted = true;
    const storedToken = localStorage.getItem("unfazed_token");
    if (!storedToken) {
      return;
    }

    axiosInstance
      .get("/therapist/me")
      .then((response) => {
        if (isMounted && response.data?.data) {
          setTherapist(response.data.data);
        }
      })
      .catch(() => {
        if (isMounted) {
          localStorage.removeItem("unfazed_token");
          setToken(null);
          setTherapist(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Login therapist
  const login = async (email, password) => {
    try {
      const response = await axiosInstance.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });

      const { token: receivedToken, data } = response.data;
      if (!receivedToken) {
        throw new Error("Token not received from server.");
      }

      localStorage.setItem("unfazed_token", receivedToken);
      setToken(receivedToken);
      setTherapist(data);

      return { success: true, therapist: data };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please verify your credentials.";
      return { success: false, message };
    }
  };

  // Register therapist
  const register = async (name, email, password) => {
    try {
      const response = await axiosInstance.post("/auth/register", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      // Automatically log in upon successful registration for a smooth experience
      if (response.data && response.data.success) {
        return await login(email, password);
      }

      return { success: true, therapist: response.data.data };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Registration failed. Please try again.";
      return { success: false, message };
    }
  };

  // Logout therapist
  const logout = () => {
    localStorage.removeItem("unfazed_token");
    setToken(null);
    setTherapist(null);
  };

  const value = {
    therapist,
    token,
    isAuthenticated: Boolean(token && therapist),
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
