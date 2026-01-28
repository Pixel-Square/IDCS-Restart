import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { getMe } from "./services/auth";
import Navbar from "./components/Navbar";
import HomePage from "./components/HomePage";
import DashboardPage from "./pages/Dashboard";
import OBEPage from "./pages/OBEPage";

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[] | RoleObj[];
  permissions?: string[];
};

export default function App() {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((r) => {
        // Normalize roles to string array
        const normalizedUser = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) =>
                typeof role === "string" ? role : role.name,
              )
            : [],
        };
        setUser(normalizedUser);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <Navbar user={user} />
      <Routes>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/obe" element={<OBEPage />} />
        <Route path="*" element={<HomePage user={user} />} />
      </Routes>
    </div>
  );
}
