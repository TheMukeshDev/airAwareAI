import {
  LayoutDashboard,
  Wind,
  Bike,
  CalendarCheck,
  Home,
  Leaf,
  Sparkles,
  Users,
  Settings,
} from "lucide-react";

export const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/air-quality", label: "Air Quality", icon: Wind },
      { to: "/lifestyle", label: "Lifestyle Analyzer", icon: Bike },
      { to: "/daily-plan", label: "Daily Action Plan", icon: CalendarCheck },
    ],
  },
  {
    label: "Personal wellness",
    items: [
      { to: "/indoor-air", label: "Indoor Air Coach", icon: Home },
      { to: "/my-impact", label: "My Impact", icon: Leaf },
      { to: "/assistant", label: "Ask AirAware", icon: Sparkles },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/community", label: "Community Hub", icon: Users },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const bottomNavItems = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/air-quality", label: "Air", icon: Wind },
  { to: "/daily-plan", label: "Plan", icon: CalendarCheck },
  { to: "/my-impact", label: "Impact", icon: Leaf },
  { to: "/assistant", label: "Ask", icon: Sparkles },
];
