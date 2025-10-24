// src/components/Auth/ProtectedRoute.js
import React from 'react';
import { useAuth } from './AuthProvider';
import { Navigate, useLocation } from 'react-router-dom';

/*
  Ahora soporta:
  <ProtectedRoute allowedRole={3}> ...</ProtectedRoute>
  o
  <ProtectedRoute allowedRoles={[2,3]}> ...</ProtectedRoute>
*/
const ProtectedRoute = ({ children, allowedRole, allowedRoles }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/staffhub" state={{ from: location }} replace />;

  // Normalizamos lista de roles permitidos
  const rolesAllowed = allowedRoles ? allowedRoles : (allowedRole!=null ? [allowedRole] : []);
  if (rolesAllowed.length && !rolesAllowed.includes(role)) {
    return <Navigate to="/staffhub" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;