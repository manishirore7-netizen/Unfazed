import { Routes, Route, Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import DashboardHome from "../pages/DashboardHome";
import ProfileEditorPage from "../pages/therapist/ProfileEditorPage";
import ScheduleManagerPage from "../pages/therapist/ScheduleManagerPage";
import ClientsPage from "../pages/therapist/ClientsPage";
import ClientDetailPage from "../pages/therapist/ClientDetailPage";
import PublicProfilePage from "../pages/therapist/PublicProfilePage";

// Helper component that redirects authenticated therapists away from public auth pages
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Protected Therapist Home */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardHome />
          </ProtectedRoute>
        }
      />

      {/* Protected Therapist Profile Editor */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfileEditorPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Therapist Schedule Manager */}
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <ScheduleManagerPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Therapist Clients CRM */}
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <ClientsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <ClientDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Public Authentication Pages */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Public Branded Therapist Profile */}
      <Route path="/:slug" element={<PublicProfilePage />} />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
