import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { getMe } from "./services/auth";
import Navbar from "./components/Navbar";
import HomePage from "./components/HomePage";
import DashboardPage from "./pages/Dashboard";
import OBEPage from "./pages/OBEPage";
import OBEMasterPage from "./pages/OBEMasterPage";
import CourseOBEPage from "./pages/CourseOBEPage";

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

  const userPerms = Array.isArray(user?.permissions) ? user?.permissions : [];
  const lowerPerms = userPerms.map((p) => String(p || '').toLowerCase());
  const canObe = lowerPerms.some((p) => ['obe.view', 'obe.cdap.upload', 'obe.master.manage'].includes(p));
  const canObeMaster = lowerPerms.includes('obe.master.manage');

  return (
    <div>
      <Navbar user={user} />
      <Routes>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/obe" element={canObe ? <OBEPage /> : <HomePage user={user} />} />
        <Route path="/obe/course/:code" element={<CourseOBEPage />} />
        <Route path="/obe/master" element={canObeMaster ? <OBEMasterPage /> : <HomePage user={user} />} />
        <Route path="*" element={<HomePage user={user} />} />
      </Routes>
    </div>
  );
}
