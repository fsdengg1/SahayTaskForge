import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './context/AuthContext';
import { isManagement } from './utils/roles';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import LeadList from './pages/leads/LeadList';
import LeadDashboard from './pages/leads/LeadDashboard';
import SalesEnquiryDashboard from './pages/leads/SalesEnquiryDashboard';
import OrderConversionPage from './pages/orders/OrderConversionPage';
import OtrGate from './components/OtrGate';
import OtrDashboard from './pages/orders/OtrDashboard';
import OtrProductionPage from './pages/orders/OtrProductionPage';
import OtrManufacturingPage from './pages/orders/OtrManufacturingPage';
import OtrInstallationPage from './pages/orders/OtrInstallationPage';
import LeadForm from './pages/leads/LeadForm';
import LeadDetail from './pages/leads/LeadDetail';
import ProjectList from './pages/projects/ProjectList';
import ProjectDetail from './pages/projects/ProjectDetail';
import TaskList from './pages/TaskList';
import DesignBoard from './pages/design/DesignBoard';
import DesignActivityLog from './pages/design/DesignActivityLog';
import DesignFilesPage from './pages/design/DesignFilesPage';
import PreSalesDesign from './pages/design/PreSalesDesign';
import OtrProcurementPage from './pages/orders/OtrProcurementPage';
import OtrVendorPage from './pages/orders/OtrVendorPage';
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
import CustomerFeedbackPage from './pages/leads/CustomerFeedbackPage';
import CustomerFeedbackDetail from './pages/leads/CustomerFeedbackDetail';
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
        <Route path="lead-dashboard" element={<LeadDashboard />} />
        <Route path="sales-enquiry-dashboard" element={<SalesEnquiryDashboard />} />
        <Route path="order-conversion" element={<OrderConversionPage />} />
        <Route path="otr" element={<OtrDashboard />} />
        <Route path="otr/design" element={<DesignBoard />} />
        <Route path="otr/design-activity-log" element={<DesignActivityLog />} />
        <Route path="otr/design/drawings" element={<DesignFilesPage kind="DRAWING" />} />
        <Route path="otr/design/layout" element={<DesignFilesPage kind="LAYOUT" />} />
        <Route path="otr/design/bom" element={<DesignFilesPage kind="BOM" />} />
        <Route path="otr/procurement" element={<OtrProcurementPage />} />
        <Route path="otr/vendor-management" element={<OtrVendorPage />} />
        <Route path="otr/production" element={<OtrProductionPage />} />
        <Route path="otr/manufacturing-lead-time" element={<OtrManufacturingPage />} />
        <Route path="otr/installation" element={<OtrInstallationPage />} />
        <Route path="leads/new" element={<LeadForm />} />
        <Route path="leads/:id/edit" element={<LeadForm />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="tasks" element={<TaskList />} />
        <Route path="design" element={<Navigate to="/otr/design" replace />} />
        <Route path="design/presales" element={<PreSalesDesign />} />
        <Route path="design/drawings" element={<Navigate to="/otr/design/drawings" replace />} />
        <Route path="design/layout" element={<Navigate to="/otr/design/layout" replace />} />
        <Route path="design/bom" element={<Navigate to="/otr/design/bom" replace />} />
        <Route path="procurement" element={<Navigate to="/otr/procurement" replace />} />
        <Route path="production" element={<Navigate to="/otr/production" replace />} />
        <Route path="quality" element={<Navigate to="/otr/production" replace />} />
        <Route path="dispatch" element={<Navigate to="/otr/production" replace />} />
        <Route path="installation" element={<Navigate to="/otr/installation" replace />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="vendors" element={<OtrGate stage="PROCUREMENT"><VendorList /></OtrGate>} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="health" element={<ProjectHealthPage />} />
        <Route path="quotations" element={<DocumentsPage title="Quotations" categories={['QUOTATION']} subtitle="Quotation files stored against leads and projects." />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="customer-feedback" element={<CustomerFeedbackPage />} />
        <Route path="customer-feedback/:id" element={<CustomerFeedbackDetail />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="drawings" element={<Navigate to="/otr/design/drawings" replace />} />
        <Route path="purchase-orders" element={<OtrGate stage="PROCUREMENT"><ProcurementPage focus="po" /></OtrGate>} />
        <Route path="planning" element={<OtrGate stage="PRODUCTION"><ProductionPage mode="planning" /></OtrGate>} />
        <Route path="rework" element={<OtrGate stage="QUALITY"><QualityPage focus="rework" /></OtrGate>} />
        <Route path="stores" element={<OtrGate stage="DISPATCH"><ProcurementPage focus="grn" title="Stores" /></OtrGate>} />
        <Route path="grn" element={<OtrGate stage="DISPATCH"><ProcurementPage focus="grn" /></OtrGate>} />
        <Route path="stock" element={<OtrGate stage="DISPATCH"><ProcurementPage focus="grn" title="Stock" /></OtrGate>} />
        <Route path="site-readiness" element={<OtrGate stage="INSTALLATION"><InstallationPage focus="readiness" /></OtrGate>} />
        <Route path="punch-points" element={<OtrGate stage="INSTALLATION"><InstallationPage focus="punch" /></OtrGate>} />
        <Route path="punch-points/:id" element={<OtrGate stage="INSTALLATION"><PunchPointDetail /></OtrGate>} />
        <Route path="handover" element={<OtrGate stage="INSTALLATION"><InstallationPage focus="handover" /></OtrGate>} />
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
