import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: automatically attach JWT Bearer token if present
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("unfazed_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 errors gracefully
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // If request fails with 401 Unauthorized (and wasn't the login attempt itself),
    // clear token from localStorage
    if (
      error.response &&
      error.response.status === 401 &&
      error.config &&
      !error.config.url.includes("/auth/login")
    ) {
      localStorage.removeItem("unfazed_token");
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
