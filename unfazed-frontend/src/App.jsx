import { useState, useEffect } from "react";
import axiosInstance from "./api/axiosInstance";

function App() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await axiosInstance.get("/health");
        // Backend returns: { success: true, message: "Unfazed API is running!" }
        setMessage(response.data.message);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to connect to the backend server."
        );
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Unfazed Integration Test</h1>
        <p style={styles.subtitle}>Frontend to Backend Health Check</p>
      </header>

      <main style={styles.card}>
        {loading && <p style={styles.loading}>Connecting to backend...</p>}

        {!loading && error && (
          <div style={styles.errorBox}>
            <p style={styles.errorTitle}>Error connecting to server</p>
            <p style={styles.errorMessage}>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div style={styles.successBox}>
            <p style={styles.statusLabel}>Server Status</p>
            <h2 style={styles.statusMessage}>{message}</h2>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    marginBottom: "24px",
    textAlign: "center",
  },
  title: {
    fontSize: "2rem",
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "1rem",
    color: "#64748b",
  },
  card: {
    width: "100%",
    maxWidth: "480px",
    padding: "28px",
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e2e8f0",
    textAlign: "center",
  },
  loading: {
    fontSize: "1rem",
    color: "#64748b",
  },
  successBox: {
    color: "#166534",
  },
  statusLabel: {
    fontSize: "0.875rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  },
  statusMessage: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#15803d",
    margin: "0",
  },
  errorBox: {
    color: "#991b1b",
  },
  errorTitle: {
    fontSize: "1.125rem",
    fontWeight: "600",
    marginBottom: "6px",
  },
  errorMessage: {
    fontSize: "0.95rem",
    color: "#b91c1c",
  },
};

export default App;
