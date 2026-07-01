import { Outlet, NavLink } from 'react-router-dom'
import { Phone, LayoutDashboard, Users, FileText } from 'lucide-react'

const NAV = [
  { to: '/',      end: true,  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', end: false, icon: Users,            label: 'Leads' },
  { to: '/forms', end: false, icon: FileText,         label: 'Forms' },
]

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center">
              <Phone size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Outbound</p>
              <p className="text-xs text-gray-400 mt-0.5">AI Caller</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700 text-xs text-gray-500">
          ElevenLabs + MongoDB
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
