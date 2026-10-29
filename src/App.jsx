import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation, useNavigationType } from "react-router";
import { WaitlistPage } from "./pages/LandingPage.jsx";

const BetaApp = lazy(() => import("./pages/beta/BetaApp.jsx").then((module) => ({ default: module.BetaApp })));

export default function App() {
  return (
    <>
      <ScrollToTopOnPush />
      <Routes>
        <Route caseSensitive path="/beta/*" element={<BetaRoute />} />
        <Route path="*" element={<WaitlistPage />} />
      </Routes>
    </>
  );
}

function BetaRoute() {
  const location = useLocation();
  const mountKey = location.state?.betaMountKey || location.key;
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <BetaApp key={mountKey} mountKey={mountKey} />
    </Suspense>
  );
}

function ScrollToTopOnPush() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === "PUSH") window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}
