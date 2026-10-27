import { createContext, useContext } from 'react';
import { Navigate } from 'react-router-dom';

const OtrAccessContext = createContext({ ready: false, unlocked: [] });

export function OtrAccessProvider({ ready, unlocked, children }) {
  return (
    <OtrAccessContext.Provider value={{ ready, unlocked }}>
      {children}
    </OtrAccessContext.Provider>
  );
}

const ROUTE_STAGE = {
  '/design': 'DESIGN',
  '/drawings': 'DESIGN',
  '/procurement': 'PROCUREMENT',
  '/vendors': 'PROCUREMENT',
  '/purchase-orders': 'PROCUREMENT',
  '/planning': 'PRODUCTION',
  '/production': 'PRODUCTION',
  '/quality': 'QUALITY',
  '/rework': 'QUALITY',
  '/stores': 'DISPATCH',
  '/grn': 'DISPATCH',
  '/stock': 'DISPATCH',
  '/dispatch': 'DISPATCH',
  '/installation': 'INSTALLATION',
  '/site-readiness': 'INSTALLATION',
  '/punch-points': 'INSTALLATION',
  '/handover': 'INSTALLATION',
};

export function stageForPath(pathname) {
  const path = pathname.split('?')[0];
  if (ROUTE_STAGE[path]) return ROUTE_STAGE[path];
  const match = Object.keys(ROUTE_STAGE).find((key) => path === key || path.startsWith(`${key}/`));
  return match ? ROUTE_STAGE[match] : null;
}

export default function OtrGate({ stage, children }) {
  const { ready, unlocked } = useContext(OtrAccessContext);
  if (!ready) return null;
  if (!unlocked.includes(stage)) return <Navigate to="/otr" replace />;
  return children;
}
