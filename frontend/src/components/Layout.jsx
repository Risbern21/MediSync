import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import GradientBg from './GradientBg';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <GradientBg />
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main-area">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <div className="page-scroll">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}
