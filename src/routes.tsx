import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import UserForm from "./pages/UserForm";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import Profile from "./pages/Profile";
import Forbidden from "./pages/Forbidden";
import Areas from "./pages/Areas";
import ServiceChannels from "./pages/ServiceChannels";
import NewAttention from "./pages/NewAttention";
import Attentions from "./pages/Attentions";
import AttentionDetail from "./pages/AttentionDetail";
import EditAttention from "./pages/EditAttention";
import Workstations from "./pages/Workstations";
import ReferralInbox from "./pages/ReferralInbox";
import Tablet from "./pages/Tablet";
import PublicSurvey from "./pages/PublicSurvey";

export const router = createBrowserRouter([
  {
    path: "/tablet",
    element: <Tablet />,
  },
  {
    path: "/survey/:token",
    element: <PublicSurvey />,
  },
  {
    path: "/",
    element: <App />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "dashboard",
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <AdminRoute>
            <Users />
          </AdminRoute>
        ),
      },
      {
        path: "users/new",
        element: (
          <AdminRoute>
            <UserForm />
          </AdminRoute>
        ),
      },
      {
        path: "users/:id",
        element: (
          <AdminRoute>
            <UserForm />
          </AdminRoute>
        ),
      },
      {
        path: "areas",
        element: (
          <AdminRoute>
            <Areas />
          </AdminRoute>
        ),
      },
      {
        path: "service-channels",
        element: (
          <AdminRoute>
            <ServiceChannels />
          </AdminRoute>
        ),
      },
      {
        path: "attentions",
        element: (
          <ProtectedRoute>
            <Attentions />
          </ProtectedRoute>
        ),
      },
      {
        path: "attentions/new",
        element: (
          <ProtectedRoute>
            <NewAttention />
          </ProtectedRoute>
        ),
      },
      {
        path: "attentions/:id",
        element: (
          <ProtectedRoute>
            <AttentionDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: "attentions/:id/edit",
        element: (
          <AdminRoute>
            <EditAttention />
          </AdminRoute>
        ),
      },
      {
        path: "referrals",
        element: (
          <ProtectedRoute>
            <ReferralInbox />
          </ProtectedRoute>
        ),
      },
      {
        path: "workstations",
        element: (
          <AdminRoute>
            <Workstations />
          </AdminRoute>
        ),
      },
      {
        path: "profile",
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      {
        path: "forbidden",
        element: <Forbidden />,
      },
    ],
  },
]);
