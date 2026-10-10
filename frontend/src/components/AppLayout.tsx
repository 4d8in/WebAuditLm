import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/settings/verification', label: 'Domain Verification' },
  { to: '/dashboard', label: 'Scans' },
];

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">WebAuditLm</h1>
      </header>
      <div className="flex">
        <nav className="w-56 border-r border-slate-800 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
