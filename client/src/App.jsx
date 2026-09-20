import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './context/AuthContext';
import { isManagement } from './utils/roles';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import LeadList from './pages/leads/LeadList';
import LeadForm from './pages/leads/LeadForm';
import LeadDetail from './pages/leads/LeadDetail';
import ProjectList from './pages/projects/ProjectList';
import ProjectDetail from './pages/projects/ProjectDetail';
import TaskList from './pages/TaskList';
import DesignPage from './pages/DesignPage';
import ProcurementPage from './pages/ProcurementPage';
import ProductionPage from './pages/ProductionPage';
import QualityPage from './pages/QualityPage';
import InstallationPage from './pages/InstallationPage';
import DocumentsPage from './pages/DocumentsPage';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';
import VendorList from './pages/VendorList';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import TimelinePage from './pages/TimelinePage';
import ActivityPage from './pages/ActivityPage';
import DepartmentsPage from './pages/DepartmentsPage';
import ProjectHealthPage from './pages/ProjectHealthPage';
import FollowUpsPage from './pages/FollowUpsPage';
import IssuesPage from './pages/IssuesPage';
import IssueDetail from './pages/IssueDetail';
import PunchPointDetail from './pages/PunchPointDetail';
import ApprovalsPage from './pages/ApprovalsPage';
import FinancePage from './pages/FinancePage';

function Guard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function Guest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (isManagement(user)) return <Navigate to="/dashboard" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Guest><Login /></Guest>} />
      <Route path="/change-password" element={<Guard><ChangePassword /></Guard>} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="leads" element={<LeadList />} />
        <Route path="leads/new" element={<LeadForm />} />
        <Route path="leads/:id/edit" element={<LeadForm />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="tasks" element={<TaskList />} />
        <Route path="design" element={<DesignPage />} />
        <Route path="procurement" element={<ProcurementPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="installation" element={<InstallationPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="vendors" element={<VendorList />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="health" element={<ProjectHealthPage />} />
        <Route path="quotations" element={<DocumentsPage title="Quotations" categories={['QUOTATION']} subtitle="Quotation files stored against leads and projects." />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="drawings" element={<DocumentsPage title="Drawings & BOQ" categories={['LAYOUT', 'BOQ', 'GA_DRAWING', 'MFG_DRAWING', 'INSTALL_DRAWING']} subtitle="Engineering drawings and BOQ from the central document library." />} />
        <Route path="purchase-orders" element={<ProcurementPage focus="po" />} />
        <Route path="planning" element={<ProductionPage mode="planning" />} />
        <Route path="rework" element={<QualityPage focus="rework" />} />
        <Route path="stores" element={<ProcurementPage focus="grn" title="Stores" />} />
        <Route path="grn" element={<ProcurementPage focus="grn" />} />
        <Route path="stock" element={<ProcurementPage focus="grn" title="Stock" />} />
        <Route path="dispatch" element={<DocumentsPage title="Dispatch" categories={['DISPATCH']} subtitle="Dispatch documents linked to the project." />} />
        <Route path="site-readiness" element={<InstallationPage focus="readiness" />} />
        <Route path="punch-points" element={<InstallationPage focus="punch" />} />
        <Route path="punch-points/:id" element={<PunchPointDetail />} />
        <Route path="handover" element={<InstallationPage focus="handover" />} />
        <Route path="finance" element={<FinancePage mode="finance" />} />
        <Route path="invoices" element={<FinancePage mode="invoices" />} />
        <Route path="payments" element={<FinancePage mode="payments" />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
